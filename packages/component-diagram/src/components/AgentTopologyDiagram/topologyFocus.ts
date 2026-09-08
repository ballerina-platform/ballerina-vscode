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

function handlerResolver(graph: TopologyGraph): (edge: TopologyEdge) => Handlers {
    const triggerIds = new Set(graph.triggers.map((trigger) => trigger.id));
    const splitTrigger = new Map(graph.splits.map((split) => [split.id, split.triggerId]));
    return (edge) => {
        if (edge.kind === "delegation") {
            return undefined;
        }
        if (triggerIds.has(edge.sourceId)) {
            return new Set([edge.sourceId]);
        }
        const split = splitTrigger.get(edge.sourceId) ?? splitTrigger.get(edge.targetId);
        if (split) {
            return new Set([split]);
        }
        const numbered = edge.chips.filter((chip) => chip.kind === "sequence" && chip.triggerId).map((chip) => chip.triggerId);
        return numbered.length ? new Set(numbered) : undefined;
    };
}

// The flow through a node, handler by handler: upstream to the triggers whose chains reach it (through the parents
// that delegate to it too), then downstream along those handlers' chains only, and along every delegation. A chain
// edge that belongs to another handler passing through the same card stays dark.
export function focusAround(graph: TopologyGraph, id: string): TopologyFocus {
    const nodes = new Set([id]);
    const edges = new Set<string>();
    const handlersOf = handlerResolver(graph);
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

    up(id, "any");
    const triggerIds = new Set(graph.triggers.map((trigger) => trigger.id));
    const runBy = new Set([...nodes].filter((node) => triggerIds.has(node)));
    down(id, runBy);
    return { nodes, edges };
}
