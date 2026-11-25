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
    getProviderCacheControl: async () => undefined,
}));
jest.mock("../features/ai/agent/console-summary", () => ({ untilAborted: (promise: Promise<unknown>) => promise }));
jest.mock("../features/ai/service/prompt-enhancement/promptEnhancement", () => ({ toAIRequestError: (error: Error) => error }));
jest.mock("../features/ai/expression-assist/tools", () => ({ LOOKUP_TOOLS: [] }));

import { abortAssist, runAssist } from "../features/ai/expression-assist/run";

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
