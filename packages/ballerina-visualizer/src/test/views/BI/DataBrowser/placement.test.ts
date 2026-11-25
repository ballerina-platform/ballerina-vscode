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

import { placeBeside, placeCard, placePicker } from "../../../../views/BI/DataBrowser/placement";

const viewport = { width: 1200, height: 800 };

describe("placePicker", () => {
    it("opens below the field, right-aligned and wide enough for nested fields", () => {
        expect(placePicker({ top: 100, bottom: 136, right: 1100, width: 300 }, viewport))
            .toEqual({ left: 680, width: 420, top: 140, maxHeight: 560 });
    });

    it("flips above a field near the bottom of the window", () => {
        expect(placePicker({ top: 650, bottom: 686, right: 1180, width: 380 }, viewport))
            .toEqual({ left: 760, width: 420, bottom: 154, maxHeight: 560 });
    });

    it("stays below when there is more room there, even if short", () => {
        const placement = placePicker({ top: 200, bottom: 560, right: 500, width: 380 }, viewport);
        expect(placement.top).toBe(564);
        expect(placement.maxHeight).toBe(228);
    });

    it("keeps inside the window's left edge", () => {
        expect(placePicker({ top: 100, bottom: 136, right: 300, width: 300 }, viewport).left).toBe(8);
    });
});

describe("placeBeside", () => {
    const field = (top: number) => ({ top, bottom: top + 36, left: 900, right: 1180, width: 280 });

    const form = { left: 880, top: 0, bottom: 800 };

    it("takes a band left of the form, as tall as it, pointing at the field", () => {
        expect(placeBeside(field(200), form, viewport))
            .toEqual({ left: 450, width: 420, top: 8, height: 784, notch: { top: 210 }, lead: 136 });
    });

    it("keeps the band for another field and moves the notch and the space above", () => {
        const other = placeBeside(field(600), form, viewport);
        expect(other).toEqual({ ...placeBeside(field(200), form, viewport), notch: { top: 610 }, lead: 536 });
    });

    it("keeps the notch off its corners", () => {
        expect(placeBeside(field(-30), form, viewport)?.notch).toEqual({ top: 14 });
        expect(placeBeside(field(790), form, viewport)?.notch).toEqual({ top: 770 });
    });

    it("follows a form that does not fill the window", () => {
        expect(placeBeside(field(200), { left: 880, top: 60, bottom: 700 }, viewport)).toMatchObject({ top: 60, height: 640 });
    });

    it("gives up when the window leaves too little room left of the form", () => {
        expect(placeBeside(field(200), { ...form, left: 400 }, viewport)).toBeUndefined();
    });
});

describe("placeCard", () => {
    const card = { width: 320, height: 120 };
    const row = (left: number, right: number) => ({ top: 300, bottom: 332, left, right, width: right - left });

    it("goes before the row when there is room", () => {
        expect(placeCard(row(460, 860), card, viewport)).toEqual({ top: 300, left: 124 });
    });

    it("goes after the row when only that side has room", () => {
        expect(placeCard(row(200, 600), card, viewport)).toEqual({ top: 300, left: 616 });
    });

    it("goes under the row, without covering it, when neither side has room", () => {
        expect(placeCard(row(290, 1000), card, viewport)).toEqual({ top: 336, left: 290 });
    });

    it("goes over the row near the bottom of the window", () => {
        expect(placeCard({ ...row(290, 1000), top: 700, bottom: 732 }, card, viewport)).toEqual({ top: 576, left: 290 });
    });
});
