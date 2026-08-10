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

import { generateObject, ModelMessage, tool } from "ai";
import { GenerationType, getAllLibraries } from "../../utils/libs/libraries";
import { LIBRARY_GET_TOOL } from "./library-get";
import { jsonSchema } from "ai";
import { Library } from "../../utils/libs/library-types";
import { selectRequiredFunctions, ModelUsage, mergeUsage } from "../../utils/libs/function-registry";
import { MinifiedLibrary } from "@wso2/ballerina-core";
import { ANTHROPIC_SONNET, getAnthropicClient, getProviderCacheControl, getProviderModelOptions } from "../../utils/ai-client";
import { z } from "zod";
import { CopilotEventHandler, emitModelUsage, ToolModelUsage } from "../../utils/events";

export const HEALTHCARE_LIBRARY_PROVIDER_TOOL = "HealthcareLibraryProviderTool";

/**
 * Emits tool_result event for healthcare library provider (no filtering)
 */
function emitHealthcareLibraryToolResult(
    eventHandler: CopilotEventHandler,
    libraries: Library[]
): void {
    const libraryNames = libraries.map(lib => lib.name);
    eventHandler({
        type: "tool_result",
        toolName: HEALTHCARE_LIBRARY_PROVIDER_TOOL,
        toolOutput: libraryNames
    });
}

const HealthcareLibraryProviderToolSchema = jsonSchema<{
    userPrompt: string;
}>({
    type: "object",
    properties: {
        userPrompt: {
            type: "string",
            description: "User query to determine which functions and type definitions are needed from the libraries",
        },
    },
    required: ["userPrompt"],
});

export async function HealthcareLibraryProviderTool(
    params: { userPrompt: string },
    eventHandler: CopilotEventHandler,
    toolModelUsage: ToolModelUsage
): Promise<Library[]> {
    try {
        // Emit tool_call event
        eventHandler({
            type: "tool_call",
            toolName: HEALTHCARE_LIBRARY_PROVIDER_TOOL,
        });

        const startTime = Date.now();

        const { libraries, usage } = await getRelevantLibrariesAndFunctions(params.userPrompt, GenerationType.HEALTHCARE_GENERATION);

        console.log(
            `[HealthcareLibraryProviderTool] Fetched ${libraries.length} libraries: ${libraries
                .map((lib) => lib.name)
                .join(", ")}, took ${(Date.now() - startTime) / 1000}s, Usage:`, usage
        );

        emitModelUsage(eventHandler, usage, toolModelUsage);

        // Emit tool_result event with all library names (no filtering)
        emitHealthcareLibraryToolResult(eventHandler, libraries);

        return libraries;
    } catch (error) {
        console.error(`[HealthcareLibraryProviderTool] Error fetching libraries: ${error}`);

        // Emit error result
        eventHandler({
            type: "tool_result",
            toolName: HEALTHCARE_LIBRARY_PROVIDER_TOOL,
            toolOutput: []
        });

        return [];
    }
}

//TODO: Improve this description
export function getHealthcareLibraryProviderTool(
    eventHandler: CopilotEventHandler,
    toolModelUsage: ToolModelUsage
) {
    return tool({
        description: `Fetches detailed information about healthcare-specific Ballerina libraries along with their API documentation, including services, clients, functions, and filtered type definitions.

** NOTE:
1. This Tool only has knowledge on healthcare libraries, you want general libraries, use ${LIBRARY_GET_TOOL} to retrieve those.

This tool is specifically designed for healthcare integration use cases (FHIR, HL7v2, etc.) and provides:
1. **Automatically includes mandatory healthcare libraries** (FHIR R4, HL7v2 commons, etc.) even if not explicitly requested
2. Filters functions based on the user query to include only relevant APIs

**When to use this tool:**
You should only use this tool if the user query mentions,
- healthcare standards (FHIR, HL7, CDA, clinical data)
- Query involves patient data, medical records, or clinical workflows
- Query requires healthcare interoperability between systems

**Before calling this tool:**
- Analyze the user quer, identify healthcare-specific requirements, and call this tool using that question so this tool can provide all the relevant healthcare libraries and functions.

** What this tool returns: **
- Detailed information about healthcare Ballerina libraries including services, clients, functions, and filtered type definitions relevant to the user query.
`,
        inputSchema: HealthcareLibraryProviderToolSchema,
        execute: async (input: {
            userPrompt: string;
        }) => {
            console.log(
                `[HealthcareLibraryProviderTool] Called with prompt: ${input.userPrompt}`
            );
            return await HealthcareLibraryProviderTool(input, eventHandler, toolModelUsage);
        },
    });
}

export function ensureMandatoryHealthcareLibraries(libNames: string[]): string[] {
    const librarySet = new Set(libNames);
    MANDATORY_HEALTHCARE_LIBRARIES.forEach(lib => librarySet.add(lib));
    return Array.from(librarySet);
}


export const MANDATORY_HEALTHCARE_LIBRARIES = [
    'ballerinax/health.fhir.r4.international401',
    'ballerinax/health.fhir.r4',
    'ballerinax/health.fhir.r4.parser',
    'ballerinax/health.fhir.r4utils',
    'ballerinax/health.hl7v2',
    'ballerinax/health.hl7v2commons',
    'ballerinax/health.base'
];

const LibraryListSchema = z.object({
    libraries: z.array(z.string()),
});

export async function getRelevantLibrariesAndFunctions(
    query: string,
    generationType: GenerationType
): Promise<{ libraries: Library[], usage: ModelUsage[] }> {
    const { libraries: selectedLibs, usage: selectionUsage } = await getSelectedLibraries(query, generationType);
    const allLibraries = ensureMandatoryHealthcareLibraries(selectedLibs);
    const { libraries, usage: filteringUsage } = await selectRequiredFunctions(query, allLibraries, generationType);
    return { libraries, usage: mergeUsage(selectionUsage, ...filteringUsage) };
}

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
" ALWAYS include `ballerinax/health.base`, `ballerinax/health.fhir.r4`, `ballerinax/health.fhir.r4.parser`, `ballerinax/health.fhir.r4utils`, `ballerinax/health.fhir.r4.international401`, `ballerinax/health.hl7v2commons` and `ballerinax/health.hl7v2` libraries in the selection in addition to what you selected."
}`;
}
