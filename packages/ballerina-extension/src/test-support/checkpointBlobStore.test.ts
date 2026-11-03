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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { gzipSync } from 'zlib';
import { FsBlobStore, blobStoreDir } from '../views/ai-panel/checkpoint/blobStore';
import { CheckpointBlobCorruptError } from '../views/ai-panel/checkpoint/types';

describe('FsBlobStore', () => {
    let root: string;
    let dir: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'blob-store-'));
        dir = blobStoreDir(root);
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
    });

    const files = () => fs.readdirSync(dir).flatMap(s => fs.readdirSync(path.join(dir, s)));
    const blobFile = (id: string) => path.join(dir, id.slice(0, 2), id);
    const age = (id: string, ms: number) => {
        const t = new Date(Date.now() - ms);
        fs.utimesSync(blobFile(id), t, t);
    };

    it('places blobs under the workspace objects directory', () => {
        expect(dir).toBe(path.join(root, 'objects'));
    });

    it('reports no store before the first put', async () => {
        const store = new FsBlobStore(dir);
        expect(store.exists()).toBe(false);
        await store.put(Buffer.from('x'));
        expect(store.exists()).toBe(true);
    });

    it('round trips text and random bytes', async () => {
        const store = new FsBlobStore(dir);
        for (const bytes of [Buffer.from('hello world'), randomBytes(4096)]) {
            const { id, created } = await store.put(bytes);
            expect(created).toBe(true);
            expect(await store.get(id)).toEqual(bytes);
        }
    });

    it('returns the same id for the same bytes and bumps the mtime', async () => {
        const store = new FsBlobStore(dir);
        const first = await store.put(Buffer.from('same'));
        age(first.id, 60_000);
        const before = fs.statSync(blobFile(first.id)).mtimeMs;
        const second = await store.put(Buffer.from('same'));
        expect(second).toEqual({ id: first.id, created: false });
        expect(files()).toHaveLength(1);
        expect(fs.statSync(blobFile(first.id)).mtimeMs).toBeGreaterThan(before);
    });

    it('rewrites an existing zero-length blob on put', async () => {
        const store = new FsBlobStore(dir);
        const bytes = Buffer.from('survives a crash');
        const { id } = await store.put(bytes);
        fs.truncateSync(blobFile(id), 0);

        expect(await store.put(bytes)).toEqual({ id, created: true });
        expect(await store.get(id)).toEqual(bytes);
    });

    it('syncs a new blob to disk before moving it into place', async () => {
        const store = new FsBlobStore(dir);
        const order: string[] = [];
        const open = fs.promises.open;
        jest.spyOn(fs.promises, 'open').mockImplementation(async (...args: Parameters<typeof open>) => {
            const handle = await open(...args);
            const sync = handle.sync.bind(handle);
            handle.sync = async () => { order.push('sync'); return sync(); };
            return handle;
        });
        const rename = fs.promises.rename;
        jest.spyOn(fs.promises, 'rename').mockImplementation(async (...args: Parameters<typeof rename>) => {
            order.push('rename');
            return rename(...args);
        });

        await store.put(Buffer.from('durable'));

        expect(order).toEqual(['sync', 'rename']);
    });

    it('returns undefined for an unknown id', async () => {
        expect(await new FsBlobStore(dir).get('ab'.repeat(32))).toBeUndefined();
    });

    it('throws on a garbage blob', async () => {
        const store = new FsBlobStore(dir);
        const { id } = await store.put(Buffer.from('real'));
        fs.writeFileSync(blobFile(id), Buffer.from('not gzip'));
        await expect(store.get(id)).rejects.toBeInstanceOf(CheckpointBlobCorruptError);
    });

    it('throws when the content does not match the id', async () => {
        const store = new FsBlobStore(dir);
        const { id } = await store.put(Buffer.from('real'));
        fs.writeFileSync(blobFile(id), gzipSync(Buffer.from('other')));
        await expect(store.get(id)).rejects.toBeInstanceOf(CheckpointBlobCorruptError);
    });

    it('touch bumps an existing blob and reports a missing one', async () => {
        const store = new FsBlobStore(dir);
        const { id } = await store.put(Buffer.from('t'));
        age(id, 60_000);
        const before = fs.statSync(blobFile(id)).mtimeMs;
        expect(await store.touch(id)).toBe(true);
        expect(fs.statSync(blobFile(id)).mtimeMs).toBeGreaterThan(before);
        expect(await store.touch('cd'.repeat(32))).toBe(false);
    });

    it('sweep deletes unreferenced blobs and keeps live ones', async () => {
        const store = new FsBlobStore(dir);
        const a = await store.put(Buffer.from('a'));
        const b = await store.put(Buffer.from('b'));
        expect(await store.sweep(new Set([a.id]), 0)).toBe(1);
        expect(await store.get(a.id)).toBeDefined();
        expect(await store.get(b.id)).toBeUndefined();
    });

    it('sweep keeps fresh blobs inside the minimum age', async () => {
        const store = new FsBlobStore(dir);
        await store.put(Buffer.from('fresh'));
        expect(await store.sweep(new Set(), 3_600_000)).toBe(0);
        expect(files()).toHaveLength(1);
    });

    it('sweep ignores young temp files and removes old ones', async () => {
        const store = new FsBlobStore(dir);
        const { id } = await store.put(Buffer.from('x'));
        const young = path.join(dir, id.slice(0, 2), `${id}.aaaa.tmp`);
        const old = path.join(dir, id.slice(0, 2), `${id}.bbbb.tmp`);
        fs.writeFileSync(young, 'y');
        fs.writeFileSync(old, 'o');
        const t = new Date(Date.now() - 7_200_000);
        fs.utimesSync(old, t, t);
        expect(await store.sweep(new Set([id]), 3_600_000)).toBe(0);
        expect(fs.existsSync(young)).toBe(true);
        expect(fs.existsSync(old)).toBe(false);
    });

    it('treats a rename onto an existing target as success', async () => {
        const store = new FsBlobStore(dir);
        const bytes = Buffer.from('raced');
        const realRename = fs.promises.rename;
        jest.spyOn(fs.promises, 'rename').mockImplementationOnce(async (from, to) => {
            await realRename(from, to);
            fs.writeFileSync(from, 'leftover');
            throw Object.assign(new Error('exists'), { code: 'EEXIST' });
        });
        const { id, created } = await store.put(bytes);
        expect(created).toBe(false);
        expect(await store.get(id)).toEqual(bytes);
        expect(files()).toEqual([id]);
    });

    it('keeps a blob touched between listing and unlink', async () => {
        const store: FsBlobStore = new FsBlobStore(dir, { beforeUnlink: id => store.touch(id).then(() => undefined) });
        const { id } = await store.put(Buffer.from('rescued'));
        age(id, 7_200_000);
        expect(await store.sweep(new Set(), 3_600_000)).toBe(0);
        expect(await store.get(id)).toBeDefined();
    });

    it('sweep with zero min age still protects fresh temp files', async () => {
        const store = new FsBlobStore(dir);
        const { id } = await store.put(Buffer.from('x'));
        const fresh = path.join(dir, id.slice(0, 2), `${id}.aaaa.tmp`);
        const stale = path.join(dir, id.slice(0, 2), `${id}.bbbb.tmp`);
        fs.writeFileSync(fresh, 'y');
        fs.writeFileSync(stale, 'o');
        const t = new Date(Date.now() - 3_600_000);
        fs.utimesSync(stale, t, t);
        await store.sweep(new Set([id]), 0);
        expect(fs.existsSync(fresh)).toBe(true);
        expect(fs.existsSync(stale)).toBe(false);
    });

    it('treats malformed ids as missing', async () => {
        const store = new FsBlobStore(dir);
        for (const bad of ['../../etc/passwd', 'z'.repeat(64)]) {
            expect(await store.get(bad)).toBeUndefined();
            expect(await store.touch(bad)).toBe(false);
        }
    });

    it('removes a corrupt blob so a later put recreates it', async () => {
        const store = new FsBlobStore(dir);
        const bytes = Buffer.from('heal me');
        const { id } = await store.put(bytes);
        fs.writeFileSync(blobFile(id), Buffer.from('garbage'));
        await expect(store.get(id)).rejects.toBeInstanceOf(CheckpointBlobCorruptError);
        expect(fs.existsSync(blobFile(id))).toBe(false);
        expect(await store.put(bytes)).toEqual({ id, created: true });
        expect(await store.get(id)).toEqual(bytes);
    });

    it('remove deletes a blob, and ignores a missing or invalid id', async () => {
        const store = new FsBlobStore(dir);
        const { id } = await store.put(Buffer.from('to remove\n'));

        await store.remove(id);
        await store.remove(id);
        await store.remove('../../etc/passwd');

        expect(fs.existsSync(blobFile(id))).toBe(false);
    });
});
