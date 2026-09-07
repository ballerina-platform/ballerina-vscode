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

import { TopologyFocus, TopologyGraph } from "./types";

type Direction = "in" | "out" | "both";

// The whole flow through a node: everything upstream to the triggers that run it and everything downstream to
// the leaves it reaches, split chains included. A node is visited once, so delegation cycles terminate.
export function focusAround(graph: TopologyGraph, id: string): TopologyFocus {
    const nodes = new Set([id]);
    const edges = new Set<string>();
    const walk = (from: string, direction: Direction) => {
        graph.edges.forEach((edge) => {
            const outgoing = edge.sourceId === from && direction !== "in";
            const incoming = edge.targetId === from && direction !== "out";
            if (!outgoing && !incoming) {
                return;
            }
            edges.add(edge.id);
            const next = outgoing ? edge.targetId : edge.sourceId;
            if (!nodes.has(next)) {
                nodes.add(next);
                walk(next, outgoing ? "out" : "in");
            }
        });
    };
    walk(id, "both");
    return { nodes, edges };
}
