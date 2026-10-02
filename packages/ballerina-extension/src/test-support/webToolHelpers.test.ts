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

import { answerText, formatReaderAnswer, readerCalledATool, retryOnce, webFetchFailure } from "../features/ai/agent/tools/web-tool-helpers";

describe("web tool helpers", () => {
    it("counts a direct web_fetch call as a fetch", () => {
        expect(readerCalledATool([{ toolCalls: [{ toolName: "web_fetch" }], content: [{ type: "text" }] }])).toBe(true);
    });

    it("counts a tool result without a matching call, as dynamic filtering can return", () => {
        expect(readerCalledATool([{ toolCalls: [], content: [{ type: "tool-result" }, { type: "text" }] }])).toBe(true);
        expect(readerCalledATool([{ content: [{ type: "tool-error" }] }])).toBe(true);
    });

    it("treats a text-only answer as not fetched", () => {
        expect(readerCalledATool([{ toolCalls: [], content: [{ type: "reasoning" }, { type: "text" }] }])).toBe(false);
        expect(readerCalledATool([])).toBe(false);
        expect(readerCalledATool(undefined)).toBe(false);
    });

    it("returns an answer under its source URL", () => {
        expect(formatReaderAnswer("https://example.com", "  2201.13.6\n", "stop"))
            .toEqual({ output: "Source: https://example.com\n\n2201.13.6", failed: false });
    });

    it("marks the reader's fetch failure as a failed tool call", () => {
        expect(formatReaderAnswer("https://example.com", "Fetch failed: url_not_accessible (HTTP 404)", "stop"))
            .toEqual({ output: "Web fetch failed for https://example.com: url_not_accessible (HTTP 404)", failed: true });
    });

    it("marks an empty answer as a failure", () => {
        expect(formatReaderAnswer("https://example.com", "   ", "stop").failed).toBe(true);
    });

    it("says when the answer was cut off at the output limit", () => {
        const { output, failed } = formatReaderAnswer("https://example.com", "Partial", "length");
        expect(failed).toBe(false);
        expect(output).toBe("Source: https://example.com\n\nPartial\n\n(The answer was cut off at the reader's output limit.)");
    });

    // The part order of a live web_search_20260209 call: notes between code-execution calls, then the answer.
    const dynamicFilteringStep = {
        content: [
            { type: "tool-call" }, { type: "tool-call" }, { type: "tool-result" }, { type: "source" }, { type: "tool-result" },
            { type: "text", text: "Result is a string; parse it." },
            { type: "tool-call" }, { type: "tool-result" }, { type: "reasoning" },
            { type: "tool-call" }, { type: "tool-result" }, { type: "source" }, { type: "tool-result" },
            { type: "text", text: "**Ballerina 2201.13.0**" }, { type: "text", text: " is the latest update." },
        ],
    };

    it("answers with the text after the last tool part, dropping the notes between calls", () => {
        expect(answerText([dynamicFilteringStep])).toBe("**Ballerina 2201.13.0** is the latest update.");
    });

    it("has no answer when the step ends on a tool part, so notes before it are not passed off as one", () => {
        const step = { content: [{ type: "text", text: "Partial note." }, { type: "tool-call" }, { type: "tool-result" }] };
        expect(answerText([step])).toBe("");
        expect(formatReaderAnswer("https://example.com", answerText([step]), "length").failed).toBe(true);
    });

    it("reads the last step and handles a run with no tools or no steps", () => {
        expect(answerText([{ content: [{ type: "text", text: "old" }] }, { content: [{ type: "text", text: "Answer." }] }])).toBe("Answer.");
        expect(answerText([])).toBe("");
        expect(answerText(undefined)).toBe("");
    });

    describe("webFetchFailure", () => {
        const fetched = { type: "tool-result", toolName: "web_fetch", output: { type: "web_fetch_result", url: "https://example.com" } };
        const thrown = { type: "tool-error", toolName: "web_fetch", error: { type: "web_fetch_tool_result_error", errorCode: "url_not_accessible" } };
        const reported = { type: "tool-result", toolName: "web_fetch", output: { type: "web_fetch_tool_result_error", errorCode: "too_many_requests" } };

        it("reports the error codes when every fetch failed", () => {
            expect(webFetchFailure([{ content: [{ type: "tool-call" }, thrown, reported, { type: "text", text: "The page seems down." }] }]))
                .toBe("url_not_accessible, too_many_requests");
        });

        it("lets a later successful fetch recover from an earlier failure", () => {
            expect(webFetchFailure([{ content: [thrown, fetched, { type: "text", text: "Answer." }] }])).toBeUndefined();
        });

        it("leaves runs without a web_fetch result to the reader's text", () => {
            expect(webFetchFailure([{ content: [{ type: "tool-result", toolName: "code_execution" }, { type: "text", text: "x" }] }])).toBeUndefined();
            expect(webFetchFailure(undefined)).toBeUndefined();
        });
    });

    describe("retryOnce", () => {
        it("does not retry when the first attempt returns a result", async () => {
            const attempt = jest.fn().mockResolvedValueOnce("fetched");
            await expect(retryOnce(attempt)).resolves.toBe("fetched");
            expect(attempt).toHaveBeenCalledTimes(1);
        });

        it("retries once when the first attempt returns nothing", async () => {
            const attempt = jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce("fetched");
            await expect(retryOnce(attempt)).resolves.toBe("fetched");
            expect(attempt).toHaveBeenCalledTimes(2);
        });

        it("returns nothing after two empty attempts, without a third", async () => {
            const attempt = jest.fn().mockResolvedValue(undefined);
            await expect(retryOnce(attempt)).resolves.toBeUndefined();
            expect(attempt).toHaveBeenCalledTimes(2);
        });
    });
});
