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
 * `task_output` and `kill_task` — the background-task half of the MI Copilot's task workflow, for
 * subagents only (there is no shell tool yet; the id namespace is shared so one can be added).
 *
 * `task_output` with block=true is the wait-and-wake point: the main agent's step blocks inside this call,
 * the UI shows a waiting row, and the promise resolves the moment the subagent finishes.
 */

import { tool } from "ai";
import { z } from "zod";
import { CopilotEventHandler } from "../../utils/events";
import { KILL_TASK_TOOL_NAME, TASK_OUTPUT_TOOL_NAME } from "../subagents/types";
import { getBackgroundSubagent, removeBackgroundSubagent } from "../subagents/background";

export const TASK_OUTPUT_DEFAULT_BLOCK_MS = 120_000;
export const TASK_OUTPUT_MAX_BLOCK_MS = 600_000;
const POLL_INTERVAL_MS = 500;

/**
 * `runKey` is the run that owns the tools. Background tasks are run-scoped (`cleanupRunningBackgroundSubagents`),
 * so a task id from another run must read as not found — otherwise a stale id in a resumed thread could reach
 * a task another turn started.
 */
export function createTaskOutputTool(eventHandler: CopilotEventHandler, runKey: string) {
    return tool({
        description: `Get the result of a background subagent by task id. block=true (default) waits until it completes — use this when you have no other work to do; you are woken as soon as the report is ready. block=false returns the current status immediately. Not for foreground runs (their report was returned inline).`,
        inputSchema: z.object({
            task_id: z.string().describe("The task id returned by Subagent with run_in_background=true."),
            block: z.boolean().optional().describe("Wait for completion (default true)."),
            timeout: z.number().int().optional().describe(`Maximum wait in milliseconds when block=true (default ${TASK_OUTPUT_DEFAULT_BLOCK_MS}, max ${TASK_OUTPUT_MAX_BLOCK_MS}).`),
        }),
        execute: async ({ task_id, block = true, timeout = TASK_OUTPUT_DEFAULT_BLOCK_MS }, options?: { toolCallId?: string; abortSignal?: AbortSignal }) => {
            const toolCallId = options?.toolCallId ?? `fallback-${Date.now()}`;
            const found = getBackgroundSubagent(task_id);
            const task = found && found.runKey === runKey ? found : undefined;
            eventHandler({
                type: "tool_call",
                toolName: TASK_OUTPUT_TOOL_NAME,
                toolInput: { task_id, block, description: task?.description, subagent_type: task?.subagentType },
                toolCallId,
            });

            if (!task) {
                eventHandler({ type: "tool_result", toolName: TASK_OUTPUT_TOOL_NAME, toolOutput: { task_id, status: "not_found" }, toolCallId, failed: true });
                return `Task not found: ${task_id}. No background task with that id exists — it may have completed and been cleaned up, or it was a foreground run whose report was already returned.`;
            }

            const finish = (status: "completed" | "running" | "aborted" | "failed", waitedMs = 0): string => {
                eventHandler({ type: "tool_result", toolName: TASK_OUTPUT_TOOL_NAME, toolOutput: { task_id, status, description: task.description }, toolCallId, failed: status === "failed" });
                if (status === "running") {
                    const waited = waitedMs > 0 ? ` after ${Math.round(waitedMs / 1000)}s` : "";
                    return `Task ${task_id} ("${task.description}") is still running${waited}. Call ${TASK_OUTPUT_TOOL_NAME} again to keep waiting, or ${KILL_TASK_TOOL_NAME} to stop it.`;
                }
                task.notified = true;
                const header = status === "completed"
                    ? `Task ${task_id} ("${task.description}") completed.`
                    : `Task ${task_id} ("${task.description}") ${status === "aborted" ? "was aborted" : "failed"}.`;
                return `${header}\n\n${task.output}`;
            };

            const statusOf = (): "completed" | "aborted" | "failed" => task.aborted ? "aborted" : task.success ? "completed" : "failed";
            const effectiveTimeout = Math.min(Math.max(timeout, 1000), TASK_OUTPUT_MAX_BLOCK_MS);

            if (task.completed) { return finish(statusOf()); }
            if (!block) { return finish("running"); }

            return new Promise<string>((resolve) => {
                const started = Date.now();
                const timer = setInterval(() => {
                    if (task.completed) {
                        clearInterval(timer);
                        resolve(finish(statusOf()));
                    } else if (options?.abortSignal?.aborted) {
                        clearInterval(timer);
                        resolve(finish("running", Date.now() - started));
                    } else if (Date.now() - started >= effectiveTimeout) {
                        clearInterval(timer);
                        resolve(finish("running", Date.now() - started));
                    }
                }, POLL_INTERVAL_MS);
            });
        },
    });
}

export function createKillTaskTool(eventHandler: CopilotEventHandler, runKey: string) {
    return tool({
        description: "Terminate a running background subagent by task id.",
        inputSchema: z.object({
            task_id: z.string().describe("The task id to terminate."),
        }),
        execute: async ({ task_id }, options?: { toolCallId?: string }) => {
            const toolCallId = options?.toolCallId ?? `fallback-${Date.now()}`;
            const found = getBackgroundSubagent(task_id);
            const task = found && found.runKey === runKey ? found : undefined;
            eventHandler({ type: "tool_call", toolName: KILL_TASK_TOOL_NAME, toolInput: { task_id, description: task?.description }, toolCallId });
            if (!task) {
                eventHandler({ type: "tool_result", toolName: KILL_TASK_TOOL_NAME, toolOutput: { task_id, status: "not_found" }, toolCallId, failed: true });
                return `Task not found: ${task_id}.`;
            }
            if (task.completed) {
                task.notified = true;
                removeBackgroundSubagent(task_id);
                eventHandler({ type: "tool_result", toolName: KILL_TASK_TOOL_NAME, toolOutput: { task_id, status: "already_completed" }, toolCallId });
                return `Task ${task_id} had already completed; its result is discarded.`;
            }
            task.aborted = true;
            task.completed = true;
            task.success = false;
            task.completedAt = new Date();
            task.notified = true;
            task.output = `Subagent ${task_id} was terminated by request.`;
            task.abortController.abort();
            removeBackgroundSubagent(task_id);
            eventHandler({ type: "tool_result", toolName: KILL_TASK_TOOL_NAME, toolOutput: { task_id, status: "killed" }, toolCallId });
            return `Task ${task_id} ("${task.description}") terminated.`;
        },
    });
}
