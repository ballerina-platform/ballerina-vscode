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

import type { FormField } from "../Form/types";

/**
 * Splits the raw text of an array into its elements.
 *
 * Only a comma that lies outside of every quoted string, backtick template and nested `[]`, `{}` or `()` is an
 * element separator. The module holds no import of its own, so that it can be exercised in isolation.
 */
export function stringToRawArrayElements(input: string): string[] {
    // remove outer [ ]
    const s = input.trim().slice(1, -1);

    if (s === "") {
        return [];
    }

    const result: string[] = [];
    let current = "";
    let depth = 0;
    let inString = false;
    // Backtick templates such as `string \`...\``, `xml \`...\`` and `re \`...\``. A comma within a template is never
    // an element separator.
    let inTemplate = false;
    // The nesting of the `${...}` interpolations of a template. The expression of an interpolation may hold a quoted
    // string, which in turn may hold a backtick, so the template only ends outside of an interpolation.
    let interpolationDepth = 0;

    for (let i = 0; i < s.length; i++) {
        const char = s[i];
        const prev = s[i - 1];

        // within a quoted string, only its closing quote is significant
        if (inString) {
            if (char === '"' && prev !== "\\") {
                inString = false;
            }
            current += char;
            continue;
        }

        // within the interpolation of a template, the expression ends the interpolation alone
        if (interpolationDepth > 0) {
            if (char === '"') {
                inString = true;
            } else if (char === "{") {
                interpolationDepth++;
            } else if (char === "}") {
                interpolationDepth--;
            }
            current += char;
            continue;
        }

        // within the text of a template, only an interpolation and the closing backtick are significant
        if (inTemplate) {
            if (char === "{" && prev === "$") {
                interpolationDepth++;
            } else if (char === "`") {
                inTemplate = false;
            }
            current += char;
            continue;
        }

        // handle template boundaries
        if (char === "`") {
            inTemplate = true;
            current += char;
            continue;
        }

        // handle string boundaries
        if (char === '"' && prev !== "\\") {
            inString = true;
            current += char;
            continue;
        }

        if (char === "[" || char === "{" || char === "(") depth++;
        if (char === "]" || char === "}" || char === ")") depth--;

        if (char === "," && depth === 0) {
            result.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    // Always push the final element (even if empty) to preserve trailing empty values
    result.push(current);

    return result;
}

/**
 * Builds the raw text of an array out of the elements of the editor.
 */
export function buildStringArray(elements: FormField[]): string {
    if (typeof elements === "string") return elements;
    const parts = elements.map(el => {
        return ((el.value as string) ?? "").trim();
    });
    return `[${parts.join(", ")}]`;
}
