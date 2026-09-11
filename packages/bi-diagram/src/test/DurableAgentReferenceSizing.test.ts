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
    AGENT_BOX_BOTTOM_AFFORDANCE_GAP,
    AGENT_CALL_REFERENCE_HEIGHT,
    AGENT_NODE_TOOL_GAP,
    AGENT_NODE_TOOL_SECTION_GAP,
    LABEL_HEIGHT,
    LABEL_WIDTH,
    NODE_GAP_X,
    NODE_HEIGHT,
    NODE_WIDTH,
} from "../resources/constants";
import { SizingVisitor } from "../visitors/SizingVisitor";

const createAgentBoxNode = () => ({
    id: "durable-agent-run-node",
    codedata: { node: "DURABLE_AGENT_RUN" },
    viewState: { x: 0, y: 0, lw: 0, rw: 0, h: 0, clw: 0, crw: 0, ch: 0 },
    metadata: { label: "Run Agent", description: "", data: { agentBox: true } },
    branches: [],
});

const createFlow = (node: ReturnType<typeof createAgentBoxNode>) => ({ nodes: [node] } as any);

const halfNodeWidth = NODE_WIDTH / 2;
const sideColumnWidth = NODE_GAP_X + NODE_HEIGHT + LABEL_HEIGHT + LABEL_WIDTH;

describe("SizingVisitor: durable-agent reference sizing", () => {
    it("sizes the full agent box (with side circle columns) when not a run() reference", () => {
        const node = createAgentBoxNode();
        traverseFlow(createFlow(node), new SizingVisitor(false));

        expect(node.viewState.lw).toBe(halfNodeWidth);
        expect(node.viewState.rw).toBe(halfNodeWidth + sideColumnWidth);
        expect(node.viewState.ch).toBe(NODE_HEIGHT + AGENT_NODE_TOOL_SECTION_GAP + AGENT_NODE_TOOL_GAP * 2 + AGENT_BOX_BOTTOM_AFFORDANCE_GAP);
    });

    it("collapses to the simple reference row (no side columns) for a run() call site", () => {
        const node = createAgentBoxNode();
        traverseFlow(createFlow(node), new SizingVisitor(true));

        expect(node.viewState.lw).toBe(halfNodeWidth);
        expect(node.viewState.rw).toBe(halfNodeWidth);
        expect(node.viewState.ch).toBe(NODE_HEIGHT + AGENT_CALL_REFERENCE_HEIGHT);
    });
});
