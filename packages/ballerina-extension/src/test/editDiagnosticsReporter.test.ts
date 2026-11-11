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
import { pathToFileURL } from 'url';
import { createEditDiagnosticsReporter, PackageCheck, withEditDiagnostics } from '../features/ai/agent/tools/edit-diagnostics-reporter';
import { FileDiagnostics } from '../features/ai/agent/tools/new-diagnostics';

let root: string;

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-diagnostics-'));
    fs.writeFileSync(path.join(root, 'Ballerina.toml'), '[package]\nname = "demo"\n');
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

const error = (file: string, line: number, message: string): FileDiagnostics => ({
    uri: pathToFileURL(path.join(root, file)).toString(),
    diagnostics: [{ range: { start: { line, character: 0 }, end: { line, character: 5 } }, severity: 1, message }],
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('edit diagnostics reporter', () => {
    it('reports only the errors an edit adds, not the ones the package had before the run', async () => {
        const before = [error('other.bal', 3, 'old error in another file')];
        const after = [...before, error('main.bal', 1, 'new error from the edit')];
        const results = [before, after];
        const check: PackageCheck = async () => results.shift()!;
        const reporter = createEditDiagnosticsReporter(root, check, 'getCompilationErrors');
        const edit = withEditDiagnostics(reporter, async () => ({ success: true, message: 'Edited main.bal.' }));

        const result = await edit({ file_path: 'main.bal' });

        expect(result.message).toContain('new error from the edit');
        expect(result.message).not.toContain('old error in another file');
    });

    it('reads the baseline once per package, before the first edit is written', async () => {
        const order: string[] = [];
        const check: PackageCheck = async () => { order.push('check'); return []; };
        const reporter = createEditDiagnosticsReporter(root, check, 'getCompilationErrors');
        const edit = withEditDiagnostics(reporter, async () => { order.push('write'); return { success: true, message: 'ok' }; });

        await edit({ file_path: 'main.bal' });
        await edit({ file_path: 'main.bal' });

        expect(order).toEqual(['check', 'write', 'check', 'write', 'check']);
    });

    it('times each check from its own start, so a queued edit still gets its full budget', async () => {
        // Each compile takes 60 ms and the budget is 100 ms: the third check starts 120 ms after the
        // first edit, and would have run out of time if its budget had started then.
        const check: PackageCheck = async () => { await sleep(60); return []; };
        const reporter = createEditDiagnosticsReporter(root, check, 'getCompilationErrors', { checkMs: 100, queueMs: 1_000 });
        await reporter.beforeEdit('main.bal');

        const results = await Promise.all(['a.bal', 'b.bal', 'c.bal'].map(file => reporter.afterEdit(file)));

        expect(results).toEqual([undefined, undefined, undefined]);
    });

    it('says the errors were not checked when a check runs past its budget', async () => {
        const check: PackageCheck = () => new Promise(() => { /* never answers */ });
        const reporter = createEditDiagnosticsReporter(root, check, 'getCompilationErrors', { checkMs: 20, queueMs: 50 });

        const note = await reporter.afterEdit('main.bal');

        expect(note).toContain('Compiler errors were not checked after this edit');
        expect(note).toContain('getCompilationErrors');
    });
});
