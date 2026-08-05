/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
 * You may not alter or remove any copyright or other notice from copies of this content.
 */

import { FlowNode, LineRange } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RelativeLoader } from "../../../components/RelativeLoader";
import FlowNodeForm from "../Forms/FlowNodeForm";
import { McpToolsSelection, ToolScopes } from "./Mcp/McpToolsSelection";
import { DiscoverToolsModal } from "./Mcp/DiscoverToolsModal";
import { RequiresAuthCheckbox } from "./Mcp/RequiresAuthCheckbox";
import { attemptValueResolution, createMockTools, extractOriginalValues, generateToolKitName } from "./Mcp/utils";
import { cleanServerUrl } from "./formUtils";
import { Container, LoaderContainer } from "./styles";
import { extractAccessToken, getEndOfFileLineRange, removeQuotes, resolveVariableValue, resolveAuthConfig, checkAiPackageVersionSupport } from "./utils";

interface Tool {
    name: string;
    description?: string;
}

interface AddMcpServerProps {
    editMode?: boolean;
    name?: string;
    agentNode: FlowNode;
    onSave?: () => void;
    onBack?: () => void;
}

const SERVER_URL_FIELD_KEY = "serverUrl";
const AUTH_FIELD_KEY = "auth";
const RESULT_FIELD_KEY = "variable";
const TOOLKIT_NAME_FIELD_KEY = "toolKitName";

// Delegates to the shared removeQuotes so `"url"` and string `url` compare equal.
const normalizeExpressionValue = (value: unknown): string =>
    typeof value === "string" ? removeQuotes(value) : "";

export function AddMcpServer(props: AddMcpServerProps): JSX.Element {
    const { agentNode, onSave, editMode = false } = props;
    const { rpcClient } = useRpcContext();

    const [serverUrl, setServerUrl] = useState("");
    const [auth, setAuth] = useState("");
    const [requiresAuth, setRequiresAuth] = useState(false);
    const [toolsInclude, setToolsInclude] = useState<string>("all");

    const [availableMcpTools, setAvailableMcpTools] = useState<Tool[]>([]);
    const [selectedMcpTools, setSelectedMcpTools] = useState<Set<string>>(new Set());
    const [loadingMcpTools, setLoadingMcpTools] = useState<boolean>(false);
    const [mcpToolsError, setMcpToolsError] = useState<string>("");
    const [toolScopes, setToolScopes] = useState<ToolScopes>({});

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [showDiscoverModal, setShowDiscoverModal] = useState<boolean>(false);
    const [showScopes, setShowScopes] = useState<boolean>(false);

    // Edit mode tracking
    const [resolutionError, setResolutionError] = useState<string>("");
    const [toolSource, setToolSource] = useState<'auto-fetched' | 'manual-discovery' | 'saved-mock' | null>(null);
    const isInitializingEditModeRef = useRef<boolean>(false);
    const lastProcessedValuesRef = useRef<{ serverUrl: string; auth: string } | null>(null);

    const mcpToolKitNodeTemplateRef = useRef<FlowNode>(null);
    const mcpToolKitNodeRef = useRef<FlowNode>(null);
    const agentNodeRef = useRef<FlowNode>(null);

    const agentFilePathRef = useRef<string>("");
    const agentFileEndLineRangeRef = useRef<LineRange | null>(null);
    const formRef = useRef<any>(null);
    const projectPathUriRef = useRef<string>("");

    const fetchAgentNode = async () => {
        // The agent declaration node is supplied directly by the focus diagram — no call-node lookup.
        agentNodeRef.current = agentNode;
    };

    const fetchMcpToolKitTemplate = async () => {
        const response = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
            position: { line: agentFileEndLineRangeRef.current.endLine.line, offset: agentFileEndLineRangeRef.current.endLine.offset },
            filePath: agentFilePathRef.current,
            id: {
                node: "MCP_TOOL_KIT",
            },
        });
        return response.flowNode;
    };

    const fetchModuleNodes = async () => {
        const moduleNodes = await rpcClient.getBIDiagramRpcClient().getModuleNodes();
        return moduleNodes;
    };

    const setupEditMode = async (variables: FlowNode[]) => {
        const mcpToolKitVariable = variables?.find(
            (v) => v.codedata?.node === "MCP_TOOL_KIT" && v.properties.variable?.value === props.name
        );
        if (!mcpToolKitVariable) return;

        // Resolve relative fileName to absolute path so formDidOpen gets a valid file URI
        if (mcpToolKitVariable.codedata?.lineRange?.fileName) {
            const resolvedPath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({
                segments: [mcpToolKitVariable.codedata.lineRange.fileName]
            })).filePath;
            mcpToolKitVariable.codedata.lineRange.fileName = resolvedPath;
        }

        mcpToolKitNodeRef.current = mcpToolKitVariable;
        initializeEditMode();
    };

    const initPanel = useCallback(async () => {
        setIsLoading(true);

        // Get project path URI
        const visualizerLocation = await rpcClient.getVisualizerLocation();
        projectPathUriRef.current = visualizerLocation.projectPath;

        const moduleNodes = await fetchModuleNodes();

        await fetchAgentNode();
        agentFilePathRef.current = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [agentNodeRef.current?.codedata?.lineRange?.fileName] })).filePath;
        const endLineRange = await getEndOfFileLineRange(agentNodeRef.current?.codedata?.lineRange?.fileName, rpcClient);
        agentFileEndLineRangeRef.current = endLineRange;

        const template = await fetchMcpToolKitTemplate();
        const scopesSupported = await checkAiPackageVersionSupport(rpcClient, visualizerLocation.projectPath, "1.11.0");
        setShowScopes(scopesSupported);

        mcpToolKitNodeTemplateRef.current = template;

        if (editMode) {
            await setupEditMode(moduleNodes.flowModel.variables);
        } else {
            mcpToolKitNodeRef.current = template;
        }

        setIsLoading(false);
    }, [editMode, rpcClient]);

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

        if (requiresAuth && accessToken === null) {
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

            const { serverUrl: savedUrl, auth: savedAuth, permittedTools, requiresAuth: savedRequiresAuth, toolScopes: savedToolScopes } = extractOriginalValues(node);

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

    const handleSave = async (node?: FlowNode) => {
        setIsSaving(true);
        try {
            await rpcClient.getAIAgentRpcClient().updateMCPToolKit({
                agentFlowNode: agentNodeRef.current,
                selectedTools: Array.from(selectedMcpTools),
                updatedNode: node,
                toolScopes: showScopes && Object.keys(toolScopes).length > 0 ? toolScopes : undefined,
            });
            
            try {
                await rpcClient.getAIAgentRpcClient().fixMissingImports();
            } catch (importFixError) {
                console.warn("fixMissingImports failed after MCP save", importFixError);
            }

            onSave?.();
        } catch (error) {
            console.error("Error saving MCP server:", error);
            rpcClient.getCommonRpcClient().showErrorMessage({
                message: "Failed to save MCP server configuration. Please try again."
            });
        } finally {
            setIsSaving(false);
        }
    };

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
            }];
    }, [availableMcpTools, selectedMcpTools, loadingMcpTools, mcpToolsError, serverUrl, handleToolSelectionChange, handleSelectAllTools, isSaveDisabled, requiresAuth, toolsInclude, editMode, toolSource, resolutionError, handleRetryFetch, toolScopes, handleToolScopesChange, showScopes]);

    const fieldOverrides = useMemo(() => ({
        auth: {
            advanced: false,
            hidden: !requiresAuth
        },
        toolKitName: {
            advanced: true,
        }
    }), [requiresAuth]);

    return (
        <Container>
            {isLoading && (
                <LoaderContainer>
                    <RelativeLoader />
                </LoaderContainer>
            )}

            {mcpToolKitNodeTemplateRef && (
                <FlowNodeForm
                    ref={formRef}
                    fileName={mcpToolKitNodeRef.current?.codedata?.lineRange?.fileName ? mcpToolKitNodeRef.current.codedata.lineRange?.fileName : agentFileEndLineRangeRef.current?.fileName}
                    targetLineRange={mcpToolKitNodeRef.current?.codedata?.lineRange ? mcpToolKitNodeRef.current.codedata.lineRange : agentFileEndLineRangeRef.current}
                    nodeFormTemplate={mcpToolKitNodeTemplateRef.current}
                    submitText={"Save"}
                    node={mcpToolKitNodeRef.current}
                    onSubmit={handleSave}
                    onChange={(fieldKey, value) => {
                        const processed = lastProcessedValuesRef.current;
                        if (fieldKey === SERVER_URL_FIELD_KEY) {
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
                    derivedFields={editMode ? [] : [
                        {
                            sourceField: RESULT_FIELD_KEY,
                            targetField: TOOLKIT_NAME_FIELD_KEY,
                            deriveFn: generateToolKitName,
                            breakOnManualEdit: true
                        }
                    ]}
                    showProgressIndicator={isSaving}
                    disableSaveButton={isSaveDisabled}
                    injectedComponents={injectedComponents}
                    fieldOverrides={fieldOverrides}
                />
            )}

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
