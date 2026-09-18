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

// Two nodes carry the agentBox marker: the real `agent.run(...)` statement, and the synthetic copy
// the agent-only view is built from. Only the synthetic one is marked agentDeclarationCanvas, and
// the link decision turns on that — a statement that opened a block used to link nothing at all
// (wso2/product-integrator#2472).

import { NodeFactoryVisitor } from "../visitors/NodeFactoryVisitor";
import { FlowNode, NodeKind } from "../utils/types";

function makeNode(id: string, kind: NodeKind, data?: Record<string, unknown>): FlowNode {
    return {
        id,
        metadata: { label: kind, description: id, ...(data ? { data } : {}) },
        codedata: { node: kind, sourceCode: id },
        branches: [],
        returning: false,
        viewState: { x: 0, y: 0, lw: 0, rw: 0, h: 0, clw: 0, crw: 0, ch: 0 },
    } as FlowNode;
}

// What the analysis emits for `agent.run(...)` written in a workflow body.
const statementBox = (id: string) => makeNode(id, "DURABLE_AGENT_RUN", { agentBox: true, agentName: "claimAgent" });
// What it emits for the agent's own canvas, which is the declaration rendered on its own.
const syntheticBox = (id: string) =>
    makeNode(id, "DURABLE_AGENT_RUN", { agentBox: true, agentDeclarationCanvas: true, agentName: "claimAgent" });

const linkSources = (visitor: NodeFactoryVisitor) =>
    ((visitor as any).links as Array<{ getSourcePort: () => { getNode: () => { getID: () => string } } }>).map((link) =>
        link.getSourcePort().getNode().getID()
    );

describe("NodeFactoryVisitor agent run links", () => {
    it("links the statement that follows an agent run", () => {
        const visitor = new NodeFactoryVisitor();
        visitor.beginVisitEventStart(makeNode("start", "EVENT_START"));
        visitor.beginVisitDurableAgentRun(statementBox("run"));
        visitor.beginVisitNode(makeNode("after", "EXPRESSION"));

        expect(linkSources(visitor)).toContain("run");
    });

    it("links what follows an agent run that opens a block, where nothing precedes it", () => {
        const visitor = new NodeFactoryVisitor();
        // A block's first statement is visited with no preceding node in the chain.
        visitor.beginVisitDurableAgentRun(statementBox("run-in-branch"));
        visitor.beginVisitNode(makeNode("after", "EXPRESSION"));

        expect(linkSources(visitor)).toContain("run-in-branch");
    });

    it("joins the agent's own canvas to its start pill", () => {
        const visitor = new NodeFactoryVisitor();
        visitor.beginVisitEventStart(makeNode("start", "EVENT_START"));
        visitor.beginVisitDurableAgentRun(syntheticBox("canvas-box"));

        expect(linkSources(visitor)).toContain("start");
    });

    it("keeps the synthetic copy out of the chain when it floats above one", () => {
        const visitor = new NodeFactoryVisitor();
        visitor.beginVisitDurableAgentRun(syntheticBox("floating-box"));
        visitor.beginVisitEventStart(makeNode("start", "EVENT_START"));
        visitor.beginVisitNode(makeNode("first-statement", "EXPRESSION"));

        // The pill, not the box, is what the first statement hangs from.
        expect(linkSources(visitor)).toContain("start");
        expect(linkSources(visitor)).not.toContain("floating-box");
    });
});
