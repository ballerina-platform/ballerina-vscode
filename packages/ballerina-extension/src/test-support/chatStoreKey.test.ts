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
 * `chatStateStorage` is keyed by a path, and a caller may scope `executionContext` to a
 * sub-package while its generation lives under the workspace root — the migration wizard passes
 * the package path with `workspacePath: undefined`. Deriving the store key from `executionContext`
 * there addresses a store that has no such generation, so every write returns false and does
 * nothing. `modelMessages` then stays empty, the next turn replays the far larger `uiResponse`
 * in its place, and the prompt runs past the model's token limit.
 *
 * These tests pin the rule that keeps the two in the same store, and the write-through it buys,
 * against real `ChatStateStorage` rather than a stand-in.
 */

// An in-memory stand-in for the on-disk store — the storage layer is exercised for real.
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

import { resolveChatStoreKey } from '../features/ai/agent/chatStoreKey';
import { ChatStateStorage } from '../views/ai-panel/chatStateStorage';

/** Where the generation is added — the key `addGeneration`/`getChatHistoryForLLM` use. */
const WORKSPACE = '/workspace';
/** What a package-scoped `executionContext` carries instead. */
const PACKAGE = '/workspace/pkgA';
const THREAD = 'default';
const GEN = 'gen-1';

const MODEL_MESSAGES = [
    { role: 'user', content: 'enhance the package' },
    { role: 'assistant', content: 'done' },
];

describe('resolveChatStoreKey precedence', () => {
    it.each([
        {
            case: 'package-scoped execution: chatStorage wins over the package path',
            chatStorage: { projectRootPath: WORKSPACE },
            executionContext: { workspacePath: undefined, projectPath: PACKAGE },
            expected: WORKSPACE,
        },
        {
            case: 'chatStorage wins even when a workspace path is also present',
            chatStorage: { projectRootPath: WORKSPACE },
            executionContext: { workspacePath: '/other', projectPath: PACKAGE },
            expected: WORKSPACE,
        },
        {
            case: 'no chat storage: falls back to the workspace path',
            chatStorage: undefined,
            executionContext: { workspacePath: WORKSPACE, projectPath: PACKAGE },
            expected: WORKSPACE,
        },
        {
            case: 'no chat storage and no workspace: falls back to the project path',
            chatStorage: undefined,
            executionContext: { workspacePath: undefined, projectPath: PACKAGE },
            expected: PACKAGE,
        },
        {
            case: 'nothing to key on',
            chatStorage: undefined,
            executionContext: { workspacePath: undefined, projectPath: undefined },
            expected: '',
        },
    ])('$case', ({ chatStorage, executionContext, expected }) => {
        expect(resolveChatStoreKey(chatStorage, executionContext)).toBe(expected);
    });
});

describe('a package-scoped execution writing back to chat storage', () => {
    beforeEach(() => {
        savedThreads.clear();
        savedMetadata = undefined;
    });

    it('lands modelMessages in the store that holds the generation', () => {
        const store = new ChatStateStorage();
        store.addGeneration(WORKSPACE, THREAD, 'enhance the package', { generationType: 'agent' } as never, GEN);

        const key = resolveChatStoreKey({ projectRootPath: WORKSPACE }, { workspacePath: undefined, projectPath: PACKAGE });

        expect(store.updateGeneration(key, THREAD, GEN, { modelMessages: MODEL_MESSAGES as never })).toBe(true);
        expect(store.getGeneration(WORKSPACE, THREAD, GEN)?.modelMessages).toEqual(MODEL_MESSAGES);
    });

    it('REGRESSION: keying off the package path finds no generation and writes nothing', () => {
        const store = new ChatStateStorage();
        store.addGeneration(WORKSPACE, THREAD, 'enhance the package', { generationType: 'agent' } as never, GEN);

        expect(store.updateGeneration(PACKAGE, THREAD, GEN, { modelMessages: MODEL_MESSAGES as never })).toBe(false);
        expect(store.getGenerations(PACKAGE, THREAD)).toEqual([]);
        expect(store.getGeneration(WORKSPACE, THREAD, GEN)?.modelMessages).toEqual([]);
    });
});
