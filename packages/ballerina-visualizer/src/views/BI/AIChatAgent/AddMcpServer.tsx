/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import { AgentManagerMcpBinding, FlowNode, LineRange, McpToolsResponse, NodePosition, ProductMode, ToolData } from "@wso2/ballerina-core";
import type { FormHandle } from "@wso2/ballerina-side-panel";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { cloneDeep, debounce } from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormLoadingState } from "@wso2/ballerina-side-panel";
import { AgentManagerMcpGate, applyMcpBinding } from "../../../components/AgentManagerModels/McpProxies";
import { useProductMode } from "../../../hooks/useProductMode";
import FlowNodeForm from "../Forms/FlowNodeForm";
import { McpToolsSelection, ToolScopes } from "./Mcp/McpToolsSelection";
import { DiscoverToolsModal } from "./Mcp/DiscoverToolsModal";
import { RequiresAuthCheckbox } from "./Mcp/RequiresAuthCheckbox";
import { attemptValueResolution, createMockTools, extractOriginalValues, generateToolKitName } from "./Mcp/utils";
import { mcpServerVariableName } from "./Mcp/serverName";
import { readHttpConfigAuth, writeHttpConfigAuth } from "./Mcp/httpConfigAuth";
import { cleanServerUrl } from "./formUtils";
import { Container } from "./styles";
import { extractAccessToken, getEndOfFileLineRange, refreshAgentNodeLineRange, removeQuotes, resolveAgentNodePosition, resolveVariableValue, resolveAuthConfig, checkAiPackageVersionSupport, serializeAgentToolsEdit, withCurrentAgentTools } from "./utils";

interface Tool {
    name: string;
    description?: string;
}

interface AddMcpServerProps {
    editMode?: boolean;
    name?: string;
    agentNode: FlowNode;
    existingNode?: FlowNode;
    agentDefinition?: {
        filePath: string;
        classLineRange: LineRange;
        reservedNames?: string[];
    };
    onSave?: (agentPosition?: NodePosition) => void;
    // Takes over adding a new server to `agentNode`: shows it on the agent at once and runs `save` in the background.
    onAddTool?: (tool: ToolData, save: () => Promise<NodePosition | undefined>) => void;
    onBack?: () => void;
    onSetBackOverride?: (handler: (() => void) | null) => void;
}

const SERVER_URL_FIELD_KEY = "serverUrl";
const AUTH_FIELD_KEY = "auth";
const RESULT_FIELD_KEY = "variable";
const TOOLKIT_NAME_FIELD_KEY = "toolKitName";
const INCLUDE_CONTEXT_PROPERTY = "includeContext";
// Hidden properties the language server writes onto the toolkit class as @display {label, iconPath}.
const TOOLKIT_LABEL_PROPERTY = "toolKitLabel";
const TOOLKIT_ICON_PROPERTY = "toolKitIcon";
// How long the server check waits after the URL stops changing, and how long a save waits for one still running.
const SERVER_PROBE_DELAY_MS = 500;
const SERVER_PROBE_SAVE_WAIT_MS = 5000;

interface McpServerInfo {
    name?: string;
    icon?: string;
}
// Matches McpToolKitBuilder in the language server: the MCP client a toolkit is built on
const MCP_PROTOCOL_KEY = "mcpProtocol";
const MCP_PROTOCOL_V1 = "v1";
const MCP_PROTOCOL_V2 = "v2";
// An mcp.v2 toolkit takes its auth inside this field; the form shows it as the auth field too
const HTTP_CONFIG_FIELD_KEY = "httpConfig";

// Delegates to the shared removeQuotes so `"url"` and string `url` compare equal.
const normalizeExpressionValue = (value: unknown): string =>
    typeof value === "string" ? removeQuotes(value) : "";

// Compares expressions regardless of their whitespace.
const compactExpression = (value: unknown): string =>
    typeof value === "string" ? value.replace(/\s+/g, "") : "";

const uniqueName = (base: string, reserved: Set<string>): string => {
    if (!reserved.has(base)) return base;
    let i = 1;
    while (reserved.has(`${base}${i}`)) i++;
    return `${base}${i}`;
};

// Names already declared at module level, which a toolkit named after its server must not reuse.
function moduleLevelNames(moduleNodes?: { flowModel?: { connections?: FlowNode[]; variables?: FlowNode[] } }): Set<string> {
    const names = new Set<string>();
    for (const node of [...(moduleNodes?.flowModel?.connections ?? []), ...(moduleNodes?.flowModel?.variables ?? [])]) {
        const properties = node.properties as Record<string, { value?: unknown }> | undefined;
        for (const key of [RESULT_FIELD_KEY, TOOLKIT_NAME_FIELD_KEY]) {
            const value = properties?.[key]?.value;
            if (typeof value === "string" && value) {
                names.add(value);
            }
        }
    }
    return names;
}

const stringValue = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value : undefined;

// Sets or clears a hidden property the language server reads when it writes the toolkit.
function setHiddenProperty(node: FlowNode, key: string, value?: string) {
    const properties = node.properties as Record<string, unknown>;
    if (!value) {
        delete properties[key];
        return;
    }
    properties[key] = { metadata: { label: key }, value, optional: true, editable: true, hidden: true };
}

export function AddMcpServer(props: AddMcpServerProps): JSX.Element {
    const { agentNode, onSave, onAddTool, editMode = false } = props;
    // Callers pass agentDefinition as a fresh object on each render, so it is compared by value: a new identity
    // would rerun initPanel, and its loading state would send the Agent Manager gate back to its first step.
    const agentDefinitionKey = props.agentDefinition ? JSON.stringify(props.agentDefinition) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const agentDefinition = useMemo(() => props.agentDefinition, [agentDefinitionKey]);
    const { rpcClient } = useRpcContext();
    const agentBuilder = useProductMode() === ProductMode.AGENT_BUILDER;

    const [serverUrl, setServerUrl] = useState("");
    const [auth, setAuth] = useState("");
    const [requiresAuth, setRequiresAuth] = useState(false);
    const [toolsInclude, setToolsInclude] = useState<string>("all");

    const [availableMcpTools, setAvailableMcpTools] = useState<Tool[]>([]);
    const [selectedMcpTools, setSelectedMcpTools] = useState<Set<string>>(new Set());
    const [loadingMcpTools, setLoadingMcpTools] = useState<boolean>(false);
    const [mcpToolsError, setMcpToolsError] = useState<string>("");
    const [toolScopes, setToolScopes] = useState<ToolScopes>({});
    const [includeContext, setIncludeContext] = useState(false);

    // An mcp.v2 toolkit takes its auth inside httpConfig. The auth field and the auth entry of httpConfig are kept
    // in step, using the last value each side was synced from to tell which side the user changed.
    const [mcpV2, setMcpV2] = useState(false);
    const mcpV2Ref = useRef(false);
    // The httpConfig value when it is not a mapping constructor, such as a variable, whose auth cannot be synced
    const [httpConfigExpression, setHttpConfigExpression] = useState<string | undefined>();
    const authValueRef = useRef<string | undefined>();
    const httpConfigValueRef = useRef<string | undefined>();
    const lastSyncedAuthRef = useRef<string | undefined>();
    const lastSyncedHttpConfigRef = useRef<{ value: string | undefined } | null>(null);
    // Starts the sync over for a form that mounts with the node's values, so the derivations neither wait for the
    // form to report those values nor compare them with the values of a form shown before
    const startHttpConfigAuthSync = () => {
        const properties = mcpToolKitNodeRef.current?.properties as Record<string, { value?: unknown }> | undefined;
        authValueRef.current = stringValue(properties?.[AUTH_FIELD_KEY]?.value);
        httpConfigValueRef.current = stringValue(properties?.[HTTP_CONFIG_FIELD_KEY]?.value);
        lastSyncedAuthRef.current = undefined;
        lastSyncedHttpConfigRef.current = null;
    };

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [showDiscoverModal, setShowDiscoverModal] = useState<boolean>(false);
    const [showScopes, setShowScopes] = useState<boolean>(false);
    const [formKey, setFormKey] = useState(0);
    const pickedProxy = useRef<{ proxyId: string; created: string[]; properties: FlowNode["properties"] }>();

    // Edit mode tracking
    const [resolutionError, setResolutionError] = useState<string>("");
    const [toolSource, setToolSource] = useState<'auto-fetched' | 'manual-discovery' | 'saved-mock' | null>(null);
    const isInitializingEditModeRef = useRef<boolean>(false);
    const lastProcessedValuesRef = useRef<{ serverUrl: string; auth: string } | null>(null);

    const mcpToolKitNodeTemplateRef = useRef<FlowNode>(null);
    const mcpToolKitNodeRef = useRef<FlowNode>(null);

    const agentFilePathRef = useRef<string>("");
    const agentFileEndLineRangeRef = useRef<LineRange | null>(null);
    const formRef = useRef<FormHandle>(null);
    const projectPathUriRef = useRef<string>("");

    // A new toolkit is named after its server until the user names it: serverInfoRef holds what the server said,
    // autoNameRef the name this form set from it, and defaultNameRef the template's generated name.
    const serverInfoRef = useRef<McpServerInfo>({});
    const autoNameRef = useRef<string | undefined>(undefined);
    const defaultNameRef = useRef<string>("");
    const nameEditedRef = useRef<boolean>(false);
    // The toolkit class name follows the variable name, by whatever means it was set, until the user edits it.
    const autoToolKitNameRef = useRef<string | undefined>(undefined);
    const defaultToolKitNameRef = useRef<string>("");
    const toolKitNameEditedRef = useRef<boolean>(false);
    // Module-level names are fetched in the background, so opening the form does not wait for a compilation.
    const reservedNamesRef = useRef<Promise<Set<string>>>(Promise.resolve(new Set()));
    const probeSeqRef = useRef<number>(0);
    // The scheduled or running server check, so a save made before it answers can wait for it.
    const probeRef = useRef<{ timer?: ReturnType<typeof setTimeout>; start?: () => void; running?: Promise<void> }>({});

    // An existing toolkit is edited with the form of the MCP client it is built on, whatever the ai version
    const fetchMcpToolKitTemplate = async (existingNode?: FlowNode) => {
        const response = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
            position: { line: agentFileEndLineRangeRef.current.endLine.line, offset: agentFileEndLineRangeRef.current.endLine.offset },
            filePath: agentFilePathRef.current,
            id: {
                node: "MCP_TOOL_KIT",
                ...(existingNode && {
                    data: { [MCP_PROTOCOL_KEY]: existingNode.codedata?.data?.[MCP_PROTOCOL_KEY] === MCP_PROTOCOL_V2 ? MCP_PROTOCOL_V2 : MCP_PROTOCOL_V1 },
                }),
            },
        });
        return response.flowNode;
    };

    const findExistingMcpToolKit = (variables: FlowNode[] = []): FlowNode | undefined =>
        props.existingNode ?? variables?.find(
            (v) => v.codedata?.node === "MCP_TOOL_KIT" && v.properties.variable?.value === props.name
        );

    const fetchModuleNodes = async () => {
        const moduleNodes = await rpcClient.getBIDiagramRpcClient().getModuleNodes();
        return moduleNodes;
    };

    const setupEditMode = async (mcpToolKitVariable?: FlowNode) => {
        if (!mcpToolKitVariable) return;

        // Resolve relative fileName to absolute path so formDidOpen gets a valid file URI
        if (mcpToolKitVariable.codedata?.lineRange?.fileName) {
            const resolvedPath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({
                segments: [mcpToolKitVariable.codedata.lineRange.fileName]
            })).filePath;
            mcpToolKitVariable.codedata.lineRange.fileName = resolvedPath;
        }

        // An existing mcp.v2 toolkit has no auth property, as its init takes auth inside httpConfig. The form only
        // offers the record editor for properties of the edited node, so the template's auth is added to it.
        const properties = mcpToolKitVariable.properties as Record<string, { value?: unknown }>;
        const templateAuth = (mcpToolKitNodeTemplateRef.current?.properties as Record<string, { value?: unknown }>)
            ?.[AUTH_FIELD_KEY];
        if (mcpV2Ref.current && properties && !properties[AUTH_FIELD_KEY] && templateAuth) {
            const httpConfigAuth = readHttpConfigAuth(properties[HTTP_CONFIG_FIELD_KEY]?.value as string);
            const authValue = httpConfigAuth.kind === "record" ? httpConfigAuth.auth : "";
            const authProperty = { ...cloneDeep(templateAuth), value: authValue } as Record<string, unknown>;
            // A mapping constructor opens in the record mode, as the language server marks it for a field read
            // from source
            if (authValue.startsWith("{") && Array.isArray(authProperty.types)) {
                for (const type of authProperty.types as { fieldType?: string; selected?: boolean }[]) {
                    type.selected = type.fieldType === "RECORD_MAP_EXPRESSION";
                }
            }
            properties[AUTH_FIELD_KEY] = authProperty;
        }

        mcpToolKitNodeRef.current = mcpToolKitVariable;
        const savedProperties = mcpToolKitVariable.properties as Record<string, { value?: unknown }> | undefined;
        setIncludeContext(savedProperties?.[INCLUDE_CONTEXT_PROPERTY]?.value === true);
        // The form drops hidden values on submit, so the class's saved @display is carried to the save by hand.
        serverInfoRef.current = {
            name: stringValue(savedProperties?.[TOOLKIT_LABEL_PROPERTY]?.value),
            icon: stringValue(savedProperties?.[TOOLKIT_ICON_PROPERTY]?.value),
        };
        initializeEditMode();
    };

    const initPanel = useCallback(async () => {
        setIsLoading(true);

        const agentFileName = agentNode?.codedata?.lineRange?.fileName;
        const [visualizerLocation, moduleNodes, agentFile, endLineRange] = await Promise.all([
            rpcClient.getVisualizerLocation(),
            editMode && !props.existingNode ? fetchModuleNodes() : Promise.resolve(undefined),
            rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [agentFileName] }),
            getEndOfFileLineRange(agentFileName, rpcClient),
        ]);
        projectPathUriRef.current = visualizerLocation.projectPath;
        agentFilePathRef.current = agentFile.filePath;
        agentFileEndLineRangeRef.current = endLineRange;

        const existingMcpToolKit = editMode ? findExistingMcpToolKit(moduleNodes?.flowModel?.variables) : undefined;
        const [template, scopesSupported] = await Promise.all([
            fetchMcpToolKitTemplate(existingMcpToolKit),
            checkAiPackageVersionSupport(rpcClient, visualizerLocation.projectPath, "1.11.0"),
        ]);

        mcpToolKitNodeTemplateRef.current = template;
        mcpV2Ref.current = template?.codedata?.data?.[MCP_PROTOCOL_KEY] === MCP_PROTOCOL_V2;
        setMcpV2(mcpV2Ref.current);
        // Tool scopes need agent identity, which a v2 toolkit does not support
        setShowScopes(scopesSupported && !mcpV2Ref.current);

        if (editMode) {
            await setupEditMode(existingMcpToolKit);
        } else {
            const reserved = agentDefinition?.reservedNames;
            const variableProp = (template.properties as any)?.[RESULT_FIELD_KEY];
            if (reserved?.length && variableProp && typeof variableProp.value === "string") {
                variableProp.value = uniqueName(variableProp.value, new Set(reserved));
            }
            defaultNameRef.current = typeof variableProp?.value === "string" ? variableProp.value : "";
            const toolKitNameValue = (template.properties as any)?.[TOOLKIT_NAME_FIELD_KEY]?.value;
            defaultToolKitNameRef.current = typeof toolKitNameValue === "string" ? toolKitNameValue : "";
            reservedNamesRef.current = agentDefinition
                ? Promise.resolve(new Set(reserved ?? []))
                : fetchModuleNodes().then(moduleLevelNames, () => new Set<string>());
            mcpToolKitNodeRef.current = template;
        }
        startHttpConfigAuthSync();

        setIsLoading(false);
    }, [agentDefinition, agentNode, editMode, props.existingNode, rpcClient]);

    const fetchToolsFromServer = useCallback(async (
        url: string,
        authValue: string = "",
        options?: {
            preselectTools?: string[], // If provided, only these tools will be selected; otherwise all tools are selected
            skipResolution?: boolean // If true, skip variable resolution (already resolved)
        }
    ) => {
        // Resolve the URL variable if needed (unless already resolved)
        const resolvedUrl = options?.skipResolution
            ? url
            : await resolveVariableValue(url, rpcClient, projectPathUriRef.current, agentFilePathRef.current);

        const cleanUrl = cleanServerUrl(resolvedUrl);
        if (cleanUrl === null) {
            setMcpToolsError("");
            setAvailableMcpTools([]);
            setSelectedMcpTools(new Set());
            setToolSource(null);
            setResolutionError("Unable to resolve Server URL at design time. Tools cannot be auto-fetched with the current configuration.");
            setLoadingMcpTools(false);
            return [];
        }

        // Resolve auth config variables if needed (unless already resolved)
        const resolvedAuthValue = options?.skipResolution
            ? authValue
            : await resolveAuthConfig(authValue, rpcClient, projectPathUriRef.current, agentFilePathRef.current);

        const accessToken = extractAccessToken(resolvedAuthValue);
        // The extension mints a token for client-credentials auth it holds credentials for.
        const usesClientCredentials = /\bclientId\s*:/.test(authValue);

        if (requiresAuth && accessToken === null && !usesClientCredentials) {
            setMcpToolsError("");
            setAvailableMcpTools([]);
            setSelectedMcpTools(new Set());
            setToolSource(null);
            setResolutionError("Unable to resolve authentication configuration at design time. Tools cannot be auto-fetched with the current configuration.");
            setLoadingMcpTools(false);
            return [];
        }

        setAvailableMcpTools([]);
        setSelectedMcpTools(new Set());
        setLoadingMcpTools(true);
        setMcpToolsError("");
        setResolutionError("");

        try {
            const response = await rpcClient.getAIAgentRpcClient().getMcpTools({
                serviceUrl: cleanUrl,
                accessToken
            });
            applyServerInfo(response, await reservedNamesRef.current);

            if (response.errorMsg) {
                const errorMessage = `Failed to fetch tools from MCP server: ${response.errorMsg}`;
                console.error(errorMessage);
                setMcpToolsError(response.errorMsg);
                setLoadingMcpTools(false);
                return [];
            }

            if (!response.tools || !Array.isArray(response.tools)) {
                setLoadingMcpTools(false);
                return [];
            }

            setAvailableMcpTools(response.tools);

            // Select tools based on options
            if (options?.preselectTools) {
                // Only select tools that match the preselected names and exist in the fetched tools
                const toolsToSelect = response.tools
                    .filter(tool => options.preselectTools.includes(tool.name))
                    .map(tool => tool.name);
                setSelectedMcpTools(new Set(toolsToSelect));
            } else {
                // Select all tools by default
                setSelectedMcpTools(new Set(response.tools.map(tool => tool.name)));
            }

            setLoadingMcpTools(false);
            setToolSource('auto-fetched');
            return response.tools;
        } catch (error) {
            console.error(`Failed to fetch tools from MCP server: ${error || 'Unknown error'}`);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setMcpToolsError(errorMessage);
            setLoadingMcpTools(false);
            return [];
        }
    }, [rpcClient, requiresAuth]);

    // Names a new toolkit after its server unless the user has named it, and keeps the server's name and icon
    // for the generated class. A server that stops answering gives the generated name back.
    function applyServerInfo(response: McpToolsResponse | undefined, reserved: Set<string>) {
        if (editMode) {
            return;
        }
        const info: McpServerInfo = { name: response?.serverName, icon: response?.serverIcon };
        serverInfoRef.current = info;
        if (nameEditedRef.current || pickedProxy.current) {
            return;
        }
        const name = mcpServerVariableName(info.name, reserved) ?? defaultNameRef.current;
        if (name && name !== autoNameRef.current) {
            autoNameRef.current = name;
            formRef.current?.setFieldValue(RESULT_FIELD_KEY, name);
        }
    }

    // The class name for a variable name. The generated variable name keeps the language server's generated class
    // name, which is already unique.
    function toolKitNameFor(variableName: unknown, reserved: Set<string>): string | undefined {
        if (!defaultToolKitNameRef.current || typeof variableName !== "string") {
            return undefined;
        }
        return !variableName.trim() || variableName === defaultNameRef.current
            ? defaultToolKitNameRef.current
            : uniqueName(generateToolKitName(variableName), reserved);
    }

    // Keeps the toolkit class name in step with the variable name until the user names the class.
    async function followVariableName(variableName: unknown) {
        if (editMode || toolKitNameEditedRef.current) {
            return;
        }
        const toolKitName = toolKitNameFor(variableName, await reservedNamesRef.current);
        if (toolKitName && toolKitName !== autoToolKitNameRef.current && !toolKitNameEditedRef.current) {
            autoToolKitNameRef.current = toolKitName;
            formRef.current?.setFieldValue(TOOLKIT_NAME_FIELD_KEY, toolKitName);
        }
    }

    // A save made before the server check answers would write the generated name and no @display, so it runs
    // a scheduled check at once and waits a bounded time for it, then names the saved node as the form would have.
    async function nameAfterServer(node: FlowNode) {
        const probe = probeRef.current;
        if (probe.timer) {
            clearTimeout(probe.timer);
            probe.start?.();
        }
        if (probe.running) {
            await Promise.race([probe.running, new Promise((resolve) => setTimeout(resolve, SERVER_PROBE_SAVE_WAIT_MS))]);
        }
        const properties = node.properties as Record<string, { value?: unknown }>;
        const variable = properties[RESULT_FIELD_KEY];
        if (variable && autoNameRef.current && !nameEditedRef.current && !pickedProxy.current) {
            variable.value = autoNameRef.current;
        }
        const toolKit = properties[TOOLKIT_NAME_FIELD_KEY];
        const toolKitName = toolKitNameFor(variable?.value, await reservedNamesRef.current);
        if (toolKit && toolKitName && !toolKitNameEditedRef.current) {
            toolKit.value = toolKitName;
        }
    }

    // With "all tools" there is no tool fetch to learn the server from, so ask it who it is.
    const probeServerInfo = useCallback(async (url: string, authValue: string) => {
        const seq = ++probeSeqRef.current;
        const resolvedUrl = cleanServerUrl(
            await resolveVariableValue(url, rpcClient, projectPathUriRef.current, agentFilePathRef.current)
        );
        let response: McpToolsResponse | undefined;
        if (resolvedUrl !== null) {
            const resolvedAuth = await resolveAuthConfig(authValue, rpcClient, projectPathUriRef.current, agentFilePathRef.current);
            // Without a token an authorized server still names itself through its OAuth metadata.
            const accessToken = extractAccessToken(resolvedAuth) ?? undefined;
            response = await rpcClient.getAIAgentRpcClient()
                .getMcpTools({ serviceUrl: resolvedUrl, accessToken })
                .catch((): undefined => undefined);
        }
        const reserved = await reservedNamesRef.current;
        if (seq === probeSeqRef.current) applyServerInfo(response, reserved);
    }, [rpcClient, editMode]);

    const cancelProbe = () => {
        clearTimeout(probeRef.current.timer);
        probeRef.current = {};
    };

    useEffect(() => {
        if (editMode || toolsInclude === "selected") {
            cancelProbe();
            return;
        }
        if (!serverUrl.trim()) {
            cancelProbe();
            probeSeqRef.current++;
            void reservedNamesRef.current.then((reserved) => applyServerInfo(undefined, reserved));
            return;
        }
        const probe: typeof probeRef.current = {};
        probe.start = () => {
            probe.timer = undefined;
            probe.running = probeServerInfo(serverUrl, auth);
        };
        probe.timer = setTimeout(probe.start, SERVER_PROBE_DELAY_MS);
        probeRef.current = probe;
        return () => clearTimeout(probe.timer);
    }, [serverUrl, auth, toolsInclude, editMode, probeServerInfo]);

    useEffect(() => {
        initPanel();
    }, [initPanel]);

    const debouncedFetchTools = useMemo(
        () => debounce((url: string, authValue: string) => {
            if (url.trim()) {
                fetchToolsFromServer(url, authValue);
            } else {
                setAvailableMcpTools([]);
                setSelectedMcpTools(new Set());
                setLoadingMcpTools(false);
                setMcpToolsError("");
            }
        }, 500),
        [fetchToolsFromServer]
    );

    useEffect(() => {
        if (toolsInclude !== "selected") {
            debouncedFetchTools.cancel();
            setAvailableMcpTools([]);
            setSelectedMcpTools(new Set());
            setLoadingMcpTools(false);
            setMcpToolsError("");
            setResolutionError("");
            setToolSource(null);
            return;
        }

        if (isInitializingEditModeRef.current) return;
        if (editMode && toolSource !== null) return;

        debouncedFetchTools(serverUrl, auth);
        return () => debouncedFetchTools.cancel();
    }, [serverUrl, auth, toolsInclude, requiresAuth, debouncedFetchTools]);

    useEffect(() => {
        // Clear auth field value when requiresAuth is unchecked
        if (!requiresAuth && auth) {
            setAuth("");
            if (formRef.current?.setFieldValue) {
                formRef.current.setFieldValue(AUTH_FIELD_KEY, "");
            }
        }
    }, [requiresAuth]);

    const initializeEditMode = async () => {
        isInitializingEditModeRef.current = true;

        try {
            const node = mcpToolKitNodeRef.current;
            if (!node) return;

            const originalValues = extractOriginalValues(node);
            const { serverUrl: savedUrl, permittedTools, toolScopes: savedToolScopes } = originalValues;
            let { auth: savedAuth, requiresAuth: savedRequiresAuth } = originalValues;
            if (mcpV2Ref.current) {
                // The saved auth of an mcp.v2 toolkit is in its httpConfig
                const savedHttpConfigAuth = readHttpConfigAuth(
                    (node.properties as Record<string, { value?: unknown }>)?.[HTTP_CONFIG_FIELD_KEY]?.value as string);
                savedAuth = savedHttpConfigAuth.kind === "record" ? savedHttpConfigAuth.auth : "";
                savedRequiresAuth = savedAuth !== "";
            }

            lastProcessedValuesRef.current = { serverUrl: savedUrl, auth: savedAuth };

            // Update form state so FlowNodeForm displays values
            setRequiresAuth(savedRequiresAuth);

            // Restore saved tool scopes
            if (Object.keys(savedToolScopes).length > 0) {
                setToolScopes(savedToolScopes);
            }

            // If no tools saved, exit early
            if (permittedTools.length === 0) {
                return;
            }

            // Attempt to resolve variables
            const resolution = await attemptValueResolution(
                savedUrl,
                savedAuth,
                rpcClient,
                projectPathUriRef.current,
                agentFilePathRef.current
            );
            // Set toolSource BEFORE setToolsInclude to prevent the useEffect from triggering a duplicate fetch
            setToolSource(resolution.canResolve ? 'auto-fetched' : 'saved-mock');
            setToolsInclude("selected");

            if (resolution.canResolve) {
                // Values CAN be resolved - fetch tools from server and preselect saved tools
                const tools = await fetchToolsFromServer(resolution.resolvedUrl, resolution.resolvedAuth, {
                    preselectTools: permittedTools,
                    skipResolution: true // Already resolved
                });

                // If fetch failed, fall back to mock tools
                if (!tools || tools.length === 0) {
                    if (resolution.error) {
                        setResolutionError(resolution.error);
                    }
                    displayMockTools(permittedTools);
                }
            } else {
                // Values CANNOT be resolved - show mock tools
                if (resolution.error) {
                    setResolutionError(resolution.error);
                }
                displayMockTools(permittedTools);
            }
        } finally {
            // Delay clearing the flag so the FlowNodeForm's initial onChange burst
            // (which fires for every field after the form mounts) doesn't reset toolSource.
            setTimeout(() => {
                isInitializingEditModeRef.current = false;
            }, 0);
        }
    };

    const displayMockTools = (toolNames: string[]) => {
        if (toolNames.length === 0) {
            setAvailableMcpTools([]);
            setSelectedMcpTools(new Set());
            setToolSource(null);
            return;
        }

        const mockTools = createMockTools(toolNames);
        setAvailableMcpTools(mockTools);
        setSelectedMcpTools(new Set(toolNames)); // All ticked
        setToolSource('saved-mock');
        setMcpToolsError(""); // Clear any connection errors when showing mock tools
    };

    const handleToolSelectionChange = useCallback((toolName: string, isSelected: boolean) => {
        setSelectedMcpTools(prev => {
            const newSet = new Set(prev);
            if (isSelected) {
                newSet.add(toolName);
            } else {
                newSet.delete(toolName);
            }
            return newSet;
        });
    }, []);

    const handleSelectAllTools = useCallback(() => {
        if (selectedMcpTools.size === availableMcpTools.length) {
            setSelectedMcpTools(new Set());
        } else {
            setSelectedMcpTools(new Set(availableMcpTools.map(t => t.name)));
        }
    }, [selectedMcpTools.size, availableMcpTools]);

    const handleToolScopesChange = useCallback((toolName: string, scopes: string[]) => {
        setToolScopes(prev => ({
            ...prev,
            [toolName]: scopes
        }));
    }, []);

    const handleDiscoveredTools = useCallback((tools: Tool[], selectedNames: Set<string>) => {
        setAvailableMcpTools(tools);
        setSelectedMcpTools(selectedNames);
        setToolSource('manual-discovery');
        setShowDiscoverModal(false);
        setMcpToolsError("");
        setResolutionError("Loaded tools via manual discovery.");
    }, []);

    const handleRetryFetch = useCallback(() => {
        // Clear previous errors and reset tool source
        setMcpToolsError("");
        setResolutionError("");
        setToolSource(null);

        // Retry fetching tools with current form values
        fetchToolsFromServer(serverUrl, auth);
    }, [serverUrl, auth, fetchToolsFromServer]);

    // A new server saved in the background closes the panel at once, so the form shows no saving state.
    const inBackground = Boolean(onAddTool) && !editMode && !agentDefinition;

    // Writes the server onto the agent as the edits queued before it left the agent.
    const writeServerToAgent = async (node: FlowNode, selectedTools: string[], scopesByTool: Record<string, string[]>) => {
        const latest = await withCurrentAgentTools(agentNode, rpcClient);
        if (!latest.current) {
            await refreshAgentNodeLineRange(latest.node, rpcClient);
        }
        await rpcClient.getAIAgentRpcClient().updateMCPToolKit({
            agentFlowNode: latest.node,
            selectedTools,
            updatedNode: node,
            toolScopes: Object.keys(scopesByTool).length > 0 ? scopesByTool : undefined,
        });
        return latest.node;
    };

    const commitPickedProxy = async (picked: typeof pickedProxy.current) => {
        if (picked) {
            const { projectPath } = await rpcClient.getVisualizerLocation();
            await rpcClient.getAgentManagerRpcClient().commitAgentManagerMcpProxy({ projectPath, proxyId: picked.proxyId });
        }
    };

    const addServerInBackground = (node: FlowNode, scopesByTool: Record<string, string[]>) => {
        const picked = pickedProxy.current;
        pickedProxy.current = undefined;
        const selectedTools = Array.from(selectedMcpTools);
        onAddTool({ name: String(node.properties?.variable?.value ?? ""), type: "MCP Server" }, async () => {
            // The form read the end of the file when it opened; edits queued since may have moved it.
            const fileName = node.codedata?.lineRange?.fileName;
            if (fileName) {
                node.codedata.lineRange = await getEndOfFileLineRange(fileName, rpcClient);
            }
            const agent = await writeServerToAgent(node, selectedTools, scopesByTool);
            await rpcClient.getAIAgentRpcClient().fixMissingImports().catch((): undefined => undefined);
            await commitPickedProxy(picked);
            return await resolveAgentNodePosition(agent, rpcClient);
        });
    };

    const handleSave = async (node?: FlowNode) => {
        setIsSaving(!inBackground);
        try {
            if (!node) {
                return;
            }

            if (selectedMcpTools.size === 0) {
                node.properties["permittedTools"].value = `()`;
            } else if ("permittedTools" in node.properties) {
                node.properties["permittedTools"].value = `[${Array.from(selectedMcpTools).map(tool => `"${tool}"`).join(", ")}]`;
            }

            const filteredScopes: Record<string, string[]> = {};
            if (showScopes && Object.keys(toolScopes).length > 0 && selectedMcpTools.size > 0) {
                for (const tool of selectedMcpTools) {
                    const scopes = toolScopes[tool];
                    if (scopes && scopes.length > 0) {
                        filteredScopes[tool] = scopes;
                    }
                }
            }

            if (Object.keys(filteredScopes).length > 0) {
                (node.properties as any)["toolScopes"] = {
                    metadata: { label: "Tool Scopes" },
                    valueType: "EXPRESSION",
                    value: JSON.stringify(filteredScopes),
                    optional: true,
                    editable: true,
                    advanced: true,
                    hidden: true,
                    codedata: {
                        kind: "INCLUDED_FIELD",
                        originalName: "toolScopes"
                    }
                };
            } else {
                delete (node.properties as any)["toolScopes"];
            }

            if (!editMode) {
                await nameAfterServer(node);
            }
            setHiddenProperty(node, TOOLKIT_LABEL_PROPERTY, serverInfoRef.current.name);
            setHiddenProperty(node, TOOLKIT_ICON_PROPERTY, serverInfoRef.current.icon);

            if (includeContext) {
                (node.properties as any)[INCLUDE_CONTEXT_PROPERTY] = {
                    metadata: { label: "Pass agent context" },
                    value: true,
                    optional: true,
                    editable: true,
                    advanced: true,
                    hidden: true,
                    codedata: {
                        kind: "INCLUDED_FIELD",
                        originalName: INCLUDE_CONTEXT_PROPERTY,
                    },
                };
            } else {
                delete (node.properties as any)[INCLUDE_CONTEXT_PROPERTY];
            }

            if (mcpV2) {
                // The generated code takes auth inside httpConfig; the language server leaves out the auth field
                const properties = node.properties as Record<string, { value?: unknown }>;
                const httpConfigProperty = properties[HTTP_CONFIG_FIELD_KEY];
                const authValue = properties[AUTH_FIELD_KEY]?.value;
                if (httpConfigProperty) {
                    const merged = writeHttpConfigAuth(httpConfigProperty.value as string,
                        requiresAuth && typeof authValue === "string" ? authValue : "");
                    if (merged !== undefined) {
                        httpConfigProperty.value = merged;
                    }
                }
            }

            if (inBackground) {
                addServerInBackground(node, filteredScopes);
                return;
            }

            let targetAgentNode: FlowNode | undefined;
            if (agentDefinition) {
                await rpcClient.getBIDiagramRpcClient().saveClassMember({
                    filePath: agentDefinition.filePath,
                    flowNode: node,
                    classLineRange: agentDefinition.classLineRange,
                });
            } else {
                await serializeAgentToolsEdit(async () => {
                    targetAgentNode = await writeServerToAgent(node, Array.from(selectedMcpTools), filteredScopes);
                });
            }

            await rpcClient.getAIAgentRpcClient().fixMissingImports().catch((): undefined => undefined);

            const picked = pickedProxy.current;
            pickedProxy.current = undefined;
            onSave?.(targetAgentNode ? await resolveAgentNodePosition(targetAgentNode, rpcClient) : undefined);
            await commitPickedProxy(picked);
        } catch (error) {
            console.error("Error saving MCP server:", error);
            rpcClient.getCommonRpcClient().showErrorMessage({
                message: "Failed to save MCP server configuration. Please try again."
            });
        } finally {
            setIsSaving(false);
        }
    };

    // The form reads values only when it mounts, so a picked server remounts it.
    const handleAgentManagerBinding = useCallback((binding: AgentManagerMcpBinding, proxyId: string) => {
        pickedProxy.current = { proxyId, created: binding.created ?? [], properties: cloneDeep(mcpToolKitNodeRef.current.properties) };
        applyMcpBinding(mcpToolKitNodeRef.current, binding, proxyId);
        setRequiresAuth(!!binding.auth);
        startHttpConfigAuthSync();
        setFormKey((key) => key + 1);
    }, []);

    // Going back or leaving without saving removes the configurables the pick added and clears its values from the form.
    const discardPickedProxy = useCallback(() => {
        const picked = pickedProxy.current;
        if (!picked) {
            return;
        }
        pickedProxy.current = undefined;
        mcpToolKitNodeRef.current.properties = picked.properties;
        nameEditedRef.current = false;
        autoNameRef.current = undefined;
        toolKitNameEditedRef.current = false;
        autoToolKitNameRef.current = undefined;
        setServerUrl("");
        setAuth("");
        setRequiresAuth(false);
        startHttpConfigAuthSync();
        setFormKey((key) => key + 1);
        if (picked.created.length > 0) {
            void rpcClient.getVisualizerLocation().then(({ projectPath }) => rpcClient.getAgentManagerRpcClient()
                .discardAgentManagerBinding({ projectPath, configurables: picked.created }));
        }
    }, [rpcClient]);

    useEffect(() => discardPickedProxy, [discardPickedProxy]);

    const isSaveDisabled = useMemo(() => {
        return availableMcpTools.length > 0 && selectedMcpTools.size === 0;
    }, [availableMcpTools.length, selectedMcpTools.size]);

    const injectedComponents = useMemo(() => {
        const shouldShowDiscoverButton = toolsInclude === "selected"
            && !loadingMcpTools && (resolutionError !== "" || mcpToolsError !== "");

        return [
            {
                component: (
                    <RequiresAuthCheckbox
                        checked={requiresAuth}
                        onChange={() => setRequiresAuth(prev => !prev)}
                        {...(mcpV2 && requiresAuth && httpConfigExpression !== undefined && {
                            description: "Set in HTTP Configuration."
                        })}
                    />
                ),
                index: 1
            },
            {
                component: (
                    <McpToolsSelection
                        key="mcp-tools-selection"
                        tools={availableMcpTools}
                        selectedTools={selectedMcpTools}
                        loading={loadingMcpTools}
                        error={mcpToolsError}
                        onToolSelectionChange={handleToolSelectionChange}
                        onSelectAll={handleSelectAllTools}
                        serviceUrl={serverUrl}
                        showValidationError={isSaveDisabled}
                        toolsInclude={toolsInclude}
                        onToolsIncludeChange={setToolsInclude}
                        showDiscoverButton={shouldShowDiscoverButton}
                        onDiscoverClick={() => setShowDiscoverModal(true)}
                        resolutionError={resolutionError}
                        toolSource={toolSource}
                        onRetryFetch={handleRetryFetch}
                        toolScopes={showScopes ? toolScopes : undefined}
                        onToolScopesChange={showScopes ? handleToolScopesChange : undefined}
                    />
                ),
                index: 2
            },
            {
                component: (
                    <RequiresAuthCheckbox
                        checked={includeContext}
                        onChange={setIncludeContext}
                        label="Pass agent context"
                        description={"Adds ai:Context ctx as the first parameter so the generated tools can "
                            + "access the invoking agent's context."}
                    />
                ),
                index: 0,
                advanced: true,
            }];
    }, [availableMcpTools, selectedMcpTools, loadingMcpTools, mcpToolsError, serverUrl, handleToolSelectionChange, handleSelectAllTools, isSaveDisabled, requiresAuth, toolsInclude, editMode, toolSource, resolutionError, handleRetryFetch, toolScopes, handleToolScopesChange, showScopes, includeContext, mcpV2, httpConfigExpression]);

    const fieldOverrides = useMemo(() => ({
        auth: {
            advanced: false,
            hidden: !requiresAuth,
            // The auth inside a variable httpConfig cannot be changed from the form
            ...(mcpV2 && httpConfigExpression !== undefined && { editable: false })
        },
        toolKitName: {
            advanced: true,
            editable: !editMode,
        },
        variable: {
            editable: !editMode,
            // A toolkit owned by an agent definition is declared as a class field with the name as given
            sourceFormName: Boolean(agentDefinition),
        }
    }), [requiresAuth, editMode, agentDefinition, mcpV2, httpConfigExpression]);

    // Keeps the auth field and the auth entry of httpConfig in step for an mcp.v2 toolkit. Both run on every form
    // change, so each acts only when its own source changed since it last ran. Auth is applied first, so a change
    // made in httpConfig is not overwritten by the auth field's earlier value.
    const httpConfigAuthDerivations = useMemo(() => !mcpV2 ? [] : [
        {
            sourceField: AUTH_FIELD_KEY,
            targetField: HTTP_CONFIG_FIELD_KEY,
            breakOnManualEdit: false,
            deriveFn: (authValue: unknown) => {
                const current = httpConfigValueRef.current;
                const desired = requiresAuth && typeof authValue === "string" ? authValue.trim() : "";
                const previous = lastSyncedAuthRef.current;
                lastSyncedAuthRef.current = desired;
                const changed = previous === undefined
                    ? desired !== ""
                    : compactExpression(previous) !== compactExpression(desired);
                const currentAuth = readHttpConfigAuth(current);
                if (!changed || currentAuth.kind !== "record"
                    || compactExpression(currentAuth.auth) === compactExpression(desired)) {
                    return current;
                }
                const updated = writeHttpConfigAuth(current, desired) ?? current;
                httpConfigValueRef.current = updated;
                return updated;
            }
        },
        {
            sourceField: HTTP_CONFIG_FIELD_KEY,
            targetField: AUTH_FIELD_KEY,
            breakOnManualEdit: false,
            deriveFn: (httpConfigValue: unknown) => {
                const value = typeof httpConfigValue === "string" ? httpConfigValue : undefined;
                const currentAuth = authValueRef.current;
                const previous = lastSyncedHttpConfigRef.current;
                lastSyncedHttpConfigRef.current = { value };
                const httpConfigAuth = readHttpConfigAuth(value);
                setHttpConfigExpression(httpConfigAuth.kind === "expression" ? value : undefined);
                if ((previous && previous.value === value) || httpConfigAuth.kind !== "record"
                    || compactExpression(httpConfigAuth.auth) === compactExpression(currentAuth)
                    // On first load, an httpConfig without auth leaves an auth value already given, such as one
                    // from an Agent Manager binding, to be written into httpConfig
                    || (!previous && httpConfigAuth.auth === "")) {
                    return currentAuth;
                }
                lastSyncedAuthRef.current = httpConfigAuth.auth;
                authValueRef.current = httpConfigAuth.auth;
                if (httpConfigAuth.auth !== "") {
                    setRequiresAuth(true);
                }
                return httpConfigAuth.auth;
            }
        }
    ], [mcpV2, requiresAuth]);

    const form = mcpToolKitNodeTemplateRef && (
        <FlowNodeForm
            key={formKey}
            ref={formRef}
            fileName={mcpToolKitNodeRef.current?.codedata?.lineRange?.fileName ? mcpToolKitNodeRef.current.codedata.lineRange?.fileName : agentFileEndLineRangeRef.current?.fileName}
            targetLineRange={mcpToolKitNodeRef.current?.codedata?.lineRange ? mcpToolKitNodeRef.current.codedata.lineRange : agentFileEndLineRangeRef.current}
            nodeFormTemplate={mcpToolKitNodeTemplateRef.current}
            submitText={isSaving ? "Saving..." : "Save"}
            node={mcpToolKitNodeRef.current}
            onSubmit={handleSave}
            onChange={(fieldKey, value) => {
                const processed = lastProcessedValuesRef.current;
                if (fieldKey === AUTH_FIELD_KEY) {
                    authValueRef.current = value;
                } else if (fieldKey === HTTP_CONFIG_FIELD_KEY) {
                    httpConfigValueRef.current = value;
                }
                if (fieldKey === RESULT_FIELD_KEY) {
                    if (value && value !== autoNameRef.current && value !== defaultNameRef.current) {
                        nameEditedRef.current = true;
                    }
                    followVariableName(value);
                } else if (fieldKey === TOOLKIT_NAME_FIELD_KEY) {
                    if (value && value !== autoToolKitNameRef.current && value !== defaultToolKitNameRef.current) {
                        toolKitNameEditedRef.current = true;
                    }
                } else if (fieldKey === SERVER_URL_FIELD_KEY) {
                    const isReplay = processed !== null &&
                        normalizeExpressionValue(value) === normalizeExpressionValue(processed.serverUrl);
                    setServerUrl(value);
                    if (processed) processed.serverUrl = value;
                    if (editMode && !isInitializingEditModeRef.current && toolSource !== null && !isReplay) {
                        setToolSource(null);
                    }
                } else if (fieldKey === AUTH_FIELD_KEY) {
                    const isReplay = processed !== null &&
                        normalizeExpressionValue(value) === normalizeExpressionValue(processed.auth);
                    setAuth(value);
                    if (processed) processed.auth = value;
                    if (editMode && !isInitializingEditModeRef.current && toolSource !== null && !isReplay) {
                        setToolSource(null);
                    }
                }
            }}
            derivedFields={httpConfigAuthDerivations}
            showProgressIndicator={isSaving}
            disableSaveButton={isSaveDisabled}
            injectedComponents={injectedComponents}
            fieldOverrides={fieldOverrides}
        />
    );

    return (
        <Container>
            {isLoading && <FormLoadingState />}

            {!isLoading && (editMode || !agentBuilder ? form : <AgentManagerMcpGate onBind={handleAgentManagerBinding} onDiscard={discardPickedProxy} onSetBackOverride={props.onSetBackOverride}>{form}</AgentManagerMcpGate>)}

            <DiscoverToolsModal
                isOpen={showDiscoverModal}
                onClose={() => setShowDiscoverModal(false)}
                onToolsSelected={handleDiscoveredTools}
                rpcClient={rpcClient}
                existingToolNames={selectedMcpTools}
            />
        </Container>
    );
}
