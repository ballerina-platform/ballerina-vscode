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
 * Every sign-in check calls Claude Haiku 5.5, so an account without it can't sign in; the
 * failure has to say which models to enable rather than a generic "validation failed".
 */

import {
    anthropicAwsModelNotFoundMessage,
    bedrockModelAccessMessage,
    isAnthropicModelNotFound,
    isBedrockModelAccessError,
    vertexModelNotFoundMessage,
} from '../views/ai-panel/modelAccess';

describe('isBedrockModelAccessError', () => {
    it.each([
        "You don't have access to the model with the specified model ID.",
        'AccessDeniedException: User is not authorized to perform bedrock:InvokeModel',
        'The provided model identifier is invalid.',
        'Model use case details have not been submitted for this account.',
    ])('recognizes %j', (detail) => {
        expect(isBedrockModelAccessError(detail)).toBe(true);
    });

    it.each([
        'The security token included in the request is invalid.',
        'Too many requests, please wait before trying again.',
    ])('leaves %j to the generic message', (detail) => {
        expect(isBedrockModelAccessError(detail)).toBe(false);
    });
});

describe('isAnthropicModelNotFound', () => {
    it('matches a not-found error that names the model', () => {
        expect(isAnthropicModelNotFound('model: claude-haiku-5-5', 'claude-haiku-5-5')).toBe(true);
    });

    it('does not match a workspace error', () => {
        expect(isAnthropicModelNotFound('Workspace wrkspc_123 not found', 'claude-haiku-5-5')).toBe(false);
    });
});

describe('the model access messages', () => {
    const messages = {
        bedrock: bedrockModelAccessMessage('us.anthropic.claude-haiku-5-5', 'us-east-1', 'detail'),
        vertex: vertexModelNotFoundMessage('global', 'detail'),
        anthropicAws: anthropicAwsModelNotFoundMessage('us-west-2', 'detail'),
    };

    it.each(Object.entries(messages))('%s names both models the agent needs and keeps the detail', (_, message) => {
        expect(message).toContain('Claude Sonnet 5.5 and Claude Haiku 5.5');
        expect(message).toContain('(detail)');
    });

    it('names the Bedrock model ID and region that were checked', () => {
        expect(messages.bedrock).toContain('us.anthropic.claude-haiku-5-5');
        expect(messages.bedrock).toContain('us-east-1');
    });
});
