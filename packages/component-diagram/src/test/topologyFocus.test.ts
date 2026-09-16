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

import { focusAround, inletFocusId, isolateGraph } from "../components/AgentTopologyDiagram/topologyFocus";
import { TopologyAgentNode, TopologyEdge, TopologyEntryNode, TopologyGraph } from "../components/AgentTopologyDiagram/types";

// Which ids in these fixtures are triggers, so `edge` knows to source from a card row.
const triggerIds = new Set(["draft", "intakeT", "main", "t1", "t2", "t", "other"]);

function agent(id: string): TopologyAgentNode {
    return {
        id, name: id, kind: "agent", typeName: "AI Agent", role: "", toolCount: 0, functionTools: 0, agentTools: 0, mcpTools: 0, tools: [], chips: [],
        typed: false, orphan: false, filePath: "/proj/agents.bal", position: { line: 1, offset: 0 },
        channels: [], people: [], activities: 0, gatedActivities: 0, humanTasks: [], peers: [],
    };
}

// One card per trigger in these tests, so a handler id and its card's id are the same thing.
function trigger(id: string): TopologyEntryNode {
    return {
        id: `card::${id}`,
        kind: "service",
        title: id,
        subtitle: "http:Service",
        glyphType: "http",
        filePath: "/proj/services.bal",
        position: { line: 1, offset: 0 },
        handlers: [{ id, label: id, filePath: "/proj/services.bal", position: { line: 1, offset: 0 }, logic: [], ordered: false, wired: true }],
    };
}

// An edge out of a trigger leaves its card's row, which is how the canvas sources it.
function edge(sourceId: string, targetId: string, kind: TopologyEdge["kind"] = "trigger", step?: [string, string]): TopologyEdge {
    const handlers = step ? [{ triggerId: step[0], order: Number(step[1]) }] : undefined;
    const fromCard = triggerIds.has(sourceId);
    return {
        id: `${sourceId}->${targetId}`,
        sourceId: fromCard ? `card::${sourceId}` : sourceId,
        targetId,
        kind,
        handlerId: fromCard ? sourceId : undefined,
        handlers,
    };
}

function graphOf(agents: TopologyAgentNode[], entries: TopologyEntryNode[], edges: TopologyEdge[]): TopologyGraph {
    return { agents, entries, handlers: entries.flatMap((entry) => entry.handlers), edges, wiredNothing: false, legendKinds: [] };
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
        expect(focus.nodes).toEqual(new Set(["critic", "planner", "t1", "card::t1"]));
        expect(focus.edges.size).toBe(3);
    });


    // One card with a `run` row that runs a and d, and a `send` row that sends `chat` to the durable d.
    function sendGraph(): TopologyGraph {
        const durable: TopologyAgentNode = { ...agent("d"), kind: "durable", channels: [{ name: "chat", senders: [] }] };
        const card: TopologyEntryNode = {
            ...trigger("t"),
            handlers: ["run", "send"].map((id) => ({ id, label: id, filePath: "/proj/services.bal", position: { line: 1, offset: 0 }, logic: [], ordered: false, wired: true })),
        };
        return {
            agents: [agent("a"), durable],
            entries: [card],
            handlers: card.handlers,
            edges: [
                { id: "run->a", sourceId: "card::t", targetId: "a", kind: "trigger", handlerId: "run" },
                { id: "run->d", sourceId: "card::t", targetId: "d", kind: "trigger", handlerId: "run" },
                { id: "send~>d#chat", sourceId: "card::t", targetId: "d", kind: "event", handlerId: "send", channel: "chat" },
            ],
            wiredNothing: false,
            legendKinds: ["trigger", "event"],
        };
    }

    it("lights only the sending row's event edge and its durable card when that row is hovered", () => {
        const focus = focusAround(sendGraph(), "send");
        expect([...focus.edges]).toEqual(["send~>d#chat"]);
        expect(focus.nodes).toEqual(new Set(["send", "card::t", "d"]));
    });

    it("lights a channel's event edges and their sending rows when its inlet is hovered, not the run into the card", () => {
        const focus = focusAround(sendGraph(), inletFocusId("d", "chat"));
        expect([...focus.edges]).toEqual(["send~>d#chat"]);
        expect(focus.nodes).toEqual(new Set(["d", "card::t", "send"]));
    });

    it("lights an inlet only when one of its event edges is lit, so a run row leaves the channel's pill dim", () => {
        expect(focusAround(sendGraph(), "run").inlets.size).toBe(0);
        expect(focusAround(sendGraph(), "send").inlets).toEqual(new Set([inletFocusId("d", "chat")]));
        expect(focusAround(sendGraph(), inletFocusId("d", "chat")).inlets).toEqual(new Set([inletFocusId("d", "chat")]));
    });

    it("keeps an idle row's card lit and lights nothing else when that row is hovered", () => {
        const graph = sendGraph();
        graph.entries[0].handlers.push({ id: "read", label: "read", filePath: "/proj/services.bal", position: { line: 1, offset: 0 }, logic: [], ordered: false, wired: false });
        const focus = focusAround(graph, "read");
        expect(focus.edges.size).toBe(0);
        expect(focus.nodes).toEqual(new Set(["read", "card::t"]));
    });
});

describe("isolateGraph", () => {
    it("keeps only the story's cards and lit edges, with every row of a kept card", () => {
        const cut = isolateGraph(shared, focusAround(shared, "intakeT"));
        expect(cut.agents.map((node) => node.id)).toEqual(["intake", "research"]);
        expect(cut.entries.map((node) => node.id)).toEqual(["card::intakeT"]);
        expect(cut.edges.map((edge) => edge.id).sort()).toEqual(["intake->research", "intakeT->intake"]);
        expect(cut.handlers.map((handler) => handler.id)).toEqual(["intakeT"]);
    });
});
