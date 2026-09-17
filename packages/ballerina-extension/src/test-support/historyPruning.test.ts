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
import { historyCharLength, pruneReplayedHistory } from '../features/ai/agent/history-pruning';

const codebaseDump = (body: string) => `<codebase_structure>\n${body}\n</codebase_structure>`;

describe('pruneReplayedHistory', () => {
    it('replaces a superseded codebase dump but keeps the rest of the user turn', () => {
        const messages: ModelMessage[] = [{
            role: 'user',
            content: [
                { type: 'text', text: codebaseDump('<file path="main.bal">old contents</file>') },
                { type: 'text', text: '<User Query>\nAdd a health endpoint\n</User Query>' },
            ],
        }];

        const [pruned] = pruneReplayedHistory(messages);
        const parts = pruned.content as { text: string }[];

        expect(parts).toHaveLength(2);
        expect(parts[0].text).not.toContain('old contents');
        expect(parts[0].text).toContain('superseded');
        expect(parts[1].text).toBe('<User Query>\nAdd a health endpoint\n</User Query>');
    });

    it('does not mutate the caller\'s messages — they are the persisted transcript', () => {
        const original = codebaseDump('<file path="main.bal">old contents</file>');
        const messages: ModelMessage[] = [{ role: 'user', content: [{ type: 'text', text: original }] }];

        const pruned = pruneReplayedHistory(messages);

        expect((messages[0].content as { text: string }[])[0].text).toBe(original);
        expect(pruned[0]).not.toBe(messages[0]);
    });

    it('leaves every other message shape alone, by reference', () => {
        const messages: ModelMessage[] = [
            { role: 'user', content: [{ type: 'text', text: 'just a question' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'an answer with no analysis' }] },
            {
                role: 'assistant',
                content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'file_read', input: { path: 'main.bal' } }],
            },
            { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'file_read', output: { type: 'text', value: 'x' } }] },
        ];

        const pruned = pruneReplayedHistory(messages);

        expect(pruned).toHaveLength(messages.length);
        pruned.forEach((message, i) => expect(message).toBe(messages[i]));
    });

    it('strips compaction <analysis> reasoning while keeping the summary', () => {
        const messages: ModelMessage[] = [{
            role: 'assistant',
            content: [{
                type: 'text',
                text: '<analysis>thousands of reasoning tokens</analysis><summary>what was done</summary>',
            }],
        }];

        const [pruned] = pruneReplayedHistory(messages);
        const text = (pruned.content as { text: string }[])[0].text;

        expect(text).toBe('<summary>what was done</summary>');
    });

    it('handles string content as well as part arrays', () => {
        const messages: ModelMessage[] = [
            { role: 'user', content: codebaseDump('lots of files') },
            { role: 'assistant', content: '<analysis>reasoning</analysis>done' },
        ];

        const pruned = pruneReplayedHistory(messages);

        expect(pruned[0].content).not.toContain('lots of files');
        expect(pruned[1].content).toBe('done');
    });

    it('only matches a dump at the start of a part, not a mention inside prose', () => {
        const mention = 'The <codebase_structure> block lists every file.';
        const messages: ModelMessage[] = [{ role: 'user', content: [{ type: 'text', text: mention }] }];

        const [pruned] = pruneReplayedHistory(messages);

        expect((pruned.content as { text: string }[])[0].text).toBe(mention);
    });

    it('shrinks a multi-turn thread by the bulk of its repeated dumps', () => {
        const dump = codebaseDump('x'.repeat(50_000));
        const messages: ModelMessage[] = Array.from({ length: 5 }, () => ({
            role: 'user' as const,
            content: [
                { type: 'text' as const, text: dump },
                { type: 'text' as const, text: '<User Query>\nnext step\n</User Query>' },
            ],
        }));

        const before = historyCharLength(messages);
        const after = historyCharLength(pruneReplayedHistory(messages));

        expect(before).toBeGreaterThan(250_000);
        expect(after).toBeLessThan(5_000);
    });
});
