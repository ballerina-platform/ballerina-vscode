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
    LAYOUT_FIT_MARGIN,
    SPLIT_GAP_X_MIN,
    SPLIT_GAP_Y_MIN,
    SPLIT_LABEL_GAP_Y,
    SPLIT_SIZE,
    SPLIT_STEM_X,
    SPLIT_STEM_Y,
    SPLIT_STEP_X,
    SPLIT_STEP_Y,
    TOPOLOGY_COLUMN_GAP,
    TOPOLOGY_GAP_X,
    TOPOLOGY_GAP_X_MAX,
    TOPOLOGY_GAP_Y,
    TOPOLOGY_ROW_GAP,
    TRIGGER_LABEL_WIDTH,
    TRIGGER_NODE_WIDTH,
    TRIGGER_SIZE,
    TRIGGER_STACKED_HEIGHT,
} from "../../resources/constants";
import { LayoutOptions, NodePosition, TopologyEdge, TopologyGraph, TopologyLayout, TopologyTriggerNode } from "./types";

const CHIPS_PER_ROW = 6;
const CHIP_ROW_HEIGHT = 28;
const ORPHAN_FOOTER_HEIGHT = 26;
const LABEL1_CHAR_WIDTH = 8.5;
const LABEL2_CHAR_WIDTH = 7.2;
const LANE_CLEARANCE = 28;
const LANE_LEAD = 24;
const BEND_OFFSET = 40;
const BEND_STAGGER = 14;

export function estimateAgentCardHeight(chipCount: number, orphan = false): number {
    const extraRows = chipCount <= CHIPS_PER_ROW ? 0 : Math.ceil((chipCount - CHIPS_PER_ROW) / CHIPS_PER_ROW);
    return AGENT_CARD_MIN_HEIGHT + extraRows * CHIP_ROW_HEIGHT + (orphan ? ORPHAN_FOOTER_HEIGHT : 0);
}

// Trigger labels are right-aligned in a fixed block; short labels leave its left part blank.
export function triggerLabelSlack(triggers: TopologyTriggerNode[]): number {
    const widths = triggers.map((t) => Math.max(t.label1.length * LABEL1_CHAR_WIDTH, t.label2.length * LABEL2_CHAR_WIDTH));
    return Math.max(0, TRIGGER_LABEL_WIDTH - Math.ceil(Math.max(0, ...widths)));
}

type Adjacency = Map<string, string[]>;

// Sources in one layer would otherwise share a bus line; stagger their bends so fans stay apart.
function bendOffsets(layers: string[][], placement: Placement): Map<string, number> {
    const offsets = new Map<string, number>();
    layers.forEach((ids) =>
        [...ids]
            .sort((a, b) => placement.cross.get(a) - placement.cross.get(b))
            .forEach((id, k) => offsets.set(id, BEND_OFFSET + (k % 3) * BEND_STAGGER))
    );
    return offsets;
}

// An edge that skips a rank runs straight through it at its target's cross position.
function skipsRanks(edge: TopologyEdge, rank: Map<string, number>): boolean {
    return (rank.get(edge.targetId) ?? 0) - (rank.get(edge.sourceId) ?? 0) > 1;
}

function laneCentres(column: number, longEdges: TopologyEdge[], rank: Map<string, number>, placement: Placement): number[] {
    return longEdges
        .filter((edge) => rank.get(edge.sourceId) < column && column < rank.get(edge.targetId))
        .map((edge) => centre(edge.targetId, placement))
        .sort((a, b) => a - b);
}

// Nodes that would sit under a lane move past it, and the nodes after them follow.
function avoidLanes(ids: string[], lanes: number[], placement: Placement, gap = placement.gap): void {
    const ordered = [...ids].sort((a, b) => placement.cross.get(a) - placement.cross.get(b));
    let cursor = -Infinity;
    ordered.forEach((id) => {
        let top = Math.max(placement.cross.get(id), cursor);
        const bottom = () => top + placement.sizes[id];
        lanes.forEach((lane) => {
            if (top < lane + LANE_CLEARANCE && bottom() > lane - LANE_CLEARANCE) {
                top = lane + LANE_CLEARANCE;
            }
        });
        placement.cross.set(id, top);
        cursor = bottom() + gap;
    });
}

// Edges from shallower sources to deeper targets run through a split layer at their target's cross position.
function passingLanes(depth: number, graph: TopologyGraph, depthOf: (id: string) => number, placement: Placement): number[] {
    return graph.edges
        .filter((edge) => depthOf(edge.sourceId) < depth && depthOf(edge.targetId) > depth)
        .map((edge) => centre(edge.targetId, placement))
        .sort((a, b) => a - b);
}

interface Gaps {
    trigger: number;
    agent: number;
}

// Positions along the cross axis (y when horizontal, x when vertical) with each node's size on that axis.
interface Placement {
    cross: Map<string, number>;
    sizes: Record<string, number>;
    gap: number;
}

interface Extent {
    width: number;
    height: number;
}

// Everything the orientation decides: node extents, the gap between siblings, and where each rank
// (and each split depth) sits along the flow axis.
interface Frame {
    vertical: boolean;
    crossGap: number;
    splitGap: number;
    extents: Record<string, Extent>;
    main(rank: number): number;
    splitMain(depth: number): number;
}

function crossSizes(frame: Frame): Record<string, number> {
    const sizes: Record<string, number> = {};
    Object.entries(frame.extents).forEach(([id, extent]) => (sizes[id] = frame.vertical ? extent.width : extent.height));
    return sizes;
}

// Splits are drawn between a trigger and its agents but are not a rank of their own: for
// ranking and centring, an edge leaving a split counts as leaving the trigger it belongs to.
function collapseSplits(graph: TopologyGraph): TopologyEdge[] {
    const triggerOfSplit = new Map(graph.splits.map((split) => [split.id, split.triggerId]));
    return graph.edges
        .filter((edge) => edge.kind !== "stem")
        .map((edge) => ({ ...edge, sourceId: triggerOfSplit.get(edge.sourceId) ?? edge.sourceId }));
}

function adjacency(edges: TopologyEdge[], from: "sourceId" | "targetId", to: "sourceId" | "targetId"): Adjacency {
    const map: Adjacency = new Map();
    edges.forEach((edge) => {
        const list = map.get(edge[from]) ?? [];
        list.push(edge[to]);
        map.set(edge[from], list);
    });
    return map;
}

// Bounded Bellman-Ford relaxation so a delegation cycle converges instead of looping.
function relaxRanks(rank: Map<string, number>, edges: TopologyEdge[], bound: number): void {
    for (let i = 0; i < bound; i++) {
        let changed = false;
        for (const edge of edges) {
            const sourceRank = rank.get(edge.sourceId);
            if (sourceRank === undefined) {
                continue;
            }
            const candidate = sourceRank + 1;
            if (candidate > (rank.get(edge.targetId) ?? -1)) {
                rank.set(edge.targetId, candidate);
                changed = true;
            }
        }
        if (!changed) {
            return;
        }
    }
}

// Rank = longest path from a trigger. Agents nothing reaches start in the first agent rank
// and pull their own delegates along, so an untriggered supervisor still fans out.
function computeRanks(graph: TopologyGraph, edges: TopologyEdge[]): Map<string, number> {
    const rank = new Map<string, number>();
    const bound = graph.agents.length + graph.triggers.length + 1;
    graph.triggers.forEach((trigger) => rank.set(trigger.id, 0));
    relaxRanks(rank, edges, bound);
    graph.agents.forEach((agent) => {
        if (!rank.has(agent.id)) {
            rank.set(agent.id, 1);
        }
    });
    relaxRanks(rank, edges, bound);
    return rank;
}

// Columns spread across the canvas when there is room, but never closer than the default gap
// and never so far apart that the edges turn into long flat lines.
function resolveGapX(columnCount: number, availableWidth: number | undefined): number {
    if (!availableWidth || columnCount < 2) {
        return TOPOLOGY_GAP_X;
    }
    const columnsWidth = TRIGGER_NODE_WIDTH + (columnCount - 1) * AGENT_CARD_WIDTH;
    const free = availableWidth - 2 * LAYOUT_FIT_MARGIN - columnsWidth;
    return Math.max(TOPOLOGY_GAP_X, Math.min(TOPOLOGY_GAP_X_MAX, Math.floor(free / (columnCount - 1))));
}

function splitDepthOf(graph: TopologyGraph): number {
    return Math.max(0, ...graph.splits.map((split) => split.depth));
}

// Splits need their stem, one step per nesting level and room for the pills before the agent column.
function resolveGaps(graph: TopologyGraph, columnCount: number, availableWidth: number | undefined): Gaps {
    const agent = resolveGapX(columnCount, availableWidth);
    const depth = splitDepthOf(graph);
    const trigger = depth ? Math.max(agent, SPLIT_GAP_X_MIN + (depth - 1) * SPLIT_STEP_X) : agent;
    return { trigger, agent };
}

function splitX(depth: number): number {
    return TRIGGER_NODE_WIDTH + SPLIT_STEM_X + (depth - 1) * SPLIT_STEP_X;
}

function columnX(rank: number, gaps: Gaps): number {
    if (rank <= 0) {
        return 0;
    }
    return TRIGGER_NODE_WIDTH + gaps.trigger + (rank - 1) * (AGENT_CARD_WIDTH + gaps.agent);
}

function horizontalFrame(graph: TopologyGraph, cardHeights: Record<string, number>, columnCount: number, availableWidth?: number): Frame {
    const gaps = resolveGaps(graph, columnCount, availableWidth);
    const extents: Record<string, Extent> = {};
    graph.agents.forEach((agent) => (extents[agent.id] = { width: AGENT_CARD_WIDTH, height: cardHeights[agent.id] }));
    graph.triggers.forEach((trigger) => (extents[trigger.id] = { width: TRIGGER_NODE_WIDTH, height: TRIGGER_SIZE }));
    graph.splits.forEach((split) => (extents[split.id] = { width: SPLIT_SIZE, height: SPLIT_SIZE }));
    return { vertical: false, crossGap: TOPOLOGY_GAP_Y, splitGap: TOPOLOGY_GAP_Y, extents, main: (rank) => columnX(rank, gaps), splitMain: splitX };
}

// Rows are as tall as their tallest card; the trigger row leaves room for split stems and pills.
function verticalFrame(graph: TopologyGraph, cardHeights: Record<string, number>, rank: Map<string, number>): Frame {
    const extents: Record<string, Extent> = {};
    const rowDepth = new Map<number, number>();
    graph.agents.forEach((agent) => {
        extents[agent.id] = { width: AGENT_CARD_WIDTH, height: cardHeights[agent.id] };
        const r = rank.get(agent.id) ?? 1;
        rowDepth.set(r, Math.max(rowDepth.get(r) ?? 0, cardHeights[agent.id]));
    });
    graph.triggers.forEach((trigger) => (extents[trigger.id] = { width: TRIGGER_LABEL_WIDTH, height: TRIGGER_STACKED_HEIGHT }));
    graph.splits.forEach((split) => (extents[split.id] = { width: SPLIT_SIZE, height: SPLIT_SIZE }));
    const depth = splitDepthOf(graph);
    const triggerGap = depth ? Math.max(TOPOLOGY_ROW_GAP, SPLIT_GAP_Y_MIN + (depth - 1) * SPLIT_STEP_Y) : TOPOLOGY_ROW_GAP;
    const main = (r: number): number => {
        let offset = r > 0 ? TRIGGER_STACKED_HEIGHT + triggerGap : 0;
        for (let k = 1; k < r; k++) {
            offset += (rowDepth.get(k) ?? AGENT_CARD_MIN_HEIGHT) + TOPOLOGY_ROW_GAP;
        }
        return offset;
    };
    const splitMain = (d: number): number => TRIGGER_STACKED_HEIGHT + SPLIT_STEM_Y + (d - 1) * SPLIT_STEP_Y;
    return { vertical: true, crossGap: TOPOLOGY_COLUMN_GAP, splitGap: SPLIT_LABEL_GAP_Y, extents, main, splitMain };
}

function mean(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function centre(id: string, placement: Placement): number {
    return placement.cross.get(id) + placement.sizes[id] / 2;
}

function stack(ids: string[], placement: Placement): void {
    let cursor = 0;
    ids.forEach((id) => {
        placement.cross.set(id, cursor);
        cursor += placement.sizes[id] + placement.gap;
    });
}

// Forward pass: each rank is ordered by where its parents sit, which keeps siblings together
// and edges from crossing. Nodes with no parent (orphans) keep their built order at the end.
function orderRanks(ranks: Map<number, string[]>, maxRank: number, parents: Adjacency, frame: Frame, sizes: Record<string, number>): Placement {
    const provisional: Placement = { cross: new Map(), sizes, gap: frame.crossGap };
    stack(ranks.get(0) ?? [], provisional);
    for (let r = 1; r <= maxRank; r++) {
        const ids = ranks.get(r) ?? [];
        const key = (id: string): number => {
            const placed = (parents.get(id) ?? []).filter((parent) => provisional.cross.has(parent));
            return placed.length ? mean(placed.map((parent) => centre(parent, provisional))) : Number.MAX_SAFE_INTEGER;
        };
        const ordered = ids.map((id, index) => ({ id, index, key: key(id) })).sort((a, b) => a.key - b.key || a.index - b.index);
        ranks.set(r, ordered.map((item) => item.id));
        stack(ranks.get(r), provisional);
    }
    return provisional;
}

interface Wishes {
    desired: Map<string, number>;
    constrained: Set<string>;
}

// Nodes that pushed each other apart move back as one block towards where they wanted to be, so two
// triggers sharing one agent straddle it; the block never climbs into the block before it.
function settleCluster(cluster: string[], wishes: Wishes, final: Placement, gap: number, floor: number): number {
    const wanting = cluster.filter((id) => wishes.constrained.has(id));
    const shift = wanting.length ? mean(wanting.map((id) => wishes.desired.get(id) - final.cross.get(id))) : 0;
    const bounded = Math.max(shift, floor - final.cross.get(cluster[0]));
    cluster.forEach((id) => final.cross.set(id, final.cross.get(id) + bounded));
    const last = cluster[cluster.length - 1];
    return final.cross.get(last) + final.sizes[last] + gap;
}

// Backward pass: a node with children sits at the centre of its children's block; a node
// without keeps its provisional slot. Overlaps push along, cluster by cluster.
function placeRank(ids: string[], children: Adjacency, provisional: Placement, final: Placement, gap = final.gap): void {
    const wishes: Wishes = { desired: new Map(), constrained: new Set() };
    ids.forEach((id) => {
        const placed = (children.get(id) ?? []).filter((child) => final.cross.has(child));
        if (placed.length) {
            wishes.desired.set(id, mean(placed.map((child) => centre(child, final))) - final.sizes[id] / 2);
            wishes.constrained.add(id);
        } else {
            wishes.desired.set(id, provisional.cross.get(id) ?? 0);
        }
    });
    const ordered = ids.map((id, index) => ({ id, index })).sort((a, b) => wishes.desired.get(a.id) - wishes.desired.get(b.id) || a.index - b.index);
    let cursor = -Infinity;
    let floor = -Infinity;
    let cluster: string[] = [];
    ordered.forEach(({ id }) => {
        const want = wishes.desired.get(id);
        if (cluster.length && want >= cursor) {
            floor = settleCluster(cluster, wishes, final, gap, floor);
            cluster = [];
        }
        const top = Math.max(want, cursor);
        final.cross.set(id, top);
        cluster.push(id);
        cursor = top + final.sizes[id] + gap;
    });
    if (cluster.length) {
        settleCluster(cluster, wishes, final, gap, floor);
    }
}

// Top-down: a node whose only parent is a trigger or agent moves under that parent when its row has room,
// so the edge runs straight instead of bending because the parent was pushed aside by a neighbour.
function straightenUnderParents(ranks: Map<number, string[]>, parents: Adjacency, final: Placement, lanesOf: (rank: number) => number[]): void {
    ranks.forEach((ids, r) => {
        if (r === 0) {
            return;
        }
        const row = [...ids].sort((a, b) => final.cross.get(a) - final.cross.get(b));
        const lanes = lanesOf(r);
        row.forEach((id, i) => {
            const only = parents.get(id);
            if (only?.length !== 1) {
                return;
            }
            const want = centre(only[0], final) - final.sizes[id] / 2;
            const low = i > 0 ? final.cross.get(row[i - 1]) + final.sizes[row[i - 1]] + final.gap : -Infinity;
            const high = i < row.length - 1 ? final.cross.get(row[i + 1]) - final.gap - final.sizes[id] : Infinity;
            const clear = lanes.every((lane) => want + final.sizes[id] <= lane - LANE_CLEARANCE || want >= lane + LANE_CLEARANCE);
            if (want >= low && want <= high && clear) {
                final.cross.set(id, want);
            }
        });
    });
}

export function layoutTopology(graph: TopologyGraph, options: LayoutOptions = {}): TopologyLayout {
    const edges = collapseSplits(graph);
    const rank = computeRanks(graph, edges);
    const longEdges = edges.filter((edge) => skipsRanks(edge, rank));

    const cardHeights: Record<string, number> = {};
    graph.agents.forEach((agent) => (cardHeights[agent.id] = estimateAgentCardHeight(agent.chips.length, agent.orphan)));

    const ranks = new Map<number, string[]>();
    [...graph.triggers, ...graph.agents].forEach((node) => {
        const r = rank.get(node.id) ?? 1;
        ranks.set(r, [...(ranks.get(r) ?? []), node.id]);
    });
    const maxRank = Math.max(0, ...ranks.keys());
    const frame = options.orientation === "vertical"
        ? verticalFrame(graph, cardHeights, rank)
        : horizontalFrame(graph, cardHeights, maxRank + 1, options.availableWidth);

    const sizes = crossSizes(frame);
    const provisional = orderRanks(ranks, maxRank, adjacency(edges, "targetId", "sourceId"), frame, sizes);
    const final: Placement = { cross: new Map(), sizes, gap: frame.crossGap };
    // Splits sit between the trigger rank and the first agent rank, so they are placed after the
    // agents (deepest first) and before the triggers, each centred on what it fans out to.
    const children = adjacency(graph.edges, "sourceId", "targetId");
    for (let r = maxRank; r >= 1; r--) {
        placeRank(ranks.get(r) ?? [], children, provisional, final);
        avoidLanes(ranks.get(r) ?? [], laneCentres(r, longEdges, rank, final), final);
    }
    const splitDepth = new Map(graph.splits.map((split) => [split.id, split.depth]));
    const depthOf = (id: string): number => splitDepth.get(id) ?? (rank.get(id) === 0 ? 0 : Infinity);
    for (let d = Math.max(0, ...splitDepth.values()); d >= 1; d--) {
        const layer = [...splitDepth.keys()].filter((id) => splitDepth.get(id) === d);
        placeRank(layer, children, provisional, final, frame.splitGap);
        avoidLanes(layer, passingLanes(d, graph, depthOf, final), final, frame.splitGap);
    }
    placeRank(ranks.get(0) ?? [], children, provisional, final);
    const splitIds = new Set(splitDepth.keys());
    const directParents = adjacency(graph.edges.filter((edge) => !splitIds.has(edge.sourceId)), "targetId", "sourceId");
    straightenUnderParents(ranks, directParents, final, (r) => laneCentres(r, longEdges, rank, final));

    const place = (main: number, cross: number): NodePosition => (frame.vertical ? { x: cross, y: main } : { x: main, y: cross });
    const mainOf = (id: string): number => (splitDepth.has(id) ? frame.splitMain(splitDepth.get(id)) : frame.main(rank.get(id) ?? 1));
    const positions = new Map<string, NodePosition>();
    final.cross.forEach((cross, id) => positions.set(id, place(mainOf(id), cross)));

    const splitLayers = [...new Set(splitDepth.values())].map((d) => [...splitDepth.keys()].filter((id) => splitDepth.get(id) === d));
    const offsets = bendOffsets([...ranks.values(), ...splitLayers], final);
    const longIds = new Set(longEdges.map((edge) => edge.id));
    const triggerOfSplit = new Map(graph.splits.map((split) => [split.id, split.triggerId]));
    const vias = new Map<string, NodePosition>();
    graph.edges.forEach((edge) => {
        const source = edge.sourceId;
        const extent = frame.extents[source];
        const bend = longIds.has(edge.id)
            ? frame.main(rank.get(triggerOfSplit.get(source) ?? source) + 1) - LANE_LEAD
            : mainOf(source) + (frame.vertical ? extent.height : extent.width) + offsets.get(source);
        vias.set(edge.id, place(bend, centre(longIds.has(edge.id) ? edge.targetId : source, final)));
    });
    return collectLayout(graph, positions, vias, frame, cardHeights);
}

function collectLayout(
    graph: TopologyGraph,
    positions: Map<string, NodePosition>,
    vias: Map<string, NodePosition>,
    frame: Frame,
    cardHeights: Record<string, number>
): TopologyLayout {
    const xs = [...positions.values()].map((position) => position.x);
    const ys = [...positions.values()].map((position) => position.y);
    const minX = xs.length ? Math.min(...xs) : 0;
    const minY = ys.length ? Math.min(...ys) : 0;
    const agentIds = new Set(graph.agents.map((agent) => agent.id));
    const splitIds = new Set(graph.splits.map((split) => split.id));
    const agentPositions: Record<string, NodePosition> = {};
    const triggerPositions: Record<string, NodePosition> = {};
    const splitPositions: Record<string, NodePosition> = {};
    const edgeVias: Record<string, NodePosition[]> = {};
    let right = 0;
    let height = 0;
    positions.forEach((position, id) => {
        const normalised = { x: position.x - minX, y: position.y - minY };
        const bucket = agentIds.has(id) ? agentPositions : splitIds.has(id) ? splitPositions : triggerPositions;
        bucket[id] = normalised;
        right = Math.max(right, normalised.x + frame.extents[id].width);
        height = Math.max(height, normalised.y + frame.extents[id].height);
    });
    vias.forEach((via, edgeId) => (edgeVias[edgeId] = [{ x: via.x - minX, y: via.y - minY }]));
    const left = !frame.vertical && graph.triggers.length ? triggerLabelSlack(graph.triggers) : 0;
    return { agentPositions, triggerPositions, splitPositions, cardHeights, edgeVias, left, width: right - left, height };
}
