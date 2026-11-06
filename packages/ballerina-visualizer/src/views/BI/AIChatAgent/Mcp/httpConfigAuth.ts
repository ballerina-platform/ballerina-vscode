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

// An mcp.v2 toolkit takes its authentication inside `httpConfig`. The MCP server form also shows it as a separate
// `auth` field, and these helpers keep the two in step by reading and replacing the `auth` entry of the
// `httpConfig` mapping constructor.

const AUTH_KEY = "auth";

export type HttpConfigAuth =
    // A mapping constructor, or no value; `auth` is the entry's value, or "" when there is none
    | { kind: "record"; auth: string }
    // Any other expression, such as a variable, whose auth cannot be read at design time
    | { kind: "expression" };

/**
 * Splits the entries of a mapping constructor at its top-level commas, or returns undefined when the value is
 * not a single mapping constructor.
 */
function splitEntries(value: string): string[] | undefined {
    const text = value.trim();
    if (!text.startsWith("{") || !text.endsWith("}")) {
        return undefined;
    }
    const entries: string[] = [];
    let depth = 0;
    let quote: string | undefined;
    let start = 1;
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (quote) {
            if (char === "\\") {
                index++;
            } else if (char === quote) {
                quote = undefined;
            }
            continue;
        }
        if (char === "\"" || char === "`") {
            quote = char;
        } else if (char === "{" || char === "[" || char === "(") {
            depth++;
        } else if (char === "}" || char === "]" || char === ")") {
            depth--;
            if (depth === 0 && index !== text.length - 1) {
                // The opening brace closed before the end, so this is not one mapping constructor
                return undefined;
            }
        } else if (char === "," && depth === 1) {
            entries.push(text.slice(start, index));
            start = index + 1;
        }
    }
    if (depth !== 0 || quote) {
        return undefined;
    }
    entries.push(text.slice(start, text.length - 1));
    return entries.map((entry) => entry.trim()).filter((entry) => entry !== "");
}

function entryKey(entry: string): string | undefined {
    const separator = entry.indexOf(":");
    if (separator < 0 || entry.startsWith("...")) {
        return undefined;
    }
    return entry.slice(0, separator).trim().replace(/^'/, "").replace(/^"(.*)"$/, "$1");
}

/** Reads the `auth` entry of an `httpConfig` value. */
export function readHttpConfigAuth(httpConfig: string | undefined): HttpConfigAuth {
    if (!httpConfig || httpConfig.trim() === "") {
        return { kind: "record", auth: "" };
    }
    const entries = splitEntries(httpConfig);
    if (!entries) {
        return { kind: "expression" };
    }
    const authEntry = entries.find((entry) => entryKey(entry) === AUTH_KEY);
    return { kind: "record", auth: authEntry ? authEntry.slice(authEntry.indexOf(":") + 1).trim() : "" };
}

/**
 * Returns the `httpConfig` value with its `auth` entry replaced by `auth`, or removed when `auth` is empty.
 * Returns undefined when the value is not a mapping constructor, so its auth cannot be changed.
 */
export function writeHttpConfigAuth(httpConfig: string | undefined, auth: string): string | undefined {
    const isEmpty = !httpConfig || httpConfig.trim() === "";
    const entries = isEmpty ? [] : splitEntries(httpConfig);
    if (!entries) {
        return undefined;
    }
    const otherEntries = entries.filter((entry) => entryKey(entry) !== AUTH_KEY);
    if (auth.trim() !== "") {
        otherEntries.push(`${AUTH_KEY}: ${auth.trim()}`);
    }
    if (otherEntries.length === 0) {
        return isEmpty ? "" : "{}";
    }
    return `{${otherEntries.join(", ")}}`;
}
