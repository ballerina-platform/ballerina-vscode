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
 * @jest-environment node
 *
 * Background task bookkeeping: capacity, TTL, run-end cleanup scoped to one run, and the once-only
 * completion reminder that rides on the next tool result. Each of these fails silently in production
 * (a task that never reports, a reminder repeated every step, a task surviving the turn).
 */

import { tool, type Tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";
import type { ChatNotify } from "@wso2/ballerina-core";
import type { BackgroundSubagent } from "../features/ai/agent/subagents/types";
import { createKillTaskTool, createTaskOutputTool } from "../features/ai/agent/tools/task-tools";
import {
    BACKGROUND_SUBAGENT_TTL_MS,
    MAX_BACKGROUND_SUBAGENTS,
    cleanupOldSubagents,
    cleanupRunningBackgroundSubagents,
    drainBackgroundTaskNotifications,
    ensureBackgroundCapacity,
    getBackgroundSubagent,
    listBackgroundSubagents,
    registerBackgroundSubagent,
    resetBackgroundSubagentsForTests,
    withBackgroundNotifications,
} from "../features/ai/agent/subagents/background";

function entry(id: string, overrides: Partial<BackgroundSubagent> = {}): BackgroundSubagent {
    return {
        id, subagentType: "Librarian", description: `task ${id}`, runKey: "run-a", toolCallId: `call-${id}`,
        startTime: new Date(), output: "", completed: false, success: null, aborted: false,
        abortController: new AbortController(), notified: false, ...overrides,
    };
}

beforeEach(() => resetBackgroundSubagentsForTests());
afterEach(() => resetBackgroundSubagentsForTests());

describe("capacity and TTL", () => {
    it("refuses new tasks only when the map is full of running tasks", () => {
        for (let i = 0; i < MAX_BACKGROUND_SUBAGENTS; i++) { registerBackgroundSubagent(entry(`t${i}`)); }
        const full = ensureBackgroundCapacity();
        expect(full.kind).toBe("full");
        if (full.kind === "full") { expect(full.reason).toContain("kill_task"); }
    });

    it("evicts the oldest completed task to make room", () => {
        for (let i = 0; i < MAX_BACKGROUND_SUBAGENTS; i++) { registerBackgroundSubagent(entry(`t${i}`)); }
        const done = getBackgroundSubagent("t3")!;
        done.completed = true; done.completedAt = new Date(Date.now() - 1000);
        expect(ensureBackgroundCapacity().kind).toBe("ok");
        expect(getBackgroundSubagent("t3")).toBeUndefined();
        expect(getBackgroundSubagent("t4")).toBeDefined();
    });

    it("drops completed tasks past the TTL and keeps running ones", () => {
        const old = new Date(Date.now() - BACKGROUND_SUBAGENT_TTL_MS - 1);
        registerBackgroundSubagent(entry("old", { completed: true, success: true, completedAt: old }));
        registerBackgroundSubagent(entry("running", { startTime: old }));
        expect(cleanupOldSubagents()).toBe(1);
        expect(getBackgroundSubagent("old")).toBeUndefined();
        expect(getBackgroundSubagent("running")).toBeDefined();
    });
});

describe("cleanupRunningBackgroundSubagents", () => {
    it("aborts and removes running tasks of the given run only", () => {
        const a = entry("a", { runKey: "run-a" });
        const b = entry("b", { runKey: "run-b" });
        const doneA = entry("done-a", { runKey: "run-a", completed: true, success: true });
        [a, b, doneA].forEach(registerBackgroundSubagent);
        expect(cleanupRunningBackgroundSubagents("run-a")).toBe(1);
        expect(a.abortController.signal.aborted).toBe(true);
        expect(a.aborted).toBe(true);
        expect(a.output).toContain("terminated because the main agent run ended");
        expect(getBackgroundSubagent("a")).toBeUndefined();
        expect(getBackgroundSubagent("b")).toBeDefined();
        expect(b.abortController.signal.aborted).toBe(false);
        expect(getBackgroundSubagent("done-a")).toBeDefined();
        expect(listBackgroundSubagents("run-a").map(s => s.id)).toEqual(["done-a"]);
    });
});

describe("drainBackgroundTaskNotifications", () => {
    it("reports each completed task once, for its own run, escaping angle brackets", () => {
        registerBackgroundSubagent(entry("x", { completed: true, success: true, description: "find <kafka>" }));
        registerBackgroundSubagent(entry("y", { completed: true, success: false, aborted: true }));
        registerBackgroundSubagent(entry("z", { completed: true, success: true, runKey: "run-b" }));
        registerBackgroundSubagent(entry("w"));
        const first = drainBackgroundTaskNotifications("run-a");
        expect(first).toContain("<system-reminder>");
        expect(first).toContain('Background Librarian subagent "find &lt;kafka&gt;" (x) completed successfully. Use task_output to retrieve the result.');
        expect(first).toContain("(y) was aborted");
        expect(first).not.toContain("(z)");
        expect(first).not.toContain("(w)");
        expect(drainBackgroundTaskNotifications("run-a")).toBe("");
        expect(drainBackgroundTaskNotifications("run-b")).toContain("(z) completed successfully");
    });
});

describe("withBackgroundNotifications", () => {
    // Real `Tool` fixtures built with the SDK's own `tool()` helper, so the wrapper is checked against
    // the contract it extends rather than against an `any` that hides a shape mismatch.
    const execOptions = (toolCallId: string): ToolExecutionOptions => ({ toolCallId, messages: [] });

    it("appends the reminder to string results and attaches it to object results", async () => {
        registerBackgroundSubagent(entry("s", { completed: true, success: true }));
        const stringTool = withBackgroundNotifications(tool({
            description: "d",
            inputSchema: z.object({}),
            execute: async () => "ok",
        }), "run-a");
        const out = await stringTool.execute!({}, execOptions("s"));
        // The SDK types an execute result as `AsyncIterable<OUTPUT> | PromiseLike<OUTPUT> | OUTPUT`;
        // these fixtures never stream, so narrowing to the plain value is the assertion too.
        if (typeof out !== "string") { throw new Error("unexpected streamed result"); }
        expect(out).toMatch(/^ok\n\n<system-reminder>/);

        registerBackgroundSubagent(entry("o", { completed: true, success: true }));
        const objectTool = withBackgroundNotifications(tool({
            description: "d",
            inputSchema: z.object({}),
            execute: async (): Promise<{ status: string; system_reminder?: string }> => ({ status: "done" }),
        }), "run-a");
        const obj = await objectTool.execute!({}, execOptions("o"));
        if (!("status" in obj)) { throw new Error("unexpected streamed result"); }
        expect(obj.status).toBe("done");
        expect(obj.system_reminder).toMatch(/^<system-reminder>/);
    });

    it("leaves results untouched when nothing completed, and skips tools without execute", async () => {
        const t = withBackgroundNotifications(tool({
            description: "d",
            inputSchema: z.object({}),
            execute: async () => "plain",
        }), "run-a");
        expect(await t.execute!({}, execOptions("plain"))).toBe("plain");
        // `never` output makes `execute` optional in the SDK's Tool union — the provider-tool shape.
        const noExec: Tool<Record<string, never>, never> = { description: "provider tool", inputSchema: z.object({}) };
        expect(withBackgroundNotifications(noExec, "run-a")).toBe(noExec);
    });
});

describe("task tools are scoped to the owning run", () => {
    const execOptions = (toolCallId: string): ToolExecutionOptions => ({ toolCallId, messages: [] });

    it("reads a task from another run as not found and leaves it untouched", async () => {
        registerBackgroundSubagent(entry("foreign", { runKey: "run-b", completed: true, success: true }));
        const events: ChatNotify[] = [];

        const out = await createTaskOutputTool(e => events.push(e), "run-a").execute!({ task_id: "foreign" }, execOptions("call-1"));
        if (typeof out !== "string") { throw new Error("unexpected streamed result"); }
        expect(out).toContain("Task not found: foreign");
        expect(events.some(e => e.type === "tool_result" && e.toolOutput?.status === "not_found")).toBe(true);

        const killed = await createKillTaskTool(e => events.push(e), "run-a").execute!({ task_id: "foreign" }, execOptions("call-2"));
        if (typeof killed !== "string") { throw new Error("unexpected streamed result"); }
        expect(killed).toBe("Task not found: foreign.");
        expect(getBackgroundSubagent("foreign")).toBeDefined();
        expect(getBackgroundSubagent("foreign")!.aborted).toBe(false);
    });
});

describe("run-end cleanup reports the abort inside the owning run", () => {
    it("marks the entry runEnded and calls onRunEnd before aborting", () => {
        const events: string[] = [];
        const controller = new AbortController();
        registerBackgroundSubagent({
            id: "task-subagent-0000ab12", subagentType: "Librarian", description: "bg", runKey: "run-a", toolCallId: "c", startTime: new Date(),
            output: "", completed: false, success: null, aborted: false, abortController: controller, notified: false,
            onRunEnd: () => events.push(`aborted-reported signal=${controller.signal.aborted}`),
        });
        expect(cleanupRunningBackgroundSubagents("run-a")).toBe(1);
        // Reported synchronously, and before the abort signal fires, so the late rejection has nothing left to say.
        expect(events).toEqual(["aborted-reported signal=false"]);
        expect(controller.signal.aborted).toBe(true);
    });
});
