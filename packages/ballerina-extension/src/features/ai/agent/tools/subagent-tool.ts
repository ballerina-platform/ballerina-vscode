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
 * The `Subagent` tool the main agent sees — port of the MI Copilot's `subagent_tool.ts`.
 *
 * Foreground: blocks, returns the report plus a trailing "Resume id" line (unlike MI, which hides the id
 * because its `task_output` would tempt the model; here the id is the only handle for follow-ups).
 * Background: returns the task id at once; completion reaches the main agent through `task_output` or the
 * `<system-reminder>` appended to the next tool result. Either way the conversation is saved under the
 * thread so `resume` can continue it.
 */

import { tool } from "ai";
import { z } from "zod";
import { CopilotEventHandler } from "../../utils/events";
import {
    BackgroundSubagent,
    KILL_TASK_TOOL_NAME,
    SUBAGENT_TOOL_NAME,
    SUBAGENT_TYPES,
    SubagentModel,
    SubagentRunContext,
    SubagentType,
    TASK_OUTPUT_TOOL_NAME,
    generateSubagentId,
} from "../subagents/types";
import { describeSubagentTypes } from "../subagents/definitions";
import { runSubagent } from "../subagents/runner";
import { saveSubagentRun } from "../subagents/store";
import { ensureBackgroundCapacity, getBackgroundSubagent, registerBackgroundSubagent } from "../subagents/background";
import { extractReportedLibraries, truncateReport } from "../subagents/report";
import { validateResume } from "../subagents/resume";

export const SubagentInputSchema = z.object({
    description: z.string().describe("A short (3-5 word) description of what the subagent will do. Shown to the user."),
    prompt: z.string().describe("The brief: what the integration must do (systems, protocols, operations, constraints, payload shapes), or the precise question. Purpose-written for the subagent, never the raw user request."),
    subagent_type: z.enum(SUBAGENT_TYPES).describe(`The subagent to run:\n${describeSubagentTypes()}`),
    model: z.enum(["sonnet", "haiku"]).optional().describe("Defaults to sonnet. Use haiku only for a narrow, cheap lookup (one named library, one signature)."),
    run_in_background: z.boolean().optional().describe(`Run in the background and return a task id immediately. Only when you have independent work to do meanwhile; check the result with ${TASK_OUTPUT_TOOL_NAME} (block=true when you run out of work) or stop it with ${KILL_TASK_TOOL_NAME}.`),
    resume: z.string().optional().describe("A task id from an earlier run (task-subagent-xxxxxxxx) to continue with a follow-up question instead of starting over."),
});
export type SubagentInput = z.infer<typeof SubagentInputSchema>;

function isModelError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const status = (error as { status?: number })?.status;
    return /model.*not found|invalid.*model|unknown model|model.*deprecated|model.*not available|model.*does not exist/i.test(message)
        || ((status === 400 || status === 404) && /model/i.test(message));
}

function describeFailure(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (isModelError(error)) {
        return `The model used by this extension may be outdated or unavailable. Please update the WSO2 Integrator: BI extension to the latest version. (Error: ${message})`;
    }
    return `Subagent execution failed: ${message}`;
}

function emitResult(eventHandler: CopilotEventHandler, toolCallId: string, output: Record<string, unknown>, failed?: boolean): void {
    eventHandler({ type: "tool_result", toolName: SUBAGENT_TOOL_NAME, toolOutput: output, toolCallId, ...(failed ? { failed: true } : {}) });
}

/** Result payloads repeat the row label inputs: a tool_result item does not keep its tool_call's input. */
function labelFields(input: Pick<SubagentInput, "description" | "subagent_type">): { description: string; subagent_type: SubagentType } {
    return { description: input.description, subagent_type: input.subagent_type };
}

export function createSubagentTool(ctx: SubagentRunContext) {
    return tool({
        description: `Spawn a specialized subagent without filling your own context window. Types:
${describeSubagentTypes()}

Foreground (default): blocks until done and returns the report directly, ending with "Resume id: <task id>" — keep that id to ask follow-ups with resume; do NOT call ${TASK_OUTPUT_TOOL_NAME} on a foreground run.
Background (run_in_background=true): returns a task id immediately. Continue your own independent work; when you run out of work call ${TASK_OUTPUT_TOOL_NAME} with block=true and you will be woken when the report is ready. Every tool result you receive also tells you when a background task has finished. Collect or ${KILL_TASK_TOOL_NAME} every background task before you end your turn.
Resume (resume=<task id>): continues that subagent's conversation with a follow-up question; it keeps its docs and does not start over.`,
        inputSchema: SubagentInputSchema,
        execute: async (input, options?: { toolCallId?: string; abortSignal?: AbortSignal }) => {
            const toolCallId = options?.toolCallId ?? `fallback-${Date.now()}`;
            const mainSignal = options?.abortSignal;
            const model: SubagentModel = input.model ?? "sonnet";
            const background = input.run_in_background === true;
            const isResume = !!input.resume;

            ctx.eventHandler({
                type: "tool_call",
                toolName: SUBAGENT_TOOL_NAME,
                toolInput: {
                    description: input.description,
                    subagent_type: input.subagent_type,
                    run_in_background: background,
                    ...(isResume ? { resume: input.resume } : {}),
                },
                toolCallId,
            });

            let previousMessages: import("ai").ModelMessage[] | undefined;
            if (isResume) {
                const validation = validateResume(ctx.threadDir, input.resume!, input.subagent_type);
                if (validation.kind === "error") {
                    emitResult(ctx.eventHandler, toolCallId, { ...labelFields(input), status: "failed", taskId: input.resume, error: validation.error }, true);
                    return validation.message;
                }
                previousMessages = validation.messages;
            }

            const subagentId = isResume ? input.resume! : generateSubagentId();
            console.log(`[SubagentTool] ${isResume ? "Resuming" : "Spawning"} ${input.subagent_type} ${subagentId} (${model}, background=${background}): ${input.description}`);

            if (background) {
                return startBackground(ctx, input, subagentId, model, previousMessages, mainSignal, toolCallId);
            }

            try {
                const result = await runSubagent({
                    type: input.subagent_type,
                    prompt: input.prompt,
                    model,
                    previousMessages,
                    abortSignal: mainSignal,
                    ctx,
                });
                try {
                    saveSubagentRun(ctx.threadDir, subagentId, { subagentType: input.subagent_type, description: input.description, messages: result.messages });
                } catch (writeError) {
                    console.error(`[SubagentTool] Failed to save history for ${subagentId}`, writeError);
                }
                const report = truncateReport(result.text);
                emitResult(ctx.eventHandler, toolCallId, { ...labelFields(input), status: "completed", taskId: subagentId, libraries: extractReportedLibraries(report) });
                return `${report}\n\nResume id: ${subagentId}`;
            } catch (error) {
                // A cancelled run must keep unwinding so the SDK can wind the step down; AgentExecutor emits the failed result.
                if (mainSignal?.aborted) { throw error; }
                console.error(`[SubagentTool] ${input.subagent_type} ${subagentId} failed`, error);
                emitResult(ctx.eventHandler, toolCallId, { ...labelFields(input), status: "failed", taskId: subagentId }, true);
                return describeFailure(error);
            }
        },
    });
}

function startBackground(
    ctx: SubagentRunContext,
    input: SubagentInput,
    subagentId: string,
    model: SubagentModel,
    previousMessages: import("ai").ModelMessage[] | undefined,
    mainSignal: AbortSignal | undefined,
    toolCallId: string
): string {
    if (!getBackgroundSubagent(subagentId)) {
        const capacity = ensureBackgroundCapacity();
        if (capacity.kind === "full") {
            emitResult(ctx.eventHandler, toolCallId, { ...labelFields(input), status: "failed", taskId: subagentId, error: "TOO_MANY_BACKGROUND_SUBAGENTS" }, true);
            return capacity.reason;
        }
    }

    const abortController = new AbortController();
    let removeAbortListener: (() => void) | undefined;
    if (mainSignal) {
        if (mainSignal.aborted) {
            abortController.abort(mainSignal.reason);
        } else {
            const onMainAbort = () => abortController.abort(mainSignal.reason);
            mainSignal.addEventListener("abort", onMainAbort, { once: true });
            removeAbortListener = () => mainSignal.removeEventListener("abort", onMainAbort);
            abortController.signal.addEventListener("abort", removeAbortListener, { once: true });
        }
    }

    const entry: BackgroundSubagent = {
        id: subagentId,
        subagentType: input.subagent_type,
        description: input.description,
        runKey: ctx.runKey,
        toolCallId,
        startTime: new Date(),
        output: "",
        completed: false,
        success: null,
        aborted: false,
        abortController,
        notified: false,
    };
    registerBackgroundSubagent(entry);

    runSubagent({ type: input.subagent_type, prompt: input.prompt, model, previousMessages, abortSignal: abortController.signal, ctx })
        .then(result => {
            removeAbortListener?.();
            const report = truncateReport(result.text);
            entry.output = `${report}\n\nResume id: ${subagentId}`;
            entry.completed = true;
            entry.success = true;
            entry.completedAt = new Date();
            try {
                saveSubagentRun(ctx.threadDir, subagentId, { subagentType: input.subagent_type, description: input.description, messages: result.messages });
            } catch (writeError) {
                console.error(`[SubagentTool] Failed to save history for ${subagentId}`, writeError);
            }
            emitResult(ctx.eventHandler, toolCallId, { ...labelFields(input), status: "completed", taskId: subagentId, libraries: extractReportedLibraries(report) });
            console.log(`[SubagentTool] Background ${input.subagent_type} ${subagentId} completed`);
        })
        .catch(error => {
            removeAbortListener?.();
            entry.completed = true;
            entry.success = false;
            entry.completedAt = new Date();
            if (entry.aborted || abortController.signal.aborted) {
                entry.aborted = true;
                entry.output = entry.output || `Subagent ${subagentId} was terminated.`;
                emitResult(ctx.eventHandler, toolCallId, { ...labelFields(input), status: "aborted", taskId: subagentId }, true);
                return;
            }
            entry.output = describeFailure(error);
            emitResult(ctx.eventHandler, toolCallId, { ...labelFields(input), status: "failed", taskId: subagentId }, true);
            console.error(`[SubagentTool] Background ${input.subagent_type} ${subagentId} failed`, error);
        });

    emitResult(ctx.eventHandler, toolCallId, { ...labelFields(input), status: "running", taskId: subagentId });
    return `${input.subagent_type} subagent ${previousMessages ? "resumed" : "started"} in the background with task id ${subagentId}. Continue your own work; call ${TASK_OUTPUT_TOOL_NAME} (block=true) when you need the report, or ${KILL_TASK_TOOL_NAME} to stop it.`;
}
