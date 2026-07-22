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

import { cloneDeep, debounce } from "lodash";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Category as PanelCategory } from "@wso2/ballerina-side-panel";
import styled from "@emotion/styled";
import { MemoizedDiagram, GetHelperPaneFunction } from "@wso2/bi-diagram";
import {
    BIAvailableNodesRequest,
    Flow,
    FlowNode,
    FunctionNode,
    Branch,
    Category,
    AvailableNode,
    LineRange,
    EVENT_TYPE,
    VisualizerLocation,
    CurrentBreakpointsResponse as BreakpointInfo,
    ParentPopupData,
    ExpressionProperty,
    TRIGGER_CHARACTERS,
    TriggerCharacter,
    TextEdit,
    ParentMetadata,
    UpdatedArtifactsResponse,
    NodePosition,
    LinePosition,
    ToolData,
    NodeMetadata,
    MACHINE_VIEW,
    FOCUS_FLOW_DIAGRAM_VIEW,
    FocusFlowDiagramView
} from "@wso2/ballerina-core";
import { PanelContainer } from "@wso2/ballerina-side-panel";
import { ConnectionConfig, ConnectionCreator, ConnectionSelectionList } from "../../../components/ConnectionSelector";
import { FlowNodeForm } from "../Forms/FlowNodeForm";
import { MemoryManagerConfig } from "../AIChatAgent/MemoryManagerConfig";
import { AddTool } from "../AIChatAgent/AddTool";
import { NewTool, NewToolSelectionMode } from "../AIChatAgent/NewTool";
import { UseAgentTool } from "../AIChatAgent/UseAgentTool";
import { UseAgentToolForm } from "../AIChatAgent/UseAgentToolForm";
import { AddMcpServer } from "../AIChatAgent/AddMcpServer";
import { findFlowNode, findFlowNodeByModuleVarName, goToAgentFromRunNode, refreshNodeLineRangeFromArtifacts, removeToolFromAgentNode, findAgentNodeFromAgentCallNode } from "../AIChatAgent/utils";
import { buildAgentRenderNode } from "./agent";
import { AgentPromptDisplay } from "./AgentPromptDisplay";

import {
    addDraftNodeToDiagram,
    convertBalCompletion,
    convertBICategoriesToSidePanelCategories,
    getFlowNodeForNaturalFunction,
    calculateExpressionOffsets,
    updateLineRange,
} from "../../../utils/bi";
import { getNodeTemplateForConnection } from "../FlowDiagram/utils";
import { View, ProgressRing, ProgressIndicator, ThemeColors, CompletionItem } from "@wso2/ui-toolkit";
import { EXPRESSION_EXTRACTION_REGEX } from "../../../constants";
import { ConnectionKind } from "../../../components/ConnectionSelector";
import { SidePanelView } from "../FlowDiagram/PanelManager";
import { PanelOverlayProvider } from "../FlowDiagram/context/PanelOverlayContext";
import { PanelOverlayRenderer } from "../FlowDiagram/PanelOverlayRenderer";
import { createPromptHelperPane } from "./utils";


const Container = styled.div<{ embedded?: boolean }>`
    width: 100%;
    height: ${(props: { embedded?: boolean }) => props.embedded ? "100%" : "calc(100vh - 50px)"};
`;

const SpinnerContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

export interface BIFocusFlowDiagramProps {
    projectPath: string;
    filePath: string;
    view?: FocusFlowDiagramView;
    /** When rendering embedded (e.g. in a drawer), provide the position so the component
     *  doesn't need to fetch it from the VS Code extension state. */
    position?: NodePosition;
    embedded?: boolean;
    onUpdate: () => void;
    onReady: (fileName: string, parentMetadata?: ParentMetadata, position?: NodePosition) => void;
}

// Side panels shown for the AGENT focus view (in addition to the shared connection panel).
type AgentPanel =
    | "NONE"
    | "FORM"
    | "MEMORY"
    | "ADD_TOOL"
    | "NEW_TOOL_CUSTOM"
    | "NEW_TOOL_CONNECTION"
    | "NEW_TOOL_FUNCTION"
    | "NEW_TOOL_AGENT"
    | "NEW_TOOL_AGENT_FORM"
    | "ADD_MCP"
    | "EDIT_MCP";

export function BIFocusFlowDiagram(props: BIFocusFlowDiagramProps) {
    const { projectPath, filePath, view, onUpdate, onReady, embedded } = props;
    // Tracks the agent position in embedded mode (where getVisualizerLocation returns the parent view's location).
    const embeddedPositionRef = useRef<NodePosition | undefined>(props.position);
    const { rpcClient } = useRpcContext();
    const isAgent = view === FOCUS_FLOW_DIAGRAM_VIEW.AGENT;
    // Custom AgentType classes render a simplified node (box + conditional model-provider circle).
    const isAgentType = view === FOCUS_FLOW_DIAGRAM_VIEW.AGENT_TYPE;

    // AGENT focus view: the declaration node (agentDeclRef) is the edit target for everything —
    // model/memory/tools all operate on it directly. The diagram renders a single node derived
    // from it for display only (see ./agent.buildAgentRenderNode).
    const agentDeclRef = useRef<FlowNode>();
    const memoryNodeRef = useRef<FlowNode>();
    const agentFormNodeRef = useRef<FlowNode>();
    const selectedToolRef = useRef<ToolData>();
    // Agent picked in the select step, used by the form step.
    const selectedAgentToolName = useRef<string>("");
    // The focused agent view shows just the node; the edit form opens only when the user clicks it.
    const [agentPanel, setAgentPanel] = useState<AgentPanel>("NONE");
    // Set when a model provider is created from the open form; consumed to skip the one reload that
    // creation triggers (which would remount the form and drop the unsaved selection). Saving clears it.
    const suppressAgentTypeReloadRef = useRef(false);
    // Skips the one reload triggered when an agent is created from the "Use Agent" tool flow.
    const suppressAgentReloadRef = useRef(false);
    // Bumped on each agent model fetch so the edit form remounts with fresh values.
    const [agentFormKey, setAgentFormKey] = useState(0);
    // AGENT_TYPE box click shows the whole init form; model-circle click scopes it to the model param.
    const [agentTypeFormMode, setAgentTypeFormMode] = useState<"ALL" | "MODEL">("ALL");

    const [model, setModel] = useState<Flow>();
    const [suggestedModel, setSuggestedModel] = useState<Flow>();
    const [showProgressIndicator, setShowProgressIndicator] = useState(false);
    const [breakpointInfo, setBreakpointInfo] = useState<BreakpointInfo>();
    const [showConnectionPanel, setShowConnectionPanel] = useState(false);
    const [selectedConnectionKind, setSelectedConnectionKind] = useState<ConnectionKind>();
    const [connectionView, setConnectionView] = useState<SidePanelView.CONNECTION_CONFIG | SidePanelView.CONNECTION_SELECT | SidePanelView.CONNECTION_CREATE>();

    const selectedNodeRef = useRef<FlowNode>();
    const nodeTemplateRef = useRef<FlowNode>();
    const topNodeRef = useRef<FlowNode | Branch>();
    const targetRef = useRef<LineRange>();
    const originalFlowModel = useRef<Flow>();
    const suggestedText = useRef<string>();
    const selectedClientName = useRef<string>();
    const initialCategoriesRef = useRef<PanelCategory[]>([]);
    const showEditForm = useRef<boolean>(false);

    const prevCompletionFetchText = useRef<string>();
    const [completions, setCompletions] = useState<CompletionItem[]>([]);
    const [filteredCompletions, setFilteredCompletions] = useState<CompletionItem[]>([]);
    const triggerCompletionOnNextRequest = useRef<boolean>(false);
    const [selectedNode, setSelectedNode] = useState<FunctionNode | undefined>();
    const expressionOffsetRef = useRef<number>(0); // To track the expression offset on adding import statements

    useEffect(() => {
        if (isAgent) {
            getAgentModel();
        } else if (isAgentType) {
            getAgentTypeModel();
        } else {
            debouncedGetFlowModel();
        }
    }, []);

    useEffect(() => {
        const unsubscribeContentUpdated = rpcClient.onProjectContentUpdated((state: boolean) => {
            console.log(">>> on project content updated", state);
            if (isAgent) {
                debouncedGetAgentModel();
                return;
            }
            if (isAgentType) {
                debouncedGetAgentTypeModel();
                return;
            }
            fetchNodes(topNodeRef.current, targetRef.current, true);
        });
        rpcClient.onParentPopupSubmitted((parent: ParentPopupData) => {
            console.log(">>> on parent popup submitted", parent);
            if (isAgent) {
                debouncedGetAgentModel();
                return;
            }
            if (isAgentType) {
                debouncedGetAgentTypeModel();
                return;
            }
            const toNode = topNodeRef.current;
            const target = targetRef.current;
            fetchNodes(toNode, target, false);
        });
        // Unsubscribe on unmount so a left-behind focus diagram doesn't react to content updates from another
        // view (e.g. the Add Agent popup creating a memory/store) and call getAgentTypeModel with no position.
        return () => {
            unsubscribeContentUpdated();
        };
    }, [rpcClient]);

    const debouncedGetFlowModel = useCallback(
        debounce(() => {
            getFlowModel();
        }, 1000),
        [rpcClient]
    );

    // Coalesces multiple content-updated notifications from one save (e.g. delete writes twice) into
    // a single refetch, so the focus view doesn't reload more than once per change.
    const debouncedGetAgentModel = useCallback(
        debounce(() => {
            getAgentModel();
        }, 300),
        [rpcClient]
    );

    const debouncedGetAgentTypeModel = useCallback(
        debounce(() => {
            getAgentTypeModel();
        }, 300),
        [rpcClient]
    );

    const getFlowModel = () => {
        setShowProgressIndicator(true);
        onUpdate();
        rpcClient
            .getBIDiagramRpcClient()
            .getBreakpointInfo()
            .then((response) => {
                setBreakpointInfo(response);
                rpcClient
                    .getBIDiagramRpcClient()
                    .getFlowModel({})
                    .then(async (model) => {
                        console.log(">>> focus diagram flow model", model);
                        if (model?.flowModel) {
                            const functionName = (model.flowModel.nodes.find((node) => node.codedata.node === "EVENT_START")?.metadata.data as ParentMetadata).label || "";
                            const node = await rpcClient.getBIDiagramRpcClient().getFunctionNode({
                                projectPath,
                                fileName: filePath,
                                functionName: functionName
                            });

                            setSelectedNode(node.functionDefinition);

                            if (node?.functionDefinition) {
                                const flowNode = getFlowNodeForNaturalFunction(node.functionDefinition);
                                // Enrich model provider metadata with icon URL from connections
                                const modelProviderValue = flowNode.properties?.modelProvider?.value as string;
                                if (modelProviderValue && Array.isArray(model.flowModel.connections)) {
                                    const matchingConnection = model.flowModel.connections.find(
                                        (c: any) => c?.properties?.variable?.value === modelProviderValue
                                    );
                                    if (matchingConnection?.metadata?.icon && flowNode.properties?.modelProvider?.metadata?.data) {
                                        (flowNode.properties.modelProvider.metadata.data as any).iconUrl = matchingConnection.metadata.icon;
                                    }
                                }
                                model.flowModel.nodes.push(flowNode);
                                setModel(model.flowModel);
                                const eventStartNode = model.flowModel.nodes.find(
                                    (node) => node.codedata.node === "EVENT_START"
                                );
                                const eventStartMetadata = eventStartNode?.metadata.data as ParentMetadata | undefined;
                                const parentMetadata = eventStartMetadata
                                    ? { ...eventStartMetadata, sourceCode: eventStartNode?.codedata?.sourceCode }
                                    : undefined;
                                // Get visualizer location and pass position to onReady
                                rpcClient.getVisualizerLocation().then((location: VisualizerLocation) => {
                                    onReady(model.flowModel.fileName, parentMetadata, location?.position);
                                });
                            }
                        }
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                        onReady(undefined, undefined, undefined);
                    });
            });
    };

    // ---------- AGENT focus view ----------

    // posOverride: refetch over a known position instead of the stored visualizer location, which goes stale after a
    // webview edit shifts the agent (the auto-refresh path doesn't re-resolve it). See handleDeleteAgentMemory.
    const getAgentModel = async (posOverride?: NodePosition) => {
        if (suppressAgentReloadRef.current) {
            suppressAgentReloadRef.current = false;
            return;
        }
        setShowProgressIndicator(true);
        onUpdate();
        try {
            const location = await rpcClient.getVisualizerLocation();
            const pos = posOverride ?? embeddedPositionRef.current ?? location?.position;
            if (!pos) {
                console.error(">>> agent focus: no position in visualizer location", location);
                return;
            }
            embeddedPositionRef.current = pos;

            // A single getFlowModel call over the declaration's line range returns both the AGENT node
            // (built via the standard flow-model path, so it carries the LS-injected tool/model/memory
            // metadata) and the module connections — replacing the separate searchNodes + getModuleNodes.
            const response = await rpcClient.getBIDiagramRpcClient().getFlowModel({
                filePath,
                startLine: { line: pos.startLine, offset: pos.startColumn },
                endLine: { line: pos.endLine, offset: pos.endColumn },
            });
            const fetchedFlow = response?.flowModel;
            const agentDecl = fetchedFlow?.nodes?.find((node) => node.codedata?.node === "AGENT");
            if (!agentDecl) {
                // Usually a transient stale-position reload: an in-progress edit (e.g. creating a memory store, which
                // is declared above the agent) shifts the agent, so the stored position no longer hits it. Keep the
                // current model and any open panel — don't tear down the user's side panel — and let it re-resolve.
                console.error(">>> agent focus: AGENT node not found in flow model", { filePath, pos });
                return;
            }
            agentDeclRef.current = agentDecl;
            agentFormNodeRef.current = agentDecl;
            setAgentFormKey((key) => key + 1);

            const connections = fetchedFlow?.connections || [];
            const renderNode = buildAgentRenderNode(agentDecl, connections);
            // Use the absolute document path (the node's lineRange.fileName is relative, which the
            // LS would resolve against filesystem root -> EROFS on save).
            const fileName = filePath;
            const flow: Flow = { fileName, nodes: [renderNode], connections };
            setModel(flow);

            const breakpointResponse = await rpcClient.getBIDiagramRpcClient().getBreakpointInfo();
            setBreakpointInfo(breakpointResponse);
            onReady(fileName, undefined, pos);
        } catch (error) {
            console.error(">>> agent focus: error building model", error);
        } finally {
            setShowProgressIndicator(false);
            onReady(undefined, undefined, undefined);
        }
    };

    // ---------- AGENT_TYPE focus view ----------

    // Renders the AGENT_TYPE node directly (no AGENT_CALL transform). It carries the LS-resolved model
    // metadata + modelProviderParam, which drive the model-provider circle in the simplified widget.
    const getAgentTypeModel = async (posOverride?: NodePosition) => {
        // Skip exactly one reload after creating a model provider from the open form (preserves the selection).
        if (suppressAgentTypeReloadRef.current) {
            suppressAgentTypeReloadRef.current = false;
            return;
        }
        setShowProgressIndicator(true);
        onUpdate();
        try {
            const location = await rpcClient.getVisualizerLocation();
            // posOverride wins over the stored location, which is stale after a delete shifts the agent up.
            const pos = posOverride ?? embeddedPositionRef.current ?? location?.position;
            if (!pos) {
                console.error(">>> agent-type focus: no position in visualizer location", location);
                return;
            }
            embeddedPositionRef.current = pos;
            const response = await rpcClient.getBIDiagramRpcClient().getFlowModel({
                filePath,
                startLine: { line: pos.startLine, offset: pos.startColumn },
                endLine: { line: pos.endLine, offset: pos.endColumn },
            });
            const fetchedFlow = response?.flowModel;
            const agentDecl = fetchedFlow?.nodes?.find((node) => node.codedata?.node === "AGENT_TYPE");
            if (!agentDecl) {
                // Usually a transient stale-position reload: an in-progress edit (e.g. creating a memory store, which
                // is declared above the agent) shifts the agent, so the stored position no longer hits it. Keep the
                // current model and any open panel — don't tear down the user's side panel — and let it re-resolve.
                console.error(">>> agent-type focus: AGENT_TYPE node not found", { filePath, pos });
                return;
            }
            agentDeclRef.current = agentDecl;
            agentFormNodeRef.current = agentDecl;
            setAgentFormKey((key) => key + 1);

            const connections = fetchedFlow?.connections || [];
            const renderNode: FlowNode = {
                ...agentDecl,
                id: agentDecl.id || "agent-type-focus-node",
                branches: [],
                flags: agentDecl.flags ?? 0,
                // Leaf node: prevents InitVisitor from appending a trailing EMPTY "end" node + link.
                returning: true,
            };
            const flow: Flow = { fileName: filePath, nodes: [renderNode], connections };
            setModel(flow);

            const breakpointResponse = await rpcClient.getBIDiagramRpcClient().getBreakpointInfo();
            setBreakpointInfo(breakpointResponse);
            onReady(filePath, undefined, pos);
        } catch (error) {
            console.error(">>> agent-type focus: error building model", error);
        } finally {
            setShowProgressIndicator(false);
            onReady(undefined, undefined, undefined);
        }
    };

    // Box click -> full init form with the model param hidden (it's edited via the circle).
    const handleEditAgentTypeForm = (_node: FlowNode) => {
        if (!agentDeclRef.current) {
            return;
        }
        agentFormNodeRef.current = agentDeclRef.current;
        setAgentTypeFormMode("ALL");
        setAgentPanel("FORM");
    };

    // Model-circle click -> the same form scoped to just the model-provider param.
    const handleEditAgentTypeModel = (_node: FlowNode) => {
        if (!agentDeclRef.current) {
            return;
        }
        agentFormNodeRef.current = agentDeclRef.current;
        setAgentTypeFormMode("MODEL");
        setAgentPanel("FORM");
    };

    // ALL: hide the model param (shown as the circle). MODEL: show only the model param.
    const buildAgentTypeFieldOverrides = (node: FlowNode, mode: "ALL" | "MODEL") => {
        const modelParam = (node.metadata?.data as NodeMetadata)?.modelProviderParam;
        const overrides: Record<string, { hidden?: boolean }> = { type: { hidden: true } };
        if (mode === "MODEL") {
            Object.keys(node.properties || {}).forEach((key) => {
                overrides[key] = { hidden: key !== modelParam };
            });
            if (modelParam) {
                overrides[modelParam] = { hidden: false };
            }
        } else if (modelParam) {
            overrides[modelParam] = { hidden: true };
        }
        return overrides;
    };

    // Closing/saving any agent panel returns to just the node. No manual refetch here: a save writes
    // source which fires onProjectContentUpdated -> getAgentModel; a plain close changes nothing, so
    // the diagram must NOT reload.
    const handleCloseAgentPanel = () => {
        memoryNodeRef.current = undefined;
        setShowConnectionPanel(false);
        setAgentPanel("NONE");
    };

    // Memory save closes the panel and refetches over the agent's post-save position. The new memory/store vars are
    // declared above the agent, shifting it, so the auto-reload's stored position is stale and misses the node;
    // refetching with the explicit position keeps the diagram in sync.
    const handleAgentMemorySaved = (agentPosition?: NodePosition) => {
        handleCloseAgentPanel();
        if (agentPosition) {
            void (isAgentType ? getAgentTypeModel(agentPosition) : getAgentModel(agentPosition));
        }
    };

    const handleEditAgentModel = (_node: FlowNode) => {
        const agentDecl = agentDeclRef.current;
        if (!agentDecl) {
            return;
        }
        selectedNodeRef.current = agentDecl;
        setAgentPanel("NONE");
        setSelectedConnectionKind("MODEL_PROVIDER");
        setConnectionView(SidePanelView.CONNECTION_CONFIG);
        setShowConnectionPanel(true);
    };

    const handleEditAgentForm = (_node: FlowNode) => {
        const agentDecl = agentDeclRef.current;
        if (!agentDecl) {
            return;
        }
        agentFormNodeRef.current = agentDecl;
        setShowConnectionPanel(false);
        setAgentPanel("FORM");
    };

    const handleSubmitAgentForm = async (updatedNode?: FlowNode) => {
        if (!updatedNode) {
            return;
        }
        // A save must always reflect in the diagram, so never let a pending suppression swallow its reload.
        suppressAgentTypeReloadRef.current = false;
        setShowProgressIndicator(true);
        try {
            const fileName = model?.fileName;
            await rpcClient.getBIDiagramRpcClient().getSourceCode({ filePath: fileName, flowNode: updatedNode });
        } catch (error) {
            console.error(">>> agent focus: error saving agent form", error);
        } finally {
            setShowProgressIndicator(false);
            handleCloseAgentPanel();
        }
    };

    // Built-in ai:Agent stores memory under the fixed `memory` constructor arg; a custom AGENT_TYPE agent stores it
    // under the wired init param (LS-detected `memoryParam`). Fall back to "memory" when unset.
    const getMemoryPropertyKey = (): string =>
        (agentDeclRef.current?.metadata?.data as NodeMetadata)?.memoryParam || "memory";

    const handleSelectAgentMemory = async (_node: FlowNode) => {
        const agentDecl = agentDeclRef.current;
        if (!agentDecl) {
            return;
        }
        setShowConnectionPanel(false);
        const memoryKey = getMemoryPropertyKey();
        const memoryValue = (agentDecl.properties as any)?.[memoryKey]?.value;
        let existingMemoryNode: FlowNode | undefined;
        if (typeof memoryValue === "string" && memoryValue.trim() && memoryValue.trim() !== "()") {
            const startLine = agentDecl.codedata?.lineRange?.startLine;
            const linePosition: LinePosition | undefined = startLine
                ? { line: startLine.line, offset: startLine.offset }
                : undefined;
            const memoryNodes = await findFlowNode(rpcClient, filePath, linePosition, {
                kind: "MEMORY",
                exactMatch: memoryValue.trim(),
            });
            existingMemoryNode = memoryNodes && memoryNodes.length > 0 ? memoryNodes[0] : undefined;
        }
        memoryNodeRef.current = existingMemoryNode;
        setAgentPanel("MEMORY");
    };

    const handleDeleteAgentMemory = async (_node: FlowNode) => {
        const agentDecl = agentDeclRef.current;
        if (!agentDecl) {
            return;
        }
        setShowProgressIndicator(true);
        try {
            const memoryKey = getMemoryPropertyKey();
            const agentVarName = agentDecl.properties?.variable?.value as string;
            const memoryVar = (agentDecl.properties as any)?.[memoryKey]?.value;
            const updatedAgent = structuredClone(agentDecl);
            if (typeof memoryVar === "string" && memoryVar.trim() && memoryVar.trim() !== "()") {
                const memoryNode = await findFlowNodeByModuleVarName(memoryVar.trim(), rpcClient);
                if (memoryNode) {
                    const memoryFilePath = (
                        await rpcClient
                            .getVisualizerRpcClient()
                            .joinProjectPath({ segments: [memoryNode.codedata.lineRange.fileName] })
                    ).filePath;
                    const deleteResponse = await rpcClient
                        .getBIDiagramRpcClient()
                        .deleteFlowNode({ filePath: memoryFilePath, flowNode: memoryNode });
                    // Deleting the memory variable shifts subsequent lines, so the agent's original line range is now
                    // stale; re-writing on it would duplicate the agent. Refresh from the returned artifacts first.
                    refreshNodeLineRangeFromArtifacts(updatedAgent, deleteResponse?.artifacts, agentVarName);
                }
            }
            (updatedAgent.properties as any)[memoryKey].value = "()";
            const agentFilePath = (
                await rpcClient
                    .getVisualizerRpcClient()
                    .joinProjectPath({ segments: [updatedAgent.codedata.lineRange.fileName] })
            ).filePath;
            const agentResponse = await rpcClient
                .getBIDiagramRpcClient()
                .getSourceCode({ filePath: agentFilePath, flowNode: updatedAgent });
            // The auto-refresh refetches over the stored visualizer position, which is now stale (deleting the memory
            // variable shifted the agent up) and would miss the node. Refetch explicitly over the agent's new position.
            const newPos = agentResponse?.artifacts?.find((a) => a.name === agentVarName)?.position;
            if (newPos) {
                await (isAgentType ? getAgentTypeModel(newPos) : getAgentModel(newPos));
            }
        } catch (error) {
            console.error(">>> agent focus: error deleting memory", error);
        } finally {
            setShowProgressIndicator(false);
        }
    };

    // ---------- Tools ----------

    const handleAddTool = (_node: FlowNode) => {
        setShowConnectionPanel(false);
        setAgentPanel("ADD_TOOL");
    };

    const handleAddMcpServer = (_node: FlowNode) => {
        setShowConnectionPanel(false);
        selectedToolRef.current = undefined;
        setAgentPanel("ADD_MCP");
    };

    const handleSelectMcpToolkit = (tool: ToolData, _node: FlowNode) => {
        selectedToolRef.current = tool;
        setShowConnectionPanel(false);
        setAgentPanel("EDIT_MCP");
    };

    // Resolves a tool's @ai:AgentTool function via a targeted getFunctionNode lookup in the agent's own
    // file (agent tools are written alongside the agent). Avoids the project-wide getProjectComponents scan.
    const resolveToolFunction = async (toolName: string) => {
        const agentFileName = agentDeclRef.current?.codedata?.lineRange?.fileName || "agents.bal";
        const response = await rpcClient.getBIDiagramRpcClient().getFunctionNode({
            functionName: toolName,
            fileName: agentFileName,
            projectPath,
        });
        const lineRange = response?.functionDefinition?.codedata?.lineRange;
        if (!lineRange) {
            return null;
        }
        const { filePath: documentUri } = await rpcClient
            .getVisualizerRpcClient()
            .joinProjectPath({ segments: [lineRange.fileName] });
        return { documentUri, lineRange };
    };

    // Tool ⋮ → Edit: open the tool's Agent Tool form (FunctionForm auto-detects the @ai:AgentTool annotation).
    const handleSelectTool = async (tool: ToolData, _node: FlowNode) => {
        if (!tool?.name) {
            return;
        }
        setShowProgressIndicator(true);
        try {
            const resolved = await resolveToolFunction(tool.name);
            if (!resolved) {
                console.error(">>> agent focus: tool function not found for edit", tool.name);
                return;
            }
            await rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    documentUri: resolved.documentUri,
                    identifier: tool.name,
                    view: MACHINE_VIEW.BIFunctionForm,
                },
            });
        } finally {
            setShowProgressIndicator(false);
        }
    };

    // Tool circle click / ⋮ → View: open that tool function's flow diagram (MCP toolkits are handled by
    // handleSelectMcpToolkit, so they never reach here).
    const handleGoToTool = async (tool: ToolData, _node: FlowNode) => {
        if (!tool?.name) {
            return;
        }
        setShowProgressIndicator(true);
        try {
            const resolved = await resolveToolFunction(tool.name);
            if (!resolved) {
                console.error(">>> agent focus: tool function not found", tool.name);
                return;
            }
            await handleOpenView({
                documentUri: resolved.documentUri,
                position: {
                    startLine: resolved.lineRange.startLine.line,
                    startColumn: resolved.lineRange.startLine.offset,
                    endLine: resolved.lineRange.endLine.line,
                    endColumn: resolved.lineRange.endLine.offset,
                },
            });
        } finally {
            setShowProgressIndicator(false);
        }
    };

    const handleDeleteTool = async (tool: ToolData, _node: FlowNode) => {
        const agentDecl = agentDeclRef.current;
        if (!agentDecl) {
            return;
        }
        setShowProgressIndicator(true);
        try {
            const updatedAgent = await removeToolFromAgentNode(agentDecl, tool.name);
            if (updatedAgent) {
                const agentFilePath = (
                    await rpcClient
                        .getVisualizerRpcClient()
                        .joinProjectPath({ segments: [agentDecl.codedata.lineRange.fileName] })
                ).filePath;
                await rpcClient
                    .getBIDiagramRpcClient()
                    .getSourceCode({ filePath: agentFilePath, flowNode: updatedAgent });
            }
            const resolved = await resolveToolFunction(tool.name);
            if (resolved) {
                await rpcClient.getBIDiagramRpcClient().deleteByComponentInfo({
                    filePath: resolved.documentUri,
                    component: {
                        name: tool.name,
                        filePath: resolved.documentUri,
                        startLine: resolved.lineRange.startLine.line,
                        startColumn: resolved.lineRange.startLine.offset,
                        endLine: resolved.lineRange.endLine.line,
                        endColumn: resolved.lineRange.endLine.offset,
                        resources: [],
                    },
                });
            }
        } catch (error) {
            console.error(">>> agent focus: error deleting tool", error);
        } finally {
            setShowProgressIndicator(false);
        }
    };

    const handleOnCloseSidePanel = () => {
        selectedNodeRef.current = undefined;
        nodeTemplateRef.current = undefined;
        topNodeRef.current = undefined;
        targetRef.current = undefined;
        selectedClientName.current = undefined;
        showEditForm.current = false;

        // restore original model
        if (originalFlowModel.current) {
            // const updatedModel = removeDraftNodeFromDiagram(model);
            // setModel(updatedModel);
            debouncedGetFlowModel();
            originalFlowModel.current = undefined;
            setSuggestedModel(undefined);
            suggestedText.current = undefined;
        }
    };

    const fetchNodes = (
        parent: FlowNode | Branch,
        target: LineRange,
        updateFlowModel = true
    ) => {
        const getNodeRequest: BIAvailableNodesRequest = {
            position: target.startLine,
            filePath: model?.fileName || parent?.codedata?.lineRange.fileName,
        };
        console.log(">>> get available node request", getNodeRequest);
        // save original model
        originalFlowModel.current = model;
        // show side panel with available nodes
        setShowProgressIndicator(true);
        rpcClient
            .getBIDiagramRpcClient()
            .getAvailableNodes(getNodeRequest)
            .then((response) => {
                console.log(">>> Available nodes", response);
                if (!response.categories) {
                    console.error(">>> Error getting available nodes", response);
                    return;
                }
                // filter out some categories that are not supported in the diagram
                // TODO: these categories should be supported in the future
                const notSupportedCategories = [
                    "PARALLEL_FLOW",
                    "LOCK",
                    "START",
                    "TRANSACTION",
                    "COMMIT",
                    "ROLLBACK",
                    "RETRY",
                ];
                const filteredCategories = response.categories.map((category) => ({
                    ...category,
                    items: category?.items?.filter(
                        (item) =>
                            !("codedata" in item) ||
                            !notSupportedCategories.includes((item as AvailableNode).codedata?.node)
                    ),
                })) as Category[];
                const convertedCategories = convertBICategoriesToSidePanelCategories(filteredCategories);
                initialCategoriesRef.current = convertedCategories; // Store initial categories
                // add draft node to model
                if (updateFlowModel) {
                    const updatedFlowModel = addDraftNodeToDiagram(model, parent, target);
                    setModel(updatedFlowModel);
                }
            })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

    const handleOnAddComment = (comment: string, target: LineRange) => {
        console.log(">>> on add comment", { comment, target });
        const updatedNode: FlowNode = {
            id: "40715",
            metadata: {
                label: "Comment",
                description: "This is a comment",
            },
            codedata: {
                node: "COMMENT",
                lineRange: {
                    fileName: "currency.bal",
                    ...target,
                },
            },
            returning: false,
            properties: {
                comment: {
                    metadata: {
                        label: "Comment",
                        description: "Comment to describe the flow",
                    },
                    value: `\n${comment}\n\n`, // HACK: add extra new lines to get last position right
                    optional: false,
                    advanced: false,
                    editable: true,
                },
            },
            branches: [],
            flags: 0,
        };

        rpcClient
            .getBIDiagramRpcClient()
            .getSourceCode({
                filePath: model.fileName,
                flowNode: updatedNode,
            })
            .then((response) => {
                console.log(">>> Updated source code", response);
                if (response.artifacts.length > 0) {
                    // clear memory
                    selectedNodeRef.current = undefined;
                    handleOnCloseSidePanel();
                } else {
                    console.error(">>> Error updating source code", response);
                    // handle error
                }
            });
    };

    const handleOnFormSubmit = (updatedNode?: FlowNode) => {
        if (!updatedNode) {
            console.log(">>> No updated node found");
            updatedNode = selectedNodeRef.current;
        }
        setShowProgressIndicator(true);
        rpcClient
            .getBIDiagramRpcClient()
            .getSourceCode({
                filePath: model.fileName,
                flowNode: updatedNode
            })
            .then((response) => {
                console.log(">>> Updated source code", response);
                if (response.artifacts.length > 0) {
                    // clear memory
                    selectedNodeRef.current = undefined;
                    getFlowModel();
                    handleOnCloseSidePanel();
                } else {
                    console.error(">>> Error updating source code", response);
                    // handle error
                }
            })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

    const handleOnEditNode = async (node: FlowNode) => {
        console.log(">>> on edit node", node);
        selectedNodeRef.current = node;
        if (suggestedText.current) {
            // use targetRef from suggested model
        } else {
            topNodeRef.current = undefined;
            targetRef.current = node.codedata.lineRange;
        }
        if (!targetRef.current) {
            return;
        }
        setShowProgressIndicator(true);
        rpcClient.getBIDiagramRpcClient().getNodeTemplate({
            position: targetRef.current.startLine,
            filePath: model.fileName,
            id: node.codedata,
        }).then((response) => {
            const nodesWithCustomForms = ["IF", "FORK"];
            // if node doesn't have properties. don't show edit form
            if (!response.flowNode.properties && !nodesWithCustomForms.includes(response.flowNode.codedata.node)) {
                console.log(">>> Node doesn't have properties. Don't show edit form", response.flowNode);
                setShowProgressIndicator(false);
                showEditForm.current = false;
                return;
            }

            nodeTemplateRef.current = response.flowNode;
            showEditForm.current = true;
        })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

    const handleOnGoToSource = (node: FlowNode) => {
        const targetPosition: NodePosition = {
            startLine: node.codedata.lineRange.startLine.line,
            startColumn: node.codedata.lineRange.startLine.offset,
            endLine: node.codedata.lineRange.endLine.line,
            endColumn: node.codedata.lineRange.endLine.offset,
        };
        rpcClient.getCommonRpcClient().goToSource({ position: targetPosition });
    };

    const handleAddBreakpoint = (node: FlowNode) => {
        const request = {
            filePath: model?.fileName,
            breakpoint: {
                line: node.codedata.lineRange.startLine.line,
                column: node.codedata.lineRange.startLine?.offset,
            },
        };

        rpcClient.getBIDiagramRpcClient().addBreakpointToSource(request);
    };

    const handleRemoveBreakpoint = (node: FlowNode) => {
        const request = {
            filePath: model?.fileName,
            breakpoint: {
                line: node.codedata.lineRange.startLine.line,
                column: node.codedata.lineRange.startLine?.offset,
            },
        };

        rpcClient.getBIDiagramRpcClient().removeBreakpointFromSource(request);
    };

    const handleOpenView = async (location: VisualizerLocation) => {
        console.log(">>> open view: ", { location });
        const context: VisualizerLocation = {
            documentUri: location.documentUri,
            position: location.position,
            projectPath: location.projectPath || undefined,
        };
        await rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.OPEN_VIEW, location: context });
    };

    const handleGoToAgent = async (node: FlowNode) => {
        if (node.codedata?.node === "AGENT_CALL") {
            const agentNode = await findAgentNodeFromAgentCallNode(node, rpcClient);
            if (!agentNode) return;
            const declRange = agentNode.codedata?.lineRange;
            if (!declRange) return;
            const { filePath } = await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [declRange.fileName] });
            await rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    documentUri: filePath,
                    position: {
                        startLine: declRange.startLine.line,
                        startColumn: declRange.startLine.offset,
                        endLine: declRange.endLine.line,
                        endColumn: declRange.endLine.offset,
                    },
                },
            });
        } else {
            goToAgentFromRunNode(node, rpcClient);
        }
    };

    const handleOnChatWithAgent = (agentDeclNode: FlowNode) => {
        const agentVarName = agentDeclNode.properties?.variable?.value as string;
        const filePath = model?.fileName || agentDeclNode.codedata?.lineRange?.fileName;
        if (!agentVarName || !filePath) {
            console.error("Cannot start inline agent chat: missing agent variable name or file path");
            return;
        }
        rpcClient.getBIDiagramRpcClient().startInlineAgentChat({
            agentVarName,
            filePath,
            agentNode: agentDeclNode,
        });
    };

    const flowModel = originalFlowModel.current && suggestedModel ? suggestedModel : model;

    /* expression editor related */
    const handleExpressionEditorCancel = () => {
        setFilteredCompletions([]);
        setCompletions([]);
        triggerCompletionOnNextRequest.current = false;
    };

    const debouncedRetrieveCompletions = useCallback(
        debounce(
            async (
                value: string,
                property: ExpressionProperty,
                offset: number,
                triggerCharacter?: string
            ) => {
                let expressionCompletions: CompletionItem[] = [];
                const { parentContent, currentContent } = value
                    .slice(0, offset)
                    .match(EXPRESSION_EXTRACTION_REGEX)?.groups ?? {};
                if (
                    completions.length > 0 &&
                    !triggerCharacter &&
                    parentContent === prevCompletionFetchText.current
                ) {
                    expressionCompletions = completions
                        .filter((completion) => {
                            const lowerCaseText = currentContent.toLowerCase();
                            const lowerCaseLabel = completion.label.toLowerCase();

                            return lowerCaseLabel.includes(lowerCaseText);
                        })
                        .sort((a, b) => a.sortText.localeCompare(b.sortText));
                } else {
                    const { lineOffset, charOffset } = calculateExpressionOffsets(value, offset);
                    let completions = await rpcClient.getBIDiagramRpcClient().getExpressionCompletions({
                        filePath: filePath,
                        context: {
                            expression: value,
                            startLine: updateLineRange(
                                selectedNode.properties['prompt'].codedata.lineRange,
                                expressionOffsetRef.current
                            ).startLine,
                            lineOffset: lineOffset,
                            offset: charOffset,
                            codedata: selectedNode.codedata,
                            property: property
                        },
                        completionContext: {
                            triggerKind: triggerCharacter ? 2 : 1,
                            triggerCharacter: triggerCharacter as TriggerCharacter
                        }
                    });

                    // Convert completions to the ExpressionEditor format
                    let convertedCompletions: CompletionItem[] = [];
                    completions?.forEach((completion) => {
                        if (completion.detail) {
                            // HACK: Currently, completion with additional edits apart from imports are not supported
                            // Completions that modify the expression itself (ex: member access)
                            convertedCompletions.push(convertBalCompletion(completion));
                        }
                    });
                    setCompletions(convertedCompletions);

                    if (triggerCharacter) {
                        expressionCompletions = convertedCompletions;
                    } else {
                        expressionCompletions = convertedCompletions
                            .filter((completion) => {
                                const lowerCaseText = currentContent.toLowerCase();
                                const lowerCaseLabel = completion.label.toLowerCase();

                                return lowerCaseLabel.includes(lowerCaseText);
                            })
                            .sort((a, b) => a.sortText.localeCompare(b.sortText));
                    }
                }

                prevCompletionFetchText.current = parentContent ?? "";
                setFilteredCompletions(expressionCompletions);
            },
            250
        ),
        [rpcClient, completions, filePath, selectedNode]
    );

    const handleRetrieveCompletions = useCallback(
        async (
            value: string,
            property: ExpressionProperty,
            offset: number,
            triggerCharacter?: string
        ) => {
            await debouncedRetrieveCompletions(value, property, offset, triggerCharacter);

            if (triggerCharacter) {
                await debouncedRetrieveCompletions.flush();
            }
        },
        [debouncedRetrieveCompletions]
    );

    const handleCompletionItemSelect = async (value: string, additionalTextEdits?: TextEdit[]) => {
        if (additionalTextEdits?.[0]?.newText) {
            const response = await rpcClient.getBIDiagramRpcClient().updateImports({
                filePath: filePath,
                importStatement: additionalTextEdits[0].newText,
            });
            expressionOffsetRef.current += response.importStatementOffset;
        }
        debouncedRetrieveCompletions.cancel();
        handleExpressionEditorCancel();
    };

    const handleGetExpressionTokens = async (
        expression: string,
        fileName: string,
        position: { line: number; offset: number }
    ): Promise<number[]> => {
        return rpcClient.getBIDiagramRpcClient().getExpressionTokens({
            expression: expression,
            filePath: fileName,
            position: position
        });
    };

    const handleExpressionEditorBlur = () => {
        handleExpressionEditorCancel();
    };

    const handleOnEditNPFunctionModel = (node: FlowNode) => {
        console.log(">>> on edit np function model provider", node);
        selectedNodeRef.current = node;
        setSelectedConnectionKind('MODEL_PROVIDER');
        setConnectionView(SidePanelView.CONNECTION_CONFIG);
        setShowConnectionPanel(true);
    };

    const handleCloseConnectionPanel = () => {
        setShowConnectionPanel(false);
        selectedNodeRef.current = undefined;
        if (isAgent) {
            // Refresh is driven by onProjectContentUpdated only when a save actually wrote source.
            setAgentPanel("NONE");
        } else {
            getFlowModel();
        }
    };

    const handleNavigateToSelectionList = () => {
        setConnectionView(SidePanelView.CONNECTION_SELECT);
    };

    const handleSelectConnection = async (nodeId: string, metadata?: any) => {
        setShowProgressIndicator(true);

        try {
            const { flowNode, connectionKind } = await getNodeTemplateForConnection(
                nodeId,
                metadata,
                targetRef.current,
                model?.fileName,
                rpcClient
            );

            nodeTemplateRef.current = flowNode;
            setSelectedConnectionKind(connectionKind as ConnectionKind);
            setConnectionView(SidePanelView.CONNECTION_CREATE);
        } finally {
            setShowProgressIndicator(false);
        }
    };

    const handleUpdateNodeWithConnection = async (selectedNode: FlowNode) => {
        setShowProgressIndicator(true);

        const clonedNode = structuredClone(selectedNode);

        const isNpFunction = clonedNode.codedata.node === "NP_FUNCTION";
        if (isNpFunction)
            clonedNode.codedata.node = "NP_FUNCTION_DEFINITION";

        await rpcClient
            .getBIDiagramRpcClient()
            .getSourceCode({ filePath: model?.fileName, flowNode: clonedNode, isFunctionNodeUpdate: isNpFunction });
        handleCloseConnectionPanel();
        setShowProgressIndicator(false);
    };

    const createHelperPane = useCallback<GetHelperPaneFunction>((
        fieldKey,
        exprRef,
        anchorRef,
        defaultValue,
        value,
        onChange,
        changeHelperPaneState,
        helperPaneHeight,
        recordTypeField,
        isAssignIdentifier,
        valueTypeConstraint,
        inputMode
    ) => {
        if (!selectedNode || !model) {
            return <></>;
        }

        return createPromptHelperPane({
            selectedNode,
            model,
            fieldKey,
            exprRef,
            anchorRef,
            defaultValue,
            value,
            onChange,
            changeHelperPaneState,
            helperPaneHeight,
            recordTypeField,
            valueTypeConstraint,
            inputMode,
            completions,
            filteredCompletions,
            projectPath,
            rpcClient,
            debouncedRetrieveCompletions
        });
    }, [model, projectPath, completions, filteredCompletions, debouncedRetrieveCompletions, rpcClient, selectedNode]);

    // Any agent panel open — the agent edit/config form (agentPanel) or the model-provider/connection
    // config panel (showConnectionPanel). Drives the diagram backdrop; clicking it closes the open panel.
    const isAgentPanelOpen = agentPanel !== "NONE" || showConnectionPanel;
    const handleOverlayClick = () => {
        if (showConnectionPanel) {
            handleCloseConnectionPanel();
        } else {
            handleCloseAgentPanel();
        }
    };

    const memoizedDiagramProps = useMemo(
        () => ({
            model: flowModel,
            onAddComment: handleOnAddComment,
            onNodeSelect: handleOnEditNode,
            onNodeSave: handleOnFormSubmit,
            goToSource: handleOnGoToSource,
            addBreakpoint: handleAddBreakpoint,
            removeBreakpoint: handleRemoveBreakpoint,
            openView: handleOpenView,
            goToAgent: handleGoToAgent,
            projectPath,
            breakpointInfo,
            expressionContext: {
                completions: filteredCompletions,
                triggerCharacters: TRIGGER_CHARACTERS,
                retrieveCompletions: handleRetrieveCompletions,
                onCompletionItemSelect: handleCompletionItemSelect,
                onBlur: handleExpressionEditorBlur,
                onCancel: handleExpressionEditorCancel,
                getHelperPane: createHelperPane,
                getExpressionTokens: handleGetExpressionTokens
            },
            aiNodes: {
                onModelSelect: handleOnEditNPFunctionModel,
            },
        }),
        [flowModel, projectPath, breakpointInfo, filteredCompletions, createHelperPane, handleGetExpressionTokens]
    );

    const noop = () => { };

    const agentDiagramProps = useMemo(
        () => ({
            model: flowModel,
            onNodeSelect: handleEditAgentForm,
            // onAddNode/onDeleteNode must be defined or Diagram forces the node read-only
            // (Diagram.tsx readOnly = !onAddNode || !onDeleteNode || !onNodeSelect). The agent
            // focus view has no flow to add into, so these are intentional no-ops.
            onAddNode: noop,
            onDeleteNode: noop,
            goToSource: handleOnGoToSource,
            openView: handleOpenView,
            goToAgent: handleGoToAgent,
            projectPath,
            breakpointInfo,
            readOnly: showProgressIndicator,
            // Enables the single agent node's centering in Diagram.tsx (focus view only).
            isAgentFocusView: true,
            embedded,
            // Dim backdrop above the canvas (behind the form) while a panel is open; click to close.
            overlay: {
                visible: isAgentPanelOpen,
                onClickOverlay: handleOverlayClick,
            },
            agentNode: {
                onModelSelect: handleEditAgentModel,
                onAddTool: handleAddTool,
                onAddMcpServer: handleAddMcpServer,
                onSelectTool: handleSelectTool,
                onSelectMcpToolkit: handleSelectMcpToolkit,
                onDeleteTool: handleDeleteTool,
                goToTool: handleGoToTool,
                onSelectMemoryManager: handleSelectAgentMemory,
                onDeleteMemoryManager: handleDeleteAgentMemory,
            },
        }),
        [flowModel, projectPath, breakpointInfo, showProgressIndicator, embedded, isAgentPanelOpen]
    );

    const agentTypeDiagramProps = useMemo(
        () => ({
            model: flowModel,
            onNodeSelect: handleEditAgentTypeForm,
            onAddNode: noop,
            onDeleteNode: noop,
            goToSource: handleOnGoToSource,
            openView: handleOpenView,
            goToAgent: handleGoToAgent,
            projectPath,
            breakpointInfo,
            readOnly: showProgressIndicator,
            isAgentFocusView: true,
            embedded,
            // Dim backdrop above the canvas (behind the form) while a panel is open; click to close.
            overlay: {
                visible: isAgentPanelOpen,
                onClickOverlay: handleOverlayClick,
            },
            // The simplified node edits the model provider, and — when the class wires an ai:Memory param — memory via
            // the same Configure Memory panel as the built-in agent. Tool affordances aren't rendered.
            agentNode: {
                onModelSelect: handleEditAgentTypeModel,
                onAddTool: noop,
                onAddMcpServer: noop,
                onSelectTool: noop,
                onSelectMcpToolkit: noop,
                onDeleteTool: noop,
                goToTool: noop,
                onSelectMemoryManager: handleSelectAgentMemory,
                onDeleteMemoryManager: handleDeleteAgentMemory,
                onChatWithAgent: handleOnChatWithAgent,
            },
        }),
        [flowModel, projectPath, breakpointInfo, showProgressIndicator, embedded, isAgentPanelOpen]
    );

    const diagramProps = isAgentType ? agentTypeDiagramProps : isAgent ? agentDiagramProps : memoizedDiagramProps;

    const agentTypeFormNode = (() => {
        if (!agentFormNodeRef.current || agentTypeFormMode !== "MODEL") {
            return agentFormNodeRef.current;
        }
        const node = cloneDeep(agentFormNodeRef.current);
        if (node.metadata?.description) {
            delete node.metadata.description;
        }
        return node;
    })();

    // Read-only role/instructions at the top of the Configure Agent form (not the model-only form).
    const agentTypePromptInjection = (() => {
        if (agentTypeFormMode !== "ALL") {
            return undefined;
        }
        const agent = (agentFormNodeRef.current?.metadata?.data as NodeMetadata | undefined)?.agent;
        if (!agent || (!agent.role && !agent.instructions)) {
            return undefined;
        }
        return [{ component: <AgentPromptDisplay role={agent.role} instructions={agent.instructions} />, index: 0 }];
    })();

    const agentPanelTitle: string | undefined = (() => {
        if (showConnectionPanel) {
            return "Configure Model Provider Connection";
        }
        switch (agentPanel) {
            case "FORM":
                return isAgentType
                    ? agentTypeFormMode === "MODEL" ? "Configure Model Provider" : "Configure Agent"
                    : "Edit Agent";
            case "MEMORY":
                return "Configure Memory";
            case "ADD_TOOL":
            case "NEW_TOOL_CUSTOM":
            case "NEW_TOOL_CONNECTION":
            case "NEW_TOOL_FUNCTION":
                return "Add Tool";
            case "NEW_TOOL_AGENT_FORM":
                return "Use Agent";
            case "ADD_MCP":
                return "Add MCP Server";
            case "EDIT_MCP":
                return "Edit MCP Server";
            default:
                return undefined;
        }
    })();

    const agentPanelOnBack: (() => void) | undefined = (() => {
        if (showConnectionPanel) {
            if (connectionView === SidePanelView.CONNECTION_SELECT) {
                return () => setConnectionView(SidePanelView.CONNECTION_CONFIG);
            }
            if (connectionView === SidePanelView.CONNECTION_CREATE) {
                return () => setConnectionView(SidePanelView.CONNECTION_SELECT);
            }
            return undefined;
        }
        switch (agentPanel) {
            case "NEW_TOOL_CUSTOM":
            case "NEW_TOOL_CONNECTION":
            case "NEW_TOOL_FUNCTION":
            case "ADD_MCP":
                return () => setAgentPanel("ADD_TOOL");
            case "NEW_TOOL_AGENT_FORM":
                return () => setAgentPanel("NEW_TOOL_AGENT");
            default:
                return undefined;
        }
    })();

    const renderAgentPanelContent = () => {
        if (showConnectionPanel) {
            if (!selectedNodeRef.current) {
                return null;
            }
            return (
                <>
                    {connectionView === SidePanelView.CONNECTION_CONFIG && (
                        <ConnectionConfig
                            fileName={filePath}
                            connectionKind={selectedConnectionKind}
                            selectedNode={selectedNodeRef.current}
                            onSave={handleUpdateNodeWithConnection}
                            onNavigateToSelectionList={handleNavigateToSelectionList}
                        />
                    )}
                    {connectionView === SidePanelView.CONNECTION_SELECT && (
                        <ConnectionSelectionList
                            connectionKind={selectedConnectionKind}
                            selectedNode={selectedNodeRef.current}
                            onSelect={handleSelectConnection}
                        />
                    )}
                    {connectionView === SidePanelView.CONNECTION_CREATE && (
                        <ConnectionCreator
                            connectionKind={selectedConnectionKind}
                            nodeFormTemplate={nodeTemplateRef.current}
                            selectedNode={selectedNodeRef.current}
                            onSave={handleUpdateNodeWithConnection}
                        />
                    )}
                </>
            );
        }
        switch (agentPanel) {
            case "FORM":
                if (isAgent && agentFormNodeRef.current) {
                    return (
                        <FlowNodeForm
                            key={agentFormKey}
                            fileName={model?.fileName || ""}
                            node={agentFormNodeRef.current}
                            nodeFormTemplate={agentFormNodeRef.current}
                            targetLineRange={agentFormNodeRef.current.codedata?.lineRange as any}
                            projectPath={projectPath}
                            editForm={true}
                            onSubmit={handleSubmitAgentForm}
                            submitText={showProgressIndicator ? "Saving..." : "Save"}
                            showProgressIndicator={showProgressIndicator}
                            disableSaveButton={showProgressIndicator}
                            fieldOverrides={{ model: { hidden: true }, type: { hidden: true } }}
                        />
                    );
                }
                if (isAgentType && agentFormNodeRef.current) {
                    return (
                        <FlowNodeForm
                            key={agentFormKey}
                            fileName={model?.fileName || ""}
                            node={agentTypeFormNode}
                            nodeFormTemplate={agentTypeFormNode}
                            targetLineRange={agentFormNodeRef.current.codedata?.lineRange as any}
                            projectPath={projectPath}
                            editForm={true}
                            onSubmit={handleSubmitAgentForm}
                            submitText={showProgressIndicator ? "Saving..." : "Save"}
                            showProgressIndicator={showProgressIndicator}
                            disableSaveButton={showProgressIndicator}
                            fieldOverrides={buildAgentTypeFieldOverrides(agentFormNodeRef.current, agentTypeFormMode)}
                            injectedComponents={agentTypePromptInjection}
                            hideInfoBanner={Boolean(agentTypePromptInjection)}
                            onConnectionCreated={() => { suppressAgentTypeReloadRef.current = true; }}
                        />
                    );
                }
                return null;
            case "MEMORY":
                return agentDeclRef.current ? (
                    <MemoryManagerConfig
                        agentNode={agentDeclRef.current}
                        memoryNode={memoryNodeRef.current as FlowNode}
                        memoryPropertyKey={getMemoryPropertyKey()}
                        onSave={handleAgentMemorySaved}
                    />
                ) : null;
            case "ADD_TOOL":
                return agentDeclRef.current ? (
                    <AddTool
                        agentNode={agentDeclRef.current}
                        onCreateCustomTool={() => setAgentPanel("NEW_TOOL_CUSTOM")}
                        onUseConnection={() => setAgentPanel("NEW_TOOL_CONNECTION")}
                        onUseFunction={() => setAgentPanel("NEW_TOOL_FUNCTION")}
                        onUseAgent={() => setAgentPanel("NEW_TOOL_AGENT")}
                        onUseMcpServer={() => setAgentPanel("ADD_MCP")}
                        onSave={handleCloseAgentPanel}
                    />
                ) : null;
            case "NEW_TOOL_CUSTOM":
            case "NEW_TOOL_CONNECTION":
            case "NEW_TOOL_FUNCTION":
                return agentDeclRef.current ? (
                    <NewTool
                        agentNode={agentDeclRef.current}
                        mode={
                            agentPanel === "NEW_TOOL_CUSTOM"
                                ? NewToolSelectionMode.CUSTOM_TOOL
                                : agentPanel === "NEW_TOOL_CONNECTION"
                                    ? NewToolSelectionMode.CONNECTION
                                    : NewToolSelectionMode.FUNCTION
                        }
                        onSave={handleCloseAgentPanel}
                        onBack={() => setAgentPanel("ADD_TOOL")}
                        onSetBackOverride={noop}
                    />
                ) : null;
            case "NEW_TOOL_AGENT":
                return agentDeclRef.current ? (
                    <UseAgentTool
                        agentNode={agentDeclRef.current}
                        onSelectAgent={(agentVarName: string) => {
                            selectedAgentToolName.current = agentVarName;
                            setAgentPanel("NEW_TOOL_AGENT_FORM");
                        }}
                        onAgentCreated={() => { suppressAgentReloadRef.current = true; }}
                        onBack={() => setAgentPanel("ADD_TOOL")}
                        onClose={handleCloseAgentPanel}
                    />
                ) : null;
            case "NEW_TOOL_AGENT_FORM":
                return agentDeclRef.current ? (
                    <UseAgentToolForm
                        agentNode={agentDeclRef.current}
                        agentVarName={selectedAgentToolName.current}
                        onSave={handleCloseAgentPanel}
                    />
                ) : null;
            case "ADD_MCP":
                return agentDeclRef.current ? (
                    <AddMcpServer
                        agentNode={agentDeclRef.current}
                        onSave={handleCloseAgentPanel}
                        onBack={() => setAgentPanel("ADD_TOOL")}
                    />
                ) : null;
            case "EDIT_MCP":
                return agentDeclRef.current ? (
                    <AddMcpServer
                        editMode={true}
                        name={selectedToolRef.current?.name}
                        agentNode={agentDeclRef.current}
                        onSave={handleCloseAgentPanel}
                    />
                ) : null;
            default:
                return null;
        }
    };

    return (
        <PanelOverlayProvider>
            <View>
                {(showProgressIndicator) && model && (
                    <ProgressIndicator color={ThemeColors.PRIMARY} />
                )}
                <Container embedded={embedded}>
                    {!model && (
                        <SpinnerContainer>
                            <ProgressRing color={ThemeColors.PRIMARY} />
                        </SpinnerContainer>
                    )}
                    {model && <MemoizedDiagram {...diagramProps} />}
                </Container>
            </View>

            {isAgentPanelOpen && (
                <PanelContainer
                    title={agentPanelTitle}
                    show={true}
                    onClose={showConnectionPanel ? handleCloseConnectionPanel : handleCloseAgentPanel}
                    onBack={agentPanelOnBack}
                >
                    {renderAgentPanelContent()}
                </PanelContainer>
            )}
            <PanelOverlayRenderer />
        </PanelOverlayProvider>
    );
}
