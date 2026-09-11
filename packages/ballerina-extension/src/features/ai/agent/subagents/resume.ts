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
 * `resume` validation, ported from the MI Copilot: a still-running task cannot be resumed, the type must
 * match the original, and the history must exist.
 */

import type { ModelMessage } from "ai";
import { isSubagentId, KILL_TASK_TOOL_NAME, SubagentType, TASK_OUTPUT_TOOL_NAME } from "./types";
import { loadSubagentHistory, loadSubagentMetadata, SubagentNotFoundError } from "./store";
import { getBackgroundSubagent } from "./background";

export type ResumeValidationError = "SUBAGENT_STILL_RUNNING" | "SUBAGENT_TYPE_MISMATCH" | "SUBAGENT_NOT_FOUND";

/** `kind` rather than a boolean discriminant: this package compiles without strictNullChecks, where true/false literals do not narrow. */
export type ResumeValidation =
    | { kind: "ok"; messages: ModelMessage[]; description: string }
    | { kind: "error"; message: string; error: ResumeValidationError };

/**
 * Foreground runs in flight, by subagent id. A background task is visible through the background map;
 * a foreground run is not, so two parallel `resume` calls on one id would both load the same history
 * and the last `saveSubagentRun` would silently discard the other's. Returns the release function.
 */
const foregroundRuns = new Set<string>();

export function markForegroundRun(subagentId: string): () => void {
    foregroundRuns.add(subagentId);
    return () => { foregroundRuns.delete(subagentId); };
}

export function validateResume(threadDir: string, resumeId: string, requestedType: SubagentType): ResumeValidation {
    if (!isSubagentId(resumeId)) {
        return {
            kind: "error",
            error: "SUBAGENT_NOT_FOUND",
            message: `Cannot resume: "${resumeId}" is not a valid subagent id. Use the id from a Subagent report's "Resume id" line (task-subagent-xxxxxxxx).`,
        };
    }
    if (foregroundRuns.has(resumeId)) {
        return {
            kind: "error",
            error: "SUBAGENT_STILL_RUNNING",
            message: `Subagent ${resumeId} is still running in the foreground. Wait for its report, then resume it with one follow-up at a time.`,
        };
    }
    const running = getBackgroundSubagent(resumeId);
    if (running && !running.completed) {
        return {
            kind: "error",
            error: "SUBAGENT_STILL_RUNNING",
            message: `Subagent ${resumeId} is still running. Wait for it with ${TASK_OUTPUT_TOOL_NAME} or stop it with ${KILL_TASK_TOOL_NAME} before resuming.`,
        };
    }
    // A missing or corrupt metadata file is terminal: resuming would run the saved history under
    // whatever `subagent_type` was requested (a Librarian's conversation picking up the researcher's
    // web tools), and the resave would then rewrite the metadata with that wrong type for good.
    const metadata = loadSubagentMetadata(threadDir, resumeId);
    if (!metadata) {
        return {
            kind: "error",
            error: "SUBAGENT_NOT_FOUND",
            message: `Cannot resume: no saved metadata for subagent ${resumeId}, so its type cannot be verified. Start a fresh Subagent run instead.`,
        };
    }
    if (metadata.subagentType !== requestedType) {
        return {
            kind: "error",
            error: "SUBAGENT_TYPE_MISMATCH",
            message: `Cannot resume: ${resumeId} is a ${metadata.subagentType} subagent, but subagent_type=${requestedType} was requested. Use subagent_type=${metadata.subagentType}.`,
        };
    }
    try {
        return { kind: "ok", messages: loadSubagentHistory(threadDir, resumeId), description: metadata.description };
    } catch (error) {
        if (error instanceof SubagentNotFoundError) {
            return { kind: "error", error: "SUBAGENT_NOT_FOUND", message: error.message };
        }
        throw error;
    }
}
