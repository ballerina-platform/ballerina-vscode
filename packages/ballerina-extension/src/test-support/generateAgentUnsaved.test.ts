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
const events: { type: string; generationId?: string; messageId?: string }[] = [];
jest.mock('../features/ai/utils/events', () => ({
    createWebviewEventHandler: () => (event: { type: string }) => { events.push(event); },
}));
jest.mock('../features/telemetry/common/project-metrics', () => ({
    getProjectMetrics: async () => ({ fileCount: 0, lineCount: 0 }),
}));
jest.mock('../features/telemetry/common/project-id', () => ({ getHashedProjectId: async () => 'id' }));
jest.mock('../features/ai/state/ApprovalViewManager', () => ({
    approvalViewManager: { closeReviewModeIfOpen: jest.fn() },
}));

let otherResponseRunning = false;
jest.mock('../features/ai/utils/run-event-store', () => ({
    runEventStore: {
        getRunStatus: () => ({ isRunning: false }),
        hasActiveRun: () => otherResponseRunning,
        beginRun: jest.fn(),
        endRun: jest.fn(),
    },
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
import { beginRestore, endRestore } from '../views/ai-panel/checkpoint/restore-state';

const request = (usecase: string) => ({ usecase } as never);

describe('generateAgent with unsaved editor changes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        chatStateStorage.clearActiveExecution('/workspace', 'default');
        saveGate = new Promise((resolve) => { openSaveGate = resolve; });
        stillUnsaved = [];
        events.length = 0;
        otherResponseRunning = false;
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

    it('records a turn stopped during the save and tells the panel, as a later Stop would', async () => {
        const addGeneration = jest.spyOn(chatStateStorage, 'addGeneration');

        const generation = generateAgent({ usecase: 'first', generationId: 'stopped-1' } as never);
        await Promise.resolve();
        expect(chatStateStorage.abortActiveExecution('/workspace', 'default')).toBe(true);
        openSaveGate();

        await expect(generation).rejects.toMatchObject({ name: 'AbortError' });
        expect(addGeneration).toHaveBeenCalledTimes(1);
        expect(chatStateStorage.getGeneration('/workspace', 'default', 'stopped-1')?.reviewState.status).toBe('error');
        expect(events.map(event => [event.type, event.generationId])).toEqual([
            ['abort', 'stopped-1'],
            ['save_chat', 'stopped-1'],
        ]);
        expect(run).not.toHaveBeenCalled();
        expect(chatStateStorage.getActiveExecution('/workspace', 'default')).toBeUndefined();
        addGeneration.mockRestore();
    });

    it('records nothing for a stopped turn once a newer prompt holds the thread', async () => {
        const addGeneration = jest.spyOn(chatStateStorage, 'addGeneration');

        const first = generateAgent({ usecase: 'first', generationId: 'stopped-2' } as never);
        await Promise.resolve();
        chatStateStorage.abortActiveExecution('/workspace', 'default');
        const second = generateAgent({ usecase: 'second', generationId: 'newer-2' } as never);
        await Promise.resolve();
        openSaveGate();

        expect(await first).toBe(false);
        await second;
        expect(addGeneration.mock.calls.map(call => call[4])).toEqual(['newer-2']);
        expect(events).toEqual([]);
        addGeneration.mockRestore();
    });

    it('keeps a stopped turn but tells the panel nothing while another response is running', async () => {
        const generation = generateAgent({ usecase: 'first', generationId: 'stopped-3' } as never);
        await Promise.resolve();
        chatStateStorage.abortActiveExecution('/workspace', 'default');
        otherResponseRunning = true;
        openSaveGate();

        expect(await generation).toBe(false);
        expect(chatStateStorage.getGeneration('/workspace', 'default', 'stopped-3')?.reviewState.status).toBe('error');
        expect(events).toEqual([]);
    });

    it('does not start when a restore began during the save', async () => {
        const addGeneration = jest.spyOn(chatStateStorage, 'addGeneration');

        const generation = generateAgent(request('first'));
        await Promise.resolve();
        beginRestore('/workspace');
        openSaveGate();

        try {
            await expect(generation).rejects.toThrow('restore');
            expect(addGeneration).not.toHaveBeenCalled();
            expect(chatStateStorage.getActiveExecution('/workspace', 'default')).toBeUndefined();
        } finally {
            endRestore('/workspace');
            addGeneration.mockRestore();
        }
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
