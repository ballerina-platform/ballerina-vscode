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

export interface ChatReqMessage {
    message: string;
}

export type ApprovalDecision = 'APPROVE' | 'REJECT';

export interface ApprovalRequest {
    id: string;
    sessionId: string;
    toolName: string;
    toolDescription: string;
    arguments: Record<string, any>;
    toolCallId?: string;
    batchIndex: number;
}

export interface HumanResponse {
    decision: ApprovalDecision;
    reason?: string;
}

// Sent from the webview to the extension; the extension fills in `sessionId`
// from the active agent-chat context before posting to the service's `decision` resource.
export interface SubmitDecisionRequest {
    decisions: Record<string, HumanResponse>;
}

// Mirrors `ai:DecisionMessage`, the wire payload posted to a chat service's `decision` resource.
export interface DecisionMessage {
    sessionId: string;
    decisions: Record<string, HumanResponse>;
}

export interface PendingApprovalInfo {
    requests: ApprovalRequest[];
}

export interface ChatRespMessage {
    message: string;
    traceId?: string;
    executionSteps?: ExecutionStep[];
    // Present when the agent paused for human approval instead of returning a normal reply.
    pendingApproval?: PendingApprovalInfo;
}

export interface ExecutionStep {
    spanId: string;
    operationType: 'invoke' | 'chat' | 'tool' | 'other';
    name: string;
    fullName: string;
    duration: number;
    startTime?: string;
    endTime?: string;
    hasError?: boolean;
}

export interface TraceStatus {
    enabled: boolean;
}

export interface TraceStatusRequest {
    projectPath?: string;
}

export interface TraceInput {
    message?: string;
    traceId?: string;
    focusSpanId?: string;
    sessionId?: string;
}

export interface ChatHistoryMessage {
    type: 'message' | 'error' | 'approval';
    text: string;
    isUser: boolean;
    traceId?: string;
    executionSteps?: ExecutionStep[];
    // Present when type is 'approval': the requests the agent paused on.
    pendingApproval?: PendingApprovalInfo;
    // Present once the pending approval above has been resolved by the user.
    decisions?: Record<string, HumanResponse>;
    // Set when the user gives up on this batch via the card's Dismiss action (typically after
    // repeated failed submissions), so the card is terminal even though some requests may
    // still lack a decision. This is a client-side choice, not something the service reports.
    unresolvable?: boolean;
}

export interface ChatHistoryResponse {
    messages: ChatHistoryMessage[];
    isAgentRunning: boolean;
}

export interface AgentStatusResponse {
    isRunning: boolean;
}

export interface ClearChatResponse {
    newSessionId: string;
}

export interface SessionInput {
    sessionId?: string;
}

export interface SessionInfoResponse {
    sessionId: string;
    chatEndpoint: string;
}

export interface AgentInfo {
    name: string;
    basePath: string;
    chatEp: string;
    chatSessionId: string;
}

export interface AvailableAgentsResponse {
    agents: AgentInfo[];
    activeAgentName: string;
}

export interface SwitchAgentRequest {
    agentName: string;
}

export interface SwitchAgentResponse {
    agent: AgentInfo;
    chatHistory: ChatHistoryMessage[];
}
