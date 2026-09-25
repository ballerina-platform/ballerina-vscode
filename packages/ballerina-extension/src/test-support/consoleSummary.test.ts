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
 * @jest-environment node
 *
 * The console summary's pure helpers. The summary is shown verbatim in the
 * Devant console and stored in a size-capped cookie, so what reaches it must be
 * plain, bounded, and built only from what the turn recorded.
 */

import {
    MAX_SUMMARY_CHARS,
    buildConsoleSummaryMessages,
    buildFallbackSummary,
    extractLastTaskList,
    sanitizeSummary,
} from '../features/ai/agent/console-summary/prompt';

const TOOL = 'TaskWrite';

function taskCall(tasks: { description: string; status: string }[], key: 'input' | 'args' = 'input') {
    return { type: 'tool-call', toolCallId: 'x', toolName: TOOL, [key]: { tasks } };
}

describe('extractLastTaskList', () => {
    it('returns the list from the last task-writer call', () => {
        const messages = [
            { role: 'assistant', content: [taskCall([{ description: 'A', status: 'pending' }])] },
            { role: 'tool', content: [] },
            { role: 'assistant', content: [{ type: 'text', text: 'working' }, taskCall([
                { description: 'A', status: 'completed' },
                { description: 'B', status: 'in_progress' },
            ])] },
        ];
        expect(extractLastTaskList(messages, TOOL)).toEqual([
            { description: 'A', status: 'completed' },
            { description: 'B', status: 'in_progress' },
        ]);
    });

    it('accepts the older `args` field', () => {
        const messages = [{ role: 'assistant', content: [taskCall([{ description: 'A', status: 'completed' }], 'args')] }];
        expect(extractLastTaskList(messages, TOOL)).toEqual([{ description: 'A', status: 'completed' }]);
    });

    it('ignores other tools and malformed input', () => {
        const messages = [
            { role: 'assistant', content: [{ type: 'tool-call', toolName: 'file_write', input: { tasks: [{ description: 'no' }] } }] },
            { role: 'assistant', content: [{ type: 'tool-call', toolName: TOOL, input: { tasks: 'nope' } }] },
            { role: 'assistant', content: 'plain string content' },
        ];
        expect(extractLastTaskList(messages, TOOL)).toEqual([]);
    });
});

describe('sanitizeSummary', () => {
    it('strips markdown and collapses whitespace', () => {
        expect(sanitizeSummary('**Built** the `order` service.\n\n# Done')).toBe('Built the order service. Done');
    });

    it('drops fenced code entirely', () => {
        expect(sanitizeSummary('Added a service.\n```ballerina\nservice / on ep {}\n```')).toBe('Added a service.');
    });

    it('caps length on a word boundary with an ellipsis', () => {
        const long = 'word '.repeat(MAX_SUMMARY_CHARS);
        const result = sanitizeSummary(long);
        expect(result.length).toBeLessThanOrEqual(MAX_SUMMARY_CHARS);
        expect(result.endsWith('word…')).toBe(true);
    });

    it('treats undefined as empty', () => {
        expect(sanitizeSummary(undefined)).toBe('');
    });
});

describe('buildFallbackSummary', () => {
    it('lists completed tasks only', () => {
        expect(buildFallbackSummary([
            { description: 'Create the service', status: 'completed' },
            { description: 'Add tests', status: 'pending' },
            { description: 'Wire Salesforce', status: 'completed' },
        ], ['main.bal'])).toBe('Completed: Create the service; Wire Salesforce.');
    });

    it('falls back to a file count without a task list', () => {
        expect(buildFallbackSummary([], ['a.bal'])).toBe('Updated 1 file.');
        expect(buildFallbackSummary([], ['a.bal', 'b.bal'])).toBe('Updated 2 files.');
    });

    it('is empty when nothing was recorded', () => {
        expect(buildFallbackSummary([], [])).toBe('');
    });
});

describe('buildConsoleSummaryMessages', () => {
    const base = {
        userQuery: 'Sync Salesforce leads to HubSpot',
        tasks: [],
        modifiedFiles: ['main.bal'],
        assistantText: 'Done.',
        errorCount: 0,
        earlierSummaries: [],
    };

    it('includes earlier notes only when there are some', () => {
        const [, without] = buildConsoleSummaryMessages(base);
        expect(String(without.content)).not.toContain('<earlier_notes>');

        const [, withNotes] = buildConsoleSummaryMessages({ ...base, earlierSummaries: ['Built the sync service.'] });
        expect(String(withNotes.content)).toContain('<earlier_notes>\n- Built the sync service.\n</earlier_notes>');
    });

    it('keeps the tail of a long response', () => {
        const assistantText = 'START' + 'x'.repeat(5000) + 'END';
        const [, user] = buildConsoleSummaryMessages({ ...base, assistantText });
        expect(String(user.content)).toContain('END');
        expect(String(user.content)).not.toContain('START');
    });

    it('caps the listed files', () => {
        const modifiedFiles = Array.from({ length: 35 }, (_, i) => `f${i}.bal`);
        const [, user] = buildConsoleSummaryMessages({ ...base, modifiedFiles });
        expect(String(user.content)).toContain('(and 5 more)');
        expect(String(user.content)).not.toContain('f34.bal');
    });
});
