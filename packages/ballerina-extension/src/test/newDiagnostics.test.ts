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
import {
    affectsCompilation,
    DeliveredTracker,
    FileDiagnostics,
    fileKey,
    findPackageRoot,
    formatNewDiagnostics,
    MAX_CHARS,
    RawDiagnostic,
} from '../features/ai/agent/tools/new-diagnostics';

const ROOT = path.resolve('/work/proj');
const uri = (rel: string) => pathToFileURL(path.join(ROOT, rel)).toString();
const err = (line: number, message: string, code?: string): RawDiagnostic => ({
    range: { start: { line, character: 4 }, end: { line, character: 9 } },
    severity: 1,
    code,
    message,
});

/** One edit's round: what is new against the tracker, formatted. */
function round(all: FileDiagnostics[], tracker: DeliveredTracker): string | undefined {
    return formatNewDiagnostics(tracker.takeNew(all, ROOT), ROOT);
}

describe('new diagnostics after an edit', () => {
    it('reports errors in the package as a <new-diagnostics> block with 1-based positions', () => {
        const text = round([{ uri: uri('main.bal'), diagnostics: [err(2, "undefined symbol 'httpp'", 'BCE2010')] }], new DeliveredTracker());
        expect(text).toBe(
            "<new-diagnostics>The following new diagnostic issues were detected:\n\n" +
            "main.bal:\n  ✘ [Line 3:5] undefined symbol 'httpp' [BCE2010]\n" +
            "</new-diagnostics>"
        );
    });

    it('never repeats an error already delivered, and reports only what is new', () => {
        const tracker = new DeliveredTracker();
        round([{ uri: uri('main.bal'), diagnostics: [err(2, 'a')] }], tracker);
        expect(round([{ uri: uri('main.bal'), diagnostics: [err(2, 'a')] }], tracker)).toBeUndefined();
        const text = round([{ uri: uri('main.bal'), diagnostics: [err(2, 'a'), err(7, 'b')] }], tracker);
        expect(text).toContain('[Line 8:5] b');
        expect(text).not.toContain('] a');
    });

    it('surfaces an error again once its file is edited, so a reintroduced problem shows', () => {
        const tracker = new DeliveredTracker();
        round([{ uri: uri('main.bal'), diagnostics: [err(2, 'a')] }], tracker);
        tracker.clear(fileKey(uri('main.bal')));
        expect(round([{ uri: uri('main.bal'), diagnostics: [err(2, 'a')] }], tracker)).toContain('] a');
    });

    it('includes errors the edit caused in other files of the package', () => {
        const text = round([
            { uri: uri('main.bal'), diagnostics: [] },
            { uri: uri('modules/db/db.bal'), diagnostics: [err(0, 'missing type Order')] },
        ], new DeliveredTracker());
        expect(text).toContain(`${path.join('modules', 'db', 'db.bal')}:`);
        expect(text).not.toContain('main.bal');
    });

    it('shows an error in another file again after it was fixed and then reintroduced', () => {
        const tracker = new DeliveredTracker();
        const broken = [{ uri: uri('main.bal'), diagnostics: [] }, { uri: uri('db.bal'), diagnostics: [err(0, 'missing type Order')] }];
        expect(round(broken, tracker)).toContain('missing type Order');
        // db.bal is never edited: the fix is seen only as the package reporting no errors for it.
        expect(round([], tracker)).toBeUndefined();
        expect(round(broken, tracker)).toContain('missing type Order');
    });

    it('drops warnings and hints, as the diagnostics tool does', () => {
        const warning: RawDiagnostic = { ...err(1, 'unused variable'), severity: 2 };
        expect(round([{ uri: uri('main.bal'), diagnostics: [warning] }], new DeliveredTracker())).toBeUndefined();
    });

    it('attaches the resolving hint for a known code', () => {
        expect(round([{ uri: uri('main.bal'), diagnostics: [err(0, 'undefined module', 'BCE2000')] }], new DeliveredTracker()))
            .toContain('\n    Hint: This usually indicates a missing import statement');
    });

    it('caps each file at 10 and the block at 30, and says how many were left out', () => {
        const many = (n: number) => Array.from({ length: n }, (_, i) => err(i, `e${i}`));
        const text = round([
            { uri: uri('a.bal'), diagnostics: many(15) },
            { uri: uri('b.bal'), diagnostics: many(12) },
            { uri: uri('c.bal'), diagnostics: many(12) },
            { uri: uri('d.bal'), diagnostics: many(3) },
        ], new DeliveredTracker())!;
        expect(text.match(/✘/g)).toHaveLength(30);
        expect(text).toContain('… 12 more');
        expect(text).not.toContain('d.bal:');
    });

    it('truncates a block past the character budget', () => {
        const long = Array.from({ length: 10 }, (_, i) => err(i, `${'x'.repeat(300)} ${i}`));
        const text = round(['a.bal', 'b.bal', 'c.bal'].map(f => ({ uri: uri(f), diagnostics: long })), new DeliveredTracker())!;
        expect(text).toContain('…[truncated]');
        expect(text.length).toBeLessThan(MAX_CHARS + 200);
    });

    it('forgets the least recently touched files past its bound', () => {
        const tracker = new DeliveredTracker(2);
        const at = (file: string) => [{ uri: uri(file), diagnostics: [err(0, 'e')] }];
        // A package root that covers none of these files, so only the bound forgets anything.
        const elsewhere = path.join(ROOT, 'other-package');
        tracker.takeNew(at('a.bal'), elsewhere);
        tracker.takeNew(at('b.bal'), elsewhere);
        tracker.takeNew(at('a.bal'), elsewhere);
        tracker.takeNew(at('c.bal'), elsewhere);
        // b.bal was least recently touched, so c.bal pushed it out; a.bal is still remembered.
        expect(tracker.takeNew(at('a.bal'), elsewhere).size).toBe(0);
        expect(tracker.takeNew(at('b.bal'), elsewhere).size).toBe(1);
    });
});

describe('which edits get diagnostics', () => {
    it('covers .bal files and Ballerina.toml only', () => {
        expect(affectsCompilation('main.bal')).toBe(true);
        expect(affectsCompilation(path.join('pkg', 'Ballerina.toml'))).toBe(true);
        expect(affectsCompilation('README.md')).toBe(false);
        expect(affectsCompilation('Config.toml')).toBe(false);
    });

    it('finds the nearest package root within the project and nothing outside it', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'newdiag-'));
        try {
            const pkg = path.join(root, 'orders');
            fs.mkdirSync(path.join(pkg, 'modules', 'db'), { recursive: true });
            fs.writeFileSync(path.join(pkg, 'Ballerina.toml'), '');
            expect(findPackageRoot(path.join(pkg, 'modules', 'db', 'db.bal'), root)).toBe(pkg);
            expect(findPackageRoot(path.join(root, 'notes.bal'), root)).toBeUndefined();
            expect(findPackageRoot(path.join(os.tmpdir(), 'elsewhere.bal'), root)).toBeUndefined();
            fs.writeFileSync(path.join(root, 'Ballerina.toml'), '');
            expect(findPackageRoot(path.join(root, 'main.bal'), root)).toBe(root);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
