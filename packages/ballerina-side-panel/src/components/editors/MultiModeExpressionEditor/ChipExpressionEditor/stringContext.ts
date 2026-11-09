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

/** Scans `text` up to `pos` and returns the lexical context at `pos`. */
export function getStringContextAt(text: string, pos: number): StringContext {
    const stack: Frame[] = [{ kind: "code", braceDepth: 0 }];
    const end = Math.min(pos, text.length);

    for (let i = 0; i < end; i++) {
        const top = stack[stack.length - 1];
        const c = text[i];

        if (top.kind === "string") {
            if (c === "\\") {
                i++;
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
                return "code";
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

    return stack[stack.length - 1].kind;
}

export type HelperInsertionWrap = { prefix: string; suffix: string };

export const NO_WRAP: HelperInsertionWrap = { prefix: "", suffix: "" };

/**
 * How to wrap a helper-pane value inserted at `pos` so it stays an expression:
 * interpolated inside a template, and spliced in by concatenation inside a `"..."`
 * literal (which treats `${...}` as plain text).
 */
export function getHelperInsertionWrap(text: string, pos: number): HelperInsertionWrap {
    switch (getStringContextAt(text, pos)) {
        case "template":
            return { prefix: "${", suffix: "}" };
        case "string":
            return { prefix: '" + ', suffix: ' + "' };
        default:
            return NO_WRAP;
    }
}
