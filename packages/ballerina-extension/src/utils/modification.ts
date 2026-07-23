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
import { SyntaxTreeResponse, InsertorDelete, NOT_SUPPORTED_TYPE, STModification } from "@wso2/ballerina-core";
import { normalize } from "path";
import { Position, Range, Uri, WorkspaceEdit, workspace } from "vscode";
import { URI } from "vscode-uri";
import { writeFileSync } from "fs";
import { StateMachine, updateView } from "../stateMachine";
import { ArtifactNotificationHandler, ArtifactsUpdated } from "./project-artifacts-handler";
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

interface UpdateFileContentRequest {
    filePath: string;
    content: string;
    skipForceSave?: boolean;
    updateViewFlag?: boolean; // New flag to control updateView execution, default true
}

export async function applyModifications(fileName: string, modifications: STModification[]): Promise<SyntaxTreeResponse | NOT_SUPPORTED_TYPE> {
    const ast = await InsertorDelete(modifications);
    return await StateMachine.langClient().stModify({
        documentIdentifier: { uri: Uri.file(fileName).toString() },
        astModifications: ast
    });
}

export async function modifyFileContent(params: UpdateFileContentRequest): Promise<boolean> {
    const { filePath, content, skipForceSave, updateViewFlag = true } = params;
    const normalizedFilePath = normalize(filePath);
    const doc = workspace.textDocuments.find((doc) => normalize(doc.fileName) === normalizedFilePath);

    if (doc) {
        const edit = new WorkspaceEdit();
        edit.replace(URI.file(normalizedFilePath), new Range(new Position(0, 0), doc.lineAt(doc.lineCount - 1).range.end), content);
        await workspace.applyEdit(edit);
        StateMachine.langClient().updateStatusBar();
        if (skipForceSave) {
            // Skip saving document and keep in dirty mode
            return true;
        }
        return doc.save();
    } else {
        await writeBallerinaFileDidOpen(normalizedFilePath, content);
        StateMachine.langClient().updateStatusBar();
        if (updateViewFlag) {
            updateView();
        }
    }

    return false;
}

/**
 * Ensures content ends with a newline for POSIX compliance and version control best practices.
 */
function ensureTrailingNewline(content: string): string {
    const trimmed = content.trim();
    return trimmed.endsWith('\n') ? trimmed : trimmed + '\n';
}

export function writeBallerinaFileSilent(filePath: string, content: string) {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, ensureTrailingNewline(content));
}

export function writeBallerinaFileDidOpenTemp(filePath: string, content: string) {
    // Replace the selection with:
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const contentWithNewline = ensureTrailingNewline(content);
    writeFileSync(filePath, contentWithNewline);
    StateMachine.langClient().didChange({
        textDocument: { uri: filePath, version: 1 },
        contentChanges: [
            {
                text: contentWithNewline,
            },
        ],
    });
    StateMachine.langClient().didOpen({
        textDocument: {
            uri: Uri.file(filePath).toString(),
            languageId: 'ballerina',
            version: 1,
            text: contentWithNewline
        }
    });
}

export async function writeBallerinaFileDidOpen(filePath: string, content: string) {
    const contentWithNewline = ensureTrailingNewline(content);
    writeFileSync(filePath, contentWithNewline);
    StateMachine.langClient().didChange({
        textDocument: { uri: filePath, version: 1 },
        contentChanges: [
            {
                text: contentWithNewline,
            },
        ],
    });
    StateMachine.langClient().didOpen({
        textDocument: {
            uri: Uri.file(filePath).toString(),
            languageId: 'ballerina',
            version: 1,
            text: contentWithNewline
        }
    });

    return new Promise((resolve, reject) => {
        // Get the artifact notification handler instance
        const notificationHandler = ArtifactNotificationHandler.getInstance();
        // Subscribe to artifact updated notifications
        let unsubscribe = notificationHandler.subscribe(ArtifactsUpdated.method, undefined, async (payload) => {
            clearTimeout(timeoutId);
            resolve(payload.data);
            unsubscribe();
        });

        // Set a timeout to reject if no notification is received within 10 seconds
        const timeoutId = setTimeout(() => {
            console.log("No artifact update notification received within 10 seconds");
            reject(new Error("Operation timed out. Please try again."));
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
