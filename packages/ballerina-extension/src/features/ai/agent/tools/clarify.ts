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

import { tool } from 'ai';
import { z } from 'zod';
import * as crypto from "crypto";
import { CopilotEventHandler } from '../../utils/events';
import { approvalManager } from '../../state/ApprovalManager';

export const CLARIFY_TOOL = "Clarify";

const ClarifyInputSchema = z.object({
    questions: z.array(
        z.object({
            question: z.string().describe('The question to ask the user.'),
            tabLabel: z.string().describe('Short 1-2 word label for the navigation tab, e.g. "Integration", "Systems", "Tests".'),
            options: z.array(
                z.object({
                    label: z.string().describe('Display label for the option.'),
                    value: z.string().describe('Value returned if this option is selected.'),
                })
            ).describe('Predefined answer options for the user to choose from. Do NOT include an "Other" option — a free-text input is always provided automatically.'),
            selectionType: z.enum(["single", "multiple"]).describe(
                'Use "single" when only one answer applies, "multiple" when several can.'
            ),
        })
    ).describe('All questions to ask the user in this single interaction.'),
});

export type ClarifyInput = z.infer<typeof ClarifyInputSchema>;

export function createClarifyTool(eventHandler: CopilotEventHandler) {
    return tool({
        description: `Use this tool to ask the user clarifying questions when the request is ambiguous at the requirements level — where a wrong assumption would produce an integration the user did not want.

Call this ONLY for genuine requirement gaps. Use smart defaults first:

1. Entry point: Default to HTTP for simple service requests. Ask only when the trigger type is ambiguous and the choice materially affects the design.

2. Storage / external system: Default to in-memory for simple apps. When a category is explicitly required but the specific technology is unspecified, infer from context — otherwise ask.

When asking, include a recommended option labelled with "(recommended)".
Offer only options you could carry out if picked; if one depends on something the user may not have, say so in its label and don't recommend it.
Do NOT ask about library/connector selection or implementation details that can be defaulted.
Call AT MOST ONCE per task — batch all questions into a single call.`,
        inputSchema: ClarifyInputSchema,
        execute: async (input, context?: { toolCallId?: string }): Promise<{ answers: Array<{ question: string; answers: string[] }> } | { skipped: boolean }> => {
            const toolCallId = context?.toolCallId || `fallback-${Date.now()}`;
            const requestId = crypto.randomUUID();

            eventHandler({ type: "tool_call", toolName: CLARIFY_TOOL, toolInput: input, toolCallId });

            const response = await approvalManager.requestClarify(requestId, input, eventHandler);

            if (!response.answered) {
                eventHandler({
                    type: "clarify_event",
                    requestId,
                    stage: "skipped",
                    questions: input.questions,
                });
                eventHandler({ type: "tool_result", toolName: CLARIFY_TOOL, toolOutput: { skipped: true }, toolCallId });
                return { skipped: true };
            }

            eventHandler({
                type: "clarify_event",
                requestId,
                stage: "answered",
                questions: input.questions,
                answers: response.answers,
            });
            eventHandler({ type: "tool_result", toolName: CLARIFY_TOOL, toolOutput: { answers: response.answers }, toolCallId });
            return { answers: response.answers ?? [] };
        },
    });
}
