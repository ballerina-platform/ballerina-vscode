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

// Sign-in failure messages for an account that can't reach the model the check calls. Every
// sign-in check calls Claude Haiku 5.5, and the agent also needs Claude Sonnet 5.5, so each
// message names both: an account with only one of them enabled must know what to enable.

import { APICallError, RetryError } from 'ai';

const CHECKED_MODEL = 'Claude Haiku 5.5';
const REQUIRED_MODELS = 'Claude Sonnet 5.5 and Claude Haiku 5.5';

/**
 * Bedrock reports a model the account hasn't enabled as access denied, an unknown model ID as an
 * invalid identifier, and a model whose use-case form is missing as a missing resource.
 */
export function isBedrockModelAccessError(detail: string): boolean {
    return /AccessDeniedException|access to the model|model identifier is invalid|ResourceNotFoundException|use case details/i.test(detail);
}

/** The Claude API family answers an unavailable model with a not-found error naming the model ID. */
export function isAnthropicModelNotFound(detail: string, modelId: string): boolean {
    return detail.includes(modelId);
}

export function bedrockModelAccessMessage(modelId: string, region: string, detail: string): string {
    return `Access to ${CHECKED_MODEL} (${modelId}) was denied in ${region}. ` +
        `Enable ${REQUIRED_MODELS} under Model access in the Amazon Bedrock console, ` +
        `and check that your IAM user may call bedrock:InvokeModel. (${detail})`;
}

export function vertexModelNotFoundMessage(location: string, detail: string): string {
    return `${CHECKED_MODEL} was not found for this project in ${location}. ` +
        `Enable ${REQUIRED_MODELS} in Vertex AI Model Garden, and check the project ID and location. (${detail})`;
}

export function anthropicAwsModelNotFoundMessage(region: string, detail: string): string {
    return `${CHECKED_MODEL} is not available to this workspace in ${region}. ` +
        `Check that ${REQUIRED_MODELS} are available to the workspace in the Claude Console. (${detail})`;
}

/**
 * Vertex AI answers in Google's error format (`{"error":{"code":404,"status":"NOT_FOUND",...}}`),
 * which the Anthropic provider can't parse, so the error's message is only the HTTP status text.
 * Classify the failure by its status code, and take the reason from Google's response body.
 * The text checks remain for failures raised before any request, such as a rejected key file.
 */
export function vertexSignInFailureMessage(error: unknown, location: string): string {
    // A retried failure (429, 5xx) arrives wrapped, holding the last attempt's error.
    const lastError = RetryError.isInstance(error) ? error.lastError : error;
    const callError = APICallError.isInstance(lastError) ? lastError : undefined;
    const status = callError?.statusCode;
    const detail = googleErrorDetail(callError?.responseBody)
        ?? (lastError instanceof Error ? lastError.message : String(lastError));
    const mentions = (...needles: string[]) => needles.some((needle) => detail.includes(needle));

    if (status === 401 || mentions('401', 'authentication', 'UNAUTHENTICATED')) {
        return `Invalid credentials. Please check your service account JSON file. (${detail})`;
    }
    if (status === 403 || mentions('403', 'PERMISSION_DENIED')) {
        return `Permission denied. Please ensure your service account has access to Vertex AI. (${detail})`;
    }
    if (status === 404 || mentions('404', 'NOT_FOUND')) {
        return vertexModelNotFoundMessage(location, detail);
    }
    if (status === 429 || mentions('429', 'Too Many Requests', 'RESOURCE_EXHAUSTED')) {
        return `Quota exceeded. Your GCP project may have 0 quota for this Anthropic model — request a quota increase in GCP Console → IAM & Admin → Quotas. (${detail})`;
    }
    return `Validation failed: ${detail}`;
}

/** Google's error body, as an object or a one-element array; `STATUS: message` when it parses. */
function googleErrorDetail(responseBody: string | undefined): string | undefined {
    if (!responseBody) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(responseBody);
        const body = Array.isArray(parsed) ? parsed[0] : parsed;
        const { status, message } = body?.error ?? {};
        if (typeof message !== 'string') {
            return undefined;
        }
        return typeof status === 'string' ? `${status}: ${message}` : message;
    } catch {
        return undefined;
    }
}
