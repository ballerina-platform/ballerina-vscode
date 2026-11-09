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

// An in-memory stand-in for the on-disk store, so a second ChatStateStorage over the same data
// reproduces what an extension-host restart does: everything not persisted is gone.
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

import { ChatStateStorage, isRevertible } from '../views/ai-panel/chatStateStorage';

const ROOT = '/workspace';
const THREAD = 'thread-a';
const REVIEW_VIEW = { semanticDiffs: [{ nodeKind: 1 }], loadDesignDiagrams: true, isWorkspace: false };

function seedDone(store: ChatStateStorage, generationId: string, reviewView: object | undefined) {
    store.getOrCreateThread(ROOT, THREAD);
    store.addGeneration(ROOT, THREAD, 'do a thing', { generationType: 'agent' } as never, generationId);
    store.updateReviewState(ROOT, THREAD, generationId, {
        status: 'done',
        tempProjectPath: ROOT,
        modifiedFiles: ['main.bal'],
        affectedPackagePaths: [ROOT],
        reviewView: reviewView as never,
    });
}

/** A fresh store over the same persisted bytes — what an extension-host restart leaves behind. */
function restart(): ChatStateStorage {
    const restarted = new ChatStateStorage();
    restarted.initializeWorkspace(ROOT);
    return restarted;
}

describe('review data across a restart', () => {
    beforeEach(() => {
        savedThreads.clear();
        savedMetadata = undefined;
    });

    it('a done review survives, with its diffs intact', () => {
        seedDone(new ChatStateStorage(), 'gen-1', REVIEW_VIEW);

        const review = restart().getDoneGeneration(ROOT, THREAD)?.reviewState;

        expect(review?.status).toBe('done');
        expect(review?.reviewView).toEqual(REVIEW_VIEW);
    });

    it('drops the absolute paths rather than restoring ones a moved workspace would invalidate', () => {
        seedDone(new ChatStateStorage(), 'gen-1', REVIEW_VIEW);

        const review = restart().getDoneGeneration(ROOT, THREAD)?.reviewState;

        expect(review?.tempProjectPath).toBeUndefined();
        expect(review?.affectedPackagePaths).toBeUndefined();
    });

    it('EDGE: a generation written before reviews were persisted is not revertible', () => {
        // Exactly what was on disk before: 'done', but nothing behind it.
        seedDone(new ChatStateStorage(), 'gen-1', undefined);

        const restarted = restart();

        expect(restarted.getGeneration(ROOT, THREAD, 'gen-1')?.reviewState.status).toBe('done');
        expect(restarted.getDoneGeneration(ROOT, THREAD)).toBeUndefined();
    });

    it('EDGE: nothing is left to restore once the review has settled', () => {
        const store = new ChatStateStorage();
        seedDone(store, 'gen-1', REVIEW_VIEW);
        store.finalizeLastGenerationIfDone(ROOT, THREAD);

        const review = restart().getGeneration(ROOT, THREAD, 'gen-1')?.reviewState;

        expect(review?.status).toBe('accepted');
        expect(review?.reviewView).toBeUndefined();
    });
});

describe('isRevertible', () => {
    it('requires both a done status and the data behind it', () => {
        const withData = { reviewState: { status: 'done', reviewView: REVIEW_VIEW } };
        const withoutData = { reviewState: { status: 'done' } };
        const settled = { reviewState: { status: 'accepted', reviewView: REVIEW_VIEW } };

        expect(isRevertible(withData as never)).toBe(true);
        expect(isRevertible(withoutData as never)).toBe(false);
        expect(isRevertible(settled as never)).toBe(false);
        expect(isRevertible(undefined)).toBe(false);
    });
});
