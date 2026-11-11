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

import * as crypto from 'crypto';
import type { Checkpoint, CheckpointFileEntry } from '@wso2/ballerina-core/lib/state-machine-types';
import {
    BlobStore,
    CaptureContext,
    CaptureResult,
    CheckpointBackend,
    CheckpointBlobCorruptError,
    CheckpointContentUnavailableError,
    CheckpointTooLargeError,
    ResolvedContent,
    ScannedFile,
} from '../types';
import { inChunks, readFileBytes, resolveCaptureLimits } from './captureSupport';

type HashEntry = Extract<CheckpointFileEntry, { hash: string }>;
type Limits = CaptureContext['limits'];
type Stored = { entry: CheckpointFileEntry; createdBytes: number };

// Same-second and coarse-mtime filesystems can edit a file without moving its mtime past the capture.
const MTIME_GUARD_MS = 2000;
const GC_MIN_AGE_MS = 60 * 60 * 1000;
const BASELINE_LIMIT_FACTOR = 10;

const isHashEntry = (entry: CheckpointFileEntry | undefined): entry is HashEntry =>
    !!entry && 'hash' in entry;

// Identical files read in the same chunk can each see created: true for one blob.
function countOnce(stored: Stored, counted: Set<string>): number {
    if (!isHashEntry(stored.entry) || stored.createdBytes === 0 || counted.has(stored.entry.hash)) {
        return 0;
    }
    counted.add(stored.entry.hash);
    return stored.createdBytes;
}

const isSkippedEntry = (entry: unknown): entry is Exclude<CheckpointFileEntry, HashEntry> =>
    typeof entry === 'object' && entry !== null && 'skipped' in entry;

const sha256 = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');

export class ContentStoreBackend implements CheckpointBackend {
    readonly kind = 'content-store' as const;

    constructor(private readonly store: BlobStore) {}

    async capture(ctx: CaptureContext): Promise<CaptureResult> {
        const limits = resolveCaptureLimits(ctx.limits);
        // Capping the baseline at the turn limit would leave the workspace unrevertible every turn.
        if (!ctx.previous) {
            limits.maxNewBytes *= BASELINE_LIMIT_FACTOR;
        }
        const files: Record<string, CheckpointFileEntry> = {};
        const counted = new Set<string>();
        let newBytes = 0;

        for (const chunk of inChunks(ctx.files)) {
            const stored = await Promise.all(chunk.map(file => this.captureFile(file, ctx, limits)));
            chunk.forEach((file, i) => {
                files[file.path] = stored[i].entry;
                newBytes += countOnce(stored[i], counted);
            });
            if (newBytes > limits.maxNewBytes) {
                throw new CheckpointTooLargeError(`Checkpoint exceeded max new bytes (${newBytes} bytes)`);
            }
        }

        newBytes += await this.restoreMissingBlobs(ctx.files, files, limits, counted);
        if (newBytes > limits.maxNewBytes) {
            throw new CheckpointTooLargeError(`Checkpoint exceeded max new bytes (${newBytes} bytes)`);
        }

        const skipped: CaptureResult['skipped'] = [];
        for (const [p, entry] of Object.entries(files)) {
            if (!isHashEntry(entry)) {
                skipped.push({ path: p, reason: entry.skipped });
            }
        }
        return { fields: { storage: { kind: 'content-store', files } }, newBytes, skipped };
    }

    async restoreCandidates(cp: Checkpoint, current: ScannedFile[]): Promise<string[]> {
        const byPath = new Map(current.map(file => [file.path, file]));
        const stored = Object.entries(this.filesOf(cp)).filter((e): e is [string, HashEntry] => isHashEntry(e[1]));
        const candidates: string[] = [];
        for (const chunk of inChunks(stored)) {
            const differs = await Promise.all(chunk.map(async ([p, entry]) => {
                const file = byPath.get(p);
                if (!file || file.size !== entry.size) {
                    return true;
                }
                const bytes = await readFileBytes(file);
                return !bytes || sha256(bytes) !== entry.hash;
            }));
            chunk.forEach(([p], i) => differs[i] && candidates.push(p));
        }
        return candidates;
    }

    async changedUnstored(cp: Checkpoint, current: ScannedFile[]): Promise<string[]> {
        const byPath = new Map(current.map(file => [file.path, file]));
        return Object.entries(this.filesOf(cp))
            .filter(([p, entry]) => {
                const file = byPath.get(p);
                return isSkippedEntry(entry) && (!file || file.size !== entry.size || file.mtimeMs !== entry.mtimeMs);
            })
            .map(([p]) => p);
    }

    canReuseAsPrevious(cp: Checkpoint): boolean {
        return cp.storage?.kind === 'content-store';
    }

    hasStoredContent(): boolean {
        return this.store.exists();
    }

    async resolve(cp: Checkpoint, paths: string[]): Promise<Map<string, ResolvedContent>> {
        const files = this.filesOf(cp);
        const listed = new Set(cp.fileList);
        const resolved = new Map<string, ResolvedContent>();
        for (const chunk of inChunks(paths)) {
            const contents = await Promise.all(chunk.map(p => {
                const entry = Object.prototype.hasOwnProperty.call(files, p) ? files[p] : undefined;
                return this.resolveEntry(p, entry, listed.has(p));
            }));
            chunk.forEach((p, i) => resolved.set(p, contents[i]));
        }
        return resolved;
    }

    references(cp: Checkpoint): Iterable<string> {
        if (cp.storage?.kind !== 'content-store') {
            return [];
        }
        return new Set(Object.values(cp.storage.files).filter(isHashEntry).map(entry => entry.hash));
    }

    collectGarbage(live: ReadonlySet<string>, minAgeMs = GC_MIN_AGE_MS): Promise<number> {
        return this.store.sweep(live, minAgeMs);
    }

    private async captureFile(file: ScannedFile, ctx: CaptureContext, limits: Limits): Promise<Stored> {
        const previous = this.reusableEntry(file, ctx);
        if (previous && await this.store.touch(previous.hash)) {
            return { entry: { ...previous }, createdBytes: 0 };
        }
        return this.storeFile(file, limits);
    }

    private reusableEntry(file: ScannedFile, ctx: CaptureContext): HashEntry | undefined {
        const previous = ctx.previous;
        if (previous?.storage?.kind !== 'content-store' || previous.workspaceRoot !== ctx.workspaceRoot) {
            return undefined;
        }
        const entry = previous.storage.files[file.path];
        if (!isHashEntry(entry) || entry.size !== file.size || entry.mtimeMs !== file.mtimeMs) {
            return undefined;
        }
        // A 0 mtime means the scan could not stat the file; previous.timestamp is when that scan started.
        if (file.mtimeMs === 0 || file.mtimeMs > previous.timestamp - MTIME_GUARD_MS) {
            return undefined;
        }
        return entry;
    }

    // A sweep in another window can unlink a reused blob after this capture touched it; the in-window lock can't stop that.
    private async restoreMissingBlobs(
        scanned: ScannedFile[], files: Record<string, CheckpointFileEntry>, limits: Limits, counted: Set<string>
    ): Promise<number> {
        const hashes = [...new Set(Object.values(files).filter(isHashEntry).map(entry => entry.hash))];
        const missing = new Set<string>();
        for (const chunk of inChunks(hashes)) {
            const present = await Promise.all(chunk.map(hash => this.store.has(hash)));
            chunk.forEach((hash, i) => present[i] || missing.add(hash));
        }
        if (missing.size === 0) {
            return 0;
        }
        const byPath = new Map(scanned.map(file => [file.path, file]));
        let createdBytes = 0;
        for (const [p, entry] of Object.entries(files)) {
            const file = byPath.get(p);
            if (isHashEntry(entry) && missing.has(entry.hash) && file) {
                const stored = await this.storeFile(file, limits);
                files[p] = stored.entry;
                createdBytes += countOnce(stored, counted);
            }
        }
        return createdBytes;
    }

    private async storeFile(file: ScannedFile, limits: Limits): Promise<Stored> {
        const { size, mtimeMs } = file;
        if (size > limits.maxFileSize) {
            return { entry: { skipped: 'tooLarge', size, mtimeMs }, createdBytes: 0 };
        }
        const bytes = await readFileBytes(file);
        if (!bytes) {
            return { entry: { skipped: 'unreadable', size, mtimeMs }, createdBytes: 0 };
        }
        if (bytes.length > limits.maxFileSize) {
            return { entry: { skipped: 'tooLarge', size: bytes.length, mtimeMs }, createdBytes: 0 };
        }
        const { id, created } = await this.store.put(bytes);
        return { entry: { hash: id, size: bytes.length, mtimeMs }, createdBytes: created ? bytes.length : 0 };
    }

    private async resolveEntry(p: string, entry: CheckpointFileEntry | undefined, listed: boolean): Promise<ResolvedContent> {
        if (!entry) {
            return listed ? { state: 'unavailable', reason: 'unreadable' } : { state: 'absent' };
        }
        if (!isHashEntry(entry)) {
            return { state: 'unavailable', reason: entry.skipped };
        }
        let bytes: Buffer | undefined;
        try {
            bytes = await this.store.get(entry.hash);
        } catch (error) {
            if (error instanceof CheckpointBlobCorruptError) {
                throw Object.assign(
                    new CheckpointContentUnavailableError(`Checkpoint content for ${p} is corrupt`),
                    { cause: error }
                );
            }
            throw error;
        }
        if (!bytes) {
            throw new CheckpointContentUnavailableError(`Checkpoint content for ${p} is missing`);
        }
        return { state: 'content', bytes };
    }

    private filesOf(cp: Checkpoint): Record<string, CheckpointFileEntry> {
        if (cp.storage?.kind !== 'content-store') {
            throw new Error(`Not a content-store checkpoint: ${cp.storage?.kind ?? 'inline'}`);
        }
        return cp.storage.files;
    }
}
