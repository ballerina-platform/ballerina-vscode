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

// L1 (P0): diagnostic-mapping invariants (docs/TEST_BACKLOG.md L1-04).
// These are rules asserted over a corpus, not per-issue cases: they specify what
// each filter must guarantee about its OUTPUT, so any input that violates the rule
// (present or future) fails — catching the class of "duplicate diagnostics shown"
// / "unsupported diagnostic leaked" bugs rather than one reported instance.

import type { Diagnostic } from "@wso2/ballerina-core";
import {
    removeDuplicateDiagnostics,
    filterUnsupportedDiagnostics,
    filterToolInputSymbolDiagnostics,
} from "./diagnostics";

const diag = (
    message: string,
    startLine = 0,
    startChar = 0,
    endLine = startLine,
    endChar = startChar + 1
): Diagnostic =>
    ({
        message,
        range: { start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } },
    } as Diagnostic);

// identity key used only by the tests to reason about "same diagnostic"
const key = (d: Diagnostic) =>
    `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character}|${d.message}`;

describe("removeDuplicateDiagnostics", () => {
    const corpus: Diagnostic[] = [
        diag("undefined symbol 'x'", 1, 4),
        diag("undefined symbol 'x'", 1, 4), // exact dup of #0
        diag("undefined symbol 'x'", 1, 5), // same message, different range → distinct
        diag("missing token", 1, 4), // same range, different message → distinct
        diag("undefined symbol 'x'", 1, 4), // another exact dup of #0
        diag("missing token", 2, 0, 2, 3),
    ];

    it("INVARIANT: output contains no two diagnostics with identical range+message", () => {
        const out = removeDuplicateDiagnostics(corpus);
        const keys = out.map(key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("INVARIANT: output is a subset preserving first-seen order", () => {
        const out = removeDuplicateDiagnostics(corpus);
        // every kept item existed in the input, and order matches first appearance
        const firstSeen = corpus.map(key).filter((k, i, self) => self.indexOf(k) === i);
        expect(out.map(key)).toEqual(firstSeen);
    });

    it("INVARIANT: diagnostics differing in any range coord or message are all kept", () => {
        // no two of these collide → nothing is dropped
        const distinct = [
            diag("m", 0, 0),
            diag("m", 0, 1),
            diag("m", 1, 0),
            diag("m", 0, 0, 0, 2),
            diag("n", 0, 0),
        ];
        expect(removeDuplicateDiagnostics(distinct)).toHaveLength(distinct.length);
    });

    it("empty input → empty output", () => {
        expect(removeDuplicateDiagnostics([])).toEqual([]);
    });
});

describe("filterUnsupportedDiagnostics", () => {
    const UNSUPPORTED = ["unknown type", "undefined module"];

    it("INVARIANT: no surviving message starts with an unsupported prefix", () => {
        const corpus = [
            diag("unknown type 'Foo'"),
            diag("undefined module 'bar'"),
            diag("undefined symbol 'x'"),
            diag("incompatible types"),
            diag("unknown type"),
        ];
        const out = filterUnsupportedDiagnostics(corpus);
        expect(out.every((d) => !UNSUPPORTED.some((p) => d.message.startsWith(p)))).toBe(true);
    });

    it("INVARIANT: every diagnostic NOT starting with an unsupported prefix is retained", () => {
        const supported = [diag("undefined symbol 'x'"), diag("incompatible types"), diag("syntax error")];
        expect(filterUnsupportedDiagnostics(supported)).toEqual(supported);
    });

    it("matches by prefix, not substring — a mention mid-message is kept", () => {
        const midMention = diag("the unknown type here is fine");
        expect(filterUnsupportedDiagnostics([midMention])).toEqual([midMention]);
    });

    it("empty input → empty output", () => {
        expect(filterUnsupportedDiagnostics([])).toEqual([]);
    });
});

describe("filterToolInputSymbolDiagnostics", () => {
    const toolInputs = [
        { type: "string", variable: "code" },
        { type: "int", variable: "count" },
    ];

    it("INVARIANT: returns input unchanged when there are no tool inputs", () => {
        const corpus = [diag("undefined symbol 'code'"), diag("undefined symbol 'other'")];
        expect(filterToolInputSymbolDiagnostics(corpus, [])).toBe(corpus);
        expect(filterToolInputSymbolDiagnostics(corpus, undefined)).toBe(corpus);
    });

    it("INVARIANT: no surviving 'undefined symbol' names a tool-input variable", () => {
        const corpus = [
            diag("undefined symbol 'code'"), // → filtered (tool input)
            diag("undefined symbol 'count'"), // → filtered (tool input)
            diag("undefined symbol 'other'"), // → kept (not a tool input)
        ];
        const out = filterToolInputSymbolDiagnostics(corpus, toolInputs);
        const namesToolInput = (d: Diagnostic) =>
            d.message.includes("undefined symbol") &&
            toolInputs.some((t) => d.message.includes(`'${t.variable}'`));
        expect(out.some(namesToolInput)).toBe(false);
    });

    it("INVARIANT: diagnostics that are not 'undefined symbol' are always kept", () => {
        const others = [diag("missing token"), diag("incompatible types"), diag("undefined module 'code'")];
        expect(filterToolInputSymbolDiagnostics(others, toolInputs)).toEqual(others);
    });

    it("keeps 'undefined symbol' for a variable that is not a tool input", () => {
        const corpus = [diag("undefined symbol 'other'")];
        expect(filterToolInputSymbolDiagnostics(corpus, toolInputs)).toEqual(corpus);
    });

    it("keeps an 'undefined symbol' diagnostic whose symbol name cannot be parsed", () => {
        const unparseable = [diag("undefined symbol with no quotes")];
        expect(filterToolInputSymbolDiagnostics(unparseable, toolInputs)).toEqual(unparseable);
    });
});
