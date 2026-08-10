// Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import { generateText } from "ai";
import { PayloadContext } from "@wso2/ballerina-core";
import { getAnthropicClient, getProviderModelOptions, ANTHROPIC_SONNET } from "../utils/ai-client";
import { getPayloadGenerationSystemPrompt, getPayloadGenerationUserPrompt } from "./prompts";

/**
 * Generates an example JSON payload for a service resource using AI
 *
 * @param context - The payload context containing service and resource details
 * @returns Promise<object> - The generated JSON payload
 * @throws Error if generation fails or response cannot be parsed
 */
export async function generateExamplePayload(context: PayloadContext): Promise<object> {
    const systemPrompt = getPayloadGenerationSystemPrompt(context);
    const userPrompt = getPayloadGenerationUserPrompt(context);

    try {
        const { text } = await generateText({
            model: await getAnthropicClient(ANTHROPIC_SONNET),
            maxOutputTokens: 4096 * 2,
            providerOptions: await getProviderModelOptions(),
            system: systemPrompt,
            prompt: userPrompt,
            abortSignal: new AbortController().signal,
        });

        // Extract the JSON object from the response (strip any markdown fences)
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
        const jsonText = jsonMatch ? jsonMatch[1].trim() : text.trim();
        const parsed = JSON.parse(jsonText);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('LLM response did not return a valid JSON object');
        }
        return parsed;
    } catch (error) {
        console.error("Failed to generate example payload:", error);
        throw new Error(`Failed to generate example payload: ${error}`);
    }
}
