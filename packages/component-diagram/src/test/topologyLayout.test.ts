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
    SPLIT_GAP_X_MIN,
    SPLIT_LABEL_GAP_Y,
    SPLIT_SIZE,
    SPLIT_STEM_X,
    SPLIT_STEP_X,
    TOPOLOGY_COLUMN_GAP,
    TOPOLOGY_GAP_X,
    TOPOLOGY_GAP_X_MAX,
    TOPOLOGY_ROW_GAP,
    TRIGGER_LABEL_WIDTH,
    TRIGGER_NODE_WIDTH,
    TRIGGER_SIZE,
    TRIGGER_STACKED_HEIGHT,
} from "../resources/constants";
import { estimateAgentCardHeight, layoutTopology } from "../components/AgentTopologyDiagram/topologyLayout";
import { TopologyAgentNode, TopologyEdge, TopologyGraph, TopologySplitNode, TopologyTriggerNode } from "../components/AgentTopologyDiagram/types";

function agent(id: string, extra: Partial<TopologyAgentNode> = {}): TopologyAgentNode {
    return { id, name: id, role: "", toolCount: 0, chips: [], typed: false, orphan: false, filePath: "/proj/agents.bal", position: { line: 1, offset: 0 }, ...extra };
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

    it("re-centres only the triggers that collided, so a lone trigger stays centred on its own agent", () => {
        const tall = agent("a", { chips: Array.from({ length: 42 }, (_, i) => ({ key: `c${i}`, label: `c${i}` })) });
        const graph = graphOf([tall, agent("b")], [trigger("t1"), trigger("t2"), trigger("t3")], [edge("t1", "a"), edge("t2", "a"), edge("t3", "b")]);
        const layout = layoutTopology(graph);
        const centreOf = (y: number, h: number) => y + h / 2;
        const t = (id: string) => centreOf(layout.triggerPositions[id].y, TRIGGER_SIZE);
        expect((t("t1") + t("t2")) / 2).toBeCloseTo(centreOf(layout.agentPositions["a"].y, layout.cardHeights["a"]));
        expect(t("t3")).toBeCloseTo(centreOf(layout.agentPositions["b"].y, layout.cardHeights["b"]));
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

    it("runs a long edge straight through the skipped column at its target's height, moving the card there aside", () => {
        const graph = graphOf(
            [agent("a"), agent("b")],
            [trigger("t1"), trigger("t2")],
            [edge("t1", "b"), edge("t2", "a"), edge("a", "b", "delegation")]
        );
        const layout = layoutTopology(graph);
        const a = layout.agentPositions["a"];
        const b = layout.agentPositions["b"];
        const [via] = layout.edgeVias["t1->b"];
        expect(via.x).toBeLessThan(a.x);
        expect(via.x).toBeGreaterThan(layout.triggerPositions["t1"].x + TRIGGER_NODE_WIDTH);
        expect(via.y).toBeCloseTo(b.y + layout.cardHeights["b"] / 2);
        expect(via.y < a.y || via.y > a.y + layout.cardHeights["a"]).toBe(true);
        const [short] = layout.edgeVias["t2->a"];
        expect(short.x).toBeGreaterThan(layout.triggerPositions["t2"].x + TRIGGER_NODE_WIDTH);
        expect(short.x).toBeLessThan(a.x);
        expect(layout.edgeVias["a->b"][0].x).toBeGreaterThan(a.x + AGENT_CARD_WIDTH);
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

    it("does not hang on a rank cycle and still assigns finite positions", () => {
        const graph = graphOf(
            [agent("a"), agent("b")],
            [],
            [edge("a", "b", "delegation"), edge("b", "a", "delegation")]
        );
        const layout = layoutTopology(graph);
        expect(Number.isFinite(layout.agentPositions["a"].x)).toBe(true);
        expect(Number.isFinite(layout.agentPositions["b"].x)).toBe(true);
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
        expect(estimateAgentCardHeight(0)).toBe(AGENT_CARD_MIN_HEIGHT);
        expect(estimateAgentCardHeight(6)).toBe(AGENT_CARD_MIN_HEIGHT);
        expect(estimateAgentCardHeight(7)).toBeGreaterThan(AGENT_CARD_MIN_HEIGHT);
        expect(estimateAgentCardHeight(0, true)).toBeGreaterThan(AGENT_CARD_MIN_HEIGHT);

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

    it("runs a long edge through the skipped row at its target's x", () => {
        const graph = graphOf(
            [agent("a1"), agent("a2"), agent("a3")],
            [trigger("t1")],
            [edge("t1", "a1"), edge("a1", "a2", "delegation"), edge("a2", "a3", "delegation"), edge("a1", "a3", "delegation")]
        );
        const layout = layoutTopology(graph, vertical);
        const via = layout.edgeVias["a1->a3"][0];
        expect(via.x).toBe(layout.agentPositions["a3"].x + AGENT_CARD_WIDTH / 2);
        expect(via.y).toBeLessThan(layout.agentPositions["a2"].y);
        expect(via.y).toBeGreaterThan(layout.agentPositions["a1"].y);
    });
});
