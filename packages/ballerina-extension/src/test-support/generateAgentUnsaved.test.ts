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
jest.mock('../features/ai/utils/ai-utils', () => ({
    sendChatComponentNotification: jest.fn(),
    sendSaveChatNotification: jest.fn(),
}));
jest.mock('../features/ai/state/ApprovalManager', () => ({
    approvalManager: { cancelAllPending: jest.fn() },
}));
jest.mock('../features/ai/utils/project/temp-project', () => ({
    cleanupTempProject: jest.fn(),
    getReviewBaselinePath: (p: string) => `${p}-review-baseline`,
}));
jest.mock('../features/telemetry', () => ({
    sendTelemetryEvent: jest.fn(),
    TM_EVENT_BALLERINA_AI_GENERATION_SUBMITTED: 'submitted',
    TM_EVENT_BALLERINA_AI_GENERATION_KEPT: 'kept',
    TM_EVENT_BALLERINA_AI_GENERATION_DISCARD: 'discard',
    CMP_BALLERINA_AI_GENERATION: 'generation',
}));
jest.mock('../features/ai/executors/base/AICommandExecutor', () => ({}));
jest.mock('../stateMachine', () => ({ StateMachine: { context: () => ({ projectPath: '/workspace' }) } }));
jest.mock('../BalExtensionContext', () => ({ extension: {} }));

const run = jest.fn(async () => undefined);
jest.mock('../features/ai/agent/AgentExecutor', () => ({ AgentExecutor: class { run = run; } }));
jest.mock('../features/ai/migration/orchestrator', () => ({ getMigrationSourcePathForProject: jest.fn() }));
jest.mock('../features/ai/utils/events', () => ({ createWebviewEventHandler: () => jest.fn() }));
jest.mock('../features/telemetry/common/project-metrics', () => ({
    getProjectMetrics: async () => ({ fileCount: 0, lineCount: 0 }),
}));
jest.mock('../features/telemetry/common/project-id', () => ({ getHashedProjectId: async () => 'id' }));
jest.mock('../features/ai/state/ApprovalViewManager', () => ({
    approvalViewManager: { closeReviewModeIfOpen: jest.fn() },
}));

jest.mock('../features/ai/utils/run-event-store', () => ({
    runEventStore: { getRunStatus: () => ({ isRunning: false }), beginRun: jest.fn(), endRun: jest.fn() },
}));

let saveGate: Promise<void>;
let openSaveGate: () => void;
let stillUnsaved: string[];
const saveUnsavedDocuments = jest.fn(async (_root: string) => {
    await saveGate;
    return stillUnsaved;
});
jest.mock('../features/ai/utils/project/unsaved-documents', () => ({ saveUnsavedDocuments }));

import { window } from './__mocks__/vscode';
import { generateAgent } from '../features/ai/agent';
import { chatStateStorage } from '../views/ai-panel/chatStateStorage';

const request = (usecase: string) => ({ usecase } as never);

describe('generateAgent with unsaved editor changes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        chatStateStorage.clearActiveExecution('/workspace', 'default');
        saveGate = new Promise((resolve) => { openSaveGate = resolve; });
        stillUnsaved = [];
    });

    it('saves before the turn is recorded, since that is when the checkpoint is captured', async () => {
        const addGeneration = jest.spyOn(chatStateStorage, 'addGeneration');

        const generation = generateAgent(request('first'));
        await Promise.resolve();
        expect(saveUnsavedDocuments).toHaveBeenCalledWith('/workspace');
        expect(addGeneration).not.toHaveBeenCalled();

        openSaveGate();
        await generation;
        expect(addGeneration).toHaveBeenCalled();
        addGeneration.mockRestore();
    });

    it('rejects a second submit that arrives while the first is saving', async () => {
        const first = generateAgent(request('first'));
        const second = generateAgent(request('second'));
        await Promise.resolve();

        openSaveGate();
        const results = await Promise.allSettled([first, second]);

        expect(results[0].status).toBe('fulfilled');
        expect(results[1]).toMatchObject({ status: 'rejected', reason: expect.objectContaining({ message: expect.stringContaining('already in progress') }) });
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('ends the turn without running it when Stop is pressed during the save', async () => {
        const addGeneration = jest.spyOn(chatStateStorage, 'addGeneration');

        const generation = generateAgent(request('first'));
        await Promise.resolve();
        expect(chatStateStorage.abortActiveExecution('/workspace', 'default')).toBe(true);
        openSaveGate();

        expect(await generation).toBe(false);
        expect(addGeneration).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
        expect(chatStateStorage.getActiveExecution('/workspace', 'default')).toBeUndefined();
        addGeneration.mockRestore();
    });

    it('releases the thread when the turn fails to start', async () => {
        const addGeneration = jest.spyOn(chatStateStorage, 'addGeneration').mockImplementation(() => {
            throw new Error('disk full');
        });
        openSaveGate();

        await expect(generateAgent(request('first'))).rejects.toThrow('disk full');
        expect(chatStateStorage.getActiveExecution('/workspace', 'default')).toBeUndefined();
        addGeneration.mockRestore();
    });

    it('warns about files it could not save and still runs', async () => {
        const warn = jest.spyOn(window, 'showWarningMessage');

        const generation = generateAgent(request('first'));
        await Promise.resolve();
        stillUnsaved = ['/workspace/main.bal'];
        openSaveGate();
        await generation;

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('main.bal'));
        expect(run).toHaveBeenCalled();
        warn.mockRestore();
    });
});
