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
 * Guards the provider-options matrix for extended thinking. The stakes: the OFF
 * path must keep sending an explicit `thinking: disabled` (Sonnet 5 thinks by
 * default when the field is omitted), Bedrock must NEVER get the adaptive shape
 * (its Converse API rejects the anthropic namespace and beta headers), and the
 * interleaved-thinking beta must ride along whenever adaptive is on (the SDK does
 * not auto-add it). A wrong branch here fails silently as cost/latency or a 400.
 *
 * Login methods are the leaf module's string union, NOT the LoginMethod enum —
 * importing the enum as a runtime value loads the ballerina-core barrel, which
 * drags in ESM-only vscode-ws-jsonrpc and kills the suite. The union is kept in
 * sync with the enum by a compile-time guard in ai-client.ts.
 */

import {
    INTERLEAVED_THINKING_BETA,
    resolveProviderModelOptions,
    supportsAdaptiveThinking,
    LoginMethodValue,
} from '../features/ai/utils/provider-model-options';

const ADAPTIVE_METHODS: LoginMethodValue[] = ['biIntel', 'anthropic_key', 'anthropic_aws'];
const NON_ADAPTIVE_ANTHROPIC_METHODS: LoginMethodValue[] = ['vertex_ai', 'aws_unified'];

describe('supportsAdaptiveThinking', () => {
    it.each(ADAPTIVE_METHODS)('%s supports adaptive thinking', (method) => {
        expect(supportsAdaptiveThinking(method)).toBe(true);
    });

    it.each<LoginMethodValue>(['aws_bedrock', ...NON_ADAPTIVE_ANTHROPIC_METHODS])(
        '%s does not support adaptive thinking', (method) => {
            expect(supportsAdaptiveThinking(method)).toBe(false);
        });
});

describe('resolveProviderModelOptions', () => {
    describe('thinking enabled on Anthropic-protocol methods', () => {
        it.each(ADAPTIVE_METHODS)('%s gets adaptive + interleaved beta, ignoring the passed effort', (method) => {
            // The agent always passes 'xhigh'; adaptive mode must swap it for 'low'.
            expect(resolveProviderModelOptions(method, 'xhigh', true)).toEqual({
                anthropic: {
                    thinking: { type: 'adaptive', display: 'summarized' },
                    effort: 'low',
                    anthropicBeta: [INTERLEAVED_THINKING_BETA],
                },
            });
        });
    });

    describe('thinking disabled (default) keeps the pre-thinking shapes byte-identical', () => {
        it.each([...ADAPTIVE_METHODS, ...NON_ADAPTIVE_ANTHROPIC_METHODS])(
            '%s sends explicit disabled with effort passthrough', (method) => {
                expect(resolveProviderModelOptions(method, 'xhigh')).toEqual({
                    anthropic: { thinking: { type: 'disabled' }, effort: 'xhigh' },
                });
            });

        it.each([...ADAPTIVE_METHODS, ...NON_ADAPTIVE_ANTHROPIC_METHODS])(
            '%s omits effort when none given', (method) => {
                expect(resolveProviderModelOptions(method)).toEqual({
                    anthropic: { thinking: { type: 'disabled' } },
                });
            });
    });

    describe('gated methods never get the adaptive shape even when thinking is requested', () => {
        it('aws_bedrock always returns the bedrock disabled shape', () => {
            for (const thinkingEnabled of [false, true]) {
                expect(resolveProviderModelOptions('aws_bedrock', 'xhigh', thinkingEnabled)).toEqual({
                    bedrock: { additionalModelRequestFields: { thinking: { type: 'disabled' } } },
                });
            }
        });

        it.each(NON_ADAPTIVE_ANTHROPIC_METHODS)(
            '%s falls back to explicit disabled and KEEPS the passed effort', (method) => {
                // Regression guard: the thinking toggle must not strip effort tuning from
                // login methods where adaptive thinking never engages.
                expect(resolveProviderModelOptions(method, 'xhigh', true)).toEqual({
                    anthropic: { thinking: { type: 'disabled' }, effort: 'xhigh' },
                });
            });
    });
});
