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
 * Subagent persistence and resume validation. A wrong file layout or a resume that loads the wrong
 * conversation fails silently at runtime (the model sees a plausible history), so the round trip and
 * the three rejection paths are pinned here.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    getSubagentDir,
    loadSubagentHistory,
    loadSubagentMetadata,
    saveSubagentRun,
    SubagentNotFoundError,
} from "../features/ai/agent/subagents/store";
import { validateResume } from "../features/ai/agent/subagents/resume";
import { registerBackgroundSubagent, resetBackgroundSubagentsForTests } from "../features/ai/agent/subagents/background";
import { generateSubagentId, isSubagentId } from "../features/ai/agent/subagents/types";

let threadDir: string;
beforeEach(() => { threadDir = fs.mkdtempSync(path.join(os.tmpdir(), "subagent-store-")); resetBackgroundSubagentsForTests(); });
afterEach(() => { fs.rmSync(threadDir, { recursive: true, force: true }); resetBackgroundSubagentsForTests(); });

describe("ids", () => {
    it("generates task-subagent-<8 hex> ids", () => {
        const id = generateSubagentId();
        expect(isSubagentId(id)).toBe(true);
        expect(isSubagentId("task-subagent-xyz")).toBe(false);
        expect(isSubagentId("librarian-12345678")).toBe(false);
    });
});

describe("store", () => {
    it("round-trips history as JSONL and metadata as JSON under threads/<id>/subagents/<taskId>", () => {
        const id = generateSubagentId();
        const messages = [
            { role: "user", content: "Find Kafka" },
            { role: "assistant", content: [{ type: "text", text: "## Libraries\n- ballerinax/kafka" }] },
        ] as any[];
        saveSubagentRun(threadDir, id, { subagentType: "Librarian", description: "Kafka lookup", messages });

        const dir = getSubagentDir(threadDir, id);
        expect(dir).toBe(path.join(threadDir, "subagents", id));
        expect(fs.readFileSync(path.join(dir, "history.jsonl"), "utf8").trim().split("\n")).toHaveLength(2);
        expect(loadSubagentHistory(threadDir, id)).toEqual(messages);
        const meta = loadSubagentMetadata(threadDir, id)!;
        expect(meta.subagentType).toBe("Librarian");
        expect(meta.description).toBe("Kafka lookup");
        expect(new Date(meta.createdAt).getTime()).toBeGreaterThan(0);
    });

    it("keeps createdAt across a resave (resume overwrites the history, not the origin)", () => {
        const id = generateSubagentId();
        saveSubagentRun(threadDir, id, { subagentType: "Librarian", description: "a", messages: [{ role: "user", content: "1" }] });
        const first = loadSubagentMetadata(threadDir, id)!.createdAt;
        saveSubagentRun(threadDir, id, { subagentType: "Librarian", description: "a", messages: [{ role: "user", content: "1" }, { role: "assistant", content: "2" }] });
        expect(loadSubagentMetadata(threadDir, id)!.createdAt).toBe(first);
        expect(loadSubagentHistory(threadDir, id)).toHaveLength(2);
    });

    it("throws SubagentNotFoundError for an unknown id and returns null metadata", () => {
        expect(() => loadSubagentHistory(threadDir, "task-subagent-deadbeef")).toThrow(SubagentNotFoundError);
        expect(loadSubagentMetadata(threadDir, "task-subagent-deadbeef")).toBeNull();
    });
});

describe("validateResume", () => {
    it("loads the history when the type matches", () => {
        const id = generateSubagentId();
        saveSubagentRun(threadDir, id, { subagentType: "Librarian", description: "d", messages: [{ role: "user", content: "q" }] });
        const v = validateResume(threadDir, id, "Librarian");
        expect(v.kind).toBe("ok");
        if (v.kind === "ok") {
            expect(v.messages).toHaveLength(1);
            expect(v.description).toBe("d");
        }
    });

    it("rejects a type mismatch and names the right type", () => {
        const id = generateSubagentId();
        saveSubagentRun(threadDir, id, { subagentType: "LibraryResearcher", description: "d", messages: [] });
        const v = validateResume(threadDir, id, "Librarian");
        expect(v.kind).toBe("error");
        if (v.kind === "error") {
            expect(v.error).toBe("SUBAGENT_TYPE_MISMATCH");
            expect(v.message).toContain("subagent_type=LibraryResearcher");
        }
    });

    it("rejects an unknown id", () => {
        const v = validateResume(threadDir, "task-subagent-00000000", "Librarian");
        expect(v.kind).toBe("error");
        if (v.kind === "error") { expect(v.error).toBe("SUBAGENT_NOT_FOUND"); }
    });

    it("rejects a task that is still running in the background", () => {
        const id = generateSubagentId();
        registerBackgroundSubagent({
            id, subagentType: "Librarian", description: "bg", runKey: "r", toolCallId: "c", startTime: new Date(),
            output: "", completed: false, success: null, aborted: false, abortController: new AbortController(), notified: false,
        });
        const v = validateResume(threadDir, id, "Librarian");
        expect(v.kind).toBe("error");
        if (v.kind === "error") {
            expect(v.error).toBe("SUBAGENT_STILL_RUNNING");
            expect(v.message).toContain("task_output");
        }
    });
});
