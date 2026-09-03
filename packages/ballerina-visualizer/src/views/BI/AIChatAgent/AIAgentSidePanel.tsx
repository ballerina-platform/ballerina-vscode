/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { NodeList, Category as PanelCategory, FormField, FormImports, FormValues, MarkdownDescription } from "@wso2/ballerina-side-panel";
import {
    BIAvailableNodesRequest,
    Category,
    AvailableNode,
    LineRange,
    EVENT_TYPE,
    MACHINE_VIEW,
    FUNCTION_TYPE,
    ParentPopupData,
    BISearchRequest,
    CodeData,
    NodeMetadata,
    FunctionNode,
    FlowNode,
    ToolParameters,
    ToolParametersValue,
    DIRECTORY_MAP,
    Property,
    ToolParameterItem,
    NodeProperties,
    Diagnostic,
    RecordTypeField,
    getPrimaryInputType,
    FieldType,
} from "@wso2/ballerina-core";
import { Button, Codicon, Icon, TextField, ThemeColors, Typography } from "@wso2/ui-toolkit";

import {
    convertBICategoriesToSidePanelCategories,
    convertConfig,
    convertFunctionCategoriesToSidePanelCategories,
    filterToolInputSymbolDiagnostics,
    getImportsForProperty
} from "../../../utils/bi";
import ArtifactForm from "../Forms/ArtifactForm";
import { RelativeLoader } from "../../../components/RelativeLoader";
import styled from "@emotion/styled";
import { URI, Utils } from "vscode-uri";
import { cloneDeep } from "lodash";
import { buildAgentToolFields, buildApprovalToolData, buildRequiresApprovalField, collectLocalFunctionNames, createDefaultParameterValue, createRequiresApprovalField, createToolInputFields, createToolParameters, extractRecordTypeFields, extractRecordTypeFieldsFromEntries, prepareToolInputFields, stripCodeFences, stripCodeFencesInline } from "./formUtils";
import { ImplementationBadge } from "../../../components/ImplementationBadge";
import { FUNCTION_CALL, METHOD_CALL, REMOTE_ACTION_CALL, RESOURCE_ACTION_CALL } from "../../../constants";
import { NewToolSelectionMode } from "./NewTool";
import { buildOAuthFields, fetchOAuthConfigProperties, ZERO_LINE_RANGE } from "./utils";
import { updateResourcePathProperty } from "./agentTools";
import { AddConnectionPopupContent } from "../Connection/AddConnectionPopup/AddConnectionPopupContent";
import { ConnectionConfigurationForm } from "../Connection/ConnectionConfigurationPopup";
import {
    ActionSelection,
    ConnectorBrowser,
    WizardStep,
    buildConnectionSelectField,
    displayResourcePath,
} from "../Connection/ConnectorBrowser";
import {
    INCLUDE_CONTEXT_KEY,
    RESULT_TYPE_GROUP,
    TOOL_INPUT_GROUP,
    buildIncludeContextField,
    buildToolFormGroups,
    getExistingToolNames,
    resourceToolNameSeed,
    suggestToolName,
} from "./toolForm";
import { useCreateNode } from "../../../components/ConnectionSelector/useCreateNode";
import { ConnectorIcon } from "@wso2/bi-diagram";
import {
    BackButton,
    CloseButton,
    HeaderTitleContainer,
    PopupContent,
    PopupFooter,
    PopupHeader,
    PopupContainer,
    PopupOverlay,
    PopupSubtitle,
    PopupTitle,
} from "../Connection/styles";

const LoaderContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const PopupLoaderContainer = styled.div`
    flex: 1;
    min-height: 0;
    display: flex;
    justify-content: center;
    align-items: center;

    p {
        font-size: 13px;
    }
`;

const DependencyFormContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const DependencyConnectorCard = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
`;

const DependencyConnectorIcon = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_CONTAINER};

    & > img,
    & > svg {
        width: 32px;
        height: 32px;
    }
`;

const DependencyConnectorIconImage = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;

    & > img,
    & > svg {
        width: 32px;
        height: 32px;
        object-fit: contain;
    }
`;

const DependencyConnectorContent = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const DependencyConnectorName = styled(Typography)`
    margin: 0;
    color: ${ThemeColors.ON_SURFACE};
    font-size: 13px;
    font-weight: 600;
`;

const DependencyConnectorDescription = styled(MarkdownDescription)`
    max-height: 3em;
    margin: 0;
    overflow: hidden;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 13px;

    p,
    li {
        margin: 0;
        overflow: hidden;
        font-size: 13px;
    }

    p {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
    }
`;

const ReadOnlyField = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const ReadOnlyValue = styled.div`
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
    padding: 6px 10px;
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    background-color: var(--vscode-input-background);
    color: var(--vscode-foreground);
`;

const ConnectionMethodOptions = styled.div`
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
`;

const ConnectionMethodCard = styled.button`
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px;
    color: ${ThemeColors.ON_SURFACE};
    background: ${ThemeColors.SURFACE_DIM};
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
        background-color: ${ThemeColors.PRIMARY_CONTAINER};
        border-color: ${ThemeColors.PRIMARY};
    }

    &:focus-visible {
        outline: 2px solid ${ThemeColors.PRIMARY};
        outline-offset: 2px;
    }
`;

const ConnectionMethodIcon = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: ${ThemeColors.SURFACE_CONTAINER};
    border-radius: 8px;
`;

const ConnectionMethodDetails = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
`;

const ConnectionMethodTitle = styled.div`
    font-size: 13px;
    font-weight: 600;
`;

const ConnectionMethodDescription = styled.div`
    margin: 0;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 13px;
    line-height: 1.45;
`;

const ConnectionMethodChevron = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

const ConnectionModalStep = styled.div<{
    $animate: boolean;
    $direction: "forward" | "backward";
}>`
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    --connection-step-offset: ${(props: { $animate: boolean; $direction: "forward" | "backward" }) => props.$direction === "forward" ? "8px" : "-8px"};
    animation: ${(props: { $animate: boolean; $direction: "forward" | "backward" }) => props.$animate
        ? "connection-step 150ms ease-out both"
        : "none"};

    @keyframes connection-step {
        from {
            opacity: 0;
            transform: translateX(var(--connection-step-offset));
        }

        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        animation: none;
    }
`;

const AgentConnectionPopupContainer = styled(PopupContainer) <{ $compact?: boolean }>`
    width: ${(props: { $compact?: boolean }) => props.$compact ? "calc(100vw - 64px) !important" : "80%"};
    max-width: ${(props: { $compact?: boolean }) => props.$compact ? "680px !important" : "800px"};
    height: ${(props: { $compact?: boolean }) => props.$compact ? "auto !important" : "80vh"};
    min-height: ${(props: { $compact?: boolean }) => props.$compact ? "0 !important" : "480px"};
    max-height: ${(props: { $compact?: boolean }) => props.$compact ? "calc(100vh - 64px) !important" : "800px"};
`;

const BALLERINA_RESERVED_WORDS = new Set([
    "abstract", "annotation", "any", "anydata", "as", "ascending", "base16", "base64", "boolean", "break",
    "byte", "by", "check", "checkpanic", "class", "client", "collect", "commit", "configurable", "conflict",
    "const", "continue", "decimal", "default", "descending", "distinct", "do", "else", "enum", "equals", "error",
    "external", "fail", "false", "field", "final", "float", "flush", "for", "foreach", "fork", "from",
    "function", "future", "group", "handle", "if", "import", "in", "int", "is", "isolated", "join", "json",
    "key", "let", "limit", "listener", "lock", "map", "match", "module", "never", "new", "null", "object",
    "on", "order", "outer", "panic", "parameter", "private", "public", "readonly", "record", "remote",
    "resource", "retry", "return", "returns", "rollback", "select", "self", "service", "source", "start",
    "stream", "string", "table", "transaction", "transactional", "trap", "true", "type", "typedesc", "typeof",
    "var", "variable", "version", "wait", "where", "while", "worker", "xml", "xmlns",
]);

export enum SidePanelView {
    NODE_LIST = "NODE_LIST",
    TOOL_FORM = "TOOL_FORM",
    CONNECTION_METHOD = "CONNECTION_METHOD",
    CONNECTOR_SELECT = "CONNECTOR_SELECT",
    DEPENDENCY_FORM = "DEPENDENCY_FORM",
    CONNECTION_CONFIG = "CONNECTION_CONFIG",
    CONNECTOR_WIZARD = "CONNECTOR_WIZARD",
}

export interface ConnectionDependencyConfig {
    className: string;
    filePath: string;
    classLineRange: LineRange;
    inputNames: string[];
    connectionFieldNames: string[];
    connectionOrigins: Record<string, "dependency" | "agent">;
    reservedNames: string[];
}

export interface BIFlowDiagramProps {
    agentNode: FlowNode;
    projectPath: string;
    onSubmit: (data: ExtendedAgentToolRequest) => void | Promise<void>;
    mode?: NewToolSelectionMode;
    onViewChange?: (view: SidePanelView, navigateBack?: () => void) => void;
    onAgentToolCreated?: (functionName: string) => void;
    onCancel?: () => void;
    connectionDependency?: ConnectionDependencyConfig;
}

export interface ExtendedAgentToolRequest {
    toolName: string;
    description: string;
    includeContext: boolean;
    selectedCodeData: CodeData;
    toolParameters?: ToolParameters;
    functionNode?: FunctionNode;
    flowNode?: FlowNode;
    parameterImports?: { [prefix: string]: string };
    connectionName?: string;
}

// Ensure "io", "log", and "time" module functions always appear under "Standard Library",
// even if they've been imported (which moves them to "Imported Functions" from the LS)
const STANDARD_LIB_MODULES = ["io", "log", "time"];

function ensureStandardLibModules(categories: PanelCategory[]): PanelCategory[] {
    const stdLib = categories.find((cat) => cat.title === "Standard Library");
    const imported = categories.find((cat) => cat.title?.includes("Imported"));
    if (!stdLib || !imported) return categories;

    const isCategoryItem = (item: unknown): item is PanelCategory => typeof item === "object" && item !== null && "title" in item;
    const existingModules = new Set(stdLib.items.filter(isCategoryItem).map((item) => item.title));

    for (const name of STANDARD_LIB_MODULES) {
        if (existingModules.has(name)) continue;
        const match = imported.items.find((item) => isCategoryItem(item) && item.title === name);
        if (match) stdLib.items.push({ ...match });
    }

    return categories;
}

// Reorder function categories: move "Imported Functions" to the end
function reorderFunctionCategories(categories: PanelCategory[]): PanelCategory[] {
    const importedIndex = categories.findIndex((cat) => cat.title?.includes("Imported"));
    if (importedIndex !== -1) {
        const [importedCategory] = categories.splice(importedIndex, 1);
        categories.push(importedCategory);
    }
    return categories;
}

const getConnectionFieldName = (name: string): string =>
    name.startsWith("self.") ? name.slice("self.".length) : name;

// Tool Name + Description are shared with the "Use Connection"/"Create Custom Tool" flows via
// buildAgentToolFields; Requires Approval (createRequiresApprovalField, shared across all three
// tool-creation paths) is appended here, scoped to this form only.
const INITIAL_FIELDS: FormField[] = [
    ...buildAgentToolFields("", ""),
    createRequiresApprovalField(),
];

export function AIAgentSidePanel(props: BIFlowDiagramProps) {
    const { agentNode, projectPath, onSubmit, mode = NewToolSelectionMode.ALL, onViewChange, onAgentToolCreated, onCancel, connectionDependency } = props;
    const { rpcClient } = useRpcContext();
    const dependencyMode = Boolean(connectionDependency);

    const connectorFirst = mode === NewToolSelectionMode.CONNECTION && !dependencyMode;

    const [sidePanelView, setSidePanelView] = useState<SidePanelView>(
        connectorFirst ? SidePanelView.CONNECTOR_WIZARD : SidePanelView.NODE_LIST
    );
    const [categories, setCategories] = useState<PanelCategory[]>([]);
    const wizardBackRef = useRef<(() => void) | undefined>(undefined);
    const connectorRef = useRef<AvailableNode | undefined>(undefined);
    const [selectedNodeCodeData, setSelectedNodeCodeData] = useState<CodeData>(undefined);
    const [toolNodeId, setToolNodeId] = useState<string>(undefined);

    const functionNode = useRef<FunctionNode>(null);
    const flowNode = useRef<FlowNode>(null);

    const [loading, setLoading] = useState<boolean>(false);
    const [submittingTool, setSubmittingTool] = useState<boolean>(false);
    const [fields, setFields] = useState<FormField[]>(INITIAL_FIELDS);
    const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);
    const [showOAuthConfig, setShowOAuthConfig] = useState<boolean>(false);

    const targetRef = useRef<LineRange>(
        dependencyMode && agentNode?.codedata?.lineRange
            ? { startLine: agentNode.codedata.lineRange.startLine, endLine: agentNode.codedata.lineRange.endLine }
            : { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } }
    );
    const [depClientType, setDepClientType] = useState<string>("");
    const [depImports, setDepImports] = useState<{ [prefix: string]: string }>({});
    const [depName, setDepName] = useState<string>("");
    const [depNameError, setDepNameError] = useState<string>("");
    const [depSaving, setDepSaving] = useState<boolean>(false);
    const [depConnectorLoading, setDepConnectorLoading] = useState<boolean>(false);
    const [connectionMethod, setConnectionMethod] = useState<"dependency" | "agent">("dependency");
    const [configuredConnector, setConfiguredConnector] = useState<AvailableNode>();
    const [dependencyConnector, setDependencyConnector] = useState<AvailableNode>();
    const [connectionModalDirection, setConnectionModalDirection] = useState<"forward" | "backward">("forward");
    const [shouldAnimateConnectionStep, setShouldAnimateConnectionStep] = useState<boolean>(false);
    const addedDepNamesRef = useRef<string[]>([]);
    const addedAgentConnectionNamesRef = useRef<string[]>([]);
    const pendingDependencyRefreshRef = useRef<boolean>(false);
    const initialCategoriesRef = useRef<PanelCategory[]>([]);
    const selectedNodeRef = useRef<AvailableNode>(undefined);
    const agentFilePath = useRef<string>(Utils.joinPath(URI.file(projectPath), agentNode?.codedata?.lineRange?.fileName || "agents.bal").fsPath);
    const functionFilePath = useRef<string>(Utils.joinPath(URI.file(projectPath), "functions.bal").fsPath);
    const parameterFieldsRef = useRef<ToolParameterItem[]>([]);
    const oauthConfigPropertiesRef = useRef<{ key: string; property: Property }[]>([]);
    const isSelectingNodeRef = useRef<boolean>(false);
    // Names of existing module functions offered in the approval-predicate picker. Source of truth
    // for the pick-vs-create decision at submit: a name in here is referenced as-is; a name NOT in
    // here (free-typed) signals the LS to scaffold a new correctly-signed predicate.
    const compatibleApprovalFunctionsRef = useRef<string[]>([]);

    const handleCreateNode = useCreateNode(
        agentFilePath.current,
        targetRef.current,
        () => { void fetchNodes(true); },
        { preferModal: true }
    );

    // Create custom diagnostic filter for Tool Input parameters
    const customDiagnosticFilter = useCallback((diagnostics: Diagnostic[]) => {
        if (!parameterFieldsRef.current || parameterFieldsRef.current.length === 0) {
            return diagnostics;
        }
        const toolInputs = parameterFieldsRef.current.map(param => ({ type: param.formValues.type, variable: param.formValues.variable }));
        return filterToolInputSymbolDiagnostics(diagnostics, toolInputs);
    }, []);

    useEffect(() => {
        fetchNodes();
    }, []);

    const hasAutoTriggered = useRef(false);
    useEffect(() => {
        if (mode === NewToolSelectionMode.CUSTOM_TOOL && !loading && !hasAutoTriggered.current) {
            hasAutoTriggered.current = true;
            handleOnAddFunction(MACHINE_VIEW.BIAgentToolForm, DIRECTORY_MAP.AGENT_TOOL);
        }
    }, [loading]);

    useEffect(() => {
        if (sidePanelView === SidePanelView.TOOL_FORM) {
            onViewChange?.(SidePanelView.TOOL_FORM, () => {
                const target = connectorFirst ? SidePanelView.CONNECTOR_WIZARD : SidePanelView.NODE_LIST;
                resetToolForm();
                setSidePanelView(target);
                onViewChange?.(target, connectorFirst ? wizardBackRef.current : undefined);
            });
        } else if (sidePanelView === SidePanelView.CONNECTOR_WIZARD) {
            onViewChange?.(SidePanelView.CONNECTOR_WIZARD, wizardBackRef.current);
        } else {
            onViewChange?.(SidePanelView.NODE_LIST);
        }
    }, [sidePanelView]);

    const resetToolForm = () => {
        setFields(INITIAL_FIELDS);
        setRecordTypeFields([]);
        setShowOAuthConfig(false);
        connectorRef.current = undefined;
        flowNode.current = null;
        functionNode.current = null;
        oauthConfigPropertiesRef.current = [];
        parameterFieldsRef.current = [];
    };

    const getImplementationString = (codeData: CodeData | undefined): string => {
        if (!codeData) {
            return "";
        }
        const receiver = codeData.parentSymbol
            || connectorRef.current?.metadata?.label
            || codeData.object
            || codeData.module
            || "";
        switch (codeData.node) {
            case RESOURCE_ACTION_CALL:
                return `${receiver} -> ${codeData.symbol} ${displayResourcePath(codeData.resourcePath)}`;
            case REMOTE_ACTION_CALL:
                return `${receiver} -> ${codeData.symbol}`;
            case FUNCTION_CALL:
                return `${codeData.symbol}`;
            case METHOD_CALL:
                return `${receiver} -> ${codeData.symbol}`;
            default:
                return "";
        }
    };

    // Use effects to refresh the panel
    useEffect(() => {
        rpcClient.onParentPopupSubmitted((parent: ParentPopupData) => {
            console.log(">>> on parent popup submitted", parent);
            if (parent.artifactType === DIRECTORY_MAP.AGENT_TOOL && parent.recentIdentifier) {
                onAgentToolCreated?.(parent.recentIdentifier);
                return;
            }
            if (mode === NewToolSelectionMode.CUSTOM_TOOL && parent.artifactType === DIRECTORY_MAP.AGENT_TOOL) {
                onCancel?.();
                return;
            }
            setLoading(true);
            fetchNodes();
        });
    }, [rpcClient]);

    const fetchNodes = async (silent = false) => {
        const settleLoading = () => { if (!silent) setLoading(false); };
        if (!silent) setLoading(true);

        if (mode === NewToolSelectionMode.CUSTOM_TOOL) {
            settleLoading();
            return;
        }

        // FUNCTION mode: skip getAvailableNodes entirely — connections are not needed
        if (mode === NewToolSelectionMode.FUNCTION) {
            try {
                const filteredFunctions = await handleSearchFunction("", FUNCTION_TYPE.REGULAR, false);
                const categories = reorderFunctionCategories(filteredFunctions || []);
                setCategories(categories);
                initialCategoriesRef.current = categories;
            } catch { } finally {
                settleLoading();
            }
            return;
        }

        try {
            const getNodeRequest: BIAvailableNodesRequest = {
                position: targetRef.current.startLine,
                filePath: agentFilePath.current,
                // Need to revisit the logic and ensure it's consistent before enabling this filter
                // queryMap: {
                //     "checkAgentToolCompatibility": "true"
                // }
            };
            const response = await rpcClient.getBIDiagramRpcClient().getAvailableNodes(getNodeRequest);
            if (!response.categories) {
                console.error(">>> Error getting available nodes", response);
                return;
            }
            const connectionsCategory = response.categories.filter(
                (item) => item.metadata.label === "Connections"
            ) as Category[];
            // remove connections which names start with _ underscore or are not tool compatible
            if (connectionsCategory.at(0)?.items) {
                let filteredConnectionsCategory = connectionsCategory
                    .at(0)
                    ?.items.filter((item) => !item.metadata.label.startsWith("_"));
                // filter out tool-incompatible nodes within each sub-category
                filteredConnectionsCategory?.forEach((subCategory) => {
                    if ("items" in subCategory && subCategory.items) {
                        subCategory.items = subCategory.items.filter((node) =>
                            String((node as AvailableNode).codedata?.data?.agentToolCompatible) !== "false"
                        );
                    }
                });
                if (dependencyMode) {
                    const connectionNames = new Set([
                        ...connectionDependency.connectionFieldNames,
                        ...addedDepNamesRef.current,
                        ...addedAgentConnectionNamesRef.current,
                    ]);
                    filteredConnectionsCategory = filteredConnectionsCategory?.filter((subCategory) =>
                        connectionNames.has(getConnectionFieldName(subCategory.metadata.label))
                    );
                    filteredConnectionsCategory?.forEach((subCategory) => {
                        subCategory.metadata.label = getConnectionFieldName(subCategory.metadata.label);
                    });
                }
                connectionsCategory.at(0).items = filteredConnectionsCategory;

            }
            const convertedCategories = convertBICategoriesToSidePanelCategories(connectionsCategory);
            if (dependencyMode) {
                if (!convertedCategories.some((category) => category.title === "Connections")) {
                    convertedCategories.unshift({
                        title: "Connections",
                        description: "No connections available. Click below to add a connection.",
                        items: [],
                    });
                }
                convertedCategories.forEach((category) => {
                    if (category.title === "Connections" && category.items.length === 0) {
                        category.description = "No connections available. Click below to add a connection.";
                    }
                    category.items.forEach((item) => {
                        if ("title" in item) {
                            const connectionName = getConnectionFieldName(item.title);
                            if (connectionDependency.connectionOrigins[connectionName]) {
                                item.origin = connectionDependency.connectionOrigins[connectionName];
                            }
                        }
                    });
                });
            }
            console.log("convertedCategories", convertedCategories);

            let filteredCategories: PanelCategory[] = convertedCategories;

            // ALL mode: also fetch functions — CONNECTION mode only needs connections
            if (mode !== NewToolSelectionMode.CONNECTION) {
                const filteredFunctions = await handleSearchFunction("", FUNCTION_TYPE.REGULAR, false);
                filteredCategories = convertedCategories.concat(reorderFunctionCategories(filteredFunctions));
            }

            setCategories(filteredCategories);
            initialCategoriesRef.current = filteredCategories;
        } finally {
            settleLoading();
        }
    };

    useEffect(() => {
        if (!dependencyMode || !agentNode?.codedata?.lineRange) {
            return;
        }
        const newRange = agentNode.codedata.lineRange;
        const cur = targetRef.current;
        const sameRange = cur
            && cur.startLine?.line === newRange.startLine.line
            && cur.startLine?.offset === newRange.startLine.offset
            && cur.endLine?.line === newRange.endLine.line
            && cur.endLine?.offset === newRange.endLine.offset;
        if (!sameRange) {
            targetRef.current = { startLine: newRange.startLine, endLine: newRange.endLine };
        }
        if (!pendingDependencyRefreshRef.current) {
            return;
        }
        pendingDependencyRefreshRef.current = false;
        void fetchNodes().then(() => {
            setDepSaving(false);
            setConfiguredConnector(undefined);
            setDependencyConnector(undefined);
            setSidePanelView(SidePanelView.NODE_LIST);
        });
    }, [agentNode, dependencyMode]);

    const handleSearchFunction = async (
        searchText: string,
        functionType: FUNCTION_TYPE,
        isSearching: boolean = true
    ) => {
        if (isSearching && !searchText) {
            setCategories(initialCategoriesRef.current); // Reset the categories list when the search input is empty
            return;
        }
        const request: BISearchRequest = {
            position: {
                startLine: targetRef.current.startLine,
                endLine: targetRef.current.endLine,
            },
            filePath: agentFilePath.current,
            queryMap: searchText.trim()
                ? {
                    q: searchText,
                    limit: 12,
                    offset: 0,
                    includeAvailableFunctions: "true",
                }
                : undefined,
            searchKind: "FUNCTION",
        };
        const response = await rpcClient.getBIDiagramRpcClient().search(request);

        const filteredResponse = response.categories.filter((category) => {
            return category.metadata.label !== "Agent Tools";
        });

        // Remove agent tool functions from integration category
        const currentIntegrationCategory = filteredResponse[0];
        if (currentIntegrationCategory && Array.isArray(currentIntegrationCategory.items)) {
            currentIntegrationCategory.items = currentIntegrationCategory.items.filter((item) => {
                return !(item.metadata?.data as NodeMetadata)?.isAgentTool;
            });
        }

        if (isSearching && searchText) {
            setCategories(ensureStandardLibModules(reorderFunctionCategories(convertFunctionCategoriesToSidePanelCategories(filteredResponse, functionType))));
            return;
        }
        if (!response || !filteredResponse) {
            return [];
        }
        return ensureStandardLibModules(convertFunctionCategoriesToSidePanelCategories(filteredResponse, functionType));
    };

    const isResultTypeField = (field: FormField) =>
        field.key === "type"
        || field.key === "targetType"
        || field.key === "rowType"
        || field.codedata?.kind === "PARAM_FOR_TYPE_INFER"
        || getPrimaryInputType(field.types)?.fieldType === "TYPE";

    const buildGroupedInputFields = (toolInputFields: FormField[], parameterFields: FormField[]): FormField[] =>
        [
            buildIncludeContextField(TOOL_INPUT_GROUP) as FormField,
            ...toolInputFields,
            ...parameterFields.map((field) => ({
                ...field,
                value: typeof field.value === 'string' ? field.value.replace(/^\$/, '') : field.value,
            })),
        ].map((field) => ({
            ...field,
            group: isResultTypeField(field) ? RESULT_TYPE_GROUP : TOOL_INPUT_GROUP,
            advanced: false,
        }));

    // Fetch the project's own module-level functions (excluding the tool's own function, when it is
    // one — connection-based tools have no local function to exclude) as approval-predicate
    // candidates. Reuses the FUNCTION search with an empty queryMap, which returns the current
    // module's functions; stdlib/imported/agent-tool categories are filtered out by the collector.
    // Shared by both the "Use Function" and "Use Connection" tool-creation paths. Return-type/
    // signature compatibility is verified by the compiler after generation.
    // Returns `null` (rather than `[]`) when the fetch itself fails, so callers can tell "search
    // failed" apart from "this project has no eligible functions" and fall back to the plain
    // checkbox instead of silently offering a picker backed by an empty list. See
    // formUtils.buildRequiresApprovalField for why that distinction matters.
    const fetchCompatibleApprovalFunctions = async (toolFunctionSymbol?: string): Promise<string[] | null> => {
        try {
            const request: BISearchRequest = {
                position: {
                    startLine: targetRef.current.startLine,
                    endLine: targetRef.current.endLine,
                },
                filePath: agentFilePath.current,
                queryMap: undefined,
                searchKind: "FUNCTION",
            };
            const response = await rpcClient.getBIDiagramRpcClient().search(request);
            const names = new Set<string>();
            collectLocalFunctionNames((response?.categories ?? []) as (Category | AvailableNode)[], names);
            if (toolFunctionSymbol) {
                names.delete(toolFunctionSymbol);
            }
            return Array.from(names);
        } catch (error) {
            console.error(">>> Error fetching compatible approval functions", error);
            return null;
        }
    };

    const loadFunctionCallFields = async (node: AvailableNode, options?: { suggestedToolName?: string }): Promise<void> => {
        try {
            const functionNodeResponse = await rpcClient.getBIDiagramRpcClient().getFunctionNode({
                functionName: node.codedata.symbol,
                fileName: functionFilePath.current,
                projectPath: projectPath,
            });

            const funcDef = functionNodeResponse.functionDefinition;
            functionNode.current = funcDef;

            let toolInputFields: FormField[] = [];
            if (funcDef?.properties !== undefined) {
                funcDef.properties.parameters.metadata.label = "Tool Inputs";
                funcDef.properties.parameters.metadata.description = "Define the inputs the agent must provide when invoking this tool.";
                toolInputFields = convertConfig(funcDef.properties, ["functionName", "functionNameDescription", "isIsolated", "type", "typeDescription", "isPublic"]);
            }

            const functionNodeTemplate = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                position: funcDef?.codedata.lineRange.startLine || { line: 0, offset: 0 },
                filePath: functionFilePath.current,
                id: node.codedata,
            });

            // Remove imports from optional+advanced properties to avoid unnecessary imports in genTool
            if (functionNodeTemplate.flowNode?.properties) {
                for (const key of Object.keys(functionNodeTemplate.flowNode.properties)) {
                    const prop = (functionNodeTemplate.flowNode.properties as Record<string, any>)[key];
                    if (prop.optional && prop.advanced && prop.imports) {
                        delete prop.imports;
                    }
                }
            }

            let functionParameterFields: FormField[] = [];
            if (toolInputFields.length === 0 && functionNodeTemplate.flowNode?.properties) {
                functionParameterFields = convertConfig(functionNodeTemplate.flowNode.properties, ["variable"], false);
                toolInputFields = createToolInputFields(prepareToolInputFields(functionParameterFields));
                functionNode.current = functionNodeTemplate.flowNode as FunctionNode;
            } else if (functionNodeTemplate.flowNode?.properties) {
                functionParameterFields = convertConfig(functionNodeTemplate.flowNode.properties, ["variable"], false);
                functionParameterFields.forEach((field, idx) => {
                    if (getPrimaryInputType(field.types)?.fieldType === "TYPE") {
                        functionParameterFields[idx].documentation = "The data type this tool will return to the agent.";
                        return;
                    }
                    field.label = `${field.label} Mapping`;
                    if (field.optional == false) {
                        field.value = getPrimaryInputType(field.types)?.fieldType === "REPEATABLE_LIST"
                            ? `[${field.key}]` : field.key;
                    }
                });
            }

            const templateDescription = stripCodeFences(functionNodeTemplate.flowNode?.metadata?.description || "");

            const position = funcDef?.codedata.lineRange.startLine || { line: 0, offset: 0 };
            const oauthProperties = await fetchOAuthConfigProperties(rpcClient, functionFilePath.current, position);
            oauthConfigPropertiesRef.current = oauthProperties;
            const oauthFields = buildOAuthFields(oauthProperties);
            setShowOAuthConfig(oauthFields.length > 0);

            const nodeRecordTypeFields = functionNodeTemplate.flowNode?.properties
                ? extractRecordTypeFields(functionNodeTemplate.flowNode.properties)
                : [];
            const oauthRecordTypeFields = extractRecordTypeFieldsFromEntries(oauthProperties);
            setRecordTypeFields([...nodeRecordTypeFields, ...oauthRecordTypeFields]);

            // Build the approval-predicate picker: fetch the project's module-level functions and keep
            // the boolean-returning ones as candidates. Injected into the "Requires Approval" control's
            // "On" branch so the picker sits under the checkbox; free-typed names drive the create path.
            const approvalCandidates = await fetchCompatibleApprovalFunctions(node.codedata?.symbol);
            compatibleApprovalFunctionsRef.current = approvalCandidates ?? [];

            setFields((prevFields) => [
                ...prevFields.map((field) => {
                    if (field.key === "description") {
                        return { ...field, value: templateDescription };
                    }
                    if (field.key === "name" && options?.suggestedToolName) {
                        return { ...field, value: options.suggestedToolName };
                    }
                    if (field.key === "requiresApproval") {
                        return buildRequiresApprovalField(field, approvalCandidates);
                    }
                    return field;
                }),
                ...buildGroupedInputFields(toolInputFields, functionParameterFields),
                ...oauthFields,
            ]);
        } catch (error) {
            console.error(">>> Error fetching function node or template", error);
        }
    };

    const loadConnectionCallFields = async (
        node: AvailableNode,
        options?: { connectionName?: string; suggestedToolName?: string; connector?: AvailableNode }
    ): Promise<void> => {
        try {
            const nodeTemplate = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                position: { line: 0, offset: 0 },
                filePath: agentFilePath.current,
                id: node.codedata,
            });

            const connectionProperty = nodeTemplate.flowNode?.properties?.connection as Property | undefined;
            if (options?.connectionName && connectionProperty) {
                connectionProperty.value = options.connectionName;
            }

            if (nodeTemplate.flowNode) {
                // Remove imports from optional+advanced properties to avoid unnecessary imports in genTool
                if (nodeTemplate.flowNode.properties) {
                    for (const key of Object.keys(nodeTemplate.flowNode.properties)) {
                        const prop = (nodeTemplate.flowNode.properties as Record<string, any>)[key];
                        if (prop.optional && prop.advanced && prop.imports) {
                            delete prop.imports;
                        }
                    }
                }
                flowNode.current = nodeTemplate.flowNode;
            } else {
                console.error("Node template flowNode not found", { response: nodeTemplate });
            }

            const nodeParameterFields = nodeTemplate.flowNode?.properties
                ? convertConfig(nodeTemplate.flowNode.properties)
                : [];

            const toolInputFields = createToolInputFields(prepareToolInputFields(nodeParameterFields));
            let connectionField: FormField | undefined;
            if (options?.connector) {
                const connectionIndex = nodeParameterFields.findIndex((field) => field.key === "connection");
                const ballerinaType = getPrimaryInputType(
                    nodeParameterFields[connectionIndex]?.types
                )?.ballerinaType;
                connectionField = buildConnectionSelectField(
                    options.connector.codedata,
                    ballerinaType,
                    options.connectionName ?? String(connectionProperty?.value ?? "")
                ) as unknown as FormField;
                if (connectionIndex >= 0) {
                    nodeParameterFields.splice(connectionIndex, 1);
                }
            }
            const templateDescription = stripCodeFences(
                nodeTemplate.flowNode?.metadata?.description || node.metadata?.description || ""
            );
            const oauthProperties = await fetchOAuthConfigProperties(rpcClient, agentFilePath.current);
            oauthConfigPropertiesRef.current = oauthProperties;
            const oauthFields = buildOAuthFields(oauthProperties);
            setShowOAuthConfig(oauthFields.length > 0);

            const nodeRecordTypeFields = nodeTemplate.flowNode?.properties
                ? extractRecordTypeFields(nodeTemplate.flowNode.properties)
                : [];
            const oauthRecordTypeFields = extractRecordTypeFieldsFromEntries(oauthProperties);
            setRecordTypeFields([...nodeRecordTypeFields, ...oauthRecordTypeFields]);

            const groupedInputFields = buildGroupedInputFields(toolInputFields, nodeParameterFields);

            // Same approval-predicate picker as the function-call path: fetch the project's
            // module-level functions and inject them into the "Requires Approval" control.
            const approvalCandidates = await fetchCompatibleApprovalFunctions();
            compatibleApprovalFunctionsRef.current = approvalCandidates ?? [];

            setFields((prevFields) => {
                const baseFields = prevFields.map((field) => {
                    if (field.key === "description") {
                        return { ...field, value: templateDescription };
                    }
                    if (field.key === "name" && options?.suggestedToolName) {
                        return { ...field, value: options.suggestedToolName };
                    }
                    if (field.key === "requiresApproval") {
                        return buildRequiresApprovalField(field, approvalCandidates);
                    }
                    return field;
                });
                // The connection outranks the approval gate here, so it goes first.
                const approvalField = baseFields.find((field) => field.key === "requiresApproval");
                return [
                    ...baseFields.filter((field) => field.key !== "requiresApproval"),
                    ...(connectionField ? [connectionField] : []),
                    ...(approvalField ? [approvalField] : []),
                    ...groupedInputFields,
                    ...oauthFields,
                ];
            });
        } catch (error) {
            console.error(">>> Error fetching node template", error);
        }
    };

    const suggestToolNameForAction = (codedata: CodeData | undefined): string | undefined => {
        const symbol = codedata?.symbol;
        if (!symbol) {
            return undefined;
        }
        const seed = codedata?.node === RESOURCE_ACTION_CALL && codedata?.resourcePath
            ? resourceToolNameSeed(symbol, codedata.resourcePath)
            : symbol;
        return suggestToolName(seed, getExistingToolNames(agentNode));
    };

    const handleOnSelectNode = async (nodeId: string, metadata?: any) => {
        if (isSelectingNodeRef.current) return;
        isSelectingNodeRef.current = true;
        setLoading(true);

        try {
            const { node } = metadata as { node: AvailableNode };
            setToolNodeId(nodeId);
            selectedNodeRef.current = node;
            setSelectedNodeCodeData(node.codedata);

            if (nodeId === FUNCTION_CALL) {
                await loadFunctionCallFields(node, {
                    suggestedToolName: suggestToolNameForAction(node.codedata),
                });
            } else if (nodeId === REMOTE_ACTION_CALL || nodeId === RESOURCE_ACTION_CALL || nodeId === METHOD_CALL) {
                await loadConnectionCallFields(node, {
                    suggestedToolName: suggestToolNameForAction(node.codedata),
                });
            }

            setSidePanelView(SidePanelView.TOOL_FORM);
        } finally {
            setLoading(false);
            isSelectingNodeRef.current = false;
        }
    };

    const handleWizardSelect = async (selection: ActionSelection) => {
        if (isSelectingNodeRef.current) return;
        isSelectingNodeRef.current = true;
        setLoading(true);

        try {
            const { action, connector, connectionName } = selection;
            connectorRef.current = connector;

            setToolNodeId(action.codedata.node);
            selectedNodeRef.current = action;
            setSelectedNodeCodeData(action.codedata);

            await loadConnectionCallFields(action, {
                connectionName,
                connector,
                suggestedToolName: suggestToolNameForAction(action.codedata),
            });

            setSidePanelView(SidePanelView.TOOL_FORM);
        } finally {
            setLoading(false);
            isSelectingNodeRef.current = false;
        }
    };

    const handleOnAddConnection = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.AddConnectionWizard,
                documentUri: agentFilePath.current,
            },
            isPopup: true,
        });
    };

    const suggestDependencyName = (prefix: string): string => {
        const base = `${prefix}Client`;
        const existing = new Set([
            ...(connectionDependency?.reservedNames ?? []),
            ...addedDepNamesRef.current,
            ...addedAgentConnectionNamesRef.current,
        ]);
        if (!existing.has(base)) return base;
        let n = 2;
        while (existing.has(`${base}${n}`)) n++;
        return `${base}${n}`;
    };

    const validateDependencyName = (name: string): string => {
        const trimmed = name.trim();
        if (!trimmed) return "Name is required.";
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) return "Not a valid Ballerina identifier.";
        if (BALLERINA_RESERVED_WORDS.has(trimmed)) return `"${trimmed}" is a reserved Ballerina keyword.`;
        const existing = new Set([
            ...(connectionDependency?.reservedNames ?? []),
            ...addedDepNamesRef.current,
            ...addedAgentConnectionNamesRef.current,
        ]);
        if (existing.has(trimmed)) return "This name is already used by the agent definition.";
        return "";
    };

    const navigateConnectionModal = (view: SidePanelView, direction: "forward" | "backward" = "forward") => {
        setShouldAnimateConnectionStep(true);
        setConnectionModalDirection(direction);
        setSidePanelView(view);
    };

    const handleAddDependency = () => {
        setShouldAnimateConnectionStep(false);
        setSidePanelView(SidePanelView.CONNECTION_METHOD);
    };

    const handleCreateConnectionInAgent = () => {
        setConnectionMethod("agent");
        navigateConnectionModal(SidePanelView.CONNECTOR_SELECT);
    };

    const handleSelectDependencyConnector = async (connector: AvailableNode) => {
        if (!connector.codedata) return;
        setDependencyConnector(connector);
        setDepConnectorLoading(true);
        navigateConnectionModal(SidePanelView.DEPENDENCY_FORM);
        try {
            await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                position: targetRef.current.startLine,
                filePath: agentFilePath.current,
                id: connector.codedata,
            });
            const cd = connector.codedata;
            const prefix = (cd.module || "").split(".").pop() || cd.module || "";
            const clientClass = cd.object || "Client";
            setDepClientType(`${prefix}:${clientClass}`);
            setDepImports({ [prefix]: `${cd.org}/${cd.module}` });
            setDepName(suggestDependencyName(prefix));
            setDepNameError("");
        } catch {
            navigateConnectionModal(SidePanelView.CONNECTOR_SELECT, "backward");
        } finally {
            setDepConnectorLoading(false);
        }
    };

    const handleSaveDependency = async () => {
        const error = validateDependencyName(depName);
        if (error) {
            setDepNameError(error);
            return;
        }
        setDepSaving(true);
        const dependencyName = depName.trim();
        pendingDependencyRefreshRef.current = true;
        addedDepNamesRef.current.push(dependencyName);
        try {
            const field = {
                isPrivate: true,
                isFinal: true,
                codedata: { lineRange: connectionDependency.classLineRange },
                type: {
                    metadata: { label: "Client Type", description: "The connection client type" },
                    enabled: true, editable: false, value: depClientType,
                    isType: true, optional: false, advanced: false, addNewButton: false,
                    imports: depImports,
                    types: [{ fieldType: "TYPE", selected: false }],
                },
                name: {
                    metadata: { label: "Input Name", description: "The name of the injected client" },
                    enabled: true, editable: true, value: dependencyName,
                    isType: false, optional: false, advanced: false, addNewButton: false,
                    types: [{ fieldType: "IDENTIFIER", selected: false }],
                },
                defaultValue: {
                    metadata: { label: "Default Value", description: "" },
                    enabled: false, editable: true, value: "",
                    isType: false, optional: false, advanced: false, addNewButton: false,
                    types: [{ fieldType: "EXPRESSION", selected: true }],
                },
                enabled: true, editable: false, optional: false, advanced: false,
            } as unknown as FieldType;

            await rpcClient.getBIDiagramRpcClient().createClassDependency({
                filePath: connectionDependency.filePath,
                field,
                classLineRange: connectionDependency.classLineRange,
            });
        } catch {
            pendingDependencyRefreshRef.current = false;
            addedDepNamesRef.current = addedDepNamesRef.current.filter((name) => name !== dependencyName);
            setDepSaving(false);
            setDepNameError("Unable to add the connection parameter. Try again.");
        }
    };

    const handleSelectAgentConnectionConnector = (connector: AvailableNode) => {
        if (!connector.codedata) {
            return;
        }
        setConfiguredConnector(connector);
        navigateConnectionModal(SidePanelView.CONNECTION_CONFIG);
    };

    const handleSaveAgentConnection = async (configuredConnection: FlowNode) => {
        const connectionName = String(configuredConnection.properties?.variable?.value ?? "");
        const error = validateDependencyName(connectionName);
        if (error) {
            throw new Error(error);
        }

        const connection = cloneDeep(configuredConnection);
        if (connection.properties?.scope) {
            connection.properties.scope.value = "Local";
            connection.properties.scope.hidden = true;
        }
        pendingDependencyRefreshRef.current = true;
        addedAgentConnectionNamesRef.current.push(connectionName);
        try {
            await rpcClient.getBIDiagramRpcClient().saveClassMember({
                filePath: connectionDependency.filePath,
                flowNode: connection,
                classLineRange: connectionDependency.classLineRange,
            });
        } catch (error) {
            pendingDependencyRefreshRef.current = false;
            addedAgentConnectionNamesRef.current = addedAgentConnectionNamesRef.current.filter((name) => name !== connectionName);
            throw error;
        }
    };

    const validateAgentConnectionField = (fieldKey: string, value: unknown): string | undefined => {
        if (fieldKey !== "variable") {
            return undefined;
        }
        return validateDependencyName(String(value ?? "")) || undefined;
    };

    const handleOnAddFunction = (view: MACHINE_VIEW, artifactType: DIRECTORY_MAP) => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: view,
                artifactType: artifactType,
            },
            isPopup: true,
        });
    };

    const updateToolParameters = (params: ToolParameterItem[], baseParams?: ToolParameters): ToolParameters => {
        const newToolParameters = baseParams ? cloneDeep(baseParams) : createToolParameters();
        const paramKeys = params.map((param: ToolParameterItem) => param.formValues.variable);

        if (newToolParameters.value && typeof newToolParameters.value === "object" && !Array.isArray(newToolParameters.value)) {
            // Remove keys that are no longer present
            Object.keys(newToolParameters.value).forEach((key) => {
                if (!paramKeys.includes(key)) {
                    delete (newToolParameters.value as ToolParametersValue)[key];
                }
            });

            // Add or update parameters
            paramKeys.forEach((key: string) => {
                const paramData = params.find((param: ToolParameterItem) => param.formValues.variable === key)?.formValues;
                const existingParam = (newToolParameters.value as ToolParametersValue)[key];

                if (existingParam?.value?.variable) {
                    existingParam.value.variable.value = paramData?.variable || key;
                    existingParam.value.parameterDescription.value = paramData?.parameterDescription || "";
                    existingParam.value.type.value = paramData?.type || "";
                } else {
                    (newToolParameters.value as ToolParametersValue)[key] = createDefaultParameterValue({
                        value: paramData?.variable || key,
                        parameterDescription: paramData?.parameterDescription,
                        type: paramData?.type,
                    });
                }
            });
        }
        return newToolParameters;
    };

    const handleToolSubmit = async (data: FormValues, formImports?: FormImports) => {
        if (submittingTool) {
            return;
        }
        // Safely convert name to camelCase, handling any input
        const name = data["name"] || "";
        const cleanName = name.trim().replace(/[^a-zA-Z0-9]/g, "") || "newTool";

        // HACK: Remove code blocks and new lines from description fields
        if (data.description) {
            data.description = stripCodeFencesInline(data.description);
        }

        console.log(">>> handleToolSubmit", { data });
        console.log(">>> toolNodeId", { toolNodeId });
        console.log(">>> functionNode", { functionNode });
        console.log(">>> flowNode", { flowNode });

        let toolParameters: ToolParameters | null = null;
        let clonedFunctionNode: FunctionNode | null = null;
        let clonedFlowNode: FlowNode | null = null;

        if (toolNodeId === FUNCTION_CALL && Array.isArray(data["parameters"])) {
            clonedFunctionNode = functionNode.current ? cloneDeep(functionNode.current) : null;
            const existingParameters = clonedFunctionNode?.properties?.parameters;
            toolParameters = updateToolParameters(data["parameters"], existingParameters as unknown as ToolParameters | undefined);

            if (existingParameters) {
                // User-defined function: update parameter values in the cloned function node
                const parametersValue = existingParameters.value;
                if (parametersValue && typeof parametersValue === "object" && !Array.isArray(parametersValue)) {
                    Object.keys(parametersValue).forEach((key) => {
                        const paramValue = data[key];
                        if ((parametersValue as ToolParametersValue)[key]?.value?.variable) {
                            (parametersValue as ToolParametersValue)[key].value.variable.value = paramValue;
                        }
                    });
                }
            } else if (clonedFunctionNode?.properties) {
                // Library function: the template flowNode has no parameters property,
                // so inject the constructed toolParameters so genTool can read it
                (clonedFunctionNode.properties as any).parameters = toolParameters;
            }

            // Update mapping field values from form data into the function node properties
            if (clonedFunctionNode?.properties) {
                const props = clonedFunctionNode.properties as Record<string, Property>;
                Object.keys(props).forEach((key) => {
                    if (key === "parameters") return; // already handled above
                    const formValue = data[key];
                    if (formValue !== undefined && props[key]) {
                        props[key] = { ...props[key], value: formValue };
                    }
                });
            }
        } else if (toolNodeId === REMOTE_ACTION_CALL || toolNodeId === RESOURCE_ACTION_CALL || toolNodeId === METHOD_CALL) {
            clonedFlowNode = flowNode.current ? cloneDeep(flowNode.current) : null;
            if (Array.isArray(data["parameters"])) {
                toolParameters = updateToolParameters(data["parameters"]);
            }

            // Update flowNode parameter values from data["parameters"]
            if (clonedFlowNode?.properties && typeof clonedFlowNode?.properties === "object" && !Array.isArray(clonedFlowNode?.properties)) {
                const newProperties = { ...clonedFlowNode.properties } as Record<string, Property>;
                Object.keys(newProperties).forEach((key) => {
                    const paramValue = data[key];
                    if (paramValue !== undefined && newProperties[key]) {
                        newProperties[key] = {
                            ...newProperties[key],
                            value: paramValue
                        };
                    }
                    // Update resourcePath for RESOURCE_ACTION_CALL nodes
                    if (toolNodeId === RESOURCE_ACTION_CALL) {
                        const resourcePathProperty = newProperties["resourcePath"];
                        if (resourcePathProperty) {
                            newProperties["resourcePath"] = updateResourcePathProperty(
                                resourcePathProperty,
                                key,
                                paramValue
                            );
                        }
                    }
                });
                clonedFlowNode.properties = newProperties as NodeProperties;
            }
        }

        if (clonedFlowNode?.properties?.variable?.value == "") {
            clonedFlowNode.properties.variable.value = flowNode.current?.properties?.variable?.value || cleanName + "Result";
        }

        const chosenConnection = String(
            data["connection"] ?? clonedFlowNode?.properties?.connection?.value ?? ""
        ).trim();

        // Inject OAuth client config into codedata.data.auth
        const targetNode = clonedFunctionNode || clonedFlowNode;
        if (targetNode && showOAuthConfig) {
            const config: Record<string, string> = {};
            for (const { key } of oauthConfigPropertiesRef.current) {
                const formValue = data[key];
                if (formValue !== undefined && formValue !== "") {
                    config[key] = String(formValue);
                }
            }
            if (Object.keys(config).length > 0) {
                targetNode.codedata.data = {
                    ...targetNode.codedata.data,
                    auth: JSON.stringify(config),
                };
            }
        }

        // Mark the tool as requiring human-in-the-loop approval. This rides along in codedata.data
        // (like `auth` above) and is rendered into the @ai:AgentTool annotation by the language
        // server. The gate is the checkbox itself, not the function field — unchecking it yields an
        // empty object, so a function picked earlier and left registered can't leak (buildApprovalToolData
        // reads the checkbox first), which matters since CheckBoxConditionalEditor doesn't clear the
        // "on"-state sub-field on uncheck.
        if (targetNode) {
            const approvalData = buildApprovalToolData(data, compatibleApprovalFunctionsRef.current);
            if (Object.keys(approvalData).length > 0) {
                targetNode.codedata.data = {
                    ...targetNode.codedata.data,
                    ...approvalData,
                };
            }
        }

        console.log(">>> toolParameters", { toolParameters });
        console.log(">>> clonedFunctionNode", { clonedFunctionNode });
        console.log(">>> clonedFlowNode", { clonedFlowNode });

        // Extract parameter type imports so they can be added after genTool
        const paramImports = formImports ? getImportsForProperty("parameters", formImports) : undefined;

        const toolModel: ExtendedAgentToolRequest = {
            toolName: cleanName,
            description: data["description"],
            includeContext: data[INCLUDE_CONTEXT_KEY] === true,
            selectedCodeData: selectedNodeCodeData,
            toolParameters: toolParameters,
            functionNode: clonedFunctionNode,
            flowNode: clonedFlowNode,
            parameterImports: paramImports,
            connectionName: chosenConnection || undefined,
        };
        setSubmittingTool(true);
        try {
            await onSubmit(toolModel);
        } finally {
            setSubmittingTool(false);
        }
    };

    const toolFormGroups = useMemo(() => buildToolFormGroups(fields), [fields]);

    let searchPlaceholder = "Search";
    let listDescription: string | undefined;
    if (mode === NewToolSelectionMode.CONNECTION) {
        searchPlaceholder = "Search connections";
    } else if (mode === NewToolSelectionMode.FUNCTION) {
        searchPlaceholder = "Search functions";
        listDescription =
            "Pick a function from your integration or from a library. " +
            "The function you choose becomes the tool.";
    }

    const isConnectionPopupOpen =
        sidePanelView === SidePanelView.CONNECTION_METHOD ||
        sidePanelView === SidePanelView.CONNECTOR_SELECT ||
        sidePanelView === SidePanelView.DEPENDENCY_FORM ||
        sidePanelView === SidePanelView.CONNECTION_CONFIG;
    const displayedCategories = dependencyMode && !categories.some((category) => category.title === "Connections")
        ? [{
            title: "Connections",
            description: "No connections available. Click below to add a connection.",
            items: [],
        }]
        : categories;

    return (
        <>
            {loading && (
                <LoaderContainer>
                    <RelativeLoader />
                </LoaderContainer>
            )}
            {connectorFirst && (
                <div
                    style={{
                        display: sidePanelView === SidePanelView.CONNECTOR_WIZARD && !loading ? "contents" : "none",
                    }}
                >
                    <ConnectorBrowser
                        filePath={agentFilePath.current}
                        target={targetRef.current.startLine}
                        existingConnectionCategories={categories}
                        connectorSet="GROUPED"
                        description="Pick an existing connection or a connector to browse its actions."
                        noActionsHint="You can still add it as a connection and create the tool from an action later."
                        onSelect={handleWizardSelect}
                        onStepChange={(step, goBack) => {
                            wizardBackRef.current = goBack;
                            onViewChange?.(
                                step === WizardStep.CONNECTOR_LIST
                                    ? SidePanelView.NODE_LIST
                                    : SidePanelView.CONNECTOR_WIZARD,
                                goBack
                            );
                        }}
                    />
                </div>
            )}
            {!loading && !connectorFirst && sidePanelView !== SidePanelView.TOOL_FORM
                && displayedCategories.length > 0 && (
                <NodeList
                    categories={displayedCategories}
                    onSelect={handleOnSelectNode}
                    onAddConnection={dependencyMode ? handleAddDependency : handleOnAddConnection}
                    connectionAddLabel={dependencyMode ? "Add Connection" : undefined}
                    onAddFunction={() => handleOnAddFunction(MACHINE_VIEW.BIFunctionForm, DIRECTORY_MAP.FUNCTION)}
                    onSearchTextChange={mode !== NewToolSelectionMode.CONNECTION ? (searchText) => handleSearchFunction(searchText, FUNCTION_TYPE.REGULAR, true) : undefined}
                    title={"Functions"}
                    description={listDescription}
                    searchPlaceholder={searchPlaceholder}
                    panelBodySx={{ height: "calc(100vh - 140px)" }}
                    alwaysCollapsedCategories={["Imported Functions"]}
                />
            )}
            {isConnectionPopupOpen && createPortal(
                <>
                    <PopupOverlay
                        sx={{
                            background: ThemeColors.SURFACE_CONTAINER,
                            opacity: 0.5,
                            zIndex: 2050,
                        }}
                    />
                    <AgentConnectionPopupContainer
                        $compact={sidePanelView === SidePanelView.CONNECTION_METHOD}
                        style={{ zIndex: 2051 }}
                    >
                        <ConnectionModalStep
                            key={sidePanelView}
                            $animate={shouldAnimateConnectionStep}
                            $direction={connectionModalDirection}
                        >
                            <PopupHeader>
                                {(sidePanelView === SidePanelView.CONNECTOR_SELECT ||
                                    sidePanelView === SidePanelView.DEPENDENCY_FORM ||
                                    sidePanelView === SidePanelView.CONNECTION_CONFIG) && (
                                        <BackButton
                                            appearance="icon"
                                            onClick={() => navigateConnectionModal(
                                                sidePanelView === SidePanelView.CONNECTOR_SELECT
                                                    ? SidePanelView.CONNECTION_METHOD
                                                    : SidePanelView.CONNECTOR_SELECT,
                                                "backward"
                                            )}
                                            disabled={depSaving || depConnectorLoading}
                                        >
                                            <Codicon name="arrow-left" />
                                        </BackButton>
                                    )}
                                <HeaderTitleContainer>
                                    <PopupTitle variant="h2">
                                        {sidePanelView === SidePanelView.CONNECTION_METHOD && "Add a Connection"}
                                        {sidePanelView === SidePanelView.CONNECTOR_SELECT && "Select a Connection"}
                                        {sidePanelView === SidePanelView.DEPENDENCY_FORM && "Add a Connection Parameter"}
                                        {sidePanelView === SidePanelView.CONNECTION_CONFIG && configuredConnector
                                            && `Configure ${configuredConnector.metadata.label}`}
                                    </PopupTitle>
                                    <PopupSubtitle variant="body2" sx={{ fontSize: "13px" }}>
                                        {sidePanelView === SidePanelView.CONNECTION_METHOD
                                            && "Choose how this agent will use this connection."}
                                        {sidePanelView === SidePanelView.CONNECTOR_SELECT
                                            && "Choose the type of connection your agent needs."}
                                        {sidePanelView === SidePanelView.DEPENDENCY_FORM
                                            && "Give this connection a name to use in your agent."}
                                        {sidePanelView === SidePanelView.CONNECTION_CONFIG
                                            && "Configure connection settings for this agent."}
                                    </PopupSubtitle>
                                </HeaderTitleContainer>
                                <CloseButton
                                    appearance="icon"
                                    onClick={() => setSidePanelView(SidePanelView.NODE_LIST)}
                                    disabled={depSaving || depConnectorLoading}
                                >
                                    <Codicon name="close" />
                                </CloseButton>
                            </PopupHeader>
                            {sidePanelView === SidePanelView.CONNECTION_METHOD && (
                                <ConnectionMethodOptions>
                                    {([
                                        {
                                            icon: "bi-connection",
                                            title: "Add a Connection Parameter",
                                            description: "Allow a connection to be provided when an agent is created.",
                                            onClick: () => {
                                                setConnectionMethod("dependency");
                                                navigateConnectionModal(SidePanelView.CONNECTOR_SELECT);
                                            },
                                        },
                                        {
                                            icon: "bi-settings",
                                            title: "Add a Built-in Connection",
                                            description: "Create and bundle this connection with the agent definition.",
                                            onClick: handleCreateConnectionInAgent,
                                        },
                                    ] as const).map(({ icon, title, description, onClick }) => (
                                        <ConnectionMethodCard key={title} onClick={onClick}>
                                            <ConnectionMethodIcon>
                                                <Icon name={icon} sx={{ fontSize: 24, width: 24, height: 24 }} />
                                            </ConnectionMethodIcon>
                                            <ConnectionMethodDetails>
                                                <ConnectionMethodTitle>{title}</ConnectionMethodTitle>
                                                <ConnectionMethodDescription>{description}</ConnectionMethodDescription>
                                            </ConnectionMethodDetails>
                                            <ConnectionMethodChevron>
                                                <Codicon name="chevron-right" />
                                            </ConnectionMethodChevron>
                                        </ConnectionMethodCard>
                                    ))}
                                </ConnectionMethodOptions>
                            )}
                            {sidePanelView === SidePanelView.CONNECTOR_SELECT && (
                                <PopupContent>
                                    <AddConnectionPopupContent
                                        projectPath={projectPath}
                                        fileName={agentFilePath.current}
                                        target={targetRef.current.startLine}
                                        onNavigateToOverview={() => undefined}
                                        handleSelectConnector={(connector) => {
                                            if (connectionMethod === "dependency") {
                                                handleSelectDependencyConnector(connector);
                                            } else {
                                                handleSelectAgentConnectionConnector(connector);
                                            }
                                        }}
                                        selectionOnly
                                    />
                                </PopupContent>
                            )}
                            {sidePanelView === SidePanelView.DEPENDENCY_FORM && (
                                <>
                                    <PopupContent>
                                        {depConnectorLoading ? (
                                            <PopupLoaderContainer>
                                                <RelativeLoader message="Loading connector package..." />
                                            </PopupLoaderContainer>
                                        ) : (
                                            <DependencyFormContainer>
                                                {dependencyConnector && (
                                                    <DependencyConnectorCard>
                                                        <DependencyConnectorIcon>
                                                            {dependencyConnector.metadata.icon ? (
                                                                <DependencyConnectorIconImage>
                                                                    <ConnectorIcon url={dependencyConnector.metadata.icon} />
                                                                </DependencyConnectorIconImage>
                                                            ) : (
                                                                <Codicon name="package" sx={{ fontSize: 32, width: 32, height: 32 }} />
                                                            )}
                                                        </DependencyConnectorIcon>
                                                        <DependencyConnectorContent>
                                                            <DependencyConnectorName>
                                                                {dependencyConnector.metadata.label}
                                                            </DependencyConnectorName>
                                                            <DependencyConnectorDescription
                                                                description={dependencyConnector.metadata.description || ""}
                                                            />
                                                        </DependencyConnectorContent>
                                                    </DependencyConnectorCard>
                                                )}
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        color: "var(--vscode-list-deemphasizedForeground)",
                                                        fontSize: "13px",
                                                    }}
                                                >
                                                    Connection details will be provided when this agent is used.
                                                </Typography>
                                                <ReadOnlyField>
                                                    <Typography variant="body3" sx={{ fontSize: "13px" }}>
                                                        Client Type
                                                    </Typography>
                                                    <ReadOnlyValue>{depClientType}</ReadOnlyValue>
                                                </ReadOnlyField>
                                                <TextField
                                                    label="Input Name"
                                                    value={depName}
                                                    errorMsg={depNameError}
                                                    onTextChange={(value: string) => { setDepName(value); setDepNameError(""); }}
                                                />
                                            </DependencyFormContainer>
                                        )}
                                    </PopupContent>
                                    {!depConnectorLoading && (
                                        <PopupFooter>
                                            <Button
                                                appearance="secondary"
                                                onClick={() => navigateConnectionModal(SidePanelView.CONNECTOR_SELECT, "backward")}
                                                disabled={depSaving}
                                            >
                                                Back
                                            </Button>
                                            <Button appearance="primary" onClick={handleSaveDependency} disabled={depSaving}>
                                                {depSaving ? "Adding..." : "Add Parameter"}
                                            </Button>
                                        </PopupFooter>
                                    )}
                                </>
                            )}
                            {sidePanelView === SidePanelView.CONNECTION_CONFIG && configuredConnector && (
                                <ConnectionConfigurationForm
                                    selectedConnector={configuredConnector}
                                    fileName={agentFilePath.current}
                                    target={targetRef.current.startLine}
                                    onClose={() => setSidePanelView(SidePanelView.NODE_LIST)}
                                    filteredCategories={[]}
                                    footerActionButton
                                    customValidator={validateAgentConnectionField}
                                    overrideFlowNode={(node) => {
                                        const connection = cloneDeep(node);
                                        if (connection.properties?.scope) {
                                            connection.properties.scope.value = "Local";
                                            connection.properties.scope.hidden = true;
                                        }
                                        connection.codedata.lineRange = {
                                            fileName: agentNode.codedata.lineRange.fileName,
                                            startLine: targetRef.current.startLine,
                                            endLine: targetRef.current.startLine,
                                        };
                                        return connection;
                                    }}
                                    onSaveConfiguredConnection={handleSaveAgentConnection}
                                />
                            )}
                        </ConnectionModalStep>
                    </AgentConnectionPopupContainer>
                </>,
                document.body
            )}
            {sidePanelView === SidePanelView.TOOL_FORM && (
                <ArtifactForm
                    preserveFieldOrder={false}
                    fileName={agentFilePath.current}
                    targetLineRange={ZERO_LINE_RANGE}
                    fields={fields}
                    recordTypeFields={recordTypeFields}
                    onSubmit={handleToolSubmit}
                    onCreateNode={handleCreateNode}
                    groups={toolFormGroups}
                    opensPrefilled
                    submitText={"Save Tool"}
                    isSaving={submittingTool}
                    helperPaneSide="left"
                    customDiagnosticFilter={customDiagnosticFilter}
                    onChange={(fieldKey, value) => {
                        if (fieldKey === "parameters") {
                            parameterFieldsRef.current = value as ToolParameterItem[];
                            return;
                        }
                    }}
                    injectedComponents={[
                        {
                            component: (
                                <ImplementationBadge title={getImplementationString(selectedNodeRef.current.codedata)}>
                                    {selectedNodeRef.current.metadata?.icon && (
                                        <img
                                            src={selectedNodeRef.current.metadata.icon}
                                            style={{ width: 14, height: 14 }}
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                        />
                                    )}
                                    {getImplementationString(selectedNodeRef.current.codedata)}
                                </ImplementationBadge>
                            ),
                            index: 0,
                        },
                    ]}
                />
            )}
        </>
    );
}
