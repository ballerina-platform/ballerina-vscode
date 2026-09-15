// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import * as fs from "fs";
import * as path from "path";
import { parse, stringify } from "@iarna/toml";

export interface ConfigVariable {
    name: string;
    description: string;
    type?: string;
    secret?: boolean;
}

export function isPlaceholderValue(value: string | undefined | null): boolean {
    return typeof value === "string" && /^\$\{[^}]+\}$/.test(value);
}

// Strips '& readonly' and a trailing '?' so e.g. "string[] & readonly" reduces to "string[]".
export function stripTypeDecorations(type: string): string {
    return type.replace(/&\s*readonly/g, "").replace(/\?\s*$/, "").trim();
}

// Matches an array type suffix, fixed-length or not: "[]", "[2]", "[10]", ... (Ballerina supports
// fixed-length array configurables, e.g. `configurable string[2] items = ?;`).
const ARRAY_TYPE_SUFFIX = /\[\d*\]\s*$/;

export function isArrayType(type: string): boolean {
    return ARRAY_TYPE_SUFFIX.test(type);
}

// Declared size of a fixed-length array type (e.g. "string[2]" -> 2); undefined for "string[]".
export function fixedArrayLength(type: string): number | undefined {
    const match = type.match(/\[(\d+)\]\s*$/);
    return match ? parseInt(match[1], 10) : undefined;
}

export function arrayElementType(type: string): string {
    return type.replace(ARRAY_TYPE_SUFFIX, "").trim();
}

// True if a comma exists at the top level (outside quotes, outside nested brackets/braces). A
// quote only opens at an element boundary, so a mid-word apostrophe (e.g. "Bob's") can't swallow
// the rest of the string; depth is clamped at 0 so an unbalanced closing bracket can't either.
function hasTopLevelComma(value: string): boolean {
    let depth = 0;
    let quote: string | null = null;
    let isEscaped = false;
    let atBoundary = true;
    for (const char of value) {
        if (quote) {
            if (isEscaped) {
                isEscaped = false;
            } else if (char === "\\") {
                isEscaped = true;
            } else if (char === quote) {
                quote = null;
            }
            continue;
        }
        if ((char === "\"" || char === "'") && atBoundary) {
            quote = char;
            continue;
        }
        if (char === "[" || char === "{") {
            depth++;
        } else if (char === "]" || char === "}") {
            depth = Math.max(0, depth - 1);
        } else if (depth === 0 && char === ",") {
            return true;
        }
        atBoundary = /\s/.test(char);
    }
    return false;
}

// Splits on top-level occurrences of a separator character, never inside a quoted element or a
// nested array/inline-table. Same boundary-gated quoting and depth clamp as hasTopLevelComma.
function tokenizeTopLevel(value: string, isSeparator: (char: string) => boolean): string[] {
    const values: string[] = [];
    let current = "";
    let depth = 0;
    let quote: string | null = null;
    let isEscaped = false;
    let atBoundary = true;

    const pushCurrent = () => {
        const trimmed = current.trim();
        if (trimmed.length > 0) {
            values.push(trimmed);
        }
        current = "";
        atBoundary = true;
    };

    for (const char of value) {
        if (quote) {
            current += char;
            if (isEscaped) {
                isEscaped = false;
            } else if (char === "\\") {
                isEscaped = true;
            } else if (char === quote) {
                quote = null;
            }
            continue;
        }
        if ((char === "\"" || char === "'") && atBoundary) {
            quote = char;
            current += char;
            continue;
        }
        if (char === "[" || char === "{") {
            depth++;
        } else if (char === "]" || char === "}") {
            depth = Math.max(0, depth - 1);
        }
        if (depth === 0 && isSeparator(char)) {
            pushCurrent();
        } else {
            current += char;
            if (!/\s/.test(char)) {
                atBoundary = false;
            }
        }
    }
    pushCurrent();
    return values;
}

// Splits an array literal's elements: on commas if any exist at the top level, else on
// whitespace. Either way, a quoted element (e.g. "New York") is never split on its own internal
// characters — quote an element to protect an internal space from being treated as a separator.
function splitArrayElements(value: string): string[] {
    const isSeparator = hasTopLevelComma(value) ? (c: string) => c === "," : (c: string) => /\s/.test(c);
    return tokenizeTopLevel(value, isSeparator);
}

// Decodes TOML basic-string escapes (\" \\ \n \t \r \b \f). Only meaningful for a value that was
// actually double-quote-delimited — a bare token or a single-quoted TOML literal string has no
// escape syntax to decode.
function decodeTomlEscapes(value: string): string {
    return value.replace(/\\(["\\bfnrt])/g, (_match, escaped: string) => {
        switch (escaped) {
            case "n": return "\n";
            case "t": return "\t";
            case "r": return "\r";
            case "b": return "\b";
            case "f": return "\f";
            default: return escaped; // \" or \\
        }
    });
}

// Strips a single matching pair of surrounding quotes, decoding TOML escapes for a double-quoted
// (but not single-quoted, which TOML treats as a literal string) element.
function unquote(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
        const first = trimmed[0];
        const last = trimmed[trimmed.length - 1];
        if ((first === "\"" || first === "'") && first === last) {
            const inner = trimmed.slice(1, -1);
            return first === "\"" ? decodeTomlEscapes(inner) : inner;
        }
    }
    return trimmed;
}

const STRICT_INT_PATTERN = /^[+-]?\d+$/;
// Whole-token match only — parseFloat accepts a numeric prefix of a longer string (e.g. "12ms" -> 12),
// which would silently write a different value than what was typed.
const STRICT_DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const BYTE_MIN = 0;
const BYTE_MAX = 255;

// float/decimal needs a decimal point or exponent to stay a float in TOML — @iarna/toml drops it
// for an integral value (e.g. 1.0 -> 1), which Ballerina's config provider then rejects.
function formatNumericValue(value: number, isFloatLike: boolean): string {
    const str = String(value);
    if (!isFloatLike || str.includes(".") || /e/i.test(str)) {
        return str;
    }
    return `${str}.0`;
}

// `context` distinguishes an array-element error ("in array") from a scalar one ("").
function parseIntegerToken(variableName: string, value: string, isByte: boolean, context: string): number {
    if (!STRICT_INT_PATTERN.test(value)) {
        throw new Error(`Invalid integer value${context} for ${variableName}`);
    }
    const n = parseInt(value, 10);
    if (isByte && (n < BYTE_MIN || n > BYTE_MAX)) {
        throw new Error(`Byte value${context} for ${variableName} must be between ${BYTE_MIN} and ${BYTE_MAX}`);
    }
    return n;
}

function parseDecimalToken(variableName: string, value: string, context: string): number {
    if (!STRICT_DECIMAL_PATTERN.test(value)) {
        throw new Error(`Invalid decimal value${context} for ${variableName}`);
    }
    return parseFloat(value);
}

function coerceArrayElement(variableName: string, raw: string, elementType: string): unknown {
    const value = unquote(raw);
    switch (elementType) {
        case "int":
        case "byte":
            return parseIntegerToken(variableName, value, elementType === "byte", " in array");
        case "decimal":
        case "float":
            return parseDecimalToken(variableName, value, " in array");
        case "boolean":
            if (value !== "true" && value !== "false") {
                throw new Error(`Invalid boolean value in array for ${variableName}`);
            }
            return value === "true";
        default:
            return value;
    }
}

// Parses a submitted array value (a bracket literal or a bare comma/whitespace-separated list)
// into a real JS array so @iarna/toml emits a TOML array instead of a quoted string.
function parseArrayConfigValue(variableName: string, value: string, varType: string): unknown[] {
    const trimmed = value.trim();
    const elementType = arrayElementType(stripTypeDecorations(varType));

    const inner = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1).trim() : trimmed;
    const elements = inner ? splitArrayElements(inner) : [];

    const expectedLength = fixedArrayLength(varType);
    if (expectedLength !== undefined && elements.length !== expectedLength) {
        throw new Error(`Expected ${expectedLength} value(s) for ${variableName}, got ${elements.length}`);
    }

    return elements.map(el => coerceArrayElement(variableName, el, elementType));
}

// Renders a JS array back into a bracket-literal string for display/pre-fill in the UI.
function stringifyArrayConfigValue(value: unknown[]): string {
    const renderElement = (v: unknown) => {
        if (typeof v !== "string") {
            return String(v);
        }
        const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
        return `"${escaped}"`;
    };
    return `[${value.map(renderElement).join(", ")}]`;
}

function readTomlSection(
    configPath: string,
    orgName: string,
    packageName: string
): Record<string, any> | null {
    if (!fs.existsSync(configPath)) {
        return null;
    }
    try {
        const config = parse(fs.readFileSync(configPath, "utf-8")) as Record<string, any>;
        const section = config[orgName]?.[packageName];
        return section && typeof section === "object" ? section : null;
    } catch (error) {
        console.error(`[TOML Utils] Error reading ${configPath}:`, error);
        return null;
    }
}

export function getAllConfigStatus(
    configPath: string,
    orgName: string,
    packageName: string
): Record<string, "filled" | "missing"> {
    const status: Record<string, "filled" | "missing"> = {};
    const section = readTomlSection(configPath, orgName, packageName);
    if (!section) {
        return status;
    }
    for (const [key, value] of Object.entries(section)) {
        // An explicitly-submitted empty array is a deliberate, meaningful value, not "unset" —
        // treated as filled here to agree with computeCollectStatus/classifySubmission, which
        // already treat the pre-filled "[]" display string as provided.
        if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
            status[key] = "filled";
        }
    }
    return status;
}

export function writeConfigValuesToConfig(
    configPath: string,
    configValues: Record<string, string>,
    variables: ConfigVariable[] | undefined,
    orgName: string,
    packageName: string
): void {
    let config: Record<string, any> = {};

    if (fs.existsSync(configPath)) {
        try {
            config = parse(fs.readFileSync(configPath, "utf-8")) as Record<string, any>;
        } catch (error) {
            console.error(`[TOML Utils] Error reading config for value write:`, error);
            throw error;
        }
    }

    if (!config[orgName]) { config[orgName] = {}; }
    if (!config[orgName][packageName]) { config[orgName][packageName] = {}; }
    const section = config[orgName][packageName];

    const typeMap = new Map<string, string>();
    if (variables) {
        for (const variable of variables) {
            typeMap.set(variable.name, variable.type || "string");
        }
    }

    for (const [variableName, value] of Object.entries(configValues)) {
        const varType = stripTypeDecorations(typeMap.get(variableName) || "string");
        if (isArrayType(varType)) {
            section[variableName] = parseArrayConfigValue(variableName, value, varType);
        } else if (varType === "int" || varType === "byte") {
            section[variableName] = parseIntegerToken(variableName, value, varType === "byte", "");
        } else if (varType === "decimal" || varType === "float") {
            section[variableName] = parseDecimalToken(variableName, value, "");
        } else if (varType === "boolean") {
            if (value !== "true" && value !== "false") {
                throw new Error(`Invalid boolean value for ${variableName}`);
            }
            section[variableName] = value === "true";
        } else {
            section[variableName] = value;
        }
    }

    try {
        const dirPath = path.dirname(configPath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        let tomlContent = stringify(config);

        // @iarna/toml round-trips numbers with quirks Ballerina rejects (underscore grouping,
        // a spurious ".0" on some exponent floats, dropping the point off an integral float).
        // Repaired from `section` (every key in the file, not just this call's submission) so a
        // key already on disk and not resubmitted still gets fixed up, scoped to this org.package
        // section so identically-named keys elsewhere in the file are untouched.
        const sectionHeader = `[${orgName}.${packageName}]`;
        const sectionStart = tomlContent.indexOf(sectionHeader);
        if (sectionStart !== -1) {
            const afterHeader = sectionStart + sectionHeader.length;
            const nextSection = tomlContent.indexOf("\n[", afterHeader);
            const sectionEnd = nextSection !== -1 ? nextSection : tomlContent.length;

            let sectionSlice = tomlContent.slice(sectionStart, sectionEnd);
            for (const [key, numValue] of Object.entries(section)) {
                if (typeof numValue !== "number") {
                    continue;
                }
                const declaredType = stripTypeDecorations(typeMap.get(key) || "");
                const isFloatLike = declaredType === "decimal" || declaredType === "float";
                const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const pattern = new RegExp(
                    `^(\\s*${escapedKey}\\s*=\\s*)[+-]?[0-9][0-9_]*(?:\\.[0-9_]+)?(?:[eE][+-]?[0-9]+)?(?:\\.0)?`,
                    "gm"
                );
                sectionSlice = sectionSlice.replace(pattern, `$1${formatNumericValue(numValue, isFloatLike)}`);
            }
            // Same idea for a numeric array: rebuild its '[ ... ]' span from the real values.
            for (const [key, arrValue] of Object.entries(section)) {
                if (!Array.isArray(arrValue) || arrValue.length === 0 || !arrValue.every(e => typeof e === "number")) {
                    continue;
                }
                const declaredType = stripTypeDecorations(typeMap.get(key) || "");
                const elementType = isArrayType(declaredType) ? arrayElementType(declaredType) : declaredType;
                // A fractional element forces every element to render as a float — TOML arrays are
                // single-type, so an integral sibling left as "1" would be a mixed-type array.
                const hasFractionalValue = arrValue.some(v => !Number.isInteger(v));
                const isFloatLike = hasFractionalValue || elementType === "decimal" || elementType === "float";
                const formatted = `[ ${arrValue.map(v => formatNumericValue(v, isFloatLike)).join(", ")} ]`;
                const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const pattern = new RegExp(`(^\\s*${escapedKey}\\s*=\\s*)\\[[^\\]]*\\]`, "m");
                sectionSlice = sectionSlice.replace(pattern, `$1${formatted}`);
            }
            tomlContent = tomlContent.slice(0, sectionStart) + sectionSlice + tomlContent.slice(sectionEnd);
        }

        fs.writeFileSync(configPath, tomlContent, "utf-8");
        console.log(`[TOML Utils] Updated ${Object.keys(configValues).length} configuration value(s) in Config.toml`);
    } catch (error) {
        console.error(`[TOML Utils] Error writing configuration values:`, error);
        throw error;
    }
}

export function validateVariableName(name: string): boolean {
    return /^[a-zA-Z][a-zA-Z0-9]*$/.test(name);
}

export function readExistingConfigValues(
    configPath: string,
    variableNames: string[],
    orgName: string,
    packageName: string
): Record<string, string> {
    const existingValues: Record<string, string> = {};
    const section = readTomlSection(configPath, orgName, packageName);
    if (!section) {
        return existingValues;
    }
    for (const name of variableNames) {
        const value = section[name];
        if (value !== undefined && value !== null) {
            if (typeof value === "string") {
                existingValues[name] = value;
            } else if (typeof value === "number") {
                existingValues[name] = value.toString();
            } else if (typeof value === "boolean") {
                existingValues[name] = value ? "true" : "false";
            } else if (Array.isArray(value)) {
                existingValues[name] = stringifyArrayConfigValue(value);
            }
        }
    }
    return existingValues;
}

export function createStatusMetadata(
    configValues: Record<string, string>
): Record<string, "filled" | "missing"> {
    const status: Record<string, "filled" | "missing"> = {};
    for (const [key, value] of Object.entries(configValues)) {
        status[key] = value && value.trim() !== "" ? "filled" : "missing";
    }
    return status;
}

// "filled" when we just wrote a value OR a non-placeholder existing value was preserved.
export function computeCollectStatus(
    variables: ConfigVariable[],
    provided: Record<string, string>,
    existingValues: Record<string, string>
): Record<string, "filled" | "missing"> {
    const status: Record<string, "filled" | "missing"> = {};
    for (const { name } of variables) {
        const wrote = name in provided && provided[name].trim() !== "";
        const preserved = !wrote && !!existingValues[name] && !isPlaceholderValue(existingValues[name]);
        status[name] = wrote || preserved ? "filled" : "missing";
    }
    return status;
}

export interface ConfigKeyRename {
    from: string;
    to: string;
}

function isPlainSection(value: any): value is Record<string, any> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function removeConfigKeys(
    configPath: string,
    keys: string[],
    orgName: string,
    packageName: string
): { removed: string[]; notFound: string[] } {
    const uniqueKeys = Array.from(new Set(keys));

    if (!fs.existsSync(configPath)) {
        return { removed: [], notFound: uniqueKeys };
    }

    let config: Record<string, any>;
    try {
        config = parse(fs.readFileSync(configPath, "utf-8")) as Record<string, any>;
    } catch (error) {
        console.error(`[TOML Utils] Error reading config for key removal:`, error);
        throw error;
    }

    const section = config[orgName]?.[packageName];
    if (!isPlainSection(section)) {
        return { removed: [], notFound: uniqueKeys };
    }

    const removed: string[] = [];
    const notFound: string[] = [];
    for (const key of uniqueKeys) {
        if (Object.prototype.hasOwnProperty.call(section, key)) {
            delete section[key];
            removed.push(key);
        } else {
            notFound.push(key);
        }
    }

    if (removed.length > 0) {
        fs.writeFileSync(configPath, stringify(config), "utf-8");
        console.log(`[TOML Utils] Removed ${removed.length} key(s) from Config.toml`);
    }
    return { removed, notFound };
}

export function renameConfigKeys(
    configPath: string,
    renames: ConfigKeyRename[],
    orgName: string,
    packageName: string
): { renamed: ConfigKeyRename[]; skipped: { from: string; to: string; reason: string }[] } {
    if (!fs.existsSync(configPath)) {
        return {
            renamed: [],
            skipped: renames.map(r => ({ ...r, reason: "Config.toml not found" })),
        };
    }

    let config: Record<string, any>;
    try {
        config = parse(fs.readFileSync(configPath, "utf-8")) as Record<string, any>;
    } catch (error) {
        console.error(`[TOML Utils] Error reading config for key rename:`, error);
        throw error;
    }

    const section = config[orgName]?.[packageName];
    if (!isPlainSection(section)) {
        return {
            renamed: [],
            skipped: renames.map(r => ({ ...r, reason: `[${orgName}.${packageName}] section not found` })),
        };
    }

    // Snapshot initial state so multi-pair renames don't chain (a→b, b→c).
    const initialKeys = new Set(Object.keys(section));
    const initialValues: Record<string, any> = {};
    for (const key of initialKeys) {
        initialValues[key] = section[key];
    }

    const renamed: ConfigKeyRename[] = [];
    const skipped: { from: string; to: string; reason: string }[] = [];
    const sourcesUsed = new Set<string>();
    const targetsUsed = new Set<string>();
    const toApply: ConfigKeyRename[] = [];

    for (const { from, to } of renames) {
        if (from === to) {
            skipped.push({ from, to, reason: "'from' and 'to' are the same" });
            continue;
        }
        if (!initialKeys.has(from)) {
            skipped.push({ from, to, reason: `'${from}' not found in Config.toml` });
            continue;
        }
        if (initialKeys.has(to)) {
            skipped.push({ from, to, reason: `target key '${to}' already exists` });
            continue;
        }
        if (sourcesUsed.has(from)) {
            skipped.push({ from, to, reason: `duplicate rename of '${from}'` });
            continue;
        }
        if (targetsUsed.has(to)) {
            skipped.push({ from, to, reason: `duplicate target '${to}'` });
            continue;
        }
        sourcesUsed.add(from);
        targetsUsed.add(to);
        toApply.push({ from, to });
    }

    for (const { from, to } of toApply) {
        section[to] = initialValues[from];
        delete section[from];
        renamed.push({ from, to });
    }

    if (renamed.length > 0) {
        fs.writeFileSync(configPath, stringify(config), "utf-8");
        console.log(`[TOML Utils] Renamed ${renamed.length} key(s) in Config.toml`);
    }
    return { renamed, skipped };
}
