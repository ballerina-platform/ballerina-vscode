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

import { tool, jsonSchema } from "ai";
import { CopilotEventHandler } from "../../utils/events";
import { langClient } from "../../activator";
import { CopilotSearchLibrariesBySearchRequest, CopilotSearchLibrariesBySearchResponse, MinifiedLibrary } from "@wso2/ballerina-core";

import { LIBRARY_GET_TOOL } from './library-get';

export const LIBRARY_SEARCH_TOOL = "LibrarySearchTool";

// Maximum number of keywords allowed for library search
const MAX_SEARCH_KEYWORDS = 10;

const LibrarySearchToolSchema = jsonSchema<{
    keywords: string[];
    searchDescription?: string;
}>({
    type: "object",
    properties: {
        keywords: {
            type: "array",
            items: { type: "string" },
            description: `Array of search keywords to find relevant Ballerina libraries. Keywords are combined with OR, so each additional keyword widens the search rather than narrowing it. Maximum ${MAX_SEARCH_KEYWORDS} keywords allowed. Examples: ["GitHub", "API", "integration"], ["Stripe", "payment", "gateway"], ["HTTP", "REST", "service"]`,
            minItems: 1,
            maxItems: MAX_SEARCH_KEYWORDS,
        },
        searchDescription: {
            type: "string",
            description: "Optional user-friendly description of what libraries are being searched for. This will be shown to the user during the search to provide context about what is being looked for.",
        },
    },
    required: ["keywords"],
});

function emitLibrarySearchResult(
    eventHandler: CopilotEventHandler,
    toolName: string,
    libraries: MinifiedLibrary[],
    toolCallId: string,
    searchDescription?: string
): void {
    const libraryNames = libraries.map(lib => lib.name);
    eventHandler({
        type: "tool_result",
        toolName,
        toolOutput: {
            libraries: libraryNames,
            searchDescription
        },
        toolCallId
    });
}

export async function LibrarySearchTool(
    params: { keywords: string[]; searchDescription?: string },
    eventHandler: CopilotEventHandler,
    toolCallId: string
): Promise<CopilotSearchLibrariesBySearchResponse> {
    try {
        // Emit tool_call event with ID and description
        eventHandler({
            type: "tool_call",
            toolName: LIBRARY_SEARCH_TOOL,
            toolInput: {
                keywords: params.keywords,
                searchDescription: params.searchDescription
            },
            toolCallId
        });

        const startTime = Date.now();

        // Validate keyword count
        const keywords = params.keywords.slice(0, MAX_SEARCH_KEYWORDS);
        if (keywords.length === 0) {
            console.warn(`[LibrarySearchTool] No keywords provided`);
            return { libraries: [] };
        }
        
        const request: CopilotSearchLibrariesBySearchRequest = {
            keywords
        };

        const response: CopilotSearchLibrariesBySearchResponse =
            await langClient.getCopilotLibrariesBySearch(request);

        const libraryNames = response.libraries.map(lib => lib.name);
        console.log(
            `[LibrarySearchTool] Searched with keywords: [${keywords.join(", ")}], found ${response.libraries.length} libraries: ${libraryNames.join(
                ", "
            )}, took ${(Date.now() - startTime) / 1000}s`
        );

        // Emit tool_result event with same ID and description
        emitLibrarySearchResult(eventHandler, LIBRARY_SEARCH_TOOL, response.libraries, toolCallId, params.searchDescription);

        return { libraries: response.libraries };
    } catch (error) {
        console.error(`[LibrarySearchTool] Error searching libraries: ${error}`);

        // Emit error result with same ID and description
        eventHandler({
            type: "tool_result",
            toolName: LIBRARY_SEARCH_TOOL,
            toolOutput: {
                libraries: [],
                searchDescription: params.searchDescription
            },
            toolCallId
        });

        return { libraries: [] };
    }
}

export function getLibrarySearchTool(
    eventHandler: CopilotEventHandler
) {
    return tool({
        description: `Searches for Ballerina libraries from Ballerina Central based on keywords.

**Purpose:**
This tool discovers relevant Ballerina libraries using keyword-based search. It searches against library names, descriptions, package keywords, and documentation. All keywords are combined with OR and the matches are ranked by overall relevance, so each additional keyword widens the search rather than narrowing it.

**Scope:**
- **ballerina/*** - Standard/core libraries maintained by the Ballerina team
- **ballerinax/*** - Extended connector packages for third-party services

**Keyword Guidelines:**
- Prefer FEWER, more distinctive keywords. 1-3 is usually best; the hard maximum is ${MAX_SEARCH_KEYWORDS}.
- Lead with the service, product, or technology name ("Stripe", "Kafka", "Salesforce") - these are what actually identify a library.
- Prefer single words over phrases - a multi-word keyword is split into separate words anyway
- AVOID generic words such as "read", "write", "file", "data", "document", "message", "notification", "client", "service", "api", "integration". Because keywords are OR'd, every generic word drags in dozens of unrelated libraries that push the relevant ones out of the results.
- Only include 'trigger' when the user wants to LISTEN for events or handle a webhook. Do NOT include it when the user wants to call an API - it matches every trigger.* package and crowds out the connector you actually need.
- When a task spans several distinct services, run a SEPARATE search per service instead of combining every service into one keyword list.

**When to use this tool:**
- To discover which libraries are available for a specific use case or integration
- Before calling ${LIBRARY_GET_TOOL} to retrieve full library details
- When the user query mentions integrations, services, connectors, or specific functionality
- Whenever you need to find relevant libraries but don't know the exact library names

**Important - Two-Step Workflow:**
1. First, call THIS tool (${LIBRARY_SEARCH_TOOL}) with relevant keywords to discover relevant libraries
2. Review the returned library names and descriptions
3. Select the most appropriate libraries (typically 1-5 libraries)
4. Then, call ${LIBRARY_GET_TOOL} with the selected library names to get detailed API documentation (functions, types, clients, services, etc.)

**Example Workflow:**
User query: <a request involving a service, technology, or capability>
Keywords: [<service or technology name>, <at most one or two distinctive supporting terms>]  // one search per distinct service; skip generic words entirely
Call ${LIBRARY_SEARCH_TOOL} with the keywords
→ Returns: [
    { name: "<organization>/<library>", description: "..." },
    ...
  ]
Then call ${LIBRARY_GET_TOOL} with the selected library names

**Tool Response Format:**
Returns an array of library objects, each containing a name and description:
[
  { name: "<organization>/<library>", description: "..." }
]
`,
        inputSchema: LibrarySearchToolSchema,
        execute: async (input: { keywords: string[]; searchDescription?: string }, context?: { toolCallId?: string }) => {
            // Extract toolCallId from AI SDK context
            const toolCallId = context?.toolCallId || `fallback-${Date.now()}`;

            console.log(
                `[LibrarySearchTool] Called with keywords: [${input.keywords.join(", ")}] [toolCallId: ${toolCallId}] [description: ${input.searchDescription || 'none'}]`
            );
            return await LibrarySearchTool(input, eventHandler, toolCallId);
        },
    });
}
