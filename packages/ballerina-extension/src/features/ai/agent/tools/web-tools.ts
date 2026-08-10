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

import { tool, generateText, hasToolCall, Tool } from 'ai';
import { z } from 'zod';
import { anthropic } from '@ai-sdk/anthropic';
import { v4 as uuidv4 } from 'uuid';
import { CopilotEventHandler } from '../../utils/events';
import { approvalManager } from '../../state/ApprovalManager';
import { getAnthropicClient, getProviderModelOptions, ANTHROPIC_SONNET } from '../../utils/ai-client';
import { sendWebToolToggleNotification } from '../../utils/ai-utils';

const WEB_TOOL_NOTIFICATION_TYPE = "webtool";

export const WEB_SEARCH_TOOL_NAME = "web_search";
export const WEB_FETCH_TOOL_NAME = "web_fetch";

approvalManager.registerNotificationHandler(WEB_TOOL_NOTIFICATION_TYPE, (active) => {
    sendWebToolToggleNotification(active);
});

function sanitizeDomainList(domains?: string[]): string[] | undefined {
    if (!domains || domains.length === 0) { return undefined; }
    const sanitized = Array.from(new Set(domains.map(d => d.trim()).filter(d => d.length > 0)));
    return sanitized.length > 0 ? sanitized : undefined;
}

function getProviderToolFactory(candidateNames: string[]): ((args: Record<string, unknown>) => Tool<unknown, unknown>) | null {
    for (const name of candidateNames) {
        const factory = (anthropic as any)?.tools?.[name];
        if (typeof factory === 'function') { return factory; }
    }
    return null;
}

function extractToolOutput(result: any): string {
    try {
        for (const step of result.steps ?? []) {
            if (Array.isArray(step?.toolResults) && step.toolResults.length > 0) {
                const toolOutput = step.toolResults[0]?.output;
                if (toolOutput !== undefined) {
                    return typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput, null, 2);
                }
            }
            if (Array.isArray(step?.content)) {
                for (const part of step.content) {
                    if (part?.type === 'tool-error') {
                        const errorCode = (part?.error as any)?.errorCode ?? (part?.error as any)?.type ?? 'unknown';
                        return `Web fetch failed: ${errorCode} (url: ${(part?.input as any)?.url ?? 'unknown'})`;
                    }
                }
            }
        }
    } catch {
        // fall through
    }
    return result.text;
}

async function requestApprovalIfNeeded(
    toolName: typeof WEB_SEARCH_TOOL_NAME | typeof WEB_FETCH_TOOL_NAME,
    displayContent: string,
    webSearchEnabled: boolean,
    eventHandler: CopilotEventHandler,
): Promise<boolean> {
    if (webSearchEnabled) { return true; }
    const requestId = `web-${uuidv4()}`;
    const { approved } = await approvalManager.requestWebToolApproval(requestId, toolName, displayContent, eventHandler);
    return approved;
}

const WebSearchInputSchema = z.object({
    query: z.string().describe('The search query.'),
    context: z.string().describe('What you are trying to accomplish with this search. Helps focus the synthesized results.'),
    allowed_domains: z.array(z.string()).optional().describe('Optional allow-list of domains to restrict search results to.'),
    blocked_domains: z.array(z.string()).optional().describe('Optional block-list of domains to exclude from search results.'),
});
export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

const WEB_SEARCH_SYSTEM_PROMPT = `You are a research assistant. Search the web and return a comprehensive, well-structured answer.
Rules:
- Do NOT narrate your search process ("I'll search...", "Let me look...", "Based on the results..."). Output only the answer.
- Search multiple times if needed to gather complete information before answering.
- Include all relevant details, facts, and code examples. Cite sources where applicable.
- If you made a significant decision while researching (e.g. chose one version/approach over another), briefly state why — this helps the main agent reason correctly.`;

export function createWebSearchTool(eventHandler: CopilotEventHandler, webSearchEnabled: boolean) {
    return tool({
        description: 'Search the web for information on a query. Acts as a research sub-agent: performs the search and returns a synthesized, detailed answer with relevant facts and sources — not raw results. Provide the search query and the context of what you are trying to accomplish so the results can be focused. Supports optional domain allow/block filters.',
        inputSchema: WebSearchInputSchema,
        execute: async (input, context?: { toolCallId?: string }) => {
            const toolCallId = context?.toolCallId || `fallback-${Date.now()}`;
            return executeWebSearch(input, webSearchEnabled, eventHandler, toolCallId);
        },
    });
}

async function executeWebSearch(
    input: WebSearchInput,
    webSearchEnabled: boolean,
    eventHandler: CopilotEventHandler,
    toolCallId: string
): Promise<string> {
    const displayContent = `Search the web for: "${input.query}"`;

    const approved = await requestApprovalIfNeeded(WEB_SEARCH_TOOL_NAME, displayContent, webSearchEnabled, eventHandler);
    if (!approved) {
        return 'User denied web search. Continue without web access.';
    }

    eventHandler({ type: "tool_call", toolName: WEB_SEARCH_TOOL_NAME, toolInput: { query: input.query }, toolCallId });

    try {
        if (!webSearchEnabled) {
            approvalManager.trackNotificationStart(WEB_TOOL_NOTIFICATION_TYPE);
        }

        const searchFactory = getProviderToolFactory(['webSearch_20250305']);
        if (!searchFactory) {
            eventHandler({ type: "tool_result", toolName: WEB_SEARCH_TOOL_NAME, toolOutput: { query: input.query }, toolCallId, failed: true });
            return 'Web search tool is unavailable in this environment.';
        }

        const allowedDomains = sanitizeDomainList(input.allowed_domains);
        const blockedDomains = sanitizeDomainList(input.blocked_domains);

        console.log(`[WebTools] search | query: ${input.query} | context: ${input.context}`);
        const result = await generateText({
            model: await getAnthropicClient(ANTHROPIC_SONNET),
            providerOptions: await getProviderModelOptions(),
            system: WEB_SEARCH_SYSTEM_PROMPT,
            prompt: `Context: ${input.context}\n\nSearch query: ${input.query}\n\nSearch the web and provide a detailed, accurate answer based on the results.`,
            tools: {
                web_search: searchFactory({
                    maxUses: 5,
                    ...(allowedDomains ? { allowedDomains } : {}),
                    ...(blockedDomains ? { blockedDomains } : {}),
                }),
            },
        });

        const content = result.text || 'Web search completed but returned no content.';
        console.log(`[WebTools] search | done | length: ${content.length}`);

        eventHandler({ type: "tool_result", toolName: WEB_SEARCH_TOOL_NAME, toolOutput: { query: input.query }, toolCallId });
        return content;
    } catch (error: any) {
        console.error('[WebTools] search | error:', error?.message || error);
        eventHandler({ type: "tool_result", toolName: WEB_SEARCH_TOOL_NAME, toolOutput: { query: input.query }, toolCallId, failed: true });
        const errorMessage = error?.message || String(error);
        if (errorMessage.includes('responses API is unavailable')) {
            return 'Web search failed: Anthropic responses API is unavailable in this environment.';
        }
        return `Web search failed: ${errorMessage}`;
    } finally {
        if (!webSearchEnabled) {
            approvalManager.trackNotificationEnd(WEB_TOOL_NOTIFICATION_TYPE);
        }
    }
}

const WebFetchInputSchema = z.object({
    url: z.string().url().describe('The URL to fetch.'),
    prompt: z.string().describe('What to extract or analyze from the fetched page.'),
    allowed_domains: z.array(z.string()).optional().describe('Optional allow-list of domains that fetch requests can access.'),
    blocked_domains: z.array(z.string()).optional().describe('Optional block-list of domains that fetch requests must avoid.'),
});
export type WebFetchInput = z.infer<typeof WebFetchInputSchema>;

export function createWebFetchTool(eventHandler: CopilotEventHandler, webSearchEnabled: boolean) {
    return tool({
        description: 'Fetch and return the raw content of a specific URL. Use this when you have an exact URL (documentation page, API spec, JSON endpoint, etc.) and need its content. Returns the raw page content as-is. Supports optional domain allow/block filters.',
        inputSchema: WebFetchInputSchema,
        execute: async (input, context?: { toolCallId?: string }) => {
            const toolCallId = context?.toolCallId || `fallback-${Date.now()}`;
            return executeWebFetch(input, webSearchEnabled, eventHandler, toolCallId);
        },
    });
}

async function executeWebFetch(
    input: WebFetchInput,
    webSearchEnabled: boolean,
    eventHandler: CopilotEventHandler,
    toolCallId: string
): Promise<string> {
    const displayContent = `Fetch content from: ${input.url}`;

    const approved = await requestApprovalIfNeeded(WEB_FETCH_TOOL_NAME, displayContent, webSearchEnabled, eventHandler);
    if (!approved) {
        return 'User denied web fetch. Continue without web access.';
    }

    eventHandler({ type: "tool_call", toolName: WEB_FETCH_TOOL_NAME, toolInput: { url: input.url }, toolCallId });

    try {
        if (!webSearchEnabled) {
            approvalManager.trackNotificationStart(WEB_TOOL_NOTIFICATION_TYPE);
        }

        const fetchFactory = getProviderToolFactory(['webFetch_20250910', 'webFetch_20250305']);
        if (!fetchFactory) {
            eventHandler({ type: "tool_result", toolName: WEB_FETCH_TOOL_NAME, toolOutput: { url: input.url }, toolCallId, failed: true });
            return 'Web fetch tool is unavailable in this environment.';
        }

        const allowedDomains = sanitizeDomainList(input.allowed_domains);
        const blockedDomains = sanitizeDomainList(input.blocked_domains);

        console.log(`[WebTools] fetch | url: ${input.url}`);
        const result = await generateText({
            model: await getAnthropicClient(ANTHROPIC_SONNET),
            providerOptions: await getProviderModelOptions(),
            system: 'You are a web fetcher. Your only job is to invoke the web_fetch tool with the given URL. STRICT RULES: (1) Do NOT write any text before the tool call. (2) Do NOT write any text after the tool call. (3) Do NOT summarize, describe, or explain the result. The tool result is consumed programmatically — any text you emit is ignored and wastes tokens.',
            prompt: `URL: ${input.url}`,
            tools: {
                web_fetch: fetchFactory({
                    maxUses: 3,
                    ...(allowedDomains ? { allowedDomains } : {}),
                    ...(blockedDomains ? { blockedDomains } : {}),
                }),
            },
            toolChoice: { type: 'tool', toolName: 'web_fetch' },
            stopWhen: hasToolCall('web_fetch'),
        });

        const content = extractToolOutput(result);
        console.log(`[WebTools] fetch | done | length: ${content?.length ?? 0}`);

        eventHandler({ type: "tool_result", toolName: WEB_FETCH_TOOL_NAME, toolOutput: { url: input.url }, toolCallId });
        return content || 'Web fetch completed.';
    } catch (error: any) {
        console.error('[WebTools] fetch | error:', error?.message || error);
        eventHandler({ type: "tool_result", toolName: WEB_FETCH_TOOL_NAME, toolOutput: { url: input.url }, toolCallId, failed: true });
        const errorMessage = error?.message || String(error);
        if (errorMessage.includes('responses API is unavailable')) {
            return 'Web fetch failed: Anthropic responses API is unavailable in this environment.';
        }
        return `Web fetch failed: ${errorMessage}`;
    } finally {
        if (!webSearchEnabled) {
            approvalManager.trackNotificationEnd(WEB_TOOL_NOTIFICATION_TYPE);
        }
    }
}
