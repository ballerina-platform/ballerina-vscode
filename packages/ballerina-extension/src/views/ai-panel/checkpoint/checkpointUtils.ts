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
import * as path from 'path';
import * as fs from 'fs';
import { Checkpoint } from '@wso2/ballerina-core/lib/state-machine-types';
import { getCheckpointConfig } from './checkpointConfig';
import { ArtifactNotificationHandler, ArtifactsUpdated } from '../../../utils/project-artifacts-handler';
import { VisualizerRpcManager } from '../../../rpc-managers/visualizer/rpc-manager';
import { StateMachine, updateView } from '../../../../src/stateMachine';
import { refreshDataMapper } from '../../../../src/rpc-managers/data-mapper/utils';
import { notifyCurrentWebview, suppressWebviewNotifications } from '../../../../src/RPCLayer';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const SKIP_REWRITE_WHEN_UNCHANGED_FILENAMES: ReadonlySet<string> = new Set([
    'Ballerina.toml'
]);

export async function captureWorkspaceSnapshot(messageId: string): Promise<Checkpoint | null> {
    const config = getCheckpointConfig();

    if (!config.enabled) {
        return null;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        console.warn('[Checkpoint] No workspace folder found');
        return null;
    }

    const workspaceRoot = workspaceFolders[0].uri;
    const workspaceSnapshot: { [filePath: string]: string } = {};
    const fileList: string[] = [];
    let totalSize = 0;

    try {
        const allFiles = await getAllWorkspaceFiles(workspaceRoot, config.ignorePatterns);

        for (const fileUri of allFiles) {
            try {
                const fileContent = await vscode.workspace.fs.readFile(fileUri);
                const content = Buffer.from(fileContent).toString('utf8');
                const relativePath = path.relative(workspaceRoot.fsPath, fileUri.fsPath).split(path.sep).join('/');

                workspaceSnapshot[relativePath] = content;
                fileList.push(relativePath);
                totalSize += content.length;

                if (totalSize > config.maxSnapshotSize) {
                    // Fail closed rather than save a partial checkpoint that silently leaves
                    // later-scanned files unrevertible on restore.
                    console.warn(`[Checkpoint] Snapshot size exceeded max limit (${totalSize} bytes) — aborting capture, no partial checkpoint will be saved`);
                    vscode.window.showWarningMessage(
                        `Workspace is too large to checkpoint (exceeds ${Math.round(config.maxSnapshotSize / 1024 / 1024)}MB). This generation will not be revertible.`
                    );
                    return null;
                }
            } catch (error) {
                console.error(`[Checkpoint] Failed to read file ${fileUri.fsPath}:`, error);
            }
        }

        const checkpoint: Checkpoint = {
            id: generateId(),
            messageId,
            timestamp: Date.now(),
            workspaceSnapshot,
            fileList,
            snapshotSize: totalSize
        };

        return checkpoint;
    } catch (error) {
        console.error('[Checkpoint] Failed to capture workspace snapshot:', error);
        vscode.window.showErrorMessage('Failed to create checkpoint: ' + (error as Error).message);
        return null;
    }
}

export async function restoreWorkspaceSnapshot(checkpoint: Checkpoint, skipArtifactWait = false): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder found');
    }

    const workspaceRoot = workspaceFolders[0].uri;
    let isBalFileRestored = false;

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Restoring checkpoint...',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Reading current workspace...' });

            const config = getCheckpointConfig();
            const currentFiles = await getAllWorkspaceFiles(workspaceRoot, config.ignorePatterns);
            const currentFilePaths = new Set(
                currentFiles.map(uri => path.relative(workspaceRoot.fsPath, uri.fsPath).split(path.sep).join('/'))
            );

            const snapshotFilePaths = new Set(checkpoint.fileList);

            const filesToDelete = Array.from(currentFilePaths).filter(
                filePath => !snapshotFilePaths.has(filePath)
            );

            // Check if any .bal files are being modified
            isBalFileRestored = filesToDelete.some(filePath => filePath.endsWith('.bal')) ||
                checkpoint.fileList.some(filePath => filePath.endsWith('.bal'));

            progress.report({ message: `Preparing ${filesToDelete.length} deletions and ${checkpoint.fileList.length} file restorations...` });

            const balFilesToRestore: Array<{ fileUri: vscode.Uri; content: string }> = [];
            const nonBalFilesToRestore: Array<{ fileUri: vscode.Uri; content: string }> = [];
            for (const [filePath, content] of Object.entries(checkpoint.workspaceSnapshot)) {
                const fileUri = vscode.Uri.file(path.join(workspaceRoot.fsPath, filePath));

                // TODO: workaround — rewriting Ballerina.toml triggers an unwanted PackageOverview → WorkspaceOverview redirect.
                if (SKIP_REWRITE_WHEN_UNCHANGED_FILENAMES.has(path.basename(filePath))) {
                    let alreadyMatches = false;
                    try {
                        const existing = await vscode.workspace.fs.readFile(fileUri);
                        alreadyMatches = Buffer.from(existing).toString('utf8') === content;
                    } catch {
                        // File does not exist on disk.
                    }
                    if (alreadyMatches) {
                        continue;
                    }
                }

                (filePath.endsWith('.bal') ? balFilesToRestore : nonBalFilesToRestore).push({ fileUri, content });
            }

            const balFilesToDelete: vscode.Uri[] = [];
            const nonBalFilesToDelete: vscode.Uri[] = [];
            for (const filePath of filesToDelete) {
                const fileUri = vscode.Uri.file(path.join(workspaceRoot.fsPath, filePath));
                (filePath.endsWith('.bal') ? balFilesToDelete : nonBalFilesToDelete).push(fileUri);
            }

            progress.report({ message: 'Applying workspace changes...' });

            const resumeNotifications = suppressWebviewNotifications();
            let success = true;
            try {
                // Non-.bal files go through fs directly (mirrors addToIntegration's split):
                // WorkspaceEdit.replace() silently no-ops on a file with no open TextDocument,
                // which is never true for .bal files but always true for the rest.
                for (const fileUri of nonBalFilesToDelete) {
                    if (fs.existsSync(fileUri.fsPath)) {
                        fs.unlinkSync(fileUri.fsPath);
                    }
                }
                for (const { fileUri, content } of nonBalFilesToRestore) {
                    const directory = path.dirname(fileUri.fsPath);
                    if (!fs.existsSync(directory)) {
                        fs.mkdirSync(directory, { recursive: true });
                    }
                    fs.writeFileSync(fileUri.fsPath, content, 'utf8');
                }

                if (balFilesToDelete.length > 0 || balFilesToRestore.length > 0) {
                    const balEdit = new vscode.WorkspaceEdit();
                    for (const fileUri of balFilesToDelete) {
                        balEdit.deleteFile(fileUri, { ignoreIfNotExists: true });
                    }
                    for (const { fileUri } of balFilesToRestore) {
                        balEdit.createFile(fileUri, { ignoreIfExists: true });
                    }
                    for (const { fileUri, content } of balFilesToRestore) {
                        balEdit.replace(
                            fileUri,
                            new vscode.Range(
                                new vscode.Position(0, 0),
                                new vscode.Position(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
                            ),
                            content
                        );
                    }
                    success = await vscode.workspace.applyEdit(balEdit);
                }
                await vscode.workspace.saveAll();
            } finally {
                resumeNotifications();
            }

            if (!success) {
                throw new Error('Failed to apply workspace edit');
            }

            progress.report({ message: 'Checkpoint restored successfully!' });
            await renderDatamapper();
            notifyCurrentWebview();
        });

        // Wait for artifact update notification if any .bal files were restored
        if (skipArtifactWait) { return; }
        await new Promise<void>((resolve, reject) => {
            if (!isBalFileRestored) {
                resolve();
                return;
            }

            // Get the artifact notification handler instance
            const notificationHandler = ArtifactNotificationHandler.getInstance();
            // Subscribe to artifact updated notifications
            let unsubscribe = notificationHandler.subscribe(ArtifactsUpdated.method, undefined, async (payload) => {
                new VisualizerRpcManager().updateCurrentArtifactLocation({ artifacts: payload.data });
                clearTimeout(timeoutId);
                resolve();
                unsubscribe();
            });

            // Set a timeout to reject if no notification is received within 10 seconds
            const timeoutId = setTimeout(() => {
                console.log("[Checkpoint] No artifact update notification received within 10 seconds");
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

        vscode.window.showInformationMessage('Checkpoint restored successfully');
    } catch (error) {
        console.error('[Checkpoint] Failed to restore workspace snapshot:', error);
        vscode.window.showErrorMessage('Failed to restore checkpoint: ' + (error as Error).message);
    }
}

//TODO: Verify why this doesnt work.
export async function renderDatamapper() {
    const context = StateMachine.context();
    const dataMapperMetadata = context.dataMapperMetadata;
    if (!dataMapperMetadata || !dataMapperMetadata.codeData) {
        updateView();
        return true;
    }

    // Refresh data mapper with the updated code
    let filePath = dataMapperMetadata.codeData.lineRange?.fileName;
    const varName = dataMapperMetadata.name;
    if (!filePath || !varName) {
        updateView();
        return true;
    }

    await refreshDataMapper(filePath, dataMapperMetadata.codeData, varName);
}

async function getAllWorkspaceFiles(
    workspaceRoot: vscode.Uri,
    ignorePatterns: string[]
): Promise<vscode.Uri[]> {
    const include = new vscode.RelativePattern(workspaceRoot, '**/*');
    const exclude = ignorePatterns.length > 0
        ? new vscode.RelativePattern(workspaceRoot, `{${ignorePatterns.join(',')}}`)
        : null;
    return vscode.workspace.findFiles(include, exclude);
}
