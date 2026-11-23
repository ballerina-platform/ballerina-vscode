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

const GAP = 4;
const MARGIN = 8;
// Wide enough for a record's fields a few levels deep.
const MIN_WIDTH = 420;
const MAX_HEIGHT_SHARE = 0.7;
// Below the field unless the space there is too small for a useful list and more room is above.
const MIN_BELOW = 320;
// Beside the form: the gap to the form's edge, how close to the picker's corners the notch may go, and how far above
// the field a picker sized to its list starts.
const SIDE_GAP = 10;
const NOTCH_INSET = 14;
const SIDE_LEAD = 56;
const CARD_GAP = 16;

export interface Rect {
    top: number;
    bottom: number;
    left: number;
    right: number;
    width: number;
}

interface Size {
    width: number;
    height: number;
}

export interface Placement {
    left: number;
    width: number;
    maxHeight?: number;
    height?: number;
    top?: number;
    bottom?: number;
    // Beside the form, where the notch that points at the field sits, from the picker's top or bottom edge.
    notch?: { top?: number; bottom?: number };
    // Beside the form, the space above a picker sized to its list, which gives way first when the list is long.
    lead?: number;
}

/**
 * Beside the form, over the canvas: a band as tall as the form, with a notch at the field. The picker sits in the band
 * a little above the field, sized to its list, and moves up only when the list needs the room. Undefined when the
 * window leaves too little room left of the form.
 */
export function placeBeside(field: Rect, form: Pick<Rect, "left" | "top" | "bottom">, viewport: Size): Placement | undefined {
    const left = form.left - SIDE_GAP - MIN_WIDTH;
    if (left < MARGIN) {
        return undefined;
    }
    const top = Math.max(MARGIN, form.top);
    const height = Math.min(form.bottom, viewport.height - MARGIN) - top;
    const middle = (field.top + field.bottom) / 2;
    const notch = Math.min(Math.max(middle - top, NOTCH_INSET), height - NOTCH_INSET);
    const lead = Math.min(Math.max(field.top - SIDE_LEAD - top, 0), height);
    return { left, width: MIN_WIDTH, top, height, notch: { top: notch }, lead };
}

/** Where the picker goes for a field at `rect` when there is no room beside the form: right-aligned below it, or above. */
export function placePicker(rect: Omit<Rect, "left">, viewport: Size): Placement {
    const width = Math.min(Math.max(rect.width, MIN_WIDTH), viewport.width - 2 * MARGIN);
    const left = Math.min(Math.max(rect.right - width, MARGIN), viewport.width - width - MARGIN);
    const cap = viewport.height * MAX_HEIGHT_SHARE;
    const below = viewport.height - rect.bottom - GAP - MARGIN;
    const above = rect.top - GAP - MARGIN;
    if (below >= MIN_BELOW || below >= above) {
        return { left, width, top: rect.bottom + GAP, maxHeight: Math.min(cap, below) };
    }
    return { left, width, bottom: viewport.height - rect.top + GAP, maxHeight: Math.min(cap, above) };
}

/** A hover card goes before the row it describes, else after it, else under or over it, and always stays on screen. */
export function placeCard(row: Rect, card: Size, viewport: Size): { top: number; left: number } {
    const top = Math.max(MARGIN, Math.min(row.top, viewport.height - card.height - MARGIN));
    const before = row.left - card.width - CARD_GAP;
    if (before >= MARGIN) {
        return { top, left: before };
    }
    const after = row.right + CARD_GAP;
    if (after + card.width <= viewport.width - MARGIN) {
        return { top, left: after };
    }
    const left = Math.max(MARGIN, Math.min(row.left, viewport.width - card.width - MARGIN));
    const below = row.bottom + GAP;
    return { left, top: below + card.height <= viewport.height - MARGIN ? below : Math.max(MARGIN, row.top - card.height - GAP) };
}
