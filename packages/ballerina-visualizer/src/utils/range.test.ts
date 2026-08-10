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

// L1 (P0): expression range/offset math invariants (docs/TEST_BACKLOG.md L1-04).
// Rules asserted over a corpus, not per-issue cases. calculateExpressionOffsets maps
// a cursor index within a (possibly multi-line) expression to the {line, char} the LS
// needs; getting it wrong misplaces every diagnostic/completion for multi-line
// expressions (the #1205/#354/#596 class). updateLineRange shifts only the origin
// range and must leave any real range untouched.

import type { LineRange } from "@wso2/ballerina-core";
import { calculateExpressionOffsets, updateLineRange } from "./range";

describe("calculateExpressionOffsets", () => {
    it("INVARIANT: single-line expression → lineOffset 0, charOffset = cursor index", () => {
        for (const [expr, cursor] of [["", 0], ["a", 1], ["hello world", 5], ["x + y", 3]] as [string, number][]) {
            expect(calculateExpressionOffsets(expr, cursor)).toEqual({ lineOffset: 0, charOffset: cursor });
        }
    });

    it("INVARIANT: lineOffset equals the number of newlines before the cursor", () => {
        const expr = "a\nbb\nccc\ndddd";
        for (let cursor = 0; cursor <= expr.length; cursor++) {
            const expectedLines = expr.slice(0, cursor).split("\n").length - 1;
            expect(calculateExpressionOffsets(expr, cursor).lineOffset).toBe(expectedLines);
        }
    });

    it("INVARIANT: charOffset equals the distance from the last newline to the cursor", () => {
        const expr = "let x =\n  foo(\n    bar)";
        for (let cursor = 0; cursor <= expr.length; cursor++) {
            const before = expr.slice(0, cursor);
            const lastNl = before.lastIndexOf("\n");
            const expectedChar = lastNl === -1 ? before.length : before.length - lastNl - 1;
            expect(calculateExpressionOffsets(expr, cursor).charOffset).toBe(expectedChar);
        }
    });

    it("cursor immediately after a newline → charOffset 0 and line advanced", () => {
        // "a\n|b"  → cursor index 2 sits at the start of line 1
        expect(calculateExpressionOffsets("a\nb", 2)).toEqual({ lineOffset: 1, charOffset: 0 });
    });

    it("only counts content before the cursor (text after is ignored)", () => {
        // same prefix, different suffixes → identical result
        expect(calculateExpressionOffsets("ab\ncd", 4)).toEqual(calculateExpressionOffsets("ab\ncdefg", 4));
    });
});

describe("updateLineRange", () => {
    const zero: LineRange = { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } };

    it("shifts the all-zero origin range by the offset on both ends (lines stay 0)", () => {
        expect(updateLineRange(zero, 5)).toEqual({
            startLine: { line: 0, offset: 5 },
            endLine: { line: 0, offset: 5 },
        });
    });

    it("does not mutate the input range", () => {
        updateLineRange(zero, 5);
        expect(zero).toEqual({ startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } });
    });

    it("INVARIANT: any non-origin range is returned unchanged for any offset", () => {
        const realRanges: LineRange[] = [
            { startLine: { line: 2, offset: 0 }, endLine: { line: 2, offset: 4 } },
            { startLine: { line: 0, offset: 3 }, endLine: { line: 0, offset: 7 } },
            { startLine: { line: 0, offset: 0 }, endLine: { line: 1, offset: 0 } },
            { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 2 } },
        ];
        for (const r of realRanges) {
            for (const offset of [0, 3, -1, 100]) {
                expect(updateLineRange(r, offset)).toBe(r); // same reference, untouched
            }
        }
    });
});
