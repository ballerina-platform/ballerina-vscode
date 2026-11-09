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
const IDENTIFIER = /^'?[A-Za-z_][A-Za-z0-9_]*$/;

export type HttpConfigAuth =
    // A mapping constructor, or no value; `auth` is the entry's value, or "" when there is none
    | { kind: "record"; auth: string }
    // Any other expression, such as a variable, whose auth cannot be read at design time
    | { kind: "expression" };

/**
 * Walks the characters of an expression outside `//` comments and the contents of its string literals, calling
 * `visit` with the index of each (the quotes of a string included). Returns false when a string is left open.
 */
function scanCode(text: string, visit: (index: number) => void): boolean {
    let quote: string | undefined;
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (quote) {
            if (char === "\\") {
                index++;
            } else if (char === quote) {
                quote = undefined;
                visit(index);
            }
            continue;
        }
        if (char === "/" && text[index + 1] === "/") {
            const end = text.indexOf("\n", index);
            index = end < 0 ? text.length : end - 1;
            continue;
        }
        if (char === "\"" || char === "`") {
            quote = char;
        }
        visit(index);
    }
    return quote === undefined;
}

function stripComments(text: string): string {
    let code = "";
    let last = 0;
    let quote: string | undefined;
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (quote) {
            if (char === "\\") {
                index++;
            } else if (char === quote) {
                quote = undefined;
            }
        } else if (char === "\"" || char === "`") {
            quote = char;
        } else if (char === "/" && text[index + 1] === "/") {
            code += text.slice(last, index);
            const end = text.indexOf("\n", index);
            index = end < 0 ? text.length : end - 1;
            last = index + 1;
        }
    }
    return (code + text.slice(last)).trim();
}

/**
 * Splits the entries of a mapping constructor at its top-level commas, or returns undefined when the value is
 * not a single mapping constructor. An entry keeps the comments written before it, and comments after the last
 * entry come as an entry of their own that holds no code.
 */
function splitEntries(value: string): string[] | undefined {
    const text = value.trim();
    if (!text.startsWith("{") || !stripComments(text).endsWith("}")) {
        return undefined;
    }
    const closing = text.lastIndexOf("}");
    const entries: string[] = [];
    let depth = 0;
    let start = 1;
    let single = true;
    const closed = scanCode(text, (index) => {
        const char = text[index];
        if (char === "{" || char === "[" || char === "(") {
            depth++;
        } else if (char === "}" || char === "]" || char === ")") {
            depth--;
            if (depth === 0 && index !== closing) {
                // The opening brace closed before the end, so this is not one mapping constructor
                single = false;
            }
        } else if (char === "," && depth === 1) {
            // A comment after the comma, on the same line, belongs to the entry before it
            const lineEnd = text.indexOf("\n", index);
            const rest = lineEnd < 0 ? "" : text.slice(index + 1, lineEnd);
            if (/^\s*\/\//.test(rest)) {
                entries.push(text.slice(start, index) + rest);
                start = lineEnd;
            } else {
                entries.push(text.slice(start, index));
                start = index + 1;
            }
        }
    });
    if (!closed || !single || depth !== 0) {
        return undefined;
    }
    // Comments on the lines after the last entry's code do not belong to that entry
    const last = text.slice(start, closing);
    const codeEnd = lastCodeIndex(last);
    const lineEnd = codeEnd < 0 ? 0 : last.indexOf("\n", codeEnd);
    entries.push(...(lineEnd < 0 ? [last] : [last.slice(0, lineEnd), last.slice(lineEnd)]));
    return entries.map((entry) => entry.trim()).filter((entry) => entry !== "");
}

function isComment(entry: string): boolean {
    return stripComments(entry) === "";
}

// The index of the colon that ends an entry's key, or -1 for an entry without one.
function keySeparator(entry: string): number {
    let separator = -1;
    scanCode(entry, (index) => {
        if (separator < 0 && entry[index] === ":") {
            separator = index;
        }
    });
    return separator;
}

function entryKey(entry: string): string | undefined {
    const code = stripComments(entry);
    if (code.startsWith("...")) {
        return undefined;
    }
    const separator = keySeparator(code);
    if (separator < 0) {
        // A field name alone, such as `{auth}`, takes the value of the variable of that name
        return IDENTIFIER.test(code) ? code.replace(/^'/, "") : undefined;
    }
    return code.slice(0, separator).trim().replace(/^'/, "").replace(/^"(.*)"$/, "$1");
}

function entryValue(entry: string): string {
    const code = stripComments(entry);
    const separator = keySeparator(code);
    return separator < 0 ? code.replace(/^'/, "") : code.slice(separator + 1).trim();
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
    return { kind: "record", auth: authEntry ? entryValue(authEntry) : "" };
}

/**
 * Returns the `httpConfig` value with its `auth` entry replaced by `auth`, or removed when `auth` is empty.
 * Returns undefined when the value is not a mapping constructor, so its auth cannot be changed. A value written
 * over several lines keeps one entry per line, so the comments in it still end where they did.
 */
export function writeHttpConfigAuth(httpConfig: string | undefined, auth: string): string | undefined {
    const isEmpty = !httpConfig || httpConfig.trim() === "";
    const entries = isEmpty ? [] : splitEntries(httpConfig);
    if (!entries) {
        return undefined;
    }
    // Comments after the last entry stay last, after an added auth
    const comments = entries.filter(isComment);
    const otherEntries = entries.filter((entry) => !isComment(entry) && entryKey(entry) !== AUTH_KEY);
    if (auth.trim() !== "") {
        otherEntries.push(`${AUTH_KEY}: ${auth.trim()}`);
    }
    if (otherEntries.length === 0 && comments.length === 0) {
        return isEmpty ? "" : "{}";
    }
    const text = isEmpty ? "" : httpConfig.trim();
    if (!text.includes("\n")) {
        return `{${otherEntries.join(", ")}}`;
    }
    const indent = /\n([ \t]*)\S/.exec(text)?.[1] ?? "    ";
    const closingIndent = /\n([ \t]*)\}$/.exec(text)?.[1] ?? "";
    const lines = otherEntries.map((entry, index) => index < otherEntries.length - 1 ? withComma(entry) : entry)
        .concat(comments);
    return `{\n${indent}${lines.join(`\n${indent}`)}\n${closingIndent}}`;
}

// The index of the last character of an entry that is code, not a comment or space, or -1 when it has none.
function lastCodeIndex(entry: string): number {
    let last = -1;
    scanCode(entry, (index) => {
        if (!/\s/.test(entry[index])) {
            last = index;
        }
    });
    return last;
}

// Adds the separating comma after an entry's last code character, ahead of a comment that ends the entry.
function withComma(entry: string): string {
    const last = lastCodeIndex(entry);
    return `${entry.slice(0, last + 1)},${entry.slice(last + 1)}`;
}
