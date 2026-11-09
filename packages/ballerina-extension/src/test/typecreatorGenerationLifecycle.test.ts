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
 * `/typecreator` writes to the workspace like an agent turn but never emits a review component,
 * so it has no revert affordance of its own. That makes its generation the one most likely to be
 * left dangling in `generating` forever — which would then block the next agent turn's revert,
 * because "at most one open generation" is what the panel's gate rests on. These tests pin that
 * it opens and closes its own generation, and that starting one accepts whatever was still open.
 */

jest.mock('@wso2/copilot-utilities/chat-persistence', () => ({
    CopilotPersistenceStore: class {
        saveThread() { return true; }
        getWorkspaceMetadata() { return undefined; }
        saveWorkspaceMetadata() { return true; }
        listThreadIds() { return []; }
        loadThread() { return undefined; }
        deleteThread() { return true; }
        saveCheckpoint() { return true; }
        loadCheckpoints() { return []; }
        deleteCheckpoints() { return true; }
    },
}));

// Cut the import chains that reach the webview layer and an ESM-only LS dependency.
jest.mock('@wso2/ballerina-core', () => ({ Command: { TypeCreator: 'TypeCreator' } }));
jest.mock('../features/ai/state/ApprovalManager', () => ({
    approvalManager: { cancelAllPending: jest.fn() },
}));
jest.mock('../features/ai/state/AgentStatusManager', () => ({
    agentStatusManager: { start: jest.fn(), stop: jest.fn(), update: jest.fn() },
}));
jest.mock('../features/ai/utils/ai-utils', () => ({ buildChatError: jest.fn() }));
// Reaches the Language Server client through stateMachine; the finalize itself is covered
// in finalizeLastGeneration.test.ts.
jest.mock('../features/ai/utils/generation-response', () => ({ finalizeRevertibleGeneration: jest.fn() }));
jest.mock('../features/ai/utils/run-event-store', () => ({ runEventStore: { beginRun: jest.fn(), endRun: jest.fn() } }));
jest.mock('../features/ai/utils/project/temp-project', () => ({
    getTempProject: jest.fn(),
    cleanupTempProject: jest.fn(),
    getReviewBaselinePath: (p: string) => `${p}-review-baseline`,
}));
jest.mock('../features/ai/migration/debug-logger', () => ({ MigrationDebugLogger: { log: jest.fn() } }));
jest.mock('../rpc-managers/diagram-validity', () => ({ clearAiTouchedFiles: jest.fn() }));

const generateContextTypesCore = jest.fn();
jest.mock('../features/ai/data-mapper/orchestrator', () => ({ generateContextTypesCore }));

import { ContextTypesExecutor } from '../features/ai/executors/datamapper/ContextTypesExecutor';
import { chatStateStorage } from '../views/ai-panel/chatStateStorage';

const ROOT = '/workspace';

function buildExecutor(threadId: string, generationId: string) {
    return new ContextTypesExecutor({
        executionContext: { tempProjectPath: ROOT } as never,
        eventHandler: jest.fn(),
        generationId,
        abortController: new AbortController(),
        params: {} as never,
        chatStorage: { projectRootPath: ROOT, threadId, enabled: true },
        lifecycle: { cleanupStrategy: 'immediate' },
    });
}

function seedDoneGeneration(threadId: string, generationId: string) {
    chatStateStorage.getOrCreateThread(ROOT, threadId);
    chatStateStorage.addGeneration(ROOT, threadId, 'do a thing', { generationType: 'agent' } as never, generationId);
    chatStateStorage.updateReviewState(ROOT, threadId, generationId, {
        status: 'done',
        modifiedFiles: ['main.bal'],
        reviewView: { semanticDiffs: [], loadDesignDiagrams: false, isWorkspace: false },
    });
}

function statusOf(threadId: string, generationId: string) {
    return chatStateStorage.getGeneration(ROOT, threadId, generationId)?.reviewState.status;
}

describe('typecreator generation lifecycle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        generateContextTypesCore.mockResolvedValue({ modifiedFiles: ['types.bal'], sourceFiles: [] });
    });

    it('settles its own generation to accepted', () => {
        return buildExecutor('thread-tc-ok', 'gen-tc-ok').execute().then(() => {
            expect(statusOf('thread-tc-ok', 'gen-tc-ok')).toBe('accepted');
            // Accepted, not done: there is no review component, so nothing could revert it.
            expect(chatStateStorage.getDoneGeneration(ROOT, 'thread-tc-ok')).toBeUndefined();
        });
    });

    it('accepts a still-revertible agent turn before starting', async () => {
        seedDoneGeneration('thread-tc-prev', 'gen-agent');

        await buildExecutor('thread-tc-prev', 'gen-tc').execute();

        expect(statusOf('thread-tc-prev', 'gen-agent')).toBe('accepted');
        expect(statusOf('thread-tc-prev', 'gen-tc')).toBe('accepted');
    });

    it('settles to error when generation fails, leaving nothing open', async () => {
        generateContextTypesCore.mockRejectedValue(new Error('boom'));

        const result = await buildExecutor('thread-tc-err', 'gen-tc-err').execute();

        expect(result.error).toBeDefined();
        expect(statusOf('thread-tc-err', 'gen-tc-err')).toBe('error');
        expect(chatStateStorage.getDoneGeneration(ROOT, 'thread-tc-err')).toBeUndefined();
    });

    it('EDGE: leaves another thread revertible', async () => {
        seedDoneGeneration('thread-other', 'gen-other');

        await buildExecutor('thread-tc-scoped', 'gen-tc-scoped').execute();

        expect(chatStateStorage.getDoneGeneration(ROOT, 'thread-other')?.id).toBe('gen-other');
    });
});
