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

import { clampOffset } from "../utils/diagram";

// A 200 x 300 flow at the origin, in a 600 x 400 canvas at the window's top-left corner.
function engineAt(offsetY: number) {
    const canvas = {
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 600, bottom: 400 }),
        ownerDocument: { defaultView: { innerWidth: 600, innerHeight: 400 } },
    };
    const model = {
        getNodes: () => [{ getX: () => 0, getY: () => 0, width: 200, height: 300 }],
        getZoomLevel: () => 100,
        getOffsetX: () => 0,
        getOffsetY: () => offsetY,
    };
    return { getModel: () => model, getCanvas: () => canvas } as any;
}

describe("clampOffset", () => {
    it("keeps the whole short flow on screen", () => {
        expect(clampOffset(engineAt(250))).toEqual({ x: 0, y: 100 });
    });

    it("clamps a requested offset instead of the current one", () => {
        expect(clampOffset(engineAt(0), 0, 250)).toEqual({ x: 0, y: 100 });
        expect(clampOffset(engineAt(250), 0, 50)).toEqual({ x: 0, y: 50 });
    });
});
