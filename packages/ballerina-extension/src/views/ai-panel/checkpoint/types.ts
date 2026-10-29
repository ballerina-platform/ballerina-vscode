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

import type * as vscode from 'vscode';
import type { Checkpoint, CheckpointStorage } from '@wso2/ballerina-core';

export const SUPPORTED_CHECKPOINT_SCHEMA_VERSION = 2;

export interface ScannedFile {
    path: string;
    uri: vscode.Uri;
    size: number;
    mtimeMs: number;
}

export interface CaptureContext {
    workspaceRoot: string;
    files: ScannedFile[];
    previous?: Checkpoint;
    limits: { maxFileSize: number; maxNewBytes: number };
}

export interface CaptureResult {
    fields: Pick<Checkpoint, 'storage'> & Partial<Pick<Checkpoint, 'workspaceSnapshot'>>;
    newBytes: number;
    skipped: { path: string; reason: 'tooLarge' | 'unreadable' }[];
}

export type ResolvedContent =
    | { state: 'content'; bytes: Buffer }
    | { state: 'absent' }
    | { state: 'unavailable'; reason: 'tooLarge' | 'unreadable' };

export type OriginalContent = ResolvedContent;

export interface CheckpointBackend {
    readonly kind: CheckpointStorage['kind'];
    capture(ctx: CaptureContext): Promise<CaptureResult>;
    restoreCandidates(cp: Checkpoint, current: ScannedFile[]): Promise<string[]>;
    changedUnstored(cp: Checkpoint, current: ScannedFile[]): Promise<string[]>;
    canReuseAsPrevious(cp: Checkpoint): boolean;
    hasStoredContent(): boolean;
    resolve(cp: Checkpoint, paths: string[]): Promise<Map<string, ResolvedContent>>;
    references(cp: Checkpoint): Iterable<string>;
    collectGarbage(live: ReadonlySet<string>, minAgeMs?: number): Promise<number>;
}

export interface BlobStore {
    put(bytes: Buffer): Promise<{ id: string; created: boolean }>;
    get(id: string): Promise<Buffer | undefined>;
    touch(id: string): Promise<boolean>;
    has(id: string): Promise<boolean>;
    remove(id: string): Promise<void>;
    sweep(live: ReadonlySet<string>, minAgeMs: number): Promise<number>;
    exists(): boolean;
}

export interface RestorePlan {
    root: vscode.Uri;
    writes: Map<string, Buffer | string>;
    deletes: string[];
    notRestored: string[];
}

export interface CheckpointNotifier {
    tooLarge(): void;
    largeFilesSkipped(paths: string[]): void;
    unknownFormat(): void;
    contentUnavailable(reason: string): void;
}

export class CheckpointTooLargeError extends Error {
    constructor(message = 'Checkpoint exceeds the maximum size') {
        super(message);
        this.name = 'CheckpointTooLargeError';
    }
}

export class CheckpointContentUnavailableError extends Error {
    constructor(message = 'Checkpoint content is unavailable') {
        super(message);
        this.name = 'CheckpointContentUnavailableError';
    }
}

export class CheckpointUnknownFormatError extends Error {
    constructor(message = 'Checkpoint was made by a newer version') {
        super(message);
        this.name = 'CheckpointUnknownFormatError';
    }
}

export class CheckpointBlobCorruptError extends Error {
    constructor(message = 'Checkpoint blob is corrupt') {
        super(message);
        this.name = 'CheckpointBlobCorruptError';
    }
}
