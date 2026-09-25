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

import { GenerateOpenAPIRequest, Command } from "@wso2/ballerina-core";
import { streamText } from "ai";
import { getAnthropicClient, ANTHROPIC_HAIKU, getProviderCacheControl } from "../utils/ai-client";
import { buildChatError, populateHistory } from "../utils/ai-utils";
import { CopilotEventHandler, createWebviewEventHandler } from "../utils/events";
import { chatStateStorage } from "../../../views/ai-panel/chatStateStorage";
import { createExecutorConfig, resolveProjectRootPath } from "../agent/index";

// Core OpenAPI generation function that emits events
export async function generateOpenAPISpecCore(
    params: GenerateOpenAPIRequest,
    eventHandler: CopilotEventHandler,
    abortController: AbortController
): Promise<void> {
    // Populate chat history and add user message
    const historyMessages = populateHistory(params.chatHistory);
    const cacheOptions = await getProviderCacheControl();
    const { fullStream } = streamText({
        model: await getAnthropicClient(ANTHROPIC_HAIKU),
        maxOutputTokens: 8192,
        temperature: 0,
        system: { role: "system", content: getSystemPrompt(), providerOptions: cacheOptions },
        messages: [
            ...historyMessages,
            {
                role: "user",
                content: getUserPrompt(params.query)
            },
        ],
        abortSignal: abortController.signal,
    });

    eventHandler({ type: "start" });

    for await (const part of fullStream) {
        switch (part.type) {
            case "text-delta": {
                const textPart = part.text;
                eventHandler({ type: "content_block", content: textPart });
                break;
            }
            case "error": {
                const error = part.error;
                console.error("Error during OpenAPI generation:", error);
                eventHandler(buildChatError(error));
                break;
            }
            case "finish": {
                const finishReason = part.finishReason;
                eventHandler({ type: "stop", command: Command.OpenAPI });
                break;
            }
        }
    }
}

// Main public function that uses the default event handler
export async function generateOpenAPISpec(params: GenerateOpenAPIRequest): Promise<void> {
    const eventHandler = createWebviewEventHandler(Command.OpenAPI);

    // Create config for abort support
    const config = createExecutorConfig(params, {
        command: Command.OpenAPI,
        chatStorageEnabled: false,
        cleanupStrategy: 'immediate'
    });

    const projectRootPath = resolveProjectRootPath();
    const threadId = 'default';

    try {
        // Register execution for abort support
        chatStateStorage.setActiveExecution(projectRootPath, threadId, {
            generationId: config.generationId,
            abortController: config.abortController
        });

        await generateOpenAPISpecCore(params, eventHandler, config.abortController);
    } catch (error) {
        if ((error as any).name === 'AbortError' || config.abortController.signal.aborted) {
            console.log("[OpenAPI] Aborted by user.");
            eventHandler({ type: "abort", command: Command.OpenAPI });
        } else {
            console.error("Error during openapi generation:", error);
            eventHandler(buildChatError(error));
        }
    } finally {
        // Clear active execution
        chatStateStorage.clearActiveExecution(projectRootPath, threadId);
    }
}

function getSystemPrompt() {
    return `You are an expert architect who specializes in API Design.  
For a given user scenario, you need to design the optimal OpenAPI Specification. 

Think step by step to design the perfect OpenAPI Spec.
1. Analyze the given scenario and understand the scenario.
2. Identify the resources, input types, and output types needed.
3. Write the OpenAPI Spec according to REST conventions.

Politely reject any queries which are not related to OpenAPI Specification Design.

* Always generate the Complete self contained OpenAPI Spec even if the user ask to modify part of the spec.

Begin with a short description on the response and end with the OpenAPI spec. 

Example Output:
Short description about the response.
<code filename="openapi.yaml">
${"```"}yaml
//openapi spec goes here
${"```"}
</code>
`;
}

function getUserPrompt(query: string): string {
    return `User Scenario:
${query}`;
}
