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

import { ModelMessage } from "ai";
import { ANCHOR_ACTIONS } from "./anchors";

/** How the turn these suggestions belong to ended. */
export type FollowupSituation = "completed" | "aborted" | "error" | "usage_limit";

/** One message from an earlier turn, as context for the suggestions. */
export interface RecentExchange {
    role: "user" | "assistant";
    text: string;
}

export interface FollowupPromptInput {
    /** The user's last message that produced the response. */
    userQuery: string;
    /** The assistant's final response text for the completed turn. */
    assistantResponse: string;
    /** Trimmed transcript of the preceding turns, oldest first, for conversation context. */
    earlierExchanges?: RecentExchange[];
    /** The generation mode the turn ran in. */
    mode?: string;
    /** How the turn ended; defaults to a normally completed turn. */
    situation?: FollowupSituation;
    /** What went wrong, when the turn failed. */
    errorMessage?: string;
}

const anchorGuidance = ANCHOR_ACTIONS.map((a) => `- ${a.label}: ${a.description}`).join("\n");

const COMPLETED_FRAMING = `The Copilot builds integrations for the user. Given the user's last message and the Copilot's response, propose 2-3 short, specific follow-up actions the user is most likely to want next. Each is shown as a clickable chip; clicking one sends its prompt to the Copilot as the user's next message.

Prefer these high-value actions when one fits what just happened, and phrase it for the current context:
${anchorGuidance}

If none fit, suggest a next step that clearly follows from the last exchange.`;

const ABORTED_FRAMING = `The Copilot builds integrations for the user. The user stopped it part-way, so the response below is cut short and the work is unfinished. Propose up to 2 short, specific ways the user might take the work in a DIFFERENT direction from where it stopped. Each is shown as a clickable chip; clicking one sends its prompt to the Copilot as the user's next message.

A separate "Continue" action is already offered to the user, so never suggest continuing, resuming, finishing, or completing the interrupted work — that is covered. People usually stop the Copilot because it was heading somewhere they did not want, so suggest plausible course corrections based on what it had started doing.`;

const ERROR_FRAMING = `The Copilot builds integrations for the user. This turn FAILED part-way, so the work is unfinished and whatever it was doing did not complete. The failure reason is given below. Propose up to 2 short, specific things the user can do about it.

Base the suggestions on the failure: if it looks like something the user can resolve or work around, suggest that; if the work was simply interrupted, suggest getting it finished. Never pretend the work succeeded, and never ask the user to debug the product itself.`;

const SHARED_RULES = `Scope — only suggest things the Copilot can actually do: build, change, explain, run, or test the user's integration, or connect it to other systems or services. Never suggest anything else, because it will be refused — in particular, no deploying to a container or cloud platform, and no infrastructure, CI/CD, or cloud-provider setup.

Audience — the user builds integrations in a friendly, low-code product and may not be a programmer. Write every label and prompt in plain, outcome-focused language: say what the user gets, not how it is built. Never expose implementation details — no programming-language or Ballerina specifics, no command-line commands, no code, annotation, or configuration syntax, no file, module, or library names, and no technical keywords or type names.

Output:
- Each suggestion has a "label" (imperative chip text, max ~4 words, e.g. "Add tests") and a "prompt" (a natural first-person message the user would send, e.g. "Add tests for the order service").
- The "prompt" is spoken by the user, so it is always an instruction and never a question. Never ask the user anything in it, and never carry over a question the Copilot asked.
- Base every suggestion on what actually happened in this exchange — be specific, never generic filler.
- Earlier turns, when provided, are background only: use them to understand what has already been built and to avoid repeating it. Suggest next steps for the latest exchange, not for the earlier ones.
- No duplicates; each must offer a distinct next step.
- Only include actions that genuinely make sense; one or two strong suggestions beat three padded ones.`;

const COMPLETED_ONLY_RULE = `
- Never suggest something the Copilot already did in its response.`;

function buildSystemPrompt(situation: FollowupSituation): string {
    const framing = situation === "aborted" ? ABORTED_FRAMING
        : situation === "error" ? ERROR_FRAMING
        : COMPLETED_FRAMING;
    return `You help users of the WSO2 Integrator Copilot decide what to do next.

${framing}

${SHARED_RULES}${situation === "completed" ? COMPLETED_ONLY_RULE : ""}`;
}

export function buildFollowupMessages(input: FollowupPromptInput): ModelMessage[] {
    const { userQuery, assistantResponse, earlierExchanges, mode, situation = "completed", errorMessage } = input;
    const responseTag = situation === "completed" ? "assistant_response" : "assistant_response_interrupted";
    const errorBlock = situation === "error" && errorMessage
        ? `\n<failure_reason>\n${errorMessage}\n</failure_reason>\n`
        : "";
    const historyBlock = earlierExchanges?.length
        ? `<earlier_in_this_conversation>
${earlierExchanges.map((m) => `${m.role === "user" ? "User message" : "Assistant response"}: ${m.text}`).join("\n\n")}
</earlier_in_this_conversation>

`
        : "";
    const userContent = `${mode ? `Mode: ${mode}\n\n` : ""}${historyBlock}<user_message>
${userQuery}
</user_message>

<${responseTag}>
${assistantResponse}
</${responseTag}>
${errorBlock}
Suggest the user's likely next actions.`;

    return [
        { role: "system", content: buildSystemPrompt(situation) },
        { role: "user", content: userContent },
    ];
}
