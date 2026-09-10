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
    ENTRY_CARD_WIDTH,
    ENTRY_FOOTER_HEIGHT,
    ENTRY_HEADER_HEIGHT,
    ENTRY_ROW_HEIGHT,
    LAYOUT_FIT_MARGIN,
    TOPOLOGY_COLUMN_GAP,
    TOPOLOGY_GAP_X,
    TOPOLOGY_GAP_X_MAX,
    TOPOLOGY_GAP_Y,
    TOPOLOGY_ROW_GAP,
} from "../../resources/constants";
import { LayoutOptions, NodePosition, TopologyEdge, TopologyEntryNode, TopologyGraph, TopologyLayout } from "./types";

const ORPHAN_FOOTER_HEIGHT = 26;
const LANE_CLEARANCE = 28;
const LANE_LEAD = 24;
// How far past the cards a back edge (a delegation cycle) wraps around.
const BACK_EDGE_CLEARANCE = 24;
const BEND_OFFSET = 40;
const BEND_STAGGER = 14;

export function estimateAgentCardHeight(orphan = false): number {
    return AGENT_CARD_MIN_HEIGHT + (orphan ? ORPHAN_FOOTER_HEIGHT : 0);
}

// A card's height follows the rows it draws, plus the "+N more" row when it folds the rest away.
export function entryCardHeight(entry: TopologyEntryNode, rows: number): number {
    if (entry.kind === "automation") {
        return ENTRY_HEADER_HEIGHT;
    }
    const shown = Math.min(rows, entry.handlers.length);
    const folded = shown < entry.handlers.length;
    return ENTRY_HEADER_HEIGHT + shown * ENTRY_ROW_HEIGHT + (folded ? ENTRY_FOOTER_HEIGHT : 0);
}

// Where a row's port sits, across the flow, measured from the card's own cross position. Left to right the rows
// run down the card's side, so a port sits level with its row; top to bottom they all leave the card's bottom
// edge, so they spread evenly across its width instead.
export function rowCrossOffset(index: number, count: number, vertical: boolean): number {
    return vertical
        ? ((index + 1) / (count + 1)) * ENTRY_CARD_WIDTH
        : ENTRY_HEADER_HEIGHT + index * ENTRY_ROW_HEIGHT + ENTRY_ROW_HEIGHT / 2;
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

// Everything the orientation decides: node extents, the gap between siblings, and where each rank sits
// along the flow axis.
interface Frame {
    vertical: boolean;
    crossGap: number;
    extents: Record<string, Extent>;
    main(rank: number): number;
}


function crossSizes(frame: Frame): Record<string, number> {
    const sizes: Record<string, number> = {};
    Object.entries(frame.extents).forEach(([id, extent]) => (sizes[id] = frame.vertical ? extent.width : extent.height));
    return sizes;
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

// Rank = longest path from an entry point. Agents nothing reaches start in the first agent rank
// and pull their own delegates along, so an untriggered supervisor still fans out.
function computeRanks(graph: TopologyGraph, edges: TopologyEdge[]): Map<string, number> {
    const rank = new Map<string, number>();
    const children = adjacency(edges, "sourceId", "targetId");
    graph.entries.forEach((entry) => rank.set(entry.id, 0));
    relaxRanks(rank, children, graph.entries.map((entry) => entry.id));
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

// Where an edge leaves: a node's out port.
interface Source {
    rank: number;
    main: number;
    centre: number;
    end: number;
}

function backEdgeVias(edge: TopologyEdge, from: Source, frame: Frame, final: Placement, mainOf: (id: string) => number, offset: number): NodePosition[] {
    const place = (main: number, cross: number): NodePosition => (frame.vertical ? { x: cross, y: main } : { x: main, y: cross });
    const target = edge.targetId;
    const start = from.main + offset;
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
    const columnsWidth = ENTRY_CARD_WIDTH + (columnCount - 1) * AGENT_CARD_WIDTH;
    const free = availableWidth - 2 * LAYOUT_FIT_MARGIN - columnsWidth;
    return Math.max(TOPOLOGY_GAP_X, Math.min(TOPOLOGY_GAP_X_MAX, Math.floor(free / (columnCount - 1))));
}


function horizontalFrame(graph: TopologyGraph, cardHeights: Record<string, number>, columnCount: number, availableWidth: number | undefined): Frame {
    const gap = resolveGapX(columnCount, availableWidth);
    const extents: Record<string, Extent> = {};
    graph.agents.forEach((agent) => (extents[agent.id] = { width: AGENT_CARD_WIDTH, height: cardHeights[agent.id] }));
    graph.entries.forEach((entry) => (extents[entry.id] = { width: ENTRY_CARD_WIDTH, height: cardHeights[entry.id] }));
    const main = (r: number): number => (r <= 0 ? 0 : ENTRY_CARD_WIDTH + gap + (r - 1) * (AGENT_CARD_WIDTH + gap));
    return { vertical: false, crossGap: TOPOLOGY_GAP_Y, extents, main };
}

// Rows are as tall as their tallest card.
function verticalFrame(graph: TopologyGraph, cardHeights: Record<string, number>, rank: Map<string, number>): Frame {
    const extents: Record<string, Extent> = {};
    const rowDepth = new Map<number, number>();
    graph.agents.forEach((agent) => {
        extents[agent.id] = { width: AGENT_CARD_WIDTH, height: cardHeights[agent.id] };
        const r = rank.get(agent.id) ?? 1;
        rowDepth.set(r, Math.max(rowDepth.get(r) ?? 0, cardHeights[agent.id]));
    });
    graph.entries.forEach((entry) => (extents[entry.id] = { width: ENTRY_CARD_WIDTH, height: cardHeights[entry.id] }));
    const entryDepth = Math.max(0, ...graph.entries.map((entry) => cardHeights[entry.id]));
    const main = (r: number): number => {
        if (r <= 0) {
            return 0;
        }
        let offset = entryDepth + TOPOLOGY_ROW_GAP;
        for (let k = 1; k < r; k++) {
            offset += (rowDepth.get(k) ?? AGENT_CARD_MIN_HEIGHT) + TOPOLOGY_ROW_GAP;
        }
        return offset;
    };
    return { vertical: true, crossGap: TOPOLOGY_COLUMN_GAP, extents, main };
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

// Where a node's first incoming edge falls, which follows the source order of the handler's calls.
function arrivals(graph: TopologyGraph): Map<string, number> {
    const result = new Map<string, number>();
    graph.edges.forEach((edge, order) => {
        if (!result.has(edge.targetId)) {
            result.set(edge.targetId, order);
        }
    });
    return result;
}

// Forward pass: each rank is ordered by where its parents sit, which keeps siblings together and edges from
// crossing; under one parent, nodes follow the source order of the calls that reach them. Nodes with no parent
// (orphans) keep their built order at the end.
function orderRanks(ranks: Map<number, string[]>, maxRank: number, parents: Adjacency, reached: Map<string, number>, frame: Frame, sizes: Record<string, number>): Placement {
    const provisional: Placement = { cross: new Map(), sizes, gap: frame.crossGap };
    stack(ranks.get(0) ?? [], provisional);
    for (let r = 1; r <= maxRank; r++) {
        const ids = ranks.get(r) ?? [];
        const key = (id: string): number => {
            const placed = (parents.get(id) ?? []).filter((parent) => provisional.cross.has(parent));
            return placed.length ? mean(placed.map((parent) => centre(parent, provisional))) : Number.MAX_SAFE_INTEGER;
        };
        const ordered = ids
            .map((id, index) => ({ id, index, key: key(id), via: reached.get(id) ?? Number.MAX_SAFE_INTEGER }))
            .sort((a, b) => a.key - b.key || a.via - b.via || a.index - b.index);
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
    const orders = (edge.handlers ?? []).map((step) => step.order);
    return orders.length ? Math.min(...orders) : Infinity;
}

// The parent an agent lines up under: the agent that runs it earliest in a chain (delegations rank after a
// handler's steps), or its trigger when no agent runs it and exactly one trigger does.
function primaryParents(graph: TopologyGraph, rank: Map<string, number>): Adjacency {
    const incoming = new Map<string, TopologyEdge[]>();
    graph.edges
        .filter((edge) => edge.sourceId !== edge.targetId)
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
    source: number,
    skipped: string[],
    lane: { count: number },
    final: Placement,
    bends: { first: number; last: number },
    place: (main: number, cross: number) => NodePosition,
    arrival: number
): NodePosition[] {
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

export function layoutTopology(graph: TopologyGraph, options: LayoutOptions = {}): TopologyLayout {
    const rank = computeRanks(graph, graph.edges);

    const cardHeights: Record<string, number> = {};
    graph.agents.forEach((agent) => (cardHeights[agent.id] = estimateAgentCardHeight(agent.orphan)));
    const rows = (entry: TopologyEntryNode): number => options.visibleRows?.[entry.id] ?? entry.handlers.length;
    graph.entries.forEach((entry) => (cardHeights[entry.id] = entryCardHeight(entry, rows(entry))));
    // Which row of its card a handler is, so its edges leave from that row's port and not from the card's centre.
    const rowAt = new Map<string, { index: number; count: number }>();
    graph.entries
        .filter((entry) => entry.kind === "service")
        .forEach((entry) => {
            const drawn = entry.handlers.slice(0, rows(entry));
            drawn.forEach((handler, index) => rowAt.set(handler.id, { index, count: drawn.length }));
        });

    const ranks = new Map<number, string[]>();
    [...graph.entries, ...graph.agents].forEach((node) => {
        const r = rank.get(node.id) ?? 1;
        ranks.set(r, [...(ranks.get(r) ?? []), node.id]);
    });
    const maxRank = Math.max(0, ...ranks.keys());
    const frame = options.orientation === "vertical"
        ? verticalFrame(graph, cardHeights, rank)
        : horizontalFrame(graph, cardHeights, maxRank + 1, options.availableWidth);
    const mainOf = (id: string): number => frame.main(rank.get(id) ?? 1);
    const mainSize = (id: string): number => (frame.vertical ? frame.extents[id].height : frame.extents[id].width);

    const sizes = crossSizes(frame);
    const provisional = orderRanks(ranks, maxRank, adjacency(graph.edges, "targetId", "sourceId"), arrivals(graph), frame, sizes);
    const final: Placement = { cross: new Map(), sizes, gap: frame.crossGap };
    // Each rank is placed after the rank it feeds, so every node is centred on what it runs; triggers go last.
    const children = adjacency(graph.edges, "sourceId", "targetId");
    for (let r = maxRank; r >= 0; r--) {
        placeRank(ranks.get(r) ?? [], children, provisional, final);
    }
    straightenUnderParents(ranks, primaryParents(graph, rank), final);

    const place = (main: number, cross: number): NodePosition => (frame.vertical ? { x: cross, y: main } : { x: main, y: cross });
    const positions = new Map<string, NodePosition>();
    final.cross.forEach((cross, id) => positions.set(id, place(mainOf(id), cross)));

    const offsets = bendOffsets([...ranks.values()], final);
    // A folded-away row has no port, so its edges leave the card's centre instead.
    const sourceCross = (edge: TopologyEdge): number => {
        const row = edge.handlerId ? rowAt.get(edge.handlerId) : undefined;
        return row === undefined
            ? centre(edge.sourceId, final)
            : final.cross.get(edge.sourceId) + rowCrossOffset(row.index, row.count, frame.vertical);
    };
    const sourceOf = (edge: TopologyEdge): Source => ({
        rank: rank.get(edge.sourceId),
        main: mainOf(edge.sourceId) + mainSize(edge.sourceId),
        centre: sourceCross(edge),
        end: final.cross.get(edge.sourceId) + final.sizes[edge.sourceId],
    });
    const isBackEdge = (edge: TopologyEdge): boolean => rank.get(edge.targetId) <= rank.get(edge.sourceId);
    const skippedBy = (edge: TopologyEdge, from: Source): string[] =>
        [...ranks.entries()].filter(([r]) => r > from.rank && r < rank.get(edge.targetId)).flatMap(([, ids]) => ids);
    const lane = { count: 0 };
    const edgeBows = spreadArrivals(graph.edges.filter((edge) => !isBackEdge(edge)));
    const vias = new Map<string, NodePosition[]>();
    graph.edges.forEach((edge) => {
        const from = sourceOf(edge);
        if (isBackEdge(edge)) {
            vias.set(edge.id, backEdgeVias(edge, from, frame, final, mainOf, offsets.get(edge.sourceId)));
            return;
        }
        if (rank.get(edge.targetId) - from.rank > 1) {
            const bends = { first: frame.main(from.rank + 1) - LANE_LEAD, last: mainOf(edge.targetId) - BEND_OFFSET };
            const arrival = centre(edge.targetId, final) + (edgeBows[edge.id] ?? 0) * ARRIVAL_BOW_PX;
            vias.set(edge.id, longEdgeVias(from.centre, skippedBy(edge, from), lane, final, bends, place, arrival));
            return;
        }
        vias.set(edge.id, [place(from.main + offsets.get(edge.sourceId), from.centre)]);
    });
    const visibleRows: Record<string, number> = {};
    graph.entries.forEach((entry) => (visibleRows[entry.id] = Math.min(rows(entry), entry.handlers.length)));
    return { ...collectLayout(graph, positions, vias, frame, cardHeights), edgeBows, visibleRows };
}

function shift(point: NodePosition, dx: number, dy: number): NodePosition {
    return { x: point.x - dx, y: point.y - dy };
}

function collectLayout(
    graph: TopologyGraph,
    positions: Map<string, NodePosition>,
    vias: Map<string, NodePosition[]>,
    frame: Frame,
    cardHeights: Record<string, number>
): Omit<TopologyLayout, "edgeBows" | "visibleRows"> {
    const points = [...positions.values(), ...[...vias.values()].flat()];
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = xs.length ? Math.min(...xs) : 0;
    const minY = ys.length ? Math.min(...ys) : 0;
    const agentIds = new Set(graph.agents.map((agent) => agent.id));
    const agentPositions: Record<string, NodePosition> = {};
    const entryPositions: Record<string, NodePosition> = {};
    const edgeVias: Record<string, NodePosition[]> = {};
    let right = 0;
    let height = 0;
    positions.forEach((position, id) => {
        const normalised = shift(position, minX, minY);
        const bucket = agentIds.has(id) ? agentPositions : entryPositions;
        bucket[id] = normalised;
        right = Math.max(right, normalised.x + frame.extents[id].width);
        height = Math.max(height, normalised.y + frame.extents[id].height);
    });
    // A wrapped back edge is part of the drawn bounds.
    vias.forEach((points, edgeId) => {
        edgeVias[edgeId] = points.map((via) => shift(via, minX, minY));
        edgeVias[edgeId].forEach((via) => {
            right = Math.max(right, via.x);
            height = Math.max(height, via.y);
        });
    });
    return { agentPositions, entryPositions, cardHeights, edgeVias, left: 0, width: right, height };
}
