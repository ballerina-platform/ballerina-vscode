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
 * The loop every subagent type runs: one `generateText` call with the type's system prompt and tools,
 * the main run's abort signal, and the conversation shaping that makes `resume` work.
 */

import { generateText, ModelMessage, stepCountIs } from "ai";
import { buildSubagentMessages, collectResponseMessages } from "./messages";
import { addCacheControlToMessages, AnthropicEffort, ANTHROPIC_HAIKU, ANTHROPIC_SONNET, getAnthropicClient, getProviderCacheControl } from "../../utils/ai-client";
import { emitModelUsage } from "../../utils/events";
import { getSubagentDefinition } from "./definitions";
import { describeSubagentStep, SubagentProgress } from "./progress";
import { SubagentModel, SubagentResult, SubagentRunContext, SubagentType } from "./types";

/** Runaway guard only — the prompt is what keeps a lookup short. Same ceiling as the main agent loop. */
export const SUBAGENT_MAX_STEPS = 50;
/** Sonnet 5 thinks by default and thinking counts against this; the prompt caps the report far lower. */
export const SUBAGENT_MAX_OUTPUT_TOKENS = 16_000;

/**
 * Optional thinking configuration. Sonnet 5 runs adaptive thinking whether or not this is set; the API's
 * default `display` is "omitted" (reasoning parts arrive with empty text, measured 2026-09-11).
 * `display: "summarized"` returns a readable summary — same thinking, same billing, visible text —
 * and `effort` trades depth for speed. Anthropic/Vertex only; Bedrock ignores the `anthropic` namespace.
 */
export interface SubagentReasoningOptions {
    display?: "summarized" | "omitted";
    effort?: AnthropicEffort;
}

export interface RunSubagentParams {
    type: SubagentType;
    prompt: string;
    model: SubagentModel;
    previousMessages?: ModelMessage[];
    abortSignal?: AbortSignal;
    ctx: SubagentRunContext;
    reasoning?: SubagentReasoningOptions;
    /** Called after every step that made tool calls, so the caller can show what the subagent is doing. */
    onProgress?: (progress: SubagentProgress) => void;
}

export function buildReasoningProviderOptions(reasoning: SubagentReasoningOptions | undefined) {
    if (!reasoning || (!reasoning.display && !reasoning.effort)) { return undefined; }
    return {
        anthropic: {
            thinking: { type: "adaptive" as const, ...(reasoning.display ? { display: reasoning.display } : {}) },
            ...(reasoning.effort ? { effort: reasoning.effort } : {}),
        },
    };
}

export async function runSubagent(params: RunSubagentParams): Promise<SubagentResult> {
    const definition = getSubagentDefinition(params.type);
    const modelId = params.model === "haiku" ? ANTHROPIC_HAIKU : ANTHROPIC_SONNET;
    const [model, cacheControl] = await Promise.all([getAnthropicClient(modelId), getProviderCacheControl()]);

    const conversation = buildSubagentMessages(params.prompt, params.previousMessages, definition.followUpHint);
    const messages: ModelMessage[] = [
        { role: "system", content: definition.system(params.ctx), providerOptions: cacheControl },
        ...conversation,
    ];

    const started = Date.now();
    let stepCount = 0;
    const onProgress = params.onProgress;
    const result = await generateText({
        model,
        messages,
        tools: definition.buildTools(params.ctx),
        stopWhen: stepCountIs(SUBAGENT_MAX_STEPS),
        maxOutputTokens: SUBAGENT_MAX_OUTPUT_TOKENS,
        abortSignal: params.abortSignal,
        providerOptions: buildReasoningProviderOptions(params.reasoning),
        // The final step (report text, no tool calls) is followed at once by the completion result, so
        // only steps that called tools are worth announcing.
        onStepFinish: onProgress ? (step) => {
            stepCount++;
            const calls = step.toolCalls.map(c => ({ toolName: c.toolName, input: (c as { input?: unknown }).input }));
            if (calls.length > 0) { onProgress(describeSubagentStep(calls, stepCount)); }
        } : undefined,
        // Same incremental caching as the main loop: mark the last message each step so the growing
        // prefix (system + earlier doc reads) is served from cache instead of re-billed every step.
        prepareStep: async ({ messages: stepMessages }) => ({
            messages: addCacheControlToMessages({ messages: stepMessages, model, providerOptions: cacheControl as any }),
        }),
    });

    const usage = result.totalUsage ?? result.usage;
    emitModelUsage(params.ctx.eventHandler, [{
        model: modelId,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
    }], params.ctx.toolModelUsage);

    console.log(`[Subagent:${params.type}] done in ${(Date.now() - started) / 1000}s, ${result.steps.length} step(s), ${result.text.length} chars`);

    return {
        text: result.text,
        messages: [...conversation, ...collectResponseMessages(result)],
        usage,
    };
}
