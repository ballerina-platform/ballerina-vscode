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

import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { CopilotEventHandler } from '../../../utils/events';
import { searchTools, type SearchableTool } from './matcher';

export type { SearchableTool } from './matcher';

export const TOOL_SEARCH_TOOL_NAME = "tool_search";

const DEFAULT_MAX_RESULTS = 5;

/** What `execute` returns. */
export interface ToolSearchResult {
    loaded: string[];
    message: string;
}

/** The SDK's `ToolResultOutput` (not re-exported by `ai`), taken from the `toModelOutput` signature. */
type ToolResultOutput = Awaited<ReturnType<NonNullable<Tool<any, any>['toModelOutput']>>>;

/**
 * Builds the model-facing result. A result that loads tools holds only the Anthropic
 * `tool_reference` parts (the API rejects any other content beside them); `@ai-sdk/anthropic` turns
 * a `custom` part whose anthropic options say `tool-reference` into `{ type: "tool_reference",
 * tool_name }`, which exposes that deferred tool's definition. A result that loads nothing is text.
 */
export function toToolSearchModelOutput(output: ToolSearchResult): ToolResultOutput {
    const loaded = Array.isArray(output?.loaded) ? output.loaded : [];
    if (loaded.length > 0) {
        return {
            type: "content",
            value: loaded.map(toolName => ({
                type: "custom" as const,
                providerOptions: { anthropic: { type: "tool-reference", toolName } },
            })),
        };
    }
    return { type: "content", value: [{ type: "text", text: output?.message ?? "" }] };
}

export function createToolSearchTool(
    getCatalog: () => readonly SearchableTool[],
    eventHandler: CopilotEventHandler,
) {
    return tool({
        description:
            `Fetches full schema definitions for deferred tools so they can be called.

Deferred tools appear by name in a system message. Until a deferred tool is loaded, only its name is known: there is no parameter schema, so the tool cannot be called. This tool takes a query, matches it against the deferred tools, and makes the matched tools callable from the next step on, exactly like any other tool.

Query forms:
- "select:mcp__github__create_issue,web_fetch" loads these exact tools by name.
- "notebook jupyter" is a keyword search that returns up to max_results best matches.
- "+slack send" requires "slack" in the name or description and ranks by the remaining terms.

Load every deferred tool you need in one call when you can, for example with a select: list.`,
        inputSchema: z.object({
            query: z.string().describe(
                'Query to find deferred tools. Use "select:<tool_name>[,<tool_name>...]" for exact names, ' +
                'keywords such as "notebook jupyter" to search, or "+term" to require a term (e.g. "+slack send").'
            ),
            max_results: z.number().int().min(1).optional().describe(
                `Maximum number of keyword-search results to load (default: ${DEFAULT_MAX_RESULTS}). Ignored for select: queries.`
            ),
        }),
        execute: async ({ query, max_results }, context?: { toolCallId?: string }): Promise<ToolSearchResult> => {
            const toolCallId = context?.toolCallId ?? `tool-search-${Date.now()}`;
            eventHandler({
                type: "tool_call",
                toolName: TOOL_SEARCH_TOOL_NAME,
                toolInput: { query },
                toolCallId,
            });

            const loaded = searchTools(query, getCatalog(), max_results ?? DEFAULT_MAX_RESULTS);
            const result: ToolSearchResult = {
                loaded,
                message: loaded.length > 0
                    ? `Loaded ${loaded.join(", ")}.`
                    : `No deferred tools matched "${query}".`,
            };

            eventHandler({ type: "tool_result", toolName: TOOL_SEARCH_TOOL_NAME, toolOutput: result, toolCallId });
            return result;
        },
        toModelOutput: ({ output }) => toToolSearchModelOutput(output),
    });
}
