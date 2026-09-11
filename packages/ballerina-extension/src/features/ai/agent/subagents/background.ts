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
 * Background subagent tracking — the module state behind `run_in_background`, `task_output` and
 * `kill_task`, ported from the MI Copilot's `subagent_tool.ts` / `bash_tools.ts`.
 *
 * Tasks belong to the run that started them: `cleanupRunningBackgroundSubagents(runKey)` runs at run end
 * so nothing keeps working between turns. Completion reaches the main agent two ways — a blocking
 * `task_output`, or the `<system-reminder>` that `drainBackgroundTaskNotifications` appends to the next
 * tool result of the same run.
 */

import type { Tool } from "ai";
import { BackgroundSubagent } from "./types";

export const MAX_BACKGROUND_SUBAGENTS = 50;
export const BACKGROUND_SUBAGENT_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const backgroundSubagents = new Map<string, BackgroundSubagent>();
let cleanupTimer: NodeJS.Timeout | null = null;

export function getBackgroundSubagent(id: string): BackgroundSubagent | undefined {
    return backgroundSubagents.get(id);
}

export function listBackgroundSubagents(runKey?: string): BackgroundSubagent[] {
    const all = [...backgroundSubagents.values()];
    return runKey ? all.filter(s => s.runKey === runKey) : all;
}

export function registerBackgroundSubagent(entry: BackgroundSubagent): void {
    startCleanupTimer();
    backgroundSubagents.set(entry.id, entry);
}

export function removeBackgroundSubagent(id: string): boolean {
    return backgroundSubagents.delete(id);
}

/** Drops completed entries older than the TTL. Exposed for tests via `now`. */
export function cleanupOldSubagents(now: number = Date.now()): number {
    const threshold = now - BACKGROUND_SUBAGENT_TTL_MS;
    let removed = 0;
    for (const [id, s] of backgroundSubagents) {
        const doneAt = s.completedAt?.getTime() ?? s.startTime.getTime();
        if (s.completed && doneAt < threshold) {
            backgroundSubagents.delete(id);
            removed++;
        }
    }
    return removed;
}

function evictOldestCompleted(): boolean {
    let oldestId: string | null = null;
    let oldest = Number.POSITIVE_INFINITY;
    for (const [id, s] of backgroundSubagents) {
        if (!s.completed) { continue; }
        const doneAt = s.completedAt?.getTime() ?? s.startTime.getTime();
        if (doneAt < oldest) { oldest = doneAt; oldestId = id; }
    }
    if (!oldestId) { return false; }
    backgroundSubagents.delete(oldestId);
    return true;
}

export type CapacityCheck = { kind: "ok" } | { kind: "full"; reason: string };

export function ensureBackgroundCapacity(): CapacityCheck {
    if (backgroundSubagents.size < MAX_BACKGROUND_SUBAGENTS) { return { kind: "ok" }; }
    if (cleanupOldSubagents() > 0 && backgroundSubagents.size < MAX_BACKGROUND_SUBAGENTS) { return { kind: "ok" }; }
    if (evictOldestCompleted()) { return { kind: "ok" }; }
    return {
        kind: "full",
        reason: `Background subagent limit reached (${MAX_BACKGROUND_SUBAGENTS}). Wait for a task to complete with task_output or terminate one with kill_task before starting another.`,
    };
}

/**
 * Aborts and forgets every still-running task of `runKey` (or of every run when omitted). Called at run
 * end so a subagent never outlives the turn that started it.
 */
export function cleanupRunningBackgroundSubagents(runKey?: string): number {
    let cleaned = 0;
    for (const [id, s] of [...backgroundSubagents.entries()]) {
        if (s.completed) { continue; }
        if (runKey && s.runKey !== runKey) { continue; }
        s.aborted = true;
        s.completed = true;
        s.success = false;
        s.completedAt = new Date();
        if (!s.output) { s.output = `Subagent ${id} was terminated because the main agent run ended.`; }
        // Report the abort now, inside the run that owns the row; the task's own rejection lands later and
        // would otherwise be delivered into whatever turn is active by then.
        s.runEnded = true;
        s.onRunEnd?.();
        s.abortController.abort();
        backgroundSubagents.delete(id);
        cleaned++;
    }
    return cleaned;
}

function escapeForTag(text: string): string {
    return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Text to append to a tool result: one line per finished-but-unreported task of this run, wrapped in a
 * `<system-reminder>`. Marks them notified so each completion is reported once. Empty string when there
 * is nothing to report.
 */
export function drainBackgroundTaskNotifications(runKey: string): string {
    const notes: string[] = [];
    for (const s of backgroundSubagents.values()) {
        if (s.runKey !== runKey || !s.completed || s.notified) { continue; }
        s.notified = true;
        const status = s.success ? "completed successfully" : (s.aborted ? "was aborted" : "failed");
        notes.push(`Background ${s.subagentType} subagent "${escapeForTag(s.description)}" (${s.id}) ${status}. Use task_output to retrieve the result.`);
    }
    if (notes.length === 0) { return ""; }
    return `\n\n<system-reminder>\n${notes.join("\n")}\n</system-reminder>`;
}

/**
 * Appends pending completion notices to a tool's result. String results get the reminder appended; plain
 * object results carry it as `system_reminder`; anything else (arrays, undefined) is left alone. The
 * wrapped tool keeps every other property, so schemas and `toModelOutput` are untouched.
 */
export function withBackgroundNotifications<T extends Tool<any, any>>(toolDef: T, runKey: string): T {
    const original = toolDef.execute;
    if (typeof original !== "function") { return toolDef; }
    return {
        ...toolDef,
        execute: async (input: any, options: any) => {
            const result = await (original as any)(input, options);
            const reminder = drainBackgroundTaskNotifications(runKey);
            if (!reminder) { return result; }
            if (typeof result === "string") { return result + reminder; }
            if (result && typeof result === "object" && !Array.isArray(result)) {
                return { ...result, system_reminder: reminder.trim() };
            }
            return result;
        },
    } as T;
}

function startCleanupTimer(): void {
    if (cleanupTimer) { return; }
    cleanupTimer = setInterval(() => { cleanupOldSubagents(); }, CLEANUP_INTERVAL_MS);
    cleanupTimer.unref?.();
}

/** Test hook: forget every entry and stop the sweep. */
export function resetBackgroundSubagentsForTests(): void {
    backgroundSubagents.clear();
    if (cleanupTimer) { clearInterval(cleanupTimer); cleanupTimer = null; }
}
