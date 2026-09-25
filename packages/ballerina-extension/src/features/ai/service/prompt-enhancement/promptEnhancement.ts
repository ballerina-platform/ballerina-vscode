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
import { getEnhancerSystemPrompt, getGeneratorSystemPrompt } from "./prompts";
import { ANTHROPIC_HAIKU, getAnthropicClient } from "../../utils/ai-client";
import { PromptMode, AIMachineEventType } from "@wso2/ballerina-core";
import { window } from "vscode";
import { AIStateMachine } from "../../../../views/ai-panel/aiMachine";
import { loginRequiredWarning, signInToCopilot } from "../../constants";

export interface PromptEnhancementRequest {
    originalPrompt: string;
    additionalInstructions?: string;
    mode: PromptMode;
    isGeneration?: boolean;
}

export interface PromptEnhancementResponse {
    enhancedPrompt: string;
}

export async function enhancePrompt(
    params: PromptEnhancementRequest
): Promise<PromptEnhancementResponse> {
    const systemPrompt = params.isGeneration
        ? getGeneratorSystemPrompt(params.mode)
        : getEnhancerSystemPrompt(params.mode);
    const userPrompt = params.isGeneration
        ? buildGenerationPrompt(params)
        : buildUserPrompt(params);

    try {
        const result = await generateText({
            model: await getAnthropicClient(ANTHROPIC_HAIKU),
            maxOutputTokens: 4000,
            temperature: 0,
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                {
                    role: "user",
                    content: userPrompt,
                },
            ],
            maxRetries: 0, // Disable retries for quota errors (429)
        });

        return {
            enhancedPrompt: result.text.trim()
        };
    } catch (error: any) {
        console.error("Error during prompt enhancement:", error);

        // Handle specific error types
        if (error.name === "UsageLimitError" || error.statusCode === 429 ||
            error.statusCode === 400 && error.message?.includes("usage limit")) {
            const errorMsg = error.message?.match(/You .+UTC\./)
                ? error.message.match(/You .+UTC\./)[0]
                : "Usage limit exceeded. Please try again later or set your own API key.";
            window.showErrorMessage(errorMsg);
            throw new Error(errorMsg);
        }

        if (error.message?.includes("TOKEN_EXPIRED") || error.message?.includes("Unsupported login method")) {
            const signIn = signInToCopilot();
            window.showWarningMessage(loginRequiredWarning(), signIn).then(selection => {
                if (selection === signIn) {
                    AIStateMachine.service().send(AIMachineEventType.LOGIN);
                }
            });
            const errorMsg = error.message?.includes("Unsupported login method")
                ? "Unsupported login method. Please use a supported sign-in method."
                : "Authentication expired. Please log in again.";
            throw new Error(errorMsg);
        }

        if (error.message?.includes("Network") || error.message?.includes("timeout") || error.message?.includes("Cannot connect to API")) {
            const errorMsg = "Network error. Please check your connection and try again.";
            window.showErrorMessage(errorMsg);
            throw new Error(errorMsg);
        }

        // Generic error
        const errorMsg = params.isGeneration
            ? "Failed to generate prompt. Please try again."
            : "Failed to enhance prompt. Please try again.";
        window.showErrorMessage(errorMsg);
        throw new Error(errorMsg);
    }
}

/**
 * Builds the user prompt for enhancement
 */
function buildUserPrompt(params: PromptEnhancementRequest): string {
    let prompt = `Please enhance the following prompt:\n\n${params.originalPrompt}`;

    if (params.additionalInstructions && params.additionalInstructions.trim()) {
        prompt += `\n\n<additional-instructions>${params.additionalInstructions}</additional-instructions>`;
    }

    return prompt;
}

function buildGenerationPrompt(params: PromptEnhancementRequest): string {
    let prompt = `Please generate a prompt for the following use case:\n\n${params.originalPrompt}`;

    if (params.additionalInstructions && params.additionalInstructions.trim()) {
        prompt += `\n\n<additional-instructions>${params.additionalInstructions}</additional-instructions>`;
    }

    return prompt;
}
