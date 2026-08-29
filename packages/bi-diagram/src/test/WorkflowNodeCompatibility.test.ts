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
    HUMAN_TASK_ROLES_LABEL_WIDTH,
    LABEL_HEIGHT,
    NODE_GAP_X,
    NODE_HEIGHT,
    NODE_WIDTH,
    NodeTypes,
} from "../resources/constants";
import { getHumanTaskUserRoles } from "../utils/node";
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
            createFlowNode("human-task", "HUMAN_TASK"),
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
        // A human task waits on a person, which is still waiting on the outside world, so it is
        // drawn as a wait.
        expect(nodeTypeById.get("human-task")).toBe(NodeTypes.WAIT_DATA_NODE);
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
        const flow = createFlow([createFlowNode("wait-data", "WAIT_DATA"), createFlowNode("human-task", "HUMAN_TASK")]);

        const visitor = new SizingVisitor();
        traverseFlow(flow, visitor);

        const [waitDataNode, humanTaskNode] = flow.nodes as TestFlowNode[];
        // A wait is the mirror of a send: the same body, with the source box and its arrow on the
        // left rather than the right.
        const halfNodeWidth = NODE_WIDTH / 2;

        const expectedLeftWidth = halfNodeWidth + NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT;

        expect(waitDataNode.viewState.lw).toBe(expectedLeftWidth);
        expect(waitDataNode.viewState.rw).toBe(halfNodeWidth);
        expect(waitDataNode.viewState.ch).toBe(NODE_HEIGHT + LABEL_HEIGHT);
        expect(waitDataNode.viewState.clw).toBe(expectedLeftWidth);
        expect(waitDataNode.viewState.crw).toBe(halfNodeWidth);

        // The human task takes the same measurements, or its widget would paint a source box and an
        // arrow into space the layout never reserved.
        expect(humanTaskNode.viewState).toEqual(waitDataNode.viewState);
    });

    // The roles are drawn in the strip before the person icon, so the strip has to be part of the
    // node's left width — otherwise the widget paints them outside the node's bounds.
    it("reserves the roles strip on a human task that names its roles", () => {
        const withRoles = createFlowNode("human-task-roles", "HUMAN_TASK");
        withRoles.properties = { userRoles: { value: '["FINANCE_APPROVER"]' } };
        const flow = createFlow([createFlowNode("human-task", "HUMAN_TASK"), withRoles]);

        const visitor = new SizingVisitor();
        traverseFlow(flow, visitor);

        const [plainHumanTask, humanTaskWithRoles] = flow.nodes as TestFlowNode[];
        expect(humanTaskWithRoles.viewState.lw).toBe(plainHumanTask.viewState.lw + HUMAN_TASK_ROLES_LABEL_WIDTH);
        // Only the left side grows: the body stays where it is on the node's centre line.
        expect(humanTaskWithRoles.viewState.rw).toBe(plainHumanTask.viewState.rw);
        expect(humanTaskWithRoles.viewState.ch).toBe(plainHumanTask.viewState.ch);
    });

    // The roles are drawn under the person the task waits on, so they may only be read off the
    // statement when it names them outright — anything resolved at run time would be a guess.
    describe("human task user roles", () => {
        const nodeWithUserRoles = (value?: unknown) =>
            ({ properties: value === undefined ? {} : { userRoles: { value } } } as any);

        it("reads a list of string literals", () => {
            expect(getHumanTaskUserRoles(nodeWithUserRoles('["FINANCE_APPROVER", "MANAGER"]'))).toEqual([
                "FINANCE_APPROVER",
                "MANAGER",
            ]);
        });

        it("reads a single string literal", () => {
            expect(getHumanTaskUserRoles(nodeWithUserRoles('"approver"'))).toEqual(["approver"]);
        });

        it("keeps a comma that belongs to a role name", () => {
            expect(getHumanTaskUserRoles(nodeWithUserRoles('["finance,approver", "MANAGER"]'))).toEqual([
                "finance,approver",
                "MANAGER",
            ]);
        });

        it("shows nothing for a value only known at run time", () => {
            expect(getHumanTaskUserRoles(nodeWithUserRoles("roles"))).toEqual([]);
            expect(getHumanTaskUserRoles(nodeWithUserRoles('[roles[0], "MANAGER"]'))).toEqual([]);
            expect(getHumanTaskUserRoles(nodeWithUserRoles("[]"))).toEqual([]);
            expect(getHumanTaskUserRoles(nodeWithUserRoles())).toEqual([]);
        });
    });
});
