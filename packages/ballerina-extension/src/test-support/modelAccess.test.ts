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

import { APICallError, RetryError } from 'ai';
import {
    anthropicAwsModelNotFoundMessage,
    bedrockModelAccessMessage,
    isAnthropicModelNotFound,
    isBedrockModelAccessError,
    vertexModelNotFoundMessage,
    vertexSignInFailureMessage,
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

describe('vertexSignInFailureMessage', () => {
    // What the Anthropic provider builds from an error body it can't parse: the message is the
    // HTTP status text, and any reason is only in the response body.
    const callError = (statusCode: number, statusText: string, responseBody = '<html></html>') =>
        new APICallError({ message: statusText, url: 'https://aiplatform.googleapis.com', requestBodyValues: {}, statusCode, responseBody });
    const vertexCallError = (statusCode: number, statusText: string, status: string, message: string) =>
        callError(statusCode, statusText, JSON.stringify({ error: { code: statusCode, message, status } }));

    it('reports a Google-format 404 as the model not found, with the reason from the body', () => {
        const error = vertexCallError(404, 'Not Found', 'NOT_FOUND', 'Publisher Model `claude-haiku-5-5` was not found.');
        const message = vertexSignInFailureMessage(error, 'global');
        expect(message).toContain('Claude Sonnet 5.5 and Claude Haiku 5.5');
        expect(message).toContain('global');
        expect(message).toContain('(NOT_FOUND: Publisher Model `claude-haiku-5-5` was not found.)');
    });

    it('lets the status code win over a code-like number in the body', () => {
        const error = vertexCallError(404, 'Not Found', 'NOT_FOUND',
            'Publisher Model `projects/my-project-401/locations/global/publishers/anthropic/models/claude-haiku-5-5` was not found.');
        expect(vertexSignInFailureMessage(error, 'global')).toContain('was not found for this project in global');
    });

    // A body the reader can't parse leaves only the status text, which names no code.
    it.each([
        [401, 'Unauthorized', 'Invalid credentials.'],
        [403, 'Forbidden', 'Permission denied.'],
        [404, 'Not Found', 'was not found for this project in global'],
        [429, 'Slow Down', 'Quota exceeded.'],
    ])('classifies a %i by its status code alone', (statusCode, statusText, expected) => {
        const message = vertexSignInFailureMessage(callError(statusCode, statusText), 'global');
        expect(message).toContain(expected);
        expect(message).toContain(`(${statusText})`);
    });

    it('unwraps a retried 429 to the last attempt', () => {
        const lastError = vertexCallError(429, 'Too Many Requests', 'RESOURCE_EXHAUSTED', 'Quota exceeded.');
        const error = new RetryError({
            message: 'Failed after 3 attempts. Last error: Too Many Requests',
            reason: 'maxRetriesExceeded',
            errors: [lastError, lastError, lastError],
        });
        expect(vertexSignInFailureMessage(error, 'global')).toContain('Quota exceeded. Your GCP project');
    });

    it('falls back to the message text for a failure raised before any request', () => {
        const message = vertexSignInFailureMessage(new Error('invalid_grant: Invalid JWT Signature.'), 'global');
        expect(message).toContain('Invalid credentials.');
        expect(message).toContain('(invalid_grant: Invalid JWT Signature.)');
    });

    it.each(['client_email', 'private_key'])('reports a key file without its %s field as invalid credentials', (field) => {
        const message = vertexSignInFailureMessage(new Error(`The incoming JSON object does not contain a ${field} field`), 'global');
        expect(message).toContain('Invalid credentials.');
        expect(message).toContain(`(The incoming JSON object does not contain a ${field} field)`);
    });

    it('reads a Google error body wrapped in a one-element array', () => {
        const body = JSON.stringify([{ error: { code: 404, message: 'Publisher Model was not found.', status: 'NOT_FOUND' } }]);
        const message = vertexSignInFailureMessage(callError(404, 'Not Found', body), 'global');
        expect(message).toContain('(NOT_FOUND: Publisher Model was not found.)');
    });

    it('keeps the message of a retried failure whose last attempt sent no request', () => {
        const lastError = new Error('socket hang up');
        const error = new RetryError({ message: 'Failed after 3 attempts.', reason: 'maxRetriesExceeded', errors: [lastError, lastError, lastError] });
        expect(vertexSignInFailureMessage(error, 'global')).toBe('Validation failed: socket hang up');
    });

    it('keeps the message of an unclassified failure', () => {
        expect(vertexSignInFailureMessage(new Error('socket hang up'), 'global')).toBe('Validation failed: socket hang up');
    });
});
