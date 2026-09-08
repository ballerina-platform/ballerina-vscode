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

const ORPHAN_FOOTER_HEIGHT = 26;
const LABEL1_CHAR_WIDTH = 8.5;
const LABEL2_CHAR_WIDTH = 7.2;
const LANE_CLEARANCE = 28;
const LANE_LEAD = 24;
// How far past the cards a back edge (a delegation cycle) wraps around.
const BACK_EDGE_CLEARANCE = 24;
const BEND_OFFSET = 40;
const BEND_STAGGER = 14;

export function estimateAgentCardHeight(orphan = false): number {
    return AGENT_CARD_MIN_HEIGHT + (orphan ? ORPHAN_FOOTER_HEIGHT : 0);
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
// Edges that cross a split layer at the given flow position, by the cross position they run at.
function passingLanes(main: number, graph: TopologyGraph, mainOf: (id: string) => number, placement: Placement): number[] {
    return graph.edges
        .filter((edge) => mainOf(edge.sourceId) < main && mainOf(edge.targetId) > main)
        .map((edge) => centre(edge.targetId, placement))
        .sort((a, b) => a - b);
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
// (and each split) sits along the flow axis.
interface Frame {
    vertical: boolean;
    crossGap: number;
    splitGap: number;
    extents: Record<string, Extent>;
    main(rank: number): number;
    splitMain(splitId: string): number;
}

// The agent or trigger a split hangs from, through any outer splits.
function splitAnchors(graph: TopologyGraph): Map<string, string> {
    const byId = new Map(graph.splits.map((split) => [split.id, split]));
    const anchors = new Map<string, string>();
    graph.splits.forEach((split) => {
        let parent = split.parentId;
        while (byId.has(parent)) {
            parent = byId.get(parent).parentId;
        }
        anchors.set(split.id, parent);
    });
    return anchors;
}

// The deepest split chain hanging off each rank: that rank's gap has to hold its stems and pills.
function splitDepthAt(graph: TopologyGraph, anchors: Map<string, string>, rank: Map<string, number>): Map<number, number> {
    const depthAt = new Map<number, number>();
    graph.splits.forEach((split) => {
        const r = rank.get(anchors.get(split.id)) ?? 0;
        depthAt.set(r, Math.max(depthAt.get(r) ?? 0, split.depth));
    });
    return depthAt;
}

// A split sits a stem past its anchor, one step further per nesting level.
function splitMainOf(
    graph: TopologyGraph,
    anchors: Map<string, string>,
    rank: Map<string, number>,
    main: (r: number) => number,
    anchorSize: (id: string) => number,
    stem: number,
    step: number
): (splitId: string) => number {
    const byId = new Map(graph.splits.map((split) => [split.id, split]));
    return (splitId) => {
        const anchor = anchors.get(splitId);
        return main(rank.get(anchor) ?? 0) + anchorSize(anchor) + stem + (byId.get(splitId).depth - 1) * step;
    };
}

function crossSizes(frame: Frame): Record<string, number> {
    const sizes: Record<string, number> = {};
    Object.entries(frame.extents).forEach(([id, extent]) => (sizes[id] = frame.vertical ? extent.width : extent.height));
    return sizes;
}

// Splits are drawn between their anchor and the next rank but are not a rank of their own: for
// ranking and centring, an edge leaving a split counts as leaving the agent or trigger it hangs from.
function collapseSplits(graph: TopologyGraph, anchors: Map<string, string>): TopologyEdge[] {
    return graph.edges
        .filter((edge) => edge.kind !== "stem")
        .map((edge) => ({ ...edge, sourceId: anchors.get(edge.sourceId) ?? edge.sourceId }));
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

// Longest path from the seeds. An edge back into the path being walked closes a delegation
// cycle and does not lengthen it, so the cycle's members stay in adjacent ranks.
function relaxRanks(rank: Map<string, number>, children: Adjacency, seeds: string[]): void {
    const walking = new Set<string>();
    const visit = (id: string): void => {
        walking.add(id);
        for (const target of children.get(id) ?? []) {
            const candidate = rank.get(id) + 1;
            if (!walking.has(target) && candidate > (rank.get(target) ?? -1)) {
                rank.set(target, candidate);
                visit(target);
            }
        }
        walking.delete(id);
    };
    seeds.forEach(visit);
}

// Rank = longest path from a trigger. Agents nothing reaches start in the first agent rank
// and pull their own delegates along, so an untriggered supervisor still fans out.
function computeRanks(graph: TopologyGraph, edges: TopologyEdge[], anchors: Map<string, string>): Map<string, number> {
    const rank = new Map<string, number>();
    const children = adjacency(edges, "sourceId", "targetId");
    graph.triggers.forEach((trigger) => rank.set(trigger.id, 0));
    relaxRanks(rank, children, graph.triggers.map((trigger) => trigger.id));
    const orphans = graph.agents.filter((agent) => !rank.has(agent.id));
    orphans.forEach((agent) => rank.set(agent.id, 1));
    // An orphan that another orphan's walk already pulled along is not a root of its own.
    orphans.forEach((agent) => {
        if (rank.get(agent.id) === 1) {
            relaxRanks(rank, children, [agent.id]);
        }
    });
    graph.splits.forEach((split) => rank.set(split.id, rank.get(anchors.get(split.id)) ?? 0));
    return rank;
}

// Edges arriving at one node spread across its port side, at most ±1 step apart.
function spreadArrivals(edges: TopologyEdge[]): Record<string, number> {
    const groups = new Map<string, TopologyEdge[]>();
    edges.forEach((edge) => groups.set(edge.targetId, [...(groups.get(edge.targetId) ?? []), edge]));
    const bows: Record<string, number> = {};
    groups.forEach((group) => {
        const scale = Math.min(1, 2 / Math.max(1, group.length - 1));
        group.forEach((edge, index) => (bows[edge.id] = (index - (group.length - 1) / 2) * scale));
    });
    return bows;
}

// A delegation back to an earlier rank (or to the agent itself) leaves the source's out port, wraps
// around below the cards and comes back into the target's in port.
function backEdgeVias(edge: TopologyEdge, frame: Frame, final: Placement, mainOf: (id: string) => number, offset: number): NodePosition[] {
    const mainSize = (id: string): number => (frame.vertical ? frame.extents[id].height : frame.extents[id].width);
    const place = (main: number, cross: number): NodePosition => (frame.vertical ? { x: cross, y: main } : { x: main, y: cross });
    const { sourceId: source, targetId: target } = edge;
    const start = mainOf(source) + mainSize(source) + offset;
    const finish = mainOf(target) - BEND_OFFSET;
    const clear = Math.max(final.cross.get(source) + final.sizes[source], final.cross.get(target) + final.sizes[target]) + BACK_EDGE_CLEARANCE;
    return [place(start, centre(source, final)), place(start, clear), place(finish, clear), place(finish, centre(target, final))];
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

// The gap after a rank grows when splits hang off it: their stem, one step per nesting level and room for the pills.
function gapAfterRank(depthAt: Map<number, number>, base: number, minWithSplit: number, step: number): (r: number) => number {
    return (r) => (depthAt.has(r) ? Math.max(base, minWithSplit + (depthAt.get(r) - 1) * step) : base);
}

function horizontalFrame(
    graph: TopologyGraph,
    cardHeights: Record<string, number>,
    columnCount: number,
    availableWidth: number | undefined,
    rank: Map<string, number>,
    anchors: Map<string, string>
): Frame {
    const gapAfter = gapAfterRank(splitDepthAt(graph, anchors, rank), resolveGapX(columnCount, availableWidth), SPLIT_GAP_X_MIN, SPLIT_STEP_X);
    const extents: Record<string, Extent> = {};
    graph.agents.forEach((agent) => (extents[agent.id] = { width: AGENT_CARD_WIDTH, height: cardHeights[agent.id] }));
    graph.triggers.forEach((trigger) => (extents[trigger.id] = { width: TRIGGER_NODE_WIDTH, height: TRIGGER_SIZE }));
    graph.splits.forEach((split) => (extents[split.id] = { width: SPLIT_SIZE, height: SPLIT_SIZE }));
    const main = (r: number): number => {
        if (r <= 0) {
            return 0;
        }
        let x = TRIGGER_NODE_WIDTH + gapAfter(0);
        for (let k = 1; k < r; k++) {
            x += AGENT_CARD_WIDTH + gapAfter(k);
        }
        return x;
    };
    const splitMain = splitMainOf(graph, anchors, rank, main, (id) => extents[id].width, SPLIT_STEM_X, SPLIT_STEP_X);
    return { vertical: false, crossGap: TOPOLOGY_GAP_Y, splitGap: TOPOLOGY_GAP_Y, extents, main, splitMain };
}

// Rows are as tall as their tallest card; a row with splits hanging off it leaves room for their stems and pills.
function verticalFrame(graph: TopologyGraph, cardHeights: Record<string, number>, rank: Map<string, number>, anchors: Map<string, string>): Frame {
    const extents: Record<string, Extent> = {};
    const rowDepth = new Map<number, number>();
    graph.agents.forEach((agent) => {
        extents[agent.id] = { width: AGENT_CARD_WIDTH, height: cardHeights[agent.id] };
        const r = rank.get(agent.id) ?? 1;
        rowDepth.set(r, Math.max(rowDepth.get(r) ?? 0, cardHeights[agent.id]));
    });
    graph.triggers.forEach((trigger) => (extents[trigger.id] = { width: TRIGGER_LABEL_WIDTH, height: TRIGGER_STACKED_HEIGHT }));
    graph.splits.forEach((split) => (extents[split.id] = { width: SPLIT_SIZE, height: SPLIT_SIZE }));
    const gapAfter = gapAfterRank(splitDepthAt(graph, anchors, rank), TOPOLOGY_ROW_GAP, SPLIT_GAP_Y_MIN, SPLIT_STEP_Y);
    const main = (r: number): number => {
        if (r <= 0) {
            return 0;
        }
        let offset = TRIGGER_STACKED_HEIGHT + gapAfter(0);
        for (let k = 1; k < r; k++) {
            offset += (rowDepth.get(k) ?? AGENT_CARD_MIN_HEIGHT) + gapAfter(k);
        }
        return offset;
    };
    const splitMain = splitMainOf(graph, anchors, rank, main, (id) => extents[id].height, SPLIT_STEM_Y, SPLIT_STEP_Y);
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

function lowestStep(edge: TopologyEdge): number {
    const numbers = edge.chips.filter((chip) => chip.kind === "sequence").map((chip) => Number(chip.text));
    return numbers.length ? Math.min(...numbers) : Infinity;
}

// The parent an agent lines up under: the agent that runs it earliest in a chain (delegations rank after
// numbered steps), or its trigger when no agent runs it and exactly one trigger does.
function primaryParents(graph: TopologyGraph, rank: Map<string, number>, splitIds: Set<string>): Adjacency {
    const incoming = new Map<string, TopologyEdge[]>();
    graph.edges
        .filter((edge) => !splitIds.has(edge.sourceId) && !splitIds.has(edge.targetId) && edge.sourceId !== edge.targetId)
        .forEach((edge) => incoming.set(edge.targetId, [...(incoming.get(edge.targetId) ?? []), edge]));
    const primary: Adjacency = new Map();
    incoming.forEach((edges, target) => {
        const fromAgents = edges.filter((edge) => rank.get(edge.sourceId) > 0 && rank.get(edge.sourceId) < rank.get(target));
        if (fromAgents.length) {
            primary.set(target, [fromAgents.sort((a, b) => lowestStep(a) - lowestStep(b))[0].sourceId]);
        } else if (edges.length === 1) {
            primary.set(target, [edges[0].sourceId]);
        }
    });
    return primary;
}

// Top-down: a node moves under its primary parent when its row has room, so chains run straight
// instead of bending because a parent was pushed aside by a neighbour.
function straightenUnderParents(ranks: Map<number, string[]>, parents: Adjacency, final: Placement): void {
    [...ranks.keys()].sort((a, b) => a - b).filter((r) => r > 0).forEach((r) => {
        const row = [...ranks.get(r)].sort((a, b) => final.cross.get(a) - final.cross.get(b));
        row.forEach((id, i) => {
            const parent = parents.get(id)?.[0];
            if (!parent) {
                return;
            }
            const want = centre(parent, final) - final.sizes[id] / 2;
            const low = i > 0 ? final.cross.get(row[i - 1]) + final.sizes[row[i - 1]] + final.gap : -Infinity;
            const high = i < row.length - 1 ? final.cross.get(row[i + 1]) - final.gap - final.sizes[id] : Infinity;
            if (want >= low && want <= high) {
                final.cross.set(id, want);
            }
        });
    });
}

// A long edge keeps its target's cross position when nothing in the skipped ranks sits there; otherwise it
// detours above or below the cards it would cross, whichever side its target is nearer, one lane per edge.
function longEdgeVias(
    edge: TopologyEdge,
    skipped: string[],
    lane: { count: number },
    final: Placement,
    bends: { first: number; last: number },
    place: (main: number, cross: number) => NodePosition
): NodePosition[] {
    const target = centre(edge.targetId, final);
    const blocked = skipped.some((id) => target > final.cross.get(id) - LANE_CLEARANCE && target < final.cross.get(id) + final.sizes[id] + LANE_CLEARANCE);
    if (!blocked) {
        return [place(bends.first, target)];
    }
    const top = Math.min(...skipped.map((id) => final.cross.get(id)));
    const bottom = Math.max(...skipped.map((id) => final.cross.get(id) + final.sizes[id]));
    const offset = LANE_CLEARANCE + lane.count * BEND_STAGGER;
    lane.count += 1;
    const cross = target <= (top + bottom) / 2 ? top - offset : bottom + offset;
    return [place(bends.first, centre(edge.sourceId, final)), place(bends.first, cross), place(bends.last, cross), place(bends.last, target)];
}

// Split layers by their flow position, innermost (furthest along) first, so each split is placed after
// what it fans out to and before the anchor that hangs it.
function splitLayersUnder(graph: TopologyGraph, anchors: Map<string, string>, rank: Map<string, number>, anchorRank: number, mainOf: (id: string) => number): string[][] {
    const byMain = new Map<number, string[]>();
    graph.splits
        .filter((split) => rank.get(anchors.get(split.id)) === anchorRank)
        .forEach((split) => byMain.set(mainOf(split.id), [...(byMain.get(mainOf(split.id)) ?? []), split.id]));
    return [...byMain.entries()].sort((a, b) => b[0] - a[0]).map(([, ids]) => ids);
}

export function layoutTopology(graph: TopologyGraph, options: LayoutOptions = {}): TopologyLayout {
    const anchors = splitAnchors(graph);
    const edges = collapseSplits(graph, anchors);
    const rank = computeRanks(graph, edges, anchors);
    const longEdges = edges.filter((edge) => skipsRanks(edge, rank));

    const cardHeights: Record<string, number> = {};
    graph.agents.forEach((agent) => (cardHeights[agent.id] = estimateAgentCardHeight(agent.orphan)));

    const ranks = new Map<number, string[]>();
    [...graph.triggers, ...graph.agents].forEach((node) => {
        const r = rank.get(node.id) ?? 1;
        ranks.set(r, [...(ranks.get(r) ?? []), node.id]);
    });
    const maxRank = Math.max(0, ...ranks.keys());
    const frame = options.orientation === "vertical"
        ? verticalFrame(graph, cardHeights, rank, anchors)
        : horizontalFrame(graph, cardHeights, maxRank + 1, options.availableWidth, rank, anchors);
    const splitIds = new Set(graph.splits.map((split) => split.id));
    const mainOf = (id: string): number => (splitIds.has(id) ? frame.splitMain(id) : frame.main(rank.get(id) ?? 1));

    const sizes = crossSizes(frame);
    const provisional = orderRanks(ranks, maxRank, adjacency(edges, "targetId", "sourceId"), frame, sizes);
    const final: Placement = { cross: new Map(), sizes, gap: frame.crossGap };
    // Each rank is placed after the rank it feeds; the splits hanging off it come first, innermost first,
    // so every node is centred on what it fans out to. Triggers go last.
    const children = adjacency(graph.edges, "sourceId", "targetId");
    const splitLayers: string[][] = [];
    const placeSplitsUnder = (r: number): void =>
        splitLayersUnder(graph, anchors, rank, r, mainOf).forEach((layer) => {
            splitLayers.push(layer);
            placeRank(layer, children, provisional, final, frame.splitGap);
            avoidLanes(layer, passingLanes(mainOf(layer[0]), graph, mainOf, final), final, frame.splitGap);
        });
    for (let r = maxRank; r >= 1; r--) {
        placeSplitsUnder(r);
        placeRank(ranks.get(r) ?? [], children, provisional, final);
    }
    placeSplitsUnder(0);
    placeRank(ranks.get(0) ?? [], children, provisional, final);
    straightenUnderParents(ranks, primaryParents(graph, rank, splitIds), final);

    const place = (main: number, cross: number): NodePosition => (frame.vertical ? { x: cross, y: main } : { x: main, y: cross });
    const positions = new Map<string, NodePosition>();
    final.cross.forEach((cross, id) => positions.set(id, place(mainOf(id), cross)));

    const offsets = bendOffsets([...ranks.values(), ...splitLayers], final);
    const longIds = new Set(longEdges.map((edge) => edge.id));
    const vias = new Map<string, NodePosition[]>();
    // A split shares its anchor's rank, so a stem into it is never a back edge.
    const isBackEdge = (edge: TopologyEdge): boolean => !splitIds.has(edge.sourceId) && !splitIds.has(edge.targetId) && rank.get(edge.targetId) <= rank.get(edge.sourceId);
    const skippedBy = (edge: TopologyEdge): string[] =>
        [...ranks.entries()].filter(([r]) => r > rank.get(edge.sourceId) && r < rank.get(edge.targetId)).flatMap(([, ids]) => ids);
    const lane = { count: 0 };
    graph.edges.forEach((edge) => {
        const source = edge.sourceId;
        if (isBackEdge(edge)) {
            vias.set(edge.id, backEdgeVias(edge, frame, final, mainOf, offsets.get(source)));
            return;
        }
        if (longIds.has(edge.id)) {
            const bends = { first: frame.main(rank.get(source) + 1) - LANE_LEAD, last: mainOf(edge.targetId) - BEND_OFFSET };
            vias.set(edge.id, longEdgeVias(edge, skippedBy(edge), lane, final, bends, place));
            return;
        }
        const extent = frame.extents[source];
        const bend = mainOf(source) + (frame.vertical ? extent.height : extent.width) + offsets.get(source);
        vias.set(edge.id, [place(bend, centre(source, final))]);
    });
    const edgeBows = spreadArrivals(graph.edges.filter((edge) => !isBackEdge(edge)));
    return { ...collectLayout(graph, positions, vias, frame, cardHeights), edgeBows };
}

function collectLayout(
    graph: TopologyGraph,
    positions: Map<string, NodePosition>,
    vias: Map<string, NodePosition[]>,
    frame: Frame,
    cardHeights: Record<string, number>
): Omit<TopologyLayout, "edgeBows"> {
    const points = [...positions.values(), ...[...vias.values()].flat()];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
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
    vias.forEach((points, edgeId) => {
        edgeVias[edgeId] = points.map((via) => ({ x: via.x - minX, y: via.y - minY }));
        // A wrapped back edge is part of the drawn bounds.
        edgeVias[edgeId].forEach((via) => {
            right = Math.max(right, via.x);
            height = Math.max(height, via.y);
        });
    });
    const left = !frame.vertical && graph.triggers.length ? triggerLabelSlack(graph.triggers) : 0;
    return { agentPositions, triggerPositions, splitPositions, cardHeights, edgeVias, left, width: right - left, height };
}
