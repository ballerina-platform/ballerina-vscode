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
import { isPathInside } from '@wso2/ballerina-core/lib/utils/path-utils';
import { getCheckpointConfig } from './checkpointConfig';
import { ArtifactUpdateWait, startArtifactUpdateWait } from '../../../utils/project-artifacts-handler';
import { VisualizerRpcManager } from '../../../rpc-managers/visualizer/rpc-manager';
import { StateMachine, updateView } from '../../../../src/stateMachine';
import { refreshDataMapper } from '../../../../src/rpc-managers/data-mapper/utils';
import { notifyCurrentWebview, suppressWebviewNotifications } from '../../../../src/RPCLayer';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

function readFileBytes(fileUri: vscode.Uri): Buffer | null {
    try {
        return fs.readFileSync(fileUri.fsPath);
    } catch {
        return null;
    }
}

// A snapshot holds decoded strings, so bytes that do not round-trip through UTF-8 were never
// captured faithfully — writing one back replaces real bytes with U+FFFD.
function isLosslessUtf8(bytes: Buffer): boolean {
    return Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes);
}

// Snapshot keys are relative paths from a previous session, so they are only as trustworthy as the
// file they were persisted in: resolve first, then refuse anything that lands outside the workspace.
function resolveInsideWorkspace(workspaceRoot: vscode.Uri, filePath: string): vscode.Uri | null {
    const target = path.resolve(workspaceRoot.fsPath, filePath);
    return isPathInside(workspaceRoot.fsPath, target) ? vscode.Uri.file(target) : null;
}

function openDocumentText(fileUri: vscode.Uri): string | undefined {
    // Scheme included: an SCM diff (`git:`) document carries the same fsPath as the file it
    // mirrors, and comparing against its HEAD content would skip restoring the real file.
    return vscode.workspace.textDocuments
        .find(doc => doc.uri.scheme === 'file' && doc.uri.fsPath === fileUri.fsPath)
        ?.getText();
}

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

        // Read in bounded-concurrency chunks: one-at-a-time reads dominate run-start
        // latency on large workspaces, while unbounded Promise.all can exhaust file
        // handles. Hand-rolled rather than mapWithConcurrency because the size cap must
        // be able to abort between batches, which that helper cannot express; chunks
        // also keep fileList in findFiles order.
        const READ_CONCURRENCY = 32;
        for (let i = 0; i < allFiles.length; i += READ_CONCURRENCY) {
            const chunk = allFiles.slice(i, i + READ_CONCURRENCY);
            const chunkContents = await Promise.all(chunk.map(async fileUri => {
                try {
                    const fileContent = await vscode.workspace.fs.readFile(fileUri);
                    return { fileUri, bytes: Buffer.from(fileContent) };
                } catch (error) {
                    console.error(`[Checkpoint] Failed to read file ${fileUri.fsPath}:`, error);
                    return null;
                }
            }));

            for (const entry of chunkContents) {
                if (!entry) { continue; }
                const relativePath = path.relative(workspaceRoot.fsPath, entry.fileUri.fsPath).split(path.sep).join('/');
                fileList.push(relativePath);

                // Listed but not snapshotted: a snapshot holds strings, so bytes that do not survive
                // a UTF-8 round trip cannot be reproduced. Being in fileList keeps a restore from
                // deleting it; being out of the snapshot keeps a restore from writing a lossy decode
                // over it. Its size is not counted either — nothing is stored for it.
                if (!isLosslessUtf8(entry.bytes)) {
                    continue;
                }

                const content = entry.bytes.toString('utf8');
                workspaceSnapshot[relativePath] = content;
                totalSize += content.length;
            }

            if (totalSize > config.maxSnapshotSize) {
                // Fail closed rather than save a partial checkpoint that silently leaves
                // later-scanned files unrevertible on restore.
                console.warn(`[Checkpoint] Snapshot size exceeded max limit (${totalSize} bytes) — aborting capture, no partial checkpoint will be saved`);
                vscode.window.showWarningMessage(
                    `Workspace is too large to checkpoint (exceeds ${Math.round(config.maxSnapshotSize / 1024 / 1024)}MB). This generation will not be revertible.`
                );
                return null;
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

/**
 * Restores the workspace to a checkpoint snapshot. Returns {@code true} only when the restore
 * actually applied; callers that mark a generation reverted (and tell the model its changes were
 * undone) must gate that on the return value, since a failed {@code applyEdit} is reported to the
 * user here but not thrown.
 */
export async function restoreWorkspaceSnapshot(checkpoint: Checkpoint, skipArtifactWait = false): Promise<boolean> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder found');
    }

    const workspaceRoot = workspaceFolders[0].uri;
    let artifactWait: ArtifactUpdateWait | undefined;
    const notRestored: string[] = [];

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

            progress.report({ message: `Preparing ${filesToDelete.length} deletions and ${checkpoint.fileList.length} file restorations...` });

            const balFilesToRestore: Array<{ fileUri: vscode.Uri; content: string }> = [];
            const nonBalFilesToRestore: Array<{ fileUri: vscode.Uri; content: string }> = [];
            for (const [filePath, content] of Object.entries(checkpoint.workspaceSnapshot)) {
                const fileUri = resolveInsideWorkspace(workspaceRoot, filePath);
                if (!fileUri) {
                    console.warn(`[Checkpoint] Refusing to write outside the workspace: ${filePath}`);
                    notRestored.push(filePath);
                    continue;
                }

                if (content.includes('\uFFFD')) {
                    console.warn(`[Checkpoint] Snapshot content is a lossy decode, leaving file untouched: ${filePath}`);
                    notRestored.push(filePath);
                    continue;
                }

                const existing = readFileBytes(fileUri);

                // Both have to agree before a file counts as already restored: an unsaved editor is
                // what the user sees and what saveAll writes back, while an open but unmodified one
                // can still hold pre-generation text after the agent wrote straight to disk.
                // Skipping the rest spares the Language Server a recompile per untouched file.
                const openText = openDocumentText(fileUri);
                const diskText = existing?.toString('utf8');
                if (diskText === content && (openText === undefined || openText === content)) {
                    continue;
                }

                (filePath.endsWith('.bal') ? balFilesToRestore : nonBalFilesToRestore).push({ fileUri, content });
            }

            const balFilesToDelete: vscode.Uri[] = [];
            const nonBalFilesToDelete: Array<{ fileUri: vscode.Uri; filePath: string }> = [];
            for (const filePath of filesToDelete) {
                const fileUri = resolveInsideWorkspace(workspaceRoot, filePath);
                if (!fileUri) {
                    console.warn(`[Checkpoint] Refusing to delete outside the workspace: ${filePath}`);
                    continue;
                }
                if (filePath.endsWith('.bal')) {
                    balFilesToDelete.push(fileUri);
                } else {
                    nonBalFilesToDelete.push({ fileUri, filePath });
                }
            }

            progress.report({ message: 'Applying workspace changes...' });

            // Armed before the edits: the notification has no replay, so a Language Server that
            // answers the edit before the restore reaches its own wait would be missed entirely.
            if (!skipArtifactWait && (balFilesToRestore.length > 0 || balFilesToDelete.length > 0)) {
                artifactWait = startArtifactUpdateWait(
                    artifacts => new VisualizerRpcManager().updateCurrentArtifactLocation({ artifacts })
                );
            }

            const resumeNotifications = suppressWebviewNotifications();
            let success = true;
            const failed: string[] = [];
            try {
                // Non-.bal files go through fs directly (mirrors addToIntegration's split):
                // WorkspaceEdit.replace() silently no-ops on a file with no open TextDocument,
                // which is never true for .bal files but always true for the rest.
                // Each file is isolated: one unwritable path must not abandon the rest half-restored.
                // The snapshot holds no copy of a file it never captured, so this deletion is the
                // user's only copy. Which is why it follows their own trash setting rather than a
                // hardcoded choice — the same setting WorkspaceEdit honours for the .bal deletions.
                const useTrash = vscode.workspace.getConfiguration('files').get<boolean>('enableTrash', true);
                for (const { fileUri, filePath } of nonBalFilesToDelete) {
                    if (!fs.existsSync(fileUri.fsPath)) {
                        continue;
                    }
                    try {
                        await vscode.workspace.fs.delete(fileUri, { useTrash });
                    } catch (error) {
                        // Trash enabled but refused (a provider without trash support, or a cancelled
                        // confirmation): leaving the file beats destroying the only copy of it.
                        console.warn(`[Checkpoint] Could not delete ${filePath}, leaving it in place:`, error);
                        notRestored.push(filePath);
                    }
                }
                for (const { fileUri, content } of nonBalFilesToRestore) {
                    try {
                        const directory = path.dirname(fileUri.fsPath);
                        if (!fs.existsSync(directory)) {
                            fs.mkdirSync(directory, { recursive: true });
                        }
                        fs.writeFileSync(fileUri.fsPath, content, 'utf8');
                    } catch (error) {
                        failed.push(`${path.basename(fileUri.fsPath)} (${(error as Error).message})`);
                    }
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
            if (failed.length > 0) {
                throw new Error(`could not write ${failed.length} file(s): ${failed.slice(0, 3).join(', ')}`);
            }

            progress.report({ message: 'Checkpoint restored successfully!' });
        });

        // Everything from here is advisory, and deliberately outside the block above: the files are
        // written and saved by now, so a view that fails to refresh, or an artifact update that
        // never arrives, must not turn a completed restore into a failed one.
        try {
            await renderDatamapper();
        } catch (error) {
            console.warn('[Checkpoint] Could not refresh the data mapper after the restore:', error);
        }
        try {
            notifyCurrentWebview();
        } catch (error) {
            console.warn('[Checkpoint] Could not notify the webview after the restore:', error);
        }

        if (artifactWait && !(await artifactWait.notified)) {
            console.warn('[Checkpoint] No artifact update notification arrived; the workspace was still restored');
        }

        if (notRestored.length > 0) {
            const shown = notRestored.slice(0, 5).join(', ');
            const rest = notRestored.length - 5;
            vscode.window.showWarningMessage(
                `Checkpoint restored, except for ${notRestored.length} file(s) left as they are: ` +
                `${shown}${rest > 0 ? ` and ${rest} more` : ''}`
            );
        } else {
            vscode.window.showInformationMessage('Checkpoint restored successfully');
        }
        return true;
    } catch (error) {
        artifactWait?.cancel();
        console.error('[Checkpoint] Failed to restore workspace snapshot:', error);
        vscode.window.showErrorMessage('Failed to restore checkpoint: ' + (error as Error).message);
        return false;
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
