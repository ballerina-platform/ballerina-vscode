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

import React, { useState, useEffect, memo } from "react";
import { DiagramEngine, DiagramModel } from "@projectstorm/react-diagrams";
import { cloneDeep } from "lodash";
import { NavigationWrapperCanvasWidget } from "./DiagramNavigationWrapper/NavigationWrapperCanvasWidget";

import {
    clearDiagramZoomAndPosition,
    generateEngine,
    hasDiagramZoomAndPosition,
    loadDiagramZoomAndPosition,
    registerListeners,
    resetDiagramZoomAndPosition,
} from "../utils/diagram";
import { DiagramCanvas } from "./DiagramCanvas";
import { Flow, NodeModel, FlowNode, Branch, LineRange, NodePosition, ToolData, DraftNodeConfig } from "../utils/types";
import { NodeFactoryVisitor } from "../visitors/NodeFactoryVisitor";
import { NodeLinkModel } from "./NodeLink";
import { OverlayLayerModel } from "./OverlayLayer";
import { DiagramContextProvider, DiagramContextState, DiagramPromptOptions, ExpressionContextProps } from "./DiagramContext";
import { SizingVisitor } from "../visitors/SizingVisitor";
import { PositionVisitor } from "../visitors/PositionVisitor";
import { InitVisitor } from "../visitors/InitVisitor";
import { LinkTargetVisitor } from "../visitors/LinkTargetVisitor";
import { NodeTypes } from "../resources/constants";
import Controls from "./Controls";
import { CurrentBreakpointsResponse as BreakpointInfo, JoinProjectPathRequest, JoinProjectPathResponse, traverseFlow, VisualizerLocation } from "@wso2/ballerina-core";
import { BreakpointVisitor } from "../visitors/BreakpointVisitor";
import { BaseNodeModel } from "./nodes/BaseNode";
import { AgentCallNodeModel } from "./nodes/AgentCallNode/AgentCallNodeModel";
import { AgentTypeNodeModel } from "./nodes/AgentTypeNode/AgentTypeNodeModel";
import { AgentNodeModel } from "./nodes/AgentNode/AgentNodeModel";
import { PopupOverlay } from "./PopupOverlay";

export interface DiagramProps {
    model: Flow;
    onAddNode?: (parent: FlowNode | Branch, target: LineRange) => void;
    onAddNodePrompt?: (parent: FlowNode | Branch, target: LineRange, prompt: string, options?: DiagramPromptOptions) => void;
    onDeleteNode?: (node: FlowNode) => void;
    onAddComment?: (comment: string, target: LineRange) => void;
    onNodeSelect?: (node: FlowNode) => void;
    onNodeSave?: (node: FlowNode) => void;
    addBreakpoint?: (node: FlowNode) => void;
    removeBreakpoint?: (node: FlowNode) => void;
    onConnectionSelect?: (connectionName: string) => void;
    goToSource?: (node: FlowNode) => void;
    openView?: (location: VisualizerLocation) => void;
    goToAgent?: (node: FlowNode) => void;
    draftNode?: DraftNodeConfig;
    selectedNodeId?: string;
    // agent node callbacks
    agentNode?: {
        onModelSelect?: (node: FlowNode) => void;
        onAddTool?: (node: FlowNode) => void;
        onAddMcpServer?: (node: FlowNode) => void;
        onSelectTool?: (tool: ToolData, node: FlowNode) => void;
        onSelectMcpToolkit?: (tool: ToolData, node: FlowNode) => void;
        onDeleteTool?: (tool: ToolData, node: FlowNode) => void;
        goToTool?: (tool: ToolData, node: FlowNode) => void;
        onSelectMemoryManager?: (node: FlowNode) => void;
        onDeleteMemoryManager?: (node: FlowNode) => void;
        onChatWithAgent?: (node: FlowNode) => void;
    };
    // ai nodes callbacks
    aiNodes?: {
        onModelSelect: (node: FlowNode) => void;
    };
    // ai suggestions callbacks
    suggestions?: {
        fetching: boolean;
        onAccept(): void;
        onDiscard(): void;
    };
    project?: {
        org: string;
        path: string;
        getProjectPath?: (props: JoinProjectPathRequest) => Promise<JoinProjectPathResponse>;
        getFunctionLocation?: (functionName: string) => Promise<VisualizerLocation | undefined>;
    };
    breakpointInfo?: BreakpointInfo;
    readOnly?: boolean;
    overlay?: {
        visible: boolean;
        onClickOverlay: () => void;
    }
    isUserAuthenticated?: boolean;
    expressionContext?: ExpressionContextProps;
    entrypointContext?: {
        serviceName?: string;
        functionName?: string;
    };
    // Set only by the agent focus-flow diagram, so its single-node centering never affects the
    // normal flow diagram.
    isAgentFocusView?: boolean;
    // When true, renders Controls with position:absolute (inside a popup) instead of position:fixed.
    embedded?: boolean;
}

export function Diagram(props: DiagramProps) {
    const {
        model,
        onAddNode,
        onAddNodePrompt,
        onDeleteNode,
        onAddComment,
        onNodeSelect,
        onNodeSave,
        onConnectionSelect,
        goToSource,
        openView,
        goToAgent,
        draftNode,
        selectedNodeId,
        agentNode,
        aiNodes,
        suggestions,
        project,
        addBreakpoint,
        removeBreakpoint,
        breakpointInfo,
        readOnly,
        overlay,
        isUserAuthenticated,
        expressionContext,
        entrypointContext,
        isAgentFocusView,
        embedded,
    } = props;

    const [showErrorFlow, setShowErrorFlow] = useState(false);
    const [nodeComments, setNodeComments] = useState<Map<string, FlowNode>>(new Map());
    const [diagramEngine] = useState<DiagramEngine>(generateEngine());
    const [diagramModel, setDiagramModel] = useState<DiagramModel | null>(null);
    // In embedded agent focus view, hide until centering completes to avoid visible jump.
    const [canvasVisible, setCanvasVisible] = useState(!(isAgentFocusView && embedded));
    const [showComponentPanel, setShowComponentPanel] = useState(false);
    const [expandedErrorHandler, setExpandedErrorHandler] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (diagramEngine) {
            const { nodes, links, comments } = getDiagramData();
            setNodeComments(comments);
            drawDiagram(nodes, links);
        }
    }, [model, showErrorFlow, expandedErrorHandler]);

    useEffect(() => {
        console.log(">>> Init diagram model", model);
        return () => {
            clearDiagramZoomAndPosition();
        };
    }, []);

    const getDiagramData = () => {
        let flowModel = cloneDeep(model);

        // Check if active breakpoint is within onFailure nodes and update expandedErrorHandler before running visitors
        let currentExpandedErrorHandler = expandedErrorHandler;
        if (breakpointInfo?.activeBreakpoint) {
            const errorHandlerToExpand = getErrorHandlerIdForActiveBreakpoint(flowModel, breakpointInfo);
            if (errorHandlerToExpand && expandedErrorHandler !== errorHandlerToExpand) {
                currentExpandedErrorHandler = errorHandlerToExpand;
                setExpandedErrorHandler(errorHandlerToExpand);
            }
        }

        const initVisitor = new InitVisitor(flowModel, currentExpandedErrorHandler);
        traverseFlow(flowModel, initVisitor);
        const sizingVisitor = new SizingVisitor();
        traverseFlow(flowModel, sizingVisitor);
        const positionVisitor = new PositionVisitor();
        traverseFlow(flowModel, positionVisitor);
        if (breakpointInfo) {
            const breakpointVisitor = new BreakpointVisitor(breakpointInfo);
            traverseFlow(flowModel, breakpointVisitor);
        }
        // create diagram nodes and links
        const nodeVisitor = new NodeFactoryVisitor();
        traverseFlow(flowModel, nodeVisitor);

        const nodes = nodeVisitor.getNodes();
        const links = nodeVisitor.getLinks();
        const comments = nodeVisitor.getNodeComments();

        const addTargetVisitor = new LinkTargetVisitor(model, nodes);
        traverseFlow(flowModel, addTargetVisitor);
        return { nodes, links, comments };
    };

    // Helper function to find error handlers with active breakpoints in onFailure branches
    const getErrorHandlerIdForActiveBreakpoint = (flow: Flow, breakpointInfo: BreakpointInfo): string | undefined => {
        if (!breakpointInfo.activeBreakpoint) {
            return undefined;
        }

        let errorHandlerIdToExpand: string | undefined;
        const activeBreakpoint = breakpointInfo.activeBreakpoint;

        const checkNode = (node: FlowNode): void => {
            if (node.codedata?.node === "ERROR_HANDLER") {
                // Find the onFailure branch
                const onFailureBranch = node.branches?.find((branch) => branch.codedata?.node === "ON_FAILURE");
                if (onFailureBranch) {
                    // Check if any child nodes in the onFailure branch match the active breakpoint
                    const hasActiveBreakpointInOnFailure = checkForActiveBreakpointInBranch(
                        onFailureBranch,
                        activeBreakpoint
                    );
                    if (hasActiveBreakpointInOnFailure) {
                        errorHandlerIdToExpand = node.id;
                        return;
                    }
                }
            }

            // Recursively check child nodes
            if (node.branches) {
                for (const branch of node.branches) {
                    if (branch.children) {
                        for (const child of branch.children) {
                            checkNode(child);
                            if (errorHandlerIdToExpand) return;
                        }
                    }
                }
            }
        };

        const checkForActiveBreakpointInBranch = (branch: any, activeBreakpoint: any): boolean => {
            if (branch.children) {
                for (const child of branch.children) {
                    // Check if this node matches the active breakpoint
                    if (child.codedata?.lineRange?.startLine?.line === activeBreakpoint.line) {
                        return true;
                    }
                    // Recursively check nested branches
                    if (child.branches) {
                        for (const nestedBranch of child.branches) {
                            if (checkForActiveBreakpointInBranch(nestedBranch, activeBreakpoint)) {
                                return true;
                            }
                        }
                    }
                }
            }
            return false;
        };

        // Start checking from the root nodes
        if (flow.nodes) {
            for (const child of flow.nodes) {
                checkNode(child);
                if (errorHandlerIdToExpand) break;
            }
        }

        return errorHandlerIdToExpand;
    };

    const drawDiagram = (nodes: NodeModel[], links: NodeLinkModel[]) => {
        const newDiagramModel = new DiagramModel();
        newDiagramModel.addLayer(new OverlayLayerModel());
        // add nodes and links to the diagram

        // get code block nodes from nodes
        const codeBlockNodes = nodes.filter((node) => node.getType() === NodeTypes.CODE_BLOCK_NODE);
        // get all other nodes
        const otherNodes = nodes.filter((node) => node.getType() !== NodeTypes.CODE_BLOCK_NODE);

        newDiagramModel.addAll(...codeBlockNodes);
        newDiagramModel.addAll(...otherNodes, ...links);

        diagramEngine.setModel(newDiagramModel);
        setDiagramModel(newDiagramModel);
        registerListeners(diagramEngine);

        diagramEngine.setModel(newDiagramModel);
        // remove loader overlay layer
        const overlayLayer = diagramEngine
            .getModel()
            .getLayers()
            .find((layer) => layer instanceof OverlayLayerModel);
        if (overlayLayer) {
            diagramEngine.getModel().removeLayer(overlayLayer);
        }

        // Agent focus view renders a lone agent node (built-in AGENT_CALL or custom AGENT_TYPE). Center the agent
        // card (width = 2 * lw) on the diagram center line (x = 0), letting the model/tools branch out to the right;
        // the shared reset/centering below then horizontally centers the card in the canvas.
        // Gated on isAgentFocusView so it never affects the normal flow diagram.
        const isSingleAgentNode =
            isAgentFocusView && nodes.length === 1 &&
            (nodes[0].getType() === NodeTypes.AGENT_CALL_NODE ||
                nodes[0].getType() === NodeTypes.AGENT_TYPE_NODE ||
                nodes[0].getType() === NodeTypes.AGENT_NODE);
        if (isSingleAgentNode) {
            const agentNode = nodes[0] as AgentCallNodeModel | AgentTypeNodeModel | AgentNodeModel;
            const { lw, y } = agentNode.node.viewState;
            agentNode.setPosition(-lw, y);
        }

        if (nodes.length < 3 || !hasDiagramZoomAndPosition(model.fileName)) {
            resetDiagramZoomAndPosition(model.fileName);
        }
        loadDiagramZoomAndPosition(diagramEngine);

        if (isSingleAgentNode) {
            const centerSingleAgentNode = () => {
                const canvas = diagramEngine.getCanvas();
                if (!canvas) {
                    return false;
                }
                const agentNode = nodes[0] as AgentCallNodeModel | AgentTypeNodeModel | AgentNodeModel;
                const diagramModel = diagramEngine.getModel();
                const zoom = diagramModel.getZoomLevel() / 100;
                const cardHeight = agentNode.node.viewState.ch || agentNode.node.viewState.h;
                const { width: canvasWidth, height: canvasHeight } = canvas.getBoundingClientRect();
                // Card center is at diagram x=0 (node placed at x=-lw), so offsetX = canvasWidth/2.
                const offsetX = canvasWidth / 2;
                const offsetY = canvasHeight / 2 - 40 - (agentNode.getY() + cardHeight / 2) * zoom;
                diagramModel.setOffset(offsetX, offsetY);
                return true;
            };

            if (!centerSingleAgentNode()) {
                requestAnimationFrame(() => {
                    if (centerSingleAgentNode()) {
                        diagramEngine.repaintCanvas();
                    }
                    setCanvasVisible(true);
                });
            } else {
                setCanvasVisible(true);
            }
        }

        diagramEngine.repaintCanvas();
        // update the diagram model state
        setDiagramModel(newDiagramModel);
    };

    const handleCloseComponentPanel = () => {
        setShowComponentPanel(false);
    };

    const handleShowComponentPanel = () => {
        setShowComponentPanel(true);
    };

    const toggleErrorHandlerExpansion = (nodeId: string) => {
        setExpandedErrorHandler((prev) => (prev === nodeId ? undefined : nodeId));
    };

    const context: DiagramContextState = {
        flow: model,
        componentPanel: {
            visible: showComponentPanel,
            show: handleShowComponentPanel,
            hide: handleCloseComponentPanel,
        },
        showErrorFlow: showErrorFlow,
        expandedErrorHandler: expandedErrorHandler,
        toggleErrorHandlerExpansion: toggleErrorHandlerExpansion,
        onAddNode: onAddNode,
        onAddNodePrompt: onAddNodePrompt,
        onDeleteNode: onDeleteNode,
        onAddComment: onAddComment,
        onNodeSelect: onNodeSelect,
        onNodeSave: onNodeSave,
        addBreakpoint: addBreakpoint,
        removeBreakpoint: removeBreakpoint,
        onConnectionSelect: onConnectionSelect,
        goToSource: goToSource,
        openView: openView,
        goToAgent: goToAgent,
        draftNode: draftNode,
        selectedNodeId: selectedNodeId,
        // Fill any editing callbacks the host omits (e.g. the main flow only passes onChatWithAgent)
        // with no-ops so widgets can call them unconditionally.
        agentNode: {
            onModelSelect: () => { },
            onAddTool: () => { },
            onAddMcpServer: () => { },
            onSelectTool: () => { },
            onSelectMcpToolkit: () => { },
            onDeleteTool: () => { },
            goToTool: () => { },
            onSelectMemoryManager: () => { },
            onDeleteMemoryManager: () => { },
            ...agentNode,
        },
        aiNodes: aiNodes,
        suggestions: suggestions,
        project: project,
        readOnly: onAddNode === undefined || onDeleteNode === undefined || onNodeSelect === undefined || readOnly,
        isUserAuthenticated: isUserAuthenticated,
        nodeComments: nodeComments,
        expressionContext: expressionContext || {
            completions: [],
            triggerCharacters: [],
            retrieveCompletions: () => Promise.resolve(),
            getHelperPane: undefined,
        },
        entrypointContext,
    };

    const getActiveBreakpointNode = (nodes: NodeModel[]): NodeModel => {
        const node = nodes.find((node) => {
            const isValidType =
                node.getType() === NodeTypes.BASE_NODE ||
                node.getType() === NodeTypes.WHILE_NODE ||
                node.getType() === NodeTypes.IF_NODE ||
                node.getType() === NodeTypes.API_CALL_NODE ||
                node.getType() === NodeTypes.WORKFLOW_RUN_NODE ||
                node.getType() === NodeTypes.CALL_ACTIVITY_NODE ||
                node.getType() === NodeTypes.SEND_DATA_NODE ||
                node.getType() === NodeTypes.WAIT_DATA_NODE;
            return isValidType && (node as BaseNodeModel).isActiveBreakpoint();
        });

        return node;
    };

    const getDraftNode = (nodes: NodeModel[]): NodeModel | undefined =>
        nodes.find((node) => node.getType() === NodeTypes.DRAFT_NODE);

    const getFocusedNode = (nodes: NodeModel[]): NodeModel | undefined =>
        getActiveBreakpointNode(nodes) || getDraftNode(nodes);

    return (
        <div style={{
            opacity: canvasVisible ? 1 : 0,
            transition: canvasVisible ? "opacity 0.15s ease" : "none",
            height: "100%",
            width: "100%",
        }}>
            <Controls engine={diagramEngine} embedded={embedded} />
            {diagramEngine && diagramModel && (
                <DiagramContextProvider value={context}>
                    {overlay?.visible && <PopupOverlay onClose={overlay.onClickOverlay} />}
                    <DiagramCanvas>
                        <NavigationWrapperCanvasWidget
                            diagramEngine={diagramEngine}
                            focusedNode={getFocusedNode(diagramModel.getNodes() as NodeModel[])}
                        />
                    </DiagramCanvas>
                </DiagramContextProvider>
            )}
        </div>
    );
}

export const MemoizedDiagram = memo(Diagram);
