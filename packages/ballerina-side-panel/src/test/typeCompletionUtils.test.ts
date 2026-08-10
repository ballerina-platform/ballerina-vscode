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

// L1 (P0): getTypeCompletionSearchText — union-delimiter heuristic for the type
// completion filter. Migrated from the legacy node:test suite (test/*.test.mjs,
// which ran against built lib/) to Jest running against source. Table-driven: the
// rule is "the filter text is the trimmed union member the cursor sits in".

import { getTypeCompletionSearchText } from "../components/editors/typeCompletionUtils";

describe("getTypeCompletionSearchText", () => {
    // [description, value, cursorPosition, expected]
    const cases: Array<[string, string, number, string]> = [
        ["full text for a single type", "string", 6, "string"],
        ["resets after a union delimiter", "int|", 4, ""],
        ["returns the active union member", "int|str", 7, "str"],
        ["trims spaces around the active member", "int | str", 9, "str"],
        ["empty immediately after the delimiter", "int|string", 4, ""],
        ["empty input", "", 0, ""],
        ["cursor at start", "int", 0, ""],
        ["last member of a multi-member union", "int|float|str", 13, "str"],
        ["active prefix when cursor is mid-member", "int|string", 7, "str"],
    ];

    it.each(cases)("%s", (_desc, value, cursor, expected) => {
        expect(getTypeCompletionSearchText(value, cursor)).toBe(expected);
    });
});
