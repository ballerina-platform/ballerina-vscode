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

import type { AIPanelPrompt, GenerateAgentCodeRequest } from "@wso2/ballerina-core";

/** Text prompts are the subset the compact chat can edit and submit. */
export type MiniChatPrompt = Extract<NonNullable<AIPanelPrompt>, { type: "text" }>;

export function createMiniChatPrompt(
    text = "",
    overrides: Partial<Omit<MiniChatPrompt, "type" | "text">> = {}
): MiniChatPrompt {
    return {
        type: "text",
        text,
        planMode: false,
        autoSubmit: false,
        ...overrides,
    };
}

/** Build the agent request without dropping contextual insertion/selection metadata. */
export function buildMiniChatGenerationRequest(
    prompt: MiniChatPrompt,
    text: string
): GenerateAgentCodeRequest {
    return {
        usecase: text,
        hiddenContext: prompt.hiddenContext,
        isPlanMode: prompt.planMode,
        codeContext: prompt.codeContext,
        fileAttachmentContents: [],
        promptSource: "mini-chat",
    };
}

/**
 * Transfer the mini-chat draft to the full panel. Auto-submit is deliberately
 * disabled: maximizing changes surfaces; it must never send the turn twice.
 */
export function buildFullChatHandoffPrompt(prompt: MiniChatPrompt, draftText: string): MiniChatPrompt {
    return {
        ...prompt,
        text: draftText,
        autoSubmit: false,
    };
}
