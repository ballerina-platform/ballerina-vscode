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

// Import-light on purpose: unit tests exercise these without the LS/AI-SDK chain.
//
// Server-side compaction pauses right after the compaction block, and the turn restarts from a
// user message holding the summary. Nothing the model signs afterwards (its thinking) then refers
// to the compaction block, which the next requests would otherwise have to replay byte for byte.

import type { FilePart, ImagePart, ModelMessage, TextPart } from 'ai';
import { extractCompactionSummary } from '@wso2/copilot-utilities/context-management';

type UserContentPart = TextPart | ImagePart | FilePart;

/** How many times one turn may restart from a summary before it ends as an error. */
export const MAX_COMPACTION_RESTARTS = 3;

/** The raw stop reason of a response that paused after its compaction block. */
export function isCompactionPause(rawFinishReason: string | undefined): boolean {
    return rawFinishReason === 'compaction';
}

/**
 * The summary text of the latest compaction block in `messages`, without any `<analysis>`
 * section or `<summary>` wrapper. Undefined when there is no block or it is empty (the API sends
 * empty content when compaction failed).
 */
export function findCompactionSummary(messages: readonly ModelMessage[]): string | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
        const content = messages[i].content;
        if (!Array.isArray(content)) { continue; }
        for (let j = content.length - 1; j >= 0; j--) {
            const part = content[j] as { type: string; text?: string; providerOptions?: { anthropic?: { type?: unknown } } };
            if (part.type === 'text' && part.providerOptions?.anthropic?.type === 'compaction') {
                return cleanCompactionSummary(part.text ?? '') || undefined;
            }
        }
    }
    return undefined;
}

function cleanCompactionSummary(text: string): string {
    const withoutAnalysis = text.replace(/<analysis>[\s\S]*?<\/analysis>/g, '');
    return extractCompactionSummary(withoutAnalysis) ?? withoutAnalysis.trim();
}

/**
 * The user message a turn restarts from; it is the first message the model sees afterwards.
 * `turnContext` is the turn's user prompt rebuilt from the current workspace (the context blocks
 * the summary leaves out, and the request itself); the summary follows it.
 */
export function buildCompactionContinuation(summary: string, turnContext: readonly UserContentPart[]): ModelMessage {
    return {
        role: 'user',
        content: [
            ...turnContext,
            {
                type: 'text',
                text:
                    '<system-reminder>\nThis conversation ran out of context, so it was summarized. The context above ' +
                    'is current, and the <User Query> above is the request you are working on. The summary below ' +
                    'covers the conversation so far, including the work already done on that request.\n</system-reminder>\n\n' +
                    `<summary>\n${summary}\n</summary>\n\n` +
                    'Continue from where you left off, without asking the user any further questions and without ' +
                    'redoing finished work. The edits already made are saved in the workspace.',
            },
        ],
    };
}

/**
 * The generations whose messages make up the model's history: from the latest one that restarted
 * from its summary, or all of them when none did.
 */
export function generationsSinceLastRestart<T extends { restartedFromSummary?: boolean }>(generations: readonly T[]): readonly T[] {
    for (let i = generations.length - 1; i >= 0; i--) {
        if (generations[i].restartedFromSummary) {
            return generations.slice(i);
        }
    }
    return generations;
}
