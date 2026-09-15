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

/**
 * @jest-environment node
 *
 * Guards the tool-call input sanitizer. When a streamed tool call's JSON is invalid the AI SDK
 * keeps the raw text as a string on the `tool-call` part; when it parses but fails the tool's
 * schema, the parsed array/null/number is kept instead. Anthropic rejects every later request in
 * the thread with `tool_use.input: Input should be an object`. The sanitizer coerces such inputs
 * to objects in place — the parts are the chat store's own corrupt objects — and returns how many
 * it repaired.
 */

import type { AssistantModelMessage, ModelMessage, ToolCallPart } from "ai";
import {
    repairToolCallInputs,
    sanitizeMessages,
} from "../features/ai/agent/resilience/messageSanitization";

// The real bug shape: `"new_string">` (should be `":`) makes the input unparseable, so the SDK
// keeps it as a string on the tool-call part.
const MALFORMED_INPUT =
    '{"file_path": "types.bal", "edits": [{"old_string": "a", "new_string">"b"}]}';

function assistantCalling(toolName: string, input: unknown, toolCallId = "call_1"): AssistantModelMessage {
    return {
        role: "assistant",
        content: [
            { type: "text", text: "Editing the file." },
            { type: "tool-call", toolCallId, toolName, input },
        ],
    };
}

function toolCallAt(message: ModelMessage, index: number): ToolCallPart {
    if (message.role !== "assistant" || typeof message.content === "string") {
        throw new Error("expected an assistant message with parts");
    }
    const part = message.content[index];
    if (part.type !== "tool-call") {
        throw new Error(`expected a tool-call part at ${index}, got ${part.type}`);
    }
    return part;
}

describe("repairToolCallInputs", () => {
    it("coerces an unparseable string input to an empty object", () => {
        const messages = [assistantCalling("file_batch_edit", MALFORMED_INPUT)];

        expect(repairToolCallInputs(messages)).toBe(1);
        expect(toolCallAt(messages[0], 1).input).toEqual({});
    });

    it("parses a well-formed JSON string input into the object it represents", () => {
        const messages = [assistantCalling("t", '{"file_path":"main.bal","edits":[]}')];

        expect(repairToolCallInputs(messages)).toBe(1);
        expect(toolCallAt(messages[0], 1).input).toEqual({ file_path: "main.bal", edits: [] });
    });

    it("coerces a string truncated mid-JSON to {} (output-token cap on large writes)", () => {
        const messages = [
            assistantCalling("file_batch_edit", '{"file_path":"main.bal","content":"import ballerina/ht'),
        ];

        repairToolCallInputs(messages);
        expect(toolCallAt(messages[0], 1).input).toEqual({});
    });

    it.each([
        ["an empty string", ""],
        ["a JSON array string", "[1,2,3]"],
        ["an actual array, the SDK's shape when the JSON parsed but failed the schema", [1, 2]],
        ["null", null],
        ["a number", 42],
        ["undefined", undefined],
    ])("coerces %s to {}", (_label, input) => {
        const messages = [assistantCalling("t", input)];

        expect(repairToolCallInputs(messages)).toBe(1);
        expect(toolCallAt(messages[0], 1).input).toEqual({});
    });

    it("repairs the caller's own objects in place, healing every alias", () => {
        const shared = assistantCalling("file_batch_edit", MALFORMED_INPUT);
        // The chat store hands the same message object to more than one reader.
        const replayA = [shared];
        const replayB = [shared];

        repairToolCallInputs(replayA);

        expect(toolCallAt(shared, 1).input).toEqual({});
        expect(toolCallAt(replayB[0], 1).input).toEqual({});
    });

    it("leaves a valid object input untouched and is a no-op (returns 0)", () => {
        const original = { file_path: "main.bal", edits: [{ old_string: "a", new_string: "b" }] };
        const messages = [assistantCalling("t", original)];

        expect(repairToolCallInputs(messages)).toBe(0);
        expect(toolCallAt(messages[0], 1).input).toBe(original);
    });

    it("repairs malformed calls across messages and counts them", () => {
        const messages = [
            assistantCalling("t", MALFORMED_INPUT),
            { role: "user" as const, content: "continue" },
            assistantCalling("t", MALFORMED_INPUT, "call_2"),
        ];

        expect(repairToolCallInputs(messages)).toBe(2);
    });

    it("tolerates empty, missing and part-less input", () => {
        expect(repairToolCallInputs([])).toBe(0);
        expect(repairToolCallInputs(undefined)).toBe(0);
        expect(repairToolCallInputs(null)).toBe(0);
        expect(repairToolCallInputs([{ role: "user", content: "hi" }])).toBe(0);
        expect(repairToolCallInputs([{ role: "assistant", content: "plain text" }])).toBe(0);
    });

    it("leaves non-tool-call parts untouched", () => {
        const messages: ModelMessage[] = [
            {
                role: "assistant",
                content: [
                    { type: "text", text: "some string content" },
                    { type: "tool-call", toolCallId: "c", toolName: "t", input: "" },
                ],
            },
        ];

        repairToolCallInputs(messages);

        const first = (messages[0] as AssistantModelMessage).content[0];
        expect(first).toEqual({ type: "text", text: "some string content" });
    });
});

describe("sanitizeMessages", () => {
    it("repairs in place and returns the number of dropped calls", () => {
        const messages = [assistantCalling("t", MALFORMED_INPUT)];

        expect(sanitizeMessages(messages)).toBe(1);
        expect(toolCallAt(messages[0], 1).input).toEqual({});
    });

    it("returns 0 and touches nothing for a clean history", () => {
        const original = { ok: 1 };
        const messages = [assistantCalling("t", original)];

        expect(sanitizeMessages(messages)).toBe(0);
        expect(toolCallAt(messages[0], 1).input).toBe(original);
    });
});
