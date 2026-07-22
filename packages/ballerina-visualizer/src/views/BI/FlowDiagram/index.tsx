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

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { TraceAnimationEvent } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import styled from "@emotion/styled";
import { findAgentNodeFromAgentCallNode, goToAgentFromRunNode } from "../AIChatAgent/utils";
import { MemoizedDiagram, setTraceAnimationActive, setTraceAnimationInactive } from "@wso2/bi-diagram";
import {
    BIAvailableNodesRequest,
    Flow,
    FlowNode,
    Branch,
    Category,
    AvailableNode,
    LineRange,
    EVENT_TYPE,
    VisualizerLocation,
    MACHINE_VIEW,
    SubPanel,
    SubPanelView,
    CurrentBreakpointsResponse as BreakpointInfo,
    FUNCTION_TYPE,
    ParentPopupData,
    BISearchRequest,
    DIRECTORY_MAP,
    UpdatedArtifactsResponse,
    ParentMetadata,
    NodeMetadata,
    SearchKind,
    EditorConfig,
    CodeData,
    JoinProjectPathRequest,
    CodeContext,
    AIPanelPrompt,
    LinePosition,
    EditorDisplayMode,
} from "@wso2/ballerina-core";

import {
    convertBICategoriesToSidePanelCategories,
    convertFunctionCategoriesToSidePanelCategories,
    convertAgentCategoriesToSidePanelCategories,
    convertModelProviderCategoriesToSidePanelCategories,
    convertVectorStoreCategoriesToSidePanelCategories,
    convertEmbeddingProviderCategoriesToSidePanelCategories,
    convertDataLoaderCategoriesToSidePanelCategories,
    convertChunkerCategoriesToSidePanelCategories,
    enrichCategoryWithDevant,
    convertKnowledgeBaseCategoriesToSidePanelCategories
} from "../../../utils/bi";
import { findCurrentIntegrationCategory } from "../../../utils/function-category";
import { useDraftNodeManager } from "./hooks/useDraftNodeManager";
import { NodePosition, STNode } from "@wso2/syntax-tree";
import { View, ProgressIndicator, ThemeColors } from "@wso2/ui-toolkit";
import { applyModifications, textToModifications } from "../../../utils/utils";
import { PanelManager, SidePanelView } from "./PanelManager";
import { transformCategories, getNodeTemplateForConnection, findFunctionByName } from "./utils";
import { PanelOverlayProvider } from "./context/PanelOverlayContext";
import { PanelOverlayRenderer } from "./PanelOverlayRenderer";
import { ExpressionFormField, Category as PanelCategory, S } from "@wso2/ballerina-side-panel";
import { cloneDeep, debounce } from "lodash";
import { ConnectionKind } from "../../../components/ConnectionSelector";
import AddAgentPopup from "../AIChatAgent/AddAgentPopup";
import { DiagramSkeleton } from "../../../components/Skeletons";
import { AI_COMPONENT_PROGRESS_MESSAGE, AI_COMPONENT_PROGRESS_MESSAGE_TIMEOUT, GET_DEFAULT_EMBEDDING_PROVIDER, GET_DEFAULT_MODEL_PROVIDER, LOADING_MESSAGE } from "../../../constants";
import { ConnectionListItem } from "@wso2/wso2-platform-core";
import { usePlatformExtContext } from "../../../providers/platform-ext-ctx-provider";

const Container = styled.div`
    width: 100%;
    height: calc(100vh - 50px);
`;

// Stacking context above the side panel (z 2000) so the popup backdrop covers the whole screen.
const AddAgentPopupLayer = styled.div`
    position: relative;
    z-index: 2100;
`;

export interface BIFlowDiagramProps {
    projectPath: string;
    breakpointState?: number;
    syntaxTree?: STNode;
    onUpdate: () => void;
    onReady: (fileName: string, parentMetadata?: ParentMetadata, position?: NodePosition, parentCodedata?: CodeData) => void;
    onSave?: () => void;
}

// Navigation stack interface
interface NavigationStackItem {
    view: SidePanelView;
    categories: PanelCategory[];
    selectedNode?: FlowNode;
    clientName?: string;
}

export type FormSubmitOptions = {
    closeSidePanel?: boolean;
    isChangeFromHelperPane?: boolean;
    postUpdateCallBack?: () => void;
};

type NodePromptLaunchOptions = {
    autoSubmit?: boolean;
    planMode?: boolean;
};

const SIDE_PANEL_DEFAULT_ERROR_MESSAGE = "Error while performing the action.";

export function BIFlowDiagram(props: BIFlowDiagramProps) {
    const { projectPath, breakpointState, syntaxTree, onUpdate, onReady, onSave } = props;
    const { rpcClient } = useRpcContext();


    const [model, setModel] = useState<Flow>();
    const [suggestedModel, setSuggestedModel] = useState<Flow>();
    const [showSidePanel, setShowSidePanel] = useState(false);
    const [sidePanelView, setSidePanelView] = useState<SidePanelView>(SidePanelView.NODE_LIST);
    const [categories, setCategories] = useState<PanelCategory[]>([]); //
    const [searchText, setSearchText] = useState<string>("");
    const [fetchingAiSuggestions, setFetchingAiSuggestions] = useState(false);
    const [showProgressIndicator, setShowProgressIndicator] = useState(false);
    const [showProgressSpinner, setShowProgressSpinner] = useState<boolean>(false);
    const [progressMessage, setProgressMessage] = useState<string>(LOADING_MESSAGE);
    const [progressTitle, setProgressTitle] = useState<string>("");
    const [subPanel, setSubPanel] = useState<SubPanel>({ view: SubPanelView.UNDEFINED });
    const [updatedExpressionField, setUpdatedExpressionField] = useState<any>(undefined);
    const [breakpointInfo, setBreakpointInfo] = useState<BreakpointInfo>();
    const [selectedConnectionKind, setSelectedConnectionKind] = useState<ConnectionKind>();
    const [selectedNodeId, setSelectedNodeId] = useState<string>();
    const [importingConn, setImportingConn] = useState<ConnectionListItem>();
    const [projectOrg, setProjectOrg] = useState<string>("");
    const [entrypointContext, setEntrypointContext] = useState<{ serviceName?: string; functionName?: string }>();
    const [isUserAuthenticated, setIsUserAuthenticated] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
    // Navigation stack for back navigation
    const [navigationStack, setNavigationStack] = useState<NavigationStackItem[]>([]);
    const {
        addDraftNode,
        cancelDraft,
        savingDraft,
        completeDraft,
        hasDraft,
        isProcessing: isDraftProcessing,
        description: draftDescription,
        originalModel,
    } = useDraftNodeManager(model);

    const isMountedRef = useRef(true);
    const selectedNodeRef = useRef<FlowNode>();
    const nodeTemplateRef = useRef<FlowNode>();
    const hasRenameOperation = useRef<boolean>(false);
    const topNodeRef = useRef<FlowNode | Branch>();
    const targetRef = useRef<LineRange>();
    const suggestedText = useRef<string>();
    const selectedClientName = useRef<string>();
    const initialCategoriesRef = useRef<any[]>([]);
    const showEditForm = useRef<boolean>(false);
    const selectedNodeMetadata = useRef<{ nodeId: string; metadata: any; fileName: string }>();
    const shouldUpdateLineRangeRef = useRef<boolean>(false);
    const updatedNodeRef = useRef<FlowNode>(undefined);
    const [targetLineRange, setTargetLineRange] = useState<LineRange>(targetRef?.current);

    const [showAddAgentPopup, setShowAddAgentPopup] = useState(false);
    const isCreatingNewModelProvider = useRef<boolean>(false);
    const isCreatingNewVectorStore = useRef<boolean>(false);
    const isCreatingNewEmbeddingProvider = useRef<boolean>(false);
    const isCreatingNewVectorKnowledgeBase = useRef<boolean>(false);
    const isCreatingNewDataLoader = useRef<boolean>(false);
    const isCreatingNewChunker = useRef<boolean>(false);
    const isCreatingNewWorkflow = useRef<boolean>(false);
    const isCreatingNewActivity = useRef<boolean>(false);

    const clearWorkflowCreationState = () => {
        isCreatingNewWorkflow.current = false;
    };

    const { platformExtState, platformRpcClient, onLinkDevantProject, importConnection: importDevantConn } = usePlatformExtContext()

    const enrichedCategories = useMemo(() => {
        return enrichCategoryWithDevant(platformExtState?.devantConns?.list, categories, importingConn)
    }, [platformExtState, categories, importingConn])

    const handleClickImportDevantConn = (data: ConnectionListItem) => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.AddConnectionWizard,
                documentUri: model.fileName,
                metadata: { target: targetRef.current.startLine },
            },
            isPopup: true,
        });
        importDevantConn.setConnection(data)
    }

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        debouncedGetFlowModelForBreakpoints();
    }, [breakpointState]);

    useEffect(() => {
        rpcClient.onTraceAnimationChanged((event: TraceAnimationEvent) => {
            console.log('[TraceAnimation] Webview received event:', event.type, event.active, event.toolNames);
            if (event.active) {
                setTraceAnimationActive(event.toolNames, event.type, event.activeToolName, event.systemInstructions, event.entrypointServiceName, event.entrypointFunctionName);
            } else {
                setTraceAnimationInactive(event.type, event.activeToolName);
            }
        });
    }, [rpcClient]);

    useEffect(() => {
        rpcClient.onProjectContentUpdated(() => {
            debouncedGetFlowModel();
        })
        rpcClient.onParentPopupSubmitted((parent: ParentPopupData) => {
            if (parent.dataMapperMetadata) {
                // Skip if the parent is a data mapper popup
                return;
            }
            setSearchText("");
            if (parent.artifactType === DIRECTORY_MAP.AGENT_TOOL) {
                // Agent tool creation is handled by AIAgentSidePanel — skip to avoid interfering
                return;
            }
            if (
                parent.artifactType === DIRECTORY_MAP.FUNCTION ||
                parent.artifactType === DIRECTORY_MAP.WORKFLOW ||
                parent.artifactType === DIRECTORY_MAP.NP_FUNCTION ||
                parent.artifactType === DIRECTORY_MAP.DATA_MAPPER
            ) {
                handleOnSelectNode(
                    selectedNodeMetadata.current.nodeId,
                    selectedNodeMetadata.current.metadata,
                    selectedNodeMetadata.current.fileName
                );
            } else {
                if (!topNodeRef.current || !targetRef.current) {
                    console.error(">>> No parent or target found");
                    return;
                }
                setShowProgressIndicator(true);
                // Always clear search text when returning from popup
                // (handles both save and cancel/close scenarios)
                if (parent.artifactType === DIRECTORY_MAP.CONNECTION) {
                    setSidePanelView(SidePanelView.NODE_LIST);
                    updateConnectionWithNewItem(parent.recentIdentifier);
                    platformRpcClient?.refreshConnectionList();
                }
                fetchNodesAndAISuggestions(topNodeRef.current, targetRef.current, false, false);
            }
        });

        rpcClient.getVisualizerLocation().then((location) => {
            setProjectOrg(location.org);
        });

        // Check user authentication status
        rpcClient.getAiPanelRpcClient().isUserAuthenticated()
            .then((isAuth) => {
                setIsUserAuthenticated(isAuth);
            })
            .catch(() => {
                setIsUserAuthenticated(false);
            });

    }, [rpcClient]);

    useEffect(() => {
        const unsubscribe = rpcClient.onIdentifierUpdated((renames) => {
            if (!isMountedRef.current) return;
            if (renames?.length > 0) {
                hasRenameOperation.current = true;
            }
        });

        return () => {
            unsubscribe?.();
        };
    }, [rpcClient]);

    const updateConnectionWithNewItem = (recentIdentifier: string) => {
        // Add a new item as loading into the "Connections" category
        setCategories((prev: PanelCategory[]) => {
            // Find the "Connections" category
            const updated = prev.map((cat) => {
                if (cat.title === "Connections") {
                    // Add new item to the items array and sort the items by title
                    return {
                        ...cat,
                        items: [
                            ...(cat.items || []),
                            { title: recentIdentifier, isLoading: true, items: [] }
                        ].sort((a, b) => (a as PanelCategory).title.localeCompare((b as PanelCategory).title))
                    };
                }
                return cat;
            });
            return updated as PanelCategory[];
        });
    };


    const changeTargetRange = (range: LineRange) => {
        targetRef.current = range;
        setTargetLineRange(range);
    }

    const debouncedGetFlowModel = useCallback(
        debounce(() => {
            getFlowModel();
        }, 1000),
        [hasDraft]
    );

    // Shorter debounce specifically for breakpoint changes (faster feedback)
    const debouncedGetFlowModelForBreakpoints = useCallback(
        debounce(() => {
            getFlowModel();
        }, 200),
        []
    );

    // Navigation stack helpers
    const pushToNavigationStack = (
        view: SidePanelView,
        cats: PanelCategory[],
        node?: FlowNode,
        clientName?: string
    ) => {
        const newItem: NavigationStackItem = {
            view,
            categories: cats,
            selectedNode: node,
            clientName,
        };
        setNavigationStack((prev) => [...prev, newItem]);
    };

    const popFromNavigationStack = () => {
        setNavigationStack((prev) => {
            if (prev.length === 0) return prev;
            const newStack = [...prev];
            const poppedItem = newStack.pop();
            return newStack;
        });

        if (navigationStack.length > 0) {
            const lastItem = navigationStack[navigationStack.length - 1];
            setSidePanelView(lastItem.view);
            setCategories(lastItem.categories);
            selectedNodeRef.current = lastItem.selectedNode;
            selectedClientName.current = lastItem.clientName;
            return true;
        }
        return false;
    };

    const clearNavigationStack = () => {
        setNavigationStack([]);
    };

    const popNavigationStackUntilView = (targetView: SidePanelView) => {
        setNavigationStack((prev) => {
            const newStack = [...prev];
            while (newStack.length > 0) {
                const lastItem = newStack[newStack.length - 1];
                if (lastItem.view === targetView) {
                    // Found the target view, restore it
                    setSidePanelView(lastItem.view);
                    setCategories(lastItem.categories);
                    selectedNodeRef.current = lastItem.selectedNode;
                    selectedClientName.current = lastItem.clientName;
                    newStack.pop();
                    return newStack;
                }
                newStack.pop();
            }
            return [];
        });

        const targetItem = navigationStack.find((item) => item.view === targetView);
        return !!targetItem;
    };

    const handleModelProviderAdded = async () => {
        // Try to navigate back to MODEL_PROVIDER_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.MODEL_PROVIDER_LIST);

        if (foundInStack) {
            setShowProgressIndicator(true);
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getAvailableModelProviders({
                    position: targetRef.current.startLine,
                    filePath: model?.fileName,
                });
                setCategories(convertModelProviderCategoriesToSidePanelCategories(response.categories as Category[]));
                setSidePanelView(SidePanelView.MODEL_PROVIDER_LIST);
                setShowSidePanel(true);
            } catch (error) {
                console.error(">>> Error refreshing model providers", error);
            } finally {
                setShowProgressIndicator(false);
            }
        } else {
            console.log(">>> MODEL_PROVIDER_LIST not found in navigation stack, closing panel");
            closeSidePanelAndFetchUpdatedFlowModel();
        }
    };

    const handleVectorStoreAdded = async () => {
        // Try to navigate back to VECTOR_STORE_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.VECTOR_STORE_LIST);

        if (foundInStack) {
            setShowProgressIndicator(true);
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getAvailableVectorStores({
                    position: targetRef.current.startLine,
                    filePath: model?.fileName,
                });
                setCategories(
                    convertVectorStoreCategoriesToSidePanelCategories(response.categories as Category[])
                );
                setSidePanelView(SidePanelView.VECTOR_STORE_LIST);
                setShowSidePanel(true);
            } catch (error) {
                console.error(">>> Error refreshing vector stores", error);
            } finally {
                setShowProgressIndicator(false);
            }
        } else {
            console.log(">>> VECTOR_STORE_LIST not found in navigation stack, closing panel");
            closeSidePanelAndFetchUpdatedFlowModel();
        }
    };

    const handleEmbeddingProviderAdded = async () => {
        // Try to navigate back to EMBEDDING_PROVIDER_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.EMBEDDING_PROVIDER_LIST);

        if (foundInStack) {
            setShowProgressIndicator(true);
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getAvailableEmbeddingProviders({
                    position: targetRef.current.startLine,
                    filePath: model?.fileName,
                });
                setCategories(
                    convertEmbeddingProviderCategoriesToSidePanelCategories(response.categories as Category[])
                );
                setSidePanelView(SidePanelView.EMBEDDING_PROVIDER_LIST);
                setShowSidePanel(true);
            } catch (error) {
                console.error(">>> Error refreshing embedding providers", error);
            } finally {
                setShowProgressIndicator(false);
            }
        } else {
            console.log(">>> EMBEDDING_PROVIDER_LIST not found in navigation stack, closing panel");
            closeSidePanelAndFetchUpdatedFlowModel();
        }
    };

    const handleVectorKnowledgeBaseAdded = async () => {
        // Try to navigate back to KNOWLEDGE_BASE_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.KNOWLEDGE_BASE_LIST);

        if (foundInStack) {
            setShowProgressIndicator(true);
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getAvailableVectorKnowledgeBases({
                    position: targetRef.current.startLine,
                    filePath: model?.fileName,
                });
                setCategories(
                    convertKnowledgeBaseCategoriesToSidePanelCategories(response.categories as Category[])
                );
                setSidePanelView(SidePanelView.KNOWLEDGE_BASE_LIST);
                setShowSidePanel(true);
            } catch (error) {
                console.error(">>> Error refreshing knowledge bases", error);
            } finally {
                setShowProgressIndicator(false);
            }
        } else {
            console.log(">>> KNOWLEDGE_BASE_LIST not found in navigation stack, closing panel");
            closeSidePanelAndFetchUpdatedFlowModel();
        }
    };

    const handleDataLoaderAdded = async () => {
        // Try to navigate back to DATA_LOADER_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.DATA_LOADER_LIST);

        if (foundInStack) {
            setShowProgressIndicator(true);
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getAvailableDataLoaders({
                    position: targetRef.current.startLine,
                    filePath: model?.fileName,
                });
                setCategories(convertDataLoaderCategoriesToSidePanelCategories(response.categories as Category[]));
                setSidePanelView(SidePanelView.DATA_LOADER_LIST);
                setShowSidePanel(true);
            } catch (error) {
                console.error(">>> Error refreshing data loaders", error);
            } finally {
                setShowProgressIndicator(false);
            }
        } else {
            console.log(">>> DATA_LOADER_LIST not found in navigation stack, closing panel");
            closeSidePanelAndFetchUpdatedFlowModel();
        }
    };

    const handleChunkerAdded = async () => {
        // Try to navigate back to CHUNKER_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.CHUNKER_LIST);

        if (foundInStack) {
            setShowProgressIndicator(true);
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getAvailableChunkers({
                    position: targetRef.current.startLine,
                    filePath: model?.fileName,
                });
                setCategories(convertChunkerCategoriesToSidePanelCategories(response.categories as Category[]));
                setSidePanelView(SidePanelView.CHUNKER_LIST);
                setShowSidePanel(true);
            } catch (error) {
                console.error(">>> Error refreshing chunkers", error);
            } finally {
                setShowProgressIndicator(false);
            }
        } else {
            console.log(">>> CHUNKER_LIST not found in navigation stack, closing panel");
            closeSidePanelAndFetchUpdatedFlowModel();
        }
    };

    const handleActivityAdded = async () => {
        // Try to navigate back to ACTIVITY_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.ACTIVITY_LIST);

        if (foundInStack) {
            setShowProgressIndicator(true);
            try {
                const response = await rpcClient.getBIDiagramRpcClient().search({
                    position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                    filePath: model?.fileName,
                    queryMap: undefined,
                    searchKind: "ACTIVITY_CALL",
                });
                const panelCategories = convertFunctionCategoriesToSidePanelCategories(
                    response.categories as Category[],
                    FUNCTION_TYPE.REGULAR
                );
                const currentIntegrationCategory = findCurrentIntegrationCategory(panelCategories);
                if (currentIntegrationCategory && !currentIntegrationCategory.items.length) {
                    currentIntegrationCategory.description = "No activities defined. Click below to create a new activity.";
                }
                setCategories(panelCategories);
                setSidePanelView(SidePanelView.ACTIVITY_LIST);
                setShowSidePanel(true);
            } catch (error) {
                console.error(">>> Error refreshing activities", error);
            } finally {
                setShowProgressIndicator(false);
            }
        } else {
            console.log(">>> ACTIVITY_LIST not found in navigation stack, closing panel");
            closeSidePanelAndFetchUpdatedFlowModel();
        }
    };

    const handleWorkflowAdded = async () => {
        // Try to navigate back to WORKFLOW_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.WORKFLOW_LIST);

        if (foundInStack) {
            setShowProgressIndicator(true);
            try {
                const response = await rpcClient.getBIDiagramRpcClient().search({
                    position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                    filePath: model?.fileName,
                    queryMap: undefined,
                    searchKind: "WORKFLOW_RUN",
                });
                const panelCategories = convertFunctionCategoriesToSidePanelCategories(
                    response.categories as Category[],
                    FUNCTION_TYPE.REGULAR
                );
                const currentIntegrationCategory = findCurrentIntegrationCategory(panelCategories);
                if (currentIntegrationCategory && !currentIntegrationCategory.items.length) {
                    currentIntegrationCategory.description = "No workflows defined. Click below to create a new workflow.";
                }
                setCategories(panelCategories);
                setSidePanelView(SidePanelView.WORKFLOW_LIST);
                setShowSidePanel(true);
            } catch (error) {
                console.error(">>> Error refreshing workflows", error);
            } finally {
                setShowProgressIndicator(false);
            }
        } else {
            console.log(">>> WORKFLOW_LIST not found in navigation stack, closing panel");
            closeSidePanelAndFetchUpdatedFlowModel();
        }
    };

    const getFlowModel = () => {
        setShowProgressIndicator(true);
        onUpdate();

        // Re-check authentication status
        rpcClient.getAiPanelRpcClient().isUserAuthenticated()
            .then((isAuth) => {
                setIsUserAuthenticated(isAuth);
            })
            .catch(() => {
                setIsUserAuthenticated(false);
            });

        rpcClient
            .getBIDiagramRpcClient()
            .getBreakpointInfo()
            .then((response) => {
                setBreakpointInfo(response);
                rpcClient
                    .getBIDiagramRpcClient()
                    .getFlowModel({})
                    .then((model) => {
                        console.log(">>> BIFlowDiagram getFlowModel", model);
                        if (model?.flowModel) {
                            const currentSelectedNode = selectedNodeRef.current;
                            if (
                                currentSelectedNode &&
                                typeof currentSelectedNode?.properties?.variable?.value === "string"
                            ) {
                                const updatedSelectedNode = searchNodesByStartLine(model.flowModel.nodes, currentSelectedNode?.codedata.lineRange.startLine);
                                if (updatedSelectedNode) {
                                    selectedNodeRef.current = updatedSelectedNode;
                                    setSelectedNodeId(updatedSelectedNode.id);
                                }
                            }
                            updateAgentModelTypes(model?.flowModel);
                            setModel(model.flowModel);
                            const eventStartNode = model.flowModel.nodes.find((node) => node.codedata.node === "EVENT_START");
                            const parentMetadata = eventStartNode?.metadata.data as ParentMetadata | undefined;
                            const parentCodedata = eventStartNode?.codedata;
                            if (shouldUpdateLineRangeRef.current) {
                                const varName = typeof updatedNodeRef.current?.properties?.variable?.value === "string"
                                    ? updatedNodeRef.current.properties.variable.value
                                    : "";
                                const newNode = searchNodesByName(model.flowModel.nodes, varName)
                                changeTargetRange({
                                    startLine: newNode.codedata.lineRange.endLine,
                                    endLine: newNode.codedata.lineRange.endLine
                                })
                            }
                            // Get visualizer location and pass position to onReady + set entrypoint context
                            rpcClient.getVisualizerLocation().then((location: VisualizerLocation) => {
                                console.log(">>> Visualizer location", location?.position);
                                onReady(model.flowModel.fileName, parentMetadata, location?.position, parentCodedata);
                                let serviceName = '';
                                for (const candidate of [location.parentIdentifier, location.identifier]) {
                                    const val = candidate ?? '';
                                    const dashIdx = val.lastIndexOf(' - ');
                                    if (dashIdx >= 0) {
                                        serviceName = val.substring(dashIdx + 3);
                                        break;
                                    }
                                }
                                const functionName = parentMetadata?.label
                                    ? (parentMetadata.isServiceFunction ? `/${parentMetadata.label}` : parentMetadata.label)
                                    : '';
                                setEntrypointContext({ serviceName, functionName });
                            });
                        }
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                        setShowProgressSpinner(false);
                        onReady(undefined, undefined, undefined);
                        if (hasDraft) {
                            completeDraft();
                        }
                    });
            });
    };

    // Hack: Updates agent model types based on ModelProvider connections
    // This is so that we render the icons for the models in the AgentCallNodeWidget
    function updateAgentModelTypes(flowModel?: Flow) {
        if (!flowModel || !Array.isArray(flowModel.connections) || !Array.isArray(flowModel.nodes)) return;

        const setModelType = (modelObj: any, providerName: string) => {
            if (modelObj) {
                modelObj.type = providerName;
            }
        };

        flowModel.connections
            .filter(
                (connection) =>
                    connection?.codedata?.object === "ModelProvider" ||
                    connection?.codedata?.object === "OpenAiModelProvider"
            )
            .forEach((connection) => {
                const modelVarName = connection?.properties?.variable?.value;
                const modelProviderName = connection?.codedata?.module;
                if (!modelVarName || !modelProviderName) return;

                flowModel.nodes.forEach((node: FlowNode) => {
                    const nodeMetadata = node?.metadata?.data as NodeMetadata;
                    if (node?.codedata?.node === "AGENT_CALL" && nodeMetadata?.model?.name === modelVarName) {
                        setModelType(nodeMetadata.model, modelProviderName);
                    } else if (node?.codedata?.node === "ERROR_HANDLER" && Array.isArray(node.branches)) {
                        node.branches.forEach((branch) => {
                            (branch.children ?? []).forEach((child) => {
                                const childMetadata = child?.metadata?.data as NodeMetadata;
                                if (
                                    child.codedata.node === "AGENT_CALL" &&
                                    childMetadata?.model?.name === modelVarName
                                ) {
                                    setModelType(childMetadata.model, modelProviderName);
                                }
                            });
                        });
                    }
                });
            });
    }

    useEffect(() => {
        if (model && selectedNodeRef.current?.codedata?.lineRange?.startLine && sidePanelView === SidePanelView.FORM) {
            const matchingNode = findNodeByStartLine(model, selectedNodeRef.current.codedata.lineRange.startLine);
            // Only update refs if we found a matching node and it's different from the current one
            if (matchingNode && matchingNode.id !== selectedNodeRef.current.id) {
                selectedNodeRef.current = matchingNode;
                changeTargetRange(matchingNode.codedata.lineRange)
            }
        }
    }, [model]);

    const findNodeByStartLine = (flowModel: Flow, startLine: any): FlowNode | undefined => {
        if (!flowModel || !flowModel.nodes || !startLine) {
            return undefined;
        }

        // Helper function to check if a node matches the target startLine
        const isNodeAtStartLine = (node: FlowNode): boolean => {
            if (!node.codedata || !node.codedata.lineRange || !node.codedata.lineRange.startLine) {
                return false;
            }

            const nodeStartLine = node.codedata.lineRange.startLine;

            // Check if the node's startLine matches the target startLine
            return nodeStartLine.line === startLine.line && nodeStartLine.offset === startLine.offset;
        };

        // Recursive function to search through nodes and their branches
        const searchNodes = (nodes: FlowNode[]): FlowNode | undefined => {
            for (const node of nodes) {
                if (isNodeAtStartLine(node)) {
                    return node;
                }

                if (node.branches && node.branches.length > 0) {
                    for (const branch of node.branches) {
                        if (branch.children && branch.children.length > 0) {
                            const foundNode = searchNodes(branch.children);
                            if (foundNode) {
                                return foundNode;
                            }
                        }
                    }
                }
            }

            return undefined;
        };

        return searchNodes(flowModel.nodes);
    };


    const findNodeWithName = (node: FlowNode, name: string) => {
        return node?.properties?.variable?.value === name;
    }

    const findNodeWithStartLine = (node: FlowNode, startLine: LinePosition) => {
        return (
            node?.codedata?.lineRange?.startLine.line === startLine.line &&
            node?.codedata?.lineRange?.startLine.offset === startLine.offset
        );
    }

    const searchNodesByName = (nodes: FlowNode[], name: string): FlowNode | undefined => {
        for (const node of nodes) {
            if (findNodeWithName(node, name)) {
                return node;
            }
            if (node.branches && node.branches.length > 0) {
                for (const branch of node.branches) {
                    if (branch.children && branch.children.length > 0) {
                        const foundNode = searchNodesByName(branch.children, name);
                        if (foundNode) {
                            return foundNode;
                        }
                    }
                }
            }
        }
        return undefined;
    };

    const searchNodesByStartLine = (nodes: FlowNode[], startLine: LinePosition): FlowNode | undefined => {
        for (const node of nodes) {
            if (findNodeWithStartLine(node, startLine)) {
                return node;
            }
            if (node.branches && node.branches.length > 0) {
                for (const branch of node.branches) {
                    if (branch.children && branch.children.length > 0) {
                        const foundNode = searchNodesByStartLine(branch.children, startLine);
                        if (foundNode) {
                            return foundNode;
                        }
                    }
                }
            }
        }
        return undefined;
    };

    const flattenNodes = (nodes: FlowNode[]): FlowNode[] => {
        const result: FlowNode[] = [];
        const traverse = (nodeList: FlowNode[]) => {
            for (const node of nodeList) {
                result.push(node);
                if (node.branches && node.branches.length > 0) {
                    for (const branch of node.branches) {
                        if (branch.children && branch.children.length > 0) {
                            traverse(branch.children);
                        }
                    }
                }
            }
        };
        traverse(nodes);
        return result;
    };

    const getNodeBefore = (targetNode: FlowNode, nodes: FlowNode[]): FlowNode | undefined => {
        const flattened = flattenNodes(nodes);
        const index = flattened.findIndex(node => node.id === targetNode.id);
        if (index > 0) {
            return flattened[index - 1];
        }
        return undefined;
    };

    const getNodeAfter = (targetNode: FlowNode, nodes: FlowNode[]): FlowNode | undefined => {
        const flattened = flattenNodes(nodes);
        const index = flattened.findIndex(node => node.id === targetNode.id);
        if (index >= 0 && index < flattened.length - 1) {
            return flattened[index + 1];
        }
        return undefined;
    };

    const resetNodeSelectionStates = () => {
        setShowSidePanel(false);
        setSidePanelView(SidePanelView.NODE_LIST);
        setSubPanel({ view: SubPanelView.UNDEFINED });
        setSelectedNodeId(undefined);
        selectedNodeRef.current = undefined;
        nodeTemplateRef.current = undefined;
        topNodeRef.current = undefined;
        targetRef.current = undefined;
        changeTargetRange(undefined);
        selectedClientName.current = undefined;
        showEditForm.current = false;
        isCreatingNewModelProvider.current = false;
        isCreatingNewVectorStore.current = false;
        isCreatingNewEmbeddingProvider.current = false;
        isCreatingNewVectorKnowledgeBase.current = false;
        isCreatingNewDataLoader.current = false;
        isCreatingNewChunker.current = false;
        setErrorMessage(undefined);
        setShowProgressIndicator(false);
        setShowProgressSpinner(false);
        clearNavigationStack();
    };

    const closeSidePanelAndFetchUpdatedFlowModel = () => {
        resetNodeSelectionStates();
        // Fetch the updated flow model
        debouncedGetFlowModel();
        if (hasDraft) {
            // completeDraft();
            setSuggestedModel(undefined);
            suggestedText.current = undefined;
        }
    };

    const handleOnCloseSidePanel = () => {
        resetNodeSelectionStates();
        // Cancel draft and return to previous flow model
        if (hasDraft) {
            const restoredModel = cancelDraft();
            if (restoredModel) {
                setModel(restoredModel);
            }
            setSuggestedModel(undefined);
            suggestedText.current = undefined;
        }
    };

    const fetchNodesAndAISuggestions = (
        parent: FlowNode | Branch,
        target: LineRange,
        fetchAiSuggestions = false,
        updateFlowModel = true,
        isOnAddNode = false
    ) => {
        if (!parent || !target) {
            console.error(">>> No parent or target found");
            return;
        }
        const getNodeRequest: BIAvailableNodesRequest = {
            position: target.startLine,
            filePath: model?.fileName || parent?.codedata?.lineRange.fileName,
        };
        // show side panel with available nodes
        setShowProgressIndicator(true);
        // Add draft node to model using hook
        if (updateFlowModel) {
            const modelWithDraft = addDraftNode(parent, target);
            setModel(modelWithDraft);
        }
        setShowSidePanel(true);
        isOnAddNode && setSidePanelView(SidePanelView.LOADING);
        rpcClient
            .getBIDiagramRpcClient()
            .getAvailableNodes(getNodeRequest)
            .then((response) => {
                console.log(">>> Available nodes", response);
                if (!response.categories) {
                    console.error(">>> Error getting available nodes", response);
                    setErrorMessage(SIDE_PANEL_DEFAULT_ERROR_MESSAGE);
                    setSidePanelView(SidePanelView.ERROR);
                    return;
                }

                // Use the utility function to filter categories
                const filteredCategories = transformCategories(response.categories);
                const convertedCategories = convertBICategoriesToSidePanelCategories(filteredCategories);

                // Store initial categories for later merging
                let finalCategories = convertedCategories;
                initialCategoriesRef.current = convertedCategories;

                setSidePanelView(SidePanelView.NODE_LIST);
                setCategories(convertedCategories);
            })
            .finally(() => {
                setShowProgressIndicator(false);
            });

        if (!fetchAiSuggestions) {
            return;
        }
        // get ai suggestions
        setFetchingAiSuggestions(true);
        const suggestionFetchingTimeout = setTimeout(() => {
            console.log(">>> AI suggestion fetching timeout");
            setFetchingAiSuggestions(false);
        }, 10000); // 10 seconds

        rpcClient
            .getBIDiagramRpcClient()
            .getAiSuggestions({ position: target, filePath: model.fileName })
            .then((model) => {
                console.log(">>> ai suggested new flow", model);
                if (model?.flowModel?.nodes?.length > 0) {
                    setSuggestedModel(model.flowModel);
                    suggestedText.current = model.suggestion;
                }
            })
            .finally(() => {
                clearTimeout(suggestionFetchingTimeout);
                setFetchingAiSuggestions(false);
            });
    };

    const handleOnAddNode = (parent: FlowNode | Branch, target: LineRange) => {
        // clear previous click if had
        if (topNodeRef.current || targetRef.current) {
            closeSidePanelAndFetchUpdatedFlowModel();
            return;
        }
        // handle add new node
        topNodeRef.current = parent;
        changeTargetRange(target)
        fetchNodesAndAISuggestions(parent, target, undefined, undefined, true);
    };

    const handleOnAddNodePrompt = (
        parent: FlowNode | Branch,
        target: LineRange,
        prompt: string,
        options?: NodePromptLaunchOptions
    ) => {
        // Create CodeContext from the target position
        // TODO: Offset seem to be wrong. Investigate further
        const filePath = target.fileName || model.fileName;
        const codeContext: CodeContext = {
            type: 'addition',
            position: {
                line: target.startLine.line,
                offset: target.startLine.offset
            },
            filePath
        };

        // Create AIPanelPrompt with CodeContext - agent mode is the default
        const aiPrompt: AIPanelPrompt = {
            type: 'text',
            text: prompt || '',
            planMode: options?.planMode ?? true,
            codeContext,
            autoSubmit: options?.autoSubmit ?? false,
        };

        // Use the standard pattern - import from utils/commands
        rpcClient.getAiPanelRpcClient().openAIPanel(aiPrompt);
    };

    const handleSearch = useCallback(async (searchText: string, functionType: FUNCTION_TYPE, searchKind: SearchKind) => {
        const queryMap = searchText.trim()
            ? {
                q: searchText,
                limit: 12,
                offset: 0,
                ...(searchKind === "FUNCTION" ? { includeAvailableFunctions: "true" } : {})
            }
            : undefined;

        const request: BISearchRequest = {
            position: {
                startLine: targetRef.current.startLine,
                endLine: targetRef.current.endLine,
            },
            filePath: model.fileName,
            queryMap: {
                q: searchText.trim(),
                limit: 60,
                offset: 0,
                includeAvailableFunctions: "true",
            },
            searchKind,
        };
        const isWorkflowSearch = searchKind === "WORKFLOW_RUN";
        console.log(`>>> Search ${searchKind.toLowerCase()} request`, request);
        setShowProgressIndicator(true);
        try {
            const response = await rpcClient.getBIDiagramRpcClient().search(request);

            if (response.categories) {

                if (searchKind === "ALL") {                // Convert search API results
                    const searchCategories = convertFunctionCategoriesToSidePanelCategories(
                        response.categories as Category[],
                        functionType
                    );

                    // Combine initial getAvailableNodes results with search API results
                    const allCategories = [...initialCategoriesRef.current, ...searchCategories];

                    // Filter both initial and search results with the same query
                    const filteredCategories = filterCategoriesLocally(allCategories, searchText);

                    // Start fresh with filtered combined results
                    const currentCategories: PanelCategory[] = [];

                    const getItemKey = (item: any) =>
                        "id" in item ? `node:${item.id}` : `category:${item.title}`;

                    filteredCategories.forEach(category => {
                        const existingCategoryIndex = currentCategories.findIndex(
                            existingCategory => existingCategory.title === category.title
                        );

                        if (existingCategoryIndex >= 0) {
                            // Merge items if category exists, avoiding duplicate items
                            const existingCategory = currentCategories[existingCategoryIndex];
                            const existingItemKeys = new Set(existingCategory.items.map(getItemKey));
                            const newItems = category.items.filter((item: any) => !existingItemKeys.has(getItemKey(item)));
                            currentCategories[existingCategoryIndex] = {
                                ...existingCategory,
                                items: [...existingCategory.items, ...newItems]
                            };
                        } else {
                            // Add new category
                            currentCategories.push(category);
                        }
                    });
                    setCategories(currentCategories);
                } else {
                    const currentCategories = convertFunctionCategoriesToSidePanelCategories(
                        [...response.categories] as Category[],
                        functionType
                    );
                    const currentIntegrationCategory = findCurrentIntegrationCategory(currentCategories);
                    if (currentIntegrationCategory && !currentIntegrationCategory.items.length) {
                        if (isWorkflowSearch) {
                            currentIntegrationCategory.description = "No workflows defined. Click below to create a new workflow.";
                        } else if (searchKind === "ACTIVITY_CALL") {
                            currentIntegrationCategory.description = "No activities defined. Click below to create a new activity.";
                        }
                    }
                    setCategories(currentCategories);
                }

                // Set the appropriate side panel view based on search kind and function type
                let panelView: SidePanelView;
                switch (searchKind) {
                    case "FUNCTION":
                        panelView =
                            functionType === FUNCTION_TYPE.REGULAR
                                ? SidePanelView.FUNCTION_LIST
                                : SidePanelView.DATA_MAPPER_LIST;
                        break;
                    case "WORKFLOW_RUN":
                        panelView = SidePanelView.WORKFLOW_LIST;
                        break;
                    case "ACTIVITY_CALL":
                        panelView = SidePanelView.ACTIVITY_LIST;
                        break;
                    case "NP_FUNCTION":
                        panelView = SidePanelView.NP_FUNCTION_LIST;
                        break;
                    case "MODEL_PROVIDER":
                        panelView = SidePanelView.MODEL_PROVIDER_LIST;
                        break;
                    case "VECTOR_STORE":
                        panelView = SidePanelView.VECTOR_STORE_LIST;
                        break;
                    case "EMBEDDING_PROVIDER":
                        panelView = SidePanelView.EMBEDDING_PROVIDER_LIST;
                        break;
                    case "KNOWLEDGE_BASE":
                        panelView = SidePanelView.KNOWLEDGE_BASE_LIST;
                        break;
                    case "DATA_LOADER":
                        panelView = SidePanelView.DATA_LOADER_LIST;
                        break;
                    case "CHUNKER":
                        panelView = SidePanelView.CHUNKER_LIST;
                        break;
                    case "ALL":
                        // For "ALL" search, determine the best panel view based on categories returned
                        panelView = SidePanelView.ALL;
                        break;
                    default:
                        panelView = SidePanelView.NODE_LIST;
                }

                setSidePanelView(panelView);
                setShowSidePanel(true);
            }
        } catch (error) {
            console.error(">>> Error in search request", error);
            // Fallback to cached categories on error
            setShowProgressIndicator(false);
            setCategories(initialCategoriesRef.current);
        } finally {
            setShowProgressIndicator(false);
        }
    }, [rpcClient, model?.fileName]);

    const handleRetryNodeFetch = () => {
        if (topNodeRef.current && targetRef.current) {
            fetchNodesAndAISuggestions(topNodeRef.current, targetRef.current, false, false, true);
        }
    };

    const showConnectorError = () => {
        setErrorMessage(SIDE_PANEL_DEFAULT_ERROR_MESSAGE);
        setSidePanelView(SidePanelView.ERROR);
        setShowSidePanel(true);
    }

    const handleSearchNpFunction = async (searchText: string, functionType: FUNCTION_TYPE) => {
        await handleSearch(searchText, functionType, "NP_FUNCTION");
    };

    const handleSearchFunction = async (searchText: string, functionType: FUNCTION_TYPE) => {
        await handleSearch(searchText, functionType, "FUNCTION");
    };

     const handleSearchWorkflow = async (searchText: string, functionType: FUNCTION_TYPE) => {
        // NOTE: Backend payloads may still contain legacy "WORKFLOW_START" in some environments.
        // FE is intentionally standardized on "WORKFLOW_RUN"; align API/LS payloads to avoid mismatches.
        await handleSearch(searchText, functionType, "WORKFLOW_RUN");
    };

    const handleSearchActivity = async (searchText: string, functionType: FUNCTION_TYPE) => {
        await handleSearch(searchText, functionType, "ACTIVITY_CALL");
    };

    const handleSearchModelProvider = async (_searchText: string, _functionType: FUNCTION_TYPE) => {
        // await handleSearch(searchText, functionType, "MODEL_PROVIDER");
    };

    const handleSearchVectorStore = async (_searchText: string, _functionType: FUNCTION_TYPE) => {
        // await handleSearch(searchText, functionType, "VECTOR_STORE");
    };

    const handleSearchEmbeddingProvider = async (_searchText: string, _functionType: FUNCTION_TYPE) => {
        // await handleSearch(searchText, functionType, "EMBEDDING_PROVIDER");
    };

    const handleSearchVectorKnowledgeBase = async (_searchText: string, _functionType: FUNCTION_TYPE) => {
        // await handleSearch(searchText, functionType, "KNOWLEDGE_BASE");
    };

    const handleSearchDataLoader = async (_searchText: string, _functionType: FUNCTION_TYPE) => {
        // await handleSearch(searchText, functionType, "DATA_LOADER");
    };

    const handleSearchChunker = async (_searchText: string, _functionType: FUNCTION_TYPE) => {
        // await handleSearch(searchText, functionType, "CHUNKER");
    };

    const handleSearchTextChange = (text: string) => {
        setSearchText(text);

        // Immediately reset searching state when text is cleared
        if (!text.trim()) {
            // setIsSearching(false);
            setShowProgressIndicator(false);
        }
    };

    // Frontend filtering function for cached categories - handles nested structures
    const filterCategoriesLocally = useCallback((categories: any[], searchText: string): any[] => {
        if (!searchText.trim()) return categories;

        const lowerSearchText = searchText.toLowerCase();

        const filterItemsRecursively = (items: any[]): any[] => {
            if (!items) return [];

            return items.map((item: any) => {
                // Check if this item matches the search
                const label = item.title || item.label;
                const itemMatches = label.toLowerCase().includes(lowerSearchText);
                if (itemMatches) {
                    return item;
                }
                // If this item has nested items (subcategory), recursively filter them
                if (item.items && Array.isArray(item.items)) {
                    const filteredSubItems = filterItemsRecursively(item.items);

                    // Include this subcategory if it matches OR has matching nested items
                    if (filteredSubItems.length > 0) {
                        return {
                            ...item,
                            items: filteredSubItems
                        };
                    }
                    return null; // Filter out this subcategory
                }
                return null;
            }).filter(item => item !== null);
        };

        return categories.map(category => ({
            ...category,
            items: filterItemsRecursively(category.items || [])
        })).filter(category => category.items && category.items.length > 0);
    }, []);

    // Debounced search following AddConnectionPopupContent pattern
    const debouncedSearch = useMemo(
        () => debounce((searchText: string) => {
            if (searchText.trim()) {
                setShowProgressIndicator(true);
                handleSearch(searchText, FUNCTION_TYPE.REGULAR, "ALL");
            } else {
                // Reset to cached categories when search is empty
                setCategories(initialCategoriesRef.current);
                setShowProgressIndicator(false);
            }
        }, 1100), // 1100ms delay like AddConnectionPopupContent
        [handleSearch]
    );

    const debouncedSearchRef = useRef(debouncedSearch);
    useEffect(() => {
        debouncedSearchRef.current?.cancel();
        debouncedSearchRef.current = debouncedSearch;
    }, [debouncedSearch]);

    // Effect to handle search text changes
    useEffect(() => {
        if (searchText.trim()) {
            debouncedSearch(searchText);
        } else {
            // Reset immediately when search is cleared
            debouncedSearch.cancel(); // Cancel any pending search
            setCategories(initialCategoriesRef.current);
            setSidePanelView(SidePanelView.NODE_LIST);
            setShowProgressIndicator(false);
        }
        return () => debouncedSearchRef.current?.cancel();
    }, [searchText, debouncedSearch]);

    const updateArtifactLocation = async (artifacts: UpdatedArtifactsResponse) => {
        await rpcClient.getVisualizerRpcClient().updateCurrentArtifactLocation(artifacts);

        if (isCreatingNewModelProvider.current) {
            isCreatingNewModelProvider.current = false;
            await handleModelProviderAdded();
            return;
        }
        if (isCreatingNewVectorStore.current) {
            isCreatingNewVectorStore.current = false;
            await handleVectorStoreAdded();
            return;
        }
        if (isCreatingNewEmbeddingProvider.current) {
            isCreatingNewEmbeddingProvider.current = false;
            await handleEmbeddingProviderAdded();
            return;
        }
        if (isCreatingNewVectorKnowledgeBase.current) {
            isCreatingNewVectorKnowledgeBase.current = false;
            await handleVectorKnowledgeBaseAdded();
            return;
        }
        if (isCreatingNewDataLoader.current) {
            isCreatingNewDataLoader.current = false;
            await handleDataLoaderAdded();
            return;
        }
        if (isCreatingNewChunker.current) {
            isCreatingNewChunker.current = false;
            await handleChunkerAdded();
            return;
        }
        if (isCreatingNewWorkflow.current) {
            clearWorkflowCreationState();
            await handleWorkflowAdded();
            return;
        }
        if (isCreatingNewActivity.current) {
            isCreatingNewActivity.current = false;
            await handleActivityAdded();
            return;
        }
        closeSidePanelAndFetchUpdatedFlowModel();
    };

    const handleOnSelectNode = (nodeId: string, metadata?: any, fileName?: string) => {
        selectedNodeMetadata.current = { nodeId, metadata, fileName: model?.fileName || fileName };
        const { node, category } = metadata as { node: AvailableNode; category?: string };

        // Push current state to navigation stack before navigating
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);

        switch (node.codedata.node) {
            case "FUNCTION":
                setShowProgressIndicator(true);
                rpcClient
                    .getBIDiagramRpcClient()
                    .search({
                        position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                        filePath: model?.fileName || fileName,
                        queryMap: undefined,
                        searchKind: "FUNCTION",
                    })
                    .then((response) => {
                        setCategories(
                            convertFunctionCategoriesToSidePanelCategories(
                                response.categories as Category[],
                                FUNCTION_TYPE.REGULAR
                            )
                        );
                        setSidePanelView(SidePanelView.FUNCTION_LIST);
                        setShowSidePanel(true);
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                    });
                break;

            case "DATA_MAPPER_CALL":
                setShowProgressIndicator(true);
                rpcClient
                    .getBIDiagramRpcClient()
                    .search({
                        position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                        filePath: model?.fileName || fileName,
                        queryMap: undefined,
                        searchKind: "FUNCTION",
                    })
                    .then((response) => {
                        setCategories(
                            convertFunctionCategoriesToSidePanelCategories(
                                response.categories as Category[],
                                FUNCTION_TYPE.EXPRESSION_BODIED
                            )
                        );
                        setSidePanelView(SidePanelView.DATA_MAPPER_LIST);
                        setShowSidePanel(true);
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                    });
                break;

            case "NP_FUNCTION":
                setShowProgressIndicator(true);
                rpcClient
                    .getBIDiagramRpcClient()
                    .search({
                        position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                        filePath: model?.fileName || fileName,
                        queryMap: undefined,
                        searchKind: "NP_FUNCTION",
                    })
                    .then((response) => {
                        setCategories(
                            convertFunctionCategoriesToSidePanelCategories(
                                response.categories as Category[],
                                FUNCTION_TYPE.REGULAR
                            )
                        );
                        setSidePanelView(SidePanelView.NP_FUNCTION_LIST);
                        setShowSidePanel(true);
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                    });
                break;

            case "WORKFLOW_RUN":
                // First click from node list should open searchable workflow list.
                if (sidePanelView === SidePanelView.NODE_LIST) {
                    setShowProgressIndicator(true);
                    const workflowSearchRequest: BISearchRequest = {
                        position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                        filePath: model?.fileName || fileName,
                        queryMap: undefined,
                        searchKind: "WORKFLOW_RUN",
                    };
                    const searchPromise = rpcClient.getBIDiagramRpcClient().search(workflowSearchRequest);
                    searchPromise
                        .then((response) => {
                            const panelCategories = convertFunctionCategoriesToSidePanelCategories(
                                response.categories as Category[],
                                FUNCTION_TYPE.REGULAR
                            );
                            const currentIntegrationCategory = findCurrentIntegrationCategory(panelCategories);
                            if (currentIntegrationCategory && !currentIntegrationCategory.items.length) {
                                currentIntegrationCategory.description = "No workflows defined. Click below to create a new workflow.";
                            }
                            setCategories(panelCategories);
                            setSidePanelView(SidePanelView.WORKFLOW_LIST);
                            setShowSidePanel(true);
                        })
                        .finally(() => {
                            setShowProgressIndicator(false);
                        });
                    break;
                }

                // Selecting an item from workflow list should open the node template form.
                selectedClientName.current = category;
                setShowProgressIndicator(true);
                rpcClient
                    .getBIDiagramRpcClient()
                    .getNodeTemplate({
                        position: targetRef.current.startLine,
                        filePath: model?.fileName || fileName,
                        id: node.codedata,
                    })
                    .then((response) => {
                        selectedNodeRef.current = response.flowNode;
                        nodeTemplateRef.current = response.flowNode;
                        showEditForm.current = false;
                        setSidePanelView(SidePanelView.FORM);
                        setShowSidePanel(true);
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                    });
                break;

            case "ACTIVITY_CALL":
                // First click from node list should open searchable activity list.
                if (sidePanelView === SidePanelView.NODE_LIST) {
                    setShowProgressIndicator(true);
                    rpcClient
                        .getBIDiagramRpcClient()
                        .search({
                            position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                            filePath: model?.fileName || fileName,
                            queryMap: undefined,
                            searchKind: "ACTIVITY_CALL",
                        })
                        .then((response) => {
                            const panelCategories = convertFunctionCategoriesToSidePanelCategories(
                                response.categories as Category[],
                                FUNCTION_TYPE.REGULAR
                            );
                            const currentIntegrationCategory = findCurrentIntegrationCategory(panelCategories);
                            if (currentIntegrationCategory && !currentIntegrationCategory.items.length) {
                                currentIntegrationCategory.description = "No activities defined. Click below to create a new activity.";
                            }
                            setCategories(panelCategories);
                            setSidePanelView(SidePanelView.ACTIVITY_LIST);
                            setShowSidePanel(true);
                        })
                        .finally(() => {
                            setShowProgressIndicator(false);
                        });
                    break;
                }

                // Selecting an item from activity list should open the node template form.
                selectedClientName.current = category;
                setShowProgressIndicator(true);
                rpcClient
                    .getBIDiagramRpcClient()
                    .getNodeTemplate({
                        position: targetRef.current.startLine,
                        filePath: model?.fileName || fileName,
                        id: node.codedata,
                    })
                    .then((response) => {
                        selectedNodeRef.current = response.flowNode;
                        nodeTemplateRef.current = response.flowNode;
                        showEditForm.current = false;
                        setSidePanelView(SidePanelView.FORM);
                        setShowSidePanel(true);
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                    });
                break;

            case "AGENTS":
                loadAvailableAgents(fileName);
                break;

            case "MODEL_PROVIDERS":
                setShowProgressIndicator(true);
                rpcClient
                    .getBIDiagramRpcClient()
                    .getAvailableModelProviders({
                        position: targetRef.current.startLine,
                        filePath: model?.fileName || fileName,
                    })
                    .then((response) => {
                        setCategories(
                            convertFunctionCategoriesToSidePanelCategories(
                                response.categories as Category[],
                                FUNCTION_TYPE.REGULAR
                            )
                        );
                        setSidePanelView(SidePanelView.MODEL_PROVIDER_LIST);
                        setShowSidePanel(true);
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                    });
                break;

            case "VECTOR_STORES":
                setShowProgressIndicator(true);
                rpcClient
                    .getBIDiagramRpcClient()
                    .getAvailableVectorStores({
                        position: targetRef.current.startLine,
                        filePath: model?.fileName || fileName,
                    })
                    .then((response) => {
                        setCategories(
                            convertFunctionCategoriesToSidePanelCategories(
                                response.categories as Category[],
                                FUNCTION_TYPE.REGULAR
                            )
                        );
                        setSidePanelView(SidePanelView.VECTOR_STORE_LIST);
                        setShowSidePanel(true);
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                    });
                break;

            case "EMBEDDING_PROVIDERS":
                setShowProgressIndicator(true);
                rpcClient
                    .getBIDiagramRpcClient()
                    .getAvailableEmbeddingProviders({
                        position: targetRef.current.startLine,
                        filePath: model?.fileName || fileName,
                    })
                    .then((response) => {
                        setCategories(
                            convertFunctionCategoriesToSidePanelCategories(
                                response.categories as Category[],
                                FUNCTION_TYPE.REGULAR
                            )
                        );
                        setSidePanelView(SidePanelView.EMBEDDING_PROVIDER_LIST);
                        setShowSidePanel(true);
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                    });
                break;

            case "KNOWLEDGE_BASES":
                setShowProgressIndicator(true);
                rpcClient
                    .getBIDiagramRpcClient()
                    .getAvailableVectorKnowledgeBases({
                        position: targetRef.current.startLine,
                        filePath: model?.fileName || fileName,
                    })
                    .then((response) => {
                        setCategories(
                            convertKnowledgeBaseCategoriesToSidePanelCategories(response.categories as Category[])
                        );
                        setSidePanelView(SidePanelView.KNOWLEDGE_BASE_LIST);
                        setShowSidePanel(true);
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                    });
                break;

            case "DATA_LOADERS":
                setShowProgressIndicator(true);
                rpcClient
                    .getBIDiagramRpcClient()
                    .getAvailableDataLoaders({
                        position: targetRef.current.startLine,
                        filePath: model?.fileName || fileName,
                    })
                    .then((response) => {
                        setCategories(convertDataLoaderCategoriesToSidePanelCategories(response.categories as Category[]));
                        setSidePanelView(SidePanelView.DATA_LOADER_LIST);
                        setShowSidePanel(true);
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                    });
                break;

            case "CHUNKERS":
                setShowProgressIndicator(true);
                rpcClient
                    .getBIDiagramRpcClient()
                    .getAvailableChunkers({
                        position: targetRef.current.startLine,
                        filePath: model?.fileName || fileName,
                    })
                    .then((response) => {
                        setCategories(convertChunkerCategoriesToSidePanelCategories(response.categories as Category[]));
                        setSidePanelView(SidePanelView.CHUNKER_LIST);
                        setShowSidePanel(true);
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                    });
                break;

            default:
                // default node
                selectedClientName.current = category;
                setShowProgressIndicator(true);
                rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                    position: targetRef.current.startLine,
                    filePath: model?.fileName || fileName,
                    id: node.codedata,
                })
                    .then((response: any) => {
                        if (response.errorMsg) {
                            showConnectorError();
                            return;
                        }
                        selectedNodeRef.current = response.flowNode;
                        nodeTemplateRef.current = response.flowNode;
                        showEditForm.current = false;
                        setSidePanelView(SidePanelView.FORM);
                        setShowSidePanel(true);
                    })
                    .catch(() => {
                        showConnectorError();
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                    });
                break;
        }
    };

    const handleOnSelectNewConnection = async (nodeId: string, metadata?: any) => {
        // Push current state to navigation stack before navigating
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);
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
            setSidePanelView(SidePanelView.CONNECTION_CREATE);
            setShowSidePanel(true);
        } finally {
            setShowProgressIndicator(false);
        }
    };

    const handleOnFormSubmit = async (
        updatedNode?: FlowNode,
        editorConfig?: EditorConfig,
        options?: FormSubmitOptions
    ) => {
        if (!updatedNode) {
            console.log(">>> No updated node found");
            updatedNode = selectedNodeRef.current;
            debouncedGetFlowModel();
            return;
        }

        // The form holds a stale copy of the node, so its lineRange may be outdated
        // after source-modifying operations like renames. Patch it from selectedNodeRef
        // which is kept up-to-date by handleRenameComplete and getFlowModel.
        if (hasRenameOperation.current) {
            const selectedLineRange = selectedNodeRef.current?.codedata?.lineRange;
            if (selectedLineRange && updatedNode.codedata) {
                updatedNode.codedata.lineRange = selectedLineRange;
            }
            hasRenameOperation.current = false;
        }

        setShowProgressIndicator(true);
        // TODO: Uncomment this when the draft added with AI agent is implemented
        // savingDraft(); 
        const noFormSubmitOptions = !options ||
            (
                options?.closeSidePanel === undefined
                && options?.isChangeFromHelperPane === undefined
                && options?.postUpdateCallBack === undefined
            );

        if (
            options?.isChangeFromHelperPane &&
            selectedNodeRef.current?.codedata &&
            !selectedNodeRef.current.codedata.isNew
        ) {
            const baseStartLine = selectedNodeRef.current.codedata.lineRange.startLine;
            const safeOffset = Math.max(0, baseStartLine.offset - 1);
            let targetLine = { ...baseStartLine, offset: safeOffset };

            const nodeBefore = model ? getNodeBefore(selectedNodeRef.current, model.nodes) : undefined;
            if (nodeBefore && nodeBefore.codedata.lineRange.endLine.line < targetLine.line) {
                targetLine = nodeBefore.codedata.lineRange.endLine;
            }

            updatedNode.codedata.lineRange.startLine = targetLine;
            updatedNode.codedata.lineRange.endLine = targetLine;
        }

        const nodeToSubmit = cloneDeep(updatedNode);
        if (nodeToSubmit?.codedata?.node === "ACTIVITY" && nodeToSubmit?.codedata?.isNew) {
            delete nodeToSubmit.codedata.lineRange;
        }

        if (
            editorConfig &&
            editorConfig.view === MACHINE_VIEW.InlineDataMapper &&
            editorConfig.displayMode !== EditorDisplayMode.NONE
        ) {
            rpcClient
                .getDataMapperRpcClient()
                .getInitialIDMSource({
                    filePath: model.fileName,
                    flowNode: nodeToSubmit,
                })
                .then((response) => {
                    if (response.codedata) {
                        if (options?.postUpdateCallBack) {
                            options.postUpdateCallBack();
                        }
                        shouldUpdateLineRangeRef.current = options?.isChangeFromHelperPane;
                        updatedNodeRef.current = nodeToSubmit;
                        rpcClient.getVisualizerRpcClient().openView({
                            type: EVENT_TYPE.OPEN_VIEW,
                            location: {
                                view: MACHINE_VIEW.InlineDataMapper,
                                documentUri: model.fileName,
                                position: {
                                    startLine: response.codedata.lineRange.startLine.line,
                                    startColumn: response.codedata.lineRange.startLine.offset,
                                    endLine: response.codedata.lineRange.endLine.line,
                                    endColumn: response.codedata.lineRange.endLine.offset,
                                },
                                dataMapperMetadata: {
                                    name: nodeToSubmit.properties?.variable?.value as string,
                                    codeData: response.codedata,
                                }
                            },
                            isPopup: editorConfig.displayMode === EditorDisplayMode.POPUP
                        });
                    }
                })
                .finally(() => {
                    if (editorConfig.displayMode !== EditorDisplayMode.POPUP) setShowSidePanel(false);
                    if (options?.postUpdateCallBack) {
                        options.postUpdateCallBack();
                    }
                    setShowProgressIndicator(false);
                });
            return;
        }

        const NODES_TO_SKIP_ARTIFACT = ["MODEL_PROVIDER", "KNOWLEDGE_BASE", "DATA_LOADER"];
        let skipArtifact = false;
        if (NODES_TO_SKIP_ARTIFACT.includes(updatedNode?.codedata?.node)) {
            skipArtifact = true;
        }

        rpcClient
            .getBIDiagramRpcClient()
            .getSourceCode({
                filePath: model.fileName,
                flowNode: nodeToSubmit,
                isFunctionNodeUpdate: editorConfig?.displayMode !== EditorDisplayMode.NONE,
                isHelperPaneChange: options?.isChangeFromHelperPane,
                artifactData: !skipArtifact ? getArtifactData(editorConfig) : undefined,

            })
            .then(async (response) => {
                if (response.artifacts.length > 0) {

                    if (editorConfig && editorConfig.displayMode !== EditorDisplayMode.NONE) {
                        const newArtifact = response.artifacts.find(res => res.isNew);
                        if (newArtifact) {
                            rpcClient.getVisualizerRpcClient().openView({ type: EVENT_TYPE.OPEN_VIEW, location: { documentUri: newArtifact.path, position: newArtifact.position } });
                            return;
                        }
                    }

                    if (updatedNode?.codedata?.symbol === GET_DEFAULT_MODEL_PROVIDER || updatedNode?.codedata?.symbol === GET_DEFAULT_EMBEDDING_PROVIDER
                        || (updatedNode?.codedata?.node === "AGENT_CALL" && (updatedNode?.properties?.model?.value === "" || updatedNode?.properties?.model?.value === undefined))) {
                        const providerKind = updatedNode?.codedata?.symbol === GET_DEFAULT_EMBEDDING_PROVIDER ? "embedding" : "model";
                        await rpcClient.getAIAgentRpcClient().configureDefaultModelProvider(providerKind);
                    }
                    if (noFormSubmitOptions) {
                        selectedNodeRef.current = undefined;
                        await updateArtifactLocation(response);
                    }
                    if (options?.closeSidePanel) {
                        selectedNodeRef.current = undefined;
                        closeSidePanelAndFetchUpdatedFlowModel();
                    }
                    shouldUpdateLineRangeRef.current = options?.isChangeFromHelperPane;
                    if (options?.isChangeFromHelperPane) {
                        const updatedModel = await rpcClient.getBIDiagramRpcClient().getFlowModel({});
                        if (!updatedModel?.flowModel) {
                            console.error(">>> Flow model missing after helper-pane update");
                            return;
                        }

                        let newTargetLineRange = targetLineRange;
                        if (!selectedNodeRef.current?.codedata?.isNew) {
                            const insertedVariableNode = searchNodesByStartLine(
                                updatedModel.flowModel.nodes,
                                selectedNodeRef.current.codedata.lineRange.startLine
                            );
                            if (!insertedVariableNode) {
                                console.error(">>> Inserted node not found in updated flow model");
                                return;
                            }
                            const updatedSelectedNode = getNodeAfter(insertedVariableNode, updatedModel.flowModel.nodes);
                            if (!updatedSelectedNode) {
                                console.error(">>> Selected node not found in updated flow model");
                                return;
                            }
                            newTargetLineRange = updatedSelectedNode.codedata.lineRange;
                        } else {
                            const newNode = searchNodesByName(
                                updatedModel.flowModel.nodes,
                                nodeToSubmit.properties?.variable?.value as string
                            );
                            if (!newNode || !newTargetLineRange) {
                                console.error(">>> New node or targetLineRange missing after helper-pane update");
                                return;
                            }
                            newTargetLineRange.startLine = newNode.codedata.lineRange.endLine;
                            newTargetLineRange.endLine = newNode.codedata.lineRange.endLine;
                        }

                        if (newTargetLineRange) {
                            changeTargetRange(newTargetLineRange);
                        }
                        shouldUpdateLineRangeRef.current = false;
                    }
                    updatedNodeRef.current = updatedNode;
                    if (options?.postUpdateCallBack) {
                        options.postUpdateCallBack();
                    }
                } else {
                    console.error(">>> Error updating source code", response);
                }
            })
            .finally(() => {
                setShowProgressIndicator(false);
                if (options?.closeSidePanel === true) {
                    setShowSidePanel(false);
                }
            });
    };


    function getArtifactData(editorConfig?: EditorConfig) {
        // When editorConfig is absent, derive the artifact type from the EVENT_START node's metadata.
        //   kind="Function" + label="main" → AUTOMATION
        //   kind="Function" + other label  → FUNCTION
        //   isServiceFunction              → SERVICE
        if (!editorConfig) {
            const eventStartNode = model?.nodes?.find((node) => node.codedata.node === "EVENT_START");
            const parentData = eventStartNode?.metadata?.data as ParentMetadata;
            if (parentData) {
                const { kind, label, isServiceFunction } = parentData;
                if (!isServiceFunction && kind === "Function") {
                    if (label?.toLowerCase() === "main") {
                        return { artifactType: DIRECTORY_MAP.AUTOMATION };
                    }
                    return { artifactType: DIRECTORY_MAP.FUNCTION };
                }
                if (isServiceFunction) {
                    return { artifactType: DIRECTORY_MAP.SERVICE };
                }
            }
        } else {
            if (editorConfig.artifactType) {
                return { artifactType: editorConfig.artifactType };
            }
            if (
                editorConfig.displayMode !== EditorDisplayMode.NONE &&
                editorConfig.view === MACHINE_VIEW.DataMapper
            ) {
                return { artifactType: DIRECTORY_MAP.DATA_MAPPER };
            }
        }
    }

    const handleOnDeleteNode = async (node: FlowNode) => {
        setShowProgressIndicator(true);

        const deleteNodeResponse = await rpcClient.getBIDiagramRpcClient().deleteFlowNode({
            filePath: model.fileName,
            flowNode: node,
        });
        if (deleteNodeResponse.artifacts.length === 0) {
            console.error(">>> Error updating source code", deleteNodeResponse);
        }

        await updateArtifactLocation(deleteNodeResponse);

        selectedNodeRef.current = undefined;
        closeSidePanelAndFetchUpdatedFlowModel();
        setShowProgressIndicator(false);
        debouncedGetFlowModel();
    };

    const handleOnAddComment = (comment: string, target: LineRange) => {
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
                    value: `\n${comment}\n\n`,
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
            .then(async (response) => {
                if (response.artifacts.length > 0) {
                    selectedNodeRef.current = undefined;
                    await updateArtifactLocation(response);
                    closeSidePanelAndFetchUpdatedFlowModel();
                } else {
                    console.error(">>> Error updating source code", response);
                }
            });
    };

    const handleOnEditNode = async (node: FlowNode) => {
        setSelectedNodeId(node.id);
        selectedNodeRef.current = node;
        if (suggestedText.current) {
            // use targetRef from suggested model
        } else {
            topNodeRef.current = undefined;
            targetRef.current = node.codedata.lineRange;
            setTargetLineRange(node.codedata.lineRange)
        }
        if (!targetRef.current) {
            return;
        }

        setShowProgressIndicator(true);
        rpcClient.getBIDiagramRpcClient().getNodeTemplate({
            position: targetRef.current.startLine,
            filePath: model.fileName,
            id: node.codedata,
        })
            .then((response: any) => {
                if (response.errorMsg) {
                    showConnectorError();
                    return;
                }
                nodeTemplateRef.current = response.flowNode;
                showEditForm.current = true;
                setSidePanelView(SidePanelView.FORM);
                setShowSidePanel(true);
            })
            .catch(() => {
                setErrorMessage(SIDE_PANEL_DEFAULT_ERROR_MESSAGE);
                setSidePanelView(SidePanelView.ERROR);
                setShowSidePanel(true);
            })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

    const handleOnFormBack = () => {
        clearWorkflowCreationState();

        // Try to navigate back using the navigation stack
        const didNavigateBack = popFromNavigationStack();

        if (!didNavigateBack) {
            // Fallback to original logic if stack is empty
            if (sidePanelView === SidePanelView.MODEL_PROVIDERS) {
                handleOnSelectNode(
                    selectedNodeMetadata.current.nodeId,
                    selectedNodeMetadata.current.metadata,
                    selectedNodeMetadata.current.fileName
                );
                setCategories([]);
                setSidePanelView(SidePanelView.MODEL_PROVIDER_LIST);
            } else if (sidePanelView === SidePanelView.VECTOR_STORES) {
                handleOnSelectNode(
                    selectedNodeMetadata.current.nodeId,
                    selectedNodeMetadata.current.metadata,
                    selectedNodeMetadata.current.fileName
                );
                setCategories([]);
                setSidePanelView(SidePanelView.VECTOR_STORE_LIST);
            } else if (sidePanelView === SidePanelView.EMBEDDING_PROVIDERS) {
                handleOnSelectNode(
                    selectedNodeMetadata.current.nodeId,
                    selectedNodeMetadata.current.metadata,
                    selectedNodeMetadata.current.fileName
                );
                setCategories([]);
                setSidePanelView(SidePanelView.EMBEDDING_PROVIDER_LIST);
            } else if (sidePanelView === SidePanelView.DATA_LOADERS) {
                handleOnSelectNode(
                    selectedNodeMetadata.current.nodeId,
                    selectedNodeMetadata.current.metadata,
                    selectedNodeMetadata.current.fileName
                );
                setCategories([]);
                setSidePanelView(SidePanelView.DATA_LOADER_LIST);
            } else if (sidePanelView === SidePanelView.KNOWLEDGE_BASES) {
                handleOnSelectNode(
                    selectedNodeMetadata.current.nodeId,
                    selectedNodeMetadata.current.metadata,
                    selectedNodeMetadata.current.fileName
                );
                setCategories([]);
                setSidePanelView(SidePanelView.KNOWLEDGE_BASE_LIST);
            } else if (sidePanelView === SidePanelView.CHUNKERS) {
                handleOnSelectNode(
                    selectedNodeMetadata.current.nodeId,
                    selectedNodeMetadata.current.metadata,
                    selectedNodeMetadata.current.fileName
                );
                setCategories([]);
                setSidePanelView(SidePanelView.CHUNKER_LIST);
            } else if (
                sidePanelView === SidePanelView.FORM &&
                selectedNodeMetadata.current.metadata.node.codedata.node === "KNOWLEDGE_BASE"
            ) {
                handleOnSelectNode(
                    selectedNodeMetadata.current.nodeId,
                    selectedNodeMetadata.current.metadata,
                    selectedNodeMetadata.current.fileName
                );
                setCategories([]);
                setSidePanelView(SidePanelView.KNOWLEDGE_BASE_LIST);
            } else if (
                sidePanelView === SidePanelView.FUNCTION_LIST ||
                sidePanelView === SidePanelView.WORKFLOW_LIST ||
                sidePanelView === SidePanelView.ACTIVITY_LIST ||
                sidePanelView === SidePanelView.DATA_MAPPER_LIST ||
                sidePanelView === SidePanelView.NP_FUNCTION_LIST ||
                sidePanelView === SidePanelView.MODEL_PROVIDER_LIST ||
                sidePanelView === SidePanelView.VECTOR_STORE_LIST ||
                sidePanelView === SidePanelView.EMBEDDING_PROVIDER_LIST ||
                sidePanelView === SidePanelView.KNOWLEDGE_BASE_LIST ||
                sidePanelView === SidePanelView.DATA_LOADER_LIST ||
                sidePanelView === SidePanelView.CHUNKER_LIST
            ) {
                setCategories(initialCategoriesRef.current);
                setSidePanelView(SidePanelView.NODE_LIST);
            } else {
                setSidePanelView(SidePanelView.NODE_LIST);
                setSubPanel({ view: SubPanelView.UNDEFINED });
            }
            selectedNodeRef.current = undefined;
        }

        setSubPanel({ view: SubPanelView.UNDEFINED });
    };

    const handleOnAddConnection = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.AddConnectionWizard,
                documentUri: model.fileName,
                metadata: {
                    target: targetRef.current.startLine,
                },
            },
            isPopup: true,
        });
    };

    const handleOnSelectConnectorConfiguration = useCallback((_nodeId: string, metadata: { node: any; category?: string }) => {
        const connector = metadata.node as AvailableNode;

        if (!model?.fileName || !targetRef.current?.startLine) {
            console.error("Cannot open connector configuration: missing model or target");
            return;
        }

        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.ConnectionConfiguration,
                documentUri: model.fileName,
                metadata: {
                    target: targetRef.current.startLine,
                    selectedConnectorId: connector.codedata?.id,
                    selectedConnectorOrg: connector.codedata?.org,
                    selectedConnectorModule: connector.codedata?.module,
                    selectedConnectorPackageName: connector.codedata?.packageName,
                    selectedConnectorObject: connector.codedata?.object,
                    selectedConnectorSymbol: connector.codedata?.symbol,
                    selectedConnectorVersion: connector.codedata?.version,
                    selectedConnectorIsGenerated: connector.codedata?.isGenerated,
                    selectedConnectorNode: connector.codedata?.node,
                    selectedConnectorLabel: connector.metadata?.label,
                    selectedConnectorDescription: connector.metadata?.description,
                    selectedConnectorIcon: connector.metadata?.icon,
                    categoryName: metadata.category
                }
            },
            isPopup: true,
        });
    }, [model, targetRef, categories, rpcClient, sidePanelView]);

    const handleOnEditConnection = (connectionName: string) => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.EditConnectionWizard,
                identifier: connectionName,
            },
            isPopup: true,
        });
    };

    const handleOnAddFunction = async () => {
        setShowProgressIndicator(true);
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);

        rpcClient.getBIDiagramRpcClient().getNodeTemplate({
            position: targetRef.current.startLine,
            filePath: model?.fileName,
            id: { node: "FUNCTION_CREATION" },
        })
            .then((response) => {
                selectedNodeRef.current = response.flowNode;
                nodeTemplateRef.current = response.flowNode;
                showEditForm.current = false;
                setSidePanelView(SidePanelView.FORM);
                setShowSidePanel(true);
            })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

    const handleOnAddWorkflow = () => {
        isCreatingNewWorkflow.current = true;
        setShowProgressIndicator(true);
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);

        rpcClient
            .getBIDiagramRpcClient()
            .getNodeTemplate({
                position: targetRef.current.startLine,
                filePath: model?.fileName,
                id: { node: "WORKFLOW" },
            })
            .then((response) => {
                selectedNodeRef.current = response.flowNode;
                nodeTemplateRef.current = response.flowNode;
                showEditForm.current = false;
                setSidePanelView(SidePanelView.FORM);
                setShowSidePanel(true);
            })
            .catch((error) => {
                console.error(">>> Error fetching workflow template", error);
                clearWorkflowCreationState();
                popFromNavigationStack();
            })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

    const handleOnAddActivity = () => {
        isCreatingNewActivity.current = true;
        setShowProgressIndicator(true);
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);

        rpcClient
            .getBIDiagramRpcClient()
            .getNodeTemplate({
                position: targetRef.current.startLine,
                filePath: model?.fileName,
                id: { node: "ACTIVITY" },
            })
            .then((response) => {
                selectedNodeRef.current = response.flowNode;
                nodeTemplateRef.current = response.flowNode;
                showEditForm.current = false;
                setSidePanelView(SidePanelView.FORM);
                setShowSidePanel(true);
            })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

   

    const handleOnAddNPFunction = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BINPFunctionForm,
                artifactType: DIRECTORY_MAP.NP_FUNCTION,
            },
            isPopup: true,
        });
    };

    const handleOnAddDataMapper = async () => {

        setShowProgressIndicator(true);
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);

        rpcClient.getBIDiagramRpcClient().getNodeTemplate({
            position: targetRef.current.startLine,
            filePath: model?.fileName,
            id: { node: "DATA_MAPPER_CREATION" },
        })
            .then((response) => {
                selectedNodeRef.current = response.flowNode;
                nodeTemplateRef.current = response.flowNode;
                showEditForm.current = false;
                setSidePanelView(SidePanelView.FORM);
                setShowSidePanel(true);
            })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

    // Common function to handle progress message with timeout
    const setupProgressMessageTimeout = () => {
        setProgressMessage(LOADING_MESSAGE);
        // hack: fetching from Central to build module dependency map in LS may take time, so show a different message after 3 seconds
        const messageTimeout = setTimeout(() => {
            setProgressMessage(AI_COMPONENT_PROGRESS_MESSAGE);
        }, AI_COMPONENT_PROGRESS_MESSAGE_TIMEOUT);
        return messageTimeout;
    };

    const cleanupProgressMessage = (messageTimeout: number) => {
        clearTimeout(messageTimeout);
        setProgressMessage(LOADING_MESSAGE);
    };

    const loadAvailableAgents = (fileNameOverride?: string) => {
        setShowProgressIndicator(true);
        return rpcClient
            .getBIDiagramRpcClient()
            .getAvailableAgents({
                position: targetRef.current.startLine,
                filePath: model?.fileName || fileNameOverride,
            })
            .then((response) => {
                setCategories(convertAgentCategoriesToSidePanelCategories(response.categories as Category[]));
                setSidePanelView(SidePanelView.AGENT_LIST);
                setShowSidePanel(true);
            })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

    const handleOnAddNewAgent = () => {
        setShowAddAgentPopup(true);
    };

    const handleAgentCreated = () => {
        setShowAddAgentPopup(false);
        loadAvailableAgents();
    };

    const handleOnAddNewModelProvider = () => {
        isCreatingNewModelProvider.current = true;
        setShowProgressIndicator(true);
        setShowProgressSpinner(true);
        setProgressTitle("Model Providers");
        const messageTimeout = setupProgressMessageTimeout();

        // Push current state to navigation stack
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);

        // Use search to get available model provider types
        rpcClient
            .getBIDiagramRpcClient()
            .search({
                position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                filePath: model?.fileName,
                queryMap: undefined,
                searchKind: "MODEL_PROVIDER",
            })
            .then((response) => {
                if (!isCreatingNewModelProvider.current) return;
                setCategories(convertModelProviderCategoriesToSidePanelCategories(response.categories as Category[]));
                setSidePanelView(SidePanelView.MODEL_PROVIDERS);
                setShowSidePanel(true);
            })
            .finally(() => {
                setShowProgressIndicator(false);
                setShowProgressSpinner(false);
                cleanupProgressMessage(messageTimeout);
            });
    };

    const handleOnAddNewVectorStore = () => {
        isCreatingNewVectorStore.current = true;
        setShowProgressIndicator(true);
        setShowProgressSpinner(true);
        setProgressTitle("Vector Stores");
        const messageTimeout = setupProgressMessageTimeout();

        // Push current state to navigation stack
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);

        // Use search to get available vector store types
        rpcClient
            .getBIDiagramRpcClient()
            .search({
                position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                filePath: model?.fileName,
                queryMap: undefined,
                searchKind: "VECTOR_STORE",
            })
            .then((response) => {
                if (!isCreatingNewVectorStore.current) return;
                setCategories(convertVectorStoreCategoriesToSidePanelCategories(response.categories as Category[]));
                setSidePanelView(SidePanelView.VECTOR_STORES);
                setShowSidePanel(true);
            })
            .finally(() => {
                setShowProgressIndicator(false);
                setShowProgressSpinner(false);
                cleanupProgressMessage(messageTimeout);
            });
    };

    const handleOnAddNewEmbeddingProvider = () => {
        isCreatingNewEmbeddingProvider.current = true;
        setShowProgressIndicator(true);
        setShowProgressSpinner(true);
        setProgressTitle("Embedding Providers");
        const messageTimeout = setupProgressMessageTimeout();

        // Push current state to navigation stack
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);

        // Use search to get available embedding provider types
        rpcClient
            .getBIDiagramRpcClient()
            .search({
                position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                filePath: model?.fileName,
                queryMap: undefined,
                searchKind: "EMBEDDING_PROVIDER",
            })
            .then((response) => {
                if (!isCreatingNewEmbeddingProvider.current) return;
                setCategories(
                    convertEmbeddingProviderCategoriesToSidePanelCategories(response.categories as Category[])
                );
                setSidePanelView(SidePanelView.EMBEDDING_PROVIDERS);
                setShowSidePanel(true);
            })
            .finally(() => {
                setShowProgressIndicator(false);
                setShowProgressSpinner(false);
                cleanupProgressMessage(messageTimeout);
            });
    };

    const handleOnAddNewVectorKnowledgeBase = () => {
        isCreatingNewVectorKnowledgeBase.current = true;
        setShowProgressIndicator(true);
        setShowProgressSpinner(true);
        setProgressTitle("Knowledge Bases");
        const messageTimeout = setupProgressMessageTimeout();

        // Push current state to navigation stack
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);

        // Use search to get available knowledge base types
        rpcClient
            .getBIDiagramRpcClient()
            .search({
                position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                filePath: model?.fileName,
                queryMap: undefined,
                searchKind: "KNOWLEDGE_BASE",
            })
            .then((response) => {
                if (!isCreatingNewVectorKnowledgeBase.current) return;
                setCategories(convertKnowledgeBaseCategoriesToSidePanelCategories(response.categories as Category[]));
                setSidePanelView(SidePanelView.KNOWLEDGE_BASES);
                setShowSidePanel(true);
            })
            .finally(() => {
                setShowProgressIndicator(false);
                setShowProgressSpinner(false);
                cleanupProgressMessage(messageTimeout);
            });
    };

    const handleOnAddNewDataLoader = () => {
        isCreatingNewDataLoader.current = true;
        setShowProgressIndicator(true);
        setShowProgressSpinner(true);
        setProgressTitle("Data Loaders");
        const messageTimeout = setupProgressMessageTimeout();

        // Push current state to navigation stack
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);

        // Use search to get available data loader types
        rpcClient
            .getBIDiagramRpcClient()
            .search({
                position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                filePath: model?.fileName,
                queryMap: undefined,
                searchKind: "DATA_LOADER",
            })
            .then((response) => {
                if (!isCreatingNewDataLoader.current) return;
                setCategories(convertDataLoaderCategoriesToSidePanelCategories(response.categories as Category[]));
                setSidePanelView(SidePanelView.DATA_LOADERS);
                setShowSidePanel(true);
            })
            .finally(() => {
                setShowProgressIndicator(false);
                setShowProgressSpinner(false);
                cleanupProgressMessage(messageTimeout);
            });
    };

    const handleOnAddNewChunker = () => {
        isCreatingNewChunker.current = true;
        setShowProgressIndicator(true);
        setShowProgressSpinner(true);
        setProgressTitle("Chunkers");
        const messageTimeout = setupProgressMessageTimeout();

        // Push current state to navigation stack
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);

        // Use search to get available chunker types
        rpcClient
            .getBIDiagramRpcClient()
            .search({
                position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                filePath: model?.fileName,
                queryMap: undefined,
                searchKind: "CHUNKER",
            })
            .then((response) => {
                if (!isCreatingNewChunker.current) return;
                setCategories(convertChunkerCategoriesToSidePanelCategories(response.categories as Category[]));
                setSidePanelView(SidePanelView.CHUNKERS);
                setShowSidePanel(true);
            })
            .finally(() => {
                setShowProgressIndicator(false);
                setShowProgressSpinner(false);
                cleanupProgressMessage(messageTimeout);
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

    // ai suggestions callbacks
    const onAcceptSuggestions = () => {
        if (!suggestedModel) {
            return;
        }
        // save suggested text
        const modifications = textToModifications(suggestedText.current, {
            startLine: targetRef.current.startLine.line,
            startColumn: targetRef.current.startLine.offset,
            endLine: targetRef.current.endLine.line,
            endColumn: targetRef.current.endLine.offset,
        });
        applyModifications(rpcClient, modifications);

        // clear diagram
        closeSidePanelAndFetchUpdatedFlowModel();
        onDiscardSuggestions();
    };

    const onDiscardSuggestions = () => {
        if (!suggestedModel) {
            return;
        }
        setSuggestedModel(undefined);
        suggestedText.current = undefined;
    };

    const handleOpenView = async (location: VisualizerLocation) => {
        const context: VisualizerLocation = {
            view: location.view,
            documentUri: location.documentUri,
            position: location.position,
            identifier: location.identifier,
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

    const handleSubPanel = (subPanel: SubPanel) => {
        setSubPanel(subPanel);
    };

    const handleUpdateExpressionField = (data: ExpressionFormField) => {
        setUpdatedExpressionField(data);
    };

    const handleResetUpdatedExpressionField = () => {
        setUpdatedExpressionField(undefined);
    };

    const handleOnChatWithAgent = (agentCallNode: FlowNode) => {
        const agentVarName = agentCallNode.properties?.connection?.value as string;
        if (!agentVarName || !model?.fileName) {
            console.error('Cannot start inline agent chat: missing agent variable name or file path');
            return;
        }
        rpcClient.getBIDiagramRpcClient().startInlineAgentChat({
            agentVarName,
            filePath: model.fileName,
            agentNode: agentCallNode,
        });
    };

    const updateNodeWithConnection = async (selectedNode: FlowNode) => {
        if (selectedNode.codedata.node === "KNOWLEDGE_BASE") {
            setSidePanelView(SidePanelView.FORM);
            return;
        }
        await rpcClient
            .getBIDiagramRpcClient()
            .getSourceCode({ filePath: projectPath, flowNode: selectedNode });
        closeSidePanelAndFetchUpdatedFlowModel();
    };

    const handleOnNavigateToPanel = (targetPanel: SidePanelView, connectionKind?: ConnectionKind) => {
        if (connectionKind) {
            setSelectedConnectionKind(connectionKind);
        }
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);
        setSidePanelView(targetPanel);
    };

    const handleGetProjectPath = async (props: JoinProjectPathRequest) => {
        return rpcClient.getVisualizerRpcClient().joinProjectPath(props);
    };

    const handleGetFunctionLocation = async (functionName: string): Promise<VisualizerLocation | undefined> => {
        const projectComponents = await rpcClient.getBIDiagramRpcClient().getProjectComponents();
        if (!projectComponents?.components) {
            return undefined;
        }

        const functionInfo: any = findFunctionByName(projectComponents.components, functionName);
        if (!functionInfo) {
            return undefined;
        }

        const position =
            (typeof functionInfo.startLine === "number" && typeof functionInfo.startColumn === "number"
                ? {
                    startLine: functionInfo.startLine,
                    startColumn: functionInfo.startColumn,
                    endLine: functionInfo.endLine,
                    endColumn: functionInfo.endColumn,
                }
                : functionInfo.position) ||
            (functionInfo.lineRange
                ? {
                    startLine: functionInfo.lineRange.startLine.line,
                    startColumn: functionInfo.lineRange.startLine.offset,
                    endLine: functionInfo.lineRange.endLine.line,
                    endColumn: functionInfo.lineRange.endLine.offset,
                }
                : undefined);

        if (!functionInfo.filePath || !position) {
            return undefined;
        }

        return {
            view: MACHINE_VIEW.BIDiagram,
            documentUri: functionInfo.filePath,
            position,
            identifier: functionInfo.name,
            projectPath,
        };
    };

    const flowModel = originalModel && suggestedModel ? suggestedModel : model;

    // Hide "Chat" button on agent nodes when already inside a chat agent flow diagram
    const isChatAgentFlow = (() => {
        const eventStartNode = flowModel?.nodes.find((node) => node.codedata.node === "EVENT_START");
        const meta = eventStartNode?.metadata?.data as { kind?: string; label?: string } | undefined;
        return meta?.kind === "AI Chat Agent" && meta?.label === "chat";
    })();

    const memoizedDiagramProps = useMemo(
        () => ({
            model: flowModel,
            onAddNode: handleOnAddNode,
            onAddNodePrompt: handleOnAddNodePrompt,
            onDeleteNode: handleOnDeleteNode,
            onAddComment: handleOnAddComment,
            onNodeSelect: handleOnEditNode,
            onConnectionSelect: handleOnEditConnection,
            goToSource: handleOnGoToSource,
            addBreakpoint: handleAddBreakpoint,
            removeBreakpoint: handleRemoveBreakpoint,
            openView: handleOpenView,
            goToAgent: handleGoToAgent,
            draftNode: {
                override: hasDraft && isDraftProcessing,
                showSpinner: isDraftProcessing,
                description: draftDescription,
            },
            selectedNodeId,
            // Agent editing happens in the agent focus diagram; the main-flow agent-call node is
            // read-only and only offers "Chat" + navigation to the focus view.
            agentNode: {
                onChatWithAgent: isChatAgentFlow ? undefined : handleOnChatWithAgent,
            },
            suggestions: {
                fetching: fetchingAiSuggestions,
                onAccept: onAcceptSuggestions,
                onDiscard: onDiscardSuggestions,
            },
            project: {
                org: projectOrg,
                path: projectPath,
                getProjectPath: handleGetProjectPath,
                getFunctionLocation: handleGetFunctionLocation,
            },
            breakpointInfo,
            readOnly: showProgressSpinner || showProgressIndicator || hasDraft || selectedNodeId !== undefined,
            overlay: {
                visible: selectedNodeId !== undefined || topNodeRef.current !== undefined || hasDraft,
                onClickOverlay: handleOnCloseSidePanel,
            },
            isUserAuthenticated,
            entrypointContext,
        }),
        [
            flowModel,
            fetchingAiSuggestions,
            projectOrg,
            projectPath,
            breakpointInfo,
            showProgressSpinner,
            showProgressIndicator,
            hasDraft,
            selectedNodeId,
            rpcClient,
            isUserAuthenticated,
            entrypointContext,
        ]
    );

    return (
        <PanelOverlayProvider>
            <View>
                {(showProgressIndicator || fetchingAiSuggestions) && model && (
                    <ProgressIndicator color={ThemeColors.PRIMARY} />
                )}
                <Container>
                    {!model && <DiagramSkeleton />}
                    {model && <MemoizedDiagram {...memoizedDiagramProps} />}
                </Container>
            </View>

            <PanelManager
                showSidePanel={showSidePanel}
                sidePanelView={sidePanelView}
                subPanel={subPanel}
                categories={enrichedCategories}
                selectedNode={selectedNodeRef.current}
                nodeFormTemplate={nodeTemplateRef.current}
                selectedClientName={selectedClientName.current}
                showEditForm={showEditForm.current}
                targetLineRange={targetLineRange}
                connections={model?.connections}
                fileName={model?.fileName}
                projectPath={projectPath}
                editForm={showEditForm.current}
                updatedExpressionField={updatedExpressionField}
                canGoBack={navigationStack.length > 0}
                selectedConnectionKind={selectedConnectionKind}
                setSidePanelView={setSidePanelView}
                showProgressSpinner={showProgressSpinner}
                progressMessage={progressMessage}
                progressTitle={progressTitle}
                // Regular callbacks
                onClose={handleOnCloseSidePanel}
                onSaveAndRefresh={closeSidePanelAndFetchUpdatedFlowModel}
                onBack={sidePanelView === SidePanelView.ERROR ? handleRetryNodeFetch : handleOnFormBack}
                onSelectNode={handleOnSelectNode}
                // Add node callbacks
                onAddConnection={handleOnAddConnection}
                onAddFunction={handleOnAddFunction}
                onAddWorkflow={handleOnAddWorkflow}
                onAddActivity={handleOnAddActivity}
                onAddNPFunction={handleOnAddNPFunction}
                onAddDataMapper={handleOnAddDataMapper}
                onAddModelProvider={handleOnAddNewModelProvider}
                onAddVectorStore={handleOnAddNewVectorStore}
                onAddEmbeddingProvider={handleOnAddNewEmbeddingProvider}
                onAddVectorKnowledgeBase={handleOnAddNewVectorKnowledgeBase}
                onAddDataLoader={handleOnAddNewDataLoader}
                onAddChunker={handleOnAddNewChunker}
                onSubmitForm={handleOnFormSubmit}
                showProgressIndicator={showProgressIndicator}
                onDiscardSuggestions={onDiscardSuggestions}
                onSubPanel={handleSubPanel}
                onUpdateExpressionField={handleUpdateExpressionField}
                onResetUpdatedExpressionField={handleResetUpdatedExpressionField}
                onSearchFunction={handleSearchFunction}
                onSearchWorkflow={handleSearchWorkflow}
                onSearchActivity={handleSearchActivity}
                onSearchNpFunction={handleSearchNpFunction}
                onSearchTextChange={handleSearchTextChange}
                searchText={searchText}
                // isSearching={isSearching}
                onSearchModelProvider={handleSearchModelProvider}
                onSearchVectorStore={handleSearchVectorStore}
                onSearchEmbeddingProvider={handleSearchEmbeddingProvider}
                onSearchVectorKnowledgeBase={handleSearchVectorKnowledgeBase}
                onSearchDataLoader={handleSearchDataLoader}
                onSearchChunker={handleSearchChunker}
                onUpdateNodeWithConnection={updateNodeWithConnection}
                // AI Agent specific callbacks
                onAddAgent={handleOnAddNewAgent}
                onSelectNewConnection={handleOnSelectNewConnection}
                onSelectConnectorPopup={handleOnSelectConnectorConfiguration}
                onNavigateToPanel={handleOnNavigateToPanel}
                errorMessage={errorMessage}
                // Devant specific callbacks
                onImportDevantConn={handleClickImportDevantConn}
                onLinkDevantProject={(platformExtState?.isExtInstalled && !platformExtState?.selectedContext?.project) ? onLinkDevantProject : undefined}
                onRefreshDevantConnections={
                    platformExtState?.selectedContext?.project && !platformExtState?.devantConns?.loading
                        ? () => platformRpcClient?.refreshConnectionList()
                        : undefined
                }
            />

            <PanelOverlayRenderer />

            {showAddAgentPopup && (
                <AddAgentPopupLayer>
                    <AddAgentPopup
                        isPopup
                        inFlow
                        projectPath={projectPath}
                        onClose={() => setShowAddAgentPopup(false)}
                        onNavigateToOverview={() => setShowAddAgentPopup(false)}
                        onAgentCreated={handleAgentCreated}
                    />
                </AddAgentPopupLayer>
            )}
        </PanelOverlayProvider>
    );
}
