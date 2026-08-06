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

jest.mock('@wso2/ballerina-core', () => ({ Command: { Agent: 'Agent' } }));

const sendChatComponentNotification = jest.fn();
const sendSaveChatNotification = jest.fn();
const sendTelemetryEvent = jest.fn();

jest.mock('../features/ai/utils/ai-utils', () => ({ sendChatComponentNotification, sendSaveChatNotification }));
// generation-response is deliberately NOT mocked — it owns the finalize being tested.

// Cuts an import chain that reaches the webview layer and an ESM-only LS dependency.
jest.mock('../features/ai/state/ApprovalManager', () => ({
    approvalManager: { cancelAllPending: jest.fn() },
}));

// Cut the rest of generateAgent's module graph — only finalizeLastGeneration is under test.
jest.mock('../features/ai/utils/project/temp-project', () => ({
    cleanupTempProject: jest.fn(),
    getReviewBaselinePath: (p: string) => `${p}-review-baseline`,
}));
jest.mock('../features/telemetry', () => ({
    sendTelemetryEvent,
    TM_EVENT_BALLERINA_AI_GENERATION_SUBMITTED: 'submitted',
    TM_EVENT_BALLERINA_AI_GENERATION_KEPT: 'kept',
    TM_EVENT_BALLERINA_AI_GENERATION_DISCARD: 'discard',
    CMP_BALLERINA_AI_GENERATION: 'generation',
}));
jest.mock('../features/ai/executors/base/AICommandExecutor', () => ({}));
jest.mock('../stateMachine', () => ({ StateMachine: { context: () => ({ projectPath: '/workspace' }) } }));
jest.mock('../BalExtensionContext', () => ({ extension: {} }));
jest.mock('../features/ai/agent/AgentExecutor', () => ({ AgentExecutor: class { } }));
jest.mock('../features/ai/migration/orchestrator', () => ({ getMigrationSourcePathForProject: jest.fn() }));
jest.mock('../features/ai/utils/events', () => ({ createWebviewEventHandler: jest.fn() }));
jest.mock('../features/telemetry/common/project-metrics', () => ({ getProjectMetrics: jest.fn() }));
jest.mock('../features/telemetry/common/project-id', () => ({ getHashedProjectId: jest.fn() }));

import { finalizeLastGeneration } from '../features/ai/agent';
import { chatStateStorage } from '../views/ai-panel/chatStateStorage';

const ROOT = '/workspace';

function seedDoneGeneration(threadId: string) {
    const generationId = `gen-${threadId}`;
    chatStateStorage.getOrCreateThread(ROOT, threadId);
    chatStateStorage.addGeneration(ROOT, threadId, 'do a thing', { generationType: 'agent' } as never, generationId);
    chatStateStorage.updateReviewState(ROOT, threadId, generationId, {
        status: 'done',
        modifiedFiles: ['main.bal'],
        reviewView: { semanticDiffs: [], loadDesignDiagrams: false, isWorkspace: false },
    });
    return generationId;
}

describe('finalizeLastGeneration', () => {
    beforeEach(() => jest.clearAllMocks());

    it('never emits a review component — it would land on the next turn as a phantom ReviewBar', () => {
        seedDoneGeneration('thread-phantom');

        expect(finalizeLastGeneration(ROOT, 'thread-phantom')).toBe(true);

        expect(sendChatComponentNotification).not.toHaveBeenCalled();
    });

    it('still reports the accepted generation', async () => {
        const generationId = seedDoneGeneration('thread-report');

        finalizeLastGeneration(ROOT, 'thread-report');
        await Promise.resolve();

        expect(sendSaveChatNotification).toHaveBeenCalledWith('Agent', generationId);
        const [, event, component, props] = sendTelemetryEvent.mock.calls[0];
        expect([event, component, props['message.id']]).toEqual(['kept', 'generation', generationId]);
    });

    it('EDGE: reports nothing when there is no done generation', async () => {
        chatStateStorage.getOrCreateThread(ROOT, 'thread-empty');

        expect(finalizeLastGeneration(ROOT, 'thread-empty')).toBe(false);
        await Promise.resolve();

        expect(sendTelemetryEvent).not.toHaveBeenCalled();
        expect(sendSaveChatNotification).not.toHaveBeenCalled();
    });
});
