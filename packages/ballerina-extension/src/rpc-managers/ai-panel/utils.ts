/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { Attachment, AttachmentStatus, DiagnosticEntry, FileChanges} from "@wso2/ballerina-core";
import { Position, Range, Uri, workspace, WorkspaceEdit } from 'vscode';

import path from "path";
import * as fs from 'fs';
import { AIChatError } from "./utils/errors";
import { processAttachments } from "../../features/ai/data-mapper/context-api";
import { AttachmentProcessRequest, AttachmentProcessResponse, FileData, ProcessType } from "../../features/ai/data-mapper/types";
import { getAskResponse } from "../../features/ai/ask/index";
import { ArtifactNotificationHandler, ArtifactsUpdated } from "../../utils/project-artifacts-handler";
import { VisualizerRpcManager } from "../visualizer/rpc-manager";
import { renderDatamapper } from "../../../src/views/ai-panel/checkpoint/checkpointUtils";

// Common functions

// Checks if an error object has both 'code' and 'message' properties
export function isErrorCode(error: any): boolean {
    return error.hasOwnProperty("code") && error.hasOwnProperty("message");
}

// Adds file changes to the workspace and waits for artifact update notifications
export async function addToIntegration(workspaceFolderPath: string, fileChanges: FileChanges[]) {
    const formattedWorkspaceEdit = new WorkspaceEdit();
    const nonBalFiles: FileChanges[] = [];
    let isBalFileAdded = false;
    for (const fileChange of fileChanges) {
        let balFilePath = path.join(workspaceFolderPath, fileChange.filePath);
        const fileUri = Uri.file(balFilePath);
        if (!fileChange.filePath.endsWith('.bal')) {
            nonBalFiles.push(fileChange);
            continue;
        }
        isBalFileAdded = true;

        if (fileChange.deleted) {
            formattedWorkspaceEdit.deleteFile(fileUri, { ignoreIfNotExists: true });
            continue;
        }

        formattedWorkspaceEdit.createFile(fileUri, { ignoreIfExists: true });

        formattedWorkspaceEdit.replace(
            fileUri,
            new Range(
                new Position(0, 0),
                new Position(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
            ),
            fileChange.content
        );
    }

    // Apply all formatted changes at once
    await workspace.applyEdit(formattedWorkspaceEdit);
    await workspace.saveAll();

    // Write non ballerina files separately as ls doesn't need to be notified of those changes
    for (const fileChange of nonBalFiles) {
        let absoluteFilePath = path.join(workspaceFolderPath, fileChange.filePath);
        if (fileChange.deleted) {
            fs.rmSync(absoluteFilePath, { force: true });
            continue;
        }
        const directory = path.dirname(absoluteFilePath);
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }
        fs.writeFileSync(absoluteFilePath, fileChange.content, 'utf8');
    }
    await renderDatamapper();

    return new Promise((resolve, reject) => {
        if (!isBalFileAdded) {
            resolve([]);
        }
        // Get the artifact notification handler instance
        const notificationHandler = ArtifactNotificationHandler.getInstance();
        // Subscribe to artifact updated notifications
        let unsubscribe = notificationHandler.subscribe(ArtifactsUpdated.method, undefined, async (payload) => {
            new VisualizerRpcManager().updateCurrentArtifactLocation({ artifacts: payload.data });
            clearTimeout(timeoutId);
            resolve(payload.data);
            unsubscribe();
        });

        const timeoutId = setTimeout(() => {
            console.warn("No artifact update notification received within 10 seconds");
            resolve([]);
            unsubscribe();
        }, 10000);

        // Clear the timeout when notification is received
        const originalUnsubscribe = unsubscribe;
        unsubscribe = () => {
            clearTimeout(timeoutId);
            originalUnsubscribe();
        };
    });
}

// Converts an attachment to file data format
async function convertAttachmentToFileData(attachment: Attachment): Promise<FileData> {
    return {
        fileName: attachment.name,
        content: attachment.content
    };
}

// Type Creator related functions

// Extracts type definitions from a file attachment and generates Ballerina record definitions
export async function extractRecordTypeDefinitionsFromFile(sourceFiles: Attachment[]): Promise<string> {
    if (sourceFiles.length === 0) {
        throw new Error("No files provided");
    }

    // Process all files together to understand correlations
    const fileDataArray = await Promise.all(
        sourceFiles.map(attachment => convertAttachmentToFileData(attachment))
    );

    const requestParams: AttachmentProcessRequest = {
        files: fileDataArray,
        processType: ProcessType.Records
    };
    const response: AttachmentProcessResponse = await processAttachments(requestParams);
    return response.fileContent;
}

// Natural language programming related functions

// Analyzes a requirements document and returns the specification
export async function requirementsSpecification(filepath: string): Promise<string> {
    if (!filepath) {
        throw new Error("File is undefined");
    }
    const fileData = await convertAttachmentToFileData({
        name: path.basename(filepath),
        content: convertFileToBase64(filepath), status: AttachmentStatus.UnknownError
    });
    const params: AttachmentProcessRequest = {
        files: [fileData],
        processType: ProcessType.Requirements,
    };
    const resp: AttachmentProcessResponse = await processAttachments(params);
    return resp.fileContent;
}

// Reads a file and converts it to base64 encoding
function convertFileToBase64(filePath: string) {
    const fileBuffer = fs.readFileSync(filePath);
    return fileBuffer.toString('base64');
}

// Feedback related functions

// Removes unnecessary fields from diagnostic entries
export function cleanDiagnosticMessages(entries: DiagnosticEntry[]): DiagnosticEntry[] {
    return entries.map(entry => ({
        code: entry.code || "",
        message: entry.message,
    }));
}

// Ask related functions

// Searches documentation and formats the response with reference sources
export async function searchDocumentation(message: string): Promise<string> {
    const resp = await getAskResponse(message,);
    const finalResponse = resp.content.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
    const referenceSources = resp.references;
    let responseContent: string;
    if (referenceSources.length > 0) {
        responseContent = `${finalResponse}  \nreference sources:  \n${referenceSources.join('  \n')}`;
    } else {
        responseContent = finalResponse;
    }

    return responseContent;
}

// Filters and formats documentation response from API response
export async function filterDocumentation(resp: Response): Promise<string> {
    let responseContent: string;
    if (resp.status == 200 || resp.status == 201) {
        const data = (await resp.json()) as any;
        console.log("data", data.response);
        const finalResponse = await (data.response.content).replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
        const referenceSources = data.response.references;
        if (referenceSources.length > 0) {
            responseContent = `${finalResponse}  \nreference sources:  \n${referenceSources.join('  \n')}`;
        } else {
            responseContent = finalResponse;
        }
        return responseContent;
    }
    throw new Error(AIChatError.UNKNOWN_CONNECTION_ERROR);
}
