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

// L2 (P0): TypeBrowser search matching (docs/TEST_BACKLOG.md L2-18, type-browser).
// Extracted from TypeBrowser.tsx. Invariants over a corpus, not per-issue cases —
// they specify what the type search must tolerate (case, whitespace, optional `?`,
// array `[]`) so valid types don't vanish from the picker as the user types
// (#602/#619 class), plus the structural guarantees any filter must keep.

import { filterTypeBrowserItems } from "./utils";

const TYPES = ["string", "int", "boolean", "MyRecord", "http:Response", "int[]", "User Type"];

describe("filterTypeBrowserItems", () => {
    it("empty query returns all items unchanged", () => {
        expect(filterTypeBrowserItems(TYPES, "")).toBe(TYPES);
    });

    it("INVARIANT: the result is always a subset of the input, order preserved", () => {
        for (const q of ["", "in", "xyz", "RESP", "my record", "int[]", "?"]) {
            const out = filterTypeBrowserItems(TYPES, q);
            expect(out.every((x) => TYPES.includes(x))).toBe(true);
            expect(out).toEqual(TYPES.filter((x) => out.includes(x))); // same relative order
        }
    });

    it("matches case-insensitively", () => {
        expect(filterTypeBrowserItems(TYPES, "STRING")).toContain("string");
        expect(filterTypeBrowserItems(TYPES, "myrecord")).toContain("MyRecord");
    });

    it("ignores whitespace in the query and the item", () => {
        expect(filterTypeBrowserItems(TYPES, "my record")).toContain("MyRecord");
        expect(filterTypeBrowserItems(TYPES, "usertype")).toContain("User Type");
    });

    it("INVARIANT: a trailing optional marker `?` in the query does not exclude the base type (#602/#619)", () => {
        expect(filterTypeBrowserItems(TYPES, "int?")).toContain("int");
        expect(filterTypeBrowserItems(TYPES, "string?")).toContain("string");
    });

    it("INVARIANT: an array suffix `[]` in the query still matches the element type", () => {
        expect(filterTypeBrowserItems(TYPES, "int[]")).toContain("int");
        expect(filterTypeBrowserItems(TYPES, "int[]")).toContain("int[]");
    });

    it("excludes items that do not contain the normalized query", () => {
        expect(filterTypeBrowserItems(TYPES, "zzz")).toEqual([]);
        expect(filterTypeBrowserItems(TYPES, "bool")).toEqual(["boolean"]);
    });

    it("INVARIANT: searches the ENTIRE list — a match beyond any display limit is returned (#412)", () => {
        // #412: search must not exclude types beyond the list's display limit. The filter
        // itself must never cap results — a unique match at the very end of a large list is
        // still found (any downstream display cap must be applied AFTER filtering, not before).
        const many = Array.from({ length: 500 }, (_, i) => `Type${i}`);
        expect(filterTypeBrowserItems(many, "type499")).toEqual(["Type499"]);
        expect(filterTypeBrowserItems(many, "type").length).toBe(500);
    });
});
