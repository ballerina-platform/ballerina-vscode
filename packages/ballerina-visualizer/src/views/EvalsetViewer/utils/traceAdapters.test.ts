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

// L2 / C12: the data layer behind the evalset editor. The editor shows every message in a
// text box, so a message that is really an object has to survive a round trip through that
// box unchanged. These are the functions that decide whether it does, and whether an edit
// mutates the thread the user has not saved yet.

import {
    cloneEvalThread,
    deserializeContent,
    getContentType,
    getToolCallsFromTrace,
    updateToolCallsInTrace,
    serializeContent,
    updateTraceAgentOutput,
    updateTraceUserMessage,
} from "./traceAdapters";

const trace = (overrides: Record<string, unknown> = {}) =>
    ({
        id: "trace_1",
        userMessage: { role: "user", content: "hello" },
        output: { role: "assistant", content: "hi" },
        tools: [],
        iterations: [],
        startTime: "2026-01-01T00:00:00.000Z",
        endTime: "2026-01-01T00:00:00.000Z",
        ...overrides,
    }) as any;

describe("content round-trips through the editor box", () => {
    // The editor only ever hands back a string, so the original type is what tells
    // deserialize whether to parse it. Losing that turns a structured payload into a blob.
    it.each([
        ["plain text", "just text"],
        ["text that looks like JSON but is not", "{not json"],
        ["an empty string", ""],
    ])("leaves %s as a string", (_label, content) => {
        const type = getContentType(content);

        expect(type).toBe("string");
        expect(deserializeContent(serializeContent(content), type)).toBe(content);
    });

    it.each([
        ["an object", { id: 1, nested: { ok: true } }],
        ["an array", [1, 2, 3]],
    ])("restores %s to its original shape", (_label, content) => {
        const type = getContentType(content);

        expect(type).toBe("object");
        expect(deserializeContent(serializeContent(content), type)).toEqual(content);
    });

    it("serialises objects readably, so the editor box is not one long line", () => {
        expect(serializeContent({ id: 1 })).toContain("\n");
    });

    // Someone can break the JSON while typing. Returning the raw string keeps their text
    // rather than throwing it away, which matters because this runs as they edit.
    it("keeps the typed text when an edited object no longer parses", () => {
        const errors = jest.spyOn(console, "error").mockImplementation(() => undefined);

        expect(deserializeContent("{ id: ", "object")).toBe("{ id: ");

        errors.mockRestore();
    });
});

describe("editing a trace", () => {
    it("replaces the user message and the agent output", () => {
        expect(updateTraceUserMessage(trace(), "edited").userMessage.content).toBe("edited");
        expect(updateTraceAgentOutput(trace(), "edited").output.content).toBe("edited");
    });

    // The editor keeps an unsaved copy. If these mutated in place, discarding the edit would
    // leave the original already changed.
    it.each([
        ["updateTraceUserMessage", updateTraceUserMessage],
        ["updateTraceAgentOutput", updateTraceAgentOutput],
    ])("%s leaves the original trace untouched", (_label, update) => {
        const original = trace();

        const updated = update(original, "edited");

        expect(updated).not.toBe(original);
        expect(original.userMessage.content).toBe("hello");
        expect(original.output.content).toBe("hi");
    });

    it("clones a thread deeply enough that editing the copy cannot reach the original", () => {
        const original = { id: "t1", traces: [trace()] } as any;

        const copy = cloneEvalThread(original);
        copy.traces[0].userMessage.content = "edited";

        expect(original.traces[0].userMessage.content).toBe("hello");
    });
});

describe("tool calls on a trace", () => {
    it("returns an empty list for a trace that records none", () => {
        expect(getToolCallsFromTrace(trace())).toEqual([]);
    });

    it("returns the recorded calls", () => {
        const withCalls = trace({ toolCalls: [{ name: "lookup" }, { name: "charge" }] });

        expect(getToolCallsFromTrace(withCalls).map((c) => c.name)).toEqual(["lookup", "charge"]);
    });

    it("writes calls onto a copy, leaving the original alone", () => {
        const original = trace();

        const updated = updateToolCallsInTrace(original, [{ name: "lookup" }] as never);

        expect(getToolCallsFromTrace(updated).map((c) => c.name)).toEqual(["lookup"]);
        expect(getToolCallsFromTrace(original)).toEqual([]);
    });

    // Removing every call drops the key rather than leaving an empty array, so a trace edited
    // back to having none serialises the same as one that never had any.
    it("removes the key entirely when the last call is deleted", () => {
        const withCalls = trace({ toolCalls: [{ name: "lookup" }] });

        expect(updateToolCallsInTrace(withCalls, [])).not.toHaveProperty("toolCalls");
    });
});
