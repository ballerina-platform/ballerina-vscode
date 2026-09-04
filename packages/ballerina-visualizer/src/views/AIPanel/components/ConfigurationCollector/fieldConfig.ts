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

// ─── Field type config (single source of truth) ───────────────────────────────
//
// Maps a Ballerina configurable type (as reported by the language server) to
// the input the collect form renders and the validation it applies. To add a
// new Ballerina type: add an entry here. No other code needs to change.
//
// Kept in its own module (no React imports) so it can be unit-tested.

export type InputKind = "text" | "number" | "select";

export interface SelectOption {
    label: string;
    value: string;
}

export interface FieldConfig {
    inputKind: InputKind;
    placeholder?: string;
    selectOptions?: SelectOption[];
    defaultValue?: string;
    validate: (value: string) => string | null;
}

const NUMERIC_INT_TYPES = new Set(["int", "byte"]);
const NUMERIC_FLOAT_TYPES = new Set(["decimal", "float"]);

/**
 * Normalizes a Ballerina configurable type for dispatching: strips `readonly`
 * intersections and grouping parentheses, so `string[] & readonly`,
 * `(string[] & readonly)`, and `readonly & string[]` all become `string[]`.
 * Mirrors normalizeConfigType in the extension host's toml-utils, which
 * performs the matching serialization into Config.toml.
 */
export function normalizeConfigType(type: string | undefined): string {
    if (!type) {
        return "string";
    }
    const stripped = type
        .replace(/\breadonly\b/g, "")
        .replace(/&/g, "")
        .replace(/[()]/g, "")
        .trim();
    return stripped || "string";
}

const PRIMITIVE_ARRAY_ELEMENT_TYPES = new Set(["string", "int", "byte", "float", "decimal", "boolean"]);

/**
 * True only for arrays of primitive configurable types (`string[]`,
 * `int[] & readonly`, ...) — the only array shapes the collect form can take
 * as flat text. Mirrors the extension host's isArrayConfigType: `json[]`,
 * `anydata[]`, record arrays, and nested arrays keep the plain text input and
 * the host's scalar write path.
 */
export function isArrayConfigType(type: string | undefined): boolean {
    const normalized = normalizeConfigType(type);
    if (!normalized.endsWith("[]")) {
        return false;
    }
    return PRIMITIVE_ARRAY_ELEMENT_TYPES.has(normalized.slice(0, -2).trim());
}

function stripMatchingQuotes(value: string): string {
    if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return value.slice(1, -1);
        }
    }
    return value;
}

/**
 * Splits a user-entered array value (JSON array or comma-separated) into its
 * element strings. Returns null when the text is a malformed bracketed value,
 * which the validator reports as an error.
 */
export function splitArrayElements(value: string): string[] | null {
    const trimmed = value.trim();
    let items: string[];
    if (trimmed.startsWith("[")) {
        try {
            const parsed = JSON.parse(trimmed);
            if (!Array.isArray(parsed)) {
                return null;
            }
            // Only primitive elements — an object/array element would be
            // String()-coerced into garbage like "[object Object]".
            if (parsed.some((item) => typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean")) {
                return null;
            }
            items = parsed.map((item) => String(item));
        } catch {
            return null;
        }
    } else {
        items = trimmed.split(",");
    }
    // Both branches share the trim/unquote/drop-empty normalization so this
    // helper describes exactly what the extension host's parseArrayConfigValue
    // persists (toml-utils.ts applies the same normalization to both branches).
    return items.map((item) => stripMatchingQuotes(item.trim())).filter((item) => item !== "");
}

function validateArrayValue(value: string, elementType: string): string | null {
    if (!value.trim()) {
        return null; // empty means "skip this variable"
    }
    const elements = splitArrayElements(value);
    if (elements === null) {
        return 'Enter comma-separated values or a JSON array like ["a", "b"]';
    }
    if (elements.length === 0) {
        // Non-blank input like "," or "[]" would silently persist an empty array.
        return "Enter at least one value, or leave the field blank to skip it";
    }
    if (NUMERIC_INT_TYPES.has(elementType)) {
        // Strict decimal digits only, matching the host parser (Number() would
        // also admit hex/exponent forms like "0x10" or "1e3").
        const bad = elements.find((item) => !/^[+-]?\d+$/.test(item));
        return bad === undefined ? null : `'${bad}' is not a valid integer`;
    }
    if (NUMERIC_FLOAT_TYPES.has(elementType)) {
        const bad = elements.find((item) => isNaN(Number(item)));
        return bad === undefined ? null : `'${bad}' is not a valid number`;
    }
    if (elementType === "boolean") {
        const bad = elements.find((item) => item !== "true" && item !== "false");
        return bad === undefined ? null : `'${bad}' is not true or false`;
    }
    return null;
}

const ARRAY_PLACEHOLDER_EXAMPLES: Record<string, string> = {
    int: "8080, 9090",
    byte: "8080, 9090",
    decimal: "1.5, 2.0",
    float: "1.5, 2.0",
    boolean: "true, false",
};

export function getFieldConfig(type: string | undefined): FieldConfig {
    const normalizedType = normalizeConfigType(type);
    if (NUMERIC_INT_TYPES.has(normalizedType)) {
        return {
            inputKind: "number",
            placeholder: "Enter integer",
            validate: (v) => {
                if (!v.trim()) return null;
                if (isNaN(parseInt(v, 10)) || !Number.isInteger(parseFloat(v))) return "Enter a valid integer";
                return null;
            },
        };
    }
    if (NUMERIC_FLOAT_TYPES.has(normalizedType)) {
        return {
            inputKind: "number",
            placeholder: "Enter number",
            validate: (v) => {
                if (!v.trim()) return null;
                if (isNaN(parseFloat(v))) return "Enter a valid number";
                return null;
            },
        };
    }
    if (normalizedType === "boolean") {
        return {
            inputKind: "select",
            defaultValue: "true",
            selectOptions: [
                { label: "true", value: "true" },
                { label: "false", value: "false" },
            ],
            validate: () => null, // select always holds a valid option
        };
    }
    if (isArrayConfigType(normalizedType)) {
        // Arrays (e.g. string[] OAuth scopes) are entered as comma-separated values
        // or a JSON array; the extension host serializes them as a real TOML array.
        const elementType = normalizedType.replace(/\[\]$/, "").trim() || "string";
        const example = ARRAY_PLACEHOLDER_EXAMPLES[elementType] ?? "value1, value2";
        return {
            inputKind: "text",
            placeholder: `Comma-separated values or JSON array (e.g. ${example})`,
            validate: (v) => validateArrayValue(v, elementType),
        };
    }
    // Default: string, records, maps, or any unknown LS type
    return {
        inputKind: "text",
        placeholder: "Enter value",
        validate: () => null,
    };
}
