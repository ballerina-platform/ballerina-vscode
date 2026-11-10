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
    clearFormState, hasDirtyOpenForm, hasOpenForm, registerFormClose, registerFormOpen, setFormDirtyState
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

// What one form in the webview sends. FlowNodeForm opens the file's expr:// copy on first focus and
// closes it as a save starts or as it unmounts. The side-panel Form inside it reports its dirty state
// under its own id: clean as it mounts, and clean again as it unmounts with edits.
class WebviewForm {
    private opened = false;
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

    save(): void {
        this.closeCopy();
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
            case 'unmount': form(name).unmount(order); forms.delete(name); break;
            // A New Variable form saves through the form it was opened from: that form's save starts,
            // closing its copy, then the modal closes. The outer form reopens its copy on its next focus,
            // and its edits count again from then on.
            case 'helper-save': form(value).save(); form(name).unmount(order); forms.delete(name); break;
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

describe.each<UnmountOrder>(['form first', 'flow node form first'])('unsaved edits, %s to unmount', (order) => {
    afterEach(() => clearFormState());

    it.each(fixture.scenarios.map((scenario) => [scenario.name, scenario] as const))('%s', (_name, scenario) => {
        run(scenario.steps, order);
        expect(hasDirtyOpenForm()).toBe(scenario.unsaved);
        expect(hasOpenForm()).toBe(scenario.open);
    });
});
