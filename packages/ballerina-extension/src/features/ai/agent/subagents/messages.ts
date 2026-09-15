// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

/**
 * Conversation shaping for subagent runs — a leaf module (only the AI SDK types) so it is unit-testable.
 */

import type { ModelMessage } from "ai";

export function buildSubagentMessages(prompt: string, previousMessages: ModelMessage[] | undefined, followUpHint: string): ModelMessage[] {
    if (previousMessages && previousMessages.length > 0) {
        return [
            ...previousMessages,
            {
                role: "user",
                content: `## Follow-up question\n\n${prompt}\n\nContinue from where you left off. ${followUpHint}`,
            },
        ];
    }
    return [{ role: "user", content: prompt }];
}

/**
 * The assistant/tool messages the SDK produced for the whole run, for saving as `resume` history.
 *
 * Take `result.response.messages`, never a concatenation of `steps[i].response.messages`: in the AI SDK
 * each step's `response.messages` is a clone of the cumulative list so far (`responseMessages.push(…)`
 * then `structuredClone(responseMessages)` per step), so concatenating steps duplicates the history
 * triangularly (1+2+…+n). That is what the MI Copilot's `extractStepMessages` does, and it showed up here
 * as the same thinking line repeated at steps 1, 2, 4, 7, 11, … in a headless trace (2026-09-11).
 * Falls back to the last step's messages, then to the final text.
 */
export function collectResponseMessages(result: {
    response?: { messages?: ModelMessage[] };
    steps?: ReadonlyArray<{ response?: { messages?: ModelMessage[] } }>;
    text: string;
}): ModelMessage[] {
    const final = result.response?.messages;
    if (Array.isArray(final) && final.length > 0) { return final; }
    const steps = result.steps ?? [];
    const last = steps.length > 0 ? steps[steps.length - 1]?.response?.messages : undefined;
    if (Array.isArray(last) && last.length > 0) { return last; }
    return [{ role: "assistant", content: result.text }];
}
