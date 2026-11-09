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
import type { Checkpoint } from '@wso2/ballerina-core/lib/state-machine-types';
import { Uri } from './__mocks__/vscode';
import { FsBlobStore } from '../views/ai-panel/checkpoint/blobStore';
import { InlineSnapshotBackend } from '../views/ai-panel/checkpoint/backends/inlineSnapshotBackend';
import { ContentStoreBackend } from '../views/ai-panel/checkpoint/backends/contentStoreBackend';
import { CaptureContext, CheckpointBackend, ScannedFile } from '../views/ai-panel/checkpoint/types';

const LIMITS = { maxFileSize: 1024 * 1024, maxNewBytes: 10 * 1024 * 1024 };

function scan(root: string): ScannedFile[] {
    return fs.readdirSync(root).map(name => {
        const abs = path.join(root, name);
        const stat = fs.statSync(abs);
        return { path: name, uri: Uri.file(abs) as never, size: stat.size, mtimeMs: stat.mtimeMs };
    });
}

async function capture(backend: CheckpointBackend, root: string): Promise<Checkpoint> {
    const files = scan(root);
    const ctx: CaptureContext = { workspaceRoot: root, files, limits: LIMITS };
    const result = await backend.capture(ctx);
    return {
        id: 'cp-1',
        messageId: 'msg-1',
        timestamp: Date.now(),
        fileList: files.map(f => f.path),
        snapshotSize: result.newBytes,
        workspaceRoot: root,
        ...result.fields,
    };
}

describe.each([
    ['inline', (_dir: string): CheckpointBackend => new InlineSnapshotBackend()],
    ['content-store', (dir: string): CheckpointBackend => new ContentStoreBackend(new FsBlobStore(dir))],
])('%s checkpoint backend contract', (kind, make) => {
    let root: string;
    let storeDir: string;
    let backend: CheckpointBackend;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-backend-'));
        storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-objects-'));
        backend = make(storeDir);
        fs.writeFileSync(path.join(root, 'main.bal'), '// original main\n');
        fs.writeFileSync(path.join(root, 'Config.toml'), 'greeting = "original"\n');
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(storeDir, { recursive: true, force: true });
    });

    it('reports its kind', () => {
        expect(backend.kind).toBe(kind);
    });

    it('lists an edited file as a candidate and resolves its original content', async () => {
        const cp = await capture(backend, root);
        fs.writeFileSync(path.join(root, 'main.bal'), '// edited by the generation\n');

        const candidates = await backend.restoreCandidates(cp, scan(root));
        expect(candidates).toContain('main.bal');

        const resolved = await backend.resolve(cp, ['main.bal']);
        const entry = resolved.get('main.bal');
        expect(entry?.state).toBe('content');
        expect(entry?.state === 'content' && entry.bytes.toString('utf8')).toBe('// original main\n');
    });

    it('resolves a file deleted since capture to its content', async () => {
        const cp = await capture(backend, root);
        fs.rmSync(path.join(root, 'Config.toml'));

        expect(await backend.restoreCandidates(cp, scan(root))).toContain('Config.toml');
        const entry = (await backend.resolve(cp, ['Config.toml'])).get('Config.toml');
        expect(entry?.state === 'content' && entry.bytes.toString('utf8')).toBe('greeting = "original"\n');
    });

    it('resolves a path created after capture to absent', async () => {
        const cp = await capture(backend, root);
        fs.writeFileSync(path.join(root, 'added.bal'), '// new\n');

        const resolved = await backend.resolve(cp, ['added.bal']);
        expect(resolved.get('added.bal')).toEqual({ state: 'absent' });
        expect([...resolved.keys()]).toEqual(['added.bal']);
    });

    it('never resolves a binary file present at capture as absent', async () => {
        const bytes = Buffer.from([0x89, 0x50, 0xff, 0xfe, 0x00, 0x80]);
        fs.writeFileSync(path.join(root, 'logo.png'), bytes);
        const cp = await capture(backend, root);

        const entry = (await backend.resolve(cp, ['logo.png'])).get('logo.png');
        if (kind === 'inline') {
            expect(entry).toEqual({ state: 'unavailable', reason: 'unreadable' });
        } else {
            expect(entry?.state === 'content' && entry.bytes.equals(bytes)).toBe(true);
        }
    });

    it('references every stored entry', async () => {
        const cp = await capture(backend, root);
        const refs = [...backend.references(cp)];
        if (kind === 'inline') {
            expect(refs).toEqual([]);
        } else {
            const files = cp.storage?.kind === 'content-store' ? cp.storage.files : {};
            const hashes = Object.values(files).map(e => ('hash' in e ? e.hash : undefined)).filter(Boolean);
            expect(hashes).toHaveLength(2);
            expect(new Set(refs)).toEqual(new Set(hashes));
        }
    });
});
