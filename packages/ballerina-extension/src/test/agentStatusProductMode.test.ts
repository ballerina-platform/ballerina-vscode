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
 * The ambient status keeps Integrator's behaviour outside Agent Builder: a finished run holds
 * its 'done' state even with the panel on screen, and the status bar uses the full Copilot name.
 * Agent Builder drops the hold while the panel is visible and uses its short name.
 */

import type { ChatNotify } from '@wso2/ballerina-core';

const mockStatusBarItem = { text: '', name: '', command: '', tooltip: undefined as unknown, backgroundColor: undefined as unknown, show: jest.fn(), hide: jest.fn(), dispose: jest.fn() };
let mockProductMode = 'integrator';
const mockNames: Record<string, [string, string]> = {
    'ballerina': ['Ballerina Copilot', 'Ballerina Copilot'],
    'integrator': ['WSO2 Integrator Copilot', 'Integrator Copilot'],
    'agent-builder': ['WSO2 Agent Builder Copilot', 'Agent Builder Copilot'],
};

jest.mock('vscode', () => ({
    window: { createStatusBarItem: () => mockStatusBarItem },
    workspace: {
        getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }),
        onDidChangeConfiguration: () => ({ dispose() {} }),
    },
    commands: { executeCommand: () => Promise.resolve(undefined) },
    StatusBarAlignment: { Right: 2 },
    ThemeColor: class { constructor(public id: string) {} },
    MarkdownString: class { value = ''; appendMarkdown(text: string) { this.value += text; } },
    Disposable: class { constructor(public dispose: () => void) {} },
}), { virtual: true });
jest.mock('../RPCLayer', () => ({ RPCLayer: { _messenger: { sendNotification: jest.fn() } } }));
jest.mock('../views/visualizer/webview', () => ({ VisualizerWebview: { viewType: 'ballerina-visualizer' } }));
jest.mock('@wso2/ballerina-core', () => ({
    agentRunStatusChanged: 'agentRunStatusChanged',
    SHARED_COMMANDS: { OPEN_AI_PANEL: 'ballerina.open.ai.panel' },
}));
jest.mock('../utils/config', () => ({
    ProductMode: { BALLERINA: 'ballerina', INTEGRATOR: 'integrator', AGENT_BUILDER: 'agent-builder' },
    getProductMode: () => mockProductMode,
    copilotName: () => mockNames[mockProductMode][0],
    copilotShortName: () => mockNames[mockProductMode][1],
}));

type Manager = typeof import('../features/ai/state/AgentStatusManager')['agentStatusManager'];

function freshManager(mode: string): Manager {
    mockProductMode = mode;
    let manager: Manager;
    jest.isolateModules(() => {
        manager = require('../features/ai/state/AgentStatusManager').agentStatusManager;
    });
    manager.init({ subscriptions: [] } as never);
    return manager;
}

const notify = (type: string) => ({ type } as ChatNotify);

beforeEach(() => {
    jest.useFakeTimers();
    mockStatusBarItem.text = '';
});

afterEach(() => {
    jest.useRealTimers();
});

describe('a run that finishes with the panel on screen', () => {
    it('holds the done state outside Agent Builder', () => {
        const manager = freshManager('integrator');
        manager.setAiPanelVisible(true);
        manager.runStarted('g1');
        manager.onChatNotify(notify('stop'));
        expect(manager.getStatus().state).toBe('completed');
    });

    it('goes straight to idle in Agent Builder', () => {
        const manager = freshManager('agent-builder');
        manager.setAiPanelVisible(true);
        manager.runStarted('g1');
        manager.onChatNotify(notify('stop'));
        expect(manager.getStatus().state).toBe('idle');
    });
});

describe('the status bar name', () => {
    it.each([
        ['integrator', 'WSO2 Integrator Copilot'],
        ['ballerina', 'Ballerina Copilot'],
        ['agent-builder', 'Agent Builder Copilot'],
    ])('in %s mode reads "%s"', (mode, name) => {
        const manager = freshManager(mode);
        manager.runStarted('g1');
        manager.onChatNotify(notify('clarify_event'));
        expect(mockStatusBarItem.text).toBe(`$(bi-ai-chat) ${name} needs your input`);
        manager.onChatNotify(notify('stop'));
        expect(mockStatusBarItem.text).toBe(`$(check) ${name} finished`);
    });
});
