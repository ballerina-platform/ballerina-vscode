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
    LOOP_BOX_CAPTION,
    LOOP_BOX_PAD,
    SPLIT_GAP_X_MIN,
    SPLIT_LABEL_GAP_Y,
    SPLIT_SIZE,
    SPLIT_STEM_X,
    SPLIT_STEM_Y,
    SPLIT_STEP_X,
    TOPOLOGY_COLUMN_GAP,
    TOPOLOGY_GAP_X,
    TOPOLOGY_GAP_X_MAX,
    TOPOLOGY_GAP_Y,
    TOPOLOGY_ROW_GAP,
    TRIGGER_LABEL_WIDTH,
    TRIGGER_NODE_WIDTH,
    TRIGGER_SIZE,
    TRIGGER_STACKED_HEIGHT,
} from "../resources/constants";
import { estimateAgentCardHeight, layoutTopology } from "../components/AgentTopologyDiagram/topologyLayout";
import { TopologyAgentNode, TopologyEdge, TopologyGraph, TopologySplitNode, TopologyTriggerNode } from "../components/AgentTopologyDiagram/types";

function agent(id: string, extra: Partial<TopologyAgentNode> = {}): TopologyAgentNode {
    return {
        id, name: id, typeName: "AI Agent", role: "", toolCount: 0, functionTools: 0, agentTools: 0, mcpTools: 0, tools: [], chips: [],
        typed: false, orphan: false, filePath: "/proj/agents.bal", position: { line: 1, offset: 0 }, ...extra,
    };
}

function trigger(id: string, extra: Partial<TopologyTriggerNode> = {}): TopologyTriggerNode {
    return { id, label1: id, label2: "", glyphType: "http", filePath: "/proj/services.bal", position: { line: 1, offset: 0 }, ...extra };
}

function edge(sourceId: string, targetId: string, kind: TopologyEdge["kind"] = "trigger"): TopologyEdge {
    return { id: `${sourceId}->${targetId}`, sourceId, targetId, kind, chips: [] };
}

function graphOf(agents: TopologyAgentNode[], triggers: TopologyTriggerNode[], edges: TopologyEdge[], splits: TopologySplitNode[] = []): TopologyGraph {
    return { agents, triggers, splits, edges, wiredNothing: triggers.length === 0, legendKinds: [] };
}

describe("layoutTopology", () => {
    it("places two triggers at rank 0 and a directly-triggered agent at rank 1", () => {
        const graph = graphOf(
            [agent("a1")],
            [trigger("t1"), trigger("t2")],
            [edge("t1", "a1"), edge("t2", "a1")]
        );
        const layout = layoutTopology(graph);
        expect(layout.triggerPositions["t1"].x).toBe(0);
        expect(layout.triggerPositions["t2"].x).toBe(0);
        expect(layout.agentPositions["a1"].x).toBeGreaterThan(0);
        expect(layout.triggerPositions["t1"].y).not.toBe(layout.triggerPositions["t2"].y);
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
        expect(layout.agentPositions["loner"].x).toBeGreaterThan(layout.triggerPositions["t1"].x);
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
        expect(centreOf(layout.triggerPositions["chat"].y, TRIGGER_SIZE)).toBeCloseTo(plannerCentre);
        expect(plannerCentre).toBeCloseTo(centreOf(layout.agentPositions["budget"].y, layout.cardHeights["budget"]));
        expect(layout.agentPositions["tutor"].x).toBe(layout.agentPositions["planner"].x);
        expect(layout.agentPositions["tutor"].y).toBeGreaterThan(layout.agentPositions["planner"].y);
        expect(layout.agentPositions["planner"].x).toBe(TRIGGER_NODE_WIDTH + TOPOLOGY_GAP_X);
    });

    it("spreads the columns across the available width, within bounds", () => {
        const graph = graphOf([agent("a1")], [trigger("t1")], [edge("t1", "a1")]);
        const wide = layoutTopology(graph, { availableWidth: 4000 });
        expect(wide.agentPositions["a1"].x).toBe(TRIGGER_NODE_WIDTH + TOPOLOGY_GAP_X_MAX);
        const snug = layoutTopology(graph, { availableWidth: TRIGGER_NODE_WIDTH + AGENT_CARD_WIDTH + 300 });
        expect(snug.agentPositions["a1"].x).toBe(TRIGGER_NODE_WIDTH + 300 - 80);
        const narrow = layoutTopology(graph, { availableWidth: 300 });
        expect(narrow.agentPositions["a1"].x).toBe(TRIGGER_NODE_WIDTH + TOPOLOGY_GAP_X);
    });

    it("places a split a fixed stem past its trigger, widens the trigger gap for the pills, and ranks its agents past it", () => {
        const split: TopologySplitNode = { id: "t1::split", kind: "if", triggerId: "t1", parentId: "t1", depth: 1 };
        const graph = graphOf(
            [agent("a1"), agent("a2")],
            [trigger("t1")],
            [edge("t1", "t1::split", "stem"), edge("t1::split", "a1"), edge("t1::split", "a2")],
            [split]
        );
        const layout = layoutTopology(graph);
        const splitPos = layout.splitPositions["t1::split"];
        expect(splitPos.y + SPLIT_SIZE / 2).toBeCloseTo(layout.triggerPositions["t1"].y + TRIGGER_SIZE / 2);
        expect(splitPos.x).toBe(layout.triggerPositions["t1"].x + TRIGGER_NODE_WIDTH + SPLIT_STEM_X);
        expect(layout.agentPositions["a1"].x).toBe(TRIGGER_NODE_WIDTH + SPLIT_GAP_X_MIN);
        expect(layout.agentPositions["a2"].y).toBeGreaterThan(layout.agentPositions["a1"].y);
    });

    it("chains nested splits one step apart and widens the trigger gap per level", () => {
        const loop: TopologySplitNode = { id: "t1::loop", kind: "foreach", triggerId: "t1", parentId: "t1", depth: 1, header: "x in xs" };
        const cond: TopologySplitNode = { id: "t1::if", kind: "if", triggerId: "t1", parentId: "t1::loop", depth: 2 };
        const graph = graphOf(
            [agent("a1"), agent("a2")],
            [trigger("t1")],
            [edge("t1", "t1::loop", "stem"), edge("t1::loop", "t1::if", "stem"), edge("t1::if", "a1"), edge("t1::if", "a2")],
            [loop, cond]
        );
        const layout = layoutTopology(graph);
        const loopPos = layout.splitPositions["t1::loop"];
        const condPos = layout.splitPositions["t1::if"];
        expect(condPos.x - loopPos.x).toBe(SPLIT_STEP_X);
        expect(layout.agentPositions["a1"].x).toBe(TRIGGER_NODE_WIDTH + SPLIT_GAP_X_MIN + SPLIT_STEP_X);
        const centreOf = (y: number, h: number) => y + h / 2;
        const agentsCentre = (centreOf(layout.agentPositions["a1"].y, layout.cardHeights["a1"]) + centreOf(layout.agentPositions["a2"].y, layout.cardHeights["a2"])) / 2;
        expect(centreOf(condPos.y, SPLIT_SIZE)).toBeCloseTo(agentsCentre);
        expect(centreOf(loopPos.y, SPLIT_SIZE)).toBeCloseTo(agentsCentre);
        expect(centreOf(layout.triggerPositions["t1"].y, TRIGGER_SIZE)).toBeCloseTo(agentsCentre);
    });

    it("keeps three handlers with nested splits and shared agents free of overlaps (nested_routing shape)", () => {
        const split = (id: string, kind: TopologySplitNode["kind"], triggerId: string, parentId: string, depth: number): TopologySplitNode =>
            ({ id, kind, triggerId, parentId, depth });
        const splits = [
            split("p::L", "foreach", "process", "process", 1), split("p::O", "if", "process", "p::L", 2), split("p::I", "if", "process", "p::O", 3),
            split("r::W", "while", "reprocess", "reprocess", 1), split("r::M", "match", "reprocess", "r::W", 2),
            split("a::C", "if", "audit", "audit", 1), split("a::L", "foreach", "audit", "a::C", 2), split("a::I", "if", "audit", "a::L", 3),
        ];
        const graph = graphOf(
            [agent("compliance"), agent("fraud"), agent("gift"), agent("fulfillment")],
            [trigger("process"), trigger("reprocess"), trigger("audit")],
            [
                edge("process", "p::L", "stem"), edge("p::L", "p::O", "stem"), edge("p::O", "p::I", "stem"),
                edge("p::I", "compliance"), edge("p::I", "fraud"), edge("p::O", "gift"), edge("p::O", "fulfillment"),
                edge("reprocess", "r::W", "stem"), edge("r::W", "r::M", "stem"), edge("r::M", "fulfillment"), edge("r::M", "fraud"),
                edge("audit", "a::C", "stem"), edge("a::C", "a::L", "stem"), edge("a::L", "a::I", "stem"), edge("a::I", "compliance"),
            ],
            splits
        );
        const layout = layoutTopology(graph);
        const boxes = [
            ...Object.entries(layout.agentPositions).map(([id, p]) => ({ id, ...p, w: AGENT_CARD_WIDTH, h: layout.cardHeights[id] })),
            ...Object.values(layout.triggerPositions).map((p) => ({ id: "t", ...p, w: TRIGGER_NODE_WIDTH, h: TRIGGER_SIZE })),
            ...Object.values(layout.splitPositions).map((p) => ({ id: "s", ...p, w: SPLIT_SIZE, h: SPLIT_SIZE })),
        ];
        boxes.forEach((a, i) =>
            boxes.slice(i + 1).forEach((b) => {
                const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
                expect(apart).toBe(true);
            })
        );
        const agentX = layout.agentPositions["compliance"].x;
        Object.values(layout.splitPositions).forEach((p) => expect(p.x + SPLIT_SIZE).toBeLessThan(agentX));
    });

    it("re-centres only the triggers that collided, so a lone trigger stays centred on its own agents", () => {
        const graph = graphOf(
            [agent("a"), agent("b"), agent("c")],
            [trigger("t1"), trigger("t2"), trigger("t3")],
            [edge("t1", "a"), edge("t2", "a"), edge("t3", "b"), edge("t3", "c")]
        );
        const layout = layoutTopology(graph);
        const centreOf = (y: number, h: number) => y + h / 2;
        const t = (id: string) => centreOf(layout.triggerPositions[id].y, TRIGGER_SIZE);
        const a = (id: string) => centreOf(layout.agentPositions[id].y, layout.cardHeights[id]);
        expect((t("t1") + t("t2")) / 2).toBeCloseTo(a("a"));
        expect(t("t3")).toBeCloseTo((a("b") + a("c")) / 2);
    });

    it("moves a nested split off an edge that passes through its layer", () => {
        const splits: TopologySplitNode[] = [
            { id: "t::S1", kind: "if", triggerId: "t", parentId: "t", depth: 1 },
            { id: "t::S3", kind: "if", triggerId: "t", parentId: "t::S1", depth: 2 },
        ];
        const graph = graphOf(
            [agent("a1"), agent("a2"), agent("a3")],
            [trigger("t")],
            [edge("t", "t::S1", "stem"), edge("t::S1", "a2"), edge("t::S1", "t::S3", "stem"), edge("t::S3", "a1"), edge("t::S3", "a3")],
            splits
        );
        const layout = layoutTopology(graph);
        const inner = layout.splitPositions["t::S3"];
        const laneY = layout.agentPositions["a2"].y + layout.cardHeights["a2"] / 2;
        expect(Math.abs(inner.y + SPLIT_SIZE / 2 - laneY)).toBeGreaterThanOrEqual(SPLIT_SIZE / 2 + 20);
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
        const triggerCentre = (id: string) => layout.triggerPositions[id].x + TRIGGER_LABEL_WIDTH / 2;
        expect(agentCentre("supportSup")).toBeCloseTo(triggerCentre("chat"));
        expect(agentCentre("salesSup")).toBeCloseTo(triggerCentre("ask"));
    });

    it("places a split that hangs off an agent a stem past that card and widens only that column's gap", () => {
        const split: TopologySplitNode = { id: "t1::g", kind: "match", triggerId: "t1", parentId: "a", depth: 1 };
        const graph = graphOf(
            [agent("a"), agent("b"), agent("c"), agent("d")],
            [trigger("t1")],
            [edge("t1", "a"), edge("a", "t1::g", "stem"), edge("t1::g", "b"), edge("t1::g", "c"), edge("c", "d", "delegation")],
            [split]
        );
        const layout = layoutTopology(graph);
        const a = layout.agentPositions["a"];
        expect(a.x).toBe(TRIGGER_NODE_WIDTH + TOPOLOGY_GAP_X);
        expect(layout.splitPositions["t1::g"].x).toBe(a.x + AGENT_CARD_WIDTH + SPLIT_STEM_X);
        expect(layout.agentPositions["b"].x).toBe(a.x + AGENT_CARD_WIDTH + SPLIT_GAP_X_MIN);
        expect(layout.agentPositions["c"].x).toBe(layout.agentPositions["b"].x);
        expect(layout.agentPositions["d"].x).toBe(layout.agentPositions["c"].x + AGENT_CARD_WIDTH + TOPOLOGY_GAP_X);
        expect(layout.edgeVias["a->t1::g"]).toHaveLength(1);
        const bottomOfB = layout.agentPositions["b"].y + layout.cardHeights["b"];
        const centreOfSplit = layout.splitPositions["t1::g"].y + SPLIT_SIZE / 2;
        expect(centreOfSplit).toBeGreaterThan(layout.agentPositions["b"].y);
        expect(centreOfSplit).toBeLessThan(layout.agentPositions["c"].y + layout.cardHeights["c"]);
        expect(bottomOfB).toBeLessThanOrEqual(layout.agentPositions["c"].y);
    });

    it("keeps the agents under one split adjacent when a sibling from the same parent would fall between them", () => {
        const split: TopologySplitNode = { id: "t1::g", kind: "if", triggerId: "t1", parentId: "x", depth: 1 };
        const graph = graphOf(
            [agent("x"), agent("alpha"), agent("beta"), agent("gamma")],
            [trigger("t1")],
            [edge("t1", "x"), edge("x", "t1::g", "stem"), edge("t1::g", "alpha"), edge("t1::g", "gamma"), edge("x", "beta", "delegation")],
            [split]
        );
        const layout = layoutTopology(graph);
        const y = (id: string) => layout.agentPositions[id].y;
        expect(Math.abs(y("gamma") - y("alpha"))).toBe(layout.cardHeights["alpha"] + TOPOLOGY_GAP_Y);
        expect(y("beta") < Math.min(y("alpha"), y("gamma")) || y("beta") > Math.max(y("alpha"), y("gamma"))).toBe(true);
    });

    it("orders the agents under one split by their calls' source order, not by name", () => {
        const split: TopologySplitNode = { id: "t1::g", kind: "if", triggerId: "t1", parentId: "t1", depth: 1 };
        const graph = graphOf(
            [agent("archive"), agent("escalate")],
            [trigger("t1")],
            [edge("t1", "t1::g", "stem"), edge("t1::g", "escalate"), edge("t1::g", "archive")],
            [split]
        );
        const layout = layoutTopology(graph);
        expect(layout.agentPositions["escalate"].y).toBeLessThan(layout.agentPositions["archive"].y);
    });

    it("widens only the trigger gap for a split; agent columns keep the regular gap", () => {
        const split: TopologySplitNode = { id: "t1::split", kind: "match", triggerId: "t1", parentId: "t1", depth: 1 };
        const graph = graphOf(
            [agent("a1"), agent("b1")],
            [trigger("t1")],
            [edge("t1", "t1::split", "stem"), edge("t1::split", "a1"), edge("a1", "b1", "delegation")],
            [split]
        );
        const layout = layoutTopology(graph);
        expect(layout.agentPositions["b1"].x - layout.agentPositions["a1"].x).toBe(AGENT_CARD_WIDTH + TOPOLOGY_GAP_X);
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
        expect(vias[0]).toEqual({ x: b.x - 40, y: layout.triggerPositions["t1"].y + TRIGGER_SIZE / 2 });
        expect(vias[1]).toEqual({ x: b.x - 40, y: arrival });
        const [short] = layout.edgeVias["t2->a"];
        expect(short.x).toBeGreaterThan(layout.triggerPositions["t2"].x + TRIGGER_NODE_WIDTH);
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
        expect(vias[0].x).toBeGreaterThan(layout.triggerPositions["t1"].x + TRIGGER_NODE_WIDTH);
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
        expect(vias[0].y).toBe(layout.triggerPositions["t1"].y + TRIGGER_SIZE / 2);
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

    it("starts the drawn bounds where a short trigger label starts, not at the blank label block", () => {
        const short = layoutTopology(graphOf([agent("a1")], [trigger("t1", { label1: "main" })], [edge("t1", "a1")]));
        expect(short.left).toBeGreaterThan(0);
        expect(short.left).toBeLessThan(TRIGGER_LABEL_WIDTH);
        expect(short.left + short.width).toBe(short.agentPositions["a1"].x + AGENT_CARD_WIDTH);
        const long = layoutTopology(graphOf([agent("a1")], [trigger("t1", { label2: "HTTP Service · /customer-support-desk" })], [edge("t1", "a1")]));
        expect(long.left).toBe(0);
        const untriggered = layoutTopology(graphOf([agent("a1", { orphan: true })], [], []));
        expect(untriggered.left).toBe(0);
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
        const triggerCentres = [layout.triggerPositions["t1"].y, layout.triggerPositions["t2"].y].map((y) => y + TRIGGER_SIZE / 2);
        expect((triggerCentres[0] + triggerCentres[1]) / 2).toBeCloseTo(agentCentre);
        expect(Math.min(...Object.values(layout.triggerPositions).map((p) => p.y), ...Object.values(layout.agentPositions).map((p) => p.y))).toBe(0);
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

    it("wraps a branch that runs an earlier agent again below the cards, like any back edge (evaluator_optimizer shape)", () => {
        const split: TopologySplitNode = { id: "t1::g", kind: "if", triggerId: "t1", parentId: "b", depth: 1 };
        const graph = graphOf(
            [agent("a"), agent("b")],
            [trigger("t1")],
            [edge("t1", "a"), edge("a", "b"), edge("b", "t1::g", "stem"), edge("t1::g", "a")],
            [split]
        );
        const layout = layoutTopology(graph);
        const retry = layout.edgeVias["t1::g->a"];
        const bottom = Math.max(layout.agentPositions["a"].y + layout.cardHeights["a"], layout.agentPositions["b"].y + layout.cardHeights["b"]);
        expect(retry).toHaveLength(4);
        expect(retry[0].x).toBeGreaterThan(layout.splitPositions["t1::g"].x);
        expect(retry[1].y).toBeGreaterThan(bottom);
        expect(retry[3].x).toBeLessThan(layout.agentPositions["a"].x);
        expect(layout.edgeVias["b->t1::g"]).toHaveLength(1);
        expect(layout.edgeBows["t1->a"]).toBe(0);
    });

    it("lengthens a wrapped branch's first leg to hold its pill, within the gap the split already widened", () => {
        const split: TopologySplitNode = { id: "t1::g", kind: "if", triggerId: "t1", parentId: "b", depth: 1 };
        const retry = { ...edge("t1::g", "a"), chips: [{ kind: "condition" as const, text: "scoreOf(verdict) < 90" }] };
        const edges = (back: TopologyEdge) => [edge("t1", "a"), edge("a", "b"), edge("b", "t1::g", "stem"), back];
        const plain = layoutTopology(graphOf([agent("a"), agent("b")], [trigger("t1")], edges(edge("t1::g", "a")), [split]));
        const layout = layoutTopology(graphOf([agent("a"), agent("b")], [trigger("t1")], edges(retry), [split]));
        const splitRight = layout.splitPositions["t1::g"].x + SPLIT_SIZE;
        expect(layout.edgeVias["t1::g->a"][0].x - splitRight).toBeGreaterThan(plain.edgeVias["t1::g->a"][0].x - splitRight + 100);
        expect(layout.edgeVias["t1::g->a"][0].x).toBeLessThan(layout.agentPositions["b"].x + AGENT_CARD_WIDTH + SPLIT_GAP_X_MIN);
        expect(layout.agentPositions).toEqual(plain.agentPositions);
    });

    it("boxes a loop's body from the loop node past its deepest member, and starts the exit edge on the box's far edge", () => {
        const loop: TopologySplitNode = { id: "t1::L", kind: "foreach", triggerId: "t1", parentId: "t1", depth: 1, header: "x in xs", members: ["a"] };
        const exit: TopologyEdge = { id: "t1::L->>b", sourceId: "t1::L", targetId: "b", kind: "exit", chips: [] };
        const graph = graphOf([agent("a"), agent("b")], [trigger("t1")], [edge("t1", "t1::L", "stem"), edge("t1::L", "a"), exit], [loop]);
        const layout = layoutTopology(graph);
        const box = layout.loopBoxes["t1::L"];
        const a = layout.agentPositions["a"];
        const loopPos = layout.splitPositions["t1::L"];
        expect(box.x).toBe(loopPos.x + SPLIT_SIZE / 2);
        expect(box.x + box.width).toBe(a.x + AGENT_CARD_WIDTH + LOOP_BOX_PAD);
        expect(box.y).toBe(a.y - LOOP_BOX_PAD - LOOP_BOX_CAPTION);
        expect(box.y + box.height).toBe(a.y + layout.cardHeights["a"] + LOOP_BOX_PAD);
        // The step after the loop sits in the next column and its edge leaves the box, level with the loop node.
        expect(layout.agentPositions["b"].x).toBe(a.x + AGENT_CARD_WIDTH + TOPOLOGY_GAP_X);
        expect(layout.edgeStarts["t1::L->>b"]).toEqual({ x: box.x + box.width, y: loopPos.y + SPLIT_SIZE / 2 });
        expect(layout.edgeVias["t1::L->>b"][0].x).toBeGreaterThan(box.x + box.width);
        expect(layout.edgeVias["t1::L->>b"][0].x).toBeLessThan(layout.agentPositions["b"].x);
        expect(layout.agentPositions["b"].y).toBe(a.y);
    });

    it("places a split that continues after a loop a stem past the loop's box, its agents in the next column", () => {
        const loop: TopologySplitNode = { id: "t1::L", kind: "while", triggerId: "t1", parentId: "t1", depth: 1, header: "more", members: ["a"] };
        const cond: TopologySplitNode = { id: "t1::I", kind: "if", triggerId: "t1", parentId: "t1::L", depth: 2 };
        const exit: TopologyEdge = { id: "t1::L->>t1::I", sourceId: "t1::L", targetId: "t1::I", kind: "exit", chips: [] };
        const graph = graphOf(
            [agent("a"), agent("b"), agent("c")],
            [trigger("t1")],
            [edge("t1", "t1::L", "stem"), edge("t1::L", "a"), exit, edge("t1::I", "b"), edge("t1::I", "c")],
            [loop, cond]
        );
        const layout = layoutTopology(graph);
        const box = layout.loopBoxes["t1::L"];
        expect(layout.splitPositions["t1::I"].x).toBe(box.x + box.width + SPLIT_STEM_X);
        expect(layout.agentPositions["b"].x).toBe(layout.agentPositions["a"].x + AGENT_CARD_WIDTH + SPLIT_GAP_X_MIN);
        expect(layout.agentPositions["c"].x).toBe(layout.agentPositions["b"].x);
        expect(layout.edgeStarts["t1::L->>t1::I"].x).toBe(box.x + box.width);
        expect(layout.loopBoxes["t1::I"]).toBeUndefined();
    });

    it("nests an inner loop's box inside the outer one with padding on every side", () => {
        const outer: TopologySplitNode = { id: "t1::O", kind: "foreach", triggerId: "t1", parentId: "t1", depth: 1, header: "x in xs", members: ["t1::I", "a"] };
        const inner: TopologySplitNode = { id: "t1::I", kind: "foreach", triggerId: "t1", parentId: "t1::O", depth: 2, header: "y in x", members: ["a"] };
        const graph = graphOf([agent("a")], [trigger("t1")], [edge("t1", "t1::O", "stem"), edge("t1::O", "t1::I", "stem"), edge("t1::I", "a")], [outer, inner]);
        const layout = layoutTopology(graph);
        const o = layout.loopBoxes["t1::O"];
        const i = layout.loopBoxes["t1::I"];
        expect(o.x).toBeLessThan(i.x);
        expect(o.y).toBe(i.y - LOOP_BOX_PAD - LOOP_BOX_CAPTION);
        expect(o.x + o.width).toBe(i.x + i.width + LOOP_BOX_PAD);
        expect(o.y + o.height).toBe(i.y + i.height + LOOP_BOX_PAD);
        expect(i.x).toBe(layout.splitPositions["t1::I"].x + SPLIT_SIZE / 2);
    });

    it("does not box a loop whose body runs an agent placed before the loop node (a; foreach { a })", () => {
        const loop: TopologySplitNode = { id: "t1::L", kind: "foreach", triggerId: "t1", parentId: "a", depth: 1, header: "x in xs", members: ["a"] };
        const graph = graphOf([agent("a")], [trigger("t1")], [edge("t1", "a"), edge("a", "t1::L", "stem"), edge("t1::L", "a")], [loop]);
        const layout = layoutTopology(graph);
        expect(layout.loopBoxes).toEqual({});
        expect(layout.edgeStarts).toEqual({});
        expect(layout.edgeVias["t1::L->a"].length).toBeGreaterThanOrEqual(2);
        Object.values(layout.agentPositions).forEach((position) => expect(Number.isFinite(position.y)).toBe(true));
    });

    it("moves a card from another handler out of a loop's box (event_pipeline shape)", () => {
        const loop: TopologySplitNode = { id: "t1::L", kind: "foreach", triggerId: "t1", parentId: "t1", depth: 1, header: "rec in records", members: ["e", "t1::I", "s", "r"] };
        const cond: TopologySplitNode = { id: "t1::I", kind: "if", triggerId: "t1", parentId: "e", depth: 1 };
        const graph = graphOf(
            [agent("e"), agent("s"), agent("r"), agent("d")],
            [trigger("t1"), trigger("t2")],
            [edge("t1", "t1::L", "stem"), edge("t1::L", "e"), edge("e", "t1::I", "stem"), edge("t1::I", "s"), edge("t1::I", "r"), edge("t2", "d")],
            [loop, cond]
        );
        const layout = layoutTopology(graph);
        const box = layout.loopBoxes["t1::L"];
        const d = layout.agentPositions["d"];
        expect(d.x).toBe(layout.agentPositions["e"].x);
        expect(d.y).toBeGreaterThanOrEqual(box.y + box.height + TOPOLOGY_GAP_Y);
        ["e", "s", "r"].forEach((id) => {
            expect(layout.agentPositions[id].y).toBeGreaterThan(box.y);
            expect(layout.agentPositions[id].y + layout.cardHeights[id]).toBeLessThan(box.y + box.height);
        });
        expect(layout.height).toBeGreaterThanOrEqual(d.y + layout.cardHeights["d"]);
    });

    it("leaves two loops that share a member overlapping instead of pushing each other apart", () => {
        const l1: TopologySplitNode = { id: "t1::L", kind: "foreach", triggerId: "t1", parentId: "t1", depth: 1, header: "x in xs", members: ["a", "b"] };
        const l2: TopologySplitNode = { id: "t2::L", kind: "while", triggerId: "t2", parentId: "t2", depth: 1, header: "more", members: ["b", "c"] };
        const graph = graphOf(
            [agent("a"), agent("b"), agent("c")],
            [trigger("t1"), trigger("t2")],
            [edge("t1", "t1::L", "stem"), edge("t1::L", "a"), edge("t1::L", "b"), edge("t2", "t2::L", "stem"), edge("t2::L", "b"), edge("t2::L", "c")],
            [l1, l2]
        );
        const layout = layoutTopology(graph);
        const ys = ["a", "b", "c"].map((id) => layout.agentPositions[id].y).sort((p, q) => p - q);
        expect(ys[1] - ys[0]).toBe(AGENT_CARD_MIN_HEIGHT + TOPOLOGY_GAP_Y);
        expect(ys[2] - ys[1]).toBe(AGENT_CARD_MIN_HEIGHT + TOPOLOGY_GAP_Y);
        expect(Object.keys(layout.loopBoxes).sort()).toEqual(["t1::L", "t2::L"]);
    });

    it("keeps two handlers' boxes a gap apart and each loop node centred on its own body (batch_triage shape)", () => {
        const l1: TopologySplitNode = { id: "t1::L", kind: "foreach", triggerId: "t1", parentId: "t1", depth: 1, header: "ticket in tickets", members: ["a"] };
        const l2: TopologySplitNode = { id: "t2::L", kind: "while", triggerId: "t2", parentId: "t2", depth: 1, header: "attempts < 3", members: ["b"] };
        const graph = graphOf(
            [agent("a"), agent("b")],
            [trigger("t1"), trigger("t2")],
            [edge("t1", "t1::L", "stem"), edge("t1::L", "a"), edge("t2", "t2::L", "stem"), edge("t2::L", "b")],
            [l1, l2]
        );
        const layout = layoutTopology(graph);
        const first = layout.loopBoxes["t1::L"];
        const second = layout.loopBoxes["t2::L"];
        expect(second.y).toBe(first.y + first.height + TOPOLOGY_GAP_Y);
        // A loop node sits on its box's border, so it is never mistaken for an intruder into its own box.
        const centres = (id: string) => layout.splitPositions[id].y + SPLIT_SIZE / 2;
        expect(centres("t1::L")).toBeCloseTo(layout.agentPositions["a"].y + layout.cardHeights["a"] / 2);
        expect(centres("t2::L")).toBeCloseTo(layout.agentPositions["b"].y + layout.cardHeights["b"] / 2);
        // The trigger runs nothing else, so it follows the body it feeds.
        expect(layout.triggerPositions["t2"].y + TRIGGER_SIZE / 2).toBeCloseTo(centres("t2::L"));
    });

    it("evicts a card of an overlapping box but leaves the card the two loops share where it is", () => {
        const l1: TopologySplitNode = { id: "t1::L", kind: "foreach", triggerId: "t1", parentId: "t1", depth: 1, header: "x in xs", members: ["shared", "own"] };
        const l2: TopologySplitNode = { id: "t2::L", kind: "foreach", triggerId: "t2", parentId: "t2", depth: 1, header: "y in ys", members: ["shared", "other"] };
        const graph = graphOf(
            [agent("own"), agent("shared"), agent("other")],
            [trigger("t1"), trigger("t2")],
            [
                edge("t1", "t1::L", "stem"), edge("t1::L", "own"), edge("own", "shared"),
                edge("t2", "t2::L", "stem"), edge("t2::L", "other"), edge("t2::L", "shared"),
            ],
            [l1, l2]
        );
        const layout = layoutTopology(graph);
        const first = layout.loopBoxes["t1::L"];
        // `other` is drawn in the second loop's box but not in the first, so it leaves the first's rows.
        expect(layout.agentPositions["other"].y).toBeGreaterThanOrEqual(first.y + first.height);
        expect(layout.agentPositions["shared"].y).toBeGreaterThan(first.y);
        expect(layout.agentPositions["shared"].y + layout.cardHeights["shared"]).toBeLessThan(first.y + first.height);
        // The shared card is genuinely in both loops, so both boxes hold it and overlap over its row.
        const second = layout.loopBoxes["t2::L"];
        expect(layout.agentPositions["shared"].y).toBeGreaterThan(second.y);
        expect(Math.min(first.y + first.height, second.y + second.height)).toBeGreaterThan(Math.max(first.y, second.y));
    });

    it("keeps the step after an inner loop outside that box and inside the outer one", () => {
        const outer: TopologySplitNode = { id: "t1::O", kind: "foreach", triggerId: "t1", parentId: "t1", depth: 1, header: "o in os", members: ["t1::I", "a", "b"] };
        const inner: TopologySplitNode = { id: "t1::I", kind: "foreach", triggerId: "t1", parentId: "t1::O", depth: 2, header: "i in o", members: ["a"] };
        const innerExit: TopologyEdge = { id: "t1::I->>b", sourceId: "t1::I", targetId: "b", kind: "exit", chips: [] };
        const outerExit: TopologyEdge = { id: "t1::O->>c", sourceId: "t1::O", targetId: "c", kind: "exit", chips: [] };
        const graph = graphOf(
            [agent("a"), agent("b"), agent("c")],
            [trigger("t1")],
            [edge("t1", "t1::O", "stem"), edge("t1::O", "t1::I", "stem"), edge("t1::I", "a"), innerExit, outerExit],
            [outer, inner]
        );
        const layout = layoutTopology(graph);
        const o = layout.loopBoxes["t1::O"];
        const i = layout.loopBoxes["t1::I"];
        const right = (id: string) => layout.agentPositions[id].x + AGENT_CARD_WIDTH;
        expect(layout.agentPositions["b"].x).toBeGreaterThan(i.x + i.width);
        expect(right("b")).toBeLessThan(o.x + o.width);
        expect(layout.agentPositions["c"].x).toBeGreaterThan(o.x + o.width);
        expect(layout.edgeStarts["t1::I->>b"].x).toBe(i.x + i.width);
        expect(layout.edgeStarts["t1::O->>c"].x).toBe(o.x + o.width);
    });

    it("wraps a loop's exit back into an agent that also runs inside it, from the box's far edge", () => {
        const loop: TopologySplitNode = { id: "t1::L", kind: "while", triggerId: "t1", parentId: "t1", depth: 1, header: "more", members: ["x"] };
        const exit: TopologyEdge = { id: "t1::L->>x", sourceId: "t1::L", targetId: "x", kind: "exit", chips: [] };
        const graph = graphOf([agent("x")], [trigger("t1")], [edge("t1", "t1::L", "stem"), edge("t1::L", "x"), exit], [loop]);
        const layout = layoutTopology(graph);
        const box = layout.loopBoxes["t1::L"];
        const vias = layout.edgeVias["t1::L->>x"];
        expect(vias).toHaveLength(4);
        expect(vias[0].x).toBeGreaterThan(box.x + box.width);
        expect(vias[1].y).toBeGreaterThan(box.y + box.height);
        expect(vias[3].x).toBeLessThan(layout.agentPositions["x"].x);
        expect(layout.edgeBows["t1::L->x"] ?? 0).toBe(0);
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
        expect(layout.triggerPositions["t2"].y - layout.triggerPositions["t1"].y).toBeGreaterThanOrEqual(TRIGGER_SIZE);
    });
});

describe("layoutTopology (vertical)", () => {
    const vertical = { orientation: "vertical" as const };

    it("puts triggers in the top row and ranks agents downwards", () => {
        const graph = graphOf([agent("a1"), agent("a2")], [trigger("t1")], [edge("t1", "a1"), edge("a1", "a2", "delegation")]);
        const layout = layoutTopology(graph, vertical);
        expect(layout.triggerPositions["t1"].y).toBe(0);
        expect(layout.agentPositions["a1"].y).toBe(TRIGGER_STACKED_HEIGHT + TOPOLOGY_ROW_GAP);
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
        expect(layout.triggerPositions["t1"].x + TRIGGER_LABEL_WIDTH / 2).toBeCloseTo(parentCentre);
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

    it("keeps vertical splits far enough apart for their labels, and each trigger over its own split", () => {
        const splits: TopologySplitNode[] = [
            { id: "t1::L", kind: "foreach", triggerId: "t1", parentId: "t1", depth: 1, header: "item in payload.orders" },
            { id: "t2::W", kind: "while", triggerId: "t2", parentId: "t2", depth: 1, header: "attempts < 3" },
        ];
        const graph = graphOf(
            [agent("a1"), agent("a2")],
            [trigger("t1"), trigger("t2")],
            [edge("t1", "t1::L", "stem"), edge("t1::L", "a1"), edge("t1::L", "a2"), edge("t2", "t2::W", "stem"), edge("t2::W", "a1"), edge("t2::W", "a2")],
            splits
        );
        const layout = layoutTopology(graph, vertical);
        const loop = layout.splitPositions["t1::L"];
        const loopWhile = layout.splitPositions["t2::W"];
        expect(Math.abs(loopWhile.x - loop.x)).toBeGreaterThanOrEqual(SPLIT_SIZE + SPLIT_LABEL_GAP_Y);
        expect(layout.triggerPositions["t1"].x + TRIGGER_LABEL_WIDTH / 2).toBeCloseTo(loop.x + SPLIT_SIZE / 2);
        expect(layout.triggerPositions["t2"].x + TRIGGER_LABEL_WIDTH / 2).toBeCloseTo(loopWhile.x + SPLIT_SIZE / 2);
    });

    it("bends a stem halfway to its split, whatever the trigger's stagger slot (event_pipeline shape)", () => {
        const split: TopologySplitNode = { id: "t3::w", kind: "while", triggerId: "t3", parentId: "t3", depth: 1 };
        const graph = graphOf(
            [agent("a"), agent("b"), agent("c")],
            [trigger("t1"), trigger("t2"), trigger("t3")],
            [edge("t1", "a"), edge("t2", "b"), edge("t3", "t3::w", "stem"), edge("t3::w", "c")],
            [split]
        );
        const layout = layoutTopology(graph, { orientation: "vertical" });
        const triggerBottom = layout.triggerPositions["t3"].y + TRIGGER_STACKED_HEIGHT;
        expect(layout.edgeVias["t3->t3::w"][0].y).toBe(triggerBottom + SPLIT_STEM_Y / 2);
        expect(layout.edgeVias["t3->t3::w"][0].y).toBeLessThan(layout.splitPositions["t3::w"].y);
    });

    it("boxes a loop body below the loop node and starts the exit on the box's bottom edge", () => {
        const loop: TopologySplitNode = { id: "t1::L", kind: "foreach", triggerId: "t1", parentId: "t1", depth: 1, header: "x in xs", members: ["a"] };
        const exit: TopologyEdge = { id: "t1::L->>b", sourceId: "t1::L", targetId: "b", kind: "exit", chips: [] };
        const graph = graphOf([agent("a"), agent("b")], [trigger("t1")], [edge("t1", "t1::L", "stem"), edge("t1::L", "a"), exit], [loop]);
        const layout = layoutTopology(graph, vertical);
        const box = layout.loopBoxes["t1::L"];
        const a = layout.agentPositions["a"];
        const loopPos = layout.splitPositions["t1::L"];
        expect(box.y).toBe(loopPos.y + SPLIT_SIZE / 2);
        expect(box.x).toBe(a.x - LOOP_BOX_PAD);
        expect(box.x + box.width).toBe(a.x + AGENT_CARD_WIDTH + LOOP_BOX_PAD);
        expect(box.y + box.height).toBe(a.y + layout.cardHeights["a"] + LOOP_BOX_PAD);
        expect(layout.agentPositions["b"].y).toBeGreaterThan(box.y + box.height);
        expect(layout.edgeStarts["t1::L->>b"]).toEqual({ x: loopPos.x + SPLIT_SIZE / 2, y: box.y + box.height });
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
