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

import type { Checkpoint } from '@wso2/ballerina-core/lib/state-machine-types';
import {
    CaptureContext,
    CaptureResult,
    CheckpointBackend,
    CheckpointTooLargeError,
    ResolvedContent,
    ScannedFile,
} from '../types';
import { inChunks, isLosslessUtf8, readFileBytes, resolveCaptureLimits } from './captureSupport';

export class InlineSnapshotBackend implements CheckpointBackend {
    readonly kind = 'inline' as const;

    async capture(ctx: CaptureContext): Promise<CaptureResult> {
        const { maxNewBytes } = resolveCaptureLimits(ctx.limits);
        const workspaceSnapshot: Record<string, string> = {};
        const skipped: CaptureResult['skipped'] = [];
        let newBytes = 0;

        for (const chunk of inChunks(ctx.files)) {
            const contents = await Promise.all(chunk.map(async file => ({ file, bytes: await readFileBytes(file) })));
            for (const { file, bytes } of contents) {
                // Listed but not stored: a restore then neither deletes it nor writes content it never held.
                if (!bytes) {
                    skipped.push({ path: file.path, reason: 'unreadable' });
                    continue;
                }
                if (!isLosslessUtf8(bytes)) {
                    continue;
                }
                const content = bytes.toString('utf8');
                workspaceSnapshot[file.path] = content;
                newBytes += content.length;
            }
            if (newBytes > maxNewBytes) {
                throw new CheckpointTooLargeError(`Snapshot size exceeded max limit (${newBytes} bytes)`);
            }
        }

        return { fields: { storage: { kind: 'inline' }, workspaceSnapshot }, newBytes, skipped };
    }

    async restoreCandidates(cp: Checkpoint, _current: ScannedFile[]): Promise<string[]> {
        return Object.keys(cp.workspaceSnapshot ?? {});
    }

    async changedUnstored(_cp: Checkpoint, _current: ScannedFile[]): Promise<string[]> {
        return [];
    }

    canReuseAsPrevious(_cp: Checkpoint): boolean {
        return false;
    }

    hasStoredContent(): boolean {
        return false;
    }

    async resolve(cp: Checkpoint, paths: string[]): Promise<Map<string, ResolvedContent>> {
        const snapshot = cp.workspaceSnapshot ?? {};
        const listed = new Set(cp.fileList);
        const resolved = new Map<string, ResolvedContent>();
        for (const p of paths) {
            if (Object.prototype.hasOwnProperty.call(snapshot, p)) {
                resolved.set(p, { state: 'content', bytes: Buffer.from(snapshot[p], 'utf8') });
            } else {
                resolved.set(p, listed.has(p) ? { state: 'unavailable', reason: 'unreadable' } : { state: 'absent' });
            }
        }
        return resolved;
    }

    references(_cp: Checkpoint): Iterable<string> {
        return [];
    }

    async collectGarbage(_live: ReadonlySet<string>): Promise<number> {
        return 0;
    }
}
