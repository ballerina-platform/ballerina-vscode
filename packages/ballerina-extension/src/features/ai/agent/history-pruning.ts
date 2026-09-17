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

import { ModelMessage } from 'ai';

/**
 * Strips per-turn context from replayed history — bulk that was correct for the turn that
 * produced it and is dead weight on every turn after.
 *
 * Import-free apart from the `ModelMessage` type so it stays unit-testable, like
 * `truncation-recovery.ts`. Messages, tool calls and tool results are never dropped; only the
 * text inside content parts is replaced.
 */

const CODEBASE_BLOCK_PREFIX = '<codebase_structure>';
const ANALYSIS_BLOCK_RE = /<analysis>[\s\S]*?<\/analysis>\s*/g;

/**
 * Replaces an earlier turn's codebase dump. Each user message carries the full contents of every
 * file in the workspace, so an N-turn thread re-sends N copies of the project — and the N-1 older
 * ones are stale snapshots that contradict the live one (#2317).
 */
const CODEBASE_BLOCK_PLACEHOLDER =
    '<codebase_structure superseded="true"/>\n' +
    'An earlier turn\'s project snapshot was omitted. The current state of every file is in the ' +
    '<codebase_structure> block of the latest user message.';

type TextPart = { type: 'text'; text: string };

function isTextPart(part: unknown): part is TextPart {
    return typeof (part as TextPart)?.text === 'string' && (part as TextPart)?.type === 'text';
}

/**
 * Rewrites a message's text parts, copying rather than mutating: these objects are
 * `chatStateStorage`'s persisted `modelMessages`, so editing in place would rewrite the user's
 * stored chat history as a side effect of building one request. Unchanged messages and parts are
 * returned by reference.
 */
function rewriteTextParts(
    message: ModelMessage,
    rewrite: (text: string) => string,
): ModelMessage {
    const content = message.content;

    if (typeof content === 'string') {
        const next = rewrite(content);
        return next === content ? message : { ...message, content: next } as ModelMessage;
    }

    if (!Array.isArray(content)) {
        return message;
    }

    let changed = false;
    const parts = content.map(part => {
        if (!isTextPart(part)) {
            return part;
        }
        const next = rewrite(part.text);
        if (next === part.text) {
            return part;
        }
        changed = true;
        return { ...part, text: next };
    });

    return changed ? { ...message, content: parts } as ModelMessage : message;
}

/**
 * Call with history only — the live turn's dump is the authoritative one and must survive.
 *
 * `<analysis>` is stripped here rather than only in `prepareStep`, whose guard is a per-turn local
 * set only during the turn compaction fired on; later turns replay the reasoning in full.
 */
export function pruneReplayedHistory(messages: ModelMessage[]): ModelMessage[] {
    return messages.map(message => {
        if (message.role === 'user') {
            return rewriteTextParts(message, text =>
                text.startsWith(CODEBASE_BLOCK_PREFIX) ? CODEBASE_BLOCK_PLACEHOLDER : text);
        }
        if (message.role === 'assistant') {
            return rewriteTextParts(message, text =>
                text.includes('<analysis>') ? text.replace(ANALYSIS_BLOCK_RE, '') : text);
        }
        return message;
    });
}

/** Rough character count of a history, for logging how much pruning saved. */
export function historyCharLength(messages: ModelMessage[]): number {
    let total = 0;
    for (const message of messages) {
        total += typeof message.content === 'string'
            ? message.content.length
            : JSON.stringify(message.content ?? '').length;
    }
    return total;
}
