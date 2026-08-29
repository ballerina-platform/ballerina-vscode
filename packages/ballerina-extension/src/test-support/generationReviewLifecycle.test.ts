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

// Persistence is mocked so these never reach the real on-disk chat store.
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

// Cuts an import chain that reaches ballerina-core's index and an ESM-only LS dependency.
jest.mock('../features/ai/state/ApprovalManager', () => ({
    approvalManager: { cancelAllPending: jest.fn() },
}));

jest.mock('../features/ai/utils/project/temp-project', () => ({
    cleanupTempProject: jest.fn(),
    getReviewBaselinePath: (p: string) => `${p}-review-baseline`,
}));

import { ChatStateStorage } from '../views/ai-panel/chatStateStorage';

const ROOT = '/workspace';

function seedDoneGeneration(store: ChatStateStorage, threadId: string, prompt = 'do a thing') {
    const generationId = `gen-${threadId}`;
    store.getOrCreateThread(ROOT, threadId);
    store.addGeneration(ROOT, threadId, prompt, { generationType: 'agent' } as never, generationId);
    store.updateReviewState(ROOT, threadId, generationId, {
        status: 'done',
        tempProjectPath: ROOT,
        modifiedFiles: ['main.bal'],
        affectedPackagePaths: [ROOT],
        reviewView: { semanticDiffs: [{ any: 'diff' }], loadDesignDiagrams: true, isWorkspace: false },
    });
    return generationId;
}

describe('generation review lifecycle', () => {
    let store: ChatStateStorage;

    beforeEach(() => {
        store = new ChatStateStorage();
    });

    it('drops reviewView when the generation is implicitly accepted', () => {
        const generationId = seedDoneGeneration(store, 'thread-a');
        expect(store.getDoneGeneration(ROOT, 'thread-a')?.reviewState.reviewView).toBeDefined();

        const finalized = store.finalizeLastGenerationIfDone(ROOT, 'thread-a');

        expect(finalized?.id).toBe(generationId);
        expect(finalized?.reviewState.status).toBe('accepted');
        expect(finalized?.reviewState.reviewView).toBeUndefined();
    });

    it('drops reviewView when the generation is reverted', () => {
        seedDoneGeneration(store, 'thread-a');

        const reverted = store.revertLastGeneration(ROOT, 'thread-a');

        expect(reverted?.reviewState.status).toBe('reverted');
        expect(reverted?.reviewState.reviewView).toBeUndefined();
    });

    it('EDGE: is a no-op when no generation is done', () => {
        store.getOrCreateThread(ROOT, 'empty-thread');

        expect(store.finalizeLastGenerationIfDone(ROOT, 'empty-thread')).toBeUndefined();
        expect(store.revertLastGeneration(ROOT, 'empty-thread')).toBeUndefined();
    });

    it('EDGE: finalizing twice does not re-report the same generation', () => {
        seedDoneGeneration(store, 'thread-a');

        expect(store.finalizeLastGenerationIfDone(ROOT, 'thread-a')).toBeDefined();
        // Second call must find nothing — otherwise the next-turn path would double-report.
        expect(store.finalizeLastGenerationIfDone(ROOT, 'thread-a')).toBeUndefined();
    });

    it('EDGE: a reverted generation cannot then be accepted', () => {
        seedDoneGeneration(store, 'thread-a');

        expect(store.revertLastGeneration(ROOT, 'thread-a')).toBeDefined();
        expect(store.finalizeLastGenerationIfDone(ROOT, 'thread-a')).toBeUndefined();
    });

    it('EDGE: finalizing one thread leaves another thread revertible', () => {
        seedDoneGeneration(store, 'thread-a');
        seedDoneGeneration(store, 'thread-b');

        store.finalizeLastGenerationIfDone(ROOT, 'thread-a');

        expect(store.getDoneGeneration(ROOT, 'thread-a')).toBeUndefined();
        const other = store.getDoneGeneration(ROOT, 'thread-b');
        expect(other?.reviewState.status).toBe('done');
        expect(other?.reviewState.reviewView).toBeDefined();
    });

    it('EDGE: at most one generation is done per thread', () => {
        seedDoneGeneration(store, 'thread-a');
        // A second turn in the same thread: the first must stop being revertible.
        store.finalizeLastGenerationIfDone(ROOT, 'thread-a');
        const secondId = 'gen-second';
        store.addGeneration(ROOT, 'thread-a', 'another thing', { generationType: 'agent' } as never, secondId);
        store.updateReviewState(ROOT, 'thread-a', secondId, {
            status: 'done',
            modifiedFiles: [],
            reviewView: { semanticDiffs: [], loadDesignDiagrams: false, isWorkspace: false },
        });

        expect(store.getDoneGeneration(ROOT, 'thread-a')?.id).toBe(secondId);
    });

    it('accepts a still-done generation when the next one is added', () => {
        // Callers must not have to remember to finalize first — every entry point that starts
        // a turn goes through addGeneration, so putting it there is what makes the invariant
        // hold by construction rather than by convention.
        const firstId = seedDoneGeneration(store, 'thread-a');

        store.addGeneration(ROOT, 'thread-a', 'another thing', { generationType: 'agent' } as never, 'gen-second');

        expect(store.getGeneration(ROOT, 'thread-a', firstId)?.reviewState.status).toBe('accepted');
        expect(store.getDoneGeneration(ROOT, 'thread-a')).toBeUndefined();
    });
});

describe('generation status observers', () => {
    let store: ChatStateStorage;
    let observed: Array<[string, string]>;

    beforeEach(() => {
        store = new ChatStateStorage();
        observed = [];
        store.onGenerationStatusChanged((generationId, status) => observed.push([generationId, status]));
    });

    it('announces each transition once', () => {
        const generationId = seedDoneGeneration(store, 'thread-a');
        store.revertLastGeneration(ROOT, 'thread-a');

        expect(observed).toEqual([[generationId, 'done'], [generationId, 'reverted']]);
    });

    it('stays silent for updates that carry no status', () => {
        // updateReviewState is an Object.assign over a PARTIAL state and most callers pass only
        // modifiedFiles/reviewView — announcing those would flood the panel with no-op events.
        const generationId = seedDoneGeneration(store, 'thread-a');
        observed.length = 0;

        store.updateReviewState(ROOT, 'thread-a', generationId, { modifiedFiles: ['other.bal'] });

        expect(observed).toEqual([]);
        expect(store.getDoneGeneration(ROOT, 'thread-a')?.reviewState.modifiedFiles).toEqual(['other.bal']);
    });

    it('stays silent when the status is re-set to the value it already has', () => {
        const generationId = seedDoneGeneration(store, 'thread-a');
        observed.length = 0;

        store.updateReviewState(ROOT, 'thread-a', generationId, { status: 'done' });

        expect(observed).toEqual([]);
    });

    it('EDGE: a throwing observer does not stop the transition or the other observers', () => {
        store.onGenerationStatusChanged(() => { throw new Error('observer blew up'); });
        const reached: string[] = [];
        store.onGenerationStatusChanged((_, status) => reached.push(status));

        expect(() => seedDoneGeneration(store, 'thread-a')).not.toThrow();
        expect(reached).toEqual(['done']);
        expect(store.getDoneGeneration(ROOT, 'thread-a')).toBeDefined();
    });

    it('stops announcing after the subscription is disposed', () => {
        const seen: string[] = [];
        const dispose = store.onGenerationStatusChanged((_, status) => seen.push(status));

        dispose();
        seedDoneGeneration(store, 'thread-a');

        expect(seen).toEqual([]);
    });
});
