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

import { linkRoute, route } from "../components/NodeLink/topologyRoute";
import { TopologyLinkModel } from "../components/NodeLink/TopologyLinkModel";

describe("route", () => {
    it("puts a wrapped back edge's chips on the leg leaving the source", () => {
        const source = { x: 700, y: 50 };
        const target = { x: 100, y: 50 };
        const via = [{ x: 760, y: 50 }, { x: 760, y: 200 }, { x: 60, y: 200 }, { x: 60, y: 50 }];
        const drawn = route(source, target, via, 0, false);
        expect(drawn.points).toHaveLength(6);
        expect(drawn.run).toEqual([source, { x: 760, y: 50 }]);
    });

    it("keeps a detoured long edge's chips on the leg into the target", () => {
        const source = { x: 100, y: 50 };
        const target = { x: 900, y: 50 };
        const via = [{ x: 400, y: 50 }, { x: 400, y: 200 }, { x: 860, y: 200 }, { x: 860, y: 50 }];
        const drawn = route(source, target, via, 0, false);
        expect(drawn.run).toEqual([{ x: 860, y: 50 }, target]);
    });

    it("spreads a detoured arrival by its bow like a plain one", () => {
        const source = { x: 100, y: 50 };
        const target = { x: 900, y: 50 };
        const via = [{ x: 860, y: 50 }, { x: 860, y: 70 }];
        const drawn = route(source, target, via, 20, false);
        expect(drawn.points[drawn.points.length - 1]).toEqual({ x: 900, y: 70 });
        expect(drawn.run).toEqual([{ x: 860, y: 70 }, { x: 900, y: 70 }]);
    });

    it("reads the flow axis vertically when asked", () => {
        const source = { x: 50, y: 700 };
        const target = { x: 50, y: 100 };
        const via = [{ x: 50, y: 760 }, { x: 300, y: 760 }, { x: 300, y: 60 }, { x: 50, y: 60 }];
        const drawn = route(source, target, via, 0, true);
        expect(drawn.run).toEqual([source, { x: 50, y: 760 }]);
    });

});
