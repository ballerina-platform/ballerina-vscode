/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { traverseFlow } from "@wso2/ballerina-core";

import {
    LABEL_HEIGHT,
    NODE_GAP_X,
    NODE_HEIGHT,
    NODE_WIDTH,
    NodeTypes,
} from "../resources/constants";
import { NodeFactoryVisitor } from "../visitors/NodeFactoryVisitor";
import { SizingVisitor } from "../visitors/SizingVisitor";

type TestFlowNode = {
    id: string;
    codedata: { node: string };
    viewState: {
        x: number;
        y: number;
        lw: number;
        rw: number;
        h: number;
        clw: number;
        crw: number;
        ch: number;
    };
    properties: Record<string, unknown>;
    branches: unknown[];
};

const createFlowNode = (id: string, nodeKind: string): TestFlowNode => ({
    id,
    codedata: { node: nodeKind },
    viewState: {
        x: 0,
        y: 0,
        lw: 0,
        rw: 0,
        h: 0,
        clw: 0,
        crw: 0,
        ch: 0,
    },
    properties: {},
    branches: [],
});

const createFlow = (nodes: TestFlowNode[]) => ({ nodes } as any);

describe("Workflow Nodes", () => {
    it("maps workflow node kinds to workflow node types", () => {
        const flow = createFlow([
            createFlowNode("workflow-run", "WORKFLOW_RUN"),
            createFlowNode("activity-call", "ACTIVITY_CALL"),
            createFlowNode("send-data", "SEND_DATA"),
            createFlowNode("wait-data", "WAIT_DATA"),
        ]);

        const visitor = new NodeFactoryVisitor();
        traverseFlow(flow, visitor);
        const nodeTypeById = new Map(visitor.getNodes().map((node) => [node.getID(), node.getType()]));

        // Starting a workflow is drawn as an action wherever it is started from, so the
        // outside-world start shares the child-workflow start's shape.
        expect(nodeTypeById.get("workflow-run")).toBe(NodeTypes.API_CALL_NODE);
        expect(nodeTypeById.get("activity-call")).toBe(NodeTypes.CALL_ACTIVITY_NODE);
        expect(nodeTypeById.get("send-data")).toBe(NodeTypes.SEND_DATA_NODE);
        expect(nodeTypeById.get("wait-data")).toBe(NodeTypes.WAIT_DATA_NODE);
    });

    // A node's declared widths are its own bounds, so the body a widget paints has to land on the
    // node's centre line. Getting this wrong bends the links sideways, and it has been got wrong
    // in both directions — by declaring the body's half-width while the container reached further
    // out, and by deriving the space before the body from a difference that had become zero.
    it("keeps a side-arrow node's body on its centre line", () => {
        const flow = createFlow([
            createFlowNode("send-data", "SEND_DATA"),
            createFlowNode("wait-data", "WAIT_DATA"),
        ]);

        const visitor = new SizingVisitor();
        traverseFlow(flow, visitor);

        const [sendDataNode, waitDataNode] = flow.nodes as TestFlowNode[];
        const halfNodeWidth = NODE_WIDTH / 2;
        const sideSpan = NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT;

        // A send reserves its side for the target: body half-width on the near side, the arrow and
        // the target box on the far side.
        expect(sendDataNode.viewState.lw).toBe(halfNodeWidth);
        expect(sendDataNode.viewState.rw).toBe(halfNodeWidth + sideSpan);

        // A wait is its mirror, so the reserved side swaps and the spans stay equal.
        expect(waitDataNode.viewState.rw).toBe(halfNodeWidth);
        expect(waitDataNode.viewState.lw).toBe(halfNodeWidth + sideSpan);
        expect(waitDataNode.viewState.lw - halfNodeWidth).toBe(sendDataNode.viewState.rw - halfNodeWidth);

        // Both bodies are the same height, so neither reads as a different kind of thing.
        expect(waitDataNode.viewState.ch).toBe(sendDataNode.viewState.ch);
    });

    it("applies sizing for wait-data node kinds", () => {
        const flow = createFlow([createFlowNode("wait-data", "WAIT_DATA")]);

        const visitor = new SizingVisitor();
        traverseFlow(flow, visitor);

        const [waitDataNode] = flow.nodes as TestFlowNode[];
        // A wait is the mirror of a send: the same body, with the source box and its arrow on the
        // left rather than the right.
        const halfNodeWidth = NODE_WIDTH / 2;

        const expectedLeftWidth = halfNodeWidth + NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT;

        expect(waitDataNode.viewState.lw).toBe(expectedLeftWidth);
        expect(waitDataNode.viewState.rw).toBe(halfNodeWidth);
        expect(waitDataNode.viewState.ch).toBe(NODE_HEIGHT + LABEL_HEIGHT);
        expect(waitDataNode.viewState.clw).toBe(expectedLeftWidth);
        expect(waitDataNode.viewState.crw).toBe(halfNodeWidth);

    });
});
