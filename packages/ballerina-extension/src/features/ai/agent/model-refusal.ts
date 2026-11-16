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

// Import-light on purpose: unit tests exercise this without the LS/AI-SDK chain.

/** `providerMetadata.anthropic.stopDetails` on a step that ended with `stop_reason: "refusal"`. */
export interface RefusalStopDetails {
    type?: string;
    category?: string;
    explanation?: string;
}

export const MODEL_REFUSAL_ERROR_NAME = 'ModelRefusalError';

/**
 * The error a turn ends with when the model declines (`finishReason: 'content-filter'`). It goes
 * through the stream-error path, so partial work is kept and the reason shows in the chat.
 */
export function createModelRefusalError(stopDetails: RefusalStopDetails | undefined): Error {
    const category = stopDetails?.category ? ` (category: ${stopDetails.category})` : '';
    const explanation = stopDetails?.explanation?.trim();
    const error = new Error(
        `The model declined to continue this request${category}.`
        + (explanation ? ` ${explanation}` : '')
        + ' Rephrase the request or add context about what you are building, then try again.'
    );
    error.name = MODEL_REFUSAL_ERROR_NAME;
    return error;
}
