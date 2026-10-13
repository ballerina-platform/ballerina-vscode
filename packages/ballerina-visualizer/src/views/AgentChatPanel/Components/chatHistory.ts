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

import type { ExecutionStep, HumanDecision, PendingApprovalInfo, ChatHistoryMessage } from "@wso2/ballerina-core";

/**
 * The chat panel's own message shape and the two rules that govern replayed history, kept
 * apart from ChatInterface.tsx so they can be exercised without a markdown renderer, a
 * WebGL surface or an rpc client. ChatInterface re-exports them, so nothing else changed.
 */

export enum ChatMessageType {
    MESSAGE = "message",
    ERROR = "error",
    APPROVAL = "approval",
}

export interface ChatMessage {
    type: ChatMessageType;
    text: string;
    isUser: boolean;
    traceId?: string;
    executionSteps?: ExecutionStep[];
    // Present when type is APPROVAL: the requests the agent paused on.
    pendingApproval?: PendingApprovalInfo;
    // Present once (some or all of) the pending approval above has been resolved.
    decisions?: Record<string, HumanDecision>;
    // Set when the user dismisses this batch after it keeps failing to submit. Terminal even
    // if some requests still lack a decision.
    unresolvable?: boolean;
}

/**
 * Whether this message still blocks the composer. An approval is unresolved while any of its
 * requests lacks a decision, unless the user has dismissed the batch outright.
 */
export function isApprovalUnresolved(msg: ChatMessage): boolean {
    return msg.type === ChatMessageType.APPROVAL
        && !!msg.pendingApproval
        && !msg.unresolvable
        && msg.pendingApproval.requests.some(r => !msg.decisions?.[r.id]);
}

/** Maps one stored history entry back onto the shape the panel renders. */
export function toChatMessage(msg: ChatHistoryMessage): ChatMessage {
    return {
        type: msg.type === 'error'
            ? ChatMessageType.ERROR
            : msg.type === 'approval'
                ? ChatMessageType.APPROVAL
                : ChatMessageType.MESSAGE,
        text: msg.text,
        isUser: msg.isUser,
        traceId: msg.traceId,
        executionSteps: msg.executionSteps,
        pendingApproval: msg.pendingApproval,
        decisions: msg.decisions,
        unresolvable: msg.unresolvable,
    };
}
