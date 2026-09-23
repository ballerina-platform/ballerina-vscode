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

import { carryTextArrayValue, parseTextArraySource, textArraySource } from "../utils/text-array";
import corpus from "../utils/__fixtures__/roleValues.json";

// The corpus every parser of this value is held to. `capabilityFieldValues.ts` in the visualizer
// keeps its own copy of the parser — this file is what stops the two drifting.
describe("the shared role-value corpus", () => {
    it.each((corpus as { note: string; source: string; items: string[] | null }[])
        .map((entry) => [entry.note, entry.source, entry.items] as const))(
        "%s", (_note, source, items) => {
            expect(parseTextArraySource(source)).toEqual(items ?? undefined);
        });
});

describe("a TEXT_SET field and the source it stands for", () => {
    it.each<[string, string, string[] | undefined]>([
        ["one literal", '"finance"', ["finance"]],
        ["a list of literals", '["finance", "manager"]', ["finance", "manager"]],
        ["a list with a trailing comma", '["finance",]', ["finance"]],
        ["an escaped literal", '"He said \\"hi\\""', ['He said "hi"']],
        ["nil", "()", []],
        ["nothing", "", []],
        ["an empty list", "[]", []],
        ["a reference", "financeRoles", undefined],
        ["a list holding a reference", '["finance", lead]', undefined],
        ["a call", 'roles("finance")', undefined],
        // The one escape a re-encode cannot reproduce: left as written it gains a backslash on
        // every save. Mirrors WorkflowUtilLiteralTest on the language server side.
        ["a numeric escape", '"grin \\u{1F600}"', ["grin \u{1F600}"]],
        ["a numeric escape mid-string", '["\\u{41}BC"]', ["ABC"]],
        ["an out-of-range code point", '"\\u{110000}"', ["\\u{110000}"]],
        ["a lone surrogate", '"\\u{D800}"', ["\\u{D800}"]],
    ])("%s reads as %j", (_label, source, expected) => {
        expect(parseTextArraySource(source)).toEqual(expected);
    });

    it.each<[string[], string]>([
        [["finance"], '"finance"'],
        [["finance", "manager"], '["finance", "manager"]'],
        [['He said "hi"'], '"He said \\"hi\\""'],
        [["", "  "], ""],
        [[], ""],
    ])("%j writes as %s", (items, expected) => {
        expect(textArraySource(items)).toBe(expected);
    });

    // The round trip below only covers escapes `stringLiteral` itself emits, so it can never
    // exercise one that appears only in hand-written source.
    it("round-trips a name a numeric escape named, without gaining a backslash", () => {
        const items = parseTextArraySource('["grin \\u{1F600}", "\\u{41}BC"]')!;
        expect(items).toEqual(["grin \u{1F600}", "ABC"]);
        expect(parseTextArraySource(textArraySource(items))).toEqual(items);
    });

    it("round-trips what it writes", () => {
        const items = ["finance", 'a "quoted" role', "tab\there"];
        expect(parseTextArraySource(textArraySource(items))).toEqual(items);
    });

    it.each<[string, boolean, unknown, string | string[] | undefined]>([
        ["a list leaving the list mode", false, ["finance", "manager"], '["finance", "manager"]'],
        ["one item leaving the list mode", false, ["finance"], '"finance"'],
        ["a literal entering the list mode", true, '"finance"', ["finance"]],
        ["a list literal entering it", true, '["finance", "manager"]', ["finance", "manager"]],
        ["a reference entering it", true, "financeRoles", undefined],
        ["nothing entering it", true, "", undefined],
        ["a string leaving it", false, "financeRoles", undefined],
    ])("carries %s", (_label, intoList, value, expected) => {
        expect(carryTextArrayValue(intoList, value)).toEqual(expected);
    });
});
