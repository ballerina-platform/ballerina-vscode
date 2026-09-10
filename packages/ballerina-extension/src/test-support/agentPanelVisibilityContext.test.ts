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
 * The editor-title "Open Copilot" button is gated on `!ballerina.aiPanelVisible`, so
 * it hides only while the panel is actually on screen — not while it is open behind
 * another tab, where clicking would usefully reveal it. Pins that setAiPanelVisible
 * drives that context key (and only on a real change).
 */

jest.mock('../RPCLayer', () => ({ RPCLayer: { _messenger: { sendNotification: jest.fn() } } }));
jest.mock('../views/visualizer/webview', () => ({ VisualizerWebview: { viewType: 'ballerina-visualizer' } }));
jest.mock('@wso2/ballerina-core', () => ({
    agentRunStatusChanged: 'agentRunStatusChanged',
    SHARED_COMMANDS: { OPEN_AI_PANEL: 'ballerina.open.ai.panel' },
}));

import * as vscode from 'vscode';
import { agentStatusManager } from '../features/ai/state/AgentStatusManager';

describe('setAiPanelVisible drives the ballerina.aiPanelVisible context key', () => {
    let contextWrites: Array<[string, unknown]>;

    beforeEach(() => {
        contextWrites = [];
        jest.spyOn(vscode.commands, 'executeCommand').mockImplementation(((command: string, ...args: unknown[]) => {
            if (command === 'setContext') {
                contextWrites.push([args[0] as string, args[1]]);
            }
            return Promise.resolve(undefined);
        }) as typeof vscode.commands.executeCommand);
        agentStatusManager.setAiPanelVisible(false);
        contextWrites = [];
    });

    it('sets the key true when the panel becomes visible', () => {
        agentStatusManager.setAiPanelVisible(true);
        expect(contextWrites).toContainEqual(['ballerina.aiPanelVisible', true]);
    });

    it('sets the key false when the panel is hidden', () => {
        agentStatusManager.setAiPanelVisible(true);
        contextWrites = [];
        agentStatusManager.setAiPanelVisible(false);
        expect(contextWrites).toContainEqual(['ballerina.aiPanelVisible', false]);
    });

    it('does not re-emit when the visibility is unchanged', () => {
        agentStatusManager.setAiPanelVisible(true);
        contextWrites = [];
        agentStatusManager.setAiPanelVisible(true);
        expect(contextWrites).toHaveLength(0);
    });
});
