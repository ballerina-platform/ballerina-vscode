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

import { ChatNotify } from "@wso2/ballerina-core";
import { RunEventStore } from "../features/ai/utils/run-event-store";

describe("RunEventStore", () => {
    it("INVARIANT: attributes events only to their explicit run identity", () => {
        const store = new RunEventStore();
        store.beginRun("/workspace-a", "thread-a", "generation-a");
        store.beginRun("/workspace-b", "thread-b", "generation-b");

        const eventA = store.stamp("/workspace-a", "thread-a", "generation-a", {
            type: "content_block",
            content: "A",
        });
        const eventB = store.stamp("/workspace-b", "thread-b", "generation-b", {
            type: "content_block",
            content: "B",
        });
        const stale = store.stamp("/workspace-a", "thread-a", "old-generation", {
            type: "content_block",
            content: "stale",
        });

        expect(eventA).toMatchObject({ seq: 1, generationId: "generation-a" });
        expect(eventB).toMatchObject({ seq: 1, generationId: "generation-b" });
        expect(stale.seq).toBeUndefined();
        expect(store.getRunStatus("/workspace-a", "thread-a").events).toHaveLength(1);
        expect(store.getRunStatus("/workspace-b", "thread-b").events).toHaveLength(1);
    });

    it("coalesces adjacent text while returning an exact polling delta", () => {
        const store = new RunEventStore();
        store.beginRun("/workspace", "thread", "generation");
        store.stamp("/workspace", "thread", "generation", { type: "content_block", content: "one" });
        store.stamp("/workspace", "thread", "generation", { type: "content_block", content: "-two" });
        store.stamp("/workspace", "thread", "generation", {
            type: "tool_call",
            toolName: "Read",
            toolCallId: "tool-1",
        });

        expect(store.getRunStatus("/workspace", "thread").events).toEqual([
            expect.objectContaining({ type: "content_block", content: "one-two", seq: 2 }),
            expect.objectContaining({ type: "tool_call", seq: 3 }),
        ]);
        expect(store.getRunStatus("/workspace", "thread", 1).events).toEqual([
            expect.objectContaining({ type: "content_block", content: "-two", seq: 2 }),
            expect.objectContaining({ type: "tool_call", seq: 3 }),
        ]);
        expect(store.getRunStatus("/workspace", "thread", 2).events).toEqual([
            expect.objectContaining({ type: "tool_call", seq: 3 }),
        ]);
    });

    it("keeps startup events when the executor re-registers the same run", () => {
        const store = new RunEventStore();
        store.beginRun("/workspace", "thread", "generation");
        store.stamp("/workspace", "thread", "generation", { type: "content_block", content: "startup" });

        store.beginRun("/workspace", "thread", "generation");

        expect(store.getRunStatus("/workspace", "thread").events).toEqual([
            expect.objectContaining({ type: "content_block", content: "startup", seq: 1 }),
        ]);
    });

    it("does not let a stale completion or clear mutate a replacement run", () => {
        const store = new RunEventStore();
        store.beginRun("/workspace", "thread", "generation-1");
        store.beginRun("/workspace", "thread", "generation-2");
        store.stamp("/workspace", "thread", "generation-2", { type: "content_block", content: "new" });

        store.endRun("/workspace", "thread", "generation-1");
        store.clearBuffer("/workspace", "thread", "generation-1");

        const status = store.getRunStatus("/workspace", "thread");
        expect(status.isRunning).toBe(true);
        expect(status.generationId).toBe("generation-2");
        expect(status.events).toHaveLength(1);
    });

    it("marks eviction as truncated instead of presenting the retained tail as complete", () => {
        const store = new RunEventStore({ maxEvents: 2, maxBytes: 1024 * 1024, maxRuns: 20 });
        store.beginRun("/workspace", "thread", "generation");

        const structuralEvents: ChatNotify[] = [
            { type: "start" },
            { type: "tool_call", toolName: "Read", toolCallId: "tool-1" },
            { type: "tool_result", toolName: "Read", toolCallId: "tool-1" },
        ];
        for (const event of structuralEvents) {
            store.stamp("/workspace", "thread", "generation", event);
        }

        const status = store.getRunStatus("/workspace", "thread");
        expect(status.truncated).toBe(true);
        expect(status.events).toHaveLength(2);
        expect(status.events[0].seq).toBe(2);
    });
});
