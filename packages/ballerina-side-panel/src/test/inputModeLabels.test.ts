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

// L1: InputMode values are identifiers compared with ===, while the mode switcher shows
// getInputModeLabel(mode). Renaming a mode for the UI must go through the label map, never the
// enum value, or two modes collapse into one (TypeScript allows duplicate string enum values).

import {
    InputMode,
    getInputModeLabel
} from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types";

const ALL_MODES = Object.values(InputMode) as InputMode[];

describe("InputMode identity", () => {
    it("every mode has a unique value", () => {
        expect(new Set(ALL_MODES).size).toBe(ALL_MODES.length);
    });
});

describe("getInputModeLabel", () => {
    it("every mode has a non-empty label", () => {
        for (const mode of ALL_MODES) {
            expect(getInputModeLabel(mode).trim()).not.toBe("");
        }
    });

    // Two modes sharing a label would render as two identical options if they ever met in one
    // switcher. The only deliberate exception is the Array pair: a text-set field and a generic
    // array field never appear together, since the secondary mode is the field's last input
    // type (normally Expression). Widen this list only with the same justification.
    const SHARED_LABEL_GROUPS: InputMode[][] = [[InputMode.ARRAY, InputMode.TEXT_ARRAY]];

    it("every label is unique except the documented shared groups", () => {
        const sharedKey = (mode: InputMode) =>
            SHARED_LABEL_GROUPS.findIndex(group => group.includes(mode));
        const owners = new Map<string, InputMode>();
        for (const mode of ALL_MODES) {
            const label = getInputModeLabel(mode);
            const owner = owners.get(label);
            if (owner === undefined) {
                owners.set(label, mode);
                continue;
            }
            const group = sharedKey(mode);
            expect({ label, modes: [owner, mode], shared: group !== -1 && group === sharedKey(owner) })
                .toEqual({ label, modes: [owner, mode], shared: true });
        }
    });

    it("the shared groups still share a label", () => {
        for (const group of SHARED_LABEL_GROUPS) {
            expect(new Set(group.map(getInputModeLabel)).size).toBe(1);
        }
    });

    it("shows a text-set field as an Array", () => {
        expect(getInputModeLabel(InputMode.TEXT_ARRAY)).toBe("Array");
    });

    it("falls back to the mode value when no label override exists", () => {
        expect(getInputModeLabel(InputMode.EXP)).toBe(InputMode.EXP);
        expect(getInputModeLabel(InputMode.TEXT)).toBe(InputMode.TEXT);
    });
});
