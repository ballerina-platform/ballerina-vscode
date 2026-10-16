/**
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.org)
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

import { FrameLocator, Locator } from '@playwright/test';
import { clickArtifactCard, reacquireWindow, webviewFrame } from '../utils/helpers';
import { Diagram, ProjectExplorer, SidePanel } from '../utils/pages';
import { DocJourney as Journey } from './doc-journey';

// The WSO2 Integrator UI as the docs name it. Controls are found by what a reader sees (labels, roles,
// text); a test id is used only where nothing visible identifies a control.

// A label as a reader matches it: any case, optional trailing `.`/`:`/`*`, and a leading `+` or icon glyph allowed.
export const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const label = (text: string) => {
    const bare = text.replace(/^\+\s*/, '');
    return new RegExp(`^[\\s\\W]*${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[.:]?\\s*\\*?\\s*$`, 'i');
};

// Doc and UI names for one control; `ui` is only used when the doc's name is not on screen.
export type Names = string | { doc: string; ui?: string | string[] };
const asNames = (names: Names) => (typeof names === 'string' ? { doc: names } : names);

export class Integrator {
    constructor(private readonly j: Journey) {}

    private get page() {
        return this.j.page;
    }

    // ------------------------------------------------------------------ frames

    // The designer webview; with a hint, waits until that text shows.
    async view(hint?: string | RegExp, timeoutMs = 60000): Promise<FrameLocator> {
        const deadline = Date.now() + timeoutMs;
        let lastError: Error | undefined;
        // Opening a project can replace the window mid-wait; a closed window is reacquired and searched again.
        while (Date.now() < deadline) {
            const frame = webviewFrame(this.page);
            const ready = hint === undefined ? frame.locator('body') : frame.getByText(hint).filter({ visible: true }).first();
            try {
                await ready.waitFor({ state: 'visible', timeout: Math.max(1000, deadline - Date.now()) });
                return frame;
            } catch (error) {
                lastError = error as Error;
                if (!/closed/i.test(lastError.message)) {
                    break;
                }
                console.log('  ℹ️  the window closed while waiting for the view; reacquiring it');
                await reacquireWindow();
            }
        }
        throw new Error(`No Integrator view showing '${hint ?? 'anything'}' within ${timeoutMs} ms: ${lastError?.message ?? ''}`);
    }

    // The side panel of the visible view (node palette, forms).
    async panel(hint?: string | RegExp): Promise<Locator> {
        const frame = await this.view(hint);
        // Panels can stack (the HTTP method list under the resource form); the last one is on top.
        const panel = frame.getByTestId('side-panel').filter({ visible: true }).last();
        await panel.waitFor({ state: 'visible', timeout: 30000 });
        // A form fills in after its panel opens; checking it earlier reports every field as missing.
        await panel.getByText(/^Loading form data/).waitFor({ state: 'hidden', timeout: 60000 }).catch(() => undefined);
        return panel;
    }

    // ------------------------------------------------------------------ workbench

    // Runs a command from the palette by its title.
    async command(title: string): Promise<void> {
        await this.page.keyboard.press('ControlOrMeta+Shift+P');
        const input = this.page.locator('.quick-input-widget input');
        await input.waitFor({ state: 'visible', timeout: 15000 });
        await input.pressSequentially(title, { delay: 15 });
        const option = this.page.locator('.quick-input-widget .monaco-list-row', { hasText: title }).first();
        await option.waitFor({ state: 'visible', timeout: 30000 });
        await this.page.keyboard.press('Enter');
    }

    // ------------------------------------------------------------------ generic controls

    // A button by its accessible name, as the page names it (falling back to the UI's name).
    async button(frame: FrameLocator | Locator, names: Names): Promise<Locator> {
        const n = asNames(names);
        return this.j.resolve(n, (name) => frame.getByRole('button', { name: label(name) }));
    }

    async clickButton(frame: FrameLocator | Locator, names: Names): Promise<void> {
        await this.j.click(await this.button(frame, names));
    }

    // Any visible text, e.g. a list row or a palette item.
    async text(frame: FrameLocator | Locator, names: Names): Promise<Locator> {
        const n = asNames(names);
        return this.j.resolve(n, (name) => frame.getByText(label(name)).filter({ visible: true }).last());
    }

    async clickText(frame: FrameLocator | Locator, names: Names): Promise<void> {
        await this.j.click(await this.text(frame, names));
    }

    // The input of a form field, found from its visible label. Covers plain text boxes, expression editors
    // (CodeMirror), text areas and dropdowns.
    async field(scope: FrameLocator | Locator, names: Names): Promise<Locator> {
        const n = asNames(names);
        return this.j.resolve(n, (name) => {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Accessible names run label, required marker and description together: "Name*Unique workflow...".
            // Case-insensitive label, case-sensitive guard: the description starts with a capital.
            const caseInsensitive = escaped.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
            // Label, optional *, then the description starts at once with a capital, or nothing: so "Data"
            // does not match "Data Name".
            const accessible = new RegExp(`^\\s*${caseInsensitive}\\*?(?=$|[A-Z(\\[])`);
            const byRole = scope.getByRole('textbox', { name: accessible })
                .or(scope.getByRole('combobox', { name: accessible }));
            // Otherwise the control nearest the label text. Web components keep their <input> in a shadow
            // root, so the hosts are matched by tag and Playwright's CSS engine pierces into them.
            const caseless = `translate(normalize-space(translate(., '*', '')), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')='${name.toLowerCase()}'`;
            const labelNode = scope.locator(`xpath=.//*[not(self::script) and not(self::style) and (${caseless})][not(.//*[${caseless}])]`).first();
            const controls = 'self::input or self::textarea or self::vscode-text-field or self::vscode-text-area or self::vscode-dropdown or self::select or @role="combobox" or @role="textbox" or contains(@class,"cm-content")';
            const byLabel = labelNode
                .locator(`xpath=ancestor::*[.//*[${controls}]][1]`)
                .locator(`xpath=.//*[${controls}]`)
                .first();
            return byRole.or(byLabel).first();
        });
    }

    // Types a value into a field found by label, replacing what was there.
    async fill(scope: FrameLocator | Locator, names: Names, value: string): Promise<void> {
        let input = await this.field(scope, names);
        const kind = await input.evaluate((e) => (e.classList.contains('cm-content') || e.closest('.cm-editor')
            ? 'cm' : e.tagName.toLowerCase()));
        if (kind === 'vscode-text-field' || kind === 'vscode-text-area') {
            input = input.locator('input, textarea').first();
        }
        if (kind !== 'cm') {
            await this.j.click(input);
            await input.fill('');
            await input.pressSequentially(value);
        } else {
            // An expression editor re-renders on focus and while typed into, dropping keys; insert in one event, then read
            // back and retry until the value sticks.
            const normalise = (text: string) => text.replace(/\s+/g, ' ').trim();
            const settled = async () => {
                await this.page.waitForTimeout(900);
                return normalise(await input.innerText().catch(() => ''));
            };
            await this.j.click(input);
            await this.page.waitForTimeout(600);
            await this.page.keyboard.press('ControlOrMeta+A');
            await this.page.keyboard.press('Backspace');
            await this.page.keyboard.insertText(value);
            for (let attempt = 0; attempt < 3 && await settled() !== normalise(value); attempt++) {
                await this.j.click(input);
                await this.page.keyboard.press('ControlOrMeta+A');
                await this.page.keyboard.press('Backspace');
                await this.page.keyboard.insertText(value);
            }
            // The editor's helper popup stays open over the fields below it; the next click would land in it.
            await this.page.keyboard.press('Escape');
            const got = await settled();
            if (got !== normalise(value)) {
                throw new Error(`Step ${this.j.stepId}: '${asNames(names).doc}' reads '${got.slice(0, 80)}' after typing`);
            }
        }
        await this.page.waitForTimeout(300);
    }

    // Adds text after what an expression field already holds, as a reader typing at its end would.
    async append(scope: FrameLocator | Locator, names: Names, text: string): Promise<void> {
        const input = await this.field(scope, names);
        const read = async () => (await input.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        const before = await read();
        const want = `${before}${text}`.replace(/\s+/g, ' ').trim();
        const tail = text.replace(/\s+/g, ' ').trim();
        // Exactly one copy of the text at the end; the inserted value may re-render around it.
        const done = async () => { const got = await read(); return got.endsWith(tail) && got.split(tail).length === 2; };
        for (let attempt = 0; attempt < 3 && !await done(); attempt++) {
            await this.j.click(input);
            await this.page.waitForTimeout(500);
            await this.page.keyboard.press('ControlOrMeta+ArrowDown');
            await this.page.keyboard.press('End');
            await this.page.keyboard.insertText(text);
            await this.page.waitForTimeout(900);
            if (attempt < 2 && !await done()) {
                // A lost or doubled insert: put back what was there before trying again.
                await this.page.keyboard.press('ControlOrMeta+A');
                await this.page.keyboard.insertText(before);
                await this.page.waitForTimeout(600);
            }
        }
        await this.page.keyboard.press('Escape');
        if (!await done()) {
            const got = await read();
            throw new Error(`Step ${this.j.stepId}: '${asNames(names).doc}' reads '${got.slice(0, 80)}', expected '${want}'`);
        }
        await this.page.waitForTimeout(300);
    }

    // Picks a dropdown option for a field found by label.
    async select(scope: FrameLocator | Locator, frame: FrameLocator, names: Names, option: Names): Promise<void> {
        const combo = await this.field(scope, names);
        await this.j.click(combo);
        const o = asNames(option);
        const choice = await this.j.resolve(o, (name) =>
            frame.locator('[role=option], vscode-option, li').filter({ hasText: label(name) }));
        await this.j.click(choice);
    }

    // Switches a field's Text/Record/Expression mode, as in "switch to Expression".
    async mode(scope: FrameLocator | Locator, fieldNames: Names, modeName: string): Promise<void> {
        const n = asNames(fieldNames);
        const labelNode = await this.j.resolve(n, (name) => scope.getByText(label(name)));
        const container = labelNode.locator('xpath=ancestor::*[.//*[normalize-space()="Expression"]][1]');
        const toggle = container.getByText(modeName, { exact: true }).first();
        await this.j.click(toggle);
        await this.page.waitForTimeout(300);
    }

    // Fills a field from its value helper as the docs say ("Inputs > orderInfo > customerEmail"): first entry is the
    // helper section, last is the value, each one between opens a record with its chevron.
    async pick(scope: FrameLocator | Locator, fieldNames: Names, path: Names[]): Promise<void> {
        const [section, ...rest] = path;
        const first = asNames(rest[0] ?? section);
        // The helper loads its lists after it opens; a section clicked too early shows nothing. The whole
        // open-section-find sequence is retried before giving up.
        for (let attempt = 0; ; attempt++) {
            const input = await this.field(scope, fieldNames);
            await this.j.click(input);
            await this.page.keyboard.press('End');
            const frame = await this.view();
            await this.j.click(await this.text(frame, section));
            await this.page.waitForTimeout(600);
            const firstRow = frame.locator('p').filter({ hasText: new RegExp(`^${escapeRegExp(first.doc)}$`) }).last();
            const ready = await firstRow.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)
                || first.ui !== undefined;
            if (!ready && attempt < 2) {
                await this.dismiss();
                continue;
            }
            for (const [i, part] of rest.entries()) {
                const row = await this.j.resolve(asNames(part), (name) =>
                    frame.locator('p').filter({ hasText: new RegExp(`^${escapeRegExp(name)}$`) }).last());
                if (i < rest.length - 1) {
                    const chevron = row.locator('xpath=ancestor::*[.//*[contains(@class,"codicon-chevron-right")]][1]')
                        .locator('.codicon-chevron-right').first();
                    await this.j.click(chevron);
                    await this.page.waitForTimeout(500);
                } else {
                    await this.j.click(row);
                }
            }
            await this.page.waitForTimeout(400);
            return;
        }
    }

    // Clicks the open icon on a diagram node ("View function flow"), opening the function behind it, and waits until
    // the editor shows that function rather than the diagram it came from.
    async openNode(frame: FrameLocator, nodeText: string): Promise<void> {
        const title = frame.getByText(nodeText, { exact: true }).filter({ visible: true }).last();
        const node = title.locator('xpath=ancestor::*[.//*[contains(@class,"bi-open-in")]][1]');
        const icon = node.locator('[class*="bi-open-in"]').first();
        // Arrived when the name shows outside the diagram canvas: the header of the function's own view.
        const header = frame.getByText(nodeText, { exact: true }).filter({ visible: true })
            .filter({ hasNot: frame.locator('xpath=ancestor::*[@data-testid="bi-diagram-canvas"]') });
        const arrived = async () => {
            for (const el of await header.all()) {
                const inCanvas = await el.evaluate((e) => !!e.closest('[data-testid="bi-diagram-canvas"], #bi-diagram-canvas'));
                if (!inCanvas) {
                    return true;
                }
            }
            return false;
        };
        await this.j.click(icon);
        for (let attempt = 0; attempt < 20 && !(await arrived()); attempt++) {
            await this.page.waitForTimeout(500);
        }
        if (!(await arrived())) {
            // The icon sits in a web-component button; the click can land on the glyph and stop there.
            await icon.locator('xpath=ancestor::vscode-button[1]').dispatchEvent('click').catch(() => undefined);
            for (let attempt = 0; attempt < 10 && !(await arrived()); attempt++) {
                await this.page.waitForTimeout(500);
            }
        }
        if (!(await arrived())) {
            throw new Error(`the open icon on '${nodeText}' did not open its diagram`);
        }
        await this.page.waitForTimeout(800);
    }

    // Clicks a breadcrumb at the top of the view, e.g. the integration name to return to its overview.
    async crumb(name: string, expect: string | RegExp): Promise<FrameLocator> {
        const frame = await this.view();
        const item = frame.locator(`[title="${name}"]`).filter({ visible: true }).first();
        await this.j.click(item);
        const arrived = await this.view(expect, 15000).then(() => true).catch(() => false);
        if (!arrived) {
            await item.dispatchEvent('click');
        }
        return this.view(expect, 60000);
    }

    // The integration overview, through the project row's Open View action; a click on the row itself does nothing
    // while it is selected.
    async overview(): Promise<FrameLocator> {
        const already = await this.view(/Add Artifact/i, 3000).catch(() => undefined);
        if (already) {
            return already;
        }
        await new ProjectExplorer(this.page).goToOverview();
        return this.view(/Add Artifact/i, 60000);
    }

    // The project tree's row for an item, or undefined when this build's tree does not list it.
    async treeRow(item: string): Promise<Locator | undefined> {
        return new ProjectExplorer(this.page).findItemExpanding(item);
    }

    // Opens an item from the project tree. Trees without the workflow groups (wso2-integrator 1.0.x) do not list
    // workflows or agents; those open from their card on the integration overview instead.
    async sidebar(item: string): Promise<void> {
        const row = await this.treeRow(item);
        if (row) {
            await this.j.click(row);
            await this.page.waitForTimeout(800);
            return;
        }
        console.log(`  ℹ️  '${item}' is not in this build's project tree; opening it from the integration overview`);
        const card = (await this.overview()).getByText(item, { exact: true }).filter({ visible: true }).first();
        await card.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {
            throw new Error(`Step ${this.j.stepId}: '${item}' is neither in the project tree nor on the integration overview`);
        });
        await this.j.click(card);
        await this.page.waitForTimeout(800);
    }

    // Types a value and waits until the form accepts it. The field is validated after every edit, and the result for
    // the cleared field can land after the typed value's, leaving a stale error and a disabled submit; retype then.
    async fillAccepted(scope: FrameLocator | Locator, names: Names, value: string, submit: Locator): Promise<void> {
        const input = await this.field(scope, names);
        const current = () => input.inputValue().catch(() => input.locator('input').inputValue()).catch(() => '');
        // The form fills itself from a template that can arrive after it opens, overwriting anything typed
        // before then; wait until the default has held for a second.
        let last = await current();
        for (let stable = 0, i = 0; stable < 4 && i < 60; i++) {
            await this.page.waitForTimeout(250);
            const now = await current();
            stable = now === last && now !== '' ? stable + 1 : 0;
            last = now;
        }
        for (let attempt = 0; attempt < 5; attempt++) {
            await this.fill(scope, names, value);
            // Leaving the field commits it; the validation that follows is what enables the submit button.
            await input.press('Tab').catch(() => undefined);
            for (let i = 0; i < 20; i++) {
                if (await this.enabled(submit)) {
                    return;
                }
                await this.page.waitForTimeout(500);
            }
            // A stale result for an earlier edit can stay on the field: an edit and its undo ask again.
            await input.press('End').catch(() => undefined);
            await input.type('x').catch(() => undefined);
            await input.press('Backspace').catch(() => undefined);
            await input.press('Tab').catch(() => undefined);
            await this.page.waitForTimeout(1500);
            if (await this.enabled(submit) && await current() === value) {
                return;
            }
        }
        throw new Error(`the form did not accept ${value} as ${asNames(names).doc}`);
    }

    // Checks a form against the page's field table, expanding Advanced Configurations for fields the page puts there;
    // missing fields become findings.
    async expectFields(panel: Locator, fields: Array<{ label: string; advanced?: boolean }>): Promise<string[]> {
        const missing: string[] = [];
        const visible = async (text: string) => {
            const asText = panel.getByText(label(text)).filter({ visible: true }).first();
            if (await asText.isVisible().catch(() => false)) {
                return true;
            }
            const caseInsensitive = text.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
            const accessible = new RegExp(`^\\s*${caseInsensitive}\\*?(?=$|[A-Z(\\[])`);
            return panel.getByRole('textbox', { name: accessible }).or(panel.getByRole('combobox', { name: accessible }))
                .or(panel.getByRole('checkbox', { name: accessible })).first().isVisible().catch(() => false);
        };
        // The panel may still be the one being replaced (the node palette); judge once any expected field shows.
        const main = fields.filter((f) => !f.advanced).map((f) => f.label);
        for (let i = 0; i < 30 && main.length > 0; i++) {
            if ((await Promise.all(main.map((m) => visible(m)))).some(Boolean)) {
                break;
            }
            await this.page.waitForTimeout(500);
        }
        let expanded = false;
        for (const field of fields) {
            if (field.advanced && !expanded) {
                const expand = panel.getByText(/^\s*Expand\s*$/).filter({ visible: true }).first();
                if (await expand.isVisible().catch(() => false)) {
                    await this.j.click(expand);
                    await this.page.waitForTimeout(500);
                }
                expanded = true;
            }
            if (!(await visible(field.label))) {
                missing.push(field.label);
            }
        }
        if (missing.length > 0) {
            // An input's accessible name is its label run into its description ("Role*Define…").
            const snapshot = await panel.ariaSnapshot().catch(() => '');
            const shown = [...new Set([...snapshot.matchAll(/- (?:textbox|combobox|checkbox|listbox|spinbutton) "([^"]+)"/g)]
                .map((m) => (m[1].match(/^(.+?)(?:\*|(?<=[a-z)])(?=[A-Z][a-z])|$)/)?.[1] ?? '').trim())
                .filter((n) => n && n.length <= 40))];
            await this.j.finding({
                kind: 'missing',
                says: `The field table lists ${missing.map((m) => `**${m}**`).join(', ')}`,
                actual: `The form has no ${missing.length === 1 ? 'field' : 'fields'} called ${missing.map((m) => `**${m}**`).join(', ')}` +
                    (shown.length ? `; it shows ${shown.map((n) => `**${n}**`).join(', ')}` : ''),
                suggestion: 'Update the table to the fields the form shows.',
            });
        }
        return missing;
    }

    // Closes a helper pane or dropdown that covers the form.
    async dismiss(): Promise<void> {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(200);
    }

    // ------------------------------------------------------------------ projects and artifacts

    // Opens an artifact's creation form from the Artifacts page by its card's test id, checking that the card is named
    // and placed as the page says.
    async artifact(frame: FrameLocator, section: string, artifact: string, testId: string): Promise<FrameLocator> {
        const card = frame.locator(`#${testId}`);
        await card.waitFor({ state: 'visible', timeout: 30000 });
        const title = (await card.innerText()).trim();
        if (!title.toLowerCase().includes(artifact.toLowerCase())) {
            await this.j.finding({ kind: 'label', says: `**${artifact}**`, actual: `The card reads **${title.split('\n')[0]}**` });
        }
        const actualSection = await card.evaluate((el) => {
            let node: Element | null = el;
            while (node) {
                let prev: Element | null = node.previousElementSibling;
                while (prev) {
                    const heading = prev.matches('h1,h2,h3') ? prev : prev.querySelector('h1,h2,h3');
                    if (heading) {
                        return heading.textContent?.trim() ?? '';
                    }
                    prev = prev.previousElementSibling;
                }
                node = node.parentElement;
            }
            return '';
        });
        if (actualSection && actualSection.toLowerCase() !== section.toLowerCase()) {
            await this.j.finding({
                kind: 'label',
                says: `**${artifact}** is under **${section}** on the Artifacts page`,
                actual: `It is under **${actualSection}**`,
                suggestion: `Say "under **${actualSection}**, click **${artifact}**".`,
            });
        }
        await clickArtifactCard(frame, testId);
        return this.view();
    }

    // ------------------------------------------------------------------ types

    // Creates a record from the type field's helper: + Create New Type, Create from scratch, Kind Record, the name,
    // then each field with the + next to Fields.
    async createRecordType(frame: FrameLocator, name: string, fields: Array<[string, string]>, step: string): Promise<void> {
        await this.j.step(`${step}.a`, 'Click **+ Create New Type**.', async () => {
            await this.clickButton(frame, { doc: '+ Create New Type', ui: ['Create New Type'] });
        });
        const modal = frame.getByRole('banner').filter({ hasText: 'Create New Type' }).locator('xpath=..');
        await this.j.step(`${step}.b`, 'Select the **Create from scratch** tab.', async () => {
            await this.clickButton(frame, 'Create from scratch');
        });
        await this.j.step(`${step}.c`, 'Set **Kind** to **Record**.', async () => {
            const kind = frame.getByRole('combobox', { name: 'Kind' });
            await kind.waitFor({ state: 'visible' });
            const current = (await kind.innerText().catch(() => '')) || (await kind.inputValue().catch(() => ''));
            if (!/Record/.test(current)) {
                await this.j.click(kind);
                await this.j.click(frame.getByRole('option', { name: 'Record' }));
            }
        });
        await this.j.step(`${step}.d`, `Change **Name** from \`MyType\` to \`${name}\`.`, async () => {
            const box = frame.getByRole('textbox', { name: 'Name', exact: true }).last();
            await this.j.click(box);
            await box.fill(name);
        });
        for (const [fieldName, fieldType] of fields) {
            await this.j.step(`${step}.e`, `Add the field \`${fieldName}\` of type \`${fieldType}\`.`, async () => {
                const rows = frame.getByTestId('identifier-field');
                const before = await rows.count();
                const add = frame.getByTestId('add-field-button').getByRole('button').first();
                const deadline = Date.now() + 30000;
                while (await rows.count() <= before) {
                    if (Date.now() > deadline) {
                        throw new Error('the + next to Fields never added a row');
                    }
                    await this.j.click(add);
                    await this.page.waitForTimeout(800);
                }
                await this.setRowValue(frame, 'identifier-field', fieldName);
                await this.setRowValue(frame, 'type-field', fieldType);
            });
        }
        await this.j.step(`${step}.f`, 'Click **Save**.', async () => {
            await this.j.click(modal.getByRole('button', { name: 'Save' }).last());
            await frame.getByRole('heading', { name: 'Create New Type' }).waitFor({ state: 'hidden', timeout: 60000 });
        });
    }

    // One input event per value: the row's React state re-renders on focus and would drop typed keys.
    private async setRowValue(frame: FrameLocator, testId: 'identifier-field' | 'type-field', value: string) {
        const input = frame.getByTestId(testId).last().locator('input');
        for (let attempt = 0; attempt < 4; attempt++) {
            await this.j.click(input);
            await input.fill(value);
            if (testId === 'type-field') {
                // The type list stays open and covers Save; clicking the dialog's title closes it.
                await frame.getByRole('heading', { name: 'Create New Type' }).click({ force: true });
            }
            await this.page.waitForTimeout(600);
            if ((await input.inputValue()) === value) {
                return;
            }
        }
        throw new Error(`${testId} did not keep '${value}'`);
    }

    // ------------------------------------------------------------------ the flow diagram

    // Clicks the + below a node ("click + below the wait") and waits for the node panel.
    async plusBelow(frame: FrameLocator, nodeText: string | RegExp, nth = 0): Promise<void> {
        await new Diagram(this.page, frame).clickAddButtonBelow(nodeText, nth);
        await this.panel();
    }

    // Clicks the + on an If branch the page names by label ("the + on the **Else** path"); index is the branch's
    // position left to right, -1 for Else.
    async plusOnBranch(frame: FrameLocator, branchLabel: string, index: number): Promise<void> {
        console.log(`  + on the '${branchLabel}' branch`);
        await new Diagram(this.page, frame).clickAddButtonOnBranch(index);
        await this.panel();
    }

    // Follows a node-palette path such as Workflow > Steps > Call Activity. A group is opened only when the next
    // entry is not already showing, since clicking an open group closes it.
    async palette(path: Names[]): Promise<void> {
        const panel = await this.panel();
        const sidePanel = new SidePanel(await this.view(), this.page);
        await sidePanel.init();
        const productNames = (names: Names) => {
            const n = asNames(names);
            return [n.doc, ...(n.ui === undefined ? [] : Array.isArray(n.ui) ? n.ui : [n.ui])];
        };
        const shows = async (names: Names) => {
            for (const name of productNames(names)) {
                if (await panel.getByText(name, { exact: true }).last().isVisible().catch(() => false)) {
                    return true;
                }
            }
            return false;
        };
        for (const [i, part] of path.entries()) {
            const next = path[i + 1];
            if (next !== undefined && await shows(next)) {
                continue;
            }
            // The name on screen, recording a finding when it is not the page's.
            const { name } = await this.j.resolveNamed(asNames(part), (n) => panel.getByText(label(n)).filter({ visible: true }).last());
            if (next === undefined) {
                await sidePanel.clickNode(name);
                // The panel swaps to the node's list or form; reading it at once still sees the palette.
                await this.page.waitForTimeout(500);
                return;
            }
            await sidePanel.expandSection(name);
            await this.page.waitForTimeout(500);
            if (!await shows(next)) {
                // That click closed a group that was open but scrolled out of view; open it again.
                await sidePanel.expandSection(name);
                await this.page.waitForTimeout(500);
            }
        }
    }

    // Saves the open side-panel form and waits for it to close. Save stays disabled while the form validates (after a
    // value is picked, say), so it is waited for, and pressed again if the first press landed before it was live.
    async saveForm(names: Names = 'Save'): Promise<void> {
        const panel = await this.panel();
        // The button reads "Validating..." while the form checks its fields; its name returns once that ends.
        await panel.getByRole('button', { name: /Validating/ }).waitFor({ state: 'hidden', timeout: 60000 }).catch(() => undefined);
        const save = await this.button(panel, names);
        for (let i = 0; i < 60 && !(await this.enabled(save)); i++) {
            await this.page.waitForTimeout(500);
        }
        await this.j.click(save);
        let closed = await panel.waitFor({ state: 'hidden', timeout: 20000 }).then(() => true).catch(() => false);
        if (!closed) {
            // A press that landed before Save was live leaves it enabled; mid-save the form re-renders without it.
            if (await save.isVisible().catch(() => false) && await this.enabled(save)) {
                await this.j.click(save);
            }
            closed = await panel.waitFor({ state: 'hidden', timeout: 90000 }).then(() => true).catch(() => false);
        }
        if (!closed) {
            // A form that stays open was refused (a diagnostic, an empty required field): fail on the step.
            const problems = await panel.locator('[class*=error], [class*=diagnostic]').allInnerTexts().catch(() => []);
            throw new Error(`The form did not close after Save${problems.length ? `: ${problems.join(' | ').slice(0, 300)}` : ''}`);
        }
        await this.page.waitForTimeout(600);
    }

    private async enabled(button: Locator): Promise<boolean> {
        return !(await button.isDisabled().catch(() => true))
            && (await button.getAttribute('disabled').catch(() => null)) === null;
    }
}
