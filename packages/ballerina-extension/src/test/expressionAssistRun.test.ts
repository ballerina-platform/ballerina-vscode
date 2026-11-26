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

import { tool } from "ai";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { z } from "zod";
import { ReadableStream } from "node:stream/web";

const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
let mockCalls = 0;
// The first step calls a tool; the user stops the run while the second step waits for the model.
const mockModel = new MockLanguageModelV3({
    doStream: async () => {
        if (mockCalls++ > 0) {
            setTimeout(() => abortAssist("stop"), 10);
        }
        return {
            stream: simulateReadableStream({
                initialDelayInMs: mockCalls > 1 ? 500 : 0,
                chunks: [
                    { type: "stream-start", warnings: [] },
                    { type: "tool-call", toolCallId: String(mockCalls), toolName: "look", input: "{}" },
                    { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_use" }, usage },
                ] as any[],
            }),
        };
    },
});

jest.mock("../features/ai/utils/ai-client", () => ({
    ANTHROPIC_HAIKU: "haiku",
    getAnthropicClient: async () => mockModel,
    getProviderCacheControl: () => undefined,
}));
jest.mock("../features/ai/agent/console-summary", () => ({ untilAborted: (promise: Promise<unknown>) => promise }));
jest.mock("../features/ai/service/prompt-enhancement/promptEnhancement", () => ({ toAIRequestError: (error: Error) => error }));
jest.mock("../features/ai/expression-assist/tools", () => ({ LOOKUP_TOOLS: [] }));

import { abortAssist, firstCameCloser, runAssist, stallGuard } from "../features/ai/expression-assist/run";

describe("runAssist", () => {
    it("treats a stop after a finished step as a stop, not a finished run", async () => {
        const finish = jest.fn(() => ({}));
        const result = await runAssist<{ error?: string }>({
            requestId: "stop",
            timeoutMs: 10_000,
            describe: () => "test",
            finish,
            prepare: async () => ({
                system: "",
                prompt: "",
                maxSteps: 5,
                done: () => false,
                tools: { look: tool({ inputSchema: z.object({}), execute: async () => "ok" }) },
            }),
        });
        expect(finish).not.toHaveBeenCalled();
        expect(result.error).toBeUndefined();
    });
});

type Part = { type: string; delta?: string };

// A provider stream that sends `parts`, then hangs until the call is aborted, as a stalled request does.
function stream(parts: Part[], signal: AbortSignal, hangAfter = false) {
    return new ReadableStream<Part>({
        start(sink) {
            parts.forEach((part) => sink.enqueue(part));
            if (!hangAfter) {
                sink.close();
                return;
            }
            signal.addEventListener("abort", () => sink.error(new Error("aborted")));
        },
    });
}

const hanging = (signal: AbortSignal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
const ANSWER: Part[] = [{ type: "stream-start" }, { type: "text-delta", delta: "ok" }, { type: "finish" }];

async function readAll(result: any): Promise<string[]> {
    const parts: string[] = [];
    const reader = result.stream.getReader();
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
        parts.push(read.value.type);
    }
    return parts;
}

function run(calls: ((signal: AbortSignal) => any)[], retries = 2) {
    let call = 0;
    const model = { doStream: jest.fn(async ({ abortSignal }) => calls[call++](abortSignal)) };
    const wrapped = stallGuard(30, retries).wrapStream!({ params: {} as any, model: model as any, doGenerate: jest.fn(), doStream: jest.fn() } as any);
    return { wrapped, model };
}

describe("stallGuard", () => {
    it("passes a prompt answer through without a restart", async () => {
        const { wrapped, model } = run([(signal) => ({ stream: stream(ANSWER, signal) })]);
        expect(await readAll(await wrapped)).toEqual(["stream-start", "text-delta", "finish"]);
        expect(model.doStream).toHaveBeenCalledTimes(1);
    });

    it("restarts a call that never answers", async () => {
        const { wrapped, model } = run([hanging, (signal) => ({ stream: stream(ANSWER, signal) })]);
        expect(await readAll(await wrapped)).toEqual(["stream-start", "text-delta", "finish"]);
        expect(model.doStream).toHaveBeenCalledTimes(2);
    });

    it("restarts a stream that opens but sends no answer", async () => {
        const { wrapped, model } = run([
            (signal) => ({ stream: stream([{ type: "stream-start" }], signal, true) }),
            (signal) => ({ stream: stream(ANSWER, signal) }),
        ]);
        expect(await readAll(await wrapped)).toContain("text-delta");
        expect(model.doStream).toHaveBeenCalledTimes(2);
    });

    it("gives up after its retries", async () => {
        const { wrapped, model } = run([hanging, hanging], 1);
        await expect(wrapped).rejects.toThrow("aborted");
        expect(model.doStream).toHaveBeenCalledTimes(2);
    });
});

describe("firstCameCloser", () => {
    const run = (verified: boolean, errors?: string[]) => ({ verified, best: errors && { errors } });

    it("keeps the first run when the stronger model came back with more errors or nothing", () => {
        expect(firstCameCloser(run(false, ["a"]), run(false, ["a", "b"]))).toBe(true);
        expect(firstCameCloser(run(false, ["a"]), run(false))).toBe(true);
    });

    it("answers with the stronger model when it compiled, did as well, or the first had nothing", () => {
        expect(firstCameCloser(run(false, ["a"]), run(true, []))).toBe(false);
        expect(firstCameCloser(run(false, ["a"]), run(false, ["b"]))).toBe(false);
        expect(firstCameCloser(run(false), run(false, ["b"]))).toBe(false);
    });
});
