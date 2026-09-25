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

const TIMEOUT_MS = 15_000;

// Registered by the Devant cloud editor build
// Absent everywhere else, which reads as "inactive".
const HAS_KEY_COMMAND = "devantEditor.hasAgentSummaryKey";
const APPEND_COMMAND = "devantEditor.appendAgentSummary";

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
 * Summarises a completed turn and publishes it to the Devant console, which shows
 * it under the chat message that launched this editor session.
 *
 * Fire-and-forget: never blocks turn completion, and every failure only means the
 * console shows no entry for this turn. Runs only in a cloud editor session that
 * a console plan launched — the editor answers that, since it owns the key.
 *
 * @returns whether publishing started, so the caller runs it at most once a turn.
 */
export function startConsoleSummary(turn: ConsoleSummaryTurn): boolean {
    if (process.env.AI_TEST_ENV || !process.env.CLOUD_ENV) {
        return false;
    }
    // Questions and explanations change nothing worth reporting.
    if (turn.modifiedFiles.length === 0 || turn.abortSignal.aborted) {
        return false;
    }

    void (async () => {
        try {
            if (!(await isPublishingActive())) {
                return;
            }

            const tasks = extractLastTaskList(turn.assistantMessages, TASK_WRITE_TOOL_NAME);
            const generated = await generateSummary({
                userQuery: turn.userQuery,
                tasks,
                modifiedFiles: turn.modifiedFiles,
                assistantText: extractAssistantText(turn.assistantMessages),
                errorCount: turn.errorCount,
                earlierSummaries: getEarlierSummaries(turn.projectRootPath, turn.threadId, turn.messageId),
            }, turn.abortSignal);
            const summary = generated || buildFallbackSummary(tasks, turn.modifiedFiles);
            if (!summary || turn.abortSignal.aborted) {
                return;
            }

            // Look up without creating: updateGeneration would recreate a deleted thread.
            const gen = chatStateStorage.getWorkspaceState(turn.projectRootPath)?.threads.get(turn.threadId)?.generations.find((g) => g.id === turn.messageId);
            if (!gen) {
                return;
            }
            const written = await commands.executeCommand<boolean>(APPEND_COMMAND, { summary, generationId: turn.messageId });
            if (written) {
                chatStateStorage.updateGeneration(turn.projectRootPath, turn.threadId, turn.messageId, { consoleSummary: summary });
            }
            console.log(`[ConsoleSummary] ${written ? "Published" : "Not published"} for ${turn.messageId}`);
        } catch (error) {
            console.warn(`[ConsoleSummary] Failed for ${turn.messageId}:`, error);
        }
    })();

    return true;
}

/** Fire-and-forget: replaces a reverted turn's console entry. */
export function retractConsoleSummary(generationId: string): void {
    void (async () => {
        try {
            if (await isPublishingActive()) {
                await commands.executeCommand<boolean>(APPEND_COMMAND, { summary: "The changes from this step were reverted.", generationId });
            }
        } catch (error) {
            console.warn(`[ConsoleSummary] Revert update failed for ${generationId}:`, error);
        }
    })();
}

async function isPublishingActive(): Promise<boolean> {
    try {
        return (await commands.executeCommand<boolean>(HAS_KEY_COMMAND)) === true;
    } catch {
        // An editor image without the command.
        return false;
    }
}

/** Best-effort: any failure resolves to an empty string and the caller falls back. */
async function generateSummary(
    input: Parameters<typeof buildConsoleSummaryMessages>[0],
    turnSignal: AbortSignal
): Promise<string> {
    // Stopped by whichever comes first, the turn's signal or the timeout.
    const controller = new AbortController();
    const onTurnAbort = () => controller.abort();
    turnSignal.addEventListener("abort", onTurnAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const { object } = await generateObject({
            model: await getAnthropicClient(ANTHROPIC_HAIKU),
            maxOutputTokens: 512,
            temperature: 0.2,
            messages: buildConsoleSummaryMessages(input),
            schema: consoleSummarySchema,
            abortSignal: controller.signal,
        });
        return sanitizeSummary(object.summary);
    } catch (error) {
        console.warn("[ConsoleSummary] Summary generation failed:", error);
        return "";
    } finally {
        clearTimeout(timer);
        turnSignal.removeEventListener("abort", onTurnAbort);
    }
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
