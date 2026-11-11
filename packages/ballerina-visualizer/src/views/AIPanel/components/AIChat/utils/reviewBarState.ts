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

import type { GenerationReviewState } from "@wso2/ballerina-core";

export type GenerationStatus = GenerationReviewState["status"];

/**
 * `generationStatus` mirrors the authoritative `reviewState.status` the extension keeps per
 * generation; the panel only ever copies it, never decides it.
 */
export type PanelMessage = {
    role: string;
    content: string;
    type: string;
    checkpointId?: string;
    messageId?: string;
    generationStatus?: GenerationStatus;
};

export interface ReviewBarState {
    isActive: boolean;
    isDiscarded: boolean;
}

export function deriveReviewBarState(
    generationStatus: GenerationStatus | undefined,
    isLatestAssistantMessage: boolean,
    isLoading: boolean
): ReviewBarState {
    return {
        isActive: generationStatus === "done" && isLatestAssistantMessage && !isLoading,
        isDiscarded: generationStatus === "reverted",
    };
}

/**
 * Returns the array unchanged when no message carries `generationId` — the event then belongs
 * to a thread this panel is not rendering (or to a turn a checkpoint restore trimmed away),
 * and identity is what lets the caller skip the re-render.
 */
export function applyGenerationStatus<T extends PanelMessage>(
    messages: T[],
    generationId: string,
    status: GenerationStatus
): T[] {
    if (!messages.some((message) => message.messageId === generationId)) {
        return messages;
    }
    return messages.map((message) =>
        message.messageId === generationId ? { ...message, generationStatus: status } : message
    );
}
