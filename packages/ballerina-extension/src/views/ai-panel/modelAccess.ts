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
