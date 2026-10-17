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
import { ArtifactData, EVENT_TYPE, isSamePath, MACHINE_VIEW, ProjectStructureArtifactResponse, STModification, TextEdit } from '@wso2/ballerina-core';
import { openView, StateMachine, undoRedoManager } from '../stateMachine';
import { ArtifactsUpdated, ArtifactNotificationHandler } from './project-artifacts-handler';
import { refreshArtifactPositions } from './project-artifacts';
import { startPullAwareTimeout } from './module-pull-state';
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
    preformatted?: boolean; // The language server already formatted the edits, so they are applied once without a format pass.
}

function artifactsInFiles(filePaths: string[]): ProjectStructureArtifactResponse[] {
    const projects = StateMachine.context().projectStructure?.projects ?? [];
    return projects
        .flatMap((project) => Object.values(project.directoryMap ?? {}).flat() as ProjectStructureArtifactResponse[])
        .filter((artifact) => filePaths.some((filePath) => isSamePath(artifact.path, filePath)));
}

export async function updateSourceCode(updateSourceCodeRequest: UpdateSourceCodeRequest, isChangeFromHelperPane?: boolean): Promise<ProjectStructureArtifactResponse[]> {
    const skipUndoRedoStack = updateSourceCodeRequest.artifactData?.artifactType === "CONFIGURABLE";
    // Capture the current undo/redo manager instance for the whole operation. The
    // module-level `undoRedoManager` is reassigned to a fresh instance when the
    // webview (re)loads (`webviewReady`); if that happens mid-operation — e.g. a
    // source update generated right after a folder open, while the visualizer is
    // still initialising — the later batch calls would hit the new instance and
    // throw "No batch operation in progress". Pinning it here keeps
    // start/add/commit/cancel on one consistent instance.
    const batchManager = undoRedoManager;
    try {
        let tomlFilesUpdated = false;
        StateMachine.setEditMode();
        if (!skipUndoRedoStack) {
            batchManager?.startBatchOperation();
        }
        const modificationRequests: Record<string, { filePath: string; modifications: STModification[] }> = {};
        const unchangedFiles: string[] = [];
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
            // An unchanged document sends no didChange, so no artifacts notification would ever arrive for it.
            if (updateSourceCodeRequest.preformatted && edits.length === 1 && edits[0].newText === beforeContent) {
                unchangedFiles.push(fileUri.fsPath);
                continue;
            }
            if (!skipUndoRedoStack) {
                batchManager?.addFileToBatch(fileUri.fsPath, beforeContent, beforeContent);
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
                    batchManager?.cancelBatchOperation();
                }
                StateMachine.setReadyMode();
                return [];
            }
        }

        // If modificationRequests is empty, return empty array
        if (Object.keys(modificationRequests).length === 0) {
            if (!skipUndoRedoStack) {
                batchManager?.cancelBatchOperation();
            }
            StateMachine.setReadyMode();
            // A save that changed nothing still succeeded; callers look up the saved artifact in the result.
            return artifactsInFiles(unchangedFiles);
        }

        let stopFinalWait = () => {};
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
            // Pre-formatted edits are final, so their single notification goes to the final subscriber below.
            const preformatted = updateSourceCodeRequest.preformatted;
            let rawEditTimedOut = false;
            const rawEditNotification = preformatted ? Promise.resolve() : new Promise<void>((resolve) => {
                // Pull-aware: the raw edit's first compile can wait on a module pull it triggered.
                const timeout = startPullAwareTimeout(() => { rawEditTimedOut = true; unsub(); resolve(); }, 10000);
                const unsub = handler.subscribe(
                    ArtifactsUpdated.method, updateSourceCodeRequest.artifactData,
                    (payload) => {
                        if ((payload.data && payload.data.length > 0) || updateSourceCodeRequest.skipPayloadCheck) {
                            const artifactData = payload.data ?? [];
                            newArtifactIds = new Set(
                                artifactData.filter(a => a.isNew).map(a => a.id)
                            );
                            timeout.cancel(); unsub(); resolve();
                        }
                    }
                );
            });

            // Armed before the last edit: flushArtifacts publishes at once and publish has no replay.
            let earlyArtifacts: ProjectStructureArtifactResponse[] | undefined;
            let onFinalArtifacts: ((artifacts: ProjectStructureArtifactResponse[]) => void) | undefined;
            const armFinalWait = () => {
                let stopped = false;
                const unsub = handler.subscribe(ArtifactsUpdated.method, updateSourceCodeRequest.artifactData, (payload) => {
                    if ((payload.data && payload.data.length > 0) || updateSourceCodeRequest.skipPayloadCheck) {
                        stopFinalWait();
                        const artifacts = payload.data ?? [];
                        onFinalArtifacts ? onFinalArtifacts(artifacts) : (earlyArtifacts = artifacts);
                    }
                });
                stopFinalWait = () => { if (!stopped) { stopped = true; unsub(); } };
            };
            if (preformatted) {
                armFinalWait();
            }

            // Apply all changes at once
            await workspace.applyEdit(workspaceEdit);
            await StateMachine.langClient().flushArtifacts().catch(() => undefined);

            await rawEditNotification;

            // <-------- Format the document after applying all changes using the native formatting API-------->
            const formattedWorkspaceEdit = new vscode.WorkspaceEdit();
            for (const [fileUriString, request] of preformatted ? [] : Object.entries(modificationRequests)) {
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
                        batchManager?.addFileToBatch(fileUri.fsPath, formattedSource.newText, formattedSource.newText);
                    }
                }
            }

            if (preformatted && !skipUndoRedoStack) {
                for (const request of Object.values(modificationRequests)) {
                    const afterContent = (await workspace.openTextDocument(Uri.file(request.filePath))).getText();
                    batchManager?.addFileToBatch(request.filePath, afterContent, afterContent);
                }
            }
            if (!skipUndoRedoStack) {
                batchManager?.commitBatchOperation(updateSourceCodeRequest.description ? updateSourceCodeRequest.description : (updateSourceCodeRequest.artifactData ? `Change in ${updateSourceCodeRequest.artifactData?.artifactType} ${updateSourceCodeRequest.artifactData?.identifier}` : "Update Source Code"));
            }

            if (!preformatted) {
                armFinalWait();
                await workspace.applyEdit(formattedWorkspaceEdit);
                await StateMachine.langClient().flushArtifacts().catch(() => undefined);
            }

            // Handle missing dependencies after all changes are applied
            if (updateSourceCodeRequest.resolveMissingDependencies) {
                for (const [fileUriString] of Object.entries(modificationRequests)) {
                    await StateMachine.langClient().resolveMissingDependencies({
                        documentIdentifier: { uri: fileUriString },
                    });
                }
            }

            return new Promise((resolve, reject) => {
                if (tomlFilesUpdated && !updateSourceCodeRequest?.skipUpdateViewOnTomlUpdate) {
                    stopFinalWait();
                    StateMachine.setReadyMode();
                    resolve([]);
                    return;
                }
                // Reject if no notification is received within 10 seconds outside a module pull
                const timeout = startPullAwareTimeout(() => {
                    console.log("No artifact update notification received within 10 seconds outside a module pull");
                    stopFinalWait();
                    StateMachine.setReadyMode();
                    // Don't navigate away while migration enhancement is running — it would
                    // disrupt the agent pipeline and cause repeated "no project found" errors.
                    if (!_migrationEnhancementActive) {
                        openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.PackageOverview });
                    }
                    reject(new Error("Operation timed out. Please try again."));
                }, 10000);
                onFinalArtifacts = async (artifacts) => {
                    console.log("Received notification:", artifacts);
                    timeout.cancel();
                    let data = artifacts;
                    if (rawEditTimedOut) {
                        // The raw edit's notification did not arrive before formatting, so this can be
                        // it, with positions in the unformatted text. Read the formatted text's instead.
                        let refreshTimeoutId: ReturnType<typeof setTimeout>;
                        const refreshTimedOut = new Promise<undefined>(done => {
                            refreshTimeoutId = setTimeout(() => done(undefined), 10000);
                        });
                        try {
                            data = (await Promise.race([
                                refreshArtifactPositions(Object.keys(modificationRequests)[0], data),
                                refreshTimedOut
                            ])) ?? data;
                        } catch (error) {
                            console.error("Failed to refresh artifact positions:", error);
                        } finally {
                            clearTimeout(refreshTimeoutId);
                        }
                    }
                    if (newArtifactIds?.size) {
                        data.forEach(entry => {
                            if (newArtifactIds.has(entry.id)) {
                                entry.isNew = true;
                            }
                        });
                    }
                    resolve(data);
                    StateMachine.setReadyMode();
                    checkAndNotifyWebview(data, updateSourceCodeRequest, isChangeFromHelperPane);
                };
                if (earlyArtifacts) {
                    onFinalArtifacts(earlyArtifacts);
                }
            });
        } catch (error) {
            stopFinalWait();
            StateMachine.setReadyMode();
            console.log(">>> error updating source", error);
            throw error;
        }
    } catch (error) {
        StateMachine.setReadyMode();
        if (!skipUndoRedoStack) {
            batchManager?.cancelBatchOperation();
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
