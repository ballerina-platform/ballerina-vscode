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

import type { AssistantModelMessage, ModelMessage } from 'ai';

/**
 * Repair passes that keep a model-message history provider-valid before it is sent to Anthropic.
 * `sanitizeMessages` is the single entry point; individual repairs compose under it, so new failure
 * modes can be handled by adding a pass rather than touching call sites.
 *
 * Passes edit the history in place. The malformed input is corrupt stored state — the parts here
 * are the chat store's own objects, held by reference on both the replay and the in-turn path — so
 * repairing them heals the thread at the source: every alias is fixed at once, and the next thread
 * save persists the clean value, rather than re-coercing the same corruption on every send.
 */

type AssistantPart = Exclude<AssistantModelMessage['content'], string>[number];

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * When a streamed tool call's JSON is invalid — most often truncated at the output-token cap on a
 * large file write — the AI SDK keeps the raw text as a string on the `tool-call` part. When it
 * parses but fails the tool's schema, the SDK keeps the parsed value instead, so an array, `null`
 * or a number can arrive here too. Anthropic requires `tool_use.input` to be an object and rejects
 * replay with `tool_use.input: Input should be an object`, which bricks the thread on every later
 * request. The paired tool-result already carries the parse error, so the model still learns the
 * call failed; coercing the input just makes the history sendable again.
 */
function coerceToObject(raw: unknown): Record<string, unknown> {
    if (typeof raw === 'string') {
        try {
            const parsed: unknown = JSON.parse(raw);
            if (isPlainObject(parsed)) {
                return parsed;
            }
        } catch {
            // unparseable
        }
    }
    return {};
}

/** Coerce every non-object tool-call input to an object, in place. Returns how many were repaired. */
export function repairToolCallInputs(messages: ModelMessage[] | null | undefined): number {
    let repaired = 0;
    for (const message of messages ?? []) {
        if (message.role !== 'assistant' || typeof message.content === 'string') {
            continue;
        }
        for (const part of message.content as AssistantPart[]) {
            if (part.type === 'tool-call' && !isPlainObject(part.input)) {
                part.input = coerceToObject(part.input);
                repaired++;
            }
        }
    }
    if (repaired > 0) {
        console.warn(`[messageSanitization] Coerced ${repaired} malformed tool-call input(s) to objects.`);
    }
    return repaired;
}

/**
 * Run every repair pass over a message history in place, so it stays provider-valid. Call before
 * sending history to the provider (prepareStep, history load). Returns how many tool-call inputs
 * had to be repaired — each one a call whose arguments were lost — so callers can surface or count
 * it. Add new passes here as needed.
 */
export function sanitizeMessages(messages: ModelMessage[] | null | undefined): number {
    return repairToolCallInputs(messages);
}
