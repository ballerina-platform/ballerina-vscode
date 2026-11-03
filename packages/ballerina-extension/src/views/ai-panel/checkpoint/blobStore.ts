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
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as zlib from 'zlib';
import { BlobStore, CheckpointBlobCorruptError } from './types';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const TEMP_SUFFIX = '.tmp';
const TEMP_MIN_AGE_MS = 10 * 60 * 1000;
const BLOB_ID = /^[0-9a-f]{64}$/;

export interface FsBlobStoreHooks {
    beforeUnlink?: (id: string) => Promise<void>;
}

export function blobStoreDir(workspaceDir: string): string {
    return path.join(workspaceDir, 'objects');
}

function isMissing(error: unknown): boolean {
    return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}

async function writeDurably(file: string, data: Buffer): Promise<void> {
    const handle = await fs.promises.open(file, 'w');
    try {
        await handle.writeFile(data);
        await handle.sync();
    } finally {
        await handle.close();
    }
}

export class FsBlobStore implements BlobStore {
    constructor(private readonly dir: string, private readonly hooks?: FsBlobStoreHooks) {}

    exists(): boolean {
        return fs.existsSync(this.dir);
    }

    async put(bytes: Buffer): Promise<{ id: string; created: boolean }> {
        const id = crypto.createHash('sha256').update(bytes).digest('hex');
        if (await this.touchNonEmpty(id)) {
            return { id, created: false };
        }
        const target = this.blobPath(id);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        const temp = `${target}.${crypto.randomBytes(6).toString('hex')}${TEMP_SUFFIX}`;
        try {
            await writeDurably(temp, await gzip(bytes, { level: 1 }));
            await fs.promises.rename(temp, target);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException)?.code;
            if ((code === 'EEXIST' || code === 'EPERM') && await this.touchNonEmpty(id).catch(() => false)) {
                await fs.promises.rm(temp, { force: true });
                return { id, created: false };
            }
            await fs.promises.rm(temp, { force: true });
            throw error;
        }
        return { id, created: true };
    }

    async get(id: string): Promise<Buffer | undefined> {
        if (!BLOB_ID.test(id)) {
            return undefined;
        }
        let stored: Buffer;
        try {
            stored = await fs.promises.readFile(this.blobPath(id));
        } catch (error) {
            if (isMissing(error)) {
                return undefined;
            }
            throw error;
        }
        let bytes: Buffer;
        try {
            bytes = await gunzip(stored);
        } catch {
            await this.removeCorrupt(id);
            throw new CheckpointBlobCorruptError(`Checkpoint blob ${id} is not valid gzip`);
        }
        if (crypto.createHash('sha256').update(bytes).digest('hex') !== id) {
            await this.removeCorrupt(id);
            throw new CheckpointBlobCorruptError(`Checkpoint blob ${id} failed its checksum`);
        }
        return bytes;
    }

    async touch(id: string): Promise<boolean> {
        if (!BLOB_ID.test(id)) {
            return false;
        }
        const now = new Date();
        try {
            await fs.promises.utimes(this.blobPath(id), now, now);
            return true;
        } catch (error) {
            if (isMissing(error)) {
                return false;
            }
            throw error;
        }
    }

    async remove(id: string): Promise<void> {
        if (!BLOB_ID.test(id)) {
            return;
        }
        try {
            await fs.promises.unlink(this.blobPath(id));
        } catch (error) {
            if (!isMissing(error)) {
                throw error;
            }
        }
    }

    async sweep(live: ReadonlySet<string>, minAgeMs: number): Promise<number> {
        let shards: string[];
        try {
            shards = await fs.promises.readdir(this.dir);
        } catch (error) {
            if (isMissing(error)) {
                return 0;
            }
            throw error;
        }
        let deleted = 0;
        for (const shard of shards) {
            const shardDir = path.join(this.dir, shard);
            let names: string[];
            try {
                names = await fs.promises.readdir(shardDir);
            } catch (error) {
                const code = (error as NodeJS.ErrnoException)?.code;
                if (code === 'ENOENT' || code === 'ENOTDIR') {
                    continue;
                }
                throw error;
            }
            for (const name of names) {
                const isTemp = name.endsWith(TEMP_SUFFIX);
                if (!isTemp && live.has(name)) {
                    continue;
                }
                if (!isTemp) {
                    await this.hooks?.beforeUnlink?.(name);
                }
                const file = path.join(shardDir, name);
                try {
                    const stat = await fs.promises.stat(file);
                    const floor = isTemp ? Math.max(minAgeMs, TEMP_MIN_AGE_MS) : minAgeMs;
                    if (floor > 0 && Date.now() - stat.mtimeMs < floor) {
                        continue;
                    }
                    await fs.promises.unlink(file);
                    if (!isTemp) {
                        deleted++;
                    }
                } catch (error) {
                    if (!isMissing(error)) {
                        throw error;
                    }
                }
            }
        }
        return deleted;
    }

    async has(id: string): Promise<boolean> {
        if (!BLOB_ID.test(id)) {
            return false;
        }
        try {
            return (await fs.promises.stat(this.blobPath(id))).size > 0;
        } catch (error) {
            if (isMissing(error)) {
                return false;
            }
            throw error;
        }
    }

    // A crash can leave a zero-length blob at the final path; reusing it would only fail at revert time.
    private async touchNonEmpty(id: string): Promise<boolean> {
        return (await this.has(id)) && this.touch(id);
    }

    private async removeCorrupt(id: string): Promise<void> {
        await fs.promises.rm(this.blobPath(id), { force: true });
    }

    private blobPath(id: string): string {
        return path.join(this.dir, id.slice(0, 2), id);
    }
}
