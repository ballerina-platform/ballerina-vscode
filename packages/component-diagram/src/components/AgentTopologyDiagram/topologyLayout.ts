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
    ARRIVAL_BOW_PX,
    AGENT_CARD_WIDTH,
    LAYOUT_FIT_MARGIN,
    LOOP_BOX_CAPTION,
    LOOP_BOX_PAD,
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
import { LayoutOptions, LoopBox, NodePosition, TopologyEdge, TopologyGraph, TopologyLayout, TopologyTriggerNode } from "./types";

const ORPHAN_FOOTER_HEIGHT = 26;
const LABEL1_CHAR_WIDTH = 8.5;
const LABEL2_CHAR_WIDTH = 7.2;
const LANE_CLEARANCE = 28;
const LANE_LEAD = 24;
// How far past the cards a back edge (a delegation cycle) wraps around.
const BACK_EDGE_CLEARANCE = 24;
// A wrapped edge's pill sits on its first leg: room for the pill's estimated width across the flow (13 px UI text,
// capped as the chip layer caps it) or its height along it, plus a margin at each end.
const PILL_CHAR_WIDTH = 7.5;
const PILL_PADDING = 24;
const PILL_MAX_WIDTH = 250;
const PILL_MARGIN = 16;
const PILL_BOX_HEIGHT = 32;
const BEND_OFFSET = 40;
const BEND_STAGGER = 14;
// A split's label sits under (or beside) its glyph; a boxed body has to hold it too.
const SPLIT_LABEL_ALLOWANCE = 24;

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
function passingLanes(main: number, graph: TopologyGraph, mainOf: (id: string) => number, sourceMain: (edge: TopologyEdge) => number, placement: Placement): number[] {
    return graph.edges
        .filter((edge) => sourceMain(edge) < main && mainOf(edge.targetId) > main)
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
// (and each split, and each loop box's far edge) sits along the flow axis.
interface Frame {
    vertical: boolean;
    crossGap: number;
    splitGap: number;
    stem: number;
    extents: Record<string, Extent>;
    main(rank: number): number;
    splitMain(splitId: string): number;
    far(loopId: string): number;
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

type Members = Map<string, Set<string>>;

function loopMembers(graph: TopologyGraph): Members {
    return new Map(graph.splits.filter((split) => split.members).map((split) => [split.id, new Set(split.members)]));
}

// The loops a split continues after: walking up its parents, every loop whose body does not hold it.
function continuedLoops(graph: TopologyGraph, members: Members): (splitId: string) => string[] {
    const byId = new Map(graph.splits.map((split) => [split.id, split]));
    return (splitId) => {
        const loops: string[] = [];
        let current = splitId;
        let parent = byId.get(current)?.parentId;
        while (byId.has(parent)) {
            if (members.has(parent) && !members.get(parent).has(current)) {
                loops.push(parent);
            }
            current = parent;
            parent = byId.get(current).parentId;
        }
        return loops;
    };
}

// What runs after a loop ranks past its whole body: the exit edge, and every edge leaving a split that continues
// after the loop, also count as leaving the loop's member agents.
function predecessorEdges(graph: TopologyGraph, members: Members, agentIds: Set<string>): TopologyEdge[] {
    const continued = continuedLoops(graph, members);
    const agentsOf = (loopId: string): string[] => [...members.get(loopId)].filter((id) => agentIds.has(id));
    return graph.edges
        .filter((edge) => edge.kind !== "stem")
        .flatMap((edge) => {
            const loops = [...(edge.kind === "exit" ? [edge.sourceId] : []), ...continued(edge.sourceId)];
            return loops.flatMap(agentsOf).map((agentId) => ({ ...edge, id: `${agentId}~>${edge.targetId}`, sourceId: agentId }));
        });
}

// Where a split hangs: its anchor node and rank, how many splits deep it is past that anchor, and the boxed
// loop it continues after, when it does (then the anchor is that loop's deepest member and the depth restarts).
interface Anchor {
    node: string;
    rank: number;
    depth: number;
    exitOf?: string;
}

// A loop whose body can be boxed: every member sits past the loop node.
interface LoopInfo {
    id: string;
    deepest: string;
    rank: number;
    // Boxed loops nested inside, each adding one padding to the far edge.
    inner: number;
}

interface Anchoring {
    anchors: Map<string, Anchor>;
    loops: Map<string, LoopInfo>;
}

function resolveAnchors(graph: TopologyGraph, members: Members, rank: Map<string, number>, agentIds: Set<string>): Anchoring {
    const byId = new Map(graph.splits.map((split) => [split.id, split]));
    const anchors = new Map<string, Anchor>();
    const loops = new Map<string, LoopInfo>();
    const boxable = new Map<string, boolean>();
    const deepestMember = (loopId: string): string | undefined =>
        [...members.get(loopId)].filter((id) => agentIds.has(id)).sort((a, b) => rank.get(b) - rank.get(a))[0];
    const isBoxable = (loopId: string): boolean => {
        if (!boxable.has(loopId)) {
            const deepest = deepestMember(loopId);
            const past = anchorOf(loopId).rank;
            const agents = [...members.get(loopId)].filter((id) => agentIds.has(id));
            boxable.set(loopId, deepest !== undefined && agents.every((id) => rank.get(id) > past));
            if (boxable.get(loopId)) {
                const inner = [...members.get(loopId)].filter((id) => members.has(id) && isBoxable(id)).length;
                loops.set(loopId, { id: loopId, deepest, rank: rank.get(deepest), inner });
            }
        }
        return boxable.get(loopId);
    };
    const exitsBoxed = (current: string, parent: string): boolean => members.has(parent) && !members.get(parent).has(current) && isBoxable(parent);
    const anchorOf = (splitId: string): Anchor => {
        if (!anchors.has(splitId)) {
            let current = splitId;
            let depth = 1;
            let parent = byId.get(current).parentId;
            while (byId.has(parent) && !exitsBoxed(current, parent)) {
                current = parent;
                parent = byId.get(current).parentId;
                depth++;
            }
            const exitOf = byId.has(parent) ? parent : undefined;
            const node = exitOf ? loops.get(exitOf).deepest : parent;
            anchors.set(splitId, { node, rank: rank.get(node) ?? 0, depth, exitOf });
        }
        return anchors.get(splitId);
    };
    graph.splits.forEach((split) => anchorOf(split.id));
    members.forEach((_, loopId) => isBoxable(loopId));
    return { anchors, loops };
}

// The deepest split chain hanging off each rank: that rank's gap has to hold its stems and pills.
function splitDepthAt(anchors: Map<string, Anchor>): Map<number, number> {
    const depthAt = new Map<number, number>();
    anchors.forEach((anchor) => depthAt.set(anchor.rank, Math.max(depthAt.get(anchor.rank) ?? 0, anchor.depth)));
    return depthAt;
}

// A split sits a stem past its anchor (or past the box of the loop it continues), one step further per nesting level.
function splitMainOf(
    anchoring: Anchoring,
    members: Members,
    main: (r: number) => number,
    anchorSize: (id: string) => number,
    stem: number,
    step: number
): Pick<Frame, "splitMain" | "far"> {
    // A construct that continues after the loop's last agent (an `if` closing the body) is still a member,
    // so the box has to reach past it too, not just past the deepest agent.
    const far = (loopId: string): number => {
        const loop = anchoring.loops.get(loopId);
        const base = main(loop.rank) + anchorSize(loop.deepest);
        const splitReach = [...members.get(loopId)]
            .filter((id) => anchoring.anchors.has(id))
            .map((id) => splitMain(id) + anchorSize(id) + SPLIT_LABEL_ALLOWANCE);
        return Math.max(base, ...splitReach) + LOOP_BOX_PAD * (1 + loop.inner);
    };
    const splitMain = (splitId: string): number => {
        const anchor = anchoring.anchors.get(splitId);
        const start = anchor.exitOf ? far(anchor.exitOf) : main(anchor.rank) + anchorSize(anchor.node);
        return start + stem + (anchor.depth - 1) * step;
    };
    return { splitMain, far };
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
function computeRanks(graph: TopologyGraph, edges: TopologyEdge[]): Map<string, number> {
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
// The leg a wrapped edge needs before it turns, when its pill rides on that leg.
function pillRun(edge: TopologyEdge, vertical: boolean): number {
    const pill = edge.chips.find((chip) => chip.kind === "condition");
    if (!pill) {
        return 0;
    }
    const along = vertical ? PILL_BOX_HEIGHT : Math.min(PILL_MAX_WIDTH, pill.text.length * PILL_CHAR_WIDTH + PILL_PADDING);
    return along + 2 * PILL_MARGIN;
}

// Where an edge leaves: a node's out port, or the far edge of a loop's box for the edge that exits it.
interface Source {
    rank: number;
    main: number;
    centre: number;
    end: number;
}

function backEdgeVias(edge: TopologyEdge, from: Source, frame: Frame, final: Placement, mainOf: (id: string) => number, offset: number): NodePosition[] {
    const place = (main: number, cross: number): NodePosition => (frame.vertical ? { x: cross, y: main } : { x: main, y: cross });
    const target = edge.targetId;
    const start = from.main + Math.max(offset, pillRun(edge, frame.vertical));
    const finish = mainOf(target) - BEND_OFFSET;
    const clear = Math.max(from.end, final.cross.get(target) + final.sizes[target]) + BACK_EDGE_CLEARANCE;
    return [place(start, from.centre), place(start, clear), place(finish, clear), place(finish, centre(target, final))];
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
    anchoring: Anchoring,
    members: Members
): Frame {
    const gapAfter = gapAfterRank(splitDepthAt(anchoring.anchors), resolveGapX(columnCount, availableWidth), SPLIT_GAP_X_MIN, SPLIT_STEP_X);
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
    const splits = splitMainOf(anchoring, members, main, (id) => extents[id].width, SPLIT_STEM_X, SPLIT_STEP_X);
    return { vertical: false, crossGap: TOPOLOGY_GAP_Y, splitGap: TOPOLOGY_GAP_Y, stem: SPLIT_STEM_X, extents, main, ...splits };
}

// Rows are as tall as their tallest card; a row with splits hanging off it leaves room for their stems and pills.
function verticalFrame(
    graph: TopologyGraph,
    cardHeights: Record<string, number>,
    rank: Map<string, number>,
    anchoring: Anchoring,
    members: Members
): Frame {
    const extents: Record<string, Extent> = {};
    const rowDepth = new Map<number, number>();
    graph.agents.forEach((agent) => {
        extents[agent.id] = { width: AGENT_CARD_WIDTH, height: cardHeights[agent.id] };
        const r = rank.get(agent.id) ?? 1;
        rowDepth.set(r, Math.max(rowDepth.get(r) ?? 0, cardHeights[agent.id]));
    });
    graph.triggers.forEach((trigger) => (extents[trigger.id] = { width: TRIGGER_LABEL_WIDTH, height: TRIGGER_STACKED_HEIGHT }));
    graph.splits.forEach((split) => (extents[split.id] = { width: SPLIT_SIZE, height: SPLIT_SIZE }));
    const gapAfter = gapAfterRank(splitDepthAt(anchoring.anchors), TOPOLOGY_ROW_GAP, SPLIT_GAP_Y_MIN, SPLIT_STEP_Y);
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
    const splits = splitMainOf(anchoring, members, main, (id) => extents[id].height, SPLIT_STEM_Y, SPLIT_STEP_Y);
    return { vertical: true, crossGap: TOPOLOGY_COLUMN_GAP, splitGap: SPLIT_LABEL_GAP_Y, stem: SPLIT_STEM_Y, extents, main, ...splits };
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

// How a node is reached, by its first incoming edge: the chain of splits between it and its anchor (as
// ordinals in creation order) and that edge's position, which follows the source order of the calls.
interface Arrival {
    path: number[];
    order: number;
}

function arrivals(graph: TopologyGraph): Map<string, Arrival> {
    const byId = new Map(graph.splits.map((split, ordinal) => [split.id, { split, ordinal }]));
    const pathTo = (id: string): number[] => {
        const entry = byId.get(id);
        return entry ? [...pathTo(entry.split.parentId), entry.ordinal] : [];
    };
    const result = new Map<string, Arrival>();
    graph.edges.forEach((edge, order) => {
        if (!result.has(edge.targetId)) {
            result.set(edge.targetId, { path: pathTo(edge.sourceId), order });
        }
    });
    return result;
}

function comparePaths(a: number[], b: number[]): number {
    const shared = Math.min(a.length, b.length);
    for (let i = 0; i < shared; i++) {
        if (a[i] !== b[i]) {
            return a[i] - b[i];
        }
    }
    return a.length - b.length;
}

// Forward pass: each rank is ordered by where its parents sit, which keeps siblings together and edges
// from crossing; under one parent, nodes hanging from the same split chain stay adjacent and follow the
// source order of their calls. Nodes with no parent (orphans) keep their built order at the end.
function orderRanks(ranks: Map<number, string[]>, maxRank: number, parents: Adjacency, reached: Map<string, Arrival>, frame: Frame, sizes: Record<string, number>): Placement {
    const none: Arrival = { path: [], order: Number.MAX_SAFE_INTEGER };
    const provisional: Placement = { cross: new Map(), sizes, gap: frame.crossGap };
    stack(ranks.get(0) ?? [], provisional);
    for (let r = 1; r <= maxRank; r++) {
        const ids = ranks.get(r) ?? [];
        const key = (id: string): number => {
            const placed = (parents.get(id) ?? []).filter((parent) => provisional.cross.has(parent));
            return placed.length ? mean(placed.map((parent) => centre(parent, provisional))) : Number.MAX_SAFE_INTEGER;
        };
        const ordered = ids
            .map((id, index) => ({ id, index, key: key(id), via: reached.get(id) ?? none }))
            .sort((a, b) => a.key - b.key || comparePaths(a.via.path, b.via.path) || a.via.order - b.via.order || a.index - b.index);
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

// The parent an agent lines up under: the agent that runs it earliest in a chain (delegations and a loop's exit
// rank after numbered steps), or its trigger when no agent runs it and exactly one trigger does.
function primaryParents(graph: TopologyGraph, rank: Map<string, number>, splitIds: Set<string>): Adjacency {
    const incoming = new Map<string, TopologyEdge[]>();
    graph.edges
        .filter((edge) => (!splitIds.has(edge.sourceId) || edge.kind === "exit") && !splitIds.has(edge.targetId) && edge.sourceId !== edge.targetId)
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
function straightenUnderParents(ranks: Map<number, string[]>, parents: Adjacency, final: Placement, skip = new Set<string>()): void {
    [...ranks.keys()].sort((a, b) => a - b).filter((r) => r > 0).forEach((r) => {
        const row = [...ranks.get(r)].sort((a, b) => final.cross.get(a) - final.cross.get(b));
        row.forEach((id, i) => {
            const parent = parents.get(id)?.[0];
            if (!parent || skip.has(id)) {
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

// Where a long edge may run across the ranks it skips: at its arrival's cross position (straight in), along its
// source's (one turn before the target), or through a lane the skipped cards leave free: the gaps between them and
// the space beyond the first and last, staggered per edge. The first free lane by travel wins.
function longEdgeVias(
    edge: TopologyEdge,
    skipped: string[],
    lane: { count: number },
    final: Placement,
    bends: { first: number; last: number },
    place: (main: number, cross: number) => NodePosition,
    arrival: number
): NodePosition[] {
    const source = centre(edge.sourceId, final);
    const blocked = (cross: number): boolean =>
        skipped.some((id) => cross > final.cross.get(id) - LANE_CLEARANCE && cross < final.cross.get(id) + final.sizes[id] + LANE_CLEARANCE);
    if (!blocked(arrival)) {
        return [place(bends.first, arrival)];
    }
    if (!blocked(source)) {
        return [place(bends.last, source), place(bends.last, arrival)];
    }
    const offset = lane.count * BEND_STAGGER;
    lane.count += 1;
    const travel = (cross: number): number => Math.abs(source - cross) + Math.abs(cross - arrival);
    const cross = freeLanes(skipped, final, offset)
        .filter((candidate) => !blocked(candidate))
        .sort((a, b) => travel(a) - travel(b))[0];
    return [place(bends.first, source), place(bends.first, cross), place(bends.last, cross), place(bends.last, arrival)];
}

// The lanes past the skipped cards: the middle of each gap between neighbours, and the clearance beyond both ends.
function freeLanes(skipped: string[], final: Placement, offset: number): number[] {
    const sorted = [...skipped].sort((a, b) => final.cross.get(a) - final.cross.get(b));
    const bottomOf = (id: string): number => final.cross.get(id) + final.sizes[id];
    const gaps = sorted.slice(1).map((id, i) => (bottomOf(sorted[i]) + final.cross.get(id)) / 2 + offset);
    return [final.cross.get(sorted[0]) - LANE_CLEARANCE - offset, bottomOf(sorted[sorted.length - 1]) + LANE_CLEARANCE + offset, ...gaps];
}

// Split layers by their flow position, innermost (furthest along) first, so each split is placed after
// what it fans out to and before the anchor that hangs it.
function splitLayersUnder(graph: TopologyGraph, anchors: Map<string, Anchor>, anchorRank: number, mainOf: (id: string) => number): string[][] {
    const byMain = new Map<number, string[]>();
    graph.splits
        .filter((split) => anchors.get(split.id).rank === anchorRank)
        .forEach((split) => byMain.set(mainOf(split.id), [...(byMain.get(mainOf(split.id)) ?? []), split.id]));
    return [...byMain.entries()].sort((a, b) => b[0] - a[0]).map(([, ids]) => ids);
}

// A loop's box in frame terms: along the flow from the loop node to past its deepest member, across the
// flow around every member (and every box nested inside), padded, with room for the caption at the top.
interface Band {
    near: number;
    far: number;
    lo: number;
    hi: number;
}

// Everything a box's geometry needs, so a band can be recomputed while the nodes are still moving.
interface Boxing {
    loops: LoopInfo[];
    members: Members;
    // A loop's whole body plus its own node, which sits on the box's near border.
    group(loopId: string): string[];
    band(loopId: string): Band;
    bands(): Map<string, Band>;
    // Which box a node is drawn in, outermost first, and whether two boxes are allowed to overlap.
    boxOf(id: string): string | undefined;
    shares(a: string, b: string): boolean;
}

// Two loops directly share a card when their bodies overlap. Two loops that don't share a card themselves but
// each share one with a third are still one cluster: separating them would force the third loop's box to keep
// regrowing to follow the card it lost, which in turn demands separating them again -- an endless push. So the
// "do not separate" relation is the transitive closure of direct sharing, via union-find over the loop ids.
function shareClusters(loops: LoopInfo[], members: Members): Map<string, string> {
    const parent = new Map(loops.map((loop) => [loop.id, loop.id]));
    const find = (id: string): string => {
        while (parent.get(id) !== id) {
            parent.set(id, parent.get(parent.get(id)));
            id = parent.get(id);
        }
        return id;
    };
    const union = (a: string, b: string): void => {
        parent.set(find(a), find(b));
    };
    const directlyShares = (a: LoopInfo, b: LoopInfo): boolean =>
        [...members.get(a.id)].some((id) => members.get(b.id).has(id)) || members.get(a.id).has(b.id) || members.get(b.id).has(a.id);
    loops.forEach((a, i) => loops.slice(i + 1).forEach((b) => directlyShares(a, b) && union(a.id, b.id)));
    return new Map(loops.map((loop) => [loop.id, find(loop.id)]));
}

function boxing(loops: LoopInfo[], members: Members, splitIds: Set<string>, frame: Frame, final: Placement): Boxing {
    const caption = frame.vertical ? 0 : LOOP_BOX_CAPTION;
    // Inner loops first, so an outer box can wrap the boxes inside it.
    const inside = [...loops].sort((a, b) => members.get(a.id).size - members.get(b.id).size);
    const outermost = [...loops].sort((a, b) => members.get(b.id).size - members.get(a.id).size);
    const clusterOf = shareClusters(loops, members);
    const band = (loopId: string, known = new Map<string, Band>()): Band => {
        const ids = [...members.get(loopId)];
        const lows = ids.map((id) => known.get(id)?.lo ?? final.cross.get(id));
        const highs = ids.map((id) => known.get(id)?.hi ?? final.cross.get(id) + final.sizes[id] + (splitIds.has(id) ? SPLIT_LABEL_ALLOWANCE : 0));
        return {
            near: frame.splitMain(loopId) + SPLIT_SIZE / 2,
            far: frame.far(loopId),
            lo: Math.min(...lows) - LOOP_BOX_PAD - caption,
            hi: Math.max(...highs) + LOOP_BOX_PAD,
        };
    };
    const bands = (): Map<string, Band> => {
        const known = new Map<string, Band>();
        inside.forEach((loop) => known.set(loop.id, band(loop.id, known)));
        return known;
    };
    return {
        loops,
        members,
        group: (loopId) => [loopId, ...members.get(loopId)],
        band: (loopId) => band(loopId, bands()),
        bands,
        boxOf: (id) => outermost.find((loop) => members.get(loop.id).has(id))?.id,
        shares: (a, b) => clusterOf.get(a) === clusterOf.get(b),
    };
}

// Nodes in one layer, sorted along the cross axis, pushed apart from the moved one so nothing overlaps.
function settleLayer(layer: string[], moved: Set<string>, direction: 1 | -1, final: Placement, gap: number): void {
    const ids = [...layer].sort((a, b) => final.cross.get(a) - final.cross.get(b));
    const from = direction > 0 ? ids.findIndex((id) => moved.has(id)) : ids.length - 1 - [...ids].reverse().findIndex((id) => moved.has(id));
    if (from < 0 || from >= ids.length) {
        return;
    }
    for (let i = from + direction; i >= 0 && i < ids.length; i += direction) {
        const previous = ids[i - direction];
        const limit = direction > 0 ? final.cross.get(previous) + final.sizes[previous] + gap : final.cross.get(previous) - gap - final.sizes[ids[i]];
        if (direction > 0 ? final.cross.get(ids[i]) < limit : final.cross.get(ids[i]) > limit) {
            final.cross.set(ids[i], limit);
        }
    }
}

// A body that moves takes every parent that leads nowhere else, so a trigger follows the loop it runs; a shared
// parent, or one a box that is staying put holds, is left where it is.
function withExclusiveParents(group: string[], parents: Adjacency, children: Adjacency, frozen: Set<string>): string[] {
    const moving = new Set(group);
    for (let grew = true; grew; ) {
        grew = false;
        [...moving].forEach((id) =>
            (parents.get(id) ?? []).forEach((parent) => {
                if (!moving.has(parent) && !frozen.has(parent) && (children.get(parent) ?? []).every((child) => moving.has(child))) {
                    moving.add(parent);
                    grew = true;
                }
            })
        );
    }
    return [...moving];
}

function moveGroup(group: string[], delta: number, layers: string[][], final: Placement, gap: number): boolean {
    if (Math.abs(delta) < 1) {
        return false;
    }
    group.filter((id) => final.cross.has(id)).forEach((id) => final.cross.set(id, final.cross.get(id) + delta));
    const moved = new Set(group);
    layers.filter((layer) => layer.some((id) => moved.has(id))).forEach((layer) => settleLayer(layer, moved, delta > 0 ? 1 : -1, final, gap));
    return true;
}

// Whether a node is drawn inside a box: its centre along the flow is past the near border (so a loop node sitting
// on that border is not its own intruder), and its extent overlaps the box's rows.
function intrudes(id: string, band: Band, mainOf: (id: string) => number, mainSize: (id: string) => number, final: Placement): boolean {
    const centre = mainOf(id) + mainSize(id) / 2;
    const cross = final.cross.get(id);
    return centre > band.near && centre < band.far && cross < band.hi && cross + final.sizes[id] > band.lo;
}

// The delta that takes a group clear of a box, on whichever side it already leans towards.
function clearOf(group: string[], band: Band, final: Placement, gap: number): number {
    const centre = mean(group.filter((id) => final.cross.has(id)).map((id) => final.cross.get(id) + final.sizes[id] / 2));
    return centre >= (band.lo + band.hi) / 2
        ? band.hi + gap - Math.min(...group.map((id) => final.cross.get(id)))
        : band.lo - gap - Math.max(...group.map((id) => final.cross.get(id) + final.sizes[id]));
}

// A node from another handler that landed inside a loop's box moves out of it, away from the box's centre, taking
// its own box along when that box is free to move.
function evictIntruders(
    box: Boxing,
    layers: string[][],
    grow: (group: string[], frozen: Set<string>) => string[],
    mainOf: (id: string) => number,
    mainSize: (id: string) => number,
    final: Placement,
    gap: number
): boolean {
    let moved = false;
    box.loops.forEach((loop) => {
        const band = box.band(loop.id);
        const own = box.members.get(loop.id);
        const groups = new Map<string, string[]>();
        layers
            .flat()
            .filter((id) => id !== loop.id && !own.has(id) && intrudes(id, band, mainOf, mainSize, final))
            .forEach((id) => {
                // A box of its own moves whole; a node from a box that shares a card with this loop is left where
                // it is (the two boxes are already allowed to overlap, dragging it out would only pull its own
                // box's other members apart from a card that isn't moving).
                const other = box.boxOf(id);
                if (other !== undefined && box.shares(other, loop.id)) {
                    return;
                }
                groups.set(other ?? id, other ? box.group(other) : [id]);
            });
        groups.forEach((group) => (moved = moveGroup(grow(group, own), clearOf(group, band, final, gap), layers, final, gap) || moved));
    });
    return moved;
}

// Two boxes drawn over the same columns must not share a dashed border: the lower one moves down with its whole
// body. Nested boxes and two handlers' loops that share a card are allowed to overlap.
function separateBoxes(box: Boxing, layers: string[][], grow: (group: string[], frozen: Set<string>) => string[], final: Placement, gap: number): boolean {
    const ordered = [...box.loops].sort((a, b) => box.band(a.id).lo - box.band(b.id).lo);
    const placed: string[] = [];
    let moved = false;
    ordered.forEach((loop) => {
        placed
            .filter((earlier) => !box.shares(earlier, loop.id))
            .forEach((earlier) => {
                const above = box.band(earlier);
                const band = box.band(loop.id);
                const overlaps = above.near < band.far && band.near < above.far && band.lo < above.hi + gap;
                if (overlaps) {
                    moved = moveGroup(grow(box.group(loop.id), box.members.get(earlier)), above.hi + gap - band.lo, layers, final, gap) || moved;
                }
            });
        placed.push(loop.id);
    });
    return moved;
}

export function layoutTopology(graph: TopologyGraph, options: LayoutOptions = {}): TopologyLayout {
    const agentIds = new Set(graph.agents.map((agent) => agent.id));
    const splitIds = new Set(graph.splits.map((split) => split.id));
    const members = loopMembers(graph);
    const edges = [...collapseSplits(graph, splitAnchors(graph)), ...predecessorEdges(graph, members, agentIds)];
    const rank = computeRanks(graph, edges);
    const anchoring = resolveAnchors(graph, members, rank, agentIds);
    graph.splits.forEach((split) => rank.set(split.id, anchoring.anchors.get(split.id).rank));
    const loops = [...anchoring.loops.values()];

    const cardHeights: Record<string, number> = {};
    graph.agents.forEach((agent) => (cardHeights[agent.id] = estimateAgentCardHeight(agent.orphan)));

    const ranks = new Map<number, string[]>();
    [...graph.triggers, ...graph.agents].forEach((node) => {
        const r = rank.get(node.id) ?? 1;
        ranks.set(r, [...(ranks.get(r) ?? []), node.id]);
    });
    const maxRank = Math.max(0, ...ranks.keys());
    const frame = options.orientation === "vertical"
        ? verticalFrame(graph, cardHeights, rank, anchoring, members)
        : horizontalFrame(graph, cardHeights, maxRank + 1, options.availableWidth, anchoring, members);
    const mainOf = (id: string): number => (splitIds.has(id) ? frame.splitMain(id) : frame.main(rank.get(id) ?? 1));
    const mainSize = (id: string): number => (frame.vertical ? frame.extents[id].height : frame.extents[id].width);
    const exits = (edge: TopologyEdge): boolean => edge.kind === "exit" && anchoring.loops.has(edge.sourceId);
    const sourceMain = (edge: TopologyEdge): number => (exits(edge) ? frame.far(edge.sourceId) : mainOf(edge.sourceId));

    const sizes = crossSizes(frame);
    const provisional = orderRanks(ranks, maxRank, adjacency(edges, "targetId", "sourceId"), arrivals(graph), frame, sizes);
    const final: Placement = { cross: new Map(), sizes, gap: frame.crossGap };
    // Each rank is placed after the rank it feeds; the splits hanging off it come first, innermost first,
    // so every node is centred on what it fans out to. Triggers go last. A loop centres on its body alone.
    const children = adjacency(graph.edges.filter((edge) => edge.kind !== "exit"), "sourceId", "targetId");
    const splitLayers: string[][] = [];
    const placeSplitsUnder = (r: number): void =>
        splitLayersUnder(graph, anchoring.anchors, r, mainOf).forEach((layer) => {
            splitLayers.push(layer);
            placeRank(layer, children, provisional, final, frame.splitGap);
            avoidLanes(layer, passingLanes(mainOf(layer[0]), graph, mainOf, sourceMain, final), final, frame.splitGap);
        });
    for (let r = maxRank; r >= 1; r--) {
        placeSplitsUnder(r);
        placeRank(ranks.get(r) ?? [], children, provisional, final);
    }
    placeSplitsUnder(0);
    placeRank(ranks.get(0) ?? [], children, provisional, final);
    const primary = primaryParents(graph, rank, splitIds);
    straightenUnderParents(ranks, primary, final);
    // Boxes are rigid: a body that moves keeps its shape, so its own parents follow and only the nodes outside
    // every box are straightened again afterwards.
    const layers = [...ranks.values(), ...splitLayers];
    const box = boxing(loops, members, splitIds, frame, final);
    const incoming = adjacency(graph.edges, "targetId", "sourceId");
    const grow = (group: string[], frozen: Set<string>): string[] => withExclusiveParents(group, incoming, children, frozen);
    // Clearing one box moves cards that another box is measured from, so the two passes repeat until they settle.
    for (let round = 0; round < 4; round++) {
        const evicted = evictIntruders(box, layers, grow, mainOf, mainSize, final, frame.crossGap);
        if (!separateBoxes(box, layers, grow, final, frame.crossGap) && !evicted) {
            break;
        }
    }
    straightenUnderParents(ranks, primary, final, new Set(loops.flatMap((loop) => box.group(loop.id))));
    const bands = box.bands();

    const place = (main: number, cross: number): NodePosition => (frame.vertical ? { x: cross, y: main } : { x: main, y: cross });
    const positions = new Map<string, NodePosition>();
    final.cross.forEach((cross, id) => positions.set(id, place(mainOf(id), cross)));

    const offsets = bendOffsets(layers, final);
    const nodeSource = (id: string): Source => ({ rank: rank.get(id), main: mainOf(id) + mainSize(id), centre: centre(id, final), end: final.cross.get(id) + final.sizes[id] });
    const exitSource = (loopId: string): Source => ({ rank: anchoring.loops.get(loopId).rank, main: bands.get(loopId).far, centre: centre(loopId, final), end: bands.get(loopId).hi });
    const sourceOf = (edge: TopologyEdge): Source => (exits(edge) ? exitSource(edge.sourceId) : nodeSource(edge.sourceId));
    // A split shares its anchor's rank, so the stem into it is never a back edge; an edge leaving it back to an earlier rank is.
    const isBackEdge = (edge: TopologyEdge): boolean => !splitIds.has(edge.targetId) && rank.get(edge.targetId) <= sourceOf(edge).rank;
    const skippedBy = (edge: TopologyEdge, from: Source): string[] =>
        [...ranks.entries()].filter(([r]) => r > from.rank && r < rank.get(edge.targetId)).flatMap(([, ids]) => ids);
    const lane = { count: 0 };
    const edgeBows = spreadArrivals(graph.edges.filter((edge) => !isBackEdge(edge)));
    const vias = new Map<string, NodePosition[]>();
    const starts = new Map<string, NodePosition>();
    graph.edges.forEach((edge) => {
        const from = sourceOf(edge);
        if (exits(edge)) {
            starts.set(edge.id, place(from.main, from.centre));
        }
        if (isBackEdge(edge)) {
            vias.set(edge.id, backEdgeVias(edge, from, frame, final, mainOf, offsets.get(edge.sourceId)));
            return;
        }
        if (rank.get(edge.targetId) - from.rank > 1) {
            const bends = { first: frame.main(from.rank + 1) - LANE_LEAD, last: mainOf(edge.targetId) - BEND_OFFSET };
            const arrival = centre(edge.targetId, final) + (edgeBows[edge.id] ?? 0) * ARRIVAL_BOW_PX;
            vias.set(edge.id, longEdgeVias(edge, skippedBy(edge, from), lane, final, bends, place, arrival));
            return;
        }
        // A stem is the only edge between its source and the split, so it turns halfway along instead of at a
        // staggered bend that can land inside the split; so does the exit that continues into a split.
        const past = edge.kind === "stem" ? frame.stem / 2 : splitIds.has(edge.targetId) ? (mainOf(edge.targetId) - from.main) / 2 : offsets.get(edge.sourceId);
        vias.set(edge.id, [place(from.main + past, from.centre)]);
    });
    const boxes = new Map<string, LoopBox>();
    bands.forEach((band, loopId) =>
        boxes.set(loopId, frame.vertical
            ? { x: band.lo, y: band.near, width: band.hi - band.lo, height: band.far - band.near }
            : { x: band.near, y: band.lo, width: band.far - band.near, height: band.hi - band.lo })
    );
    return { ...collectLayout(graph, positions, vias, starts, boxes, frame, cardHeights), edgeBows };
}

function shift(point: NodePosition, dx: number, dy: number): NodePosition {
    return { x: point.x - dx, y: point.y - dy };
}

function collectLayout(
    graph: TopologyGraph,
    positions: Map<string, NodePosition>,
    vias: Map<string, NodePosition[]>,
    starts: Map<string, NodePosition>,
    boxes: Map<string, LoopBox>,
    frame: Frame,
    cardHeights: Record<string, number>
): Omit<TopologyLayout, "edgeBows"> {
    const corners = [...boxes.values()].flatMap((box) => [{ x: box.x, y: box.y }, { x: box.x + box.width, y: box.y + box.height }]);
    const points = [...positions.values(), ...[...vias.values()].flat(), ...corners];
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
    const edgeStarts: Record<string, NodePosition> = {};
    const loopBoxes: Record<string, LoopBox> = {};
    let right = 0;
    let height = 0;
    positions.forEach((position, id) => {
        const normalised = shift(position, minX, minY);
        const bucket = agentIds.has(id) ? agentPositions : splitIds.has(id) ? splitPositions : triggerPositions;
        bucket[id] = normalised;
        right = Math.max(right, normalised.x + frame.extents[id].width);
        height = Math.max(height, normalised.y + frame.extents[id].height);
    });
    // A wrapped back edge, and a loop's box, are part of the drawn bounds.
    vias.forEach((points, edgeId) => {
        edgeVias[edgeId] = points.map((via) => shift(via, minX, minY));
        edgeVias[edgeId].forEach((via) => {
            right = Math.max(right, via.x);
            height = Math.max(height, via.y);
        });
    });
    starts.forEach((start, edgeId) => (edgeStarts[edgeId] = shift(start, minX, minY)));
    boxes.forEach((box, loopId) => {
        loopBoxes[loopId] = { ...box, x: box.x - minX, y: box.y - minY };
        right = Math.max(right, loopBoxes[loopId].x + box.width);
        height = Math.max(height, loopBoxes[loopId].y + box.height);
    });
    const left = !frame.vertical && graph.triggers.length ? triggerLabelSlack(graph.triggers) : 0;
    return { agentPositions, triggerPositions, splitPositions, cardHeights, edgeVias, edgeStarts, loopBoxes, left, width: right - left, height };
}
