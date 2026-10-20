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

import { capabilityValueText, seedCapabilityValue, SeedableProperty, showActivityIdentityReadOnly } from "./capabilityFieldValues";
import { MutableRefObject, SyntheticEvent, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import styled from "@emotion/styled";
import { confirmTriggerDeletion, drawToolEdits, goToAgent, keepIf, removeQuotes, searchAiComponents, serializeAgentToolsEdit, settleEntry, startAddAgentTrigger, startAddDurableEventTrigger, startAgentChat, withUndoGroup } from "../AIChatAgent/utils";
import { DIAGRAM_REFRESH_DEBOUNCE_MS } from "../diagramRefreshDebounce";
import { MemoizedDiagram } from "@wso2/bi-diagram";
import {
    BIAvailableNodesRequest,
    Flow,
    FlowNode,
    ToolData,
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
    FunctionSearchPagination,
    BISearchResponse,
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
    GET_DEFAULT_EMBEDDING_PROVIDER,
    GET_DEFAULT_MODEL_PROVIDER,
    AgentUsage,
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
import { pollActivityList } from "./activityRefresh";
import { useDraftNodeManager } from "./hooks/useDraftNodeManager";
import { findDurableAgentBox, useDurableAgentUsages, withKnownDurableUsages, withoutDurableUsage } from "./durableAgentUsages";
import { deleteEventSender, removeAgentTrigger } from "../FocusFlowDiagram/agentUsages";
import { capabilityListOf, drawDurableEdits, durableBoxHas, DurableCapabilityList, durableCapabilities, DurableEdit, durableEditLanded, withoutRegisteredCapabilities } from "./durableCapabilityEdits";
import { NodePosition } from "@wso2/syntax-tree";
import { View, ProgressIndicator, ThemeColors } from "@wso2/ui-toolkit";
import { applyModifications, textToModifications } from "../../../utils/utils";
import { debouncedUndoRedoManager } from "../../../utils/debouncedUndoRedo";
import { PanelManager, SidePanelView } from "./PanelManager";
import {
    transformCategories,
    getNodeTemplateForConnection,
    findFunctionByName,
    filterCategoriesLocally,
    buildMasterSearchCategories,
    mergePanelCategories,
    attachPendingSetup,
    settlePendingSetup,
    opensListFromPalette,
    countSectionLeafNodes,
} from "./utils";
import { PanelOverlayProvider } from "./context/PanelOverlayContext";
import { PanelOverlayRenderer } from "./PanelOverlayRenderer";
import { ExpressionFormField, Category as PanelCategory, S } from "@wso2/ballerina-side-panel";
import { assertFunctionSearchSuccess, FUNCTIONS_PAGE_SIZE, PAGINATED_LIBRARY_SECTIONS } from "../../../utils/function-pagination";
import { useFunctionPaginationController } from "../../../utils/useFunctionPaginationController";
import { settleLibrarySection, withLibrarySections } from "../../../utils/useFunctionPagination";
import { cloneDeep, debounce } from "lodash";
import { createFlowModelRefresher } from "./flowModelRefresh";
import { ConnectionKind } from "../../../components/ConnectionSelector";
import AddAgentPopup from "../AIChatAgent/AddAgentPopup";
import { DiagramSkeleton } from "../../../components/Skeletons";
import { AI_COMPONENT_PROGRESS_MESSAGE, AI_COMPONENT_PROGRESS_MESSAGE_TIMEOUT, FORM_LOADING_MESSAGE, LOADING_MESSAGE, WSO2_CLOUD_KNOWLEDGE_BASE_PACKAGE } from "../../../constants";
import { ConnectionListItem, MarketplaceItem } from "@wso2/wso2-platform-core";
import { usePlatformExtContext } from "../../../providers/platform-ext-ctx-provider";
import { requestMiniChatOpen } from "../../../components/AgentStatusOrb/shared";
import { AgentEditorView, useAgentEditorController, useStableFlow } from "../AIChatAgent/useAgentEditorController";
import { useAssistantName } from "../../../hooks/useProductMode";
import { CloudKnowledgeBasePage } from "../Connection/DevantConnections/CloudKnowledgeBasePage";
import { prepareDevantKnowledgeBase } from "../Connection/DevantConnections/devant-kb-utils";

const Container = styled.div`
    width: 100%;
    height: calc(100vh - 50px);
`;

const AddAgentPopupLayer = styled.div`
    position: relative;
    z-index: 2100;
`;

export interface BIFlowDiagramProps {
    projectPath: string;
    breakpointState?: number;
    onUpdate: () => void;
    onReady: (fileName: string, parentMetadata?: ParentMetadata, position?: NodePosition, parentCodedata?: CodeData) => void;
    onSave?: () => void;
    // Durable Agentic Workflow: render only Start → Agent (the control-flow chain stays
    // hidden until the user reveals it with the "Edit configuration" toggle).
    hideAgentConfiguration?: boolean;
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

// The form node kind behind each capability of the durable agent box. A capability type with
// no entry here has no form, and is refused rather than routed to whichever branch happened
// to be last.
const DURABLE_CAPABILITY_NODE_KINDS: Record<string, string> = {
    activity: "DURABLE_AGENT_ADD_ACTIVITY",
    event: "DURABLE_AGENT_REGISTER_EVENT",
    tool: "DURABLE_AGENT_REGISTER_TOOL",
    humanTask: "DURABLE_AGENT_HUMAN_TASK",
    peer: "DURABLE_AGENT_PEER",
};

// AI component pickers resolve templates from Central, so selecting one shows a full-panel loader.
const AI_COMPONENT_PICKER_VIEWS: SidePanelView[] = [
    SidePanelView.MODEL_PROVIDERS,
    SidePanelView.VECTOR_STORES,
    SidePanelView.EMBEDDING_PROVIDERS,
    SidePanelView.KNOWLEDGE_BASES,
    SidePanelView.DATA_LOADERS,
    SidePanelView.CHUNKERS,
];

// Counts the leaf function nodes (items with an `id`) across a panel category tree, used to decide whether
// another page exists.
const isDurableAgentBoxNode = (node: FlowNode) =>
    node.codedata?.node === "DURABLE_AGENT_RUN" &&
    ((node.metadata?.data as { agentBox?: boolean })?.agentBox === true || node.metadata?.draft === true);

export function BIFlowDiagram(props: BIFlowDiagramProps) {
    const { projectPath, breakpointState, onUpdate, onReady, onSave, hideAgentConfiguration } = props;
    const { rpcClient } = useRpcContext();


    const [model, setModel] = useState<Flow>();
    const modelRef = useRef<Flow>();
    modelRef.current = model;
    // Responses can arrive out of order; only the latest request reflects the newest source.
    const latestFetchRef = useRef(0);
    const refreshingRef = useRef(false);
    // Callbacks created once (subscriptions, the refreshers) must call the current render's functions.
    const getFlowModelRef = useRef<() => void>(() => undefined);
    const fetchFlowModelRef = useRef<() => Promise<unknown>>(() => Promise.resolve());
    const flowModelRefresher = useMemo(() => createFlowModelRefresher(
        () => fetchFlowModelRef.current(),
        () => getFlowModelRef.current(),
        DIAGRAM_REFRESH_DEBOUNCE_MS
    ), []);
    const markFlowModelStale = flowModelRefresher.markStale;
    // A silent refresh leaves the old flow on screen, and its positions are stale until the new one lands.
    const blockStaleInput = (event: SyntheticEvent) => {
        // The durable agent's canvas draws pending changes itself, so its positions are not stale during a refresh.
        if (refreshingRef.current && !agentOnlyView) {
            event.stopPropagation();
        }
    };
    const [suggestedModel, setSuggestedModel] = useState<Flow>();
    const [showSidePanel, setShowSidePanel] = useState(false);
    const [sidePanelView, setSidePanelView] = useState<SidePanelView>(SidePanelView.NODE_LIST);
    const sidePanelViewRef = useRef(sidePanelView);
    sidePanelViewRef.current = sidePanelView;
    const [refreshingAiComponents, setRefreshingAiComponents] = useState(false);
    const [formLoadingNode, setFormLoadingNode] = useState<AvailableNode>();
    const [categories, setCategories] = useState<PanelCategory[]>([]); //
    const [searchText, setSearchText] = useState<string>("");
    const {
        sectionsWithMore: functionSectionsWithMore,
        loadingSections: loadingFunctionSections,
        invalidate: invalidateFunctionPagination,
        reset: resetFunctionPagination,
        seed: seedFunctionSections,
        setSectionCursor: setFunctionSectionCursor,
        loadSection: loadFunctionSection,
    } = useFunctionPaginationController();
    const functionSearchGenerationRef = useRef(0);
    const functionSearchQueryRef = useRef<string>("");
    const functionSearchTypeRef = useRef<FUNCTION_TYPE>(FUNCTION_TYPE.REGULAR);
    // Kept here so an expanded AI package group survives switching to a form and back.
    const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
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
    const visualizerLocationRef = useRef<VisualizerLocation>();
    const [entrypointContext, setEntrypointContext] = useState<{ serviceName?: string; functionName?: string }>();
    const [isUserAuthenticated, setIsUserAuthenticated] = useState<boolean>(false);
    const assistantName = useAssistantName();
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
    // The "WSO2 Cloud Knowledge Base" box node captured on click; its codedata drives the create flows.
    const cloudKbNodeRef = useRef<AvailableNode>();
    const hasRenameOperation = useRef<boolean>(false);
    const topNodeRef = useRef<FlowNode | Branch>();
    const targetRef = useRef<LineRange>();
    const suggestedText = useRef<string>();
    const selectedClientName = useRef<string>();
    // True while the ACTIVITY_LIST panel was opened from the durable agent's "Add Activity"
    // node: in-list searches must keep hiding builtins and produce DURABLE_AGENT_ADD_ACTIVITY items.
    const durableAgentActivityListRef = useRef<boolean>(false);
    // Sticky for the duration of the "Create Activity from a Connection" wizard, which spans
    // writes of its own; see handleOnAddActivityFromConnection.
    const activityWizardForAgentRef = useRef<boolean>(false);

    // Whether the activity list/wizard currently on screen belongs to a durable agent.
    const inDurableAgentActivityFlow = () =>
        durableAgentActivityListRef.current || activityWizardForAgentRef.current;

    // Set while the WORKFLOW_LIST panel was opened from a child-workflow palette node
    // (CHILD_WORKFLOW_RUN / CHILD_WORKFLOW_CALL): in-list searches must keep producing
    // items of that kind instead of the default WORKFLOW_RUN.
    const childWorkflowKindRef = useRef<"CHILD_WORKFLOW_RUN" | "CHILD_WORKFLOW_CALL" | null>(null);
    // Set while a capability add/edit was started from an OBJECT-MODEL agent box
    // (`final workflow:DurableAgent x = ...`): capability forms must edit the declaration's
    // config literal, so their codedata targets the agent variable instead of ctx statements.
    const durableAgentObjectVarRef = useRef<string | null>(null);
    // Set while the durable-agent "Add Agent Tool" flow found no @ai:AgentTool functions and
    // showed the "no tools" CTA panel instead of the register form. Holds the run node (and the
    // file name captured at that time, since the popup-submitted callback closes over a stale
    // `model`) so the register-tool form can reopen with a fresh tool list after the
    // tool-creation popup submits.
    // Bumped whenever the user drives the side panel (picking an item, going back,
    // closing it, starting another creation). Async refreshes capture the value first and
    // drop their results if it changed — otherwise a late list refresh re-renders the panel
    // under the user and resets what they just selected.
    const panelNavEpochRef = useRef<number>(0);

    // Captures the epoch for a system-driven refresh (a post-save list rebuild): its late
    // results must not re-render a panel the user has already moved on from.
    const capturePanelNav = () => {
        const epoch = panelNavEpochRef.current;
        return () => panelNavEpochRef.current !== epoch;
    };

    // Set while the post-creation activity refresh owns the list panel. The panel runs its
    // own search whenever it re-renders, and right after a write the language server answers
    // the two concurrent searches from either side of the recompile — the one that observes
    // the pre-compile state comes back with no activities at all, and whichever response
    // lands last wins. While this is set, only the dedicated refresh writes the list.
    const activityRefreshOwnsPanelRef = useRef<boolean>(false);
    const activityRefreshReleaseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Claimed by every post-write activity refresh — the list rebuild after "Create Activity"
    // as well as the resolve-and-open-the-call-form flow of "Create Activity from a Connection".
    // Both re-render the panel, and the list component issues a search of its own each time it
    // mounts; without ownership that search races the refresh across the recompile boundary.
    const acquireActivityPanel = () => {
        if (activityRefreshReleaseRef.current) {
            clearTimeout(activityRefreshReleaseRef.current);
            activityRefreshReleaseRef.current = null;
        }
        activityRefreshOwnsPanelRef.current = true;
    };

    // Ownership is held briefly past the refresh so a panel search issued before it started
    // cannot overwrite the list when its response arrives late. A pending release from an
    // earlier refresh is cancelled first — otherwise its timer would hand the panel back
    // while a newer refresh is still running.
    const releaseActivityPanel = () => {
        if (activityRefreshReleaseRef.current) {
            clearTimeout(activityRefreshReleaseRef.current);
        }
        activityRefreshReleaseRef.current = setTimeout(() => {
            activityRefreshOwnsPanelRef.current = false;
            activityRefreshReleaseRef.current = null;
        }, 2000);
    };

    // A superseded refresh has no panel to protect: the list's own search must run for its new owner.
    const releaseActivityPanelNow = () => {
        if (activityRefreshReleaseRef.current) {
            clearTimeout(activityRefreshReleaseRef.current);
            activityRefreshReleaseRef.current = null;
        }
        activityRefreshOwnsPanelRef.current = false;
    };

    // Marks a user-driven panel action: invalidates in-flight refreshes, then reports whether
    // this action's own async continuation has since been superseded by a later action.
    const beginPanelNav = () => {
        const epoch = ++panelNavEpochRef.current;
        return () => panelNavEpochRef.current !== epoch;
    };

    // Set while a capability write is being applied: the side panel stays open showing
    // the loader (content not editable) and closes only when the refreshed flow model
    // lands — matching how the other flow diagrams hold the panel through an operation.
    const pendingCapabilityCloseRef = useRef<boolean>(false);
    // Durable agent capability changes on their way to the source, drawn over the model until it shows them.
    const [durableEdits, setDurableEdits] = useState<DurableEdit[]>([]);
    const durableQueueRef = useRef(0);
    const displayModelRef = useRef<Flow>();
    // A refresh while a new node is being placed would replace the model and drop its draft.
    const pendingInsertRef = useRef(false);
    const skippedRefreshRef = useRef(false);
    // Refresh ladders and the capability failsafe armed by the operations below. Both are
    // cancelled when the next operation starts, when the panel closes and on unmount, so a
    // timer armed for one operation cannot fire against the next one (or after navigation).
    const refreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const capabilityFailsafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Set while the MCP toolkit creation form (opened from the agent's Add Tool/Activity
    // list) is up: once the toolkit variable is created, it is registered on this agent.
    const pendingDurableMcpAgentRef = useRef<{ agentVar: string | null; insertBefore: any } | null>(null);
    const initialCategoriesRef = useRef<any[]>([]);
    // Bumped by every master search request and whenever the search is cleared. Master search waits on Ballerina
    // Central, so responses can arrive out of order; only the response for the latest request is rendered.
    const masterSearchSeqRef = useRef<number>(0);
    const instanceListCategoriesRef = useRef<Partial<Record<SearchKind, PanelCategory[]>>>({});
    const showEditForm = useRef<boolean>(false);
    // True while the call form open is step 3 of the create-activity-from-connection wizard.
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
            // Pending refreshes would setState on an unmounted diagram.
            clearRefreshTimers();
            clearCapabilityFailsafe();
            flowModelRefresher.dispose();
            debouncedGetFlowModelForBreakpoints.cancel();
        };
    }, []);

    useEffect(() => {
        markFlowModelStale();
        debouncedGetFlowModelForBreakpoints();
    }, [breakpointState]);

    useEffect(() => {
        const unsubscribeProjectContent = rpcClient.onProjectContentUpdated(() => {
            markFlowModelStale();
            // Mid undo/redo the view location is not yet moved to the edited source; the applied refresh covers it.
            if (debouncedUndoRedoManager.isProcessing()) {
                return;
            }
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
            visualizerLocationRef.current = location;
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

        // The user's own undo/redo is not a burst to wait out.
        const unsubscribeUndoRedo = debouncedUndoRedoManager.onApplied(() => {
            markFlowModelStale();
            getFlowModelRef.current();
        });

        return () => {
            unsubscribeProjectContent();
            unsubscribeUndoRedo();
        };
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

    // Leading edge: a single save refreshes at once; only bursts (e.g. Copilot live edits) wait out the delay.
    const debouncedGetFlowModel = flowModelRefresher.refresh;

    // Shorter debounce specifically for breakpoint changes (faster feedback); its mount call is the first load.
    const debouncedGetFlowModelForBreakpoints = useMemo(
        () => debounce(() => getFlowModelRef.current(), 200, { leading: true, trailing: true }),
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

    // Refreshes the categories a stacked view returns to, without leaving the current view.
    const updateStackedCategories = (view: SidePanelView, cats: PanelCategory[]) => {
        setNavigationStack((prev) => prev.map((item) => (item.view === view ? { ...item, categories: cats } : item)));
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
        const superseded = capturePanelNav();
        // Try to navigate back to MODEL_PROVIDER_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.MODEL_PROVIDER_LIST);

        if (foundInStack) {
            setShowProgressIndicator(true);
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getAvailableModelProviders({
                    position: targetRef.current.startLine,
                    filePath: model?.fileName,
                });
                if (superseded()) {
                    return;
                }
                const modelProviderCategories = convertModelProviderCategoriesToSidePanelCategories(response.categories as Category[]);
                instanceListCategoriesRef.current["MODEL_PROVIDER"] = modelProviderCategories;
                setCategories(modelProviderCategories);
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
        const superseded = capturePanelNav();
        // Try to navigate back to VECTOR_STORE_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.VECTOR_STORE_LIST);

        if (foundInStack) {
            setShowProgressIndicator(true);
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getAvailableVectorStores({
                    position: targetRef.current.startLine,
                    filePath: model?.fileName,
                });
                if (superseded()) {
                    return;
                }
                const vectorStoreCategories = convertVectorStoreCategoriesToSidePanelCategories(response.categories as Category[]);
                instanceListCategoriesRef.current["VECTOR_STORE"] = vectorStoreCategories;
                setCategories(vectorStoreCategories);
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
        const superseded = capturePanelNav();
        // Try to navigate back to EMBEDDING_PROVIDER_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.EMBEDDING_PROVIDER_LIST);

        if (foundInStack) {
            setShowProgressIndicator(true);
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getAvailableEmbeddingProviders({
                    position: targetRef.current.startLine,
                    filePath: model?.fileName,
                });
                if (superseded()) {
                    return;
                }
                const embeddingProviderCategories = convertEmbeddingProviderCategoriesToSidePanelCategories(response.categories as Category[]);
                instanceListCategoriesRef.current["EMBEDDING_PROVIDER"] = embeddingProviderCategories;
                setCategories(embeddingProviderCategories);
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
        const superseded = capturePanelNav();
        // Try to navigate back to KNOWLEDGE_BASE_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.KNOWLEDGE_BASE_LIST);

        if (foundInStack) {
            setShowProgressIndicator(true);
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getAvailableVectorKnowledgeBases({
                    position: targetRef.current.startLine,
                    filePath: model?.fileName,
                });
                if (superseded()) {
                    return;
                }
                const knowledgeBaseCategories = convertKnowledgeBaseCategoriesToSidePanelCategories(response.categories as Category[]);
                instanceListCategoriesRef.current["KNOWLEDGE_BASE"] = knowledgeBaseCategories;
                setCategories(knowledgeBaseCategories);
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

    // Registers a Devant-backed WSO2 Cloud knowledge base and opens its pre-filled create form.
    const handleCreateDevantKnowledgeBase = async (node: AvailableNode, item: MarketplaceItem) => {
        setShowProgressIndicator(true);
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);
        try {
            const flowNode = await prepareDevantKnowledgeBase({
                rpcClient,
                platformRpcClient,
                platformExtState,
                item,
                node,
                projectPath,
                target: targetRef.current.startLine,
                fileName: model?.fileName,
            });
            if (!flowNode) {
                showConnectorError();
                return;
            }
            selectedNodeRef.current = flowNode;
            nodeTemplateRef.current = flowNode;
            showEditForm.current = false;
            isCreatingNewVectorKnowledgeBase.current = true; // reuse KB post-create navigation
            setSidePanelView(SidePanelView.FORM);
            setShowSidePanel(true);
        } catch (error) {
            console.error(">>> Error setting up WSO2 Cloud knowledge base", error);
        } finally {
            setShowProgressIndicator(false);
        }
    };

    // "Create new" on the WSO2 Cloud KB intermediate page: open a blank CloudKnowledgeBase form
    // (manual entry, no Devant service pre-selected). Mirrors the generic node-template -> form path.
    const handleCreateNewCloudKnowledgeBase = async () => {
        const kbCodedata = cloudKbNodeRef.current?.codedata;
        if (!kbCodedata) {
            return;
        }
        setShowProgressIndicator(true);
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);
        try {
            const response = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                position: targetRef.current.startLine,
                filePath: model?.fileName,
                id: kbCodedata,
            });
            if ((response as any)?.errorMsg) {
                showConnectorError((response as any).errorMsg);
                return;
            }
            selectedNodeRef.current = response.flowNode;
            nodeTemplateRef.current = response.flowNode;
            showEditForm.current = false;
            isCreatingNewVectorKnowledgeBase.current = true; // reuse KB post-create navigation
            setSidePanelView(SidePanelView.FORM);
            setShowSidePanel(true);
        } catch (error) {
            console.error(">>> Error opening WSO2 Cloud knowledge base form", error);
            showConnectorError();
        } finally {
            setShowProgressIndicator(false);
        }
    };

    const handleDataLoaderAdded = async () => {
        const superseded = capturePanelNav();
        // Try to navigate back to DATA_LOADER_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.DATA_LOADER_LIST);

        if (foundInStack) {
            setShowProgressIndicator(true);
            try {
                const response = await rpcClient.getBIDiagramRpcClient().getAvailableDataLoaders({
                    position: targetRef.current.startLine,
                    filePath: model?.fileName,
                });
                if (superseded()) {
                    return;
                }
                const dataLoaderCategories = convertDataLoaderCategoriesToSidePanelCategories(response.categories as Category[]);
                instanceListCategoriesRef.current["DATA_LOADER"] = dataLoaderCategories;
                setCategories(dataLoaderCategories);
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
                const chunkerCategories = convertChunkerCategoriesToSidePanelCategories(response.categories as Category[]);
                instanceListCategoriesRef.current["CHUNKER"] = chunkerCategories;
                setCategories(chunkerCategories);
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

    const handleActivityAdded = async (recentIdentifier?: string) => {
        // Try to navigate back to ACTIVITY_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.ACTIVITY_LIST);
        if (!foundInStack) {
            console.log(">>> ACTIVITY_LIST not found in navigation stack, closing panel");
            closeSidePanelAndFetchUpdatedFlowModel();
            return;
        }

        setShowProgressIndicator(true);
        const superseded = capturePanelNav();
        acquireActivityPanel();
        try {
            const categories = await pollActivityList({
                search: () => rpcClient.getBIDiagramRpcClient().search({
                    position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                    filePath: model?.fileName,
                    queryMap: durableAgentActivityListRef.current
                        ? { nodeKind: "DURABLE_AGENT_ADD_ACTIVITY" }
                        : undefined,
                    searchKind: "ACTIVITY_CALL",
                }).then((response) => response.categories as Category[]),
                superseded,
                sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
                recentIdentifier,
            });
            const panelCategories = convertFunctionCategoriesToSidePanelCategories(categories, FUNCTION_TYPE.REGULAR);
            const currentPackageCategory = findCurrentIntegrationCategory(panelCategories);
            if (currentPackageCategory && !currentPackageCategory.items.length) {
                currentPackageCategory.description = "No activities defined. Click below to create a new activity.";
            }
            if (superseded()) {
                // The user moved on (e.g. to another Create Activity form) while the project was still
                // compiling: keep the list that form returns to current, and leave the panel to its owner.
                updateStackedCategories(SidePanelView.ACTIVITY_LIST, panelCategories);
                return;
            }
            setCategories(panelCategories);
            setSidePanelView(SidePanelView.ACTIVITY_LIST);
            setShowSidePanel(true);
        } catch (error) {
            console.error(">>> Error refreshing activities", error);
        } finally {
            // The indicator is this refresh's own, whatever happened to it: a successor that shows one
            // sets it again, so at worst it flickers, where leaving it on keeps the canvas read-only.
            setShowProgressIndicator(false);
            if (superseded()) {
                releaseActivityPanelNow();
            } else {
                releaseActivityPanel();
            }
        }
    };

    const handleWorkflowAdded = async () => {
        const superseded = capturePanelNav();
        // Try to navigate back to WORKFLOW_LIST in the stack
        const foundInStack = popNavigationStackUntilView(SidePanelView.WORKFLOW_LIST);

        if (foundInStack) {
            setShowProgressIndicator(true);
            try {
                const response = await rpcClient.getBIDiagramRpcClient().search({
                    position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                    filePath: model?.fileName,
                    // The refreshed list has to stay the list the user opened: without the node
                    // kind the rebuilt items come back as top-level Run Workflow nodes, so a
                    // workflow picked right after creating one would insert the wrong node.
                    queryMap: childWorkflowKindRef.current ? { nodeKind: childWorkflowKindRef.current } : undefined,
                    searchKind: "WORKFLOW_RUN",
                });
                const panelCategories = convertFunctionCategoriesToSidePanelCategories(
                    response.categories as Category[],
                    FUNCTION_TYPE.REGULAR
                );
                const currentPackageCategory = findCurrentIntegrationCategory(panelCategories);
                if (currentPackageCategory && !currentPackageCategory.items.length) {
                    currentPackageCategory.description = "No workflows defined. Click below to create a new workflow.";
                }
                if (superseded()) {
                    return;
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
        if (pendingInsertRef.current && !pendingCapabilityCloseRef.current) {
            skippedRefreshRef.current = true;
            return;
        }
        skippedRefreshRef.current = false;
        flowModelRefresher.fetch();
    };
    getFlowModelRef.current = getFlowModel;

    const fetchFlowModel = () => {
        const fetchId = ++latestFetchRef.current;
        refreshingRef.current = true;
        // Refreshing a flow already on screen must not blank the title bar actions or lock the canvas.
        if (!modelRef.current) {
            setShowProgressIndicator(true);
            onUpdate();
        }

        // Re-check authentication status
        rpcClient.getAiPanelRpcClient().isUserAuthenticated()
            .then((isAuth) => {
                setIsUserAuthenticated(isAuth);
            })
            .catch(() => {
                setIsUserAuthenticated(false);
            });

        return rpcClient
            .getBIDiagramRpcClient()
            .getBreakpointInfo()
            .then((response) => {
                setBreakpointInfo(response);
                return rpcClient
                    .getBIDiagramRpcClient()
                    .getFlowModel({})
                    .then((model) => {
                        console.log(">>> BIFlowDiagram getFlowModel", model);
                        if (fetchId !== latestFetchRef.current) {
                            return;
                        }
                        if (model?.flowModel) {
                            if (pendingCapabilityCloseRef.current) {
                                // The capability write has landed: release the held panel and
                                // disarm the failsafe, which would otherwise close a later panel.
                                pendingCapabilityCloseRef.current = false;
                                clearCapabilityFailsafe();
                                setShowProgressSpinner(false);
                                setProgressMessage(LOADING_MESSAGE);
                                setShowSidePanel(false);
                                resetNodeSelectionStates();
                            }
                            const currentSelectedNode = selectedNodeRef.current;
                            if (
                                currentSelectedNode &&
                                // A node being created is not in this model: its line range is the
                                // insertion point, which matches whatever already starts there.
                                !currentSelectedNode.codedata?.isNew &&
                                typeof currentSelectedNode?.properties?.variable?.value === "string"
                            ) {
                                const updatedSelectedNode = searchNodesByStartLine(model.flowModel.nodes, currentSelectedNode?.codedata.lineRange.startLine);
                                if (updatedSelectedNode
                                        && updatedSelectedNode.codedata?.node === currentSelectedNode.codedata?.node) {
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
                                visualizerLocationRef.current = location;
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
                    });
            })
            .finally(() => {
                if (fetchId !== latestFetchRef.current) {
                    return;
                }
                refreshingRef.current = false;
                setShowProgressIndicator(false);
                setShowProgressSpinner(false);
                onReady(undefined, undefined, undefined);
                if (hasDraft) {
                    completeDraft();
                }
            });
    };
    fetchFlowModelRef.current = fetchFlowModel;

    // Every way the side panel closes ends a placement; catch up on any refresh it held back.
    useEffect(() => {
        if (showSidePanel) {
            return;
        }
        pendingInsertRef.current = false;
        if (skippedRefreshRef.current) {
            getFlowModel();
        }
    }, [showSidePanel]);

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
                    const modelProvider = nodeMetadata?.agentInfo?.modelProvider?.presentation;
                    if (node?.codedata?.node === "AGENT_CALL" && modelProvider?.name === modelVarName) {
                        setModelType(modelProvider, modelProviderName);
                    } else if (node?.codedata?.node === "ERROR_HANDLER" && Array.isArray(node.branches)) {
                        node.branches.forEach((branch) => {
                            (branch.children ?? []).forEach((child) => {
                                const childMetadata = child?.metadata?.data as NodeMetadata;
                                const childModelProvider = childMetadata?.agentInfo?.modelProvider?.presentation;
                                if (
                                    child.codedata.node === "AGENT_CALL" &&
                                    childModelProvider?.name === modelVarName
                                ) {
                                    setModelType(childModelProvider, modelProviderName);
                                }
                            });
                        });
                    }
                });
            });
    }

    // Keeps an open edit form pointed at its node across model refreshes: the refreshed model
    // carries fresh ids, so the form has to adopt the matching node or it saves against a stale
    // one. Two matches must never be adopted, because nodes are matched on start line alone:
    //   - A node being created is not in the model yet. Its codedata carries the insertion point,
    //     and for a durable agent capability that is the line the enclosing EVENT_START starts on
    //     — adopting it turns the open capability form into "Start", and saving it writes against
    //     the wrong node.
    //   - A match of a different node kind is not the same node.
    useEffect(() => {
        const openNode = selectedNodeRef.current;
        if (!model || sidePanelView !== SidePanelView.FORM
                || !openNode?.codedata?.lineRange?.startLine || openNode.codedata.isNew) {
            return;
        }
        const matchingNode = findNodeByStartLine(model, openNode.codedata.lineRange.startLine);
        if (matchingNode && matchingNode.id !== openNode.id
                && matchingNode.codedata?.node === openNode.codedata?.node) {
            selectedNodeRef.current = matchingNode;
            changeTargetRange(matchingNode.codedata.lineRange);
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
        childWorkflowKindRef.current = null;
        durableAgentObjectVarRef.current = null;
        setExpandedGroupId(null);
        setSubPanel({ view: SubPanelView.UNDEFINED });
        setSelectedNodeId(undefined);
        selectedNodeRef.current = undefined;
        nodeTemplateRef.current = undefined;
        topNodeRef.current = undefined;
        targetRef.current = undefined;
        pendingInsertRef.current = false;
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

    const clearRefreshTimers = () => {
        refreshTimersRef.current.forEach(clearTimeout);
        refreshTimersRef.current = [];
    };

    const clearCapabilityFailsafe = () => {
        if (capabilityFailsafeTimerRef.current) {
            clearTimeout(capabilityFailsafeTimerRef.current);
            capabilityFailsafeTimerRef.current = null;
        }
    };

    // Raw text edits that raise no content notification: each retry must fetch again.
    const scheduleFlowModelRefreshes = (...delaysMs: number[]) => {
        delaysMs.forEach((delay) =>
            refreshTimersRef.current.push(setTimeout(() => {
                markFlowModelStale();
                debouncedGetFlowModel();
            }, delay))
        );
    };

    const closeSidePanelAndFetchUpdatedFlowModel = (afterCapabilityWrite = false) => {
        resetNodeSelectionStates();
        clearRefreshTimers();
        if (afterCapabilityWrite) {
            markFlowModelStale();
        }
        // Fetch the updated flow model
        debouncedGetFlowModel();
        // Capability writes on the agent declaration are raw text edits with no artifact
        // event: the fetch above can race the recompile (which runs to seconds on projects
        // importing ai/mcp), so refresh a few more times on a backoff ladder.
        if (afterCapabilityWrite) {
            scheduleFlowModelRefreshes(1500, 4000, 8000);
        }
        if (hasDraft) {
            // completeDraft();
            setSuggestedModel(undefined);
            suggestedText.current = undefined;
        }
    };

    // Holds the panel open with the loader while a capability write applies; the panel
    // closes from getFlowModel() once the refreshed model has rendered.
    const finishCapabilityOpAfterRefresh = () => {
        // Timers from the previous operation would act on this one's state; drop them first.
        clearRefreshTimers();
        clearCapabilityFailsafe();
        pendingCapabilityCloseRef.current = true;
        setShowProgressSpinner(true);
        setProgressMessage("Applying changes...");
        markFlowModelStale();
        debouncedGetFlowModel();
        scheduleFlowModelRefreshes(1500, 4000);
        // Failsafe: never leave the loader stuck if the refresh cannot land.
        capabilityFailsafeTimerRef.current = setTimeout(() => {
            capabilityFailsafeTimerRef.current = null;
            if (pendingCapabilityCloseRef.current) {
                pendingCapabilityCloseRef.current = false;
                setShowProgressSpinner(false);
                setProgressMessage(LOADING_MESSAGE);
                closeSidePanelAndFetchUpdatedFlowModel();
            }
        }, 10000);
    };

    const handleOnCloseSidePanel = () => {
        panelNavEpochRef.current += 1;
        void settlePendingSetup(nodeTemplateRef.current, false);
        // The failsafe acts on the panel this close is dismissing; the refresh ladder is just a
        // model fetch, so it is left to finish.
        clearCapabilityFailsafe();
        pendingCapabilityCloseRef.current = false;
        pendingDurableMcpAgentRef.current = null;
        if (agentEditor.view !== "NONE") {
            agentEditor.cancel();
        }
        // Dismissing the panel ends the agent flow, so the flags that say "this activity list belongs
        // to an agent" end with it. They are not cleared in resetNodeSelectionStates, which also runs
        // on post-write refreshes the flow is meant to survive — only an explicit close means cancel.
        durableAgentActivityListRef.current = false;
        activityWizardForAgentRef.current = false;
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
        if (isOnAddNode) {
            pendingInsertRef.current = true;
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

        // Auto-submitted actions (currently diagnostics fixes) retain their
        // full-panel flow. The between-node magic wand is interactive, so keep
        // it in the ambient mini chat and carry the insertion context with it.
        if (options?.autoSubmit || !requestMiniChatOpen(aiPrompt)) {
            rpcClient.getAiPanelRpcClient().openAIPanel(aiPrompt);
        }
    };

    // Prefer the server's raw-source continuation. A filtered page can be short/empty without being final.
    // Older servers retain the full-visible-page heuristic.
    const seedFunctionPagination = useCallback(
        (cats: PanelCategory[], query: string, type: FUNCTION_TYPE, pagination?: FunctionSearchPagination) => {
            functionSearchQueryRef.current = query;
            functionSearchTypeRef.current = type;
            seedFunctionSections(pagination, title => countSectionLeafNodes(cats, title));
        },
        [seedFunctionSections]
    );

    // The library sections come from Ballerina Central, so they load after the panel opens.
    const loadDefaultFunctionList = async (filePath: string, isStale: () => boolean) => {
        const search = (queryMap: BISearchRequest["queryMap"]) => rpcClient.getBIDiagramRpcClient().search({
            position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
            filePath,
            queryMap: { q: "", limit: FUNCTIONS_PAGE_SIZE, offset: 0, includeAvailableFunctions: "true", ...queryMap },
            searchKind: "FUNCTION",
        });
        const toCategories = (response: BISearchResponse) =>
            convertFunctionCategoriesToSidePanelCategories(response.categories as Category[], FUNCTION_TYPE.REGULAR);
        const response = await search({ excludeLibrary: "true" });
        if (isStale()) {
            return false;
        }
        assertFunctionSearchSuccess(response);
        const { categories, pagination, pending, fillSection } =
            withLibrarySections(`call-function|${projectPath}`, toCategories(response));
        setCategories(categories);
        seedFunctionPagination(categories, "", FUNCTION_TYPE.REGULAR, pagination);
        for (const title of pending) {
            const { org } = PAGINATED_LIBRARY_SECTIONS.find((section) => section.title === title);
            search({ orgName: org })
                .then((page) => {
                    if (!isStale()) {
                        assertFunctionSearchSuccess(page);
                        setFunctionSectionCursor(title, fillSection(title, page, toCategories(page), setCategories));
                    }
                })
                .catch((error) => {
                    console.error(">>> Error loading a library section", error);
                    if (!isStale()) {
                        setCategories((prev) => settleLibrarySection(prev, title));
                    }
                });
        }
        return true;
    };

    const handleSearch = useCallback(async (searchText: string, functionType: FUNCTION_TYPE, searchKind: SearchKind) => {
        const searchEpoch = panelNavEpochRef.current;
        const masterSearchSeq = searchKind === "ALL" ? ++masterSearchSeqRef.current : undefined;
        // Other kinds render in other panels, so they must not discard an open function list's Load more page.
        const functionGeneration = searchKind === "FUNCTION" ? ++functionSearchGenerationRef.current : undefined;
        const isDataMapperSearch = searchKind === "FUNCTION" && functionType === FUNCTION_TYPE.EXPRESSION_BODIED;
        if (functionGeneration !== undefined) {
            // Disable the previous query's continuation while this first page is in flight.
            resetFunctionPagination();
        }
        // The current query and panel own the result, its pagination and its progress indicator.
        const isStaleSearch = () =>
            (masterSearchSeq !== undefined
                && (masterSearchSeq !== masterSearchSeqRef.current || panelNavEpochRef.current !== searchEpoch))
            || (functionGeneration !== undefined
                && (functionGeneration !== functionSearchGenerationRef.current || panelNavEpochRef.current !== searchEpoch));
        if (searchKind === "FUNCTION" && functionType === FUNCTION_TYPE.REGULAR && !searchText.trim()) {
            await loadDefaultFunctionList(model.fileName, isStaleSearch).catch((error) => {
                console.error(">>> Error loading functions", error);
            });
            return;
        }
        // An unfiltered activity list is owned by the post-creation refresh while it runs.
        const yieldsToActivityRefresh = searchKind === "ACTIVITY_CALL" && !searchText.trim();
        if (yieldsToActivityRefresh && activityRefreshOwnsPanelRef.current) {
            return;
        }
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
                // Data mappers are workspace functions only, so a data mapper search skips the library sources.
                limit: isDataMapperSearch ? 0 : FUNCTIONS_PAGE_SIZE,
                offset: 0,
                includeAvailableFunctions: "true",
                ...(searchKind === "ACTIVITY_CALL" && durableAgentActivityListRef.current
                    ? { nodeKind: "DURABLE_AGENT_ADD_ACTIVITY" }
                    : {}),
                ...(searchKind === "WORKFLOW_RUN" && childWorkflowKindRef.current
                    ? { nodeKind: childWorkflowKindRef.current }
                    : {}),
            },
            searchKind,
        };
        const isWorkflowSearch = searchKind === "WORKFLOW_RUN";
        console.log(`>>> Search ${searchKind.toLowerCase()} request`, request);
        setShowProgressIndicator(true);
        try {
            const response = await rpcClient.getBIDiagramRpcClient().search(request);

            if (isStaleSearch()) {
                return;
            }
            if (searchKind === "FUNCTION") {
                assertFunctionSearchSuccess(response);
            }
            if (response.categories) {

                if (searchKind === "ALL") {
                    const searchCategories = convertFunctionCategoriesToSidePanelCategories(
                        response.categories as Category[],
                        functionType
                    );
                    setCategories(
                        buildMasterSearchCategories(initialCategoriesRef.current, searchCategories, searchText)
                    );
                } else {
                    const searched = searchKind === "ACTIVITY_CALL" && durableAgentActivityListRef.current
                        ? withoutRegisteredCapabilities(response.categories as Category[], findDurableAgentBox(displayModelRef.current))
                        : [...response.categories] as Category[];
                    const currentCategories = convertFunctionCategoriesToSidePanelCategories(searched, functionType);
                    const currentPackageCategory = findCurrentIntegrationCategory(currentCategories);
                    if (currentPackageCategory && !currentPackageCategory.items.length) {
                        if (isWorkflowSearch) {
                            currentPackageCategory.description = "No workflows defined. Click below to create a new workflow.";
                        } else if (searchKind === "ACTIVITY_CALL") {
                            currentPackageCategory.description = "No activities defined. Click below to create a new activity.";
                        }
                    }
                    if (panelNavEpochRef.current !== searchEpoch
                        || (yieldsToActivityRefresh && activityRefreshOwnsPanelRef.current)) {
                        // A late response for a panel the user has already left, or one that
                        // would overwrite the post-creation refresh's list.
                        return;
                    }
                    setCategories(currentCategories);

                    if (searchKind === "FUNCTION" && !isDataMapperSearch) {
                        seedFunctionPagination(currentCategories, searchText, functionType, response.functionPagination);
                    }
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
            if (isStaleSearch()) {
                return;
            }
            setShowProgressIndicator(false);
            // A failed function search keeps the current list; its view would not show the cached node palette.
            if (searchKind !== "FUNCTION") {
                // Fallback to cached categories on error
                setCategories(initialCategoriesRef.current);
            }
        } finally {
            if (!isStaleSearch()) {
                setShowProgressIndicator(false);
            }
        }
    }, [rpcClient, model?.fileName, seedFunctionPagination, resetFunctionPagination]);

    // Loads the next page of a single library section (e.g. Standard/Extended Library) and appends it. Each section
    // is scoped to its Central organization and paged by its own offset, so sections advance independently.
    const loadMoreFunctionSection = useCallback(async (sectionTitle: string) => {
        if (!targetRef.current || !model?.fileName) {
            return;
        }
        // A newer query or a different panel must not inherit this page or its loading flags.
        const navEpoch = panelNavEpochRef.current;
        const generation = functionSearchGenerationRef.current;
        const isStalePage = () => panelNavEpochRef.current !== navEpoch
            || functionSearchGenerationRef.current !== generation;
        await loadFunctionSection(sectionTitle, (org, cursor) => rpcClient.getBIDiagramRpcClient().search({
            position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
            filePath: model.fileName,
            queryMap: {
                q: functionSearchQueryRef.current.trim(), limit: FUNCTIONS_PAGE_SIZE,
                offset: cursor.nextOffset, orgName: org, functionSource: cursor.source,
                includeAvailableFunctions: "true",
            },
            searchKind: "FUNCTION",
        }), response => {
            const pageCategories = convertFunctionCategoriesToSidePanelCategories(
                response.categories as Category[], functionSearchTypeRef.current
            );
            const sectionLeafCount = countSectionLeafNodes(pageCategories, sectionTitle);
            if (sectionLeafCount > 0) {
                // Imported Functions in an org-scoped response must not be duplicated into the library section.
                const sectionOnly = pageCategories.filter(category => category.title === sectionTitle);
                setCategories(prev => mergePanelCategories(prev, sectionOnly));
            }
            return sectionLeafCount;
        }, () => !isStalePage());
    }, [rpcClient, model?.fileName, loadFunctionSection]);

    const handleRetryNodeFetch = () => {
        if (topNodeRef.current && targetRef.current) {
            fetchNodesAndAISuggestions(topNodeRef.current, targetRef.current, false, false, true);
        }
    };

    const showConnectorError = (message?: string) => {
        setErrorMessage(message || SIDE_PANEL_DEFAULT_ERROR_MESSAGE);
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

    const searchInstanceList = (searchKind: SearchKind, searchText: string) => {
        setCategories(filterCategoriesLocally(instanceListCategoriesRef.current[searchKind] ?? [], searchText));
    };

    const handleSearchModelProvider = async (searchText: string, _functionType: FUNCTION_TYPE) => {
        searchInstanceList("MODEL_PROVIDER", searchText);
    };

    const handleSearchVectorStore = async (searchText: string, _functionType: FUNCTION_TYPE) => {
        searchInstanceList("VECTOR_STORE", searchText);
    };

    const handleSearchEmbeddingProvider = async (searchText: string, _functionType: FUNCTION_TYPE) => {
        searchInstanceList("EMBEDDING_PROVIDER", searchText);
    };

    const handleSearchVectorKnowledgeBase = async (searchText: string, _functionType: FUNCTION_TYPE) => {
        searchInstanceList("KNOWLEDGE_BASE", searchText);
    };

    const handleSearchDataLoader = async (searchText: string, _functionType: FUNCTION_TYPE) => {
        searchInstanceList("DATA_LOADER", searchText);
    };

    const handleSearchChunker = async (searchText: string, _functionType: FUNCTION_TYPE) => {
        searchInstanceList("CHUNKER", searchText);
    };

    const handleSearchTextChange = (text: string) => {
        setSearchText(text);

        // Immediately reset searching state when text is cleared
        if (!text.trim()) {
            // setIsSearching(false);
            setShowProgressIndicator(false);
        }
    };

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

    // The master search lists only the first functions. This opens the paginated function search for the same
    // query. Its Back clears the query, as the function list's Back does, and returns to the node panel.
    const handleShowMoreFunctions = () => {
        const query = searchText.trim();
        if (!query) {
            return;
        }
        // A pending or in-flight master search must not replace the function search.
        debouncedSearchRef.current?.cancel();
        panelNavEpochRef.current++;
        // A repeated click while the first search loads must not make Back stop at the same results twice.
        const top = navigationStack[navigationStack.length - 1];
        if (top?.view !== sidePanelView || top?.categories !== categories) {
            pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);
        }
        handleSearch(query, FUNCTION_TYPE.REGULAR, "FUNCTION");
    };

    // Offered only where the node panel offers function calls, as with its own "Show More Functions".
    const canCallFunctions = initialCategoriesRef.current.some((category: PanelCategory) =>
        category?.items?.some((item) => item != null && "id" in item && item.id === "FUNCTION"));

    // Effect to handle search text changes
    useEffect(() => {
        // Drop any in-flight master search response, which is for an earlier query
        masterSearchSeqRef.current++;
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
        const artifact = await rpcClient.getVisualizerRpcClient().updateCurrentArtifactLocation(artifacts);
        // getFlowModel reads the flow at the view's location; a fetch begun before the artifact moved is stale.
        const previous = visualizerLocationRef.current;
        if (artifact && (artifact.path !== previous?.documentUri
            || artifact.position?.startLine !== previous?.position?.startLine
            || artifact.position?.startColumn !== previous?.position?.startColumn)) {
            markFlowModelStale();
        }

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
            await handleActivityAdded((artifacts.artifacts?.find((a: any) => a.isNew) as any)?.name);
            return;
        }
        closeSidePanelAndFetchUpdatedFlowModel();
    };

    const handleOnSelectNode = (nodeId: string, metadata?: any, fileName?: string) => {
        const selectionEpoch = ++panelNavEpochRef.current;
        const functionGeneration = ++functionSearchGenerationRef.current;
        const isStaleSelection = () => panelNavEpochRef.current !== selectionEpoch
            || functionSearchGenerationRef.current !== functionGeneration;
        // Back may restore the function list being left, so keep its cursors and only drop in-flight pages.
        invalidateFunctionPagination();
        selectedNodeMetadata.current = { nodeId, metadata, fileName: model?.fileName || fileName };
        // A node selected through the normal palette flow is not part of the create-activity wizard.
        const { node, category } = metadata as { node: AvailableNode; category?: string };

        // Push current state to navigation stack before navigating
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);

        const showFormLoader = AI_COMPONENT_PICKER_VIEWS.includes(sidePanelView);

        // The "WSO2 Cloud Knowledge Base" box routes to an intermediate page (list existing cloud KBs
        // + create new) instead of the generic form.
        if (
            sidePanelView === SidePanelView.KNOWLEDGE_BASES &&
            node.codedata.packageName === WSO2_CLOUD_KNOWLEDGE_BASE_PACKAGE
        ) {
            cloudKbNodeRef.current = node; // reuse this codedata for the list/create flows
            setSidePanelView(SidePanelView.WSO2_CLOUD_KB_LIST);
            setShowSidePanel(true);
            return;
        }

        switch (node.codedata.node) {
            case "FUNCTION":
                setShowProgressIndicator(true);
                loadDefaultFunctionList(model?.fileName || fileName, isStaleSelection)
                    .then((loaded) => {
                        if (loaded) {
                            setSidePanelView(SidePanelView.FUNCTION_LIST);
                            setShowSidePanel(true);
                        }
                    })
                    .catch((error) => {
                        console.error(">>> Error loading functions", error);
                        if (!isStaleSelection()) {
                            resetFunctionPagination();
                        }
                    })
                    .finally(() => {
                        if (!isStaleSelection()) {
                            setShowProgressIndicator(false);
                        }
                    });
                break;

            case "DATA_MAPPER_CALL":
                setShowProgressIndicator(true);
                rpcClient
                    .getBIDiagramRpcClient()
                    .search({
                        position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                        filePath: model?.fileName || fileName,
                        // Data mappers are workspace functions only, so the library sources are skipped.
                        queryMap: { q: "", limit: 0, offset: 0, includeAvailableFunctions: "true" },
                        searchKind: "FUNCTION",
                    })
                    .then((response) => {
                        if (isStaleSelection()) {
                            return;
                        }
                        assertFunctionSearchSuccess(response);
                        setCategories(convertFunctionCategoriesToSidePanelCategories(
                            response.categories as Category[], FUNCTION_TYPE.EXPRESSION_BODIED
                        ));
                        resetFunctionPagination();
                        setSidePanelView(SidePanelView.DATA_MAPPER_LIST);
                        setShowSidePanel(true);
                    })
                    .catch((error) => {
                        console.error(">>> Error loading functions", error);
                        if (!isStaleSelection()) {
                            resetFunctionPagination();
                        }
                    })
                    .finally(() => {
                        if (!isStaleSelection()) {
                            setShowProgressIndicator(false);
                        }
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

            case "CHILD_WORKFLOW_RUN":
            case "CHILD_WORKFLOW_CALL":
                // First click from the palette opens the same searchable workflow list as
                // Run Workflow; the nodeKind override makes selected items resolve to the
                // child-workflow node so the right template/codegen kicks in.
                if (opensListFromPalette(sidePanelView)) {
                    childWorkflowKindRef.current = node.codedata.node as "CHILD_WORKFLOW_RUN" | "CHILD_WORKFLOW_CALL";
                    setShowProgressIndicator(true);
                    rpcClient
                        .getBIDiagramRpcClient()
                        .search({
                            position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                            filePath: model?.fileName || fileName,
                            queryMap: { nodeKind: childWorkflowKindRef.current },
                            searchKind: "WORKFLOW_RUN",
                        })
                        .then((response) => {
                            const panelCategories = convertFunctionCategoriesToSidePanelCategories(
                                response.categories as Category[],
                                FUNCTION_TYPE.REGULAR
                            );
                            const currentIntegrationCategory = findCurrentIntegrationCategory(panelCategories);
                            if (currentIntegrationCategory && !currentIntegrationCategory.items.length) {
                                currentIntegrationCategory.description =
                                    "No workflows defined. Click below to create a new workflow.";
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

                // Selecting a workflow from the list opens the node template form.
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

            case "WORKFLOW_RUN":
                // First click from node list should open searchable workflow list.
                if (opensListFromPalette(sidePanelView)) {
                    childWorkflowKindRef.current = null;
        durableAgentObjectVarRef.current = null;
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
                            const currentPackageCategory = findCurrentIntegrationCategory(panelCategories);
                            if (currentPackageCategory && !currentPackageCategory.items.length) {
                                currentPackageCategory.description = "No workflows defined. Click below to create a new workflow.";
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
                if (opensListFromPalette(sidePanelView)) {
                    durableAgentActivityListRef.current = false;
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
                            const currentPackageCategory = findCurrentIntegrationCategory(panelCategories);
                            if (currentPackageCategory && !currentPackageCategory.items.length) {
                                currentPackageCategory.description = "No activities defined. Click below to create a new activity.";
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

            case "DURABLE_AGENT_ADD_ACTIVITY":
                // First click from the palette opens the agent's Add Tool/Activity list:
                // the project's activities, its AI tools and toolkits, and the MCP entry.
                if (opensListFromPalette(sidePanelView)) {
                    durableAgentActivityListRef.current = true;
                    setShowProgressIndicator(true);
                    rpcClient
                        .getBIDiagramRpcClient()
                        .search({
                            position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
                            filePath: model?.fileName || fileName,
                            queryMap: { nodeKind: "DURABLE_AGENT_ADD_ACTIVITY" },
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

                // Selecting a project activity from the list opens its registration form
                // (retry policy, approval gating, bindings) before anything is written.
                setShowProgressIndicator(true);
                addActivityToDurableAgent(node.codedata, fileName)
                    .catch((error) => {
                        console.error(">>> Error adding the activity to the agent", error);
                        // The form never opens on failure, so without this the panel just sits on the
                        // activity list with the spinner gone and no reason given.
                        showConnectorError();
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                    });
                break;

            case "DURABLE_AGENT_REGISTER_TOOL": {
                // A tool picked from the Add Tool/Activity list (an @ai:AgentTool function or a
                // toolkit variable) — append it to the agent declaration's tools list directly.
                const toolName = node.codedata.symbol;
                if (alreadyOnAgent("tools", toolName)) {
                    break;
                }
                const agentVar = resolveDurableAgentVar();
                const insertAt = targetRef.current.startLine;
                const filePath = model?.fileName || fileName;
                closeSidePanelForBackgroundEdit();
                const preview = { values: {}, mcp: node.metadata?.icon === "bi-mcp" };
                runDurableEdit({ op: "add", list: "tools", name: toolName, preview }, async (afterOthers) => {
                    const position = (afterOthers ? durableBoxStart(await latestDurableBox())?.startLine : undefined) ?? insertAt;
                    await registerDurableTool(filePath, position, agentVar, toolName);
                });
                break;
            }

            case "MCP_TOOL_KIT":
                // "Use MCP Server" from the Add Tool/Activity list: open the toolkit creation
                // form; once the variable is created, handleOnFormSubmit registers it on the
                // agent via pendingDurableMcpAgentRef.
                setShowProgressIndicator(true);
                rpcClient
                    .getBIDiagramRpcClient()
                    .getNodeTemplate({
                        position: targetRef.current.startLine,
                        filePath: model?.fileName || fileName,
                        id: { node: "MCP_TOOL_KIT" },
                    })
                    .then((response) => {
                        pendingDurableMcpAgentRef.current = {
                            agentVar: resolveDurableAgentVar(),
                            insertBefore: targetRef.current,
                        };
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
                        const modelProviderCategories = convertModelProviderCategoriesToSidePanelCategories(
                            response.categories as Category[]
                        );
                        instanceListCategoriesRef.current["MODEL_PROVIDER"] = modelProviderCategories;
                        setCategories(modelProviderCategories);
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
                        const vectorStoreCategories = convertVectorStoreCategoriesToSidePanelCategories(
                            response.categories as Category[]
                        );
                        instanceListCategoriesRef.current["VECTOR_STORE"] = vectorStoreCategories;
                        setCategories(vectorStoreCategories);
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
                        const embeddingProviderCategories = convertEmbeddingProviderCategoriesToSidePanelCategories(
                            response.categories as Category[]
                        );
                        instanceListCategoriesRef.current["EMBEDDING_PROVIDER"] = embeddingProviderCategories;
                        setCategories(embeddingProviderCategories);
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
                        const knowledgeBaseCategories = convertKnowledgeBaseCategoriesToSidePanelCategories(response.categories as Category[]);
                        instanceListCategoriesRef.current["KNOWLEDGE_BASE"] = knowledgeBaseCategories;
                        setCategories(knowledgeBaseCategories);
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
                        const dataLoaderCategories = convertDataLoaderCategoriesToSidePanelCategories(response.categories as Category[]);
                        instanceListCategoriesRef.current["DATA_LOADER"] = dataLoaderCategories;
                        setCategories(dataLoaderCategories);
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
                        const chunkerCategories = convertChunkerCategoriesToSidePanelCategories(response.categories as Category[]);
                        instanceListCategoriesRef.current["CHUNKER"] = chunkerCategories;
                        setCategories(chunkerCategories);
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
                if (showFormLoader) {
                    setShowProgressSpinner(true);
                    setProgressTitle(node.metadata?.label || LOADING_MESSAGE);
                    setProgressMessage(FORM_LOADING_MESSAGE);
                    setFormLoadingNode(node);
                }
                rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                    position: targetRef.current.startLine,
                    filePath: model?.fileName || fileName,
                    id: node.codedata,
                })
                    .then((response: any) => {
                        if (response.errorMsg) {
                            console.error(">>> getNodeTemplate failed", response.errorMsg, node.codedata);
                            showConnectorError(response.errorMsg);
                            return;
                        }
                        // A picker can fill in fields before the form opens, e.g. an Agent Manager LLM service provider.
                        metadata.prepareTemplate?.(response.flowNode);
                        attachPendingSetup(response.flowNode, metadata.pendingSetup);
                        selectedNodeRef.current = response.flowNode;
                        nodeTemplateRef.current = response.flowNode;
                        showEditForm.current = false;
                        setSidePanelView(SidePanelView.FORM);
                        setShowSidePanel(true);
                    })
                    .catch((error) => {
                        console.error(">>> getNodeTemplate failed", error, node.codedata);
                        showConnectorError();
                    })
                    .finally(() => {
                        setShowProgressIndicator(false);
                        if (showFormLoader) {
                            setShowProgressSpinner(false);
                            setProgressMessage(LOADING_MESSAGE);
                            setFormLoadingNode(undefined);
                        }
                    });
                break;
        }
    };

    const handleOnSelectNewConnection = async (nodeId: string, metadata?: any) => {
        // Push current state to navigation stack before navigating
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);
        setShowProgressIndicator(true);
        setShowProgressSpinner(true);
        setProgressTitle("");
        setProgressMessage(FORM_LOADING_MESSAGE);
        setFormLoadingNode((metadata as { node?: AvailableNode })?.node);

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
            setShowProgressSpinner(false);
            setProgressMessage(LOADING_MESSAGE);
            setFormLoadingNode(undefined);
        }
    };

    const handleOnFormSubmit = async (
        updatedNode?: FlowNode,
        editorConfig?: EditorConfig,
        options?: FormSubmitOptions
    ) => {
        pendingInsertRef.current = false;
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

        // A durable-agent capability edit writes back to the entry's own range inside the
        // declaration's config literal, but the form re-stamps the submitted node with
        // targetLineRange — the expression-editor probe position at the declaration START
        // (see probeRangeForCapability). Submitting that range would splice the entry text
        // into the declaration line, so restore the entry range stamped on the selected node
        // by handleOnEditDurableCapability.
        if (
            updatedNode.codedata?.isNew === false &&
            Object.values(DURABLE_CAPABILITY_NODE_KINDS).includes(updatedNode.codedata.node)
        ) {
            // The range is only the entry's if the selected node is still the node being submitted.
            // A panel navigation between opening the form and submitting it can move the ref, and a
            // range taken from another node would splice this entry over that one's source.
            //
            // Identity has to separate two entries of the SAME kind on the same agent, which is the
            // realistic stale case. They share `node` and `parentSymbol`, and `codedata.symbol` too —
            // every activity entry's template carries `registerActivity`, whatever activity it
            // registers. What distinguishes them is the capability's name, which the form preserves:
            // createNodeWithUpdatedLineRange and updateNodeWithProperties both spread the node and
            // replace only codedata.lineRange and properties.
            const selectedCodedata = selectedNodeRef.current?.codedata;
            const sameEntry =
                !!selectedCodedata?.lineRange &&
                selectedCodedata.node === updatedNode.codedata.node &&
                selectedCodedata.parentSymbol === updatedNode.codedata.parentSymbol &&
                selectedNodeRef.current?.metadata?.label === updatedNode.metadata?.label;
            if (!sameEntry) {
                // There is nowhere safe to write: the submitted range is the probe position at the
                // declaration START, so going ahead would splice the entry over the declaration
                // itself. Abort and say so, rather than corrupting the source we cannot place.
                console.error(
                    ">>> Cannot place a durable agent capability edit; aborting the submit",
                    { submitted: updatedNode.codedata, selected: selectedCodedata }
                );
                showConnectorError();
                return;
            }
            updatedNode.codedata.lineRange = selectedCodedata.lineRange;
        }

        if (!options?.isChangeFromHelperPane && savedDurableEditInBackground(updatedNode, editorConfig)) {
            return;
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
        const writeSource = () => rpcClient
            .getBIDiagramRpcClient()
            .getSourceCode({
                filePath: model.fileName,
                flowNode: nodeToSubmit,
                isFunctionNodeUpdate: editorConfig?.displayMode !== EditorDisplayMode.NONE,
                isHelperPaneChange: options?.isChangeFromHelperPane,
                artifactData: !skipArtifact ? getArtifactData(editorConfig) : undefined,

            });
        // On the durable agent's canvas, its own edits wait for queued capability changes to the same declaration.
        (agentOnlyView ? serializeAgentToolsEdit(writeSource) : writeSource())
            .then(async (response) => {
                if (response.artifacts.length > 0) {
                    await settlePendingSetup(nodeTemplateRef.current, true);

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
                } else if ((nodeToSubmit?.codedata as any)?.object === "DurableAgent") {
                    // A capability edit writes no artifact, so success and refusal arrive in the same
                    // shape and only `error` tells them apart. Closing on a refusal would discard what
                    // the person typed for a change that was never written.
                    if (response?.error) {
                        console.error(">>> Capability edit refused; keeping the panel open", response.error);
                    } else {
                        // Capability edits rewrite the agent declaration's config literal via raw
                        // text edits — hold the panel with the loader until the refreshed model
                        // has rendered, then close.
                        selectedNodeRef.current = undefined;
                        finishCapabilityOpAfterRefresh();
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
        const currentArtifactType = visualizerLocationRef.current?.artifactType;
        if (
            currentArtifactType === DIRECTORY_MAP.AGENT_DEFINITION ||
            currentArtifactType === DIRECTORY_MAP.TYPE
        ) {
            return { artifactType: currentArtifactType };
        }

        // When editorConfig is absent, derive the artifact type from the EVENT_START node's metadata.
        //   kind="Function" + label="main" → AUTOMATION
        //   kind="Function" + @ai:AgentTool → AGENT_TOOL
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
                    if (/@ai:AgentTool\b/.test(eventStartNode?.codedata?.sourceCode ?? "")) {
                        return { artifactType: DIRECTORY_MAP.AGENT_TOOL };
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

        const deleteNodeResponse = await rpcClient
            .getBIDiagramRpcClient()
            .deleteFlowNode({ filePath: model.fileName, flowNode: node })
            .catch((error): UpdatedArtifactsResponse => ({ artifacts: [], error: String(error) }));
        if (deleteNodeResponse.error) {
            console.error(">>> Error deleting node", deleteNodeResponse);
            setShowProgressIndicator(false);
            return;
        }
        if (deleteNodeResponse.artifacts.length === 0) {
            console.error(">>> Error updating source code", deleteNodeResponse);
        }

        await updateArtifactLocation(deleteNodeResponse);

        selectedNodeRef.current = undefined;
        resetNodeSelectionStates();
        clearRefreshTimers();
        // Stay locked until the flow without the node is on screen, so a quick next delete cannot hit a stale range.
        setShowProgressIndicator(true);
        markFlowModelStale();
        getFlowModel();
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
        // In a caller's flow the agent box stands for the run call, so its form is that call's
        // parameters — the query and input the palette asks for. The agent's own configuration
        // (role, instructions, model, capabilities) belongs to its definition diagram.
        const formCodedata = node.codedata?.node === "DURABLE_AGENT_RUN" && !agentOnlyView
            ? ({ ...node.codedata, node: "DURABLE_AGENT_START" } as typeof node.codedata)
            : node.codedata;
        rpcClient.getBIDiagramRpcClient().getNodeTemplate({
            position: targetRef.current.startLine,
            filePath: model.fileName,
            id: formCodedata,
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
        panelNavEpochRef.current += 1;
        clearWorkflowCreationState();
        void settlePendingSetup(nodeTemplateRef.current, false);

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
                applyDurableAgentObjectTarget(response.flowNode);
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
                applyDurableAgentObjectTarget(response.flowNode);
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

    const handleOnAddActivityFromConnection = () => {
        // As for Create Activity: a refresh still running from the previous save must not replace the wizard.
        beginPanelNav();
        // The wizard can create a connection on the way, and that write runs the ordinary
        // post-write reset — which can clear the flag that says this list belongs to an agent
        // while the wizard itself stays open. Remember it here, where the flow is unambiguous.
        activityWizardForAgentRef.current = durableAgentActivityListRef.current;
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);
        setSidePanelView(SidePanelView.ACTIVITY_FROM_CONNECTION);
        setShowSidePanel(true);
    };

    const handleActivityFromConnectionCreated = async (activityName: string) => {
        // After the activity function is generated, resolve it and continue with it selected: in a
        // workflow that is its call form (where the workflow data is wired into the call); for an
        // agent it is the register form, whose binding selector picks the client the wizard
        // generated as the activity's first parameter.
        const agentList = inDurableAgentActivityFlow();
        // Re-establish the canonical flag from the wizard's own record of the flow, so the list
        // and every selection made from it after this point stay in the agent's mode.
        durableAgentActivityListRef.current = agentList;
        setShowProgressIndicator(true);
        // Own the list panel for the whole resolve: the write re-renders the panel, and the list
        // component's own mount search — answered from the pre-compile state, so with no activities
        // at all — would otherwise land last and blank the list behind this flow.
        acquireActivityPanel();
        try {
            // The activity is generated in functions.bal, so the workflow file is untouched and the
            // original insertion point (targetRef, from the diagram "+") stays valid — use it so the
            // call is inserted inside the workflow body.
            const insertLine = targetRef.current.startLine;

            const findNewActivity = async () => {
                const response = await rpcClient.getBIDiagramRpcClient().search({
                    position: { startLine: insertLine, endLine: insertLine },
                    filePath: model?.fileName,
                    // The agent's list carries its own node kind, so the resolved item's codedata
                    // yields the register template rather than the workflow call template.
                    queryMap: agentList
                        ? { excludeBuiltins: "true", nodeKind: "DURABLE_AGENT_ADD_ACTIVITY" }
                        : undefined,
                    searchKind: "ACTIVITY_CALL",
                });
                const panelCategories = convertFunctionCategoriesToSidePanelCategories(
                    response.categories as Category[],
                    FUNCTION_TYPE.REGULAR
                );
                const currentIntegrationCategory = findCurrentIntegrationCategory(panelCategories);
                return (currentIntegrationCategory?.items || [])
                    .map((item) => (item && "metadata" in item ? (item.metadata as AvailableNode) : undefined))
                    .find((node) => node?.codedata?.symbol === activityName);
            };
            // The activity was written moments ago, so the first search can still be answered
            // from the pre-compile state — wait for the recompile rather than falling through
            // to the plain list refresh, which loses the call form the user is expecting.
            let newActivityNode = await findNewActivity();
            for (let attempt = 0; attempt < 4 && !newActivityNode; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 1500));
                newActivityNode = await findNewActivity();
            }

            if (newActivityNode) {
                if (agentList) {
                    await addActivityToDurableAgent(newActivityNode.codedata);
                    return;
                }
                const template = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                    position: insertLine,
                    filePath: model?.fileName,
                    id: newActivityNode.codedata,
                });
                selectedNodeRef.current = template.flowNode;
                nodeTemplateRef.current = template.flowNode;
                showEditForm.current = false;
                // The activity list frame pushed on entry stays on the stack, so the form's back
                // button returns to the activity list.
                setSidePanelView(SidePanelView.FORM);
                setShowSidePanel(true);
                return;
            }
            // Fallback: could not resolve the new activity — just refresh the activity list.
            await (agentList ? handleActivityFromConnectionCreatedReturnToList() : handleActivityAdded(activityName));
        } catch (error) {
            console.error(">>> Error continuing with the created activity", error);
            await (agentList ? handleActivityFromConnectionCreatedReturnToList() : handleActivityAdded(activityName));
        } finally {
            setShowProgressIndicator(false);
            releaseActivityPanel();
            activityWizardForAgentRef.current = false;
        }
    };

    // "Create Activity": after generating the activity, return to the activity selection screen instead
    // of opening the call form. The activity goes to functions.bal, so the workflow file — and the
    // insertion point the flow was launched from — is unchanged; just reload the list so the new
    // activity is selectable, and keep the existing targetRef for the eventual call insertion.
    const handleActivityFromConnectionCreatedReturnToList = async () => {
        const superseded = capturePanelNav();
        // Same restore as the create path: a connection written inside the wizard can have
        // cleared the canonical flag while the wizard stayed open.
        durableAgentActivityListRef.current = inDurableAgentActivityFlow();
        // Restore the activity-list frame (the form's back-button target) before the async refresh, so
        // the panel lands on the activity list even when the stack lookup below finds nothing.
        popNavigationStackUntilView(SidePanelView.ACTIVITY_LIST);
        setShowProgressIndicator(true);
        acquireActivityPanel();
        try {
            // The activity is generated in functions.bal, so the workflow file this flow was launched
            // from is untouched and the original insertion point (targetRef, from the diagram "+") is
            // still valid — keep it so the selected activity's call is inserted inside the workflow body.
            const insertLine = targetRef.current.startLine;

            // Reload the activity list at that position so the newly created activity appears and can be
            // selected. Done inline (rather than via handleActivityAdded) so the list always reloads —
            // handleActivityAdded closes the panel when ACTIVITY_LIST is missing from the stack.
            const response = await rpcClient.getBIDiagramRpcClient().search({
                position: { startLine: insertLine, endLine: insertLine },
                filePath: model?.fileName,
                // In the agent's list the items must carry the agent's node kind: a list rebuilt
                // with the workflow kind looks identical but sends every selection to the
                // workflow call form instead of registering it on the agent.
                queryMap: inDurableAgentActivityFlow()
                    ? { excludeBuiltins: "true", nodeKind: "DURABLE_AGENT_ADD_ACTIVITY" }
                    : undefined,
                searchKind: "ACTIVITY_CALL",
            });
            const panelCategories = convertFunctionCategoriesToSidePanelCategories(
                response.categories as Category[],
                FUNCTION_TYPE.REGULAR
            );
            const currentPackageCategory = findCurrentIntegrationCategory(panelCategories);
            if (currentPackageCategory && !currentPackageCategory.items.length) {
                currentPackageCategory.description = "No activities defined. Click below to create a new activity.";
            }
            if (superseded()) {
                return;
            }
            setCategories(panelCategories);
            setSidePanelView(SidePanelView.ACTIVITY_LIST);
            setShowSidePanel(true);
        } catch (error) {
            console.error(">>> Error returning to the activity list after activity creation", error);
        } finally {
            setShowProgressIndicator(false);
            releaseActivityPanel();
            // The wizard is done; the canonical flag now carries the flow.
            activityWizardForAgentRef.current = false;
        }
    };

    const handleOnAddActivity = () => {
        // A user action: the previous save's list refresh, still polling for its activity, must
        // not land on top of this form and discard what was typed (wso2/product-integrator#2422).
        const superseded = beginPanelNav();
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
                if (superseded()) {
                    // Back or Close arrived before the template; the panel belongs to that action now.
                    return;
                }
                applyDurableAgentObjectTarget(response.flowNode);
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
                applyDurableAgentObjectTarget(response.flowNode);
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

    const openAiComponentPicker = (
        searchKind: SearchKind,
        title: string,
        view: SidePanelView,
        isCreating: MutableRefObject<boolean>,
        toPanelCategories: (categories: Category[]) => PanelCategory[]
    ) => {
        isCreating.current = true;
        setShowProgressIndicator(true);
        setProgressTitle(title);
        const messageTimeout = setupProgressMessageTimeout();

        // Push current state to navigation stack
        pushToNavigationStack(sidePanelView, categories, selectedNodeRef.current, selectedClientName.current);

        let shown = false;
        searchAiComponents(rpcClient, {
            position: { startLine: targetRef.current.startLine, endLine: targetRef.current.endLine },
            filePath: model?.fileName,
            queryMap: undefined,
            searchKind,
        }, (response, refreshing) => {
            // Once the list is shown, a refresh must not pull the user back from a form they opened.
            if (!isCreating.current || (shown && sidePanelViewRef.current !== view)) return;
            shown = true;
            setCategories(toPanelCategories(response.categories as Category[]));
            setSidePanelView(view);
            setShowSidePanel(true);
            setShowProgressSpinner(false);
            setRefreshingAiComponents(refreshing);
        }, () => setShowProgressSpinner(true)).finally(() => {
            setShowProgressIndicator(false);
            setShowProgressSpinner(false);
            setRefreshingAiComponents(false);
            cleanupProgressMessage(messageTimeout);
        });
    };

    const handleOnAddNewModelProvider = () => openAiComponentPicker("MODEL_PROVIDER", "Model Providers",
        SidePanelView.MODEL_PROVIDERS, isCreatingNewModelProvider, convertModelProviderCategoriesToSidePanelCategories);

    const handleOnAddNewVectorStore = () => openAiComponentPicker("VECTOR_STORE", "Vector Stores",
        SidePanelView.VECTOR_STORES, isCreatingNewVectorStore, convertVectorStoreCategoriesToSidePanelCategories);

    const handleOnAddNewEmbeddingProvider = () => openAiComponentPicker("EMBEDDING_PROVIDER", "Embedding Providers",
        SidePanelView.EMBEDDING_PROVIDERS, isCreatingNewEmbeddingProvider,
        convertEmbeddingProviderCategoriesToSidePanelCategories);

    const handleOnAddNewVectorKnowledgeBase = () => openAiComponentPicker("KNOWLEDGE_BASE", "Knowledge Bases",
        SidePanelView.KNOWLEDGE_BASES, isCreatingNewVectorKnowledgeBase,
        convertKnowledgeBaseCategoriesToSidePanelCategories);

    const handleOnAddNewDataLoader = () => openAiComponentPicker("DATA_LOADER", "Data Loaders",
        SidePanelView.DATA_LOADERS, isCreatingNewDataLoader, convertDataLoaderCategoriesToSidePanelCategories);

    const handleOnAddNewChunker = () => openAiComponentPicker("CHUNKER", "Chunkers",
        SidePanelView.CHUNKERS, isCreatingNewChunker, convertChunkerCategoriesToSidePanelCategories);

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

    const handleGoToAgent = (node: FlowNode) => goToAgent(node, rpcClient);

    const handleSubPanel = (subPanel: SubPanel) => {
        setSubPanel(subPanel);
    };

    const handleUpdateExpressionField = (data: ExpressionFormField) => {
        setUpdatedExpressionField(data);
    };

    const handleResetUpdatedExpressionField = () => {
        setUpdatedExpressionField(undefined);
    };

    const handleOnChatWithAgent = (agentNode: FlowNode) => {
        startAgentChat(agentNode, model?.fileName, rpcClient);
    };

    // Durable agent callback handlers
    // Stamps a capability node template so the LS edits the object-model agent declaration's
    // config literal instead of generating ctx.register* statements.
    // The agent variable for capability edits: the click-time ref when set, else the
    // declaration-canvas agent box from the current model. The ref alone is fragile — popup
    // round-trips (e.g. create-activity) reset panel state and lose it.
    // The agent variable carried on the agent-box node. Keyed off the box marker and
    // agent name rather than the codedata object string alone, which has drifted between
    // identity names before.
    const agentVarFromRunNode = (runNode: FlowNode): string | null => {
        const data = runNode.metadata?.data as any;
        if (runNode.codedata?.object === "DurableAgent" || data?.agentBox || (runNode.codedata as any)?.parentSymbol) {
            return (data?.agentName as string) ?? ((runNode.codedata as any)?.parentSymbol as string) ?? null;
        }
        return null;
    };

    // Where the expression editor may splice its probe statement while a capability form is open.
    // For an object-model agent the capability entry sits inside the declaration's `check new
    // ({...})` literal, so the probe goes to the declaration's start instead. For the statement
    // model the entry IS a statement, and it is kept as-is: hoisting there would drop every
    // variable declared between the entry and the run call out of scope for completions.
    const probeRangeForCapability = (runNode: FlowNode, entryRange: LineRange): LineRange => {
        const declRange = runNode?.codedata?.lineRange;
        if (!agentVarFromRunNode(runNode) || !declRange?.startLine) {
            return entryRange;
        }
        return {
            fileName: declRange.fileName ?? entryRange.fileName,
            startLine: declRange.startLine,
            endLine: declRange.startLine,
        } as LineRange;
    };

    const resolveDurableAgentVar = (): string | null => {
        if (durableAgentObjectVarRef.current) {
            return durableAgentObjectVarRef.current;
        }
        const agentBoxNode = model?.nodes?.find(
            (n) =>
                n.codedata?.node === "DURABLE_AGENT_RUN" &&
                (n.metadata?.data as any)?.agentBox === true &&
                (n.codedata as any)?.parentSymbol
        );
        return ((agentBoxNode?.codedata as any)?.parentSymbol as string) ?? null;
    };

    const applyDurableAgentObjectTarget = (node: FlowNode) => {
        const agentVar = resolveDurableAgentVar();
        if (agentVar) {
            node.codedata = {
                ...node.codedata,
                object: "DurableAgent",
                parentSymbol: agentVar,
                isNew: node.codedata?.isNew !== false,
            } as any;
        }
        return node;
    };

    // The canvas already shows the change, so nothing waits on its save; one refresh follows once the queue empties.
    const runDurableEdit = (edit: DurableEdit | undefined, write: (afterOthers: boolean) => Promise<void>) => {
        if (edit) {
            setDurableEdits((current) => [...current, edit]);
        }
        const afterOthers = durableQueueRef.current > 0;
        durableQueueRef.current += 1;
        void serializeAgentToolsEdit(() => write(afterOthers))
            .then(() => true, (error) => {
                console.error(">>> Durable agent change was not saved", error);
                rpcClient.getCommonRpcClient().showErrorMessage({
                    message: `The change to the agent was not saved. ${error instanceof Error ? error.message : ""}`.trim(),
                });
                return false;
            })
            .then((saved) => {
                if (edit) {
                    // A change that failed is not in the source, so the canvas drops it at once.
                    setDurableEdits(settleEntry(edit, saved));
                }
                durableQueueRef.current -= 1;
                if (durableQueueRef.current === 0) {
                    markFlowModelStale();
                    debouncedGetFlowModel();
                    // An undo before the refresh would leave a settled edit drawn over the source for good.
                    void flowModelRefresher.upToDate().then(() => {
                        if (durableQueueRef.current === 0) {
                            setDurableEdits(keepIf((item: DurableEdit) => !item.settled));
                        }
                    });
                }
            });
    };

    // Earlier edits move lines, so a queued change reads the agent again instead of trusting what was drawn.
    const latestDurableBox = async (): Promise<FlowNode | undefined> =>
        findDurableAgentBox((await rpcClient.getBIDiagramRpcClient().getFlowModel({}))?.flowModel);

    const durableBoxStart = (box: FlowNode | undefined): LineRange | undefined => {
        const range = box?.codedata?.lineRange;
        return range ? { fileName: range.fileName, startLine: range.startLine, endLine: range.startLine } as LineRange : undefined;
    };

    const durableCapabilityRange = (box: FlowNode | undefined, list: DurableCapabilityList, name: string) =>
        durableCapabilities(box, list).find((capability) => capability.name === name)?.lineRange as LineRange | undefined;

    // True, after telling the user, when the canvas already shows the entry.
    const alreadyOnAgent = (list: DurableCapabilityList, name: string) => {
        if (!durableBoxHas(displayModelRef.current, list, name)) {
            return false;
        }
        rpcClient.getCommonRpcClient().showErrorMessage({ message: `'${name}' is already on the agent.` });
        return true;
    };

    const registerDurableTool = async (filePath: string, position: LinePosition, agentVar: string | null, toolName: string) => {
        const { flowNode: toolNode } = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
            position,
            filePath,
            id: { node: "DURABLE_AGENT_REGISTER_TOOL" },
        });
        const toolProperty = (toolNode.properties as any)?.["tool"];
        if (toolProperty) {
            toolProperty.value = toolName;
        }
        toolNode.codedata = {
            ...toolNode.codedata,
            ...(agentVar ? { object: "DurableAgent", parentSymbol: agentVar } : {}),
            isNew: true,
            lineRange: { fileName: filePath, startLine: position, endLine: position },
        } as any;
        const response = await rpcClient.getBIDiagramRpcClient().getSourceCode({ filePath, flowNode: toolNode });
        if (response?.error) {
            throw new Error(response.error);
        }
    };

    const capabilityNameOf = (node: FlowNode): string | undefined => {
        const properties = node.properties as Record<string, { value?: unknown }> | undefined;
        for (const key of ["taskName", "name", "activity", "tool", "agent"]) {
            const value = properties?.[key]?.value;
            if (typeof value === "string" && value.trim()) {
                return removeQuotes(value);
            }
        }
        return node.metadata?.label;
    };

    // The change saves in the background and the canvas already shows it, so the panel closes at once.
    const closeSidePanelForBackgroundEdit = () => {
        panelNavEpochRef.current += 1;
        clearCapabilityFailsafe();
        pendingCapabilityCloseRef.current = false;
        pendingDurableMcpAgentRef.current = null;
        durableAgentActivityListRef.current = false;
        resetNodeSelectionStates();
    };

    const saveDurableCapabilityInBackground = (node: FlowNode, editorConfig?: EditorConfig) => {
        const type = Object.keys(DURABLE_CAPABILITY_NODE_KINDS).find((key) => DURABLE_CAPABILITY_NODE_KINDS[key] === node.codedata.node);
        const list = capabilityListOf(type);
        const isNew = node.codedata.isNew !== false;
        const name = isNew ? capabilityNameOf(node) : node.metadata?.label;
        if (isNew && list && name && alreadyOnAgent(list, name)) {
            return;
        }
        const filePath = model.fileName;
        const isFunctionNodeUpdate = editorConfig?.displayMode !== EditorDisplayMode.NONE;
        const artifactData = getArtifactData(editorConfig);
        closeSidePanelForBackgroundEdit();
        const preview = { values: {} };
        runDurableEdit(isNew && list && name ? { op: "add", list, name, preview } : undefined, async (afterOthers) => {
            if (list && name && (afterOthers || !isNew)) {
                const box = await latestDurableBox();
                const range = isNew ? durableBoxStart(box) : durableCapabilityRange(box, list, name);
                if (!range && !isNew) {
                    throw new Error(`'${name}' was not found on the agent.`);
                }
                node.codedata.lineRange = (range ?? node.codedata.lineRange) as typeof node.codedata.lineRange;
            }
            const response = await rpcClient.getBIDiagramRpcClient().getSourceCode({
                filePath,
                flowNode: node,
                isFunctionNodeUpdate,
                artifactData,
            });
            if (response?.error) {
                throw new Error(response.error);
            }
        });
    };

    // A toolkit created from the agent's Add Tool/Activity list, then registered on the agent: one undo step.
    const addDurableMcpToolKitInBackground = (toolKitNode: FlowNode, editorConfig?: EditorConfig) => {
        const pending = pendingDurableMcpAgentRef.current;
        const toolKitVarName = (toolKitNode.properties as any)?.variable?.value as string;
        const agentVar = pending.agentVar ?? resolveDurableAgentVar();
        if (toolKitVarName && alreadyOnAgent("tools", toolKitVarName)) {
            return;
        }
        const filePath = model.fileName;
        const isFunctionNodeUpdate = editorConfig?.displayMode !== EditorDisplayMode.NONE;
        const artifactData = getArtifactData(editorConfig);
        closeSidePanelForBackgroundEdit();
        const edit: DurableEdit = toolKitVarName && agentVar
            ? { op: "add", list: "tools", name: toolKitVarName, preview: { mcp: true, values: {} } }
            : undefined;
        runDurableEdit(edit, () => withUndoGroup(rpcClient, async () => {
            const created = await rpcClient.getBIDiagramRpcClient().getSourceCode({
                filePath,
                flowNode: toolKitNode,
                isFunctionNodeUpdate,
                artifactData,
            });
            if (created?.error) {
                throw new Error(created.error);
            }
            if (edit) {
                await registerDurableTool(filePath, pending.insertBefore.startLine, agentVar, toolKitVarName);
            }
        }));
    };

    // Durable agent capability submits save in the background; true when this submit was one of them.
    const savedDurableEditInBackground = (node: FlowNode, editorConfig?: EditorConfig): boolean => {
        if ((node.codedata as any)?.object === "DurableAgent"
            && Object.values(DURABLE_CAPABILITY_NODE_KINDS).includes(node.codedata.node)) {
            saveDurableCapabilityInBackground(cloneDeep(node), editorConfig);
            return true;
        }
        if (pendingDurableMcpAgentRef.current && node.codedata?.node === "MCP_TOOL_KIT") {
            addDurableMcpToolKitInBackground(cloneDeep(node), editorConfig);
            return true;
        }
        return false;
    };

    // Opens the registration form for a project activity picked from the agent's activity list.
    // The activity itself is already chosen (its selector arrives pre-selected and hidden), so
    // the form presents the registration config: retry policy, approval gating, and a binding
    // selector for every parameter the model cannot supply — the client of a connection-based
    // activity, say. Saving appends the entry to the agent declaration's activities.
    const addActivityToDurableAgent = async (activityCodedata: AvailableNode["codedata"], fileName?: string) => {
        const response = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
            position: targetRef.current.startLine,
            filePath: model?.fileName || fileName,
            // The kind is forced: the same activity listed for a workflow carries the call kind,
            // and the agent needs the registration template for it.
            id: { ...activityCodedata, node: "DURABLE_AGENT_ADD_ACTIVITY" } as typeof activityCodedata,
        });
        const activityNode = applyDurableAgentObjectTarget(response.flowNode);
        activityNode.codedata.isNew = true;
        activityNode.codedata.lineRange = {
            fileName: model?.fileName,
            startLine: targetRef.current.startLine,
            endLine: targetRef.current.startLine,
        } as any;
        // Title the form with the chosen activity, like the edit path does.
        activityNode.metadata = {
            ...activityNode.metadata,
            label: activityCodedata?.symbol || activityNode.metadata?.label,
        } as any;
        selectedNodeRef.current = activityNode;
        nodeTemplateRef.current = activityNode;
        showEditForm.current = false;
        setSidePanelView(SidePanelView.FORM);
        setShowSidePanel(true);
    };

    // Adds a workflow activity to the durable agent: the registerActivities statement is
    // inserted BEFORE the runDurableAgent call (capabilities must be registered before the
    // agent starts), picked from the same activity list the workflow Call Activity uses.
    const handleOnAddDurableActivity = async (runNode: FlowNode) => {
        const superseded = beginPanelNav();
        durableAgentObjectVarRef.current = agentVarFromRunNode(runNode);

        const insertBefore = {
            startLine: runNode.codedata.lineRange.startLine,
            endLine: runNode.codedata.lineRange.startLine,
        };
        targetRef.current = insertBefore as any;
        setTargetLineRange(insertBefore as any);
        durableAgentActivityListRef.current = true;
        setShowProgressIndicator(true);
        rpcClient
            .getBIDiagramRpcClient()
            .search({
                position: { startLine: insertBefore.startLine, endLine: insertBefore.endLine },
                filePath: model?.fileName,
                queryMap: { excludeBuiltins: "true", nodeKind: "DURABLE_AGENT_ADD_ACTIVITY" },
                searchKind: "ACTIVITY_CALL",
            })
            .then((response) => {
                const panelCategories = convertFunctionCategoriesToSidePanelCategories(
                    withoutRegisteredCapabilities(response.categories as Category[], findDurableAgentBox(displayModelRef.current)),
                    FUNCTION_TYPE.REGULAR
                );
                const currentIntegrationCategory = findCurrentIntegrationCategory(panelCategories);
                if (currentIntegrationCategory && !currentIntegrationCategory.items.length) {
                    currentIntegrationCategory.description = "No activities defined. Click below to create a new activity.";
                }
                if (superseded()) {
                    return;
                }
                setCategories(panelCategories);
                setSidePanelView(SidePanelView.ACTIVITY_LIST);
                setShowSidePanel(true);
            })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

    // Adds a human task to the durable agent, inserted BEFORE the runDurableAgent call.
    const handleOnAddDurableHumanTask = async (runNode: FlowNode) => {
        const superseded = beginPanelNav();
        durableAgentObjectVarRef.current = agentVarFromRunNode(runNode);

        const insertBefore = {
            startLine: runNode.codedata.lineRange.startLine,
            endLine: runNode.codedata.lineRange.startLine,
        };
        targetRef.current = insertBefore as any;
        setTargetLineRange(insertBefore as any);
        setShowProgressIndicator(true);
        rpcClient
            .getBIDiagramRpcClient()
            .getNodeTemplate({
                position: insertBefore.startLine,
                filePath: model?.fileName,
                id: { node: "DURABLE_AGENT_HUMAN_TASK" },
            })
            .then((response) => {
                // The FORM reads the node from selectedNodeRef; both refs must point at the
                // template or the form renders empty. The declaration target and insert range
                // must be stamped here — the generic form submit sends the node as-is.
                const taskNode = applyDurableAgentObjectTarget(response.flowNode);
                // The name field's placeholder reads like a value, so offer it as one, unique on this agent.
                const nameProperty = (taskNode.properties as any)?.taskName;
                if (nameProperty && !nameProperty.value && nameProperty.placeholder) {
                    let name = nameProperty.placeholder;
                    for (let suffix = 2; durableBoxHas(displayModelRef.current, "humanTasks", name); suffix++) {
                        name = `${nameProperty.placeholder}${suffix}`;
                    }
                    nameProperty.value = name;
                }
                taskNode.codedata.isNew = true;
                taskNode.codedata.lineRange = {
                    fileName: model?.fileName,
                    startLine: insertBefore.startLine,
                    endLine: insertBefore.startLine,
                } as any;
                selectedNodeRef.current = taskNode;
                nodeTemplateRef.current = taskNode;
                showEditForm.current = false;
                if (superseded()) {
                    return;
                }
                setSidePanelView(SidePanelView.FORM);
                setShowSidePanel(true);
            })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

    // Registers an event on the durable agent, inserted BEFORE the buildAndRunAgent call.
    const handleOnAddDurableEvent = async (runNode: FlowNode) => {
        const superseded = beginPanelNav();
        durableAgentObjectVarRef.current = agentVarFromRunNode(runNode);

        const insertBefore = {
            startLine: runNode.codedata.lineRange.startLine,
            endLine: runNode.codedata.lineRange.startLine,
        };
        targetRef.current = insertBefore as any;
        setTargetLineRange(insertBefore as any);
        setShowProgressIndicator(true);
        rpcClient
            .getBIDiagramRpcClient()
            .getNodeTemplate({
                position: insertBefore.startLine,
                filePath: model?.fileName,
                id: { node: "DURABLE_AGENT_REGISTER_EVENT" },
            })
            .then((response) => {
                const eventNode = applyDurableAgentObjectTarget(response.flowNode);
                eventNode.codedata.isNew = true;
                eventNode.codedata.lineRange = {
                    fileName: model?.fileName,
                    startLine: insertBefore.startLine,
                    endLine: insertBefore.startLine,
                } as any;
                selectedNodeRef.current = eventNode;
                nodeTemplateRef.current = eventNode;
                showEditForm.current = false;
                if (superseded()) {
                    return;
                }
                setSidePanelView(SidePanelView.FORM);
                setShowSidePanel(true);
            })
            .finally(() => {
                setShowProgressIndicator(false);
            });
    };

    // Opens the edit form for an already-registered activity or human task (from clicking its
    // agent-box circle). The capability metadata carries the statement line range and its parsed
    // argument values, so the form opens pre-filled and saving rewrites that statement.
    // The form behind each capability of the agent box. A kind with no entry here has no form,
    // and is refused rather than routed to whichever branch happened to be last.
    const durableCapabilityNodeKind = (type?: string): string | undefined =>
        DURABLE_CAPABILITY_NODE_KINDS[type ?? ""];

    const handleOnEditDurableCapability = async (runNode: FlowNode, capability: any) => {
        const superseded = beginPanelNav();
        if (showSidePanel) {
            // Matching node selection: while a side panel is open, switching to another
            // capability's form is disabled.
            return;
        }
        durableAgentObjectVarRef.current = agentVarFromRunNode(runNode);
        const lineRange = capability?.lineRange;
        if (!lineRange) {
            // Stale capability data (e.g. a canvas rendered before the last refresh): fall
            // back to a fresh add-form pre-selected with this capability's reference.
            console.error(">>> Capability entry has no line range; opening a fresh form", capability);
            return;
        }
        const nodeKind = durableCapabilityNodeKind(capability?.type);
        if (!nodeKind) {
            // Better to do nothing than to act on the wrong form: an unhandled kind used to fall
            // through to the human task form, showing another capability's values.
            console.error(">>> No form for capability kind", capability?.type, capability);
            return;
        }
        // Two distinct positions, and they must not be conflated. The entry's own range (above)
        // is where the edit is written, and it points INSIDE the declaration's `check new
        // ({...})` config literal. The expression editor, however, splices a statement to
        // resolve types and completions, which cannot parse between mapping fields — so its
        // target is the declaration's start, exactly as the add-capability handlers already do.
        const probeRange = probeRangeForCapability(runNode, lineRange);
        targetRef.current = probeRange;
        setTargetLineRange(probeRange);
        setShowProgressIndicator(true);
        try {
            // An activity capability's template is requested with the activity function as the
            // symbol: the selector arrives pre-selected (and hidden — the entry's activity is its
            // identity, not a choice) and the template carries the binding selector properties,
            // without which a declared `bindings` field could not round-trip through the form.
            const activityRef =
                capability?.type === "activity" ? (capability?.values as any)?.activity : undefined;
            const response = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                position: lineRange.startLine,
                filePath: model?.fileName,
                id: (activityRef ? { node: nodeKind, symbol: activityRef } : { node: nodeKind }) as any,
            });
            const node = response.flowNode;
            // Seed the form with the existing statement's values and point it at that statement.
            const values = (capability?.values || {}) as Record<string, string>;
            const nodeProps = node.properties as Record<string, SeedableProperty>;
            for (const [key, value] of Object.entries(values)) {
                if (nodeProps?.[key]) {
                    // Both halves: the value and the mode it belongs in. The values arrive as source,
                    // so a reference stays an expression instead of being quoted into a literal on save.
                    seedCapabilityValue(nodeProps[key], value);
                }
            }
            if (capability?.type === "activity") {
                showActivityIdentityReadOnly(nodeProps);
            }
            node.codedata.lineRange = lineRange;
            node.codedata.isNew = false;
            applyDurableAgentObjectTarget(node);
            // The form presents the capability itself (like the workflow node forms): the
            // panel title is the capability's name and the subtitle its description.
            node.metadata = {
                ...node.metadata,
                label: capability?.name || node.metadata?.label,
                // The values are source, so a literal is decoded for the subtitle rather than
                // shown with its quotes.
                description: capabilityValueText(values?.description) || node.metadata?.description,
            } as any;
            selectedNodeRef.current = node;
            nodeTemplateRef.current = node;
            showEditForm.current = true;
            if (superseded()) {
                return;
            }
            setSidePanelView(SidePanelView.FORM);
            setShowSidePanel(true);
        } finally {
            setShowProgressIndicator(false);
        }
    };

    // Removes a declared capability from the object-model agent: the LS deletes the entry
    // from the declaration's config list (comma-aware) via the capability builder's
    // delete request.
    const handleOnDeleteDurableCapability = async (runNode: FlowNode, capability: any) => {
        const lineRange = capability?.lineRange;
        const agentVar = agentVarFromRunNode(runNode);
        const nodeKind = durableCapabilityNodeKind(capability?.type);
        const list = capabilityListOf(capability?.type);
        const name: string = capability?.name;
        if (!lineRange || !agentVar || !nodeKind || !list || !name) {
            console.error(">>> Cannot remove the capability", capability);
            return;
        }
        const filePath = model?.fileName;
        // An event's triggers send to it, so they cannot outlive it.
        const senders = capability?.type === "event"
            ? (((runNode.metadata?.data as any)?.usages ?? []) as AgentUsage[]).filter((usage) => usage.channel === name)
            : [];
        if (senders.length > 0) {
            const choice = await rpcClient.getCommonRpcClient().showInformationModal({
                message: `Are you sure you want to delete the ${name} data event?`,
                detail: senders.length === 1
                    ? "A trigger sends to it, so the trigger will be deleted too."
                    : `${senders.length} triggers send to it, so they will be deleted too.`,
                items: ["Delete Data Event"],
            });
            if (choice !== "Delete Data Event") {
                return;
            }
        }
        runDurableEdit({ op: "remove", list, name }, async () => {
            const range = durableCapabilityRange(await latestDurableBox(), list, name);
            if (!range) {
                throw new Error(`'${name}' was not found on the agent.`);
            }
            const { flowNode: node } = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                position: range.startLine,
                filePath,
                id: { node: nodeKind } as any,
            });
            node.codedata = { ...node.codedata, object: "DurableAgent", parentSymbol: agentVar, isNew: false, lineRange: range } as any;
            (node.properties as any)["__delete"] = {
                value: "true",
                optional: true,
                editable: false,
                advanced: false,
                hidden: true,
            };
            await withUndoGroup(rpcClient, async () => {
                const response = await rpcClient.getBIDiagramRpcClient().getSourceCode({ filePath, flowNode: node });
                if (response?.error) {
                    throw new Error(response.error);
                }
                for (const sender of senders) {
                    await deleteEventSender(rpcClient, sender);
                }
            });
        });
    };

    // Deletes a trigger of the durable agent: its row goes at once and the edit saves in the background.
    const handleOnDeleteDurableTrigger = async (usage: AgentUsage) => {
        const trigger = usage.trigger;
        if (!trigger) {
            return;
        }
        const choice = await confirmTriggerDeletion(rpcClient, usage);
        if (!choice) {
            return;
        }
        const { flow, restore } = withoutDurableUsage(model, projectPath, usage);
        setModel(flow);
        runDurableEdit(undefined, async () => {
            try {
                await removeAgentTrigger(rpcClient, trigger, choice);
            } catch (error) {
                restore();
                throw error;
            }
        });
    };

    const handleOnEditDurableAgentModel = (agentCallNode: FlowNode) => {
        const superseded = beginPanelNav();
        selectedNodeRef.current = agentCallNode;
        showEditForm.current = true;
        setSelectedNodeId(agentCallNode.id);
        setSelectedConnectionKind('MODEL_PROVIDER');
        if (superseded()) {
            return;
        }
        setSidePanelView(SidePanelView.CONNECTION_CONFIG);
        setShowSidePanel(true);
    };

    const agentEditor = useAgentEditorController({
        projectPath,
        filePath: model?.fileName,
        onModelSelect: (node) => {
            selectedNodeRef.current = node;
            showEditForm.current = true;
            setSelectedConnectionKind("MODEL_PROVIDER");
            setSidePanelView(SidePanelView.CONNECTION_CONFIG);
            setShowSidePanel(true);
        },
        onRefresh: () => {
            markFlowModelStale();
            debouncedGetFlowModel();
            return flowModelRefresher.upToDate();
        },
        onSelectionChange: (node) => {
            selectedNodeRef.current = node;
            setSelectedNodeId(node?.id);
        },
        onLoadingChange: setShowProgressIndicator,
        // Unlike the agent view, flows keep the canvas locked while a tool deletion saves.
        onBackgroundSaveChange: setShowProgressIndicator,
        onChat: handleOnChatWithAgent,
    });

    const { syncToolEdits } = agentEditor;
    useEffect(() => {
        syncToolEdits(model);
        setDurableEdits(keepIf((edit: DurableEdit) => !durableEditLanded(model, edit)));
    }, [model, syncToolEdits]);

    const prevAgentViewRef = useRef<AgentEditorView>("NONE");
    useEffect(() => {
        const panelMap: Record<Exclude<AgentEditorView, "NONE">, SidePanelView> = {
            MEMORY: SidePanelView.AGENT_MEMORY_MANAGER,
            MEMORY_STORE: SidePanelView.AGENT_MEMORY_STORE,
            ADD_TOOL: SidePanelView.ADD_TOOL,
            NEW_TOOL_CUSTOM: SidePanelView.NEW_TOOL_CUSTOM,
            NEW_TOOL_CONNECTION: SidePanelView.NEW_TOOL_FROM_CONNECTION,
            NEW_TOOL_FUNCTION: SidePanelView.NEW_TOOL_FROM_FUNCTION,
            NEW_TOOL_AGENT: SidePanelView.NEW_TOOL_FROM_AGENT,
            NEW_TOOL_AGENT_FORM: SidePanelView.NEW_TOOL_FROM_AGENT_FORM,
            NEW_TOOL_KNOWLEDGE_BASE: SidePanelView.NEW_TOOL_FROM_KNOWLEDGE_BASE,
            ADD_MCP: SidePanelView.ADD_MCP_SERVER,
            EDIT_MCP: SidePanelView.EDIT_MCP_SERVER,
        };
        const view = agentEditor.view;
        if (view !== "NONE") {
            setSidePanelView(panelMap[view]);
            setShowSidePanel(true);
        } else if (prevAgentViewRef.current !== "NONE") {
            setShowSidePanel(false);
            setSidePanelView(SidePanelView.NODE_LIST);
            setSelectedNodeId(undefined);
            selectedNodeRef.current = undefined;
        }
        prevAgentViewRef.current = view;
    }, [agentEditor.view]);

    const updateNodeWithConnection = async (selectedNode: FlowNode) => {
        if (selectedNode.codedata.node === "KNOWLEDGE_BASE") {
            setSidePanelView(SidePanelView.FORM);
            return;
        }
        const writeSource = () => rpcClient
            .getBIDiagramRpcClient()
            .getSourceCode({ filePath: projectPath, flowNode: selectedNode });
        await (agentOnlyView ? serializeAgentToolsEdit(writeSource) : writeSource());
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

    // Opens the durable agent's own model (the declaration canvas). Used by run-site agent
    // boxes, which are read-only references to the agent instance.
    const handleOnGoToDurableAgent = async (node: FlowNode) => {
        const declaration = (node.metadata?.data as {
            declaration?: {
                fileName: string;
                startLine: { line: number; offset: number };
                endLine: { line: number; offset: number };
            };
        })?.declaration;
        if (!declaration) {
            console.error(">>> Durable agent declaration location not found on node", node);
            return;
        }
        const joined = await handleGetProjectPath({ segments: declaration.fileName });
        handleOpenView({
            documentUri: joined?.filePath ?? declaration.fileName,
            position: {
                startLine: declaration.startLine.line,
                startColumn: declaration.startLine.offset,
                endLine: declaration.endLine.line,
                endColumn: declaration.endLine.offset,
            },
        });
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

    // Hide "Chat" button on agent nodes when already inside a chat agent service's flow diagram
    // (chat or decision — the language server reports this kind for every resource of an
    // ai:Listener service, not just chat), since the title bar already offers the same action.
    const isChatAgentFlow = (() => {
        const eventStartNode = flowModel?.nodes.find((node) => node.codedata.node === "EVENT_START");
        const meta = eventStartNode?.metadata?.data as { kind?: string; label?: string } | undefined;
        return meta?.kind === "Chat Agent Service";
    })();

    // Durable Agentic Workflow agent-only view: the LS flow model carries the synthetic
    // agent box (or its draft placeholder) at index 0 followed by the full control-flow
    // chain. While the configuration is hidden, render just [Start, agent box] — the
    // visitor links the pair with a non-editable edge.
    const agentOnlyView = !!hideAgentConfiguration && !!flowModel?.nodes?.some(isDurableAgentBoxNode);
    const durableUsagesLoaded = useDurableAgentUsages(agentOnlyView, model, projectPath, setModel);
    const shownModel = useMemo(
        () => drawDurableEdits(drawToolEdits(agentOnlyView
            ? withKnownDurableUsages({
                ...flowModel,
                nodes: [
                    ...flowModel.nodes.filter((node) => node.codedata?.node === "EVENT_START"),
                    ...flowModel.nodes.filter(isDurableAgentBoxNode),
                ],
            }, projectPath)
            : flowModel, agentEditor.deletingTools, agentEditor.addingTools), durableEdits),
        [flowModel, agentOnlyView, projectPath, agentEditor.deletingTools, agentEditor.addingTools, durableEdits]
    );
    // A new model object rebuilds the canvas and closes any open menu, so an unchanged agent box keeps the old object.
    const displayModel = useStableFlow(shownModel, agentOnlyView);
    displayModelRef.current = displayModel;

    // No RHS side panel in the agent-only view: node clicks (the Start pill) are inert;
    // the agent box hosts its own affordances. While a side panel is already open,
    // selecting a different node is disabled, matching the other flow diagrams — the
    // panel would otherwise keep showing the previous node's context.
    const handleOnEditNodeGuarded = (node: FlowNode) => {
        if (showSidePanel) {
            return;
        }
        if (agentOnlyView && node.codedata?.node === "EVENT_START") {
            return;
        }
        return handleOnEditNode(node);
    };

    const handleOnEditConnectionGuarded = (connectionName: string) => {
        if (showSidePanel) {
            return;
        }
        return handleOnEditConnection(connectionName);
    };

    const memoizedDiagramProps = useMemo(
        () => ({
            model: displayModel,
            onAddNode: handleOnAddNode,
            onAddNodePrompt: handleOnAddNodePrompt,
            onDeleteNode: handleOnDeleteNode,
            onAddComment: handleOnAddComment,
            onNodeSelect: handleOnEditNodeGuarded,
            onConnectionSelect: handleOnEditConnectionGuarded,
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
            agentNode: {
                ...agentEditor.diagramCallbacks,
                onChatWithAgent: isChatAgentFlow ? undefined : agentEditor.diagramCallbacks.onChatWithAgent,
                // The durable agent box edits its model through the declaration; AI agents
                // keep the agent editor controller's flow.
                onModelSelect: (node: FlowNode) => node.codedata?.node === "DURABLE_AGENT_RUN"
                    ? handleOnEditDurableAgentModel(node)
                    : agentEditor.diagramCallbacks.onModelSelect?.(node),
                onAddActivity: handleOnAddDurableActivity,
                onAddHumanTask: handleOnAddDurableHumanTask,
                onAddEvent: handleOnAddDurableEvent,
                onAddTrigger: agentOnlyView ? (node: FlowNode) => startAddAgentTrigger(node, rpcClient) : agentEditor.diagramCallbacks.onAddTrigger,
                onAddEventTrigger: agentOnlyView ? (node: FlowNode, event: ToolData) => startAddDurableEventTrigger(node, event, rpcClient) : undefined,
                onEditCapability: handleOnEditDurableCapability,
                onDeleteCapability: handleOnDeleteDurableCapability,
                onDeleteTrigger: agentOnlyView ? handleOnDeleteDurableTrigger : agentEditor.diagramCallbacks.onDeleteTrigger,
                // Outside the declaration canvas the durable agent box is a read-only
                // reference; clicks navigate to the agent's own model.
                durableAgentReference: !agentOnlyView,
                onGoToAgent: handleOnGoToDurableAgent,
            },
            isAgentFocusView: agentOnlyView,
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
            // Any open side panel dims and locks the canvas, exactly like the node-edit
            // flow — the agent capability panels set no selectedNodeId, so they key off
            // showSidePanel.
            readOnly: showProgressSpinner || showProgressIndicator || hasDraft || selectedNodeId !== undefined
                || showSidePanel,
            overlay: {
                visible: selectedNodeId !== undefined || topNodeRef.current !== undefined || hasDraft
                    || showSidePanel,
                onClickOverlay: handleOnCloseSidePanel,
            },
            isUserAuthenticated,
            aiAssistantName: assistantName,
            entrypointContext,
        }),
        [
            flowModel,
            displayModel,
            hideAgentConfiguration,
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
            assistantName,
            entrypointContext,
            showSidePanel,
        ]
    );

    return (
        <PanelOverlayProvider>
            <View>
                {(showProgressIndicator || fetchingAiSuggestions) && model && (
                    <ProgressIndicator color={ThemeColors.PRIMARY} />
                )}
                <Container onClickCapture={blockStaleInput} onMouseDownCapture={blockStaleInput}>
                    {(!model || !durableUsagesLoaded) && <DiagramSkeleton />}
                    {model && durableUsagesLoaded && <MemoizedDiagram {...memoizedDiagramProps} />}
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
                onBack={sidePanelView === SidePanelView.ERROR ? handleRetryNodeFetch : handleOnFormBack}
                onSelectNode={handleOnSelectNode}
                // Add node callbacks
                onAddConnection={handleOnAddConnection}
                onAddFunction={handleOnAddFunction}
                onAddWorkflow={handleOnAddWorkflow}
                onAddActivity={handleOnAddActivity}
                onAddActivityFromConnection={handleOnAddActivityFromConnection}
                onActivityFromConnectionCreated={handleActivityFromConnectionCreated}
                onActivityFromConnectionCreatedReturnToList={handleActivityFromConnectionCreatedReturnToList}
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
                refreshingAiComponents={refreshingAiComponents}
                formLoadingNode={formLoadingNode}
                onDiscardSuggestions={onDiscardSuggestions}
                onSubPanel={handleSubPanel}
                onUpdateExpressionField={handleUpdateExpressionField}
                onResetUpdatedExpressionField={handleResetUpdatedExpressionField}
                onSearchFunction={handleSearchFunction}
                onLoadMoreFunctionSection={loadMoreFunctionSection}
                onShowMoreFunctions={canCallFunctions ? handleShowMoreFunctions : undefined}
                functionSectionsWithMore={functionSectionsWithMore}
                loadingFunctionSections={loadingFunctionSections}
                onSearchWorkflow={handleSearchWorkflow}
                onSearchActivity={handleSearchActivity}
                onSearchNpFunction={handleSearchNpFunction}
                onSearchTextChange={handleSearchTextChange}
                searchText={searchText}
                expandedGroupId={expandedGroupId}
                onExpandedGroupChange={setExpandedGroupId}
                // isSearching={isSearching}
                onSearchModelProvider={handleSearchModelProvider}
                onSearchVectorStore={handleSearchVectorStore}
                onSearchEmbeddingProvider={handleSearchEmbeddingProvider}
                onSearchVectorKnowledgeBase={handleSearchVectorKnowledgeBase}
                onSearchDataLoader={handleSearchDataLoader}
                onSearchChunker={handleSearchChunker}
                onUpdateNodeWithConnection={updateNodeWithConnection}
                // AI Agent specific callbacks
                onAddAgent={() => setShowAddAgentPopup(true)}
                onSelectNewConnection={handleOnSelectNewConnection}
                onSelectConnectorPopup={handleOnSelectConnectorConfiguration}
                onNavigateToPanel={handleOnNavigateToPanel}
                errorMessage={errorMessage}
                agentEditor={agentEditor}
                // Devant specific callbacks
                onImportDevantConn={handleClickImportDevantConn}
                onLinkDevantProject={(platformExtState?.isExtInstalled && !platformExtState?.selectedContext?.project) ? onLinkDevantProject : undefined}
                onRefreshDevantConnections={
                    platformExtState?.selectedContext?.project && !platformExtState?.devantConns?.loading
                        ? () => platformRpcClient?.refreshConnectionList()
                        : undefined
                }
                wso2CloudKbListSection={
                    <CloudKnowledgeBasePage
                        onCreateNew={handleCreateNewCloudKnowledgeBase}
                        onSelectExisting={(item) =>
                            cloudKbNodeRef.current &&
                            handleCreateDevantKnowledgeBase(cloudKbNodeRef.current, item)
                        }
                    />
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
                        onAgentCreated={() => {
                            setShowAddAgentPopup(false);
                            loadAvailableAgents();
                        }}
                    />
                </AddAgentPopupLayer>
            )}
        </PanelOverlayProvider>
    );
}
