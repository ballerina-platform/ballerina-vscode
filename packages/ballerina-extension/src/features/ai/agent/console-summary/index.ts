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
import { commands } from "vscode";
import { chatStateStorage } from "../../../../views/ai-panel/chatStateStorage";
import { ANTHROPIC_HAIKU, getAnthropicClient } from "../../utils/ai-client";
import { extractAssistantText } from "../message-text";
import { TASK_WRITE_TOOL_NAME } from "../tools/task-writer";
import {
    buildConsoleSummaryMessages,
    buildFallbackSummary,
    extractLastTaskList,
    sanitizeSummary,
} from "./prompt";
import { consoleSummarySchema } from "./schema";

export { markConsoleOriginThread } from "./origin";

const TIMEOUT_MS = 15_000;

// Registered by the Devant cloud editor build
// Absent everywhere else, which reads as "inactive".
const HAS_KEY_COMMAND = "devantEditor.hasAgentSummaryKey";
const APPEND_COMMAND = "devantEditor.appendAgentSummary";
const REMOVE_COMMAND = "devantEditor.removeAgentSummary";

export interface ConsoleSummaryTurn {
    /** Generation this turn belongs to; republishing it replaces the console entry. */
    messageId: string;
    projectRootPath: string;
    threadId: string;
    assistantMessages: any[];
    userQuery: string;
    modifiedFiles: string[];
    errorCount: number;
    abortSignal: AbortSignal;
}

/**
 * Summarises a completed turn and publishes it to the WSO2 Integration Platform
 * console, which shows it under the chat message that launched this editor session.
 *
 * Fire-and-forget: never blocks turn completion, and every failure only means the
 * console shows no entry for this turn.
 *
 * Two gates decide whether a turn publishes. The editor's key means the session was
 * opened with a console plan (it holds one only then). The thread's `consoleOrigin`
 * means the turn belongs to the conversation that plan started: a new chat, or an
 * older thread picked from history, never publishes.
 *
 * @returns whether publishing started, so the caller runs it at most once a turn.
 */
export function startConsoleSummary(turn: ConsoleSummaryTurn): boolean {
    if (!process.env.CLOUD_ENV) {
        return false;
    }
    // Questions and explanations change nothing worth reporting.
    if (turn.modifiedFiles.length === 0 || turn.abortSignal.aborted) {
        return false;
    }
    if (!chatStateStorage.getWorkspaceState(turn.projectRootPath)?.threads.get(turn.threadId)?.consoleOrigin) {
        return false;
    }

    void (async () => {
        try {
            if (!(await isPublishingActive())) {
                return;
            }

            const tasks = extractLastTaskList(turn.assistantMessages, TASK_WRITE_TOOL_NAME);
            const input = {
                userQuery: turn.userQuery,
                tasks,
                modifiedFiles: turn.modifiedFiles,
                assistantText: extractAssistantText(turn.assistantMessages),
                errorCount: turn.errorCount,
                earlierSummaries: getEarlierSummaries(turn.projectRootPath, turn.threadId, turn.messageId),
            };
            let summary: string;
            try {
                summary = await generateSummary(input, turn.abortSignal);
            } catch (error) {
                // A completed turn still gets an entry, built from what the turn recorded.
                console.warn(`[ConsoleSummary] Summary generation failed for ${turn.messageId}, using the fallback:`, error);
                summary = buildFallbackSummary(tasks, turn.modifiedFiles);
            }
            if (!summary || turn.abortSignal.aborted) {
                return;
            }

            // The turn can be undone while the summary is generated: reverted, or
            // dropped by a restore to an earlier checkpoint (or a deleted thread).
            if (!isLive(turn)) {
                return;
            }
            const written = await commands.executeCommand<boolean>(APPEND_COMMAND, { summary, generationId: turn.messageId });
            if (!written) {
                console.log(`[ConsoleSummary] Not published for ${turn.messageId}`);
                return;
            }
            // Undone during the append: the undo found nothing to remove yet, so remove it here.
            if (!isLive(turn)) {
                removeConsoleSummary(turn.messageId);
                return;
            }
            chatStateStorage.updateGeneration(turn.projectRootPath, turn.threadId, turn.messageId, { consoleSummary: summary });
            console.log(`[ConsoleSummary] Published for ${turn.messageId}`);
        } catch (error) {
            console.warn(`[ConsoleSummary] Failed for ${turn.messageId}:`, error);
        }
    })();

    return true;
}

/**
 * Fire-and-forget: takes an undone turn's entry off the console, so the console
 * shows nothing for it. Not gated on the key: after a console "start a new session"
 * the editor has no key, but the entries it already published are still showing.
 */
export function removeConsoleSummary(generationId: string): void {
    void (async () => {
        try {
            await commands.executeCommand<boolean>(REMOVE_COMMAND, { generationId });
        } catch (error) {
            // An editor image without the command, or no cloud editor at all.
            console.warn(`[ConsoleSummary] Remove failed for ${generationId}:`, error);
        }
    })();
}

/** The turn's generation still exists and has not been reverted. Never creates a thread. */
function isLive(turn: ConsoleSummaryTurn): boolean {
    const gen = chatStateStorage.getWorkspaceState(turn.projectRootPath)?.threads.get(turn.threadId)?.generations.find((g) => g.id === turn.messageId);
    return !!gen && gen.reviewState?.status !== "reverted";
}

async function isPublishingActive(): Promise<boolean> {
    try {
        return (await commands.executeCommand<boolean>(HAS_KEY_COMMAND)) === true;
    } catch {
        // An editor image without the command.
        return false;
    }
}

/**
 * Asks the model for the turn's summary. Throws when there is nothing usable to
 * publish: the call failed or timed out, or the reply was empty once sanitized.
 */
async function generateSummary(
    input: Parameters<typeof buildConsoleSummaryMessages>[0],
    turnSignal: AbortSignal
): Promise<string> {
    // Stopped by whichever comes first, the turn's signal or the timeout. Both
    // bound client acquisition too: it can wait on a login or token refresh.
    const controller = new AbortController();
    const onTurnAbort = () => controller.abort();
    turnSignal.addEventListener("abort", onTurnAbort, { once: true });
    // Stopped while the key was checked: the listener above will never fire.
    if (turnSignal.aborted) {
        controller.abort();
    }
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const model = await untilAborted(getAnthropicClient(ANTHROPIC_HAIKU), controller.signal);
        const { object } = await generateObject({
            model,
            maxOutputTokens: 512,
            temperature: 0.2,
            messages: buildConsoleSummaryMessages(input),
            schema: consoleSummarySchema,
            abortSignal: controller.signal,
        });
        const summary = sanitizeSummary(object.summary);
        if (!summary) {
            throw new Error("The model returned an empty summary");
        }
        return summary;
    } finally {
        clearTimeout(timer);
        turnSignal.removeEventListener("abort", onTurnAbort);
    }
}

/**
 * Settles as `promise` does, or rejects once `signal` aborts, whichever comes first.
 * For work that takes no signal of its own; it is left running, only no longer awaited.
 */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        // Always handled, so a rejection after the abort is not reported as unhandled.
        promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

/** Summaries published for earlier turns in the thread, oldest first. */
function getEarlierSummaries(projectRootPath: string, threadId: string, currentGenerationId: string): string[] {
    // Read the thread directly, as the follow-ups do: getGenerations() would
    // create and persist an empty thread if this one is no longer in memory.
    const generations = chatStateStorage.getWorkspaceState(projectRootPath)?.threads.get(threadId)?.generations ?? [];
    return generations
        .filter((g) => g.id !== currentGenerationId && g.consoleSummary && g.reviewState?.status !== "reverted")
        .map((g) => g.consoleSummary!);
}
