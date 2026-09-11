// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

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

/**
 * Whole-catalog library selection used by the Ask (RAG Q&A) feature: one structured-output call over the
 * summary listing of every library. Moved here from the removed HealthcareLibraryProviderTool; the agent
 * itself resolves libraries through the Librarian subagent instead.
 */

import { generateObject, ModelMessage } from "ai";
import { z } from "zod";
import { MinifiedLibrary } from "@wso2/ballerina-core";
import { MANDATORY_HEALTHCARE_LIBRARIES } from "./healthcare-libraries";
import { GenerationType, getAllLibraries } from "./libraries";
import { ModelUsage } from "./function-registry";
import { ANTHROPIC_SONNET, getAnthropicClient, getProviderCacheControl, getProviderModelOptions } from "../ai-client";

const LibraryListSchema = z.object({
    libraries: z.array(z.string()),
});

export async function getSelectedLibraries(prompt: string, libraryType: GenerationType): Promise<{ libraries: string[], usage: ModelUsage }> {
    const allLibraries = await getAllLibraries(libraryType);
    if (allLibraries.length === 0) {
        return { libraries: [], usage: { model: ANTHROPIC_SONNET, inputTokens: 0, outputTokens: 0 } };
    }
    const cacheOptions = await getProviderCacheControl();
    const messages: ModelMessage[] = [
        {
            role: "system",
            content: getSystemPrompt(allLibraries),
            providerOptions: cacheOptions,
        },
        {
            role: "user",
            content: getUserPrompt(prompt),
        },
    ];

    //TODO: Add thinking and test with claude haiku
    const startTime = Date.now();
    const { object, usage } = await generateObject({
        model: await getAnthropicClient(ANTHROPIC_SONNET),
        maxOutputTokens: 4096,
        providerOptions: await getProviderModelOptions(),
        messages: messages,
        schema: LibraryListSchema,
        abortSignal: new AbortController().signal,
    });
    const endTime = Date.now();
    const callUsage: ModelUsage = { model: ANTHROPIC_SONNET, inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0 };
    console.log(`Library selection took ${endTime - startTime}ms, Usage:`, callUsage);

    console.log("Selected libraries:", object.libraries);
    return { libraries: object.libraries, usage: callUsage };
}

function getSystemPrompt(libraryList: MinifiedLibrary[]): string {
    return `You are an assistant tasked with selecting all the Ballerina libraries needed to answer a healthcare specific question from a given set of libraries provided in the context as a JSON. RESPOND ONLY WITH A JSON.
# Library Context JSON
${JSON.stringify(libraryList)}`;
}


//TODO: Fill with examples
function getUserPrompt(prompt: string): string {
    return `
# QUESTION
${prompt}

${
` ALWAYS include ${MANDATORY_HEALTHCARE_LIBRARIES.map(l => `\`${l}\``).join(", ")} libraries in the selection in addition to what you selected.`
}`;
}
