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
