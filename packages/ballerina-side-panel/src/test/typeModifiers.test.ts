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

import {
    applyTypedText,
    parseTypeShape,
    splitTypedSuffixes,
    toGraphQLNullability,
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
    "function () returns int|error",
    "isolated transactional function () returns int|error",
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

    it.each([
        "readonly & Profile[]",
        "function () returns int[]",
        "function () returns int?",
        "function () returns int|error",
        "transactional function () returns int|()",
    ])(
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
        ["function () returns int|error", "list", true, "(function () returns int|error)[]"],
        ["function () returns int", "error", true, "(function () returns int)|error"],
        ["(function () returns int)|error", "error", false, "function () returns int"],
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

    // INVARIANT: where a field offers no Error toggle, an error is part of the type the toggles decorate, so they
    // never move it out of the list or the nil.
    it.each(CORPUS.flatMap((type) => (["list", "nullable"] as TypeModifier[]).map((modifier) => [type, modifier] as const)))(
        "INVARIANT: %s keeps its error inside the type when the %s toggle is turned on without an Error toggle",
        (type, modifier) => {
            const offered: TypeModifier[] = ["list", "nullable"];
            const before = parseTypeShape(type, offered);
            expect(before.error).toBe(!!before.stream && /error/.test(before.stream.completion ?? ""));
            const toggled = toggleTypeModifier(type, modifier, true, offered);
            if (before[modifier] || toggled === type) {
                return;
            }
            const { base, error } = parseTypeShape(toggled, offered);
            expect({ base, error }).toEqual({ base: before.base, error: before.error });
        }
    );

    it.each([
        ["int|error", "list", true, "(int|error)[]"],
        ["error", "list", true, "error[]"],
        ["error?", "nullable", false, "error"],
    ] as [string, TypeModifier, boolean, string][])(
        "without an Error toggle, %s: %s → %s gives %s",
        (type, modifier, on, expected) => {
            expect(toggleTypeModifier(type, modifier, on, ["list", "nullable"])).toBe(expected);
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

describe("applyTypedText", () => {
    it.each([
        ["", "Profile", "Profile"],
        ["Profile[]", "Order", "Order[]"],
        ["Profile?|error", "Order[]", "Order[]?|error"],
        ["(A|B)?", "A|C|B", "(A|C|B)?"],
        ["Profile[]?", "  ", ""],
    ])("on %s, typing %s gives %s", (type, text, expected) => {
        expect(applyTypedText(parseTypeShape(type), text)).toBe(expected);
    });
});

describe("toGraphQLNullability", () => {
    it.each([
        ["Profile", "Profile!"],
        ["Profile?", "Profile"],
        ["untitled:CreateUserInput?", "untitled:CreateUserInput"],
        ["string[]", "[string!]!"],
        ["string?[]", "[string]!"],
        ["string[]?", "[string!]"],
        ["int[][]", "[[int!]!]!"],
        ["A|B", "(A|B)!"],
        ["(A|B)?", "A|B"],
        ["stream<Profile>", "stream<Profile>"],
        ["", ""],
    ])("writes %s as %s", (type, expected) => {
        expect(toGraphQLNullability(type)).toBe(expected);
    });
});
