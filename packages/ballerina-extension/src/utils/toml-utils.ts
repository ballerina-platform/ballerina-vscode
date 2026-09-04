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

/**
 * Normalizes a Ballerina configurable type string for dispatching: strips
 * `readonly` intersections and grouping parentheses, so `string[] & readonly`,
 * `(string[] & readonly)`, and `readonly & string[]` all become `string[]`.
 */
export function normalizeConfigType(varType: string | undefined): string {
    if (!varType) {
        return "string";
    }
    const stripped = varType
        .replace(/\breadonly\b/g, "")
        .replace(/&/g, "")
        .replace(/[()]/g, "")
        .trim();
    return stripped || "string";
}

const PRIMITIVE_ARRAY_ELEMENT_TYPES = new Set(["string", "int", "byte", "float", "decimal", "boolean"]);

/**
 * True only for arrays of primitive configurable types (`string[]`,
 * `int[] & readonly`, ...) — the only array shapes the collector can parse
 * from flat text input. `json[]`, `anydata[]`, record arrays, and nested
 * arrays fall through to the scalar path so a mistyped value fails loudly at
 * startup instead of being silently coerced to strings.
 */
export function isArrayConfigType(varType: string | undefined): boolean {
    const normalized = normalizeConfigType(varType);
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
 * Parses a user-entered array configurable value into a real JS array so the
 * TOML writer emits a TOML array (e.g. `scopes = ["a", "b"]`) instead of a
 * quoted scalar, which Ballerina rejects at runtime with
 * "expected type 'string[] & readonly', but found 'string'".
 *
 * Accepts a JSON-style array (`["a", "b"]`) or comma-separated values
 * (`a, b`), coercing each element to the array's element type. Only arrays of
 * primitives are supported — nested array/map element types fall through to
 * the string path, matching the collect form, which only offers flat input.
 */
export function parseArrayConfigValue(
    raw: string,
    varType: string | undefined,
    variableName: string
): (string | number | boolean)[] {
    const elementType = normalizeConfigType(varType).replace(/\[\]$/, "").trim() || "string";
    const trimmed = raw.trim();

    let items: string[];
    if (trimmed.startsWith("[")) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            throw new Error(
                `Invalid array value for ${variableName}: expected a JSON array (e.g. ["a", "b"]) or comma-separated values`
            );
        }
        if (!Array.isArray(parsed)) {
            throw new Error(
                `Invalid array value for ${variableName}: expected a JSON array (e.g. ["a", "b"]) or comma-separated values`
            );
        }
        items = parsed.map((item) => {
            if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") {
                throw new Error(
                    `Invalid array element for ${variableName}: only string, number, and boolean elements are supported`
                );
            }
            return String(item);
        });
    } else {
        items = trimmed.split(",");
    }

    const elements = items.map((item) => stripMatchingQuotes(item.trim())).filter((item) => item !== "");

    if (elementType === "int" || elementType === "byte") {
        return elements.map((item) => {
            // Strict decimal digits only — Number() would also admit hex/exponent
            // forms ("0x10", "1e3"), which are surprising in a config value.
            if (!/^[+-]?\d+$/.test(item)) {
                throw new Error(`Invalid integer element '${item}' in array value for ${variableName}`);
            }
            return Number(item);
        });
    }
    if (elementType === "decimal" || elementType === "float") {
        return elements.map((item) => {
            const num = Number(item);
            if (isNaN(num)) {
                throw new Error(`Invalid decimal element '${item}' in array value for ${variableName}`);
            }
            return num;
        });
    }
    if (elementType === "boolean") {
        return elements.map((item) => {
            if (item !== "true" && item !== "false") {
                throw new Error(`Invalid boolean element '${item}' in array value for ${variableName}`);
            }
            return item === "true";
        });
    }
    return elements;
}

function isNumericElementType(varType: string | undefined): boolean {
    const elementType = normalizeConfigType(varType).replace(/\[\]$/, "").trim();
    return elementType === "int" || elementType === "byte" || elementType === "decimal" || elementType === "float";
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
        // Arrays of primitives are legitimate configurable values (e.g. string[]
        // OAuth scopes); inline tables, nested sections, and arrays of tables
        // stay excluded, as before.
        const isPrimitiveArray = Array.isArray(value) &&
            value.every((item) => item !== null && typeof item !== "object");
        if (value !== null && (typeof value !== "object" || isPrimitiveArray)) {
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

    const numericKeys = new Set<string>();
    const numericArrayKeys = new Set<string>();
    for (const [variableName, value] of Object.entries(configValues)) {
        // Normalize so readonly-intersected types (`int & readonly`) dispatch to
        // their base-type branch instead of falling through to the string default.
        const varType = normalizeConfigType(typeMap.get(variableName));
        if (isArrayConfigType(varType)) {
            section[variableName] = parseArrayConfigValue(value, varType, variableName);
            if (isNumericElementType(varType)) {
                numericArrayKeys.add(variableName);
            }
        } else if (varType === "int" || varType === "byte") {
            const intValue = parseInt(value, 10);
            if (isNaN(intValue)) {
                throw new Error(`Invalid integer value for ${variableName}`);
            }
            section[variableName] = intValue;
            numericKeys.add(variableName);
        } else if (varType === "decimal" || varType === "float") {
            const decimalValue = parseFloat(value);
            if (isNaN(decimalValue)) {
                throw new Error(`Invalid decimal value for ${variableName}`);
            }
            section[variableName] = decimalValue;
            numericKeys.add(variableName);
        } else if (varType === "boolean") {
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

        // @iarna/toml formats large numbers with underscores (e.g. 8_080) — inside arrays too
        // ([ 8_080, 9_090 ]); Ballerina requires plain digits. Scope replacements to the
        // [org.name] section only to avoid touching identically-named keys in other sections
        // of the same file.
        if (numericKeys.size > 0 || numericArrayKeys.size > 0) {
            const sectionHeader = `[${orgName}.${packageName}]`;
            const sectionStart = tomlContent.indexOf(sectionHeader);
            if (sectionStart !== -1) {
                const afterHeader = sectionStart + sectionHeader.length;
                const nextSection = tomlContent.indexOf("\n[", afterHeader);
                const sectionEnd = nextSection !== -1 ? nextSection : tomlContent.length;

                let sectionSlice = tomlContent.slice(sectionStart, sectionEnd);
                for (const key of numericKeys) {
                    const numValue = section[key];
                    if (typeof numValue === "number") {
                        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                        const pattern = new RegExp(`^(\\s*${escapedKey}\\s*=\\s*)[0-9][0-9_]*(?:\\.[0-9]+)?`, "gm");
                        sectionSlice = sectionSlice.replace(pattern, `$1${numValue}`);
                    }
                }
                for (const key of numericArrayKeys) {
                    // Purely numeric arrays: safe to strip digit-group underscores across the
                    // whole bracketed value (no string elements can contain `]` or digit_digit).
                    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    const pattern = new RegExp(`^(\\s*${escapedKey}\\s*=\\s*)\\[([^\\]]*)\\]`, "gm");
                    sectionSlice = sectionSlice.replace(pattern, (_match, prefix: string, body: string) =>
                        `${prefix}[${body.replace(/(\d)_(?=\d)/g, "$1")}]`);
                }
                tomlContent = tomlContent.slice(0, sectionStart) + sectionSlice + tomlContent.slice(sectionEnd);
            }
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
            } else if (Array.isArray(value) && value.every((item) => item !== null && typeof item !== "object")) {
                // Round-trip primitive arrays as JSON so the collect form pre-fills
                // them and parseArrayConfigValue accepts the same text back on
                // resubmit; arrays of tables stay excluded like other tables.
                // (@iarna/toml surfaces very large TOML integers as BigInt, which
                // JSON.stringify rejects — stringify those elements first.)
                const safeElements = value.map((item) =>
                    typeof item === "bigint" ? item.toString() : item);
                existingValues[name] = JSON.stringify(safeElements);
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
