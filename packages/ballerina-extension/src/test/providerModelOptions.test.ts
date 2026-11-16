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

import { resolveHaikuObjectModelOptions, resolveProviderModelOptions } from '../features/ai/utils/provider-model-options';

describe('resolveProviderModelOptions', () => {
    it('puts adaptive thinking and the effort in the anthropic namespace', () => {
        expect(resolveProviderModelOptions('medium', 'summarized')).toEqual({
            anthropic: { thinking: { type: 'adaptive', display: 'summarized' }, effort: 'medium' },
        });
    });

    it('leaves display out when none is asked for, so the API default applies', () => {
        expect(resolveProviderModelOptions('low')).toEqual({
            anthropic: { thinking: { type: 'adaptive' }, effort: 'low' },
        });
    });

    it('never sends disabled thinking, which Sonnet 5.5 rejects', () => {
        expect(JSON.stringify(resolveProviderModelOptions('low'))).not.toContain('disabled');
    });
});

describe('resolveHaikuObjectModelOptions', () => {
    it.each(['vertex', 'bedrock'] as const)('disables thinking on %s, where the json tool goes out with forced tool choice', (provider) => {
        expect(resolveHaikuObjectModelOptions(provider, 'low')).toEqual({
            anthropic: { thinking: { type: 'disabled' }, effort: 'low' },
        });
    });

    it('keeps adaptive thinking where the SDK uses native structured output', () => {
        expect(resolveHaikuObjectModelOptions('other', 'low')).toEqual(resolveProviderModelOptions('low'));
    });
});
