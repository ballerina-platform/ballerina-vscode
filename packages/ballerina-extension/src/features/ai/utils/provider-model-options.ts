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
 * Pure provider-options decision logic, extracted from ai-client.ts so it is
 * unit-testable (ai-client transitively imports vscode/auth, and even the
 * `@wso2/ballerina-core` barrel is off-limits here — importing the LoginMethod
 * enum as a runtime value drags in ESM-only `vscode-ws-jsonrpc`, which Jest
 * cannot parse). ai-client wraps `resolveProviderModelOptions` with the async
 * login-method lookup.
 */

/**
 * The string values of the `LoginMethod` enum (`ballerina-core/state-machine-types.ts`).
 * Enum members are assignable to this union, so callers pass `LoginMethod` directly.
 * A compile-time guard in ai-client.ts fails the build if the enum gains a value
 * missing here.
 */
export type LoginMethodValue =
    | 'biIntel'
    | 'anthropic_key'
    | 'aws_bedrock'
    | 'vertex_ai'
    | 'anthropic_aws'
    | 'aws_unified';

export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type ProviderModelOptions =
    | { anthropic: { thinking: { type: 'disabled' }; effort?: AnthropicEffort } }
    | { anthropic: { thinking: { type: 'adaptive'; display: 'summarized' }; effort: 'low'; anthropicBeta: string[] } }
    | { bedrock: { additionalModelRequestFields: { thinking: { type: 'disabled' } } } };

/** Interleaved thinking is NOT auto-added by the SDK for adaptive mode — supplied explicitly. */
export const INTERLEAVED_THINKING_BETA = 'interleaved-thinking-2025-05-14';

/**
 * Adaptive thinking needs the native Anthropic Messages API surface (the `thinking`
 * provider option plus `anthropic-beta` headers). Bedrock's Converse API exposes neither,
 * and Vertex pass-through of adaptive/effort is unverified — both stay disabled here.
 * Gated in this one predicate (not at call sites) so widening later — Bedrock after the
 * InvokeModel switch, Vertex after verification — is a one-line change.
 */
export function supportsAdaptiveThinking(loginMethod: LoginMethodValue): boolean {
    return loginMethod === 'anthropic_key'
        || loginMethod === 'biIntel'
        || loginMethod === 'anthropic_aws';
}

/**
 * Sonnet 5 enables adaptive thinking when `thinking` is omitted, and reasoning shares
 * `maxOutputTokens` with the response — omitting it truncates answers. Bedrock ignores the
 * `anthropic` namespace and reads `providerOptions.bedrock`.
 *
 * On Bedrock the field goes through `additionalModelRequestFields`, not `reasoningConfig`:
 * the provider only serializes `reasoningConfig` when reasoning is enabled or adaptive, so a
 * `disabled` value there is silently dropped. Bedrock also requires reasoning to be off
 * alongside a forced `tool_choice`, which web-tools uses.
 *
 * `thinkingEnabled` defaults to false so every embedded/non-agent call site keeps thinking
 * off by omission; only the main agent opts in. When adaptive thinking engages, the passed
 * `effort` is deliberately ignored in favour of `'low'` (biases adaptive toward skipping
 * simple steps); on login methods outside the gate, `effort` passes through unchanged even
 * with `thinkingEnabled` set — the toggle must not silently strip their effort tuning.
 * `display: 'summarized'` is required on models whose default is 'omitted' to actually
 * surface reasoning text.
 */
export function resolveProviderModelOptions(
    loginMethod: LoginMethodValue,
    effort?: AnthropicEffort,
    thinkingEnabled: boolean = false,
): ProviderModelOptions {
    if (loginMethod === 'aws_bedrock') {
        return { bedrock: { additionalModelRequestFields: { thinking: { type: 'disabled' } } } };
    }
    if (thinkingEnabled && supportsAdaptiveThinking(loginMethod)) {
        return {
            anthropic: {
                thinking: { type: 'adaptive', display: 'summarized' },
                effort: 'low',
                anthropicBeta: [INTERLEAVED_THINKING_BETA],
            },
        };
    }
    return { anthropic: { thinking: { type: 'disabled' }, ...(effort ? { effort } : {}) } };
}
