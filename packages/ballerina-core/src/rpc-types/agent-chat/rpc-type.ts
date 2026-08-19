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
import { ChatReqMessage, ChatRespMessage, TraceInput, TraceStatus, TraceStatusRequest, ChatHistoryResponse, AgentStatusResponse, ClearChatResponse, SessionInput, SessionInfoResponse, AvailableAgentsResponse, SwitchAgentRequest, SwitchAgentResponse, SubmitDecisionRequest } from "./interfaces";
import { RequestType, NotificationType } from "vscode-messenger-common";

const _preFix = "agent-chat";
export const getChatMessage: RequestType<ChatReqMessage, ChatRespMessage> = { method: `${_preFix}/getChatMessage` };
export const abortChatRequest: NotificationType<void> = { method: `${_preFix}/abortChatRequest` };
export const submitDecision: RequestType<SubmitDecisionRequest, ChatRespMessage> = { method: `${_preFix}/submitDecision` };
export const getTracingStatus: RequestType<TraceStatusRequest, TraceStatus> = { method: `${_preFix}/getTracingStatus` };
export const showTraceView: NotificationType<TraceInput> = { method: `${_preFix}/showTraceView` };
export const showSessionOverview: NotificationType<SessionInput> = { method: `${_preFix}/showSessionOverview` };
export const getChatHistory: RequestType<void, ChatHistoryResponse> = { method: `${_preFix}/getChatHistory` };
export const clearChatHistory: RequestType<void, ClearChatResponse> = { method: `${_preFix}/clearChatHistory` };
export const getAgentStatus: RequestType<void, AgentStatusResponse> = { method: `${_preFix}/getAgentStatus` };
export const getSessionInfo: RequestType<void, SessionInfoResponse> = { method: `${_preFix}/getSessionInfo` };
export const getAvailableChatAgents: RequestType<void, AvailableAgentsResponse> = { method: `${_preFix}/getAvailableChatAgents` };
export const switchChatAgent: RequestType<SwitchAgentRequest, SwitchAgentResponse> = { method: `${_preFix}/switchChatAgent` };
export const activeAgentChanged: NotificationType<string> = { method: `${_preFix}/activeAgentChanged` };
export const tracingStatusChanged: NotificationType<TraceStatus> = { method: `${_preFix}/tracingStatusChanged` };
