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

// Pure diagnostic-mapping helpers extracted from `bi.tsx` so they can be unit
// tested without dragging that module's heavy UI dependencies (react-markdown,
// highlight.js, @wso2/bi-diagram, …). `bi.tsx` re-exports these, so existing
// importers of `utils/bi` are unaffected. `Diagnostic` is imported as a type only,
// so this module has no runtime dependency on the @wso2/ballerina-core barrel.

import type { Diagnostic } from "@wso2/ballerina-core";

/**
 * Remove duplicate diagnostics based on the range and message
 * @param diagnostics The diagnostics array to remove duplicates from
 * @returns The unique diagnostics array
 */
export function removeDuplicateDiagnostics(diagnostics: Diagnostic[]) {
    const uniqueDiagnostics = diagnostics?.filter((diagnostic, index, self) => {
        return (
            self.findIndex((item) => {
                const itemRange = item.range;
                const diagnosticRange = diagnostic.range;
                return (
                    itemRange.start.line === diagnosticRange.start.line &&
                    itemRange.start.character === diagnosticRange.start.character &&
                    itemRange.end.line === diagnosticRange.end.line &&
                    itemRange.end.character === diagnosticRange.end.character &&
                    item.message === diagnostic.message
                );
            }) === index
        );
    });

    return uniqueDiagnostics;
}

/**
 * Filters the unsupported diagnostics for local connections
 * @param diagnostics - Diagnostics to filter
 * @returns Filtered diagnostics
 */
export function filterUnsupportedDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    return diagnostics.filter((diagnostic) => {
        return !diagnostic.message.startsWith('unknown type') && !diagnostic.message.startsWith('undefined module');
    });
}

/**
 * Filter out "undefined symbol" diagnostics when the symbol is a known Tool Input parameter
 * @param diagnostics - Array of diagnostics to filter
 * @param toolInputParameterNames - Array of Tool Input parameter names to exclude from diagnostics
 * @returns Filtered diagnostics array
 */
export function filterToolInputSymbolDiagnostics(
    diagnostics: Diagnostic[],
    toolInputs?: { type: string, variable: string }[]
): Diagnostic[] {
    if (!toolInputs || toolInputs.length === 0) {
        return diagnostics;
    }

    return diagnostics.filter((diagnostic) => {
        // Only filter "undefined symbol" diagnostics
        if (!diagnostic.message.includes('undefined symbol')) {
            return true;
        }

        // Extract symbol name from message like "undefined symbol 'code'"
        const match = diagnostic.message.match(/['"`]([^'"`]+)['"`]/);
        if (!match) {
            return true; // Keep diagnostic if we can't parse it
        }

        const symbolName = match[1];
        // Filter out if symbol is a Tool Input parameter
        return !toolInputs.some(input => input.variable === symbolName);
    });
}
