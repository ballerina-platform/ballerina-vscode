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
import createEngine, { DiagramEngine, DiagramModel } from "@projectstorm/react-diagrams";
import { NodePortFactory, NodePortModel } from "../components/NodePort";
import { NodeLinkFactory, NodeLinkModel, NodeLinkModelOptions } from "../components/NodeLink";
import { OverlayLayerFactory } from "../components/OverlayLayer";
import { DagreEngine } from "../resources/dagre/DagreEngine";
import { NodeModel } from "./types";
import { EntryNodeFactory, EntryNodeModel } from "../components/nodes/EntryNode";
import { ConnectionNodeFactory } from "../components/nodes/ConnectionNode/ConnectionNodeFactory";
import { ListenerNodeFactory } from "../components/nodes/ListenerNode/ListenerNodeFactory";
import {
    LISTENER_NODE_WIDTH,
    NodeTypes,
    NODE_GAP_X,
    ENTRY_NODE_WIDTH,
    ENTRY_NODE_HEIGHT,
    NODE_GAP_Y,
    LISTENER_NODE_HEIGHT,
} from "../resources/constants";
import { ListenerNodeModel } from "../components/nodes/ListenerNode";
import { ConnectionNodeModel } from "../components/nodes/ConnectionNode";
import {
    CDConnection,
    CDResourceFunction,
    CDFunction,
    CDService,
    CDWorkflow,
    CDWorkflowEvent,
} from "@wso2/ballerina-core";
import { GQLFuncListType, GQLState, PREVIEW_COUNT } from "../components/Diagram";

export function generateEngine(): DiagramEngine {
    const engine = createEngine({
        registerDefaultDeleteItemsAction: false,
        registerDefaultZoomCanvasAction: false,
        registerDefaultPanAndZoomCanvasAction: false,
        // repaintDebounceMs: 100,
    });

    engine.getPortFactories().registerFactory(new NodePortFactory());
    engine.getLinkFactories().registerFactory(new NodeLinkFactory());

    engine.getNodeFactories().registerFactory(new ListenerNodeFactory());
    engine.getNodeFactories().registerFactory(new EntryNodeFactory());
    engine.getNodeFactories().registerFactory(new ConnectionNodeFactory());

    engine.getLayerFactories().registerFactory(new OverlayLayerFactory());

    // engine.getActionEventBus().registerAction(new VerticalScrollCanvasAction());
    return engine;
}

export function autoDistribute(engine: DiagramEngine) {
    const model = engine.getModel();

    // Get all nodes by type. Workflows are laid out in their own column so the edges from
    // their triggers (services/automation) flow left to right without crossing other nodes.
    const listenerNodes = model.getNodes().filter((node) => node.getType() === NodeTypes.LISTENER_NODE);
    const allEntryNodes = model.getNodes().filter((node) => node.getType() === NodeTypes.ENTRY_NODE);
    const entryNodes = allEntryNodes.filter((node) => (node as EntryNodeModel).type !== "workflow");
    const workflowNodes = allEntryNodes.filter((node) => (node as EntryNodeModel).type === "workflow");
    const connectionNodes = model.getNodes().filter((node) => node.getType() === NodeTypes.CONNECTION_NODE);

    // Set X positions for each column: listeners | entry points | workflows | connections.
    // The workflow column collapses when empty.
    const listenerX = 250;
    const entryX = listenerX + LISTENER_NODE_WIDTH + NODE_GAP_X;
    let nextX = entryX + ENTRY_NODE_WIDTH + NODE_GAP_X;
    const workflowX = nextX;
    if (workflowNodes.length > 0) {
        nextX += ENTRY_NODE_WIDTH + NODE_GAP_X;
    }
    const connectionX = nextX;

    // Separate listeners into connected and unconnected
    const connectedListeners: ListenerNodeModel[] = [];
    const unconnectedListeners: ListenerNodeModel[] = [];

    listenerNodes.forEach((node) => {
        const listenerNode = node as ListenerNodeModel;
        const attachedServices = listenerNode.node.attachedServices;

        // Find the attached service nodes
        const serviceNodes = entryNodes.filter((n) => attachedServices.includes(n.getID()));

        if (serviceNodes.length > 0) {
            // Has attached services - position at average Y of services
            const avgY = serviceNodes.reduce((sum, n) => sum + n.getY(), 0) / serviceNodes.length;
            listenerNode.setPosition(listenerX, avgY);
            connectedListeners.push(listenerNode);
        } else {
            // No attached services - will position later
            unconnectedListeners.push(listenerNode);
        }
    });

    // Update X positions for entry nodes while keeping their Y positions
    entryNodes.forEach((node) => {
        const entryNode = node as EntryNodeModel;
        entryNode.setPosition(entryX, entryNode.getY());
    });

    // Position workflow nodes near the entry points that trigger them or send them data,
    // stacking downwards to avoid overlaps
    const workflowsWithDesiredY = workflowNodes.map((node) => {
        const workflowNode = node as EntryNodeModel;
        const workflow = workflowNode.node as CDWorkflow;
        const senderIds = new Set([...(workflow.attachedServices ?? []), ...(workflow.attachedFunctions ?? [])]);
        workflow.events?.forEach((event) => {
            event.attachedServices?.forEach((uuid) => senderIds.add(uuid));
            event.attachedFunctions?.forEach((uuid) => senderIds.add(uuid));
        });
        const senderNodes = entryNodes.filter((n) => senderIds.has(n.getID()));
        const desiredY =
            senderNodes.length > 0
                ? senderNodes.reduce((sum, n) => sum + n.getY(), 0) / senderNodes.length
                : node.getY();
        return { node: workflowNode, desiredY };
    });
    workflowsWithDesiredY.sort((a, b) => a.desiredY - b.desiredY);
    let workflowBottom = -Infinity;
    workflowsWithDesiredY.forEach(({ node, desiredY }) => {
        const y = Math.max(desiredY, workflowBottom + NODE_GAP_Y / 2);
        node.setPosition(workflowX, y);
        workflowBottom = y + (node.height || ENTRY_NODE_HEIGHT);
    });

    // Position connection nodes
    connectionNodes.forEach((node, index) => {
        const connectionNode = node as ConnectionNodeModel;
        connectionNode.setPosition(connectionX, node.getY());
    });

    // Position unconnected listeners below all other nodes
    if (unconnectedListeners.length > 0) {
        // Find the maximum Y position among all nodes
        const allNodes = [...connectedListeners, ...entryNodes, ...workflowNodes, ...connectionNodes];
        let maxY = 100; // Default starting position if no other nodes

        if (allNodes.length > 0) {
            maxY = Math.max(...allNodes.map(node => {
                const nodeHeight = node.height || LISTENER_NODE_HEIGHT;
                return node.getY() + nodeHeight;
            }));
        }

        // Position unconnected listeners below, with spacing
        unconnectedListeners.forEach((listenerNode, index) => {
            const yPosition = maxY + NODE_GAP_Y/2 + (index * (LISTENER_NODE_HEIGHT + NODE_GAP_Y/2));
            listenerNode.setPosition(listenerX, yPosition);
        });
    }

    engine.repaintCanvas();
}

export function registerListeners(engine: DiagramEngine) {
    engine.getModel().registerListener({
        offsetUpdated: (event: any) => {
            saveDiagramZoomAndPosition(engine.getModel());
        },
    });
}

export function genDagreEngine() {
    return new DagreEngine({
        graph: {
            rankdir: "LR",
            nodesep: 120,
            ranksep: 400,
            marginx: 100,
            marginy: 100,
            // ranker: "longest-path",
        },
    });
}

export function sortItems<T extends { sortText?: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        if (!a.sortText && !b.sortText) return 0;
        if (!a.sortText) return 1;
        if (!b.sortText) return -1;

        // Split the sortText into filename and number parts
        const [aFile, aNum] = a.sortText.split(".bal");
        const [bFile, bNum] = b.sortText.split(".bal");

        // First compare filenames
        if (aFile !== bFile) {
            return aFile.localeCompare(bFile);
        }

        // If filenames are same, compare numbers
        const aNumber = parseInt(aNum || "0", 10);
        const bNumber = parseInt(bNum || "0", 10);
        return aNumber - bNumber;
    });
}

// create link between ports
export function createPortsLink(sourcePort: NodePortModel, targetPort: NodePortModel, options?: NodeLinkModelOptions) {
    const link = new NodeLinkModel(options);
    link.setSourcePort(sourcePort);
    link.setTargetPort(targetPort);
    sourcePort.addLink(link);
    return link;
}

// create link between nodes
export function createNodesLink(sourceNode: NodeModel, targetNode: NodeModel, options?: NodeLinkModelOptions) {
    const sourcePort = sourceNode.getOutPort();
    const targetPort = targetNode.getInPort();
    if (!sourcePort || !targetPort) {
        return null;
    }
    const link = createPortsLink(sourcePort, targetPort, options);
    link.setSourceNode(sourceNode);
    link.setTargetNode(targetNode);
    return link;
}

// create link between port and node
export function createPortNodeLink(port: NodePortModel, node: NodeModel, options?: NodeLinkModelOptions) {
    const targetPort = node.getInPort();
    if (!targetPort) {
        return null;
    }
    const link = createPortsLink(port, targetPort, options);
    link.setSourceNode(node);
    link.setTargetNode(node);
    return link;
}

// save diagram zoom level and position to local storage
export const saveDiagramZoomAndPosition = (model: DiagramModel) => {
    const zoomLevel = model.getZoomLevel();
    const offsetX = model.getOffsetX();
    const offsetY = model.getOffsetY();

    // Store them in localStorage
    localStorage.setItem("diagram-zoom-level", JSON.stringify(zoomLevel));
    localStorage.setItem("diagram-offset-x", JSON.stringify(offsetX));
    localStorage.setItem("diagram-offset-y", JSON.stringify(offsetY));
};

// load diagram zoom level and position from local storage
export const loadDiagramZoomAndPosition = (engine: DiagramEngine) => {
    const zoomLevel = JSON.parse(localStorage.getItem("diagram-zoom-level") || "100");
    const offsetX = JSON.parse(localStorage.getItem("diagram-offset-x") || "0");
    const offsetY = JSON.parse(localStorage.getItem("diagram-offset-y") || "0");

    engine.getModel().setZoomLevel(zoomLevel);
    engine.getModel().setOffset(offsetX, offsetY);
};

// check local storage has zoom level and position
export const hasDiagramZoomAndPosition = (file: string) => {
    return localStorage.getItem("diagram-file-path") === file;
};

export const resetDiagramZoomAndPosition = (file?: string) => {
    if (file) {
        localStorage.setItem("diagram-file-path", file);
    }
    localStorage.setItem("diagram-zoom-level", "100");
    localStorage.setItem("diagram-offset-x", "0");
    localStorage.setItem("diagram-offset-y", "0");
};

export const centerDiagram = (engine: DiagramEngine) => {
    if (engine.getCanvas()?.getBoundingClientRect) {
        // zoom to fit nodes and center diagram
        engine.zoomToFitNodes({ margin: 40, maxZoom: 1 });
    }
};

export const getModelId = (nodeId: string) => {
    return nodeId.split("-").pop();
};

// calculate entry node height based on number of functions
export const calculateEntryNodeHeight = (numFunctions: number, isExpanded: boolean) => {
    const PADDING = 8;
    const BASE_HEIGHT = 64 + PADDING;
    const FUNCTION_HEIGHT = 40 + PADDING;
    const VIEW_ALL_BUTTON_HEIGHT = 40;

    if (isExpanded) {
        return BASE_HEIGHT + numFunctions * FUNCTION_HEIGHT + PADDING + VIEW_ALL_BUTTON_HEIGHT;
    }

    if (numFunctions <= 2) {
        return BASE_HEIGHT + numFunctions * FUNCTION_HEIGHT + PADDING;
    }

    return BASE_HEIGHT + 2 * FUNCTION_HEIGHT + PADDING + VIEW_ALL_BUTTON_HEIGHT;
};

export const calculateGraphQLNodeHeight = (
    visible: GQLFuncListType,
    hidden: GQLFuncListType,
    graphQLGroupOpen: GQLState
) => {
    const PADDING = 8;
    const BASE_HEIGHT = 64 + 2 * PADDING;
    const FUNCTION_HEIGHT = 40 + PADDING;
    const SHOW_BUTTON_HEIGHT = 40;
    const HEADER_HEIGHT = 45 + 2 * PADDING;

    let totalHeight = BASE_HEIGHT;

    Object.keys(visible).forEach((group) => {
        const visibleCount = visible[group].length;
        const hiddenCount = hidden[group].length;
        const hasShowML = visibleCount > PREVIEW_COUNT || hiddenCount > 0;
        const isCollapsed = !graphQLGroupOpen[group];
        const hasSection = visibleCount > 0 || hiddenCount > 0;
        const hasFunction = visibleCount > 0;

        let sectionHeight = 0;

        if (hasSection) {
            if (isCollapsed) {
                sectionHeight = HEADER_HEIGHT;
            } else {
                if (hasFunction) {
                    sectionHeight += HEADER_HEIGHT;
                    sectionHeight += visibleCount * FUNCTION_HEIGHT;
                }
                if (hasShowML) {
                    sectionHeight += SHOW_BUTTON_HEIGHT;
                }
            }
        }

        totalHeight += sectionHeight;
    });

    return totalHeight;
};

export const getEntryNodeFunctionPortName = (func: CDFunction | CDResourceFunction) => {
    if ((func as CDResourceFunction).accessor) {
        return (func as CDResourceFunction).accessor + "-" + (func as CDResourceFunction).path;
    }
    return (func as CDFunction).name;
};

export const getWorkflowEventPortNameByEventName = (eventName: string) => {
    return "event-" + eventName;
};

export const getWorkflowEventPortName = (event: CDWorkflowEvent) => {
    return getWorkflowEventPortNameByEventName(event.name);
};

// calculate workflow node height based on the number of event and human task rows
export const calculateWorkflowNodeHeight = (numRows: number) => {
    const PADDING = 8;
    const BASE_HEIGHT = 64 + PADDING;
    const ROW_HEIGHT = 40 + PADDING;
    return BASE_HEIGHT + numRows * ROW_HEIGHT + (numRows > 0 ? PADDING : 0);
};
