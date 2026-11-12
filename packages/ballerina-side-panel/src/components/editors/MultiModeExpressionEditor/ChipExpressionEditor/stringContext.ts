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

/**
 * Where a position sits in a Ballerina expression:
 * - `code`: plain expression source, including inside a template's `${...}`
 * - `string`: inside a `"..."` literal, which does not interpolate
 * - `template`: inside the text of a backtick template, where `${...}` interpolates
 */
export type StringContext = "code" | "string" | "template";

type Frame = { kind: StringContext; braceDepth: number };

type ScanResult = {
    context: StringContext;
    // Start of the escape sequence (`\n`, `\u{1F600}`) that `pos` falls inside, if any.
    escapeStart?: number;
};

/** Scans `text` up to `pos` and returns the lexical context at `pos`. */
export function getStringContextAt(text: string, pos: number): StringContext {
    return scan(text, pos).context;
}

function scan(text: string, pos: number): ScanResult {
    const stack: Frame[] = [{ kind: "code", braceDepth: 0 }];
    const end = Math.min(pos, text.length);

    for (let i = 0; i < end; i++) {
        const top = stack[stack.length - 1];
        const c = text[i];

        if (top.kind === "string") {
            if (c === "\\") {
                const escapeEnd = getEscapeEnd(text, i);
                if (pos < escapeEnd) {
                    return { context: "string", escapeStart: i };
                }
                i = escapeEnd - 1;
            } else if (c === '"') {
                stack.pop();
            }
            continue;
        }

        if (top.kind === "template") {
            if (c === "`") {
                stack.pop();
            } else if (c === "$" && text[i + 1] === "{") {
                stack.push({ kind: "code", braceDepth: 0 });
                i++;
            }
            continue;
        }

        if (c === '"') {
            stack.push({ kind: "string", braceDepth: 0 });
        } else if (c === "`") {
            stack.push({ kind: "template", braceDepth: 0 });
        } else if (c === "/" && text[i + 1] === "/") {
            const newline = text.indexOf("\n", i);
            if (newline === -1 || newline >= end) {
                return { context: "code" };
            }
            i = newline;
        } else if (c === "{") {
            top.braceDepth++;
        } else if (c === "}") {
            if (top.braceDepth > 0) {
                top.braceDepth--;
            } else if (stack.length > 1) {
                // Closes the `${` that opened this code frame.
                stack.pop();
            }
        }
    }

    return { context: stack[stack.length - 1].kind };
}

// End (exclusive) of the escape sequence starting at the backslash at `start`.
function getEscapeEnd(text: string, start: number): number {
    if (text[start + 1] === "u" && text[start + 2] === "{") {
        const close = text.indexOf("}", start + 3);
        return close === -1 ? text.length : close + 1;
    }
    return Math.min(start + 2, text.length);
}

export type HelperInsertionWrap = {
    prefix: string;
    suffix: string;
    // Moves a collapsed cursor here first, when inserting at the cursor itself would break the source.
    at?: number;
};

export const NO_WRAP: HelperInsertionWrap = { prefix: "", suffix: "" };

/**
 * How to wrap a helper-pane value inserted at `pos` so it stays an expression:
 * interpolated inside a template, and spliced in by concatenation inside a `"..."`
 * literal (which treats `${...}` as plain text).
 */
export function getHelperInsertionWrap(text: string, pos: number): HelperInsertionWrap {
    const { context, escapeStart } = scan(text, pos);
    switch (context) {
        case "template":
            return { prefix: "${", suffix: "}" };
        case "string":
            // Splitting an escape sequence would break the literal, so insert before it.
            return { prefix: '" + ', suffix: ' + "', ...(escapeStart !== undefined && { at: escapeStart }) };
        default:
            return NO_WRAP;
    }
}

export type HelperInsertion = { from: number; to: number; insert: string; cursor: number };

/**
 * Where a helper-pane value goes in `doc` and where the cursor lands afterwards.
 *
 * - `wrap` places the value inside a string or template (see {@link getHelperInsertionWrap});
 *   pass {@link NO_WRAP} when the pick replaces a chip or the whole document, which are never wrapped.
 * - `argsCursorOffset` is the cursor's offset into `value` when it should land on a function's
 *   arguments (`fn(|)`); otherwise it lands after everything inserted.
 */
export function composeHelperInsertion(
    selection: { from: number; to: number },
    wrap: HelperInsertionWrap,
    value: string,
    argsCursorOffset?: number
): HelperInsertion {
    const { prefix, suffix } = wrap;
    // Only a collapsed cursor moves out of an escape; a selection keeps its own range.
    const from = wrap.at !== undefined && selection.from === selection.to ? wrap.at : selection.from;
    const to = selection.from === selection.to ? from : selection.to;
    const insert = prefix + value + suffix;
    const cursor = argsCursorOffset === undefined
        ? from + insert.length
        : from + prefix.length + argsCursorOffset;
    return { from, to, insert, cursor };
}
