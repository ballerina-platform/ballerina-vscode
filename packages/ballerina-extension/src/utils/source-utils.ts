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

import * as vscode from 'vscode';
import * as fs from 'fs';
import { workspace } from 'vscode';
import { Uri } from 'vscode';
import { ArtifactData, EVENT_TYPE, MACHINE_VIEW, ProjectStructureArtifactResponse, STModification, TextEdit } from '@wso2/ballerina-core';
import { openView, StateMachine, undoRedoManager } from '../stateMachine';
import { ArtifactsUpdated, ArtifactNotificationHandler } from './project-artifacts-handler';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import { notifyCurrentWebview } from '../RPCLayer';
import { applyBallerinaTomlEdit } from '../rpc-managers/bi-diagram/utils';

/** True while any migration AI enhancement is actively running. */
let _migrationEnhancementActive = false;
/** Called by the migration orchestrator to suppress disruptive UI side-effects during enhancement. */
export function setMigrationEnhancementActive(active: boolean): void {
    _migrationEnhancementActive = active;
}

export interface UpdateSourceCodeRequest {
    textEdits: {
        [key: string]: TextEdit[];
    };
    resolveMissingDependencies?: boolean;
    artifactData?: ArtifactData;
    description?: string;
    identifier?: string;
    skipPayloadCheck?: boolean; // This is used to skip the payload check because the payload data might become empty as a result of a change. Example: Deleting a component.
    isRenameOperation?: boolean; // This is used to identify if the update is a rename operation.
    skipUpdateViewOnTomlUpdate?: boolean; // This is used to skip updating the view on toml updates in certain scenarios.
    waitForArtifactNotifications?: boolean; // Set to false when the caller will refresh and read artifacts directly.
}

export async function updateSourceCode(updateSourceCodeRequest: UpdateSourceCodeRequest, isChangeFromHelperPane?: boolean): Promise<ProjectStructureArtifactResponse[]> {
    const skipUndoRedoStack = updateSourceCodeRequest.artifactData?.artifactType === "CONFIGURABLE";
    const waitForArtifactNotifications = updateSourceCodeRequest.waitForArtifactNotifications !== false;
    try {
        let tomlFilesUpdated = false;
        StateMachine.setEditMode();
        if (!skipUndoRedoStack) {
            undoRedoManager?.startBatchOperation();
        }
        const modificationRequests: Record<string, { filePath: string; modifications: STModification[] }> = {};
        for (const [key, value] of Object.entries(updateSourceCodeRequest.textEdits)) {
            const fileUri = key.startsWith("file:") ? Uri.parse(key) : Uri.file(key);
            const fileUriString = fileUri.toString();
            if (!existsSync(fileUri.fsPath)) {
                // Ensure parent directory exists before creating the file
                const dirPath = path.dirname(fileUri.fsPath);
                if (!existsSync(dirPath)) {
                    mkdirSync(dirPath, { recursive: true });
                }
                writeFileSync(fileUri.fsPath, '');
                await new Promise(resolve => setTimeout(resolve, 500)); // Add small delay to ensure file is created
                await StateMachine.langClient().didOpen({
                    textDocument: {
                        uri: fileUriString,
                        text: '',
                        languageId: 'ballerina',
                        version: 1
                    }
                });
            }
            const edits = value;

            // Hack to handle .toml file edits. Planned to be removed once the updateSource method refactored to work on workspace edits
            if (fileUriString.endsWith(".toml")) {
                tomlFilesUpdated = true;
                for (const edit of edits) {
                    await applyBallerinaTomlEdit(fileUri, edit);
                }
                continue;
            }

            // Get the before content of the file by using the workspace api
            const document = await workspace.openTextDocument(fileUri);
            const beforeContent = document.getText();
            if (!skipUndoRedoStack) {
                undoRedoManager?.addFileToBatch(fileUri.fsPath, beforeContent, beforeContent);
            }

            if (edits && edits.length > 0) {
                const modificationList: STModification[] = [];

                for (const edit of edits) {
                    const stModification: STModification = {
                        startLine: edit.range.start.line,
                        startColumn: edit.range.start.character,
                        endLine: edit.range.end.line,
                        endColumn: edit.range.end.character,
                        type: "INSERT",
                        isImport: false,
                        config: {
                            STATEMENT: edit.newText,
                        },
                    };
                    modificationList.push(stModification);
                }

                if (modificationRequests[fileUriString]) {
                    modificationRequests[fileUriString].modifications.push(...modificationList);
                } else {
                    modificationRequests[fileUriString] = { filePath: fileUri.fsPath, modifications: modificationList };
                }
            }
            if (edits.length === 0) {
                if (!skipUndoRedoStack) {
                    undoRedoManager?.cancelBatchOperation();
                }
                StateMachine.setReadyMode();
                return [];
            }
        }

        // If modificationRequests is empty, return empty array
        if (Object.keys(modificationRequests).length === 0) {
            if (!skipUndoRedoStack) {
                undoRedoManager?.cancelBatchOperation();
            }
            StateMachine.setReadyMode();
            return [];
        }

        // Iterate through modificationRequests and apply modifications
        try {
            // <-------- Using simply the text edits to update the source code -------->
            const workspaceEdit = new vscode.WorkspaceEdit();
            for (const [fileUriString, request] of Object.entries(modificationRequests)) {
                for (const modification of request.modifications) {
                    const fileUri = Uri.file(request.filePath);
                    const source = modification.config.STATEMENT;
                    workspaceEdit.replace(
                        fileUri,
                        new vscode.Range(
                            new vscode.Position(modification.startLine, modification.startColumn),
                            new vscode.Position(modification.endLine, modification.endColumn)
                        ),
                        source
                    );
                }
            }
            // Set up a listener to consume the LS notification triggered by the raw edit,
            // so the final subscriber only sees the notification from the formatted edit.
            // Capture IDs of newly added artifacts so we can re-apply isNew on the formatted edit notification.
            const handler = ArtifactNotificationHandler.getInstance();
            let newArtifactIds: Set<string> | undefined;
            const rawEditNotification = waitForArtifactNotifications ? new Promise<void>((resolve) => {
                let timeoutId: ReturnType<typeof setTimeout>;
                const unsub = handler.subscribe(
                    ArtifactsUpdated.method, updateSourceCodeRequest.artifactData,
                    (payload) => {
                        if ((payload.data && payload.data.length > 0) || updateSourceCodeRequest.skipPayloadCheck) {
                            const artifactData = payload.data ?? [];
                            newArtifactIds = new Set(
                                artifactData.filter(a => a.isNew).map(a => a.id)
                            );
                            clearTimeout(timeoutId); unsub(); resolve();
                        }
                    }
                );
                timeoutId = setTimeout(() => {
                    unsub();
                    resolve();
                }, 10000);
            }) : Promise.resolve();

            // Apply all changes at once
            await workspace.applyEdit(workspaceEdit);

            await rawEditNotification;

            // <-------- Format the document after applying all changes using the native formatting API-------->
            const formattedWorkspaceEdit = new vscode.WorkspaceEdit();
            for (const [fileUriString, request] of Object.entries(modificationRequests)) {
                const fileUri = Uri.file(request.filePath);
                const formattedSources: { newText: string, range: { start: { line: number, character: number }, end: { line: number, character: number } } }[] = await StateMachine.langClient().sendRequest("textDocument/formatting", {
                    textDocument: { uri: fileUriString },
                    options: {
                        tabSize: 4,
                        insertSpaces: true
                    }
                });
                for (const formattedSource of formattedSources) {
                    // Replace the entire document content with the formatted text to avoid duplication
                    formattedWorkspaceEdit.replace(
                        fileUri,
                        new vscode.Range(
                            new vscode.Position(0, 0),
                            new vscode.Position(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
                        ),
                        formattedSource.newText
                    );
                    if (!skipUndoRedoStack) {
                        undoRedoManager?.addFileToBatch(fileUri.fsPath, formattedSource.newText, formattedSource.newText);
                    }
                }
            }

            if (!skipUndoRedoStack) {
                undoRedoManager?.commitBatchOperation(updateSourceCodeRequest.description ? updateSourceCodeRequest.description : (updateSourceCodeRequest.artifactData ? `Change in ${updateSourceCodeRequest.artifactData?.artifactType} ${updateSourceCodeRequest.artifactData?.identifier}` : "Update Source Code"));
            }

            await workspace.applyEdit(formattedWorkspaceEdit);

            // Handle missing dependencies after all changes are applied
            if (updateSourceCodeRequest.resolveMissingDependencies) {
                for (const [fileUriString] of Object.entries(modificationRequests)) {
                    await StateMachine.langClient().resolveMissingDependencies({
                        documentIdentifier: { uri: fileUriString },
                    });
                }
            }

            if (!waitForArtifactNotifications) {
                StateMachine.setReadyMode();
                return [];
            }

            return new Promise((resolve, reject) => {
                if (tomlFilesUpdated && !updateSourceCodeRequest?.skipUpdateViewOnTomlUpdate) {
                    StateMachine.setReadyMode();
                    resolve([]);
                    return;
                }
                // Get the artifact notification handler instance
                const notificationHandler = ArtifactNotificationHandler.getInstance();
                // Subscribe to artifact updated notifications
                let unsubscribe = notificationHandler.subscribe(ArtifactsUpdated.method, updateSourceCodeRequest.artifactData, async (payload) => {
                    if ((payload.data && payload.data.length > 0) || updateSourceCodeRequest.skipPayloadCheck) {
                        console.log("Received notification:", payload);
                        if (newArtifactIds?.size) {
                            payload.data.forEach(entry => {
                                if (newArtifactIds.has(entry.id)) {
                                    entry.isNew = true;
                                }
                            });
                        }
                        clearTimeout(timeoutId);
                        resolve(payload.data);
                        StateMachine.setReadyMode();
                        checkAndNotifyWebview(payload.data, updateSourceCodeRequest, isChangeFromHelperPane);
                        unsubscribe();
                    }
                });

                // Set a timeout to reject if no notification is received within 10 seconds
                const timeoutId = setTimeout(() => {
                    console.log("No artifact update notification received within 10 seconds");
                    unsubscribe();
                    StateMachine.setReadyMode();
                    // Don't navigate away while migration enhancement is running — it would
                    // disrupt the agent pipeline and cause repeated "no project found" errors.
                    if (!_migrationEnhancementActive) {
                        openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.PackageOverview });
                    }
                    reject(new Error("Operation timed out. Please try again."));
                }, 10000);

                // Clear the timeout when notification is received
                const originalUnsubscribe = unsubscribe;
                unsubscribe = () => {
                    clearTimeout(timeoutId);
                    originalUnsubscribe();
                };
            });
        } catch (error) {
            StateMachine.setReadyMode();
            console.log(">>> error updating source", error);
            throw error;
        }
    } catch (error) {
        StateMachine.setReadyMode();
        if (!skipUndoRedoStack) {
            undoRedoManager?.cancelBatchOperation();
        }
        console.log(">>> error updating source", error);
        throw error;
    }
}


//** 
// Notify webview unless a new TYPE artifact is created outside the type diagram view
// */
function checkAndNotifyWebview(
    response: ProjectStructureArtifactResponse[],
    request: UpdateSourceCodeRequest,
    isChangeFromHelperPane?: boolean
) {
    const newArtifact = response.find(artifact => artifact.isNew);
    const selectedArtifact = response.find(artifact => artifact.id === request.identifier);
    const stateContext = StateMachine.context().view;

    if (request.isRenameOperation) {
        notifyCurrentWebview();
        return;
    }

    if ((selectedArtifact?.type === "TYPE " || newArtifact?.type === "TYPE") && stateContext !== MACHINE_VIEW.TypeDiagram) {
        return;
    } else if (!isChangeFromHelperPane) {
        notifyCurrentWebview();
    }
}

export async function injectImportIfMissing(importStatement: string, filePath: string) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    if (!fileContent.includes(importStatement)) {
        const workspaceEdit = new vscode.WorkspaceEdit();
        const position = new vscode.Position(0, 0); // Insert at the beginning of the file
        workspaceEdit.insert(vscode.Uri.file(filePath), position, importStatement + ';\n');
        await vscode.workspace.applyEdit(workspaceEdit);
    }
}
