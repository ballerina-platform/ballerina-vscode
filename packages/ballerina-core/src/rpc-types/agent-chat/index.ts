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

import { ChatReqMessage, ChatRespMessage, TraceInput, TraceStatus, TraceStatusRequest, ChatHistoryResponse, AgentStatusResponse, ClearChatResponse, ExecutionStep, SessionInput, SessionInfoResponse, AgentInfo, AvailableAgentsResponse, SwitchAgentRequest, SwitchAgentResponse, SubmitDecisionRequest, ApprovalDecision, ApprovalRequest, HumanResponse, DecisionMessage, PendingApprovalInfo } from "./interfaces";

export interface AgentChatAPI {
    getChatMessage: (params: ChatReqMessage) => Promise<ChatRespMessage>;
    abortChatRequest: () => void;
    submitDecision: (params: SubmitDecisionRequest) => Promise<ChatRespMessage>;
    getTracingStatus: (params?: TraceStatusRequest) => Promise<TraceStatus>;
    showTraceView: (params: TraceInput) => Promise<void>;
    showSessionOverview: (params: SessionInput) => Promise<void>;
    getChatHistory: () => Promise<ChatHistoryResponse>;
    clearChatHistory: () => Promise<ClearChatResponse>;
    getAgentStatus: () => Promise<AgentStatusResponse>;
    getSessionInfo: () => Promise<SessionInfoResponse>;
    getAvailableChatAgents: () => Promise<AvailableAgentsResponse>;
    switchChatAgent: (params: SwitchAgentRequest) => Promise<SwitchAgentResponse>;
}

export type { ChatReqMessage, ChatRespMessage, TraceInput, TraceStatus, TraceStatusRequest, ChatHistoryResponse, AgentStatusResponse, ClearChatResponse, ExecutionStep, SessionInput, SessionInfoResponse, AgentInfo, AvailableAgentsResponse, SwitchAgentRequest, SwitchAgentResponse, SubmitDecisionRequest, ApprovalDecision, ApprovalRequest, HumanResponse, DecisionMessage, PendingApprovalInfo };
