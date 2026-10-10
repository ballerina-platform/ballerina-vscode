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
 * A turn that compaction paused restarts from its own summary message, and every later turn's
 * history starts there. The history half runs the real chat store over an in-memory "disk", so a
 * second store over the same data is what an extension-host restart leaves behind.
 */

const savedThreads = new Map<string, any>();
let savedMetadata: any;

jest.mock('@wso2/copilot-utilities/chat-persistence', () => ({
    CopilotPersistenceStore: class {
        saveThread(root: string, threadId: string, thread: unknown) {
            savedThreads.set(`${root}::${threadId}`, JSON.parse(JSON.stringify(thread)));
            return true;
        }
        loadThread(root: string, threadId: string) { return savedThreads.get(`${root}::${threadId}`); }
        listThreadIds(root: string) {
            return [...savedThreads.keys()]
                .filter((key) => key.startsWith(`${root}::`))
                .map((key) => key.slice(root.length + 2));
        }
        getWorkspaceMetadata() { return savedMetadata; }
        saveWorkspaceMetadata(_root: string, meta: unknown) { savedMetadata = meta; return true; }
        listCheckpoints() { return []; }
        loadCheckpoint() { return undefined; }
        deleteThread() { return true; }
        deleteCheckpoint() { return true; }
        saveCheckpoint() { return true; }
        loadCheckpoints() { return []; }
        deleteCheckpoints() { return true; }
    },
}));
jest.mock('../features/ai/state/ApprovalManager', () => ({
    approvalManager: { cancelAllPending: jest.fn() },
}));
jest.mock('../features/ai/utils/project/temp-project', () => ({
    cleanupTempProject: jest.fn(),
    getReviewBaselinePath: (p: string) => `${p}-review-baseline`,
}));

import {
    buildCompactionContinuation,
    dropBeforeLatestCompaction,
    findCompactionSummary,
    generationsSinceLastRestart,
    isCompactionPause,
} from '../features/ai/agent/compaction-restart';
import { COMPACT_SYSTEM_REMINDER_AUTO_TRIGGERED } from '../features/ai/agent/compaction-prompt';
import { ChatStateStorage, chatStateStorage } from '../views/ai-panel/chatStateStorage';

const compactionPart = (text: string) => ({ type: 'text', text, providerOptions: { anthropic: { type: 'compaction' } } });

describe('reading the compaction pause', () => {
    it('recognizes only the raw compaction stop reason', () => {
        expect(isCompactionPause('compaction')).toBe(true);
        expect(isCompactionPause('end_turn')).toBe(false);
        expect(isCompactionPause(undefined)).toBe(false);
    });

    it('takes the summary from the compaction block, not from ordinary text', () => {
        const messages: any[] = [
            { role: 'assistant', content: [{ type: 'text', text: 'not this' }, compactionPart('1. Primary Request and Intent:\n   Build it.\n')] },
        ];
        expect(findCompactionSummary(messages)).toBe('1. Primary Request and Intent:\n   Build it.');
    });

    it('drops the analysis and unwraps the summary tags', () => {
        expect(findCompactionSummary([{ role: 'assistant', content: [compactionPart('<analysis>draft</analysis>\n<summary>\nkept\n</summary>')] }] as any[])).toBe('kept');
        expect(findCompactionSummary([{ role: 'assistant', content: [compactionPart('<analysis>draft</analysis>\nkept')] }] as any[])).toBe('kept');
    });

    it('finds no summary when there is no block or the block is empty', () => {
        expect(findCompactionSummary([{ role: 'assistant', content: [{ type: 'text', text: 'hi' }] }])).toBeUndefined();
        expect(findCompactionSummary([{ role: 'assistant', content: [compactionPart('')] }] as any[])).toBeUndefined();
        expect(findCompactionSummary([{ role: 'assistant', content: 'plain string' }])).toBeUndefined();
    });

    it('restarts from a user message that holds the summary', () => {
        const context = [{ type: 'text' as const, text: '<User Query>\nBuild it\n</User Query>' }];
        const continuation = buildCompactionContinuation('Built half.', context);
        expect(continuation.role).toBe('user');
        const parts = continuation.content as { type: string; text: string }[];
        expect(parts[0]).toEqual(context[0]);
        expect(parts[1].text).toContain('<summary>\nBuilt half.\n</summary>');
    });
});

describe('trimming history before a kept compaction block', () => {
    const user = (text: string): any => ({ role: 'user', content: [{ type: 'text', text }] });
    const toolCall = { type: 'tool-call', toolCallId: 't1', toolName: 'file_read', input: {} };

    it('leaves a history without a block as it is', () => {
        const messages = [user('one'), { role: 'assistant', content: [{ type: 'text', text: 'two' }] } as any];
        expect(dropBeforeLatestCompaction(messages)).toBe(messages);
    });

    it('starts at the block, dropping earlier messages and the parts before it', () => {
        const block = compactionPart('Summary.');
        const after = { role: 'tool', content: [{ type: 'tool-result', toolCallId: 't1', toolName: 'file_read', output: { type: 'text', value: 'ok' } }] } as any;
        const messages = [user('a long request'), { role: 'assistant', content: [{ type: 'text', text: 'notes' }, block, toolCall] } as any, after];
        expect(dropBeforeLatestCompaction(messages)).toEqual([{ role: 'assistant', content: [block, toolCall] }, after]);
        expect(messages[1].content).toHaveLength(3);
    });

    it('keeps only what follows the latest of two blocks', () => {
        const messages = [
            { role: 'assistant', content: [compactionPart('First.')] } as any,
            user('more work'),
            { role: 'assistant', content: [compactionPart('Second.')] } as any,
            user('next'),
        ];
        expect(dropBeforeLatestCompaction(messages)).toEqual(messages.slice(2));
    });

    it('finds a block in history read back from disk', () => {
        const messages = JSON.parse(JSON.stringify([user('old'), { role: 'assistant', content: [compactionPart('Summary.')] }, user('new')]));
        expect(dropBeforeLatestCompaction(messages)).toEqual(messages.slice(1));
    });
});

describe('the compaction instructions', () => {
    it('tell the summarizer to leave out the re-injected codebase dump', () => {
        expect(COMPACT_SYSTEM_REMINDER_AUTO_TRIGGERED).toContain('The `<codebase_structure>` block is re-injected');
    });
});

describe('the history after a restart', () => {
    const ROOT = '/workspace';
    const THREAD = 'default';
    const user = (text: string) => ({ role: 'user', content: text });
    const assistant = (text: string) => ({ role: 'assistant', content: [{ type: 'text', text }] });

    function addTurn(id: string, modelMessages: any[], restartedFromSummary?: boolean) {
        chatStateStorage.addGeneration(ROOT, THREAD, id, { generationType: 'agent' } as never, id);
        chatStateStorage.updateGeneration(ROOT, THREAD, id, { modelMessages, restartedFromSummary });
    }

    beforeEach(() => {
        savedThreads.clear();
        savedMetadata = undefined;
        (chatStateStorage as any).storage.clear();
        chatStateStorage.initializeWorkspace(ROOT);
    });

    it('keeps every turn when none restarted', () => {
        expect(generationsSinceLastRestart<{ restartedFromSummary?: boolean }>([{}, { restartedFromSummary: false }])).toHaveLength(2);
    });

    it('starts at the latest restart, and still does after a reload', () => {
        addTurn('gen-1', [user('first'), assistant('one')]);
        addTurn('gen-2', [user('summary one'), assistant('two')], true);
        addTurn('gen-3', [user('third'), assistant('three')]);
        addTurn('gen-4', [user('summary two'), assistant('four')], true);
        addTurn('gen-5', [user('fifth'), assistant('five')]);

        const expected = [
            user('summary two'), assistant('four'),
            user('fifth'), assistant('five'),
        ];
        expect(chatStateStorage.getChatHistoryForLLM(ROOT, THREAD)).toEqual(expected);

        const restarted = new ChatStateStorage();
        restarted.initializeWorkspace(ROOT);
        expect(restarted.getChatHistoryForLLM(ROOT, THREAD)).toEqual(expected);
    });
});
