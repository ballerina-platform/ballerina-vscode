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

import { focusBounds } from "../components/AgentTopologyDiagram/topologyBounds";
import { AGENT_CARD_WIDTH, TRIGGER_NODE_WIDTH } from "../resources/constants";
import { TopologyLayout } from "../components/AgentTopologyDiagram/types";

const layout: TopologyLayout = {
    agentPositions: { a: { x: 400, y: 0 }, b: { x: 400, y: 200 } },
    triggerPositions: { t1: { x: 0, y: 28 }, t2: { x: 0, y: 228 } },
    splitPositions: {},
    cardHeights: { a: 112, b: 112 },
    edgeVias: { "t1->a": [{ x: 380, y: 56 }], "t2->b": [{ x: 380, y: 256 }, { x: 380, y: 400 }] },
    edgeBows: {},
    edgeStarts: {},
    loopBoxes: { "t2::L": { x: 360, y: 150, width: 380, height: 200 } },
    left: 96,
    width: 680,
    height: 312,
};

describe("focusBounds", () => {
    it("boxes the lit nodes and their edges' bends, leaving the rest out", () => {
        const bounds = focusBounds(layout, { nodes: new Set(["t1", "a"]), edges: new Set(["t1->a"]) }, "horizontal");
        expect(bounds).toEqual({ left: 0, top: 0, width: 400 + AGENT_CARD_WIDTH, height: 112 });
        expect(TRIGGER_NODE_WIDTH).toBeLessThan(400);
    });

    it("stretches to a detour's bends", () => {
        const bounds = focusBounds(layout, { nodes: new Set(["t2", "b"]), edges: new Set(["t2->b"]) }, "horizontal");
        expect(bounds.top).toBe(200);
        expect(bounds.top + bounds.height).toBe(400);
    });

    it("has nothing to fit when nothing is lit", () => {
        expect(focusBounds(layout, { nodes: new Set(), edges: new Set() }, "horizontal")).toBeUndefined();
    });

    it("includes a lit loop's box", () => {
        const bounds = focusBounds({ ...layout, splitPositions: { "t2::L": { x: 340, y: 238 } } }, { nodes: new Set(["t2::L", "b"]), edges: new Set() }, "horizontal");
        expect(bounds).toEqual({ left: 340, top: 150, width: 400, height: 200 });
    });
});
