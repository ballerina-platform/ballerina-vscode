/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import * as vscode from 'vscode';
import { SHARED_COMMANDS } from '@wso2/ballerina-core';
import { BallerinaExtension } from '../../core';
import { ChatPanel } from './webview';

export interface AgentChatContextAgent {
    name: string;
    basePath: string;
    chatEp: string;
    endpointKey: string;
    chatSessionId: string;
}

export interface AgentChatContext {
    // Active agent's endpoint and session (used by existing code)
    chatEp: string;
    chatSessionId: string;
    // Multi-agent support
    agents: AgentChatContextAgent[];
    activeAgentName: string;
}

export function activateAgentChatPanel(ballerinaExtInstance: BallerinaExtension) {
    ballerinaExtInstance.context.subscriptions.push(
        vscode.commands.registerCommand(SHARED_COMMANDS.OPEN_AGENT_CHAT, (agentChatContext: AgentChatContext) => {
            if (
                !agentChatContext.chatEp || typeof agentChatContext.chatEp !== 'string' ||
                !agentChatContext.chatSessionId || typeof agentChatContext.chatSessionId !== 'string'
            ) {
                vscode.window.showErrorMessage('Invalid Agent Chat Context: Missing or incorrect ChatEP or ChatSessionID!');
                return;
            }

            ChatPanel.render(agentChatContext);
        })
    );
}
