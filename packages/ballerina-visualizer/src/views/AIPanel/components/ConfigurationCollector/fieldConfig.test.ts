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

// Regression coverage for array-typed configurables (e.g. `string[] & readonly`
// OAuth scopes): they used to fall into the generic text bucket with a no-op
// validator, so the user could not express a list and the value reached
// Config.toml as a scalar.

import { getFieldConfig, isArrayConfigType, normalizeConfigType, splitArrayElements } from "./fieldConfig";

describe("normalizeConfigType", () => {
    it.each([
        ["string[] & readonly", "string[]"],
        ["(string[] & readonly)", "string[]"],
        ["readonly & string[]", "string[]"],
        ["int", "int"],
        [undefined, "string"],
    ])("normalizes %s to %s", (input, expected) => {
        expect(normalizeConfigType(input as string | undefined)).toBe(expected);
    });
});

describe("isArrayConfigType", () => {
    it("detects plain and readonly-intersected arrays", () => {
        expect(isArrayConfigType("string[]")).toBe(true);
        expect(isArrayConfigType("string[] & readonly")).toBe(true);
        expect(isArrayConfigType("int[]")).toBe(true);
        expect(isArrayConfigType("string")).toBe(false);
        expect(isArrayConfigType(undefined)).toBe(false);
    });

    it("excludes non-primitive element types, mirroring the host's write path", () => {
        expect(isArrayConfigType("json[]")).toBe(false);
        expect(isArrayConfigType("anydata[]")).toBe(false);
        expect(isArrayConfigType("Server[]")).toBe(false);
        expect(isArrayConfigType("int[][]")).toBe(false);
    });
});

describe("splitArrayElements", () => {
    it("splits comma-separated values, trimming and unquoting items", () => {
        expect(splitArrayElements(' read , "write", \'admin\' ')).toEqual(["read", "write", "admin"]);
    });

    it("parses a JSON array", () => {
        expect(splitArrayElements('["read", "write"]')).toEqual(["read", "write"]);
    });

    it("normalizes JSON-branch elements like the comma branch (trim, unquote, drop empties)", () => {
        expect(splitArrayElements('[" a ", " ", ""]')).toEqual(["a"]);
        expect(splitArrayElements('[" true "]')).toEqual(["true"]);
    });

    it("returns null for malformed bracketed input", () => {
        expect(splitArrayElements("[read, write")).toBeNull();
    });

    it("returns null for JSON arrays with non-primitive elements", () => {
        expect(splitArrayElements('[{"a": 1}]')).toBeNull();
        expect(splitArrayElements("[[1, 2]]")).toBeNull();
        expect(splitArrayElements("[null]")).toBeNull();
    });

    it("drops empty items from trailing commas", () => {
        expect(splitArrayElements("read,, write,")).toEqual(["read", "write"]);
    });
});

describe("getFieldConfig for array types", () => {
    it("returns a text input with an array placeholder for string[]", () => {
        const config = getFieldConfig("string[] & readonly");
        expect(config.inputKind).toBe("text");
        expect(config.placeholder).toContain("Comma-separated");
        expect(config.placeholder).toContain("JSON array");
    });

    it("derives the placeholder example from the element type", () => {
        expect(getFieldConfig("int[]").placeholder).toContain("8080, 9090");
        expect(getFieldConfig("boolean[]").placeholder).toContain("true, false");
        expect(getFieldConfig("string[]").placeholder).toContain("value1, value2");
    });

    it("accepts JSON elements that normalize to valid values", () => {
        expect(getFieldConfig("int[]").validate('["1", " "]')).toBeNull();
        expect(getFieldConfig("boolean[]").validate('[" true "]')).toBeNull();
    });

    it("rejects non-blank input that yields zero elements", () => {
        expect(getFieldConfig("string[]").validate(",")).toMatch(/at least one value/);
        expect(getFieldConfig("string[]").validate("[]")).toMatch(/at least one value/);
        expect(getFieldConfig("string[]").validate(" , ")).toMatch(/at least one value/);
    });

    it("accepts comma-separated and JSON-array string values", () => {
        const config = getFieldConfig("string[]");
        expect(config.validate("read, write")).toBeNull();
        expect(config.validate('["read", "write"]')).toBeNull();
    });

    it("accepts an empty value (variable skipped)", () => {
        expect(getFieldConfig("string[]").validate("")).toBeNull();
    });

    it("rejects malformed bracketed input", () => {
        expect(getFieldConfig("string[]").validate("[read")).toMatch(/JSON array/);
    });

    it("validates elements of int[] values", () => {
        const config = getFieldConfig("int[]");
        expect(config.validate("8080, 9090")).toBeNull();
        expect(config.validate("8080, abc")).toMatch(/not a valid integer/);
        // Strict digits, matching the host parser.
        expect(config.validate("0x10")).toMatch(/not a valid integer/);
        expect(config.validate("1e3")).toMatch(/not a valid integer/);
    });

    it("leaves non-primitive array types on the plain text input (host writes them as scalars)", () => {
        const config = getFieldConfig("json[]");
        expect(config.inputKind).toBe("text");
        expect(config.placeholder).toBe("Enter value");
        expect(config.validate("anything")).toBeNull();
    });

    it("validates elements of boolean[] values", () => {
        const config = getFieldConfig("boolean[]");
        expect(config.validate("true, false")).toBeNull();
        expect(config.validate("true, maybe")).toMatch(/not true or false/);
    });
});

describe("getFieldConfig for scalar types (unchanged behavior)", () => {
    it("keeps int as a validated number input", () => {
        const config = getFieldConfig("int");
        expect(config.inputKind).toBe("number");
        expect(config.validate("42")).toBeNull();
        expect(config.validate("4.2")).toBe("Enter a valid integer");
    });

    it("keeps boolean as a select with a true default", () => {
        const config = getFieldConfig("boolean");
        expect(config.inputKind).toBe("select");
        expect(config.defaultValue).toBe("true");
    });

    it("keeps string as a free text input", () => {
        const config = getFieldConfig("string");
        expect(config.inputKind).toBe("text");
        expect(config.validate("anything")).toBeNull();
    });

    it("handles readonly-intersected scalars via normalization", () => {
        expect(getFieldConfig("int & readonly").inputKind).toBe("number");
    });
});
