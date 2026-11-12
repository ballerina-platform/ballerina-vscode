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

// L1: Expression mode shows plain Ballerina source; every other mode keeps chips.

import { InputMode } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/types";
import { getEditorConfiguration } from "../components/editors/ExpressionField";
import { getArrayItemEditorConfiguration, RecordPreviewEditorConfig } from "../components/editors/MultiModeExpressionEditor/Configurations";
import { getEmptyCallCursorOffset, getPlainCallCursorOffset } from "../components/editors/MultiModeExpressionEditor/ChipExpressionEditor/utils";

const ALL_MODES = Object.values(InputMode) as InputMode[];

describe("chip rendering per input mode", () => {
    // The expanded Expression mode's wiring is covered in ExpressionField.test.tsx.
    it("getEditorConfiguration: only Expression mode turns chips off", () => {
        for (const mode of ALL_MODES) {
            expect(getEditorConfiguration(mode).showChips()).toBe(mode !== InputMode.EXP);
        }
    });

    it("array items: expression items turn chips off, text items keep them", () => {
        expect(getArrayItemEditorConfiguration(false).showChips()).toBe(false);
        expect(getArrayItemEditorConfiguration(true).showChips()).toBe(true);
    });

    it("the minimized record field shows chips but leaves editing to the record modal", () => {
        const config = new RecordPreviewEditorConfig();
        expect(config.showChips()).toBe(true);
        expect(config.showHelperPane()).toBe(false);
        expect(config.getIsToggleHelperAvailable()).toBe(false);
        // An identity round-trip means mounting the editor never rewrites the record value.
        const record = '{name: "Anne", age: 30}';
        expect(config.serializeValue(record)).toBe(record);
        expect(config.deserializeValue(record)).toBe(record);
    });

    it("a function inserted without chips leaves its argument list empty with the cursor inside", () => {
        // Without chips, $1/$2 placeholders would be plain text in the source.
        expect(getEmptyCallCursorOffset("getFullName()")).toBe("getFullName(".length);
        expect(getEmptyCallCursorOffset("${getFullName()}")).toBe("${getFullName(".length);
        expect(getEmptyCallCursorOffset("name")).toBe("name".length);
    });

    describe("cursor after a function inserted without chips", () => {
        const withArgs = (args: string[]) => jest.fn(async () => ({ label: "fn", args, currentArgIndex: 0 }));

        it("lands inside the parentheses when the function takes arguments", async () => {
            const extract = withArgs(["firstName", "lastName"]);
            expect(await getPlainCallCursorOffset("getFullName()", extract)).toBe("getFullName(".length);
            expect(await getPlainCallCursorOffset("${getFullName()}", extract)).toBe("${getFullName(".length);
            expect(extract).toHaveBeenCalledWith("getFullName()", "getFullName(".length);
        });

        it("lands after the call when the function takes none", async () => {
            expect(await getPlainCallCursorOffset("now()", withArgs([]))).toBe("now()".length);
            expect(await getPlainCallCursorOffset("${now()}", withArgs([]))).toBe("${now()}".length);
        });

        it("lands inside the parentheses when the arguments can't be looked up", async () => {
            const failing = jest.fn(async () => { throw new Error("LS unavailable"); });
            const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
            expect(await getPlainCallCursorOffset("getFullName()", failing)).toBe("getFullName(".length);
            expect(await getPlainCallCursorOffset("getFullName()")).toBe("getFullName(".length);
            warn.mockRestore();
        });
    });
});
