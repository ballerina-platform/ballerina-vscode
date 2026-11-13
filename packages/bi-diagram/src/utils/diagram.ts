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
import { flushSync } from "react-dom";
import createEngine, { DiagramEngine, DiagramModel, PathFindingLinkFactory, PortModel } from "@projectstorm/react-diagrams";
import { BaseNodeFactory } from "../components/nodes/BaseNode";
import { NodePortFactory, NodePortModel } from "../components/NodePort";
import { NodeLinkFactory, NodeLinkModel, NodeLinkModelOptions } from "../components/NodeLink";
import { EmptyNodeFactory } from "../components/nodes/EmptyNode";
import { OverlayLayerFactory } from "../components/OverlayLayer";
import { FlowNode, FlowNodeDiffState, LinkableNodeModel, NodeModel } from "./types";
import { VerticalScrollCanvasAction } from "../actions/VerticalScrollCanvasAction";
import { IfNodeFactory } from "../components/nodes/IfNode/IfNodeFactory";
import { StartNodeFactory } from "../components/nodes/StartNode/StartNodeFactory";
import { ApiCallNodeFactory } from "../components/nodes/ApiCallNode";
import { DraftNodeFactory } from "../components/nodes/DraftNode/DraftNodeFactory";
import { ButtonNodeFactory } from "../components/nodes/ButtonNode";
import { NodeTypes } from "../resources/constants";
import { CommentNodeFactory } from "../components/nodes/CommentNode";
import { WhileNodeFactory } from "../components/nodes/WhileNode";
import { EndNodeFactory } from "../components/nodes/EndNode";
import { ErrorNodeFactory } from "../components/nodes/ErrorNode";
import { AgentCallNodeFactory } from "../components/nodes/AgentCallNode/AgentCallNodeFactory";
import { DurableAgentRunNodeFactory } from "../components/nodes/DurableAgentRunNode/DurableAgentRunNodeFactory";
import { EvalNodeFactory } from "../components/nodes/EvalNode/EvalNodeFactory";
import { AgentNodeFactory } from "../components/nodes/AgentNode/AgentNodeFactory";
import { PromptNodeFactory } from "../components/nodes/PromptNode/PromptNodeFactory";
import { CallActivityNodeFactory } from "../components/nodes/CallActivityNode";
import { SendDataNodeFactory } from "../components/nodes/SendDataNode";
import { WaitDataNodeFactory } from "../components/nodes/WaitDataNode";

type CanvasIndex = { canvas: HTMLElement; nodes: Map<string, HTMLElement>; ports: Map<string, HTMLElement> };
let canvasIndex: CanvasIndex | undefined;

// Every port is measured in the same task after a render; a canvas-wide query per port made opening a large flow quadratic.
function indexCanvas(canvas: HTMLElement): CanvasIndex {
    if (canvasIndex?.canvas !== canvas) {
        const nodes = new Map<string, HTMLElement>();
        const ports = new Map<string, HTMLElement>();
        canvas.querySelectorAll<HTMLElement>(".node[data-nodeid], .port[data-nodeid]").forEach((element) => {
            const id = element.dataset.nodeid;
            if (element.classList.contains("node") && !nodes.has(id)) {
                nodes.set(id, element);
            }
            const key = `${id}\u0000${element.dataset.name}`;
            if (element.classList.contains("port") && !ports.has(key)) {
                ports.set(key, element);
            }
        });
        canvasIndex = { canvas, nodes, ports };
        setTimeout(() => (canvasIndex = undefined));
    }
    return canvasIndex;
}

// An element the index missed or that left the canvas since it was built is looked up directly.
function canvasElement(canvas: HTMLElement, cached: HTMLElement | undefined, selector: string): HTMLElement | null {
    return cached?.isConnected && canvas.contains(cached) ? cached : canvas.querySelector<HTMLElement>(selector);
}

// The canvas eases pan and zoom with a CSS transition; a port read against its own node, which shares that transform, stays exact.
export function portOffset(engine: DiagramEngine, port: PortModel): { x: number; y: number; width: number; height: number } | undefined {
    const canvas = engine.getCanvas();
    const node = port.getParent();
    const index = canvas && indexCanvas(canvas);
    const nodeElement = canvas && canvasElement(canvas, index.nodes.get(node.getID()),
        `.node[data-nodeid="${CSS.escape(node.getID())}"]`);
    const portElement = canvas && canvasElement(canvas, index.ports.get(`${node.getID()}\u0000${port.getName()}`),
        `.port[data-nodeid="${CSS.escape(node.getID())}"][data-name="${CSS.escape(port.getName())}"]`);
    if (!nodeElement || !portElement || !nodeElement.offsetWidth) {
        return undefined;
    }
    const nodeRect = nodeElement.getBoundingClientRect();
    const portRect = portElement.getBoundingClientRect();
    const scale = nodeRect.width / nodeElement.offsetWidth;
    return {
        x: (portRect.left - nodeRect.left) / scale,
        y: (portRect.top - nodeRect.top) / scale,
        width: portRect.width / scale,
        height: portRect.height / scale,
    };
}

export function generateEngine(): DiagramEngine {
    const engine = createEngine({
        registerDefaultDeleteItemsAction: false,
        registerDefaultZoomCanvasAction: false,
        registerDefaultPanAndZoomCanvasAction: false,
    });

    engine
        .getLinkFactories()
        .getFactory<PathFindingLinkFactory>(PathFindingLinkFactory.NAME)
        .listener.deregister();

    const canvasCoords = engine.getPortCoords.bind(engine);
    engine.getPortCoords = (port: PortModel, element?: HTMLDivElement) => {
        const coords = canvasCoords(port, element);
        const offset = portOffset(engine, port);
        const node = port.getParent();
        // Built from the engine's own geometry class: points from another copy of the package fail its type checks.
        const Rect = coords.constructor as unknown as {
            fromPositionAndSize: (x: number, y: number, width: number, height: number) => typeof coords;
        };
        return offset ? Rect.fromPositionAndSize(node.getX() + offset.x, node.getY() + offset.y, offset.width, offset.height) : coords;
    };

    engine.getPortFactories().registerFactory(new NodePortFactory());
    engine.getLinkFactories().registerFactory(new NodeLinkFactory());

    engine.getNodeFactories().registerFactory(new BaseNodeFactory());
    engine.getNodeFactories().registerFactory(new PromptNodeFactory());
    engine.getNodeFactories().registerFactory(new EmptyNodeFactory());
    engine.getNodeFactories().registerFactory(new IfNodeFactory());
    engine.getNodeFactories().registerFactory(new WhileNodeFactory());
    engine.getNodeFactories().registerFactory(new StartNodeFactory());
    engine.getNodeFactories().registerFactory(new ApiCallNodeFactory());
    engine.getNodeFactories().registerFactory(new DraftNodeFactory());
    engine.getNodeFactories().registerFactory(new CommentNodeFactory());
    engine.getNodeFactories().registerFactory(new ButtonNodeFactory());
    engine.getNodeFactories().registerFactory(new EndNodeFactory());
    engine.getNodeFactories().registerFactory(new ErrorNodeFactory());
    engine.getNodeFactories().registerFactory(new AgentCallNodeFactory());
    engine.getNodeFactories().registerFactory(new DurableAgentRunNodeFactory());
    engine.getNodeFactories().registerFactory(new CallActivityNodeFactory());
    engine.getNodeFactories().registerFactory(new SendDataNodeFactory());
    engine.getNodeFactories().registerFactory(new WaitDataNodeFactory());
    engine.getNodeFactories().registerFactory(new EvalNodeFactory());
    engine.getNodeFactories().registerFactory(new AgentNodeFactory(NodeTypes.TYPED_AGENT_NODE));
    engine.getNodeFactories().registerFactory(new AgentNodeFactory());

    engine.getLayerFactories().registerFactory(new OverlayLayerFactory());

    engine.getActionEventBus().registerAction(new VerticalScrollCanvasAction());
    // A plain drag on the canvas draws a selection; it pans only while a pan gesture is held, one step per frame.
    const diagramState = engine.getStateMachine().getCurrentState() as unknown as {
        dragCanvas?: { fireMouseMoved: (event: unknown) => void };
        childStates?: unknown[];
    };
    // Selection is drawn and kept by the diagram itself; the built-in modifier-key selection box would compete with it.
    if (diagramState?.childStates) {
        diagramState.childStates = [];
    }
    const dragCanvas = diagramState?.dragCanvas;
    if (dragCanvas) {
        const move = dragCanvas.fireMouseMoved.bind(dragCanvas);
        dragCanvas.fireMouseMoved = (event) => {
            if (canvasGesture(engine).panning) {
                flushSync(() => move(event));
            }
        };
    }
    return engine;
}

export const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

// Ctrl+click is the context menu on macOS, so the command key differs by platform.
export function isCommandKey(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
    return isMac ? event.metaKey : event.ctrlKey;
}

export interface CanvasGesture {
    panKey: boolean; // Space, or the platform's command key, is held
    panning: boolean; // the current drag pans the canvas
}

const gestures = new WeakMap<object, CanvasGesture>();

export function canvasGesture(engine: object): CanvasGesture {
    let gesture = gestures.get(engine);
    if (!gesture) {
        gesture = { panKey: false, panning: false };
        gestures.set(engine, gesture);
    }
    return gesture;
}

// How much of the flow, in screen pixels, panning must leave in view.
const PAN_KEEP_VISIBLE = 500;

// The offset nearest to the requested one that still leaves part of the flow on screen.
export function clampOffset(engine: DiagramEngine): { x: number; y: number } | undefined {
    const model = engine.getModel();
    const canvas = engine.getCanvas();
    // A node not laid out yet has no size; a NaN offset never equals itself, so setting it would re-fire forever.
    const boxes = (model?.getNodes() ?? [])
        .map((node) => ({ x: node.getX(), y: node.getY(), right: node.getX() + node.width, bottom: node.getY() + node.height }))
        .filter((box) => [box.x, box.y, box.right, box.bottom].every(Number.isFinite));
    if (!canvas || boxes.length === 0) {
        return undefined;
    }
    const zoom = model.getZoomLevel() / 100;
    const minX = Math.min(...boxes.map((box) => box.x)) * zoom;
    const maxX = Math.max(...boxes.map((box) => box.right)) * zoom;
    const minY = Math.min(...boxes.map((box) => box.y)) * zoom;
    const maxY = Math.max(...boxes.map((box) => box.bottom)) * zoom;
    // The canvas element can run past the window, so only the part on screen counts.
    const rect = canvas.getBoundingClientRect();
    const win = canvas.ownerDocument.defaultView;
    const left = Math.max(0, -rect.left);
    const top = Math.max(0, -rect.top);
    const right = Math.min(rect.right, win?.innerWidth ?? rect.right) - rect.left;
    const bottom = Math.min(rect.bottom, win?.innerHeight ?? rect.bottom) - rect.top;
    const clamp = (offset: number, start: number, end: number, low: number, high: number) => {
        const keep = Math.min(PAN_KEEP_VISIBLE, end - start, high - low);
        return Math.min(Math.max(offset, low + keep - end), high - keep - start);
    };
    return { x: clamp(model.getOffsetX(), minX, maxX, left, right), y: clamp(model.getOffsetY(), minY, maxY, top, bottom) };
}

export function registerListeners(engine: DiagramEngine) {
    const keepInView = () => {
        const model = engine.getModel();
        const clamped = clampOffset(engine);
        if (clamped && (clamped.x !== model.getOffsetX() || clamped.y !== model.getOffsetY())) {
            model.setOffset(clamped.x, clamped.y);
        }
    };
    engine.getModel().registerListener({
        offsetUpdated: (event: any) => {
            keepInView();
            saveDiagramZoomAndPosition(engine.getModel());
        },
        zoomUpdated: (event: any) => {
            saveDiagramZoomAndPosition(engine.getModel());
        },
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
    if (sourceNode.getType() === NodeTypes.BUTTON_NODE || targetNode.getType() === NodeTypes.BUTTON_NODE) {
        console.log(">>> Button node cannot be connected to another node");
        return;
    }
    const source = sourceNode as LinkableNodeModel;
    const target = targetNode as LinkableNodeModel;

    // Links attached to a review-diff node inherit its removed/added styling
    const diffState = getNodeDiffState(targetNode) ?? getNodeDiffState(sourceNode);
    if (diffState && !options?.diffState) {
        options = { ...options, diffState };
    }

    const sourcePort = source.getOutPort();
    const targetPort = target.getInPort();
    const link = createPortsLink(sourcePort, targetPort, options);
    link.setSourceNode(sourceNode);
    link.setTargetNode(targetNode);
    return link;
}

// get the diff state of the flow node wrapped by a diagram node model, if any.
// Modified nodes sit inline in the main flow, so their links stay unstyled.
function getNodeDiffState(nodeModel: NodeModel): FlowNodeDiffState | undefined {
    const flowNode = (nodeModel as { node?: FlowNode }).node;
    const diffState = flowNode?.diffState;
    return diffState === "added" || diffState === "removed" ? diffState : undefined;
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
export const loadDiagramZoomAndPosition = (engine: DiagramEngine, node?: NodeModel) => {
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
    const container = document.getElementById("bi-diagram-canvas");
    const containerWidth = container ? container.offsetWidth : window.innerWidth;
    const center = containerWidth / 2;

    if (file) {
        localStorage.setItem("diagram-file-path", file);
    }
    localStorage.setItem("diagram-zoom-level", "100");
    localStorage.setItem("diagram-offset-x", center.toString());
    localStorage.setItem("diagram-offset-y", "0");
};

export const clearDiagramZoomAndPosition = () => {
    localStorage.removeItem("diagram-file-path");
    localStorage.removeItem("diagram-zoom-level");
    localStorage.removeItem("diagram-offset-x");
    localStorage.removeItem("diagram-offset-y");
};
