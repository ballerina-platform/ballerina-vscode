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
import { MAX_FILE_SIZE_BYTES, MAX_SNAPSHOT_SIZE_MB } from '../checkpointConfig';
import { CaptureContext, ScannedFile } from '../types';

// Chunks rather than a concurrency pool so the size cap can abort between batches.
export const READ_CONCURRENCY = 32;

export function* inChunks<T>(items: T[]): Generator<T[]> {
    for (let i = 0; i < items.length; i += READ_CONCURRENCY) {
        yield items.slice(i, i + READ_CONCURRENCY);
    }
}

export async function readFileBytes(file: ScannedFile): Promise<Buffer | null> {
    try {
        return Buffer.from(await vscode.workspace.fs.readFile(file.uri));
    } catch (error) {
        console.error(`[Checkpoint] Failed to read file ${file.uri.fsPath}:`, error);
        return null;
    }
}

// A snapshot holds decoded strings, so bytes that do not round-trip through UTF-8 were never
// captured faithfully — writing one back replaces real bytes with U+FFFD.
export function isLosslessUtf8(bytes: Buffer): boolean {
    return Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes);
}

const isPositiveFinite = (value: number) => typeof value === 'number' && Number.isFinite(value) && value > 0;

export function resolveCaptureLimits(limits: CaptureContext['limits'] | undefined): CaptureContext['limits'] {
    return {
        maxFileSize: isPositiveFinite(limits?.maxFileSize) ? limits.maxFileSize : MAX_FILE_SIZE_BYTES,
        maxNewBytes: isPositiveFinite(limits?.maxNewBytes) ? limits.maxNewBytes : MAX_SNAPSHOT_SIZE_MB * 1024 * 1024,
    };
}
