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
 * Pure helpers for the web tools' nested model calls, kept apart from web-tools.ts so Jest can load
 * them: web-tools pulls in vscode through the AI client.
 */

export const READER_FETCH_FAILED_PREFIX = 'Fetch failed:';

/**
 * The web search factories to try, newest first. The `_20260209` version filters results with code
 * execution before the model reads them; `@ai-sdk/google-vertex` lists only `_20250305` for Vertex AI,
 * so Vertex gets that one.
 */
export function webSearchToolVersions(isVertex: boolean): string[] {
    return isVertex ? ['webSearch_20250305'] : ['webSearch_20260209', 'webSearch_20250305'];
}

export const WEB_FETCH_READER_SYSTEM_PROMPT = `You read one web page for another agent. Call web_fetch on the URL, then answer the question using only the fetched content.
Rules:
- Always fetch the URL first. Never answer from memory or prior knowledge.
- Output only the answer. Do not narrate the fetch ("I'll fetch...", "The page says...").
- Quote code, configuration, API signatures, and version numbers exactly as the page shows them.
- If the page does not answer the question, say so, then summarize what the page does cover.
- If the fetch fails, reply with "${READER_FETCH_FAILED_PREFIX}" followed by the reason.`;

interface PartLike {
    type?: string;
    text?: string;
    toolName?: string;
    output?: unknown;
    error?: unknown;
}

interface StepLike {
    toolCalls?: unknown[];
    content?: PartLike[];
}

const TOOL_PART_TYPES = new Set(['tool-call', 'tool-result', 'tool-error']);

/**
 * The model's answer: the text after its last tool part. With dynamic filtering, the search or
 * fetch runs inside code execution in one step, and the model writes notes between its calls
 * ("Result is a string; parse it."); `result.text` joins those notes onto the front of the answer.
 * A step that ends on a tool part has no answer, so its notes are never passed off as one; a step
 * with no tool parts returns all of its text.
 */
export function answerText(steps: StepLike[] | undefined): string {
    const content = steps?.[steps.length - 1]?.content ?? [];
    const lastToolPart = content.reduce((last, part, i) => (TOOL_PART_TYPES.has(part?.type) ? i : last), -1);
    const joinText = (parts: typeof content) => parts.filter(part => part?.type === 'text').map(part => part.text ?? '').join('');
    return joinText(content.slice(lastToolPart + 1));
}

/**
 * Whether the reader called a tool in any step. With dynamic filtering the fetch can run inside
 * code execution rather than as a direct web_fetch call, so any tool call or result counts; a run
 * with none answered from memory.
 */
export function readerCalledATool(steps: StepLike[] | undefined): boolean {
    return (steps ?? []).some(step =>
        (step.toolCalls?.length ?? 0) > 0
        || (step.content ?? []).some(part => part?.type === 'tool-result' || part?.type === 'tool-error'));
}

/**
 * Runs `attempt` once more when it returns `undefined` (the reader answered without fetching),
 * and returns the first result, or `undefined` when both attempts came back empty.
 */
export async function retryOnce<T>(attempt: () => Promise<T | undefined>): Promise<T | undefined> {
    return (await attempt()) ?? (await attempt());
}

/** The provider's error code on a failed web_fetch part, e.g. `url_not_accessible`. */
function fetchErrorCode(part: PartLike): string {
    const detail = (part.type === 'tool-error' ? part.error : part.output) as { errorCode?: string } | undefined;
    return detail?.errorCode ?? 'unknown error';
}

/**
 * Why the reader's fetches failed, when every web_fetch in the run failed; `undefined` when one
 * succeeded or the run has no web_fetch result to judge (the reader's text decides then). The SDK
 * reports a failed provider fetch as a `tool-error` part, or as a `tool-result` whose output is a
 * `web_fetch_tool_result_error`.
 */
export function webFetchFailure(steps: StepLike[] | undefined): string | undefined {
    const fetchParts = (steps ?? []).flatMap(step => step.content ?? [])
        .filter(part => part?.toolName === 'web_fetch' && (part.type === 'tool-result' || part.type === 'tool-error'));
    const failed = (part: PartLike) => part.type === 'tool-error'
        || (part.output as { type?: string } | undefined)?.type === 'web_fetch_tool_result_error';
    if (fetchParts.length === 0 || fetchParts.some(part => !failed(part))) { return undefined; }
    return Array.from(new Set(fetchParts.map(fetchErrorCode))).join(', ');
}

/**
 * The tool output for a reader run that fetched. A failed fetch (the system prompt makes the
 * reader start with "Fetch failed:") and an empty answer are failures; an answer cut off at the
 * output cap says so, so the caller does not take it as complete.
 */
export function formatReaderAnswer(url: string, text: string, finishReason: string): { output: string; failed: boolean } {
    const answer = text.trim();
    if (!answer) {
        return { output: `Web fetch failed: the reader returned no answer for ${url}.`, failed: true };
    }
    if (answer.startsWith(READER_FETCH_FAILED_PREFIX)) {
        return { output: `Web fetch failed for ${url}: ${answer.slice(READER_FETCH_FAILED_PREFIX.length).trim()}`, failed: true };
    }
    const truncated = finishReason === 'length' ? '\n\n(The answer was cut off at the reader\'s output limit.)' : '';
    return { output: `Source: ${url}\n\n${answer}${truncated}`, failed: false };
}
