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
import { ModelMessage } from "ai";
import { randomUUID } from "crypto";
import type { CopilotEventHandler, ToolModelUsage } from "../../utils/events";
import type { GenerationType } from "../../utils/libs/libraries";

export const SUBAGENT_TOOL_NAME = "Subagent";
export const TASK_OUTPUT_TOOL_NAME = "task_output";
export const KILL_TASK_TOOL_NAME = "kill_task";

export const SUBAGENT_TYPES = ["Librarian", "LibraryResearcher"] as const;
export type SubagentType = typeof SUBAGENT_TYPES[number];

export type SubagentModel = "sonnet" | "haiku";

/** Task ids share one namespace with a future shell tool, as in the MI Copilot. */
export const SUBAGENT_ID_PREFIX = "task-subagent-";

export function generateSubagentId(): string {
    // Node's crypto rather than the `uuid` package: uuid@14 ships ESM only, which Jest cannot load.
    return `${SUBAGENT_ID_PREFIX}${randomUUID().split("-")[0]}`;
}

export function isSubagentId(value: string): boolean {
    return /^task-subagent-[0-9a-f]{8}$/.test(value);
}

/** What a subagent run hands back: the report, and the full conversation to persist for `resume`. */
export interface SubagentResult {
    text: string;
    messages: ModelMessage[];
    /** The SDK's total usage for the run (input/output, cache read/write, reasoning), for observability. */
    usage?: unknown;
}

/** Per-run context every subagent needs; built once by the Subagent tool factory. */
export interface SubagentRunContext {
    eventHandler: CopilotEventHandler;
    toolModelUsage: ToolModelUsage;
    generationType: GenerationType;
    projectRootPath: string;
    threadId: string;
    /** `threads/<threadId>` directory; subagent histories live in `subagents/<id>/` under it. */
    threadDir: string;
    /** `${projectRootPath}|${threadId}`: scopes background tasks and their notifications to one run. */
    runKey: string;
}

export interface SubagentMetadata {
    subagentType: SubagentType;
    description: string;
    createdAt: string;
}

export interface BackgroundSubagent {
    id: string;
    subagentType: SubagentType;
    description: string;
    runKey: string;
    /** The Subagent tool call that started it; the completion `tool_result` reuses it. */
    toolCallId: string;
    startTime: Date;
    completedAt?: Date;
    output: string;
    completed: boolean;
    success: boolean | null;
    aborted: boolean;
    abortController: AbortController;
    /** True once the completion has reached the main agent (drain reminder or task_output). */
    notified: boolean;
}

export function buildRunKey(projectRootPath: string, threadId: string): string {
    return `${projectRootPath}|${threadId}`;
}
