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

import { tool, generateText, Tool } from 'ai';
import { z } from 'zod';
import { anthropic } from '@ai-sdk/anthropic';
import { v4 as uuidv4 } from 'uuid';
import { CopilotEventHandler } from '../../utils/events';
import { approvalManager } from '../../state/ApprovalManager';
import { LoginMethod } from '@wso2/ballerina-core';
import { getAnthropicClient, getProviderModelOptions, ANTHROPIC_SONNET } from '../../utils/ai-client';
import { getLoginMethod } from '../../../../utils/ai/auth';
import { answerText, formatReaderAnswer, readerCalledATool, retryOnce, webFetchFailure, webSearchToolVersions, WEB_FETCH_READER_SYSTEM_PROMPT } from './web-tool-helpers';

export const WEB_SEARCH_TOOL_NAME = "web_search";
export const WEB_FETCH_TOOL_NAME = "web_fetch";

function sanitizeDomainList(domains?: string[]): string[] | undefined {
    if (!domains || domains.length === 0) { return undefined; }
    const sanitized = Array.from(new Set(domains.map(d => d.trim()).filter(d => d.length > 0)));
    return sanitized.length > 0 ? sanitized : undefined;
}

/** The provider tool's domain filters, with empty lists left out. */
function domainOptions(input: { allowed_domains?: string[]; blocked_domains?: string[] }) {
    const allowedDomains = sanitizeDomainList(input.allowed_domains);
    const blockedDomains = sanitizeDomainList(input.blocked_domains);
    return {
        ...(allowedDomains ? { allowedDomains } : {}),
        ...(blockedDomains ? { blockedDomains } : {}),
    };
}

function getProviderToolFactory(candidateNames: string[]): ((args: Record<string, unknown>) => Tool<unknown, unknown>) | null {
    for (const name of candidateNames) {
        const factory = (anthropic as any)?.tools?.[name];
        if (typeof factory === 'function') { return factory; }
    }
    return null;
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
        const [loginMethod, model, providerOptions] = await Promise.all([
            getLoginMethod(), getAnthropicClient(ANTHROPIC_SONNET), getProviderModelOptions('low'),
        ]);
        const searchFactory = getProviderToolFactory(webSearchToolVersions(loginMethod === LoginMethod.VERTEX_AI));
        if (!searchFactory) {
            eventHandler({ type: "tool_result", toolName: WEB_SEARCH_TOOL_NAME, toolOutput: { query: input.query }, toolCallId, failed: true });
            return 'Web search tool is unavailable in this environment.';
        }

        console.log(`[WebTools] search | query: ${input.query} | context: ${input.context}`);
        const result = await generateText({
            model,
            providerOptions,
            system: WEB_SEARCH_SYSTEM_PROMPT,
            prompt: `Context: ${input.context}\n\nSearch query: ${input.query}\n\nSearch the web and provide a detailed, accurate answer based on the results.`,
            tools: {
                web_search: searchFactory({ maxUses: 5, ...domainOptions(input) }),
            },
        });

        const content = answerText(result.steps) || 'Web search completed but returned no content.';
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
    }
}

const WebFetchInputSchema = z.object({
    url: z.string().url().describe('The URL to fetch.'),
    prompt: z.string().describe('The question to answer from the page. A reader model answers it from the full page and returns only the answer. To get code, a schema, or other content verbatim, ask for it verbatim.'),
    allowed_domains: z.array(z.string()).optional().describe('Optional allow-list of domains that fetch requests can access.'),
    blocked_domains: z.array(z.string()).optional().describe('Optional block-list of domains that fetch requests must avoid.'),
});
export type WebFetchInput = z.infer<typeof WebFetchInputSchema>;

export function createWebFetchTool(eventHandler: CopilotEventHandler, webSearchEnabled: boolean) {
    return tool({
        description: 'Fetch a URL and answer a question about its content. A reader model reads the full page and returns only its answer, so long pages stay out of your context. Use this when you have an exact URL (documentation page, API spec, JSON endpoint, etc.). Supports optional domain allow/block filters.',
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
        const fetchFactory = getProviderToolFactory(['webFetch_20260209', 'webFetch_20250910']);
        if (!fetchFactory) {
            eventHandler({ type: "tool_result", toolName: WEB_FETCH_TOOL_NAME, toolOutput: { url: input.url }, toolCallId, failed: true });
            return 'Web fetch tool is unavailable in this environment.';
        }

        console.log(`[WebTools] fetch | url: ${input.url}`);
        // Claude Sonnet 5.5 rejects a forced tool choice, so the prompt asks for the fetch and the
        // result is checked for it; a run that answered without fetching is retried once.
        const [model, providerOptions] = await Promise.all([getAnthropicClient(ANTHROPIC_SONNET), getProviderModelOptions('low')]);
        const runReader = async () => {
            const result = await generateText({
                model,
                providerOptions,
                // The reader answers in a few paragraphs; the cap also bounds its thinking.
                maxOutputTokens: 16000,
                system: WEB_FETCH_READER_SYSTEM_PROMPT,
                prompt: `URL: ${input.url}\n\nQuestion: ${input.prompt}`,
                tools: {
                    web_fetch: fetchFactory({ maxUses: 3, ...domainOptions(input) }),
                },
            });
            if (!readerCalledATool(result.steps)) { return undefined; }
            // A reader whose every fetch failed may still write a summary; report the failure instead.
            const failure = webFetchFailure(result.steps);
            if (failure) { return { output: `Web fetch failed for ${input.url}: ${failure}`, failed: true }; }
            return formatReaderAnswer(input.url, answerText(result.steps), result.finishReason);
        };
        const { output, failed } = (await retryOnce(runReader))
            ?? { output: `Web fetch failed: the reader did not fetch ${input.url}.`, failed: true };
        console.log(`[WebTools] fetch | done | failed: ${failed} | length: ${output.length}`);

        eventHandler({ type: "tool_result", toolName: WEB_FETCH_TOOL_NAME, toolOutput: { url: input.url }, toolCallId, ...(failed ? { failed: true } : {}) });
        return output;
    } catch (error: any) {
        console.error('[WebTools] fetch | error:', error?.message || error);
        eventHandler({ type: "tool_result", toolName: WEB_FETCH_TOOL_NAME, toolOutput: { url: input.url }, toolCallId, failed: true });
        const errorMessage = error?.message || String(error);
        if (errorMessage.includes('responses API is unavailable')) {
            return 'Web fetch failed: Anthropic responses API is unavailable in this environment.';
        }
        return `Web fetch failed: ${errorMessage}`;
    }
}
