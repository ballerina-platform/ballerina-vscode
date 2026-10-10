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
 * Thinking and effort options for Claude Sonnet and Claude Haiku calls, kept apart from ai-client.ts so
 * Jest can load them: ai-client pulls in vscode and auth, and the `@wso2/ballerina-core` barrel drags in
 * the ESM-only `vscode-ws-jsonrpc`, so callers pass whether the login method is Bedrock rather than the enum.
 */

export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * `summarized` returns readable reasoning summaries and the progress notes the model writes between
 * tool calls; `omitted` (the API default) streams thinking blocks with empty text. Thinking happens and
 * is billed the same either way.
 */
export type ThinkingDisplay = 'summarized' | 'omitted';

export type ProviderModelOptions =
    | { anthropic: { thinking: { type: 'adaptive'; display?: ThinkingDisplay }; effort: AnthropicEffort } }
    | { bedrock: { reasoningConfig: { type: 'adaptive'; display?: ThinkingDisplay; maxReasoningEffort: AnthropicEffort } } };

export type HaikuObjectModelOptions =
    | ProviderModelOptions
    | { anthropic: { thinking: { type: 'disabled' }; effort: AnthropicEffort } }
    | { bedrock: { reasoningConfig: { maxReasoningEffort: AnthropicEffort }; additionalModelRequestFields: { thinking: { type: 'disabled' } } } };

/** Which provider shape a login method's structured output takes; see `resolveHaikuObjectModelOptions`. */
export type StructuredOutputProvider = 'bedrock' | 'vertex' | 'other';

/**
 * Claude Sonnet 5.5 rejects `thinking: {type: "disabled"}`, so every Sonnet call runs adaptive
 * thinking and `effort` is the one lever on how much it thinks; its levels differ from Sonnet 5's.
 * Thinking shares `maxOutputTokens` with the reply, so each call's cap must leave room for both.
 *
 * Bedrock's Converse API ignores the `anthropic` namespace; its provider reads `reasoningConfig` and
 * writes `thinking` and `output_config.effort` into the request itself.
 */
export function resolveProviderModelOptions(
    isBedrock: boolean,
    effort: AnthropicEffort,
    display?: ThinkingDisplay,
): ProviderModelOptions {
    const displayOption = display ? { display } : {};
    if (isBedrock) {
        return { bedrock: { reasoningConfig: { type: 'adaptive', ...displayOption, maxReasoningEffort: effort } } };
    }
    return { anthropic: { thinking: { type: 'adaptive', ...displayOption }, effort } };
}

/**
 * Options for a Claude Haiku `generateObject` call. Vertex AI and Bedrock have no native structured output
 * for Haiku 5.5, so the SDK falls back to a `json` tool with forced tool choice (`any`), which the API
 * rejects while thinking is on. Haiku 5.5 thinks by default, so those two get thinking disabled
 * explicitly; elsewhere the SDK uses `output_config.format` and the call keeps adaptive thinking.
 *
 * Bedrock's `reasoningConfig` writes no `thinking` field for a disabled type, so the disabled block goes
 * through `additionalModelRequestFields`, which the Converse provider passes on unchanged.
 */
export function resolveHaikuObjectModelOptions(provider: StructuredOutputProvider, effort: AnthropicEffort): HaikuObjectModelOptions {
    if (provider === 'bedrock') {
        return { bedrock: { reasoningConfig: { maxReasoningEffort: effort }, additionalModelRequestFields: { thinking: { type: 'disabled' } } } };
    }
    if (provider === 'vertex') {
        return { anthropic: { thinking: { type: 'disabled' }, effort } };
    }
    return resolveProviderModelOptions(false, effort);
}
