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

import { TopologyEdge, TopologyFocus, TopologyGraph } from "./types";

// Which handlers an edge is part of; undefined for delegation, which runs whenever its source runs.
type Handlers = Set<string> | undefined;

function intersect(a: Set<string>, b: Set<string>): Set<string> {
    return new Set([...a].filter((item) => b.has(item)));
}

function handlerResolver(): (edge: TopologyEdge) => Handlers {
    return (edge) => {
        if (edge.kind === "delegation") {
            return undefined;
        }
        if (edge.handlerId) {
            return new Set([edge.handlerId]);
        }
        const stepped = (edge.handlers ?? []).map((step) => step.triggerId);
        return stepped.length ? new Set(stepped) : undefined;
    };
}

// The flow through a node, handler by handler: upstream to the triggers whose chains reach it (through the parents
// that delegate to it too), then downstream along those handlers' chains only, and along every delegation. A chain
// edge that belongs to another handler running through the same card stays dark.
export function focusAround(graph: TopologyGraph, id: string): TopologyFocus {
    // Hovering a row lights that handler's flow; hovering the card lights every handler on it. Either way the
    // walk starts at the card, which is the node the edges leave.
    const entry = graph.entries.find((candidate) => candidate.id === id || candidate.handlers.some((handler) => handler.id === id));
    const seedHandlers = entry ? (entry.id === id ? entry.handlers.map((handler) => handler.id) : [id]) : [];
    const start = entry ? entry.id : id;
    const nodes = new Set(entry ? [id, entry.id] : [id]);
    const edges = new Set<string>();
    const handlersOf = handlerResolver();
    const visited = new Set<string>();
    const key = (node: string, allowed: Set<string> | "any", direction: string) =>
        `${direction}|${node}|${allowed === "any" ? "*" : [...allowed].sort().join(",")}`;

    const up = (node: string, allowed: Set<string> | "any"): void => {
        if (visited.has(key(node, allowed, "up"))) {
            return;
        }
        visited.add(key(node, allowed, "up"));
        graph.edges.filter((edge) => edge.targetId === node && edge.sourceId !== node).forEach((edge) => {
            const own = handlersOf(edge);
            const next = own === undefined ? "any" : allowed === "any" ? own : intersect(allowed, own);
            if (next !== "any" && next.size === 0) {
                return;
            }
            edges.add(edge.id);
            nodes.add(edge.sourceId);
            up(edge.sourceId, edge.kind === "delegation" ? "any" : next);
        });
    };

    const down = (node: string, allowed: Set<string>): void => {
        if (visited.has(key(node, allowed, "down"))) {
            return;
        }
        visited.add(key(node, allowed, "down"));
        graph.edges.filter((edge) => edge.sourceId === node).forEach((edge) => {
            const own = handlersOf(edge);
            const next = own === undefined ? new Set<string>() : intersect(allowed, own);
            if (own !== undefined && next.size === 0) {
                return;
            }
            edges.add(edge.id);
            nodes.add(edge.targetId);
            if (edge.targetId !== node) {
                down(edge.targetId, next);
            }
        });
    };

    up(start, seedHandlers.length ? new Set(seedHandlers) : "any");
    // Every handler the walk upstream arrived at, so the downstream walk follows only those flows.
    const reached = new Set([...graph.entries.flatMap((candidate) => candidate.handlers)]
        .filter((handler) => nodes.has(handler.id) || seedHandlers.includes(handler.id))
        .map((handler) => handler.id));
    graph.edges.forEach((edge) => {
        if (edges.has(edge.id) && edge.handlerId) {
            reached.add(edge.handlerId);
        }
    });
    down(start, reached);
    reached.forEach((handlerId) => nodes.add(handlerId));
    return { nodes, edges };
}
