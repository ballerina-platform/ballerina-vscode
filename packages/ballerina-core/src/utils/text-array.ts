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

// A list-of-text field (TEXT_SET) and the Ballerina source it stands for: one string literal, or a
// list of them. Mirrors the language server's WorkflowUtil.roleFieldValue/roleSource so a value
// converts the same way whichever side does it.

/** The escapes a Ballerina string literal defines, decoded. */
export function stringLiteralText(literal: string): string | undefined {
    const trimmed = literal.trim();
    if (trimmed.length < 2 || !trimmed.startsWith('"') || !trimmed.endsWith('"')) {
        return undefined;
    }
    const body = trimmed.slice(1, -1);
    let text = "";
    for (let i = 0; i < body.length; i++) {
        const current = body[i];
        if (current === '"') {
            // The quotes are not this expression's own: it is not a single string literal.
            return undefined;
        }
        if (current !== "\\") {
            text += current;
            continue;
        }
        const next = body[i + 1];
        if (next === "u") {
            // A numeric escape, decoded: re-encoding cannot reproduce the escape, only the
            // character it names, so leaving it as written doubles its backslash on the way out.
            // An invalid code point or a lone surrogate names no character and stays as written,
            // which is what the language server's decoder does with it.
            const close = body[i + 2] === "{" ? body.indexOf("}", i + 3) : -1;
            const digits = close === -1 ? "" : body.slice(i + 3, close);
            const code = /^[0-9a-fA-F]+$/.test(digits) ? Number.parseInt(digits, 16) : NaN;
            if (Number.isInteger(code) && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) {
                text += String.fromCodePoint(code);
                i = close;
                continue;
            }
            text += current;
            continue;
        }
        switch (next) {
            case "n": text += "\n"; break;
            case "t": text += "\t"; break;
            case "r": text += "\r"; break;
            case '"': text += '"'; break;
            case "\\": text += "\\"; break;
            default: text += current + (next ?? ""); break;
        }
        i++;
    }
    return text;
}

/** The text as a Ballerina string literal, quotes included. */
export function stringLiteral(text: string): string {
    return '"' + text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t").replace(/\r/g, "\\r") + '"';
}

/**
 * The items a TEXT_SET field shows for a source expression: one literal or a list of literals
 * decoded, `()` and nothing as no items, and undefined for anything else — a reference or a call
 * belongs to the expression mode.
 */
export function parseTextArraySource(source: string): string[] | undefined {
    const trimmed = (source ?? "").trim();
    if (trimmed === "" || trimmed === "()" || trimmed === "[]") {
        return [];
    }
    const single = stringLiteralText(trimmed);
    if (single !== undefined) {
        return [single];
    }
    if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
        return undefined;
    }
    const items: string[] = [];
    for (const part of splitTopLevel(trimmed.slice(1, -1))) {
        const candidate = part.trim();
        if (candidate === "") {
            continue;
        }
        const text = stringLiteralText(candidate);
        if (text === undefined) {
            return undefined;
        }
        items.push(text);
    }
    return items;
}

/** The source for the items a TEXT_SET field holds: one as the literal alone, several as a list. */
export function textArraySource(items: readonly string[]): string {
    const literals = items.map((item) => item.trim()).filter((item) => item !== "").map(stringLiteral);
    if (literals.length === 0) {
        return "";
    }
    return literals.length === 1 ? literals[0] : `[${literals.join(", ")}]`;
}

// Splits on the commas that sit outside quotes and brackets.
function splitTopLevel(text: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quoted = false;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === "\\") {
                i++;
            } else if (ch === '"') {
                quoted = false;
            }
            continue;
        }
        if (ch === '"') {
            quoted = true;
        } else if (ch === "[" || ch === "{" || ch === "(") {
            depth++;
        } else if (ch === "]" || ch === "}" || ch === ")") {
            depth--;
        } else if (ch === "," && depth === 0) {
            parts.push(text.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(text.slice(start));
    return parts;
}

/**
 * The value to carry when a field switches between its list-of-text mode and its expression mode:
 * the list becomes the source for it, the source becomes the items it names. Undefined when the
 * value already suits the mode, or cannot be shown in it — a reference has no items to list.
 *
 * @param intoList whether the newly chosen mode is the list one
 * @param value    the value the field holds now
 */
export function carryTextArrayValue(intoList: boolean, value: unknown): string | string[] | undefined {
    if (intoList) {
        return typeof value === "string" && value !== "" ? parseTextArraySource(value) : undefined;
    }
    return Array.isArray(value) ? textArraySource(value.map(String)) : undefined;
}
