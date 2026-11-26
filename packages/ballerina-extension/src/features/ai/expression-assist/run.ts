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


import { ReadableStream } from "node:stream/web";
import { LanguageModelMiddleware, ToolSet, stepCountIs, streamText, wrapLanguageModel } from "ai";
import { ANTHROPIC_HAIKU, AnthropicModel, getAnthropicClient, getProviderCacheControl } from "../utils/ai-client";
import { untilAborted } from "../agent/console-summary";
import { toAIRequestError } from "../service/prompt-enhancement/promptEnhancement";
import { LOOKUP_TOOLS } from "./tools";

// Steps left when lookups close, so a run that keeps reading still submits and gets one repair.
const ANSWER_STEPS = 2;
// Answers start streaming within about a second; a call silent this long has stalled and is sent again.
const STALL_MS = 8_000;
const STALL_RETRIES = 2;
// Sonnet always thinks, and its thinking shares the output limit.
const SONNET_THINKING_TOKENS = 8000;
// Thinking counts as an answer: a model that thinks with hidden text sends no delta until it is done.
const ANSWERING = new Set(["text-delta", "tool-input-start", "tool-input-delta", "tool-call", "reasoning-start", "reasoning-delta", "finish", "error"]);

const active = new Map<string, AbortController>();

export function abortAssist(requestId: string): void {
    active.get(requestId)?.abort();
}

interface AssistTurn {
    system: string;
    prompt: string;
    tools: ToolSet;
    maxSteps: number;
    maxOutputTokens?: number;
    // Ends the loop early, e.g. on a clean compile or a refusal.
    done: () => boolean;
}

interface AssistRun<T> {
    requestId: string;
    timeoutMs: number;
    // Gathers the context; runs alongside the model client's setup.
    prepare: () => Promise<AssistTurn>;
    // Reads what the tools recorded once the loop stops.
    finish: () => T;
    // Log line: what ran and how it ended.
    describe: () => string;
    // Haiku unless the caller escalates.
    model?: AnthropicModel;
}

// Haiku answers through a forced tool call at temperature 0; Sonnet always thinks, which rules out both.
function callSettings(modelId: AnthropicModel, maxOutputTokens: number) {
    return modelId === ANTHROPIC_HAIKU
        ? { toolChoice: "required" as const, maxOutputTokens, temperature: 0 }
        : { toolChoice: "auto" as const, maxOutputTokens: maxOutputTokens + SONNET_THINKING_TOKENS, providerOptions: { anthropic: { effort: "medium" } } };
}

// Restarts a model call that has not started answering within `ms`, so a provider stall does not use up the whole run.
export function stallGuard(ms: number, retries: number): LanguageModelMiddleware {
    return {
        specificationVersion: "v3",
        wrapStream: async ({ params, model }) => {
            for (let attempt = 0; ; attempt++) {
                const controller = new AbortController();
                const stop = () => controller.abort();
                params.abortSignal?.addEventListener("abort", stop, { once: true });
                const timer = setTimeout(stop, ms);
                try {
                    const result = await model.doStream({ ...params, abortSignal: controller.signal });
                    const reader = result.stream.getReader();
                    const head: Awaited<ReturnType<typeof reader.read>>["value"][] = [];
                    for (let read = await reader.read(); !read.done; read = await reader.read()) {
                        head.push(read.value);
                        if (ANSWERING.has(read.value.type)) {
                            break;
                        }
                    }
                    clearTimeout(timer);
                    const stream = new ReadableStream({
                        start: (sink) => head.forEach((part) => sink.enqueue(part)),
                        pull: async (sink) => {
                            const read = await reader.read();
                            read.done ? sink.close() : sink.enqueue(read.value);
                        },
                        cancel: (reason) => reader.cancel(reason),
                    });
                    return { ...result, stream: stream as unknown as typeof result.stream };
                } catch (error) {
                    clearTimeout(timer);
                    params.abortSignal?.removeEventListener("abort", stop);
                    if (params.abortSignal?.aborted || !controller.signal.aborted || attempt >= retries) {
                        throw error;
                    }
                    console.warn(`[ExpressionAssist] no answer after ${ms} ms; sending the call again`);
                }
            }
        },
    };
}

type RunSteps = Awaited<ReturnType<typeof streamText>["steps"]>;
type RunUsage = Awaited<ReturnType<typeof streamText>["totalUsage"]>;

// shortcut: dev-only trace for the injected Copilot debug view and the eval; remove before shipping.
function devTrace(turn: AssistTurn, steps: RunSteps, usage: RunUsage | undefined, model: AnthropicModel) {
    const tokens = usage?.inputTokenDetails;
    return {
        system: turn.system,
        prompt: turn.prompt,
        steps: steps.map((step) => ({ calls: step.toolCalls.map(({ toolName, input }) => ({ toolName, input })), results: step.toolResults.map(({ toolName, output }) => ({ toolName, output })) })),
        model,
        usage: { input: usage?.inputTokens, output: usage?.outputTokens, cacheRead: tokens?.cacheReadTokens, cacheWrite: tokens?.cacheWriteTokens },
    };
}

// One tool-calling loop with a timeout and an abort handle; the tools record the result and `finish` reads it.
export async function runAssist<T extends { error?: string }>({ requestId, timeoutMs, prepare, finish, describe, model: modelId = ANTHROPIC_HAIKU }: AssistRun<T>): Promise<T> {
    const controller = new AbortController();
    active.set(requestId, controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
        const [model, turn] = await Promise.all([untilAborted(getAnthropicClient(modelId), controller.signal), prepare()]);
        let failure: unknown;
        const result = streamText({
            model: wrapLanguageModel({ model, middleware: stallGuard(STALL_MS, STALL_RETRIES) }),
            system: { role: "system", content: turn.system, providerOptions: getProviderCacheControl() },
            messages: [{ role: "user", content: turn.prompt }],
            tools: turn.tools,
            ...callSettings(modelId, turn.maxOutputTokens ?? 1024),
            stopWhen: [stepCountIs(turn.maxSteps), turn.done],
            prepareStep: ({ stepNumber }) => stepNumber < turn.maxSteps - ANSWER_STEPS ? {}
                : { activeTools: Object.keys(turn.tools).filter((name) => !LOOKUP_TOOLS.includes(name)) },
            maxRetries: 0,
            abortSignal: controller.signal,
            onError: ({ error }) => {
                failure = error;
            },
        });
        await result.consumeStream();
        // A stop or timeout ends the stream without an error.
        if (failure || controller.signal.aborted) {
            throw failure ?? new Error("aborted");
        }
        const [steps, usage] = await Promise.all([result.steps, result.totalUsage]);
        return { ...finish(), ...(process.env.WEB_VIEW_DEV_HOST ? { trace: devTrace(turn, steps, usage, modelId) } : {}) };
    } catch (error) {
        if (controller.signal.aborted) {
            const timedOut = Date.now() - started >= timeoutMs;
            if (timedOut) {
                console.warn(`[ExpressionAssist] ${describe()} timed out after ${timeoutMs} ms`);
            }
            return { error: timedOut ? "This took too long. Try again." : undefined } as T;
        }
        console.error(`[ExpressionAssist] ${describe()} failed`, error);
        return { error: toAIRequestError(error, "Couldn't reach the AI service. Please try again.").message } as T;
    } finally {
        clearTimeout(timer);
        active.delete(requestId);
    }
}
