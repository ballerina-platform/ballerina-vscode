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

import { LABEL_HEIGHT, NODE_BORDER_WIDTH, NODE_HEIGHT } from "../resources/constants";
import { SizingVisitor } from "../visitors/SizingVisitor";

const baseHeight = NODE_HEIGHT + NODE_BORDER_WIDTH * 2;

// BaseNodeWidget renders a log node's description from `properties.msg.value` (not
// variable/expression/type), so the sizing estimate has to read the same field or it
// under-reserves height for a message that wraps to two lines.
const createLogNode = (msg: string) => ({
    id: "log-node",
    codedata: { node: "EXPRESSION", org: "ballerina", module: "log" },
    viewState: { x: 0, y: 0, lw: 0, rw: 0, h: 0, clw: 0, crw: 0, ch: 0 },
    properties: { msg: { value: msg } },
    branches: [],
});

const createFlow = (nodes: ReturnType<typeof createLogNode>[]) => ({ nodes } as any);

describe("SizingVisitor: log node description sizing", () => {
    it("reserves the wrap-height allowance when the log message wraps to a second line", () => {
        const flow = createFlow([createLogNode("Order processed successfully")]);
        traverseFlow(flow, new SizingVisitor());

        expect((flow.nodes[0] as any).viewState.h).toBe(baseHeight + LABEL_HEIGHT);
    });

    it("does not reserve the allowance for a short log message", () => {
        const flow = createFlow([createLogNode("done")]);
        traverseFlow(flow, new SizingVisitor());

        expect((flow.nodes[0] as any).viewState.h).toBe(baseHeight);
    });
});

// ApiCallNodeWidget renders a remote/resource action call's description from
// `properties.variable.value`; the sizing estimate used to reserve the wrap-height allowance for
// any non-empty variable, stretching the links into a short-variable node (e.g. `ok`) past
// NODE_GAP_Y exactly like the base-node case above.
const createRemoteActionCallNode = (variable: string) => ({
    id: "remote-call-node",
    codedata: { node: "REMOTE_ACTION_CALL" },
    viewState: { x: 0, y: 0, lw: 0, rw: 0, h: 0, clw: 0, crw: 0, ch: 0 },
    properties: { variable: { value: variable } },
    branches: [],
});

describe("SizingVisitor: API call node description sizing", () => {
    it("reserves the wrap-height allowance when the variable name wraps to a second line", () => {
        const flow = createFlow([createRemoteActionCallNode("orderConfirmationResponse") as any]);
        traverseFlow(flow, new SizingVisitor());

        expect((flow.nodes[0] as any).viewState.ch).toBe(NODE_HEIGHT + LABEL_HEIGHT);
    });

    it("does not reserve the allowance for a short variable name", () => {
        const flow = createFlow([createRemoteActionCallNode("ok") as any]);
        traverseFlow(flow, new SizingVisitor());

        expect((flow.nodes[0] as any).viewState.ch).toBe(NODE_HEIGHT);
    });
});
