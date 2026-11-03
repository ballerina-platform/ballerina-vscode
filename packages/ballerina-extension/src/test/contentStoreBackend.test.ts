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
import type { Checkpoint, CheckpointFileEntry } from '@wso2/ballerina-core/lib/state-machine-types';
import { Uri, workspace } from './__mocks__/vscode';
import { FsBlobStore } from '../views/ai-panel/checkpoint/blobStore';
import { ContentStoreBackend } from '../views/ai-panel/checkpoint/backends/contentStoreBackend';
import {
    CaptureContext,
    CheckpointContentUnavailableError,
    BlobStore,
    CheckpointTooLargeError,
    ScannedFile,
} from '../views/ai-panel/checkpoint/types';

const LIMITS = { maxFileSize: 1024, maxNewBytes: 64 * 1024 };
const OLD = Date.now() - 60 * 60 * 1000;

describe('ContentStoreBackend', () => {
    let root: string;
    let storeDir: string;
    let store: FsBlobStore;
    let backend: ContentStoreBackend;
    const realReadFile = workspace.fs.readFile;
    let reads: string[];

    const at = (name: string) => path.join(root, name);
    const blobFile = (id: string) => path.join(storeDir, id.slice(0, 2), id);
    const write = (name: string, content: string | Buffer, mtimeMs = OLD) => {
        fs.writeFileSync(at(name), content);
        fs.utimesSync(at(name), mtimeMs / 1000, mtimeMs / 1000);
    };
    const scan = (): ScannedFile[] =>
        fs.readdirSync(root).sort().map(name => {
            const stat = fs.statSync(at(name));
            return { path: name, uri: Uri.file(at(name)) as never, size: stat.size, mtimeMs: stat.mtimeMs };
        });
    const toCheckpoint = (ctx: CaptureContext, fields: Partial<Checkpoint>, timestamp = Date.now()): Checkpoint => ({
        id: `cp-${timestamp}`,
        messageId: 'msg',
        timestamp,
        fileList: ctx.files.map(f => f.path),
        snapshotSize: 0,
        workspaceRoot: ctx.workspaceRoot,
        ...fields,
    });
    const captureCp = async (opts: Partial<CaptureContext> = {}, timestamp?: number) => {
        const ctx: CaptureContext = { workspaceRoot: root, files: scan(), limits: LIMITS, ...opts };
        const result = await backend.capture(ctx);
        return { result, cp: toCheckpoint(ctx, result.fields, timestamp) };
    };
    const filesOf = (cp: Checkpoint): Record<string, CheckpointFileEntry> =>
        cp.storage?.kind === 'content-store' ? cp.storage.files : {};
    const hashOf = (cp: Checkpoint, p: string): string => {
        const entry = filesOf(cp)[p];
        return entry && 'hash' in entry ? entry.hash : undefined;
    };

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-store-ws-'));
        storeDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'content-store-objects-')), 'objects');
        store = new FsBlobStore(storeDir);
        backend = new ContentStoreBackend(store);
        reads = [];
        workspace.fs.readFile = (uri: { fsPath: string }) => {
            reads.push(path.basename(uri.fsPath));
            return realReadFile(uri);
        };
    });

    afterEach(() => {
        workspace.fs.readFile = realReadFile;
        jest.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(path.dirname(storeDir), { recursive: true, force: true });
    });

    it('stores and resolves binary content byte-exact, without a workspace snapshot', async () => {
        const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x80]);
        write('logo.png', bytes);

        const { result, cp } = await captureCp();

        expect(result.fields.workspaceSnapshot).toBeUndefined();
        expect(result.fields.storage.kind).toBe('content-store');
        expect(result.newBytes).toBe(bytes.length);
        const entry = (await backend.resolve(cp, ['logo.png'])).get('logo.png');
        expect(entry?.state === 'content' && entry.bytes.equals(bytes)).toBe(true);
    });

    it('marks a file over maxFileSize as tooLarge, lists it as skipped, and resolves it unavailable', async () => {
        write('big.bin', Buffer.alloc(LIMITS.maxFileSize + 1, 1));
        const mtimeMs = fs.statSync(at('big.bin')).mtimeMs;

        const { result, cp } = await captureCp();

        expect(filesOf(cp)['big.bin']).toEqual({ skipped: 'tooLarge', size: LIMITS.maxFileSize + 1, mtimeMs });
        expect(result.skipped).toEqual([{ path: 'big.bin', reason: 'tooLarge' }]);
        expect(reads).not.toContain('big.bin');
        expect((await backend.resolve(cp, ['big.bin'])).get('big.bin')).toEqual({ state: 'unavailable', reason: 'tooLarge' });
        expect(await backend.restoreCandidates(cp, [])).toEqual([]);
    });

    it('reports a skipped file once its size or mtime moved, or once it is gone', async () => {
        write('big.bin', Buffer.alloc(LIMITS.maxFileSize + 1, 1));
        const { cp } = await captureCp();

        expect(await backend.changedUnstored(cp, scan())).toEqual([]);
        write('big.bin', Buffer.alloc(LIMITS.maxFileSize + 2, 1));
        expect(await backend.changedUnstored(cp, scan())).toEqual(['big.bin']);
        expect(await backend.changedUnstored(cp, [])).toEqual(['big.bin']);
    });

    it('marks a file it cannot read as unreadable', async () => {
        write('locked.txt', 'held\n');
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        workspace.fs.readFile = () => Promise.reject(new Error('EBUSY'));

        const { result, cp } = await captureCp();

        expect(filesOf(cp)['locked.txt']).toMatchObject({ skipped: 'unreadable' });
        expect(result.skipped).toEqual([{ path: 'locked.txt', reason: 'unreadable' }]);
        expect((await backend.resolve(cp, ['locked.txt'])).get('locked.txt')).toEqual({ state: 'unavailable', reason: 'unreadable' });
    });

    it('re-stores a reused blob that another window sweeps away after it was touched', async () => {
        write('main.bal', '// main\n');
        const { cp: previous } = await captureCp();
        const id = hashOf(previous, 'main.bal');
        const sweptElsewhere: BlobStore = {
            put: b => store.put(b),
            get: i => store.get(i),
            has: i => store.has(i),
            remove: i => store.remove(i),
            sweep: (l, a) => store.sweep(l, a),
            exists: () => store.exists(),
            touch: async i => {
                const ok = await store.touch(i);
                if (i === id) {
                    fs.rmSync(blobFile(i));
                }
                return ok;
            },
        };
        backend = new ContentStoreBackend(sweptElsewhere);

        const { cp } = await captureCp({ previous });

        expect(hashOf(cp, 'main.bal')).toBe(id);
        expect(fs.existsSync(blobFile(id))).toBe(true);
    });

    it('reuses an unchanged file from previous without reading it, and touches its blob', async () => {
        write('main.bal', '// main\n');
        const { cp: previous } = await captureCp();
        reads = [];
        const touch = jest.spyOn(store, 'touch');

        const { result, cp } = await captureCp({ previous });

        expect(reads).toEqual([]);
        expect(touch).toHaveBeenCalledWith(hashOf(previous, 'main.bal'));
        expect(hashOf(cp, 'main.bal')).toBe(hashOf(previous, 'main.bal'));
        expect(result.newBytes).toBe(0);
    });

    it('re-reads a file whose size changed since the previous capture', async () => {
        write('main.bal', '// main\n');
        const { cp: previous } = await captureCp();
        write('main.bal', '// main, but longer\n');
        reads = [];

        const { cp } = await captureCp({ previous });

        expect(reads).toEqual(['main.bal']);
        expect(hashOf(cp, 'main.bal')).not.toBe(hashOf(previous, 'main.bal'));
        expect((await backend.resolve(cp, ['main.bal'])).get('main.bal')).toEqual({
            state: 'content', bytes: Buffer.from('// main, but longer\n'),
        });
    });

    it('re-reads a same-size file whose mtime changed since the previous capture', async () => {
        write('main.bal', '// aaaa\n');
        const { cp: previous } = await captureCp();
        write('main.bal', '// bbbb\n', OLD + 10_000);
        reads = [];

        const { cp } = await captureCp({ previous });

        expect(reads).toEqual(['main.bal']);
        expect(hashOf(cp, 'main.bal')).not.toBe(hashOf(previous, 'main.bal'));
    });

    it('counts a blob shared by identical files once', async () => {
        write('a.bal', '// same\n');
        write('b.bal', '// same\n');

        const { result, cp } = await captureCp();

        expect(hashOf(cp, 'a.bal')).toBe(hashOf(cp, 'b.bal'));
        expect(result.newBytes).toBe('// same\n'.length);
    });

    it('resolves a skipped file as unavailable and only an unlisted path as absent', async () => {
        write('big.bin', Buffer.alloc(LIMITS.maxFileSize + 1, 1));
        const { cp } = await captureCp();
        cp.fileList.push('listed-without-entry.txt');

        const resolved = await backend.resolve(cp, ['big.bin', 'listed-without-entry.txt', 'added.bal']);

        expect(resolved.get('big.bin')).toEqual({ state: 'unavailable', reason: 'tooLarge' });
        expect(resolved.get('listed-without-entry.txt')).toEqual({ state: 'unavailable', reason: 'unreadable' });
        expect(resolved.get('added.bal')).toEqual({ state: 'absent' });
    });

    it('re-reads a file modified after the previous scan started, even well into a long capture', async () => {
        write('main.bal', '// main\n');
        const { cp: previous } = await captureCp({}, OLD - 5000);
        reads = [];

        await captureCp({ previous });

        expect(reads).toEqual(['main.bal']);
    });

    it('re-reads a file whose mtime is within 2 s of the previous capture', async () => {
        write('main.bal', '// main\n');
        const { cp: previous } = await captureCp({}, OLD + 1500);
        reads = [];

        await captureCp({ previous });

        expect(reads).toEqual(['main.bal']);
    });

    it('ignores a previous checkpoint from a different workspace root', async () => {
        write('main.bal', '// main\n');
        const { cp: previous } = await captureCp();
        previous.workspaceRoot = path.join(path.dirname(root), 'other-workspace');
        reads = [];

        await captureCp({ previous });

        expect(reads).toEqual(['main.bal']);
    });

    it('never reuses a file whose stat failed (listed as 0/0)', async () => {
        write('main.bal', '// main\n');
        const ctx: CaptureContext = {
            workspaceRoot: root,
            files: [{ path: 'main.bal', uri: Uri.file(at('main.bal')) as never, size: 0, mtimeMs: 0 }],
            limits: LIMITS,
        };
        const previousId = (await store.put(Buffer.from(''))).id;
        const previous = toCheckpoint(ctx, {
            storage: { kind: 'content-store', files: { 'main.bal': { hash: previousId, size: 0, mtimeMs: 0 } } },
        });

        const result = await backend.capture({ ...ctx, previous });

        expect(reads).toEqual(['main.bal']);
        const entry = result.fields.storage.kind === 'content-store' && result.fields.storage.files['main.bal'];
        expect(entry && 'hash' in entry && entry.hash).not.toBe(previousId);
    });

    it('still lists a same-size, same-mtime edit as a restore candidate', async () => {
        write('main.bal', '// aaaa\n');
        write('same.bal', '// same\n');
        const { cp } = await captureCp();
        write('main.bal', '// bbbb\n');

        expect(await backend.restoreCandidates(cp, scan())).toEqual(['main.bal']);
    });

    it('touches each reused blob once on an unchanged workspace', async () => {
        write('a.bal', '// a\n');
        write('b.bal', '// b\n');
        write('c.bal', '// a\n');
        const { cp: previous } = await captureCp();
        const touch = jest.spyOn(store, 'touch');

        await captureCp({ previous });

        expect(touch.mock.calls.map(([id]) => id).sort()).toEqual(
            [hashOf(previous, 'a.bal'), hashOf(previous, 'b.bal'), hashOf(previous, 'c.bal')].sort()
        );
    });

    it('re-reads and re-puts a previous entry whose blob was swept', async () => {
        write('main.bal', '// main\n');
        const { cp: previous } = await captureCp();
        const id = hashOf(previous, 'main.bal');
        fs.rmSync(blobFile(id));
        reads = [];

        const { result } = await captureCp({ previous });

        expect(reads).toEqual(['main.bal']);
        expect(fs.existsSync(blobFile(id))).toBe(true);
        expect(result.newBytes).toBe('// main\n'.length);
    });

    it('throws CheckpointContentUnavailableError when a stored blob is missing', async () => {
        write('main.bal', '// main\n');
        const { cp } = await captureCp();
        fs.rmSync(blobFile(hashOf(cp, 'main.bal')));

        await expect(backend.resolve(cp, ['main.bal'])).rejects.toBeInstanceOf(CheckpointContentUnavailableError);
    });

    it('throws CheckpointContentUnavailableError when a stored blob is corrupt', async () => {
        write('main.bal', '// main\n');
        const { cp } = await captureCp();
        fs.writeFileSync(blobFile(hashOf(cp, 'main.bal')), 'not gzip');

        await expect(backend.resolve(cp, ['main.bal'])).rejects.toBeInstanceOf(CheckpointContentUnavailableError);
    });

    const writeOverLimit = (prefix: string) => {
        const fileSize = LIMITS.maxFileSize - 24;
        const count = Math.ceil((LIMITS.maxNewBytes * 1.5) / fileSize);
        for (let i = 0; i < count; i++) {
            write(`${prefix}${String(i).padStart(4, '0')}.bin`, randomBytes(fileSize));
        }
    };
    const blobCount = () => fs.existsSync(storeDir)
        ? fs.readdirSync(storeDir).flatMap(shard => fs.readdirSync(path.join(storeDir, shard))).filter(f => !f.endsWith('.tmp')).length
        : 0;

    it('takes the full baseline when there is no previous checkpoint, up to 10x maxNewBytes', async () => {
        writeOverLimit('f');

        const { result } = await captureCp();

        expect(result.newBytes).toBeGreaterThan(LIMITS.maxNewBytes);
        expect(result.skipped).toEqual([]);
    });

    describe('baseline ceiling', () => {
        const SMALL = { maxFileSize: 1024, maxNewBytes: 4096 };
        const writeBytes = (total: number) => {
            for (let i = 0; i * 1000 < total; i++) {
                write(`h${String(i).padStart(4, '0')}.bin`, randomBytes(1000));
            }
        };

        it('throws when a baseline adds more than 10x maxNewBytes', async () => {
            writeBytes(SMALL.maxNewBytes * 10 + 2000);

            await expect(captureCp({ limits: SMALL })).rejects.toBeInstanceOf(CheckpointTooLargeError);
        });

        it('takes a baseline under 10x maxNewBytes', async () => {
            writeBytes(SMALL.maxNewBytes * 8);

            const { result } = await captureCp({ limits: SMALL });

            expect(result.newBytes).toBeGreaterThan(SMALL.maxNewBytes);
        });
    });

    it('over the limit on top of a previous checkpoint: throws and keeps the blobs it stored', async () => {
        write('main.bal', '// main\n');
        const { cp: previous } = await captureCp();
        const baselineBlobs = blobCount();
        const remove = jest.spyOn(store, 'remove');
        writeOverLimit('g');

        await expect(captureCp({ previous })).rejects.toBeInstanceOf(CheckpointTooLargeError);

        expect(remove).not.toHaveBeenCalled();
        expect(blobCount()).toBeGreaterThan(baselineBlobs);
        expect(fs.existsSync(blobFile(hashOf(previous, 'main.bal')))).toBe(true);
    });

    it('falls back to the default limits when the given ones are not positive finite numbers', async () => {
        write('main.bal', '// main\n');

        const { result } = await captureCp({ limits: { maxFileSize: NaN, maxNewBytes: -1 } });

        expect(result.skipped).toEqual([]);
        expect(result.newBytes).toBe('// main\n'.length);
    });

    it('collects garbage by sweeping blobs not in the live set', async () => {
        const sweep = jest.spyOn(store, 'sweep').mockResolvedValue(3);

        await expect(backend.collectGarbage(new Set(['a']))).resolves.toBe(3);
        expect(sweep).toHaveBeenCalledWith(new Set(['a']), 60 * 60 * 1000);
    });
});
