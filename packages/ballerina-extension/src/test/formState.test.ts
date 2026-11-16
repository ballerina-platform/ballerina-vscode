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

// L1: an expr:// copy stays open while any form on its package is open, and navigating away asks
// first exactly when an open form has unsaved edits. A form opened inside another on the same package
// (issue-1770: "+ New Variable" in a flow node form, on its file; "+ New Function", on functions.bal)
// must not close the copy the outer form is still checking its fields against, clear the outer form's
// edits, or leave its own edits behind. A form's edits last until the form reports them gone, whatever
// happens to its copy in between: they are reported before the copy first opens, and the copy closes
// as a "+ New Variable" saves through the form.

// The core barrel reaches an ESM-only dependency; form-state only needs its real path helpers.
jest.mock('@wso2/ballerina-core', () => jest.requireActual('@wso2/ballerina-core/lib/utils/path-utils'));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    clearFormState, closeFormCopy, hasDirtyOpenForm, hasOpenForm, openFormCopy, registerFormClose,
    registerFormOpen, setFormCopyHost, setFormDirtyState
} from '../rpc-managers/bi-diagram/form-state';
import fixture from './fixtures/form-state/issue-1770.json';

// The language server keeps one expr:// copy per package, so the packages have to be on disk.
let workspace: string;

beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'form-state-'));
    for (const pkg of fixture.packages) {
        fs.mkdirSync(path.join(workspace, pkg), { recursive: true });
        fs.writeFileSync(path.join(workspace, pkg, 'Ballerina.toml'), `[package]\nname = "${pkg}"\n`);
    }
});

afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
});

const inWorkspace = (file: string): string => path.join(workspace, file);

type UnmountOrder = 'form first' | 'flow node form first';

// What one form in the webview sends. FlowNodeForm opens the file's expr:// copy on first focus,
// closes it as a save starts or as it unmounts, and opens it again as a "+ New Variable" save through
// it ends, which leaves the form open. After a save of its own it opens it again on its next focus.
// The side-panel Form inside it reports its dirty state under its own id: clean as it mounts, and clean
// again as it unmounts with edits.
//
// It mirrors, and has to follow, FlowNodeForm's effect on [node, showProgressIndicator] with its
// formOpenedRef, reopenCopyRef, saveNewVariable and ensureFormOpened (ballerina-visualizer, views/BI/Forms/FlowNodeForm),
// and useFormDirtyReporting (ballerina-side-panel, components/Form).
class WebviewForm {
    private opened = false;
    private reopen = false;
    private dirty = false;

    constructor(private readonly id: string, private readonly filePath: string) {
        setFormDirtyState(filePath, id, false);
    }

    focus(): void {
        if (!this.opened) {
            this.opened = true;
            registerFormOpen(this.filePath);
        }
    }

    edit(): void {
        this.focus();
        this.report(true);
    }

    report(dirty: boolean): void {
        this.dirty = dirty;
        setFormDirtyState(this.filePath, this.id, dirty);
    }

    /** A save through the form starts: its own, or that of a "+ New Variable" form opened from it. */
    save(ofNewVariable = false): void {
        this.reopen = ofNewVariable && this.opened;
        this.closeCopy();
    }

    /** The save ended and left the form open: after a "+ New Variable" it takes a fresh copy if it had one. */
    saved(): void {
        if (this.reopen) {
            this.reopen = false;
            this.focus();
        }
    }

    unmount(order: UnmountOrder): void {
        if (order === 'flow node form first') {
            this.closeCopy();
        }
        if (this.dirty) {
            setFormDirtyState(this.filePath, this.id, false);
        }
        this.closeCopy();
    }

    private closeCopy(): void {
        if (this.opened) {
            this.opened = false;
            registerFormClose(this.filePath);
        }
    }
}

function run(steps: string[], order: UnmountOrder): void {
    const forms = new Map<string, WebviewForm>();
    const form = (name: string): WebviewForm => {
        if (!forms.has(name)) {
            forms.set(name, new WebviewForm(name, inWorkspace((fixture.files as Record<string, string>)[name])));
        }
        return forms.get(name);
    };
    for (const step of steps) {
        const [action, name, value] = step.split(' ');
        switch (action) {
            case 'mount': form(name); break;
            case 'focus': form(name).focus(); break;
            case 'edit': form(name).edit(); break;
            case 'report': form(name).report(value === 'dirty'); break;
            case 'save': form(name).save(); break;
            case 'saved': form(name).saved(); break;
            case 'unmount': form(name).unmount(order); forms.delete(name); break;
            // A New Variable form saves through the form it was opened from: that form's save starts,
            // closing its copy, then the modal closes. The save leaves the outer form open, so it
            // reopens its copy as the save ends, and its edits count again from then on.
            case 'helper-save':
                form(value).save(true); form(name).unmount(order); forms.delete(name); form(value).saved(); break;
            case 'discard': clearFormState(); break;
            default: throw new Error(`unknown step: ${step}`);
        }
    }
}

describe('expr:// copies', () => {
    afterEach(() => clearFormState());

    it.each(fixture.sharedCopies.map((pair) => [pair.name, pair.files] as const))(
        '%s share one, opened by the first form and closed by the last', (_name, files) => {
            const [outer, inner] = files.map(inWorkspace);
            for (const [first, last] of [[inner, outer], [outer, inner]]) {
                expect(registerFormOpen(outer)).toBe(true);
                expect(registerFormOpen(inner)).toBe(false);
                expect(registerFormClose(first)).toBe(false);
                expect(hasOpenForm()).toBe(true);
                expect(registerFormClose(last)).toBe(true);
                expect(hasOpenForm()).toBe(false);
            }
        });

    it.each(fixture.separateCopies.map((pair) => [pair.name, pair.files] as const))(
        '%s each have one of their own', (_name, files) => {
            const [one, two] = files.map(inWorkspace);
            expect(registerFormOpen(one)).toBe(true);
            expect(registerFormOpen(two)).toBe(true);
            expect(registerFormClose(one)).toBe(true);
            expect(hasOpenForm()).toBe(true);
            expect(registerFormClose(two)).toBe(true);
            expect(hasOpenForm()).toBe(false);
        });

    // Forms get their paths from different sources, which can spell one package differently.
    it.each(fixture.sameCopySpellings.map((pair) => [pair.name, pair.paths] as const))(
        '%s share one', (_name, [outer, inner]) => {
            expect(registerFormOpen(outer)).toBe(true);
            expect(registerFormOpen(inner)).toBe(false);
            expect(registerFormClose(inner)).toBe(false);
            expect(registerFormClose(outer)).toBe(true);
            expect(hasOpenForm()).toBe(false);
        });

    it.each([1, 2, 3])('keeps a copy open until the last of %i nested forms on it closes', (depth) => {
        const file = inWorkspace(fixture.files.outer);
        for (let i = 0; i < depth; i++) {
            expect(registerFormOpen(file)).toBe(i === 0);
        }
        for (let i = depth; i > 1; i--) {
            expect(registerFormClose(file)).toBe(false);
            expect(hasOpenForm()).toBe(true);
        }
        expect(registerFormClose(file)).toBe(true);
        expect(hasOpenForm()).toBe(false);
    });

    it('closes a copy whose state was already cleared', () => {
        const file = inWorkspace(fixture.files.outer);
        registerFormOpen(file);
        clearFormState();
        expect(registerFormClose(file)).toBe(true);
        expect(hasOpenForm()).toBe(false);
    });
});

// What the language server is told. It has to hear a copy's open before its close, though the open
// reads its file first and the form may close in that moment; and it is told only what the forms
// counted on the copy call for.
describe('expr:// opens and closes sent to the language server', () => {
    let sent: string[];
    // Opens wait here to be let through, as they wait for their file to be read.
    let reads: Array<{ file: string; done: () => void; fail: (error: Error) => void }>;
    const named = (filePath: string): string => path.relative(workspace, filePath).split(path.sep).join('/');
    const settle = async (): Promise<void> => {
        for (let i = 0; i < 10; i++) {
            await Promise.resolve();
        }
    };

    beforeEach(() => {
        sent = [];
        reads = [];
        setFormCopyHost({
            open: (filePath) => new Promise<void>((resolve, reject) => {
                reads.push({
                    file: named(filePath),
                    done: () => { sent.push(`open ${named(filePath)}`); resolve(); },
                    fail: reject
                });
            }),
            close: async (filePath) => { sent.push(`close ${named(filePath)}`); }
        });
    });

    afterEach(async () => {
        reads.forEach((read) => read.done());
        clearFormState();
        await settle();
        setFormCopyHost(undefined);
    });

    const outer = (): string => inWorkspace(fixture.files.outer);
    const inner = (): string => inWorkspace(fixture.files.function);
    const other = (): string => inWorkspace(fixture.files.other);

    it('a form closing while its open is still reading the file has its close sent after the open', async () => {
        const opened = openFormCopy(outer());
        await settle();
        const closed = closeFormCopy(outer());
        await settle();
        expect(sent).toEqual([]);
        reads[0].done();
        await Promise.all([opened, closed]);
        expect(sent).toEqual([`open ${fixture.files.outer}`, `close ${fixture.files.outer}`]);
    });

    it('a form that opens and closes before anything is sent has nothing sent', async () => {
        await Promise.all([openFormCopy(outer()), closeFormCopy(outer())]);
        expect(reads).toEqual([]);
        expect(sent).toEqual([]);
    });

    it('forms sharing a copy have it opened once, and closed by the last', async () => {
        const opens = [openFormCopy(outer()), openFormCopy(inner())];
        await settle();
        reads[0].done();
        await Promise.all(opens);
        await closeFormCopy(inner());
        expect(sent).toEqual([`open ${fixture.files.outer}`]);
        await closeFormCopy(outer());
        // The copy is the package's: it is closed by the file it was opened with.
        expect(sent).toEqual([`open ${fixture.files.outer}`, `close ${fixture.files.outer}`]);
        expect(reads).toHaveLength(1);
    });

    it('an open that failed is tried again for the next form on the package', async () => {
        const failed = openFormCopy(outer());
        await settle();
        reads[0].fail(new Error('no language client'));
        await expect(failed).rejects.toThrow('no language client');
        const next = openFormCopy(inner());
        await settle();
        reads[1].done();
        await next;
        expect(sent).toEqual([`open ${fixture.files.function}`]);
    });

    it('a copy that is slow to open holds up no other package', async () => {
        openFormCopy(outer());
        const opened = openFormCopy(other());
        await settle();
        reads.find((read) => read.file === fixture.files.other).done();
        await opened;
        expect(sent).toEqual([`open ${fixture.files.other}`]);
    });

    it('copies whose forms were cleared away are closed', async () => {
        const opens = [openFormCopy(outer()), openFormCopy(other())];
        await settle();
        reads.forEach((read) => read.done());
        await Promise.all(opens);
        sent.length = 0;
        clearFormState();
        await settle();
        expect(sent.sort()).toEqual([`close ${fixture.files.other}`, `close ${fixture.files.outer}`]);
        // A cleared form still unmounts, and asks for a close that has nothing left to close.
        await closeFormCopy(outer());
        expect(sent).toHaveLength(2);
    });

    it('a copy still being opened when its forms were cleared away is closed once it has opened', async () => {
        const opened = openFormCopy(outer());
        await settle();
        clearFormState();
        await settle();
        expect(sent).toEqual([]);
        reads[0].done();
        await opened;
        await settle();
        expect(sent).toEqual([`open ${fixture.files.outer}`, `close ${fixture.files.outer}`]);
    });
});

describe.each<UnmountOrder>(['form first', 'flow node form first'])('unsaved edits, %s to unmount', (order) => {
    afterEach(() => clearFormState());

    it.each(fixture.scenarios.map((scenario) => [scenario.name, scenario] as const))('%s', (_name, scenario) => {
        run(scenario.steps, order);
        expect(hasDirtyOpenForm()).toBe(scenario.unsaved);
        expect(hasOpenForm()).toBe(scenario.open);
    });
});
