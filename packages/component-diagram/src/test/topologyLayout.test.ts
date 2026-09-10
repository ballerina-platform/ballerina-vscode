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

import {
    AGENT_CARD_MIN_HEIGHT,
    AGENT_CARD_WIDTH,
    ARRIVAL_BOW_PX,
    TOPOLOGY_COLUMN_GAP,
    TOPOLOGY_GAP_X,
    TOPOLOGY_GAP_X_MAX,
    TOPOLOGY_GAP_Y,
    TOPOLOGY_ROW_GAP,
    ENTRY_CARD_WIDTH,
    ENTRY_HEADER_HEIGHT,
    ENTRY_ROW_HEIGHT,
} from "../resources/constants";
import { estimateAgentCardHeight, layoutTopology } from "../components/AgentTopologyDiagram/topologyLayout";

const ONE_ROW_CARD = ENTRY_HEADER_HEIGHT + ENTRY_ROW_HEIGHT;
import { TopologyAgentNode, TopologyEdge, TopologyEntryNode, TopologyGraph, TopologyHandler } from "../components/AgentTopologyDiagram/types";

function agent(id: string, extra: Partial<TopologyAgentNode> = {}): TopologyAgentNode {
    return {
        id, name: id, typeName: "AI Agent", role: "", toolCount: 0, functionTools: 0, agentTools: 0, mcpTools: 0, tools: [], chips: [],
        typed: false, orphan: false, filePath: "/proj/agents.bal", position: { line: 1, offset: 0 }, ...extra,
    };
}

function handler(id: string, extra: Partial<TopologyHandler> = {}): TopologyHandler {
    return { id, label: id, filePath: "/proj/services.bal", position: { line: 1, offset: 0 }, logic: [], ordered: false, ...extra };
}

// An entry card with one row per handler id; the card's own id is what edges and ranks use.
function trigger(id: string, rows: string[] = [id], extra: Partial<TopologyEntryNode> = {}): TopologyEntryNode {
    return {
        id,
        kind: "service",
        title: id,
        subtitle: "http:Service",
        glyphType: "http",
        filePath: "/proj/services.bal",
        position: { line: 1, offset: 0 },
        handlers: rows.map((row) => handler(row)),
        ...extra,
    };
}

function edge(sourceId: string, targetId: string, kind: TopologyEdge["kind"] = "trigger"): TopologyEdge {
    return { id: `${sourceId}->${targetId}`, sourceId, targetId, kind };
}

function graphOf(agents: TopologyAgentNode[], entries: TopologyEntryNode[], edges: TopologyEdge[]): TopologyGraph {
    return {
        agents,
        entries,
        handlers: entries.flatMap((entry) => entry.handlers),
        edges,
        wiredNothing: entries.length === 0,
        legendKinds: [],
    };
}

describe("layoutTopology", () => {
    it("places two triggers at rank 0 and a directly-triggered agent at rank 1", () => {
        const graph = graphOf(
            [agent("a1")],
            [trigger("t1"), trigger("t2")],
            [edge("t1", "a1"), edge("t2", "a1")]
        );
        const layout = layoutTopology(graph);
        expect(layout.entryPositions["t1"].x).toBe(0);
        expect(layout.entryPositions["t2"].x).toBe(0);
        expect(layout.agentPositions["a1"].x).toBeGreaterThan(0);
        expect(layout.entryPositions["t1"].y).not.toBe(layout.entryPositions["t2"].y);
    });

    it("ranks a delegated agent one column to the right of its triggered delegator", () => {
        const graph = graphOf(
            [agent("supervisor"), agent("specialist")],
            [trigger("t1")],
            [edge("t1", "supervisor"), edge("supervisor", "specialist", "delegation")]
        );
        const layout = layoutTopology(graph);
        expect(layout.agentPositions["specialist"].x).toBeGreaterThan(layout.agentPositions["supervisor"].x);
    });

    it("places an orphan agent in the first agent column, below the agents that are wired", () => {
        const graph = graphOf(
            [agent("wired"), agent("loner", { orphan: true })],
            [trigger("t1")],
            [edge("t1", "wired")]
        );
        const layout = layoutTopology(graph);
        expect(layout.agentPositions["loner"].x).toBe(layout.agentPositions["wired"].x);
        expect(layout.agentPositions["loner"].x).toBeGreaterThan(layout.entryPositions["t1"].x);
        expect(layout.agentPositions["loner"].y).toBeGreaterThan(layout.agentPositions["wired"].y);
    });

    it("centres a trigger on its only agent and a supervisor on its specialists (trip-planner shape)", () => {
        const graph = graphOf(
            [agent("planner"), agent("logistics"), agent("budget"), agent("research"), agent("tutor", { orphan: true })],
            [trigger("chat")],
            [
                edge("chat", "planner"),
                edge("planner", "logistics", "delegation"),
                edge("planner", "budget", "delegation"),
                edge("planner", "research", "delegation"),
            ]
        );
        const layout = layoutTopology(graph);
        const centreOf = (y: number, height: number) => y + height / 2;
        const plannerCentre = centreOf(layout.agentPositions["planner"].y, layout.cardHeights["planner"]);
        expect(centreOf(layout.entryPositions["chat"].y, ONE_ROW_CARD)).toBeCloseTo(plannerCentre);
        expect(plannerCentre).toBeCloseTo(centreOf(layout.agentPositions["budget"].y, layout.cardHeights["budget"]));
        expect(layout.agentPositions["tutor"].x).toBe(layout.agentPositions["planner"].x);
        expect(layout.agentPositions["tutor"].y).toBeGreaterThan(layout.agentPositions["planner"].y);
        expect(layout.agentPositions["planner"].x).toBe(ENTRY_CARD_WIDTH + TOPOLOGY_GAP_X);
    });

    it("spreads the columns across the available width, within bounds", () => {
        const graph = graphOf([agent("a1")], [trigger("t1")], [edge("t1", "a1")]);
        const wide = layoutTopology(graph, { availableWidth: 4000 });
        expect(wide.agentPositions["a1"].x).toBe(ENTRY_CARD_WIDTH + TOPOLOGY_GAP_X_MAX);
        const snug = layoutTopology(graph, { availableWidth: ENTRY_CARD_WIDTH + AGENT_CARD_WIDTH + 300 });
        expect(snug.agentPositions["a1"].x).toBe(ENTRY_CARD_WIDTH + 300 - 80);
        const narrow = layoutTopology(graph, { availableWidth: 300 });
        expect(narrow.agentPositions["a1"].x).toBe(ENTRY_CARD_WIDTH + TOPOLOGY_GAP_X);
    });

    it("straddles a shared agent with the two cards that run it", () => {
        const graph = graphOf([agent("a")], [trigger("t1"), trigger("t2")], [edge("t1", "a"), edge("t2", "a")]);
        const layout = layoutTopology(graph);
        const centreOf = (y: number, h: number) => y + h / 2;
        const t = (id: string) => centreOf(layout.entryPositions[id].y, ONE_ROW_CARD);
        const a = centreOf(layout.agentPositions["a"].y, layout.cardHeights["a"]);
        expect((t("t1") + t("t2")) / 2).toBeCloseTo(a);
    });

    it("centres a lone card on the agents it runs", () => {
        const graph = graphOf([agent("b"), agent("c")], [trigger("t3")], [edge("t3", "b"), edge("t3", "c")]);
        const layout = layoutTopology(graph);
        const centreOf = (y: number, h: number) => y + h / 2;
        const a = (id: string) => centreOf(layout.agentPositions[id].y, layout.cardHeights[id]);
        expect(centreOf(layout.entryPositions["t3"].y, ONE_ROW_CARD)).toBeCloseTo((a("b") + a("c")) / 2);
    });

    it("moves an agent under its only trigger when the row has room, so the edge is straight (support_desk shape)", () => {
        const graph = graphOf(
            [agent("supportSup"), agent("salesSup"), agent("billing"), agent("technical"), agent("order"), agent("shipping"), agent("quote")],
            [trigger("chat"), trigger("quotes"), trigger("ask")],
            [
                edge("chat", "supportSup"), edge("quotes", "order"), edge("order", "shipping"), edge("ask", "salesSup"),
                edge("supportSup", "billing", "delegation"), edge("supportSup", "technical", "delegation"), edge("supportSup", "order", "delegation"),
                edge("salesSup", "technical", "delegation"), edge("salesSup", "quote", "delegation"),
            ]
        );
        const layout = layoutTopology(graph, { orientation: "vertical" });
        const agentCentre = (id: string) => layout.agentPositions[id].x + AGENT_CARD_WIDTH / 2;
        const triggerCentre = (id: string) => layout.entryPositions[id].x + ENTRY_CARD_WIDTH / 2;
        expect(agentCentre("supportSup")).toBeCloseTo(triggerCentre("chat"));
        expect(agentCentre("salesSup")).toBeCloseTo(triggerCentre("ask"));
    });

    it("runs a long edge along its own row and turns in before the target when the skipped column is clear there", () => {
        const graph = graphOf(
            [agent("a"), agent("b")],
            [trigger("t1"), trigger("t2")],
            [edge("t1", "b"), edge("t2", "a"), edge("a", "b", "delegation")]
        );
        const layout = layoutTopology(graph);
        const a = layout.agentPositions["a"];
        const b = layout.agentPositions["b"];
        // b lines up under a, so the lane at b's height would run through a; t1's own row is clear of a.
        expect(b.y).toBe(a.y);
        const vias = layout.edgeVias["t1->b"];
        const arrival = b.y + layout.cardHeights["b"] / 2 + layout.edgeBows["t1->b"] * ARRIVAL_BOW_PX;
        expect(vias).toHaveLength(2);
        expect(vias[0]).toEqual({ x: b.x - 40, y: layout.entryPositions["t1"].y + ONE_ROW_CARD / 2 });
        expect(vias[1]).toEqual({ x: b.x - 40, y: arrival });
        const [short] = layout.edgeVias["t2->a"];
        expect(short.x).toBeGreaterThan(layout.entryPositions["t2"].x + ENTRY_CARD_WIDTH);
        expect(short.x).toBeLessThan(a.x);
        expect(layout.edgeVias["a->b"][0].x).toBeGreaterThan(a.x + AGENT_CARD_WIDTH);
    });

    it("detours a long edge around the skipped card on the cheaper side when both its rows are blocked", () => {
        const graph = graphOf([agent("a"), agent("b")], [trigger("t1")], [edge("t1", "a"), edge("t1", "b"), edge("a", "b", "delegation")]);
        const layout = layoutTopology(graph);
        const a = layout.agentPositions["a"];
        const b = layout.agentPositions["b"];
        // t1 sits level with a, and b lines up under a: neither row gets past a, so the edge goes around it.
        const vias = layout.edgeVias["t1->b"];
        expect(vias).toHaveLength(4);
        expect(vias[0].x).toBeLessThan(a.x);
        expect(vias[0].x).toBeGreaterThan(layout.entryPositions["t1"].x + ENTRY_CARD_WIDTH);
        expect(vias[1].y < a.y || vias[1].y > a.y + layout.cardHeights["a"]).toBe(true);
        expect(vias[2].y).toBe(vias[1].y);
        expect(vias[3]).toEqual({ x: b.x - 40, y: b.y + layout.cardHeights["b"] / 2 + layout.edgeBows["t1->b"] * ARRIVAL_BOW_PX });
    });

    it("threads a long edge through the gap between two skipped cards when both its rows are taken (ops_center shape)", () => {
        const graph = graphOf(
            [agent("r"), agent("a"), agent("b"), agent("d")],
            [trigger("t1")],
            [edge("t1", "r"), edge("r", "a", "delegation"), edge("r", "b", "delegation"), edge("r", "d", "delegation"), edge("b", "d", "delegation")]
        );
        const layout = layoutTopology(graph);
        const a = layout.agentPositions["a"];
        const b = layout.agentPositions["b"];
        expect(layout.agentPositions["d"].x).toBeGreaterThan(b.x);
        const vias = layout.edgeVias["r->d"];
        expect(vias).toHaveLength(4);
        expect(vias[1].y).toBeGreaterThan(a.y + layout.cardHeights["a"]);
        expect(vias[1].y).toBeLessThan(b.y);
    });

    it("takes its own row when the skipped column is busy at its target's height", () => {
        const graph = graphOf(
            [agent("a"), agent("b"), agent("c")],
            [trigger("t1"), trigger("t2")],
            [edge("t1", "c"), edge("t2", "a"), edge("a", "b", "delegation"), edge("b", "c", "delegation"), edge("a", "c", "delegation")]
        );
        const layout = layoutTopology(graph);
        // c lines up under a, and so does b, so c's height is taken in the skipped column; t1's own row is clear.
        const vias = layout.edgeVias["t1->c"];
        expect(vias).toHaveLength(2);
        expect(vias[0].y).toBe(layout.entryPositions["t1"].y + ONE_ROW_CARD / 2);
        expect(vias[1].y).toBeCloseTo(layout.agentPositions["c"].y + layout.cardHeights["c"] / 2 + layout.edgeBows["t1->c"] * ARRIVAL_BOW_PX);
    });

    it("lines a chain up under its earliest step even when other handlers also reach the agent", () => {
        const graph = graphOf(
            [agent("a"), agent("b"), agent("c")],
            [trigger("t1"), trigger("t2")],
            [
                { ...edge("t1", "a"), handlers: [{ triggerId: "t1", order: 1 }] },
                { ...edge("a", "b"), handlers: [{ triggerId: "t1", order: 2 }] },
                { ...edge("b", "c"), handlers: [{ triggerId: "t1", order: 3 }] },
                { ...edge("t2", "b"), handlers: [{ triggerId: "t2", order: 1 }] },
            ]
        );
        const layout = layoutTopology(graph);
        expect(layout.agentPositions["b"].y).toBe(layout.agentPositions["a"].y);
        expect(layout.agentPositions["c"].y).toBe(layout.agentPositions["b"].y);
    });

    it("staggers the bends of sources that share a layer so their fans do not merge", () => {
        const graph = graphOf(
            [agent("s1"), agent("s2"), agent("x"), agent("y"), agent("z")],
            [trigger("t1"), trigger("t2")],
            [edge("t1", "s1"), edge("t2", "s2"), edge("s1", "x", "delegation"), edge("s1", "y", "delegation"), edge("s2", "y", "delegation"), edge("s2", "z", "delegation")]
        );
        const layout = layoutTopology(graph);
        expect(layout.edgeVias["s1->x"][0].x).toBe(layout.edgeVias["s1->y"][0].x);
        expect(layout.edgeVias["s1->y"][0].x).not.toBe(layout.edgeVias["s2->y"][0].x);
    });

    it("starts the drawn bounds at the entry card, which has no blank label block to skip", () => {
        const layout = layoutTopology(graphOf([agent("a1")], [trigger("t1")], [edge("t1", "a1")]));
        expect(layout.left).toBe(0);
        expect(layout.width).toBe(layout.agentPositions["a1"].x + AGENT_CARD_WIDTH);
        const untriggered = layoutTopology(graphOf([agent("a1", { orphan: true })], [], []));
        expect(untriggered.left).toBe(0);
    });

    it("makes a card as tall as the rows it draws, and folds the rest away", () => {
        const graph = graphOf([agent("a1")], [trigger("svc", ["h1", "h2", "h3", "h4"])], [edge("svc", "a1")]);
        const all = layoutTopology(graph);
        expect(all.cardHeights["svc"]).toBe(ENTRY_HEADER_HEIGHT + 4 * ENTRY_ROW_HEIGHT);
        expect(all.visibleRows["svc"]).toBe(4);
        const folded = layoutTopology(graph, { visibleRows: { svc: 2 } });
        expect(folded.visibleRows["svc"]).toBe(2);
        expect(folded.cardHeights["svc"]).toBeLessThan(all.cardHeights["svc"]);
    });

    it("leaves every row's edges from the card's bottom edge, spread across it, when the flow runs top to bottom", () => {
        const graph = graphOf(
            [agent("a1"), agent("a2")],
            [trigger("svc", ["h1", "h2"])],
            [
                { id: "h1->a1", sourceId: "svc", targetId: "a1", kind: "trigger", handlerId: "h1" },
                { id: "h2->a2", sourceId: "svc", targetId: "a2", kind: "trigger", handlerId: "h2" },
            ]
        );
        const layout = layoutTopology(graph, { orientation: "vertical" });
        const card = layout.entryPositions["svc"];
        const first = layout.edgeVias["h1->a1"][0];
        const second = layout.edgeVias["h2->a2"][0];
        // Both leave below the card, at a third and two thirds of its width.
        expect(first.y).toBeGreaterThan(card.y + layout.cardHeights["svc"]);
        expect(second.y).toBeGreaterThan(card.y + layout.cardHeights["svc"]);
        expect(first.x).toBeCloseTo(card.x + ENTRY_CARD_WIDTH / 3);
        expect(second.x).toBeCloseTo(card.x + (2 * ENTRY_CARD_WIDTH) / 3);
    });

    it("leaves each row's edges from that row's own place down the card", () => {
        const graph = graphOf(
            [agent("a1"), agent("a2")],
            [trigger("svc", ["h1", "h2"])],
            [
                { id: "h1->a1", sourceId: "svc", targetId: "a1", kind: "trigger", handlerId: "h1" },
                { id: "h2->a2", sourceId: "svc", targetId: "a2", kind: "trigger", handlerId: "h2" },
            ]
        );
        const layout = layoutTopology(graph);
        const first = layout.edgeVias["h1->a1"][0].y;
        const second = layout.edgeVias["h2->a2"][0].y;
        expect(second - first).toBe(ENTRY_ROW_HEIGHT);
        expect(first).toBe(layout.entryPositions["svc"].y + ENTRY_HEADER_HEIGHT + ENTRY_ROW_HEIGHT / 2);
    });

    it("keeps an untriggered package's cards at x = 0 so the fit centres on them", () => {
        const graph = graphOf([agent("a1", { orphan: true }), agent("a2", { orphan: true })], [], []);
        const layout = layoutTopology(graph);
        expect(layout.agentPositions["a1"].x).toBe(0);
        expect(layout.width).toBe(AGENT_CARD_WIDTH);
    });

    it("straddles two triggers around the one agent they share", () => {
        const graph = graphOf([agent("a1")], [trigger("t1"), trigger("t2")], [edge("t1", "a1"), edge("t2", "a1")]);
        const layout = layoutTopology(graph);
        const agentCentre = layout.agentPositions["a1"].y + layout.cardHeights["a1"] / 2;
        const triggerCentres = [layout.entryPositions["t1"].y, layout.entryPositions["t2"].y].map((y) => y + ONE_ROW_CARD / 2);
        expect((triggerCentres[0] + triggerCentres[1]) / 2).toBeCloseTo(agentCentre);
        expect(Math.min(...Object.values(layout.entryPositions).map((p) => p.y), ...Object.values(layout.agentPositions).map((p) => p.y))).toBe(0);
    });

    it("produces the same positions on repeated calls (deterministic)", () => {
        const graph = graphOf(
            [agent("a1"), agent("a2"), agent("a3")],
            [trigger("t1"), trigger("t2")],
            [edge("t1", "a1"), edge("t2", "a2"), edge("a1", "a3", "delegation")]
        );
        const first = layoutTopology(graph);
        const second = layoutTopology(graph);
        expect(second).toEqual(first);
    });

    it("keeps an untriggered delegation cycle in two adjacent columns", () => {
        const graph = graphOf(
            [agent("a"), agent("b")],
            [],
            [edge("a", "b", "delegation"), edge("b", "a", "delegation")]
        );
        const chain = layoutTopology(graphOf([agent("a"), agent("b")], [], [edge("a", "b", "delegation")]));
        const layout = layoutTopology(graph);
        expect(layout.agentPositions["b"].x - layout.agentPositions["a"].x).toBe(chain.agentPositions["b"].x - chain.agentPositions["a"].x);
    });

    it("keeps a triggered delegation cycle in adjacent columns and wraps the back edge below the cards", () => {
        const graph = graphOf(
            [agent("a"), agent("b")],
            [trigger("t1")],
            [edge("t1", "a"), edge("a", "b", "delegation"), edge("b", "a", "delegation")]
        );
        const chain = layoutTopology(graphOf([agent("a"), agent("b")], [trigger("t1")], [edge("t1", "a"), edge("a", "b", "delegation")]));
        const layout = layoutTopology(graph);
        expect(layout.agentPositions["b"].x - layout.agentPositions["a"].x).toBe(chain.agentPositions["b"].x - chain.agentPositions["a"].x);
        const back = layout.edgeVias["b->a"];
        const bottom = Math.max(layout.agentPositions["a"].y + layout.cardHeights["a"], layout.agentPositions["b"].y + layout.cardHeights["b"]);
        expect(back).toHaveLength(4);
        expect(back[0].x).toBeGreaterThan(layout.agentPositions["b"].x);
        expect(back[1].y).toBeGreaterThan(bottom);
        expect(back[2].y).toBe(back[1].y);
        expect(back[3].x).toBeLessThan(layout.agentPositions["a"].x);
        expect(layout.edgeVias["a->b"]).toHaveLength(1);
        expect(layout.height).toBeGreaterThanOrEqual(back[1].y);
    });

    it("spreads the edges that arrive at one agent and leaves a lone arrival straight", () => {
        const both = { ...edge("a", "b", "delegation"), id: "a~>b" };
        const graph = graphOf([agent("a"), agent("b")], [trigger("t1")], [edge("t1", "a"), edge("a", "b"), both]);
        const layout = layoutTopology(graph);
        expect([layout.edgeBows["a->b"], layout.edgeBows["a~>b"]].sort()).toEqual([-0.5, 0.5]);
        expect(layout.edgeBows["t1->a"]).toBe(0);
    });

    it("does not count a wrapped back edge when spreading arrivals", () => {
        const graph = graphOf([agent("a"), agent("b")], [trigger("t1")], [edge("t1", "a"), edge("a", "b", "delegation"), edge("b", "a", "delegation")]);
        const layout = layoutTopology(graph);
        expect(layout.edgeBows["t1->a"]).toBe(0);
        expect(layout.edgeBows["b->a"]).toBeUndefined();
    });

    it("draws a self-delegation as a loop below the card without adding a column", () => {
        const graph = graphOf([agent("a")], [trigger("t1")], [edge("t1", "a"), edge("a", "a", "delegation")]);
        const plain = layoutTopology(graphOf([agent("a")], [trigger("t1")], [edge("t1", "a")]));
        const layout = layoutTopology(graph);
        expect(layout.agentPositions["a"].x).toBe(plain.agentPositions["a"].x);
        expect(layout.edgeVias["a->a"]).toHaveLength(4);
        expect(layout.edgeVias["a->a"][1].y).toBeGreaterThan(layout.agentPositions["a"].y + layout.cardHeights["a"]);
    });

    it("still lays out a large package (20 agents) without breaking (search/zoom is deferred, not layout correctness)", () => {
        const agentCount = 20;
        const agents = Array.from({ length: agentCount }, (_, i) => agent(`a${i}`));
        const singleTrigger = trigger("t1");
        const edges = agents.map((a) => edge("t1", a.id));
        const graph = graphOf(agents, [singleTrigger], edges);

        const layout = layoutTopology(graph);

        const positions = agents.map((a) => layout.agentPositions[a.id]);
        expect(positions.every((position) => Number.isFinite(position.x) && Number.isFinite(position.y))).toBe(true);
        // Same rank (all directly triggered), stacked distinctly -- no two cards overlap.
        expect(new Set(positions.map((position) => position.y)).size).toBe(agentCount);
        expect(layout.height).toBeGreaterThan(0);
    });

    it("grows the card height once tool chips overflow the first row, and stacks the next card below it", () => {
        expect(estimateAgentCardHeight()).toBe(AGENT_CARD_MIN_HEIGHT);
        expect(estimateAgentCardHeight(true)).toBeGreaterThan(AGENT_CARD_MIN_HEIGHT);

        const tall = agent("tall", { chips: Array.from({ length: 7 }, (_, i) => ({ key: String(i), label: `c${i}` })) });
        const short = agent("short");
        const graph = graphOf(
            [tall, short],
            [trigger("t1")],
            [edge("t1", "tall"), edge("t1", "short")]
        );
        const layout = layoutTopology(graph);
        const gap = layout.agentPositions["short"].y - layout.agentPositions["tall"].y;
        expect(gap).toBeGreaterThan(layout.cardHeights["tall"]);
    });

    it("keeps the trigger square's own height for column stacking", () => {
        const graph = graphOf([], [trigger("t1"), trigger("t2")], []);
        const layout = layoutTopology(graph);
        expect(layout.entryPositions["t2"].y - layout.entryPositions["t1"].y).toBeGreaterThanOrEqual(ONE_ROW_CARD);
    });
});

describe("layoutTopology (vertical)", () => {
    const vertical = { orientation: "vertical" as const };

    it("puts triggers in the top row and ranks agents downwards", () => {
        const graph = graphOf([agent("a1"), agent("a2")], [trigger("t1")], [edge("t1", "a1"), edge("a1", "a2", "delegation")]);
        const layout = layoutTopology(graph, vertical);
        expect(layout.entryPositions["t1"].y).toBe(0);
        expect(layout.agentPositions["a1"].y).toBe(ONE_ROW_CARD + TOPOLOGY_ROW_GAP);
        expect(layout.agentPositions["a2"].y).toBe(layout.agentPositions["a1"].y + AGENT_CARD_MIN_HEIGHT + TOPOLOGY_ROW_GAP);
        expect(layout.left).toBe(0);
    });

    it("places siblings side by side and centres the parent and its trigger over them", () => {
        const graph = graphOf(
            [agent("a1"), agent("a2"), agent("a3")],
            [trigger("t1")],
            [edge("t1", "a1"), edge("a1", "a2", "delegation"), edge("a1", "a3", "delegation")]
        );
        const layout = layoutTopology(graph, vertical);
        expect(layout.agentPositions["a2"].y).toBe(layout.agentPositions["a3"].y);
        expect(layout.agentPositions["a3"].x - layout.agentPositions["a2"].x).toBe(AGENT_CARD_WIDTH + TOPOLOGY_COLUMN_GAP);
        const parentCentre = layout.agentPositions["a1"].x + AGENT_CARD_WIDTH / 2;
        const childrenCentre = (layout.agentPositions["a2"].x + layout.agentPositions["a3"].x + AGENT_CARD_WIDTH) / 2;
        expect(parentCentre).toBeCloseTo(childrenCentre);
        expect(layout.entryPositions["t1"].x + ENTRY_CARD_WIDTH / 2).toBeCloseTo(parentCentre);
        expect(layout.width).toBe(2 * AGENT_CARD_WIDTH + TOPOLOGY_COLUMN_GAP);
    });

    it("makes a row as tall as its tallest card", () => {
        const graph = graphOf(
            [agent("tall", { chips: Array.from({ length: 13 }, (_, i) => ({ key: `c${i}`, label: `c${i}` })) }), agent("short"), agent("next")],
            [trigger("t1")],
            [edge("t1", "tall"), edge("t1", "short"), edge("tall", "next", "delegation")]
        );
        const layout = layoutTopology(graph, vertical);
        expect(layout.agentPositions["next"].y).toBe(layout.agentPositions["tall"].y + layout.cardHeights["tall"] + TOPOLOGY_ROW_GAP);
    });

    it("detours a long edge beside the skipped row's card when the target sits under it", () => {
        const graph = graphOf(
            [agent("a1"), agent("a2"), agent("a3")],
            [trigger("t1")],
            [edge("t1", "a1"), edge("a1", "a2", "delegation"), edge("a2", "a3", "delegation"), edge("a1", "a3", "delegation")]
        );
        const layout = layoutTopology(graph, vertical);
        expect(layout.agentPositions["a3"].x).toBe(layout.agentPositions["a2"].x);
        const vias = layout.edgeVias["a1->a3"];
        expect(vias).toHaveLength(4);
        expect(vias[0].y).toBeLessThan(layout.agentPositions["a2"].y);
        expect(vias[0].y).toBeGreaterThan(layout.agentPositions["a1"].y);
        const a2 = layout.agentPositions["a2"];
        expect(vias[1].x < a2.x || vias[1].x > a2.x + AGENT_CARD_WIDTH).toBe(true);
        expect(vias[3].x).toBe(layout.agentPositions["a3"].x + AGENT_CARD_WIDTH / 2 + layout.edgeBows["a1->a3"] * ARRIVAL_BOW_PX);
    });
});
