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

import { NoObjectGeneratedError } from 'ai';

/**
 * Runs a Claude Sonnet `generateObject` call once more when the model answered without the object.
 * On Vertex AI the provider has no native structured output, so the SDK offers a `json` tool
 * instead, and Claude Sonnet 5.5 rejects forced tool use: the SDK sends that tool with
 * `tool_choice: auto`, and the model can answer in text, which throws `NoObjectGeneratedError`.
 * The Claude API (`output_config.format`) and Bedrock (JSON instructions) do not take this path.
 */
export async function retryOnNoObject<T>(label: string, call: () => Promise<T>): Promise<T> {
    try {
        return await call();
    } catch (error) {
        if (!NoObjectGeneratedError.isInstance(error)) {
            throw error;
        }
        console.warn(`[${label}] The model answered without the structured object; retrying once.`);
        return call();
    }
}
