/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { keywords } from "./keywords";

/*
 * Names and paths in the models from the language server are in source form (`issue\-number`, `'type`,
 * `/issues\-memox`). Forms show and accept the plain name (`issue-number`, `type`, `/issues-memox`); the language
 * server escapes it when it writes the source (IdentifierUtil in model-generator-commons). These helpers mirror that
 * class and share its test vectors (IdentifierUtilTest), so the two stay in step.
 *
 * A backslash is always read as an escape, so a name cannot contain a literal backslash: `a\-b` and `a\\\-b` both
 * mean `a-b`.
 */

const NUMERIC_ESCAPE = /\\+u\{([0-9a-fA-F]{1,6})\}/g;
const LETTER_OR_DIGIT = new RegExp("[\\p{L}\\p{N}]", "u");
// Stands in for a backslash decoded from a numeric escape while the written escapes are dropped
const DECODED_BACKSLASH = "";
const QUOTABLE_KEYWORDS = new Set(keywords);

/**
 * The plain name for a name in source form: drops a leading `'`, decodes `\u{…}` and removes every other backslash.
 * Use it to show or compare a name; the language server writes the source form.
 */
export function toDisplayName(name: string): string {
    if (!name) {
        return name;
    }
    const plain = name.startsWith("'") ? name.substring(1) : name;
    if (!plain.includes("\\")) {
        return plain;
    }
    const decoded = plain.replace(NUMERIC_ESCAPE, (escape: string, hex: string) => {
        const codePoint = parseInt(hex, 16);
        if (codePoint > 0x10ffff) {
            return escape;
        }
        return codePoint === 0x5c ? DECODED_BACKSLASH : String.fromCodePoint(codePoint);
    });
    return decoded.replace(/\\/g, "").split(DECODED_BACKSLASH).join("\\");
}

/**
 * The plain form of a service base path or a resource path (`/issues\-memox` → `/issues-memox`). Path parameters
 * (`[int id]`) and string literal paths (`"/foo"`) are kept as they are.
 */
export function toDisplayPath(path: string): string {
    if (!path || !path.trim()) {
        return path;
    }
    const trimmed = path.trim();
    if (trimmed.startsWith("\"")) {
        return trimmed;
    }
    return splitPath(trimmed)
        .map((segment) => {
            const stripped = segment.trim();
            return stripped.startsWith("[") ? stripped : toDisplayName(stripped);
        })
        .join("/");
}

/**
 * The source identifier for a name typed in a form, for the few places outside the language server that write a
 * name (e.g. a rename). Accepts the plain or the escaped form and returns the same result for both.
 */
export function toSourceIdentifier(name: string): string {
    if (!name || !name.trim()) {
        return name;
    }
    const plain = toDisplayName(name.trim());
    if (!plain) {
        return plain;
    }
    if (QUOTABLE_KEYWORDS.has(plain)) {
        return "'" + plain;
    }
    let source = "";
    let first = true;
    for (const ch of plain) {
        source += escapeChar(ch, first);
        first = false;
    }
    return source;
}

function escapeChar(ch: string, first: boolean): string {
    if (ch === "_" || /^[a-zA-Z]$/.test(ch)) {
        return ch;
    }
    if (/^[0-9]$/.test(ch)) {
        return first ? "\\" + ch : ch;
    }
    if (ch === " ") {
        return "\\ ";
    }
    const codePoint = ch.codePointAt(0);
    if (ch === "\\" || /^\s$/.test(ch) || codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) {
        return "\\u{" + codePoint.toString(16).toUpperCase() + "}";
    }
    if (codePoint > 0x7f && LETTER_OR_DIGIT.test(ch)) {
        return ch;
    }
    return "\\" + ch;
}

const GRAPHQL_NAME = /^[_A-Za-z][_0-9A-Za-z]*$/;

export const GRAPHQL_NAME_ERROR =
    "A GraphQL name can only have letters, digits and underscores, and cannot start with a digit";

/**
 * GraphQL names allow only `[_A-Za-z][_0-9A-Za-z]*`, so a name the language server would escape (`issue-number`)
 * builds but cannot be queried. A keyword is fine: `type` is written as `'type` and served as `type`.
 *
 * @returns the error message, or `undefined` when the name is a valid GraphQL name (or empty)
 */
export function getGraphqlNameError(name: string): string | undefined {
    if (!name || !name.trim()) {
        return undefined;
    }
    return GRAPHQL_NAME.test(toDisplayName(name.trim())) ? undefined : GRAPHQL_NAME_ERROR;
}

/** The client rule (see the side panel's validation rules) that applies {@link getGraphqlNameError} to a form field. */
export const GRAPHQL_NAME_RULE = "graphql.validate.name";

/** Adds the GraphQL name rule to the types of a name field, so the form rejects a name GraphQL cannot serve. */
export function withGraphqlNameRule<T extends { validations?: { rule: string }[] }>(types: T[] | undefined): T[] | undefined {
    return types?.map((type) => ({
        ...type,
        validations: [
            ...(type.validations ?? []).filter((validation) => validation.rule !== GRAPHQL_NAME_RULE),
            { rule: GRAPHQL_NAME_RULE, severity: "ERROR" },
        ],
    }));
}

/** Splits a path on `/` characters that are neither escaped nor inside a `[…]` path parameter. */
function splitPath(path: string): string[] {
    const segments: string[] = [];
    let current = "";
    let bracketDepth = 0;
    for (let i = 0; i < path.length; i++) {
        const ch = path[i];
        if (ch === "\\" && i + 1 < path.length) {
            current += ch + path[++i];
            continue;
        }
        // A `[` opens a path param only at the start of a segment; elsewhere (`a[b`) it is an ordinary character
        if (ch === "[" && (bracketDepth > 0 || current.trim() === "")) {
            bracketDepth++;
        } else if (ch === "]" && bracketDepth > 0) {
            bracketDepth--;
        } else if (ch === "/" && bracketDepth === 0) {
            segments.push(current);
            current = "";
            continue;
        }
        current += ch;
    }
    segments.push(current);
    return segments;
}
