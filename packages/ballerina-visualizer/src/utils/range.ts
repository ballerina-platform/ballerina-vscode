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

// Pure line/character range math extracted from `bi.tsx` so it can be unit tested
// without that module's heavy UI dependencies. `bi.tsx` re-exports these, so
// existing importers of `utils/bi` are unaffected. `LineRange` is a type-only
// import, so this module has no runtime dependency on the @wso2/ballerina-core barrel.

import type { LineRange } from "@wso2/ballerina-core";

export function updateLineRange(lineRange: LineRange, offset: number) {
    if (
        lineRange.startLine.line === 0 &&
        lineRange.startLine.offset === 0 &&
        lineRange.endLine.line === 0 &&
        lineRange.endLine.offset === 0
    ) {
        return {
            startLine: {
                line: lineRange.startLine.line,
                offset: lineRange.startLine.offset + offset,
            },
            endLine: {
                line: lineRange.endLine.line,
                offset: lineRange.endLine.offset + offset,
            },
        };
    }
    return lineRange;
}

/**
 * Returns the line and the character offset of the expression
 *
 * @param expression
 * @returns { lineOffset: number, charOffset: number }
 */
export function calculateExpressionOffsets(
    expression: string,
    cursorPosition: number
): { lineOffset: number, charOffset: number } {
    const effectiveExpression = expression.slice(0, cursorPosition);
    const lines = effectiveExpression.split(/\n/g);
    const lineCount = lines.length - 1;
    const charOffset = lines[lineCount].length;

    return {
        lineOffset: lineCount,
        charOffset: charOffset
    };
}
