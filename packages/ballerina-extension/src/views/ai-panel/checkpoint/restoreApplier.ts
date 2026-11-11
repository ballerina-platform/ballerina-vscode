/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import { isPathInside } from '@wso2/ballerina-core/lib/utils/path-utils';
import { RestorePlan } from './types';
import { isLosslessUtf8 } from './backends/captureSupport';
import { ArtifactUpdateWait, startArtifactUpdateWait } from '../../../utils/project-artifacts-handler';
import { VisualizerRpcManager } from '../../../rpc-managers/visualizer/rpc-manager';
import { StateMachine, updateView } from '../../../../src/stateMachine';
import { refreshDataMapper } from '../../../../src/rpc-managers/data-mapper/utils';
import { notifyCurrentWebview, suppressWebviewNotifications } from '../../../../src/RPCLayer';

function readFileBytes(fileUri: vscode.Uri): Buffer | null {
    try {
        return fs.readFileSync(fileUri.fsPath);
    } catch {
        return null;
    }
}

export { isLosslessUtf8 };

// Returns null when the path cannot be resolved for any reason other than not existing yet.
// Walking up past an EACCES or ELOOP would rejoin the rest of the path as a plain string, which is
// exactly the lexical comparison the callers resolve symlinks to avoid — so that case fails closed.
export function realPathOfNearestAncestor(target: string): string | null {
    let current = target;
    for (;;) {
        try {
            return path.join(fs.realpathSync(current), path.relative(current, target));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                return null;
            }
            const parent = path.dirname(current);
            if (parent === current) {
                return null;
            }
            current = parent;
        }
    }
}

// Snapshot keys are relative paths from a previous session, so they are only as trustworthy as the
// file they were persisted in. Both sides are resolved through their real paths before comparing:
// a lexical check alone passes a path that leaves the workspace through a directory symlink, and
// resolving only the target would reject legitimate roots, which are themselves often symlinked.
function resolveInsideWorkspace(workspaceRoot: vscode.Uri, filePath: string): vscode.Uri | null {
    const target = path.resolve(workspaceRoot.fsPath, filePath);
    const realRoot = realPathOfNearestAncestor(workspaceRoot.fsPath);
    const realTarget = realPathOfNearestAncestor(target);
    if (!realRoot || !realTarget) {
        return null;
    }
    return isPathInside(realRoot, realTarget) ? vscode.Uri.file(target) : null;
}

function openDocument(fileUri: vscode.Uri): vscode.TextDocument | undefined {
    // Scheme included: an SCM diff (`git:`) document carries the same fsPath as the file it
    // mirrors, and comparing against its HEAD content would skip restoring the real file.
    return vscode.workspace.textDocuments
        .find(doc => doc.uri.scheme === 'file' && doc.uri.fsPath === fileUri.fsPath);
}

export function reportRestoreFailure(error: unknown): void {
    console.error('[Checkpoint] Failed to restore workspace snapshot:', error);
    vscode.window.showErrorMessage('Failed to restore checkpoint: ' + (error as Error).message);
}

export type RestoreProgress = vscode.Progress<{ message?: string }>;

export interface WrittenRestore {
    notRestored: string[];
    artifactWait?: ArtifactUpdateWait;
}

export const RESTORE_PROGRESS_OPTIONS: vscode.ProgressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: 'Restoring checkpoint...',
    cancellable: false
};

export async function writeRestorePlan(
    plan: RestorePlan, progress: RestoreProgress, opts: { skipArtifactWait?: boolean }
): Promise<WrittenRestore> {
    const workspaceRoot = plan.root;
    const skipArtifactWait = opts.skipArtifactWait ?? false;
    let artifactWait: ArtifactUpdateWait | undefined;
    const notRestored: string[] = [...plan.notRestored];

    try {
        const filesToDelete = plan.deletes;

        progress.report({ message: `Preparing ${filesToDelete.length} deletions and ${plan.writes.size} file restorations...` });

        const balFilesToRestore: Array<{ fileUri: vscode.Uri; content: string }> = [];
        const dirtyEditorsToRestore: Array<{ fileUri: vscode.Uri; content: string }> = [];
        const nonBalFilesToRestore: Array<{ fileUri: vscode.Uri; content: Buffer | string }> = [];
        for (const [filePath, entry] of plan.writes) {
            const fileUri = resolveInsideWorkspace(workspaceRoot, filePath);
            if (!fileUri) {
                console.warn(`[Checkpoint] Refusing to write outside the workspace: ${filePath}`);
                notRestored.push(filePath);
                continue;
            }

            let content = entry;
            if (Buffer.isBuffer(content)) {
                if (filePath.endsWith('.bal')) {
                    if (!isLosslessUtf8(content)) {
                        console.warn(`[Checkpoint] Stored .bal content is not valid UTF-8, leaving file untouched: ${filePath}`);
                        notRestored.push(filePath);
                        continue;
                    }
                    content = content.toString('utf8');
                }
            } else if (content.includes('\uFFFD')) {
                console.warn(`[Checkpoint] Snapshot content is a lossy decode, leaving file untouched: ${filePath}`);
                notRestored.push(filePath);
                continue;
            }

            const existing = readFileBytes(fileUri);

            // Both have to agree before a file counts as already restored: an unsaved editor is
            // what the user sees and what saveAll writes back, while an open but unmodified one
            // can still hold pre-generation text after the agent wrote straight to disk.
            // Skipping the rest spares the Language Server a recompile per untouched file.
            const document = openDocument(fileUri);
            const openText = document?.getText();
            if (Buffer.isBuffer(content)) {
                if (existing?.equals(content) && (openText === undefined || openText === content.toString('utf8'))) {
                    continue;
                }
            } else {
                const diskText = existing?.toString('utf8');
                if (diskText === content && (openText === undefined || openText === content)) {
                    continue;
                }
            }

            if (typeof content === 'string' && filePath.endsWith('.bal')) {
                balFilesToRestore.push({ fileUri, content });
            } else if (document?.isDirty && (typeof content === 'string' || isLosslessUtf8(content))) {
                // saveAll would write the unsaved text back over an fs write, so the editor is replaced instead.
                dirtyEditorsToRestore.push({ fileUri, content: content.toString('utf8') });
            } else {
                nonBalFilesToRestore.push({ fileUri, content });
            }
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

        // Asked before anything is written, because this is the irreversible half: the snapshot
        // holds no copy of a file it never captured, so the trash is the only way back.
        const useTrash = vscode.workspace.getConfiguration('files').get<boolean>('enableTrash', true);
        const deleteCount = balFilesToDelete.length + nonBalFilesToDelete.length;
        if (deleteCount > 0) {
            const names = [...balFilesToDelete, ...nonBalFilesToDelete.map(f => f.fileUri)]
                .slice(0, 5)
                .map(uri => path.relative(workspaceRoot.fsPath, uri.fsPath))
                .join(', ');
            const more = deleteCount > 5 ? ` and ${deleteCount - 5} more` : '';
            // The prompt has to name the outcome the setting actually produces: with the trash
            // off these deletions are permanent, and the snapshot holds no copy to undo them with.
            const removeLabel = useTrash ? 'Move to Trash' : 'Delete Permanently';
            const consequence = useTrash
                ? 'They can be recovered from the trash.'
                : 'They cannot be recovered — the trash is disabled in your settings.';
            const choice = await vscode.window.showWarningMessage(
                `Restoring this checkpoint removes ${deleteCount} file(s) it does not contain: ${names}${more}. ${consequence}`,
                { modal: true },
                removeLabel,
                'Keep Them'
            );
            if (choice === undefined) {
                throw new Error('cancelled');
            }
            if (choice === 'Keep Them') {
                for (const fileUri of balFilesToDelete) {
                    notRestored.push(path.relative(workspaceRoot.fsPath, fileUri.fsPath));
                }
                for (const { filePath } of nonBalFilesToDelete) {
                    notRestored.push(filePath);
                }
                balFilesToDelete.length = 0;
                nonBalFilesToDelete.length = 0;
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
            // Follows the user's own trash setting rather than a hardcoded choice — the same
            // setting WorkspaceEdit honours for the .bal deletions, and the one the prompt named.
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

            const editorRestores = [...balFilesToRestore, ...dirtyEditorsToRestore];
            if (balFilesToDelete.length > 0 || editorRestores.length > 0) {
                const balEdit = new vscode.WorkspaceEdit();
                for (const fileUri of balFilesToDelete) {
                    balEdit.deleteFile(fileUri, { ignoreIfNotExists: true });
                }
                for (const { fileUri } of balFilesToRestore) {
                    balEdit.createFile(fileUri, { ignoreIfExists: true });
                }
                for (const { fileUri, content } of editorRestores) {
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
        return { notRestored, artifactWait };
    } catch (error) {
        artifactWait?.cancel();
        throw error;
    }
}

// Everything here is advisory, and deliberately outside the progress block: the files are written
// and saved by now, so a view that fails to refresh, or an artifact update that never arrives,
// must not turn a completed restore into a failed one.
export async function finishRestore(written: WrittenRestore): Promise<void> {
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

    if (written.artifactWait && !(await written.artifactWait.notified)) {
        console.warn('[Checkpoint] No artifact update notification arrived; the workspace was still restored');
    }

    const { notRestored } = written;
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
}

export function restoreFailed(error: unknown): false {
    if ((error as Error).message === 'cancelled') {
        console.log('[Checkpoint] Restore cancelled at the deletion prompt');
        return false;
    }
    reportRestoreFailure(error);
    return false;
}

export async function applyRestorePlan(plan: RestorePlan, opts: { skipArtifactWait?: boolean }): Promise<boolean> {
    try {
        const written = await vscode.window.withProgress(
            RESTORE_PROGRESS_OPTIONS, progress => writeRestorePlan(plan, progress, opts)
        );
        await finishRestore(written);
        return true;
    } catch (error) {
        return restoreFailed(error);
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
