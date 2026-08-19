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
    ChatReqMessage,
    getChatMessage,
    getTracingStatus,
    showTraceView,
    showSessionOverview,
    TraceInput,
    SessionInput,
    getChatHistory,
    clearChatHistory,
    getAgentStatus,
    getSessionInfo,
    getAvailableChatAgents,
    switchChatAgent,
    SwitchAgentRequest,
    submitDecision,
    SubmitDecisionRequest
} from "@wso2/ballerina-core";
import { Messenger } from "vscode-messenger";
import { AgentChatRpcManager } from "./rpc-manager";

export function registerAgentChatRpcHandlers(messenger: Messenger) {
    const rpcManger = new AgentChatRpcManager();
    messenger.onRequest(getChatMessage, (args: ChatReqMessage) => rpcManger.getChatMessage(args));
    messenger.onNotification(abortChatRequest, () => rpcManger.abortChatRequest());
    messenger.onRequest(submitDecision, (args: SubmitDecisionRequest) => rpcManger.submitDecision(args));
    messenger.onRequest(getTracingStatus, (params) => rpcManger.getTracingStatus(params));
    messenger.onNotification(showTraceView, (args: TraceInput) => rpcManger.showTraceView(args));
    messenger.onNotification(showSessionOverview, (args: SessionInput) => rpcManger.showSessionOverview(args));
    messenger.onRequest(getChatHistory, () => rpcManger.getChatHistory());
    messenger.onRequest(clearChatHistory, () => rpcManger.clearChatHistory());
    messenger.onRequest(getAgentStatus, () => rpcManger.getAgentStatus());
    messenger.onRequest(getSessionInfo, () => rpcManger.getSessionInfo());
    messenger.onRequest(getAvailableChatAgents, () => rpcManger.getAvailableChatAgents());
    messenger.onRequest(switchChatAgent, (args: SwitchAgentRequest) => rpcManger.switchChatAgent(args));
}
