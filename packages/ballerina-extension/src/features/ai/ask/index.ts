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

import { generateText, stepCountIs } from "ai";
import { BACKEND_URL } from "../utils";
import { selectRequiredFunctions } from "../utils/libs/function-registry";
import { GenerationType } from "../utils/libs/libraries";
import { Library, LibraryWithUrl } from "../utils/libs/library-types";
import { getAnthropicClient, ANTHROPIC_HAIKU, fetchWithAuth } from "../utils/ai-client";
import { z } from 'zod';
import { tool } from 'ai';
import { getSelectedLibraries } from "../utils/libs/select-libraries";

interface Document {
    document: string;
    metadata: {
        doc_link?: string;
        // filename?: string;
        // [key: string]: any;
    };
}

interface ApiDocResult {
    library_link: string;
    [key: string]: any;
}

interface Tool {
    name: string;
    description: string;
    input_schema: {
        type: string;
        properties: {
            [key: string]: {
                type: string;
                description: string;
            };
        };
        required: string[];
    };
}

interface ToolCall {
    name: string;
    input: {
        [key: string]: any;
    };
}

interface ResponseSchema {
    content: string;
    references: string[];
}

interface DocChunk {
    page_content: string;
    doc_link: string;
}


// Tool definitions
const tools = {
    extract_learn_pages: tool({
        description: "Retrieves information about Ballerina language concepts, features, tools, and implementation details from the Ballerina Learn Pages. This includes guidance on syntax, usage, best practices, and examples for addressing various use cases.",
        inputSchema: z.object({
            query: z.string().describe("A question or query requiring information about Ballerina language concepts, features, tools, best practices, or practical use cases related to implementing solutions using the language.")
        })
    }),
    extract_central_api_docs: tool({
        description: "Retrieves technical details about Ballerina libraries, modules, clients, functions, type definitions, parameters, return types, and records.",
        inputSchema: z.object({
            query: z.string().describe("A question or query requiring information about Ballerina libraries, including clients, functions, constructors, type definitions, parameters, and return types")
        })
    })
};

async function extractLearnPages(query: string): Promise<Document[]> {
    const docs: Document[] = await fetchDocumentationFromVectorStore(query);
    return docs;
}

async function fetchDocumentationFromVectorStore(query: string): Promise<Document[]> {
    try {
        const response = await fetchWithAuth(`${BACKEND_URL}/ask-api/v1.0/topK`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: query
            }),
            signal: new AbortController().signal,
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json() as Document[];

        // Transform the response to match Document interface
        return data;
    } catch (error) {
        console.error('Error fetching from vector store:', error);
        // Return empty array on error to prevent breaking the flow
        return [];
    }
}

async function extractCentralApiDocs(query: string): Promise<LibraryWithUrl[]> {
    const { libraries: selectedLibs } = await getSelectedLibraries(query, GenerationType.CODE_GENERATION);
    const { libraries: relevantTrimmedFuncs } = await selectRequiredFunctions(query, selectedLibs, GenerationType.CODE_GENERATION);
    const apiDocs: LibraryWithUrl[] = relevantTrimmedFuncs.map(lib => {
        return {
            ...lib,
            library_link: `https://central.ballerina.io/${lib.name.replace(/'/g, '')}/`
        } as LibraryWithUrl;
    });

    return apiDocs;
}

// TODO: Consider structured outputs
export async function getAskResponse(question: string): Promise<ResponseSchema> {
    try {
        // First, try to get tool calls from Claude
        const toolCallsResponse: ToolCall[] = await getToolCallsFromClaude(question);

        let centralContext: ApiDocResult[] = [];
        let documentationContext: Document[] = [];

        // Execute the tools if we got tool calls
        if (toolCallsResponse && toolCallsResponse.length > 0) {
            for (const toolCall of toolCallsResponse) {
                if (toolCall.name === "extract_learn_pages") {
                    const docs = await extractLearnPages(toolCall.input.query);
                    documentationContext.push(...docs);
                } else if (toolCall.name === "extract_central_api_docs") {
                    const apiDocs = await extractCentralApiDocs(toolCall.input.query);
                    centralContext.push(...apiDocs);
                }
            }
        } else {
            // If no tool calls, force extract_learn_pages
            const docs = await extractLearnPages(question);
            documentationContext.push(...docs);
        }

        // Build document chunks
        const docChunks: { [key: string]: DocChunk } = {};
        if (documentationContext.length > 0) {
            documentationContext.forEach((doc, index) => {
                const docLink = doc.metadata.doc_link || "";
                docChunks[`chunk${index + 1}`] = {
                    page_content: doc.document,
                    doc_link: docLink
                };
            });
        }

        // Build system message
        const systemMessage = buildLlmMessage(docChunks, documentationContext, centralContext);

        // Get final response from Claude
        const finalResponse = await getFinalResponseFromClaude(systemMessage, question);

        // Extract library links
        const libraryLinks: string[] = [];
        if (centralContext.length > 0) {
            centralContext.forEach(lib => {
                libraryLinks.push(lib.library_link);
            });
        }

        // Extract doc IDs and add corresponding links
        const docIdPattern = /<doc_id>(.*?)<\/doc_id>/g;
        const docIds: string[] = [];
        let match;
        while ((match = docIdPattern.exec(finalResponse)) !== null) {
            docIds.push(match[1]);
        }

        // Add documentation links for referenced chunks
        docIds.forEach(id => {
            if (docChunks[id] && docChunks[id].doc_link.length > 0) {
                libraryLinks.push(docChunks[id].doc_link);
            }
        });

        // Clean response
        const filteredResponse = finalResponse.replace(/<doc_id>.*?<\/doc_id>/g, '').trim();

        // Format links
        const formattedLinks = libraryLinks.map(link => `<${link}>`);

        return {
            content: filteredResponse,
            references: formattedLinks
        };

    } catch (error) {
        console.error('Error in assistantToolCall:', error);
        throw new Error(`Failed to process question: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function getToolCallsFromClaude(question: string): Promise<ToolCall[]> {
    const { text, toolCalls } = await generateText({
        model: await getAnthropicClient(ANTHROPIC_HAIKU),
        maxOutputTokens: 8192,
        tools: tools,
        messages: [
            {
                role: "user",
                content: question
            }
        ],
        stopWhen: stepCountIs(1), // Limit to one step to get tool calls only
        abortSignal: new AbortController().signal
    });

    if (toolCalls && toolCalls.length > 0) {
        return toolCalls.map(toolCall => ({
            name: toolCall.toolName,
            input: toolCall.input
        }));
    }

    return [];
}

async function getFinalResponseFromClaude(systemMessage: string, question: string): Promise<string> {
    const { text } = await generateText({
        model: await getAnthropicClient(ANTHROPIC_HAIKU),
        maxOutputTokens: 8192,
        system: systemMessage,
        messages: [
            {
                role: "user",
                content: question
            }
        ],
        abortSignal: new AbortController().signal
    });

    return text;
}

function buildLlmMessage(
    docChunks: { [key: string]: DocChunk },
    documentationContext: Document[],
    centralContext: ApiDocResult[]
): string {
    const documentationSection = documentationContext.length > 0
        ? `Information from Ballerina Learn Pages: This section includes content sourced from the Ballerina Learn pages, consisting of document chunks that cover various topics. These chunks also include sample code examples that are necessary for explaining Ballerina concepts effectively. Out of the given document chunks, you must include the chunk number(eg:- chunk1,chunk2...) of all the document chunks that you used to formulate the answer within <doc_id></doc_id> tags and include it at the end of your response. Only include one chunk number per tag. Document chunks ${JSON.stringify(docChunks)}`
        : "";

    const centralSection = centralContext.length > 0
        ? `Information from the Ballerina API Documentation: This section provides detailed information about type definitions, clients, functions, function parameters, return types, and other library-specific details essential for answering questions related to the Ballerina programming language. ${JSON.stringify(centralContext)}`
        : "";

    return `You are an AI assistant specialized in answering questions about the Ballerina programming language. Your task is to provide precise, accurate, and helpful answers based solely on the information provided below. The information provided below comes from reliable and authoritative sources on the Ballerina programming language. For every response, include your reasoning or derivation inside <thinking></thinking> tags. The content within these tags should explain how you arrived at the answer.

INFORMATION SOURCES:

${documentationSection}

${centralSection}

After thoroughly reviewing the provided information sources, assign a relevancy score on a scale from 1 to 5, indicating how well the sources support answering the user's query. 

If the relevancy score is 5, provide a clear and complete answer. 

If the relevancy score is 3 or 4, clearly state that the Ballerina sources do not directly address the user's query. However, provide an answer based on the information that is available in the sources. The response should explicitly mention that the Ballerina sources do not cover the query directly, followed by a clear explanation of what related information is available in the sources. Do not attempt to infer or generate an answer that is not supported by the provided information. Only include details that are stated in the Ballerina sources and are relevant to the query.

If the score is 1 or 2, politely decline to answer by stating that, couldn't find any information relevant to this in the Ballerina sources. 

The reasoning behind the assignment of relevancy score and the chosen response approach must be included within the <thinking></thinking> tags at the beginning of the response.

IMPORTANT INSTRUCTIONS
- The response generated must only be based on the information sources provided.
- Do not include any links in the response.

Structure your final response so that it begins with the reasoning enclosed within <thinking></thinking> tags. After the thinking section, provide the final answer outside the tags.`;
}
