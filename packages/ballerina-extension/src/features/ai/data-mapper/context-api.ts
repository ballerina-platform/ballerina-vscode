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

import { generateText, ModelMessage } from "ai";
import { getAnthropicClient, getProviderModelOptions, ANTHROPIC_SONNET } from "../utils/ai-client";
import { AttachmentProcessRequest, AttachmentProcessResponse, ContentPart, FileData, FileTypeHandler, ProcessType } from "./types";
import { getRecordsPrompt, getRequirementsPrompt } from "./prompts/attachment-prompts";


export async function processAttachments(request: AttachmentProcessRequest): Promise<AttachmentProcessResponse> {
    if (request.files.length > 0) {
        return await processFiles(request.files, request.processType);
    } else if (request.text) {
        return await processFiles([{ fileName: 'text', content: btoa(request.text) }], request.processType);
    } else {
        throw new Error("No files or text provided. Please provide file data or text input.");
    }
}

// Maps each ProcessType to its prompt generator and response parser — one place to update when adding a new type.
const PROCESS_TYPE_CONFIG = {
    [ProcessType.Records]: {
        prompt: getRecordsPrompt,
        parse: extractBallerinaCode,
    },
    [ProcessType.Requirements]: {
        prompt: getRequirementsPrompt,
        parse: getRequirementsContent,
    },
} satisfies Record<ProcessType, { prompt: () => string; parse: (msg: string) => string }>;

// Process files (single or multiple)
async function processFiles(files: FileData[], processType: ProcessType): Promise<AttachmentProcessResponse> {
    try {
        const { prompt, parse } = PROCESS_TYPE_CONFIG[processType];
        const message = await processFilesWithClaude(files, prompt());
        return { fileContent: parse(message) };
    } catch (error) {
        throw new Error(`Error processing ${files.length === 1 ? 'file' : 'files'}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Extract Ballerina code from the response
function extractBallerinaCode(message: string): string {
    const ballerinaCodeMatch = message.match(/<ballerina_code>([\s\S]*?)<\/ballerina_code>/);
    if (ballerinaCodeMatch) {
        return ballerinaCodeMatch[1].trim();
    }
    console.log("No Ballerina code found.");
    return "";
}

// Get requirements content from response
function getRequirementsContent(message: any): string {
    if (typeof message === "string") {
        return message;
    }
    // Handle different response structures
    if (message?.content?.[0]?.text) {
        return message.content[0].text;
    }
    if (message?.fileContent?.content?.[0]?.text) {
        return message.fileContent.content[0].text;
    }
    return String(message);
}

// Supported file types configuration
const SUPPORTED_FILE_TYPES: Record<string, FileTypeHandler> = {
    pdf: (file: FileData) => ({
        type: "file",
        data: file.content,
        mediaType: "application/pdf"
    }),
    jpeg: (file: FileData) => ({
        type: "image",
        image: file.content,
        mediaType: "image/jpeg"
    }),
    jpg: (file: FileData) => ({
        type: "image",
        image: file.content,
        mediaType: "image/jpeg"
    }),
    png: (file: FileData) => ({
        type: "image",
        image: file.content,
        mediaType: "image/png"
    }),
    txt: (file: FileData, includeFileName: boolean) => {
        const txtContent = atob(file.content);
        return {
            type: "text",
            text: includeFileName ? `File: ${file.fileName}\n\n${txtContent}` : txtContent
        };
    },
    csv: (file: FileData, includeFileName: boolean) => {
        const txtContent = atob(file.content);
        return {
            type: "text",
            text: includeFileName ? `File: ${file.fileName}\n\n${txtContent}` : txtContent
        };
    }
};

// Get file extension from filename
function getFileExtension(fileName: string): string {
    const extension = fileName.toLowerCase().split('.').pop();
    return extension || "";
}

// Convert file to content part for Claude API
function convertFileToContentPart(file: FileData, includeFileName: boolean = false): ContentPart {
    const extension = getFileExtension(file.fileName);

    const handler = SUPPORTED_FILE_TYPES[extension];

    if (handler) {
        return handler(file, includeFileName);
    }

    // Fallback for files without extension
    if (!extension) {
        const txtContent = atob(file.content);
        return {
            type: "text",
            text: includeFileName ? `File: ${file.fileName}\n\n${txtContent}` : txtContent
        };
    }

    const supportedTypes = Object.keys(SUPPORTED_FILE_TYPES).join(', ');
    throw new Error(`Unsupported file type: ${extension}. Supported types are: ${supportedTypes}`);
}


// Build Claude messages from files and a prompt
function buildClaudeMessages(files: FileData[], promptText: string): ModelMessage[] {
    const contentParts: Array<any> = [];
    const includeFileName = files.length > 1;

    for (const file of files) {
        contentParts.push(convertFileToContentPart(file, includeFileName));
    }

    contentParts.push({ type: "text", text: promptText });

    return [{ role: "user", content: contentParts }];
}

// Process files with Claude using generateText (for free-form text responses)
async function processFilesWithClaude(files: FileData[], promptText: string): Promise<string> {
    const messages = buildClaudeMessages(files, promptText);

    const { text } = await generateText({
        model: await getAnthropicClient(ANTHROPIC_SONNET),
        maxOutputTokens: 8192,
        providerOptions: await getProviderModelOptions(),
        messages,
        abortSignal: new AbortController().signal
    });

    return text;
}

