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
import { KILL_TASK_TOOL_NAME, SubagentType, TASK_OUTPUT_TOOL_NAME } from "./types";
import { loadSubagentHistory, loadSubagentMetadata, SubagentNotFoundError } from "./store";
import { getBackgroundSubagent } from "./background";

export type ResumeValidationError = "SUBAGENT_STILL_RUNNING" | "SUBAGENT_TYPE_MISMATCH" | "SUBAGENT_NOT_FOUND";

/** `kind` rather than a boolean discriminant: this package compiles without strictNullChecks, where true/false literals do not narrow. */
export type ResumeValidation =
    | { kind: "ok"; messages: ModelMessage[]; description: string }
    | { kind: "error"; message: string; error: ResumeValidationError };

export function validateResume(threadDir: string, resumeId: string, requestedType: SubagentType): ResumeValidation {
    const running = getBackgroundSubagent(resumeId);
    if (running && !running.completed) {
        return {
            kind: "error",
            error: "SUBAGENT_STILL_RUNNING",
            message: `Subagent ${resumeId} is still running. Wait for it with ${TASK_OUTPUT_TOOL_NAME} or stop it with ${KILL_TASK_TOOL_NAME} before resuming.`,
        };
    }
    const metadata = loadSubagentMetadata(threadDir, resumeId);
    if (metadata && metadata.subagentType !== requestedType) {
        return {
            kind: "error",
            error: "SUBAGENT_TYPE_MISMATCH",
            message: `Cannot resume: ${resumeId} is a ${metadata.subagentType} subagent, but subagent_type=${requestedType} was requested. Use subagent_type=${metadata.subagentType}.`,
        };
    }
    try {
        return { kind: "ok", messages: loadSubagentHistory(threadDir, resumeId), description: metadata?.description ?? "" };
    } catch (error) {
        if (error instanceof SubagentNotFoundError) {
            return { kind: "error", error: "SUBAGENT_NOT_FOUND", message: error.message };
        }
        throw error;
    }
}
