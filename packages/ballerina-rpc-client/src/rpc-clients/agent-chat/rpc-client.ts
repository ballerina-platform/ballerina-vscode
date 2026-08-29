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
 * 
 * THIS FILE INCLUDES AUTO GENERATED CODE
 */
import {
    abortChatRequest,
    AgentChatAPI,
    ChatReqMessage,
    ChatRespMessage,
    getChatMessage,
    getTracingStatus,
    showTraceView,
    showSessionOverview,
    TraceInput,
    SessionInput,
    TraceStatus,
    TraceStatusRequest,
    ChatHistoryResponse,
    AgentStatusResponse,
    ClearChatResponse,
    getChatHistory,
    clearChatHistory,
    getAgentStatus,
    getSessionInfo,
    SessionInfoResponse,
    AvailableAgentsResponse,
    SwitchAgentRequest,
    SwitchAgentResponse,
    getAvailableChatAgents,
    switchChatAgent,
    activeAgentChanged,
    tracingStatusChanged,
    submitDecision,
    SubmitDecisionRequest
} from "@wso2/ballerina-core";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { Messenger } from "vscode-messenger-webview";

export class AgentChatRpcClient implements AgentChatAPI {
    private _messenger: Messenger;

    constructor(messenger: Messenger) {
        this._messenger = messenger;
    }

    getChatMessage(params: ChatReqMessage): Promise<ChatRespMessage> {
        return this._messenger.sendRequest(getChatMessage, HOST_EXTENSION, params);
    }

    abortChatRequest(): void {
        return this._messenger.sendNotification(abortChatRequest, HOST_EXTENSION);
    }

    submitDecision(params: SubmitDecisionRequest): Promise<ChatRespMessage> {
        return this._messenger.sendRequest(submitDecision, HOST_EXTENSION, params);
    }

    getTracingStatus(params: TraceStatusRequest = {}): Promise<TraceStatus> {
        return this._messenger.sendRequest(getTracingStatus, HOST_EXTENSION, params);
    }

    showTraceView(params: TraceInput): Promise<void> {
        return this._messenger.sendRequest(showTraceView, HOST_EXTENSION, params);
    }

    showSessionOverview(params: SessionInput): Promise<void> {
        return this._messenger.sendRequest(showSessionOverview, HOST_EXTENSION, params);
    }

    getChatHistory(): Promise<ChatHistoryResponse> {
        return this._messenger.sendRequest(getChatHistory, HOST_EXTENSION);
    }

    clearChatHistory(): Promise<ClearChatResponse> {
        return this._messenger.sendRequest(clearChatHistory, HOST_EXTENSION);
    }

    getAgentStatus(): Promise<AgentStatusResponse> {
        return this._messenger.sendRequest(getAgentStatus, HOST_EXTENSION);
    }

    getSessionInfo(): Promise<SessionInfoResponse> {
        return this._messenger.sendRequest(getSessionInfo, HOST_EXTENSION);
    }

    getAvailableChatAgents(): Promise<AvailableAgentsResponse> {
        return this._messenger.sendRequest(getAvailableChatAgents, HOST_EXTENSION);
    }

    switchChatAgent(params: SwitchAgentRequest): Promise<SwitchAgentResponse> {
        return this._messenger.sendRequest(switchChatAgent, HOST_EXTENSION, params);
    }

    onActiveAgentChanged(handler: (agentName: string) => void): void {
        this._messenger.onNotification(activeAgentChanged, handler);
    }

    onTracingStatusChanged(handler: (status: TraceStatus) => void): void {
        this._messenger.onNotification(tracingStatusChanged, handler);
    }
}
