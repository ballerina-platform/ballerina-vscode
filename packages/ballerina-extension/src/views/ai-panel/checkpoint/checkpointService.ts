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
import type { Checkpoint, CheckpointStorage } from '@wso2/ballerina-core/lib/state-machine-types';
import { isSamePath } from '@wso2/ballerina-core/lib/utils/path-utils';
import { CopilotPersistenceStore, CURRENT_CHECKPOINT_SCHEMA_VERSION } from '@wso2/copilot-utilities/chat-persistence';
import { CheckpointConfig, getCheckpointConfig } from './checkpointConfig';
import { scanWorkspace } from './workspaceScanner';
import {
    finishRestore,
    realPathOfNearestAncestor,
    RESTORE_PROGRESS_OPTIONS,
    restoreFailed,
    RestoreProgress,
    writeRestorePlan,
    WrittenRestore,
} from './restoreApplier';
import {
    CheckpointBackend,
    CheckpointContentUnavailableError,
    CheckpointNotifier,
    CheckpointTooLargeError,
    CheckpointUnknownFormatError,
    OriginalContent,
    RestorePlan,
    SUPPORTED_CHECKPOINT_SCHEMA_VERSION,
} from './types';
import { InlineSnapshotBackend } from './backends/inlineSnapshotBackend';
import { ContentStoreBackend } from './backends/contentStoreBackend';
import { resolveCaptureLimits } from './backends/captureSupport';
import { blobStoreDir, FsBlobStore } from './blobStore';
import { checkpointNotifier } from './checkpointNotifier';
import { resolveWorkspaceIdentity } from '../workspaceIdentity';

type StorageKind = CheckpointStorage['kind'];

export interface CheckpointServiceDeps {
    backends: CheckpointBackend[];
    defaultKind: StorageKind;
    config: () => CheckpointConfig;
    notify: CheckpointNotifier;
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

const isRecord = (value: unknown): boolean =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const toPosix = (p: string) => p.split(path.sep).join('/');

export class CheckpointService {
    private readonly backends = new Map<string, CheckpointBackend>();
    // The blobs of an over-limit turn stay stored, so a fresh baseline takes them in instead of hitting the limit again.
    private baselineNext = false;

    constructor(private readonly deps: CheckpointServiceDeps) {
        if (CURRENT_CHECKPOINT_SCHEMA_VERSION !== SUPPORTED_CHECKPOINT_SCHEMA_VERSION) {
            throw new Error(
                `Checkpoint schema ${CURRENT_CHECKPOINT_SCHEMA_VERSION} does not match the supported version ${SUPPORTED_CHECKPOINT_SCHEMA_VERSION}`
            );
        }
        for (const backend of deps.backends) {
            this.backends.set(backend.kind, backend);
        }
        if (!this.backends.has(deps.defaultKind)) {
            throw new Error(`No checkpoint backend registered for '${deps.defaultKind}'`);
        }
    }

    get defaultKind(): StorageKind {
        return this.deps.defaultKind;
    }

    pickPrevious(candidates: Iterable<Checkpoint>): Checkpoint | undefined {
        const backend = this.backends.get(this.deps.defaultKind)!;
        let newest: Checkpoint | undefined;
        for (const cp of candidates) {
            if (backend.canReuseAsPrevious(cp) && (!newest || cp.timestamp > newest.timestamp)) {
                newest = cp;
            }
        }
        return newest;
    }

    hasStoredContent(): boolean {
        return [...this.backends.values()].some(backend => backend.hasStoredContent());
    }

    async capture(messageId: string, opts: { previous?: Checkpoint } = {}): Promise<Checkpoint | null> {
        const config = this.deps.config();

        if (!config.enabled) {
            return null;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            console.warn('[Checkpoint] No workspace folder found');
            return null;
        }

        const workspaceRoot = workspaceFolders[0].uri;
        const limits = resolveCaptureLimits({ maxFileSize: config.maxFileSize, maxNewBytes: config.maxSnapshotSize });

        try {
            const scanStartedAt = Date.now();
            const allFiles = await scanWorkspace(workspaceRoot, config.ignorePatterns);
            const result = await this.backends.get(this.deps.defaultKind)!.capture({
                workspaceRoot: workspaceRoot.fsPath,
                files: allFiles,
                previous: this.baselineNext ? undefined : opts.previous,
                limits
            });
            this.baselineNext = false;

            const tooLarge = result.skipped.filter(s => s.reason === 'tooLarge').map(s => s.path);
            if (tooLarge.length > 0) {
                this.deps.notify.largeFilesSkipped(tooLarge);
            }

            return {
                id: generateId(),
                messageId,
                timestamp: scanStartedAt,
                ...result.fields,
                fileList: allFiles.map(file => file.path),
                snapshotSize: result.newBytes,
                workspaceRoot: workspaceRoot.fsPath,
                ignorePatterns: config.ignorePatterns,
                schemaVersion: SUPPORTED_CHECKPOINT_SCHEMA_VERSION
            };
        } catch (error) {
            if (error instanceof CheckpointTooLargeError) {
                // Fail closed rather than save a partial checkpoint that silently leaves
                // later-scanned files unrevertible on restore.
                console.warn(`[Checkpoint] ${error.message} — aborting capture, no partial checkpoint will be saved`);
                this.baselineNext = true;
                this.deps.notify.tooLarge();
                return null;
            }
            console.error('[Checkpoint] Failed to capture workspace snapshot:', error);
            vscode.window.showErrorMessage('Failed to create checkpoint: ' + (error as Error).message);
            return null;
        }
    }

    /**
     * Restores the workspace to a checkpoint. Returns {@code true} only when the restore actually
     * applied; callers that mark a generation reverted (and tell the model its changes were undone)
     * must gate that on the return value, since a failed {@code applyEdit} is reported to the user
     * here but not thrown.
     */
    async restore(cp: Checkpoint, opts: { skipArtifactWait?: boolean } = {}): Promise<boolean> {
        const backend = this.backendFor(cp);
        if (!backend) {
            this.deps.notify.unknownFormat();
            return false;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder found');
        }

        const workspaceRoot = workspaceFolders[0].uri;

        // Paths in a snapshot mean nothing without the root they were taken against: re-rooting one
        // into a different workspace rewrites files that never belonged to it and deletes everything
        // the snapshot does not list. Checkpoints captured before the root was recorded carry none,
        // and are let through rather than making every existing one unrevertible.
        const capturedRoot = cp.workspaceRoot && realPathOfNearestAncestor(cp.workspaceRoot);
        const currentRoot = realPathOfNearestAncestor(workspaceRoot.fsPath);
        if (cp.workspaceRoot && (!capturedRoot || !currentRoot || !isSamePath(capturedRoot, currentRoot))) {
            const reason = `This checkpoint was taken in a different workspace (${cp.workspaceRoot}), so it cannot be restored here.`;
            console.error(`[Checkpoint] Refusing a cross-root restore: ${reason}`);
            vscode.window.showErrorMessage(`Cannot restore checkpoint: ${reason}`);
            return false;
        }

        try {
            const written = await vscode.window.withProgress(
                RESTORE_PROGRESS_OPTIONS,
                async (progress): Promise<WrittenRestore | null> => {
                    const plan = await this.planRestore(cp, backend, workspaceRoot, progress);
                    return plan && writeRestorePlan(plan, progress, opts);
                }
            );
            if (!written) {
                return false;
            }
            await finishRestore(written);
            return true;
        } catch (error) {
            return restoreFailed(error);
        }
    }

    async readOriginals(cp: Checkpoint, paths: string[]): Promise<Map<string, OriginalContent>> {
        const backend = this.backendFor(cp);
        if (!backend) {
            throw new CheckpointUnknownFormatError();
        }
        const posixPaths = paths.map(toPosix);
        try {
            return await backend.resolve(cp, posixPaths);
        } catch (error) {
            if (!(error instanceof CheckpointContentUnavailableError)) {
                throw error;
            }
        }
        const originals = new Map<string, OriginalContent>();
        for (const p of posixPaths) {
            try {
                originals.set(p, (await backend.resolve(cp, [p])).get(p));
            } catch (error) {
                if (!(error instanceof CheckpointContentUnavailableError)) {
                    throw error;
                }
                originals.set(p, { state: 'unavailable', reason: 'unreadable' });
            }
        }
        return originals;
    }

    async collectGarbage(live: Iterable<Checkpoint>, opts: { minAgeMs?: number } = {}): Promise<void> {
        const referenced = new Set<string>();
        for (const cp of live) {
            const backend = this.backendFor(cp);
            // Its references are unknown, so any blob may be one of them.
            if (!backend) {
                console.warn(`[Checkpoint] Skipping garbage collection: checkpoint ${cp.id} has an unknown format`);
                return;
            }
            for (const id of backend.references(cp)) {
                referenced.add(id);
            }
        }
        for (const backend of this.backends.values()) {
            await backend.collectGarbage(referenced, opts.minAgeMs);
        }
    }

    private backendFor(cp: Checkpoint): CheckpointBackend | undefined {
        if ((cp.schemaVersion ?? SUPPORTED_CHECKPOINT_SCHEMA_VERSION) > SUPPORTED_CHECKPOINT_SCHEMA_VERSION) {
            return undefined;
        }
        const storage = cp.storage as { kind?: unknown; files?: unknown } | undefined;
        const kind = storage === undefined ? 'inline' : storage.kind;
        if (kind === 'inline' && !isRecord(cp.workspaceSnapshot)) {
            return undefined;
        }
        if (kind === 'content-store' && !isRecord(storage?.files)) {
            return undefined;
        }
        return typeof kind === 'string' ? this.backends.get(kind) : undefined;
    }

    private async planRestore(
        cp: Checkpoint, backend: CheckpointBackend, workspaceRoot: vscode.Uri, progress: RestoreProgress
    ): Promise<RestorePlan | null> {
        progress.report({ message: 'Comparing the workspace with the checkpoint...' });
        // The patterns the snapshot was taken under, not today's: a pattern removed since would
        // turn everything it used to hide into "not in the snapshot", and delete it.
        const ignorePatterns = cp.ignorePatterns ?? this.deps.config().ignorePatterns;
        const currentFiles = await scanWorkspace(workspaceRoot, ignorePatterns);
        const changedUnstored = await backend.changedUnstored(cp, currentFiles);

        const candidates = new Set([
            ...await backend.restoreCandidates(cp, currentFiles),
            ...changedUnstored,
        ]);

        let resolved: Map<string, OriginalContent>;
        try {
            resolved = await backend.resolve(cp, [...candidates]);
        } catch (error) {
            if (error instanceof CheckpointContentUnavailableError) {
                this.deps.notify.contentUnavailable(error.message);
                return null;
            }
            throw error;
        }

        const changed = new Set(changedUnstored);
        const writes: RestorePlan['writes'] = new Map();
        const notRestored: string[] = [];
        for (const [p, content] of resolved) {
            if (content.state === 'content') {
                // Inline content keeps the string form, so the applier still refuses a lossy decode.
                writes.set(p, backend.kind === 'inline' ? content.bytes.toString('utf8') : content.bytes);
            } else if (content.state === 'unavailable' && changed.has(p)) {
                notRestored.push(p);
            }
        }

        const listed = new Set(cp.fileList);
        return {
            root: workspaceRoot,
            writes,
            deletes: currentFiles.map(file => file.path).filter(filePath => !listed.has(filePath)),
            notRestored
        };
    }
}

const services = new Map<string, CheckpointService>();

export function createCheckpointService(projectRootPath: string, defaultKind: StorageKind): CheckpointService {
    const persistenceStore = new CopilotPersistenceStore({ workspaceIdResolver: resolveWorkspaceIdentity });
    const store = new FsBlobStore(blobStoreDir(persistenceStore.getWorkspaceDir(projectRootPath)));
    return new CheckpointService({
        backends: [new InlineSnapshotBackend(), new ContentStoreBackend(store)],
        defaultKind,
        config: getCheckpointConfig,
        notify: checkpointNotifier,
    });
}

export function getCheckpointService(projectRootPath: string, defaultKind: StorageKind = 'content-store'): CheckpointService {
    const key = `${defaultKind}:${path.resolve(projectRootPath)}`;
    let service = services.get(key);
    if (!service) {
        service = createCheckpointService(projectRootPath, defaultKind);
        services.set(key, service);
    }
    return service;
}
