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
import { PromptNodeFactory } from "../components/nodes/PromptNode/PromptNodeFactory";
import { CallActivityNodeFactory } from "../components/nodes/CallActivityNode";
import { SendDataNodeFactory } from "../components/nodes/SendDataNode";
import { WaitDataNodeFactory } from "../components/nodes/WaitDataNode";
import { WorkflowRunNodeFactory } from "../components/nodes/WorkflowRunNode";

export function generateEngine(): DiagramEngine {
    const engine = createEngine({
        registerDefaultDeleteItemsAction: false,
        registerDefaultZoomCanvasAction: false,
        registerDefaultPanAndZoomCanvasAction: false,
    });

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
    engine.getNodeFactories().registerFactory(new WorkflowRunNodeFactory());
    engine.getNodeFactories().registerFactory(new CallActivityNodeFactory());
    engine.getNodeFactories().registerFactory(new SendDataNodeFactory());
    engine.getNodeFactories().registerFactory(new WaitDataNodeFactory());

    engine.getLayerFactories().registerFactory(new OverlayLayerFactory());

    engine.getActionEventBus().registerAction(new VerticalScrollCanvasAction());
    return engine;
}

export function registerListeners(engine: DiagramEngine) {
    engine.getModel().registerListener({
        offsetUpdated: (event: any) => {
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
