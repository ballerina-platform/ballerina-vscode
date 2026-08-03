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

import { generateObject } from "ai";
import { FollowupSuggestion } from "@wso2/ballerina-core";
import { workspace } from "vscode";
import { chatStateStorage } from "../../../../views/ai-panel/chatStateStorage";
import { CopilotEventHandler } from "../../utils/events";
import { ANTHROPIC_HAIKU, getAnthropicClient } from "../../utils/ai-client";
import { buildFollowupMessages, FollowupPromptInput, FollowupSituation, RecentExchange } from "./prompt";
import { followupSuggestionsSchema, GeneratedFollowupSuggestion } from "./schema";

export { FollowupSituation } from "./prompt";

const TIMEOUT_MS = 8_000;

/** Below this much partial output an interrupted turn gets its fixed chip only, with no model call. */
const MIN_CHARS_FOR_INTERRUPTED = 200;

/** How many earlier turns are passed as context, and how much of each message. */
const HISTORY_TURNS = 3;
const MAX_HISTORY_TEXT_CHARS = 1_500;

/** Offered whenever a turn is stopped part-way. */
const CONTINUE_SUGGESTION: FollowupSuggestion = {
    label: "Continue",
    prompt: "Redo the step you were interrupted on and carry on.",
};

/** Offered on failure, so there is something to act on even when generation fails too. */
const RETRY_SUGGESTION: FollowupSuggestion = {
    label: "Try again",
    prompt: "Try that again.",
};

export interface FollowupTurn {
    situation: FollowupSituation;
    /** Generation this turn belongs to. */
    messageId: string;
    projectRootPath: string;
    threadId: string;
    /** Model messages for the turn; the assistant text is taken from these. */
    assistantMessages: any[];
    userQuery: string;
    isPlanMode: boolean;
    /** The turn's signal — already tripped on the interrupted paths. */
    abortSignal: AbortSignal;
    /** What went wrong, when the turn failed. */
    errorMessage?: string;
    eventHandler: CopilotEventHandler;
}

/**
 * Produces follow-up suggestions for a finished turn and pushes them to the webview.
 *
 * Fire-and-forget: never blocks turn completion, and any failure (disabled, empty response,
 * model error, abort) simply results in no chips.
 *
 * @returns whether generation started, so the caller can avoid running twice for one turn.
 */
export function startFollowupSuggestions(turn: FollowupTurn): boolean {
    const { situation, messageId, projectRootPath, threadId, assistantMessages, userQuery, isPlanMode, abortSignal, errorMessage, eventHandler } = turn;

    if (process.env.AI_TEST_ENV) {
        return false;
    }
    if (!workspace.getConfiguration("ballerina.copilot").get<boolean>("followupSuggestions", true)) {
        return false;
    }

    const aborted = situation === "aborted";
    // The turn's signal is tripped on stop, and moments after a failure — so on those paths it
    // can neither gate the work nor be reused for the call.
    const interrupted = situation !== "completed";
    if (!interrupted && abortSignal.aborted) {
        return false;
    }

    const assistantText = extractAssistantText(assistantMessages);
    if (!assistantText && !interrupted) {
        return false;
    }

    // Nothing produced means nothing to pivot on — a failure that early is almost always
    // infrastructure, where the fixed chip is the only honest suggestion.
    const worthGenerating = situation !== "usage_limit"
        && (!interrupted || assistantText.length >= MIN_CHARS_FOR_INTERRUPTED);
    console.log(`[Followups] Scheduling for ${messageId} (situation=${situation})`);

    void (async () => {
        try {
            const generated = worthGenerating
                ? await generateSuggestions({
                    userQuery,
                    assistantResponse: assistantText,
                    earlierExchanges: getRecentExchanges(projectRootPath, threadId, messageId),
                    mode: isPlanMode ? "Plan" : "Edit",
                    situation,
                    errorMessage,
                }, abortSignal)
                : [];

            const fixed = aborted || situation === "usage_limit" ? [CONTINUE_SUGGESTION]
                : situation === "error" ? [RETRY_SUGGESTION]
                : [];
            const suggestions = [...fixed, ...generated];
            if (suggestions.length === 0 || (!interrupted && abortSignal.aborted)) {
                return;
            }
            const stored = chatStateStorage.updateGeneration(projectRootPath, threadId, messageId, { followupSuggestions: suggestions });
            if (!stored) {
                console.warn(`[Followups] Not showing for ${messageId} — could not store them on the generation`);
                return;
            }

            // The webview shows whatever arrives and cannot tell the thread has since changed, so
            // skip the emit and let the switch back read these off the generation instead.
            const activeThreadId = chatStateStorage.getActiveThread(projectRootPath)?.id;
            if (activeThreadId !== threadId) {
                console.log(`[Followups] Stored for ${messageId} without showing — thread ${threadId} is not active (now ${activeThreadId ?? "none"})`);
                return;
            }

            eventHandler({ type: "followup_suggestions", messageId, suggestions });
            console.log(`[Followups] Emitted for ${messageId}: ${suggestions.map(s => s.label).join(", ")}`);
        } catch (error) {
            console.warn(`[Followups] Generation failed for ${messageId}:`, error);
        }
    })();

    return true;
}

/**
 * Best-effort: any failure (model error, timeout, abort, or output that fails schema validation)
 * resolves to an empty array so the caller simply shows no chips.
 */
async function generateSuggestions(
    input: FollowupPromptInput,
    turnSignal: AbortSignal
): Promise<GeneratedFollowupSuggestion[]> {
    if (!input.assistantResponse?.trim()) {
        return [];
    }
    const interrupted = input.situation !== "completed";
    try {
        const { object } = await generateObject({
            model: await getAnthropicClient(ANTHROPIC_HAIKU),
            maxOutputTokens: 1024,
            temperature: 0.3,
            messages: buildFollowupMessages(input),
            schema: followupSuggestionsSchema,
            // The turn's signal is tripped on the interrupted paths, so fall back to a timeout.
            abortSignal: interrupted ? AbortSignal.timeout(TIMEOUT_MS) : turnSignal,
        });
        // Leave room for the fixed chip that an interrupted turn prepends.
        return sanitize(object.suggestions, interrupted ? 2 : 3, input.situation);
    } catch (error) {
        console.warn("[Followups] Suggestion generation failed:", error);
        return [];
    }
}

/** Trims, drops blanks/duplicates, and caps the list. */
function sanitize(
    raw: GeneratedFollowupSuggestion[],
    max: number,
    situation?: FollowupSituation
): GeneratedFollowupSuggestion[] {
    const seen = new Set<string>();
    const out: GeneratedFollowupSuggestion[] = [];
    for (const s of raw ?? []) {
        const label = s?.label?.trim();
        const prompt = s?.prompt?.trim();
        if (!label || !prompt) {
            continue;
        }
        // Both interrupted flows prepend their own chip, so drop model-generated near-duplicates.
        if (situation === "aborted" && /^(continue|resume|finish|complete)\b/i.test(label)) {
            continue;
        }
        if (situation === "error" && /^(retry|try again)\b/i.test(label)) {
            continue;
        }
        const key = label.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push({ label, prompt });
        if (out.length >= max) {
            break;
        }
    }
    return out;
}

/** Concatenates the assistant's text output from a set of model messages. */
function extractAssistantText(messages: any[]): string {
    const parts: string[] = [];
    for (const message of messages ?? []) {
        if (message?.role !== "assistant") {
            continue;
        }
        if (typeof message.content === "string") {
            parts.push(message.content);
        } else if (Array.isArray(message.content)) {
            for (const item of message.content) {
                if (item?.type === "text" && typeof item.text === "string") {
                    parts.push(item.text);
                }
            }
        }
    }
    return parts.join("\n").trim();
}

/**
 * Trimmed transcript of the turns before this one, oldest first. Read from the stored generations
 * rather than the LLM history: `userPrompt` is the bare question, so the codebase block that the
 * LLM copy carries never has to be stripped back out. Tool calls and results are skipped —
 * suggestions only need the narrative, and tool payloads would dwarf it.
 */
function getRecentExchanges(projectRootPath: string, threadId: string, currentGenerationId: string): RecentExchange[] {
    // Read the thread directly: getGenerations() would create and persist an empty thread if this
    // one is no longer in memory, which has cost real chat history before.
    const generations = chatStateStorage.getWorkspaceState(projectRootPath)?.threads.get(threadId)?.generations ?? [];
    const transcript: RecentExchange[] = [];
    for (const generation of generations.filter(g => g.id !== currentGenerationId).slice(-HISTORY_TURNS)) {
        if (generation.userPrompt) {
            transcript.push({ role: "user", text: generation.userPrompt.slice(0, MAX_HISTORY_TEXT_CHARS) });
        }
        const assistantText = extractAssistantText(generation.modelMessages);
        if (assistantText) {
            transcript.push({ role: "assistant", text: assistantText.slice(0, MAX_HISTORY_TEXT_CHARS) });
        }
    }
    return transcript;
}
