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

import { focusAround } from "../components/AgentTopologyDiagram/topologyFocus";
import { TopologyAgentNode, TopologyEdge, TopologyGraph, TopologySplitNode, TopologyTriggerNode } from "../components/AgentTopologyDiagram/types";

function agent(id: string): TopologyAgentNode {
    return {
        id, name: id, typeName: "AI Agent", role: "", toolCount: 0, functionTools: 0, agentTools: 0, mcpTools: 0, tools: [], chips: [],
        typed: false, orphan: false, filePath: "https://gh.072103.xyz/proj/agents.bal", position: { line: 1, offset: 0 },
    };
}

function trigger(id: string): TopologyTriggerNode {
    return { id, label1: id, label2: "", glyphType: "http", filePath: "https://gh.072103.xyz/proj/services.bal", position: { line: 1, offset: 0 } };
}

function edge(sourceId: string, targetId: string, kind: TopologyEdge["kind"] = "trigger", step?: [string, string]): TopologyEdge {
    const chips = step ? [{ kind: "sequence" as const, text: step[1], triggerId: step[0] }] : [];
    return { id: `${sourceId}->${targetId}`, sourceId, targetId, kind, chips };
}

function graphOf(agents: TopologyAgentNode[], triggers: TopologyTriggerNode[], edges: TopologyEdge[], splits: TopologySplitNode[] = []): TopologyGraph {
    return { agents, triggers, splits, edges, wiredNothing: false, legendKinds: [] };
}

// helper_chains: /draft runs research ① → writer ②; /intake runs intake ① → research ②; main runs intake.
const shared = graphOf(
    [agent("intake"), agent("research"), agent("writer")],
    [trigger("draft"), trigger("intakeT"), trigger("main")],
    [
        edge("draft", "research", "trigger", ["draft", "1"]),
        edge("research", "writer", "trigger", ["draft", "2"]),
        edge("intakeT", "intake", "trigger", ["intakeT", "1"]),
        edge("intake", "research", "trigger", ["intakeT", "2"]),
        edge("main", "intake"),
    ]
);

describe("focusAround", () => {
    it("lights only the hovered trigger's own chain, not another handler's continuation through a shared agent", () => {
        const focus = focusAround(shared, "intakeT");
        expect([...focus.edges].sort()).toEqual(["intake->research", "intakeT->intake"]);
        expect(focus.nodes.has("writer")).toBe(false);
        expect(focus.nodes.has("draft")).toBe(false);
    });

    it("lights every handler through a hovered agent, but only as far as each handler goes", () => {
        const focus = focusAround(shared, "research");
        expect([...focus.edges].sort()).toEqual(["draft->research", "intake->research", "intakeT->intake", "research->writer"]);
        expect(focus.nodes.has("main")).toBe(false);
    });

    it("follows delegation downstream but not the delegate's own chains", () => {
        const graph = graphOf(
            [agent("planner"), agent("critic"), agent("other")],
            [trigger("t1"), trigger("t2")],
            [edge("t1", "planner"), edge("planner", "critic", "delegation"), edge("t2", "critic", "trigger", ["t2", "1"]), edge("critic", "other", "trigger", ["t2", "2"])]
        );
        const focus = focusAround(graph, "t1");
        expect([...focus.edges].sort()).toEqual(["planner->critic", "t1->planner"]);
    });

    it("lights a sub-agent's parent and the parent's trigger", () => {
        const graph = graphOf(
            [agent("planner"), agent("critic")],
            [trigger("t1")],
            [edge("t1", "planner"), edge("planner", "critic", "delegation"), edge("critic", "planner", "delegation")]
        );
        const focus = focusAround(graph, "critic");
        expect(focus.nodes).toEqual(new Set(["critic", "planner", "t1"]));
        expect(focus.edges.size).toBe(3);
    });

    it("carries a trigger's focus through its split chain", () => {
        const split: TopologySplitNode = { id: "t1::g", kind: "if", triggerId: "t1", parentId: "t1", depth: 1 };
        const graph = graphOf(
            [agent("a"), agent("b")],
            [trigger("t1"), trigger("t2")],
            [edge("t1", "t1::g", "stem"), edge("t1::g", "a"), edge("t1::g", "b"), edge("t2", "b")],
            [split]
        );
        expect([...focusAround(graph, "t1").edges].sort()).toEqual(["t1->t1::g", "t1::g->a", "t1::g->b"]);
        expect([...focusAround(graph, "b").edges].sort()).toEqual(["t1->t1::g", "t1::g->b", "t2->b"]);
    });
});
