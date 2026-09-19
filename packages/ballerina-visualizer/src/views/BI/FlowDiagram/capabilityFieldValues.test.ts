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

// A capability form is a fresh template seeded with source. These pin the half that was missing:
// putting each value in the right mode, so a reference is not written back as a literal.

import { capabilityValueText, seedCapabilityValue, SeedableProperty } from "./capabilityFieldValues";

const dualMode = (): SeedableProperty => ({
    value: "",
    types: [
        { fieldType: "TEXT", selected: true },
        { fieldType: "EXPRESSION", selected: false },
    ],
});

const expressionOnly = (): SeedableProperty => ({ value: "", types: [{ fieldType: "EXPRESSION", selected: true }] });

const modeOf = (property: SeedableProperty) => property.types?.find((type) => type.selected)?.fieldType;

describe("seedCapabilityValue", () => {
    it("puts a string literal in the text box, without its quotes", () => {
        const property = dualMode();
        seedCapabilityValue(property, '"finance"');
        expect(property.value).toBe("finance");
        expect(modeOf(property)).toBe("TEXT");
    });

    it("keeps a bare reference an expression, which is the bug this fixes", () => {
        const property = dualMode();
        seedCapabilityValue(property, "financeRoles");
        expect(property.value).toBe("financeRoles");
        expect(modeOf(property)).toBe("EXPRESSION");
    });

    it.each(['["finance", "ops"]', "string `Order ${id}`", "getRoles()", "config:roles", "()"])(
        "treats %s as an expression",
        (source) => {
            const property = dualMode();
            seedCapabilityValue(property, source);
            expect(property.value).toBe(source);
            expect(modeOf(property)).toBe("EXPRESSION");
        }
    );

    it("resolves the escapes a literal carries", () => {
        const property = dualMode();
        seedCapabilityValue(property, '"Say \\"go\\"\\nnow"');
        expect(property.value).toBe('Say "go"\nnow');
        expect(modeOf(property)).toBe("TEXT");
    });

    it("keeps an escaped backslash from swallowing the character after it", () => {
        // `"C:\\new"` is a path. Decoding the escapes one at a time turned its `\\n` into a line break.
        const property = dualMode();
        seedCapabilityValue(property, '"C:\\\\new"');
        expect(property.value).toBe("C:\\new");
        expect(property.value).not.toContain("\n");
    });

    it("leaves a trailing lone backslash alone rather than reading past the end", () => {
        const property = dualMode();
        seedCapabilityValue(property, '"ends with \\\\"');
        expect(property.value).toBe("ends with \\");
    });

    it("decodes a numeric escape the way the language server does", () => {
        const property = dualMode();
        seedCapabilityValue(property, '"grin \\u{1F600}"');
        expect(property.value).toBe("grin \u{1F600}");
    });

    it("leaves an out-of-range code point as written instead of throwing", () => {
        // `String.fromCodePoint` rejects anything above 0x10FFFF, and a throw here would stop the
        // whole form from opening. The language server leaves the escape as written.
        const property = dualMode();
        seedCapabilityValue(property, '"grin \\u{110000}"');
        expect(property.value).toBe("grin \\u{110000}");
    });

    it("leaves a lone surrogate as written", () => {
        const property = dualMode();
        seedCapabilityValue(property, '"half \\u{D800}"');
        expect(property.value).toBe("half \\u{D800}");
    });

    it("keeps the backslash of an escape the syntax does not define", () => {
        const property = dualMode();
        seedCapabilityValue(property, '"no brace \\uabc"');
        expect(property.value).toBe("no brace \\uabc");
    });

    it("does not mistake a concatenation that merely starts and ends with a quote", () => {
        const property = dualMode();
        seedCapabilityValue(property, '"a" + b + "c"');
        expect(modeOf(property)).toBe("EXPRESSION");
        expect(property.value).toBe('"a" + b + "c"');
    });

    it("leaves a single-mode field as source, whatever the value looks like", () => {
        const property = expressionOnly();
        seedCapabilityValue(property, '"finance"');
        expect(property.value).toBe('"finance"');
        expect(modeOf(property)).toBe("EXPRESSION");
    });

    it("decodes a literal into a doc box, which is text in a single mode", () => {
        const property: SeedableProperty = { value: "", types: [{ fieldType: "DOC_TEXT", selected: true }] };
        seedCapabilityValue(property, '"Charges the card"');
        expect(property.value).toBe("Charges the card");
        expect(modeOf(property)).toBe("DOC_TEXT");
    });

    it("leaves a text-only field selected when its value is not a literal", () => {
        // A name written as a template has no expression editor to switch to, so the field keeps
        // the only mode it has rather than ending up with none selected.
        const property: SeedableProperty = { value: "", types: [{ fieldType: "TEXT", selected: true }] };
        seedCapabilityValue(property, "string `approve-${id}`");
        expect(property.value).toBe("string `approve-${id}`");
        expect(modeOf(property)).toBe("TEXT");
    });

    it("keeps a type reference and an enum member as they stand", () => {
        const type: SeedableProperty = { value: "", types: [{ fieldType: "TYPE", selected: true }] };
        seedCapabilityValue(type, "ClaimReview");
        expect(type.value).toBe("ClaimReview");
        expect(modeOf(type)).toBe("TYPE");

        const select: SeedableProperty = { value: "", types: [{ fieldType: "SINGLE_SELECT", selected: true }] };
        seedCapabilityValue(select, "SINGLE_EVENT");
        expect(select.value).toBe("SINGLE_EVENT");
        expect(modeOf(select)).toBe("SINGLE_SELECT");
    });

    it("seeds a field with no declared types at all", () => {
        const property: SeedableProperty = { value: "" };
        seedCapabilityValue(property, "SINGLE_EVENT");
        expect(property.value).toBe("SINGLE_EVENT");
    });

    it("reads a value as text for display, decoding only a literal", () => {
        expect(capabilityValueText('"Charges the card"')).toBe("Charges the card");
        expect(capabilityValueText("descriptionVar")).toBe("descriptionVar");
        expect(capabilityValueText(undefined)).toBeUndefined();
        expect(capabilityValueText("")).toBe("");
    });
});
