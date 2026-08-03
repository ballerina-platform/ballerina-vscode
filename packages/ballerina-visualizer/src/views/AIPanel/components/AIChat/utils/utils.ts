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

import { DiagnosticEntry, UIChatMessage } from "@wso2/ballerina-core";

export interface ChatIndexes {
    integratedChatIndex: number;
    previouslyIntegratedChatIndex: number;
}

const ONBOARDING_COUNTER_KEY = "onboardingCounter";

export function incrementOnboardingOpens(): number {
    const current = parseInt(localStorage.getItem(ONBOARDING_COUNTER_KEY) || "0", 10);
    const next = current + 1;
    localStorage.setItem(ONBOARDING_COUNTER_KEY, next.toString());
    return next;
}

export function getOnboardingOpens(): number {
    return parseInt(localStorage.getItem(ONBOARDING_COUNTER_KEY) || "0", 10);
}

/**
 * Convert chat history messages from backend format to UI format
 */
export function convertToUIMessages(messages: UIChatMessage[]) {
    return messages.map((msg) => {
        let role, type;
        if (msg.role === "user") {
            role = "User";
            type = "user_message";
        } else if (msg.role === "assistant") {
            role = "Copilot";
            type = "assistant_message";
        }
        return {
            role: role,
            type: type,
            content: msg.content,
            checkpointId: msg.checkpointId,
            messageId: msg.messageId,
            generationStatus: msg.generationStatus,
        };
    });
}

/**
 * Check if diagnostics contain syntax errors (BCE codes < 2000)
 */
export function isContainsSyntaxError(diagnostics: DiagnosticEntry[]): boolean {
    return diagnostics.some((diag) => {
        if (typeof diag.code === "string" && diag.code.startsWith("BCE")) {
            const match = diag.code.match(/^BCE(\d+)$/);
            if (match) {
                const codeNumber = Number(match[1]);
                if (codeNumber < 2000) {
                    return true;
                }
            }
        }
    });
}
