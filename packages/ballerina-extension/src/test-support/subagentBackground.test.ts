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

import type { BackgroundSubagent } from "../features/ai/agent/subagents/types";
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
    it("appends the reminder to string results and attaches it to object results", async () => {
        registerBackgroundSubagent(entry("s", { completed: true, success: true }));
        const stringTool = withBackgroundNotifications({ description: "d", inputSchema: {} as any, execute: async () => "ok" } as any, "run-a");
        const out = await stringTool.execute!({}, {} as any);
        expect(out).toMatch(/^ok\n\n<system-reminder>/);

        registerBackgroundSubagent(entry("o", { completed: true, success: true }));
        const objectTool = withBackgroundNotifications({ description: "d", inputSchema: {} as any, execute: async () => ({ status: "done" }) } as any, "run-a");
        const obj = await objectTool.execute!({}, {} as any) as any;
        expect(obj.status).toBe("done");
        expect(obj.system_reminder).toMatch(/^<system-reminder>/);
    });

    it("leaves results untouched when nothing completed, and skips tools without execute", async () => {
        const t = withBackgroundNotifications({ description: "d", inputSchema: {} as any, execute: async () => "plain" } as any, "run-a");
        expect(await t.execute!({}, {} as any)).toBe("plain");
        const noExec = { description: "provider tool", inputSchema: {} as any } as any;
        expect(withBackgroundNotifications(noExec, "run-a")).toBe(noExec);
    });
});
