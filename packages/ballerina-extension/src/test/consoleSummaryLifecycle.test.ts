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
 * When a console summary publishes and when it is taken back off the console.
 * Runs the real chat store over an in-memory "disk", so a second store over the
 * same data is what an extension-host restart (a page reload in the cloud editor)
 * leaves behind. The editor's commands and the model call are mocked.
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
jest.mock('../features/ai/agent/tools/task-writer', () => ({ TASK_WRITE_TOOL_NAME: 'TaskWrite' }));
jest.mock('../features/ai/utils/ai-client', () => ({
    ANTHROPIC_HAIKU: 'haiku',
    getAnthropicClient: jest.fn(async () => ({})),
}));
const generateObject = jest.fn();
jest.mock('ai', () => ({ generateObject: (...args: unknown[]) => generateObject(...args) }));
const executeCommand = jest.fn();
jest.mock('vscode', () => ({ commands: { executeCommand: (...args: unknown[]) => executeCommand(...args) } }), { virtual: true });

import { ChatStateStorage, chatStateStorage } from '../views/ai-panel/chatStateStorage';
import {
    markConsoleOriginThread,
    removeConsoleSummary,
    startConsoleSummary,
} from '../features/ai/agent/console-summary';
import { getAnthropicClient } from '../features/ai/utils/ai-client';

const ROOT = '/workspace';
const THREAD = 'default';
const STEPS = 'Implementation plan for: Lead sync\n\n1. Poll Salesforce';

function turn(messageId: string, threadId = THREAD) {
    return {
        messageId,
        projectRootPath: ROOT,
        threadId,
        assistantMessages: [{ role: 'assistant', content: 'Built the lead sync.' }],
        userQuery: 'Sync leads',
        modifiedFiles: ['main.bal'],
        errorCount: 0,
        abortSignal: new AbortController().signal,
    };
}

function addGeneration(id: string, threadId = THREAD) {
    chatStateStorage.addGeneration(ROOT, threadId, 'Sync leads', { generationType: 'agent' } as never, id);
}

function generation(id: string, threadId = THREAD) {
    return chatStateStorage.getWorkspaceState(ROOT)?.threads.get(threadId)?.generations.find((g) => g.id === id);
}

/** Commands the summary sent to the editor, in order, without the key check. */
function editorCalls(): [string, unknown][] {
    return executeCommand.mock.calls.filter(([id]) => id !== 'devantEditor.hasAgentSummaryKey') as [string, unknown][];
}

async function settle() {
    for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

beforeAll(() => {
    process.env.CLOUD_ENV = 'prod';
    delete process.env.AI_TEST_ENV;
    process.env.INITIAL_SCAFFOLD_PROMPT = 'Sync leads';
    process.env.INITIAL_SCAFFOLD_STEPS = STEPS;
});

afterAll(() => {
    delete process.env.CLOUD_ENV;
    delete process.env.INITIAL_SCAFFOLD_PROMPT;
    delete process.env.INITIAL_SCAFFOLD_STEPS;
});

beforeEach(() => {
    savedThreads.clear();
    savedMetadata = undefined;
    (chatStateStorage as any).storage.clear();
    executeCommand.mockReset();
    executeCommand.mockImplementation(async (id: string) => id === 'devantEditor.hasAgentSummaryKey' || id === 'devantEditor.appendAgentSummary');
    (getAnthropicClient as jest.Mock).mockReset().mockImplementation(async () => ({}));
    generateObject.mockReset();
    generateObject.mockResolvedValue({ object: { summary: 'Built a service that syncs leads.' } });
    chatStateStorage.initializeWorkspace(ROOT);
});

describe('which thread publishes', () => {
    it('marks the thread only for the flagged scaffold turn', () => {
        markConsoleOriginThread(ROOT, THREAD, undefined);
        markConsoleOriginThread(ROOT, THREAD, false);
        expect(chatStateStorage.getActiveThread(ROOT)?.consoleOrigin).toBeUndefined();

        markConsoleOriginThread(ROOT, THREAD, true);
        expect(chatStateStorage.getActiveThread(ROOT)?.consoleOrigin).toBe(true);
    });

    it('does not recreate a deleted thread when marking', () => {
        markConsoleOriginThread(ROOT, 'thread-gone', true);
        expect(chatStateStorage.getWorkspaceState(ROOT)?.threads.has('thread-gone')).toBe(false);
    });

    it('does not publish from a thread the scaffold did not start', async () => {
        addGeneration('gen-1');
        expect(startConsoleSummary(turn('gen-1'))).toBe(false);
        await settle();
        expect(executeCommand).not.toHaveBeenCalled();
        expect(generateObject).not.toHaveBeenCalled();
    });

    it('publishes from the scaffold thread and records what it published', async () => {
        markConsoleOriginThread(ROOT, THREAD, true);
        addGeneration('gen-1');
        expect(startConsoleSummary(turn('gen-1'))).toBe(true);
        await settle();
        expect(editorCalls()).toEqual([
            ['devantEditor.appendAgentSummary', { summary: 'Built a service that syncs leads.', generationId: 'gen-1' }],
        ]);
        expect(generation('gen-1')?.consoleSummary).toBe('Built a service that syncs leads.');
    });
});

describe('across a reload', () => {
    it('keeps the thread mark and the published summary', async () => {
        markConsoleOriginThread(ROOT, THREAD, true);
        addGeneration('gen-1');
        startConsoleSummary(turn('gen-1'));
        await settle();

        const restarted = new ChatStateStorage();
        const thread = restarted.initializeWorkspace(ROOT).threads.get(THREAD);
        expect(thread?.consoleOrigin).toBe(true);
        expect(thread?.generations.find((g) => g.id === 'gen-1')?.consoleSummary).toBe('Built a service that syncs leads.');
    });
});

describe('when the model gives nothing usable', () => {
    beforeEach(() => markConsoleOriginThread(ROOT, THREAD, true));

    it('publishes the fallback when the model call fails', async () => {
        addGeneration('gen-1');
        generateObject.mockRejectedValue(new Error('model unavailable'));
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        startConsoleSummary(turn('gen-1'));
        await settle();
        warn.mockRestore();
        expect(editorCalls()).toEqual([
            ['devantEditor.appendAgentSummary', { summary: 'Updated 1 file.', generationId: 'gen-1' }],
        ]);
        expect(generation('gen-1')?.consoleSummary).toBe('Updated 1 file.');
    });

    it('publishes the fallback when the reply is empty once sanitized', async () => {
        addGeneration('gen-1');
        generateObject.mockResolvedValue({ object: { summary: '```\nservice / on ep {}\n```' } });
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        startConsoleSummary(turn('gen-1'));
        await settle();
        warn.mockRestore();
        expect(editorCalls()).toEqual([
            ['devantEditor.appendAgentSummary', { summary: 'Updated 1 file.', generationId: 'gen-1' }],
        ]);
    });

    it('publishes nothing when the user stops the turn during generation', async () => {
        addGeneration('gen-1');
        const stop = new AbortController();
        generateObject.mockImplementation(async () => {
            stop.abort();
            throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
        });
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        startConsoleSummary({ ...turn('gen-1'), abortSignal: stop.signal });
        await settle();
        warn.mockRestore();
        expect(editorCalls()).toEqual([]);
    });
});

describe('when the model client never resolves', () => {
    beforeEach(() => {
        markConsoleOriginThread(ROOT, THREAD, true);
        (getAnthropicClient as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
    });

    afterEach(() => jest.useRealTimers());

    it('publishes the fallback once the timeout passes', async () => {
        jest.useFakeTimers({ doNotFake: ['setImmediate'] });
        addGeneration('gen-1');
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        startConsoleSummary(turn('gen-1'));
        await settle();
        expect(editorCalls()).toEqual([]);
        jest.advanceTimersByTime(15_000);
        await settle();
        warn.mockRestore();
        expect(generateObject).not.toHaveBeenCalled();
        expect(editorCalls()).toEqual([
            ['devantEditor.appendAgentSummary', { summary: 'Updated 1 file.', generationId: 'gen-1' }],
        ]);
    });

    it('publishes nothing when the user stops the turn', async () => {
        addGeneration('gen-1');
        const stop = new AbortController();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        startConsoleSummary({ ...turn('gen-1'), abortSignal: stop.signal });
        await settle();
        stop.abort();
        await settle();
        // The wait ended at the stop rather than hanging on the client.
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Summary generation failed for gen-1'), expect.anything());
        warn.mockRestore();
        expect(generateObject).not.toHaveBeenCalled();
        expect(editorCalls()).toEqual([]);
    });
});

describe('undoing a turn while its summary is in flight', () => {
    beforeEach(() => markConsoleOriginThread(ROOT, THREAD, true));

    it('does not publish a turn reverted during generation', async () => {
        addGeneration('gen-1');
        generateObject.mockImplementation(async () => {
            generation('gen-1')!.reviewState.status = 'reverted';
            return { object: { summary: 'Built it.' } };
        });
        startConsoleSummary(turn('gen-1'));
        await settle();
        expect(editorCalls()).toEqual([]);
        expect(generation('gen-1')?.consoleSummary).toBeUndefined();
    });

    it('does not publish a turn a restore removed during generation', async () => {
        addGeneration('gen-1');
        generateObject.mockImplementation(async () => {
            chatStateStorage.getWorkspaceState(ROOT)!.threads.get(THREAD)!.generations = [];
            return { object: { summary: 'Built it.' } };
        });
        startConsoleSummary(turn('gen-1'));
        await settle();
        expect(editorCalls()).toEqual([]);
    });

    it('removes the entry when the turn is reverted during the append', async () => {
        addGeneration('gen-1');
        executeCommand.mockImplementation(async (id: string) => {
            if (id === 'devantEditor.appendAgentSummary') {
                generation('gen-1')!.reviewState.status = 'reverted';
            }
            return true;
        });
        startConsoleSummary(turn('gen-1'));
        await settle();
        expect(editorCalls().map(([id]) => id)).toEqual(['devantEditor.appendAgentSummary', 'devantEditor.removeAgentSummary']);
        expect(generation('gen-1')?.consoleSummary).toBeUndefined();
    });
});

describe('removing a published summary', () => {
    it('sends the remove even when the editor no longer has a key', async () => {
        executeCommand.mockImplementation(async (id: string) => id !== 'devantEditor.hasAgentSummaryKey');
        removeConsoleSummary('gen-1');
        await settle();
        expect(executeCommand.mock.calls).toEqual([['devantEditor.removeAgentSummary', { generationId: 'gen-1' }]]);
    });

    it('swallows an editor without the command', async () => {
        executeCommand.mockRejectedValue(new Error("command 'devantEditor.removeAgentSummary' not found"));
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        removeConsoleSummary('gen-1');
        await settle();
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('lists every turn a restore drops, from the checkpoint onward', () => {
        addGeneration('gen-1');
        addGeneration('gen-2');
        addGeneration('gen-3');
        generation('gen-2')!.checkpoint = { id: 'cp-2' } as never;
        const dropped = chatStateStorage.getGenerationsFromCheckpoint(ROOT, THREAD, 'cp-2').map((g) => g.id);
        expect(dropped).toEqual(['gen-2', 'gen-3']);
        expect(chatStateStorage.getGenerationsFromCheckpoint(ROOT, THREAD, 'cp-missing')).toEqual([]);
    });
});
