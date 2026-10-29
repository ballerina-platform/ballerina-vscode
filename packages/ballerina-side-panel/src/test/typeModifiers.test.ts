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

// L1: the type modifier toggles (product-integrator#1820). Each toggle must read the modifier the user typed and
// write it back without disturbing the rest of the type.

import type { FormField } from "../components/Form/types";
import {
    getTypeModifiers,
    parseTypeShape,
    splitTypedSuffixes,
    toggleTypeModifier,
    TYPE_MODIFIERS,
    TypeModifier,
} from "../components/editors/typeModifiers";

const CORPUS = [
    "Profile",
    "Profile[]",
    "Profile?",
    "Profile[]?",
    "Profile|error",
    "Profile?|error",
    "Profile[]?|error",
    "Profile|error?",
    "Profile|()",
    "Profile?[]",
    "int[][]",
    "A|B",
    "(A|B)[]",
    "(A|B)?",
    "A|B|error",
    "map<string>",
    "map<string|int>[]",
    "readonly & Profile",
    "record {| string name; |}",
    "function (int a) returns int",
    "http:Response|http:ClientError",
    "error?",
    "error",
    "stream<Profile>",
    "stream<Profile?, error?>",
    "stream<Profile[], error>",
    "stream<Profile, ()>",
];

describe("parseTypeShape", () => {
    it.each([
        ["Profile", { base: "Profile", list: false, nullable: false, error: false }],
        ["Profile[]", { base: "Profile", list: true, nullable: false, error: false }],
        ["Profile?", { base: "Profile", list: false, nullable: true, error: false }],
        ["Profile[]?|error", { base: "Profile", list: true, nullable: true, error: true }],
        ["Profile|error?", { base: "Profile", list: false, nullable: true, error: true }],
        ["Profile|()", { base: "Profile", list: false, nullable: true, error: false }],
        ["(A|B)[]", { base: "A|B", list: true, nullable: false, error: false }],
        ["A|B?", { base: "A|B", list: false, nullable: true, error: false }],
        ["error?", { base: "", list: false, nullable: true, error: true }],
    ])("reads %s", (type, expected) => {
        expect(parseTypeShape(type)).toEqual(expected);
    });

    it("reads nullable items as part of the base, as the toggles are for the outer type only", () => {
        expect(parseTypeShape("Profile?[]")).toEqual({ base: "Profile?", list: true, nullable: false, error: false });
    });

    it.each(["readonly & Profile[]", "function () returns int[]", "function () returns int?"])(
        "does not read a suffix that belongs to a part of %s",
        (type) => {
            expect(parseTypeShape(type)).toMatchObject({ base: type, list: false, nullable: false });
        }
    );

    it("reads a stream's modifiers from its value type and its error from the completion type", () => {
        expect(parseTypeShape("stream<Profile[]?, error?>")).toEqual({
            base: "Profile",
            list: true,
            nullable: true,
            error: true,
            stream: { completion: "error?" },
        });
    });
});

describe("toggleTypeModifier", () => {
    it.each([
        ["Profile", "list", true, "Profile[]"],
        ["Profile", "nullable", true, "Profile?"],
        ["Profile", "error", true, "Profile|error"],
        ["Profile[]?|error", "list", false, "Profile?|error"],
        ["Profile[]?|error", "nullable", false, "Profile[]|error"],
        ["Profile[]?|error", "error", false, "Profile[]?"],
        ["Profile?", "list", true, "Profile[]?"],
        ["A|B", "list", true, "(A|B)[]"],
        ["A|B", "nullable", true, "(A|B)?"],
        ["(A|B)[]", "list", false, "A|B"],
        ["readonly & Profile", "list", true, "(readonly & Profile)[]"],
        ["Profile?[]", "nullable", true, "Profile?[]?"],
        ["stream<Profile>", "nullable", true, "stream<Profile?>"],
        ["stream<Profile>", "error", true, "stream<Profile, error?>"],
        ["stream<Profile, error>", "list", true, "stream<Profile[], error>"],
        ["stream<Profile, error?>", "error", false, "stream<Profile>"],
        ["error?", "error", false, "()"],
    ] as [string, TypeModifier, boolean, string][])("%s: %s → %s gives %s", (type, modifier, on, expected) => {
        expect(toggleTypeModifier(type, modifier, on)).toBe(expected);
    });

    it("leaves an empty type alone", () => {
        TYPE_MODIFIERS.forEach((modifier) => expect(toggleTypeModifier("", modifier, true)).toBe(""));
    });

    const modifiersOf = (type: string) => {
        const { base, list, nullable, error } = parseTypeShape(type);
        return { base, list, nullable, error };
    };

    // INVARIANT: turning a modifier on reports it as on, leaves the base and the other modifiers as they were, and
    // turning it back off returns the shape the type started with.
    it.each(CORPUS.flatMap((type) => TYPE_MODIFIERS.map((modifier) => [type, modifier] as const)))(
        "INVARIANT: %s round-trips turning the %s toggle on",
        (type, modifier) => {
            const before = modifiersOf(type);
            const toggled = toggleTypeModifier(type, modifier, true);
            if (before[modifier] || toggled === type) {
                return; // already on, or not toggleable on this type
            }
            expect(modifiersOf(toggled)).toEqual({ ...before, [modifier]: true });
            expect(modifiersOf(toggleTypeModifier(toggled, modifier, false))).toEqual(before);
        }
    );

    // Turning an outer modifier off exposes the type it decorated, which may carry the same modifier itself.
    it.each([
        ["int[][]", "list", "int[]"],
        ["Profile?[]", "list", "Profile?"],
    ] as [string, TypeModifier, string][])("turning %s's %s toggle off leaves %s", (type, modifier, expected) => {
        expect(toggleTypeModifier(type, modifier, false)).toBe(expected);
    });
});

describe("getTypeModifiers", () => {
    const typeField = (overrides: Partial<FormField>): FormField =>
        ({ key: "type", label: "Type", type: "TYPE", optional: false, editable: true, enabled: true,
            documentation: "", value: "", types: [{ fieldType: "TYPE", selected: true }], ...overrides } as FormField);

    it.each([
        ["a function's return type", { label: "Return Type" }],
        ["a service function's return type", { key: "returnType", label: "Returns" }],
        ["a data mapper's output type", { label: "Output" }],
        ["a GraphQL field type", { label: "Field Type", properties: { nullableAction: {} } as FormField["properties"] }],
    ])("offers the error toggle on %s", (_desc, overrides) => {
        expect(getTypeModifiers(typeField(overrides))).toEqual(["list", "nullable", "error"]);
    });

    it.each([
        ["a variable type", { label: "Type" }],
        ["a parameter type", { key: "type", label: "Parameter Type" }],
        ["a configurable type", { key: "type", label: "Variable Type" }],
    ])("withholds the error toggle from %s", (_desc, overrides) => {
        expect(getTypeModifiers(typeField(overrides))).toEqual(["list", "nullable"]);
    });

    it("lets a form state the toggles itself", () => {
        expect(getTypeModifiers(typeField({ label: "Return Type", typeModifiers: [] }))).toEqual([]);
    });
});

describe("splitTypedSuffixes", () => {
    it.each([
        ["string[]", { base: "string", list: true, nullable: false }],
        ["string?", { base: "string", list: false, nullable: true }],
        ["string[]?", { base: "string", list: true, nullable: true }],
        ["string", { base: "string", list: false, nullable: false }],
        ["string[", { base: "string[", list: false, nullable: false }],
    ])("takes the suffixes off %s", (text, expected) => {
        expect(splitTypedSuffixes(text)).toEqual(expected);
    });

    it.each(["int|string[]", "int|", "readonly & int[]"])("leaves %s alone, as its suffix binds to a part", (text) => {
        expect(splitTypedSuffixes(text)).toEqual({ base: text, list: false, nullable: false });
    });
});
