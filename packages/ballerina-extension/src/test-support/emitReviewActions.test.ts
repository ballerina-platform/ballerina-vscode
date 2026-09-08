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

jest.mock('@wso2/ballerina-core', () => ({
    Command: { Agent: 'Agent' },
    PROJECT_KIND: { WORKSPACE_PROJECT: 'WORKSPACE_PROJECT', SINGLE_FILE_PROJECT: 'SINGLE_FILE_PROJECT' },
}));

const getSemanticDiff = jest.fn();
const openReviewMode = jest.fn();
const updateAndSaveChat = jest.fn();
let projectKind = 'BALLERINA_PROJECT';

jest.mock('../stateMachine', () => ({
    StateMachine: {
        context: () => ({ langClient: { getSemanticDiff }, projectInfo: { projectKind } }),
        langClient: () => ({ didOpen: jest.fn(), didChange: jest.fn(), didClose: jest.fn() }),
    },
}));
jest.mock('../features/ai/state/ApprovalViewManager', () => ({ approvalViewManager: { openReviewMode } }));
jest.mock('../features/ai/utils/events', () => ({ updateAndSaveChat, calculateTotalCost: jest.fn() }));

// Cut the rest of AgentExecutor's module graph — only emitReviewActions is under test.
for (const m of [
    '../features/ai/utils/project/temp-project',
    '../features/ai/utils/project/ls-schema-notifications',
    '../features/ai/agent/prompts', '../features/ai/agent/followups', '../features/ai/agent/agents-md',
    '../features/ai/utils/libs/libraries', '../features/ai/agent/tool-registry',
    '../features/ai/agent/skills/context', '../features/ai/agent/mcp',
    '../features/ai/agent/stream-handlers/stream-context',
    '../features/ai/agent/tools/diagnostics-utils', '../features/ai/agent/tools/task-writer',
    '../features/ai/agent/tools/running-service-manager',
    '../features/ai/utils/ai-client', '../features/ai/utils/ai-utils',
    '../utils', '../utils/ai/auth', '../BalExtensionContext',
    '../features/telemetry/common/project-metrics', '../features/telemetry/common/project-id',
    'ai',
]) { jest.mock(m, () => ({})); }

jest.mock('../features/ai/executors/base/AICommandExecutor', () => ({ AICommandExecutor: class { } }));

import { AgentExecutor, normalizeRelativePath } from '../features/ai/agent/AgentExecutor';
import { chatStateStorage } from '../views/ai-panel/chatStateStorage';

const ROOT = '/ws';
const PKG_A = '/ws/pkg-a';
const PKG_B = '/ws/pkg-b';

function seedGeneration(generationId: string, modifiedFiles: string[], affectedPackagePaths: string[]) {
    chatStateStorage.getOrCreateThread(ROOT, 'default');
    chatStateStorage.addGeneration(ROOT, 'default', 'do a thing', { generationType: 'agent' } as never, generationId);
    chatStateStorage.updateReviewState(ROOT, 'default', generationId, { modifiedFiles, affectedPackagePaths });
}

function makeExecutor(events: any[]) {
    const executor = Object.create(AgentExecutor.prototype);
    executor.config = { chatStorage: { projectRootPath: ROOT, threadId: 'default', enabled: true } };
    const context = {
        messageId: 'gen-1',
        ctx: { workspacePath: ROOT, projectPath: ROOT, tempProjectPath: ROOT },
        projects: [],
        eventHandler: (e: any) => events.push(e),
    };
    return { executor, context };
}

const reviewEvent = (events: any[]) =>
    events.find(e => e.type === 'chat_component' && e.componentType === 'review');

describe('emitReviewActions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        projectKind = 'BALLERINA_PROJECT';
    });

    it('emits a review component carrying the semantic diffs', async () => {
        seedGeneration('gen-1', ['main.bal'], [PKG_A]);
        getSemanticDiff.mockResolvedValue({ semanticDiffs: [{ a: 1 }, { b: 2 }], loadDesignDiagrams: true });
        const events: any[] = [];
        const { executor, context } = makeExecutor(events);

        await executor.emitReviewActions(context);

        const review = reviewEvent(events);
        expect(review.data.semanticDiffs).toHaveLength(2);
        expect(review.data.loadDesignDiagrams).toBe(true);
        expect(review.data.generationId).toBe('gen-1');
        expect(openReviewMode).toHaveBeenCalled();
    });

    it('labels every diff with the package it came from', async () => {
        seedGeneration('gen-1', ['a.bal', 'b.bal'], [PKG_A, PKG_B]);
        getSemanticDiff
            .mockResolvedValueOnce({ semanticDiffs: [{ a: 1 }, { a: 2 }], loadDesignDiagrams: false })
            .mockResolvedValueOnce({ semanticDiffs: [{ b: 1 }], loadDesignDiagrams: false });
        const events: any[] = [];
        const { executor, context } = makeExecutor(events);

        await executor.emitReviewActions(context);

        // diffPackageMap is positional — one package name per diff, in diff order.
        expect(reviewEvent(events).data.diffPackageMap).toEqual(['pkg-a', 'pkg-a', 'pkg-b']);
    });

    it('EDGE: emits nothing to review when no files were modified', async () => {
        seedGeneration('gen-1', [], []);
        const events: any[] = [];
        const { executor, context } = makeExecutor(events);

        await executor.emitReviewActions(context);

        expect(reviewEvent(events)).toBeUndefined();
        expect(getSemanticDiff).not.toHaveBeenCalled();
        // The turn still has to end.
        expect(events.some(e => e.type === 'stop')).toBe(true);
        expect(updateAndSaveChat).toHaveBeenCalled();
    });

    it('EDGE: falls back to plain modified files when the diff request fails', async () => {
        seedGeneration('gen-1', ['main.bal'], [PKG_A, PKG_B]);
        getSemanticDiff.mockRejectedValue(new Error('LS unavailable'));
        const events: any[] = [];
        const { executor, context } = makeExecutor(events);

        await executor.emitReviewActions(context);

        const review = reviewEvent(events);
        expect(review).toBeDefined();
        expect(review.data.semanticDiffs).toEqual([]);
        expect(review.data.diffPackageMap).toEqual([]);
        expect(review.data.loadDesignDiagrams).toBe(false);
        expect(review.data.modifiedFiles).toEqual(['main.bal']);
    });

    it('EDGE: a partial failure keeps the diffs already collected and reports the error', async () => {
        seedGeneration('gen-1', ['a.bal', 'b.bal'], [PKG_A, PKG_B]);
        getSemanticDiff
            .mockResolvedValueOnce({ semanticDiffs: [{ a: 1 }], loadDesignDiagrams: true })
            .mockRejectedValueOnce(new Error('LS died'));
        const events: any[] = [];
        const { executor, context } = makeExecutor(events);

        await executor.emitReviewActions(context);

        // One package failing must not cost the sibling package its valid diffs; the
        // failure is surfaced alongside them instead (openReviewMode's reviewData).
        expect(reviewEvent(events).data.semanticDiffs).toEqual([{ a: 1 }]);
        expect(reviewEvent(events).data.diffPackageMap).toEqual(['pkg-a']);
        expect(reviewEvent(events).data.loadDesignDiagrams).toBe(true);
        const reviewData = openReviewMode.mock.calls[0][1];
        expect(reviewData.semanticDiffError).toContain('LS died');
    });

    it("EDGE: keeps every package's compilation error, not just the first", async () => {
        seedGeneration('gen-1', ['a.bal', 'b.bal'], [PKG_A, PKG_B]);
        getSemanticDiff
            .mockResolvedValueOnce({ semanticDiffs: [{ a: 1 }], loadDesignDiagrams: false, compilationError: 'pkg-a failed to compile' })
            .mockResolvedValueOnce({ semanticDiffs: [{ b: 1 }], loadDesignDiagrams: false, compilationError: 'pkg-b failed to compile' });
        const events: any[] = [];
        const { executor, context } = makeExecutor(events);

        await executor.emitReviewActions(context);

        // Partial-success compile errors aggregate like request failures — a later
        // package's reason must not be dropped because an earlier one already failed.
        expect(reviewEvent(events).data.semanticDiffs).toEqual([{ a: 1 }, { b: 1 }]);
        const reviewData = openReviewMode.mock.calls[0][1];
        expect(reviewData.semanticDiffError).toContain('pkg-a failed to compile');
        expect(reviewData.semanticDiffError).toContain('pkg-b failed to compile');
    });

    it('EDGE: skips the workspace root, which holds no package to diff', async () => {
        projectKind = 'WORKSPACE_PROJECT';
        seedGeneration('gen-1', ['main.bal'], [ROOT, PKG_A]);
        getSemanticDiff.mockResolvedValue({ semanticDiffs: [{ a: 1 }], loadDesignDiagrams: false });
        const events: any[] = [];
        const { executor, context } = makeExecutor(events);

        await executor.emitReviewActions(context);

        expect(getSemanticDiff).toHaveBeenCalledTimes(1);
        expect(getSemanticDiff).toHaveBeenCalledWith({ projectPath: PKG_A });
        expect(reviewEvent(events).data.isWorkspace).toBe(true);
    });

    it('turns the generation revertible only once the review data is stored', async () => {
        seedGeneration('gen-1', ['main.bal'], [PKG_A]);
        // Marking 'done' before this point leaves a window where the panel reads the generation
        // as settled and never hears otherwise.
        expect(chatStateStorage.getGeneration(ROOT, 'default', 'gen-1')?.reviewState.status).not.toBe('done');
        getSemanticDiff.mockResolvedValue({ semanticDiffs: [{ a: 1 }], loadDesignDiagrams: false });
        const events: any[] = [];
        const { executor, context } = makeExecutor(events);

        await executor.emitReviewActions(context);

        const review = chatStateStorage.getGeneration(ROOT, 'default', 'gen-1')?.reviewState;
        expect(review?.status).toBe('done');
        expect(review?.reviewView).toBeDefined();
    });

    it('persists what the diff view needs onto the generation', async () => {
        seedGeneration('gen-1', ['main.bal'], [PKG_A]);
        getSemanticDiff.mockResolvedValue({ semanticDiffs: [{ a: 1 }], loadDesignDiagrams: true });
        const events: any[] = [];
        const { executor, context } = makeExecutor(events);

        await executor.emitReviewActions(context);

        const stored = chatStateStorage.getGeneration(ROOT, 'default', 'gen-1');
        expect(stored?.reviewState.reviewView).toEqual({
            semanticDiffs: [{ a: 1 }], loadDesignDiagrams: true, isWorkspace: false,
        });
    });
});

describe('normalizeRelativePath', () => {
    // The two sides of the package-membership match come from different authors: the
    // workspace toml's `packages` entries vs the LLM's verbatim tool file_path args.
    it.each([
        ['./orders', 'orders'],
        ['orders/', 'orders'],
        ['./orders/', 'orders'],
        ['orders', 'orders'],
        ['orders\\main.bal', 'orders/main.bal'],
        ['./orders/main.bal', 'orders/main.bal'],
        ['orders//main.bal', 'orders/main.bal'],
        [' orders ', 'orders'],
        ['.', ''],
        ['./', ''],
    ])('normalizes %s to %s', (input, expected) => {
        expect(normalizeRelativePath(input)).toBe(expected);
    });
});
