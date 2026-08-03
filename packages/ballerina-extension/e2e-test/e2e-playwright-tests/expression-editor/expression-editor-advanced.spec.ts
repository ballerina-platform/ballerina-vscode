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
import fs from 'fs';
import path from 'path';
import { expect, test, Frame } from '@playwright/test';
import { addArtifact, BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, initTest, logStep, newProjectPath, page } from '../utils/helpers';
import { Form, switchToIFrame } from '@wso2/playwright-vscode-tester';
import { Diagram, SidePanel } from '../utils/pages';

// Fixture with the `Person` record type already created (per the e2e-writer
// rule that scenarios must not re-create through the UI what another spec
// already owns — type creation is covered by type-editor/type.spec.ts). The
// Record Config Editor test below declares a variable of this type.
const EXPRESSION_EDITOR_PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'expression_editor_project');

// Fixed name baked into the fixture's types.bal (see expression_editor_project).
const personTypeName = 'Person';
let greetingName = 'greeting';
let recordVarName = 'p';
let configName = 'personName';

function readGenerated(fileName: string): string {
    return fs.readFileSync(path.join(newProjectPath, fileName), 'utf8');
}

async function pollGenerated(fileName: string, fragment: string, timeoutMs = 30000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    let content = '';
    while (Date.now() < deadline) {
        try {
            content = readGenerated(fileName);
            if (content.includes(fragment)) {
                return content;
            }
        } catch {
            // file may not exist yet
        }
        await page.page.waitForTimeout(1000);
    }
    throw new Error(`${fileName} did not contain "${fragment}" within ${timeoutMs}ms:\n${content}`);
}

async function getWebviewFrame(): Promise<Frame> {
    const webview = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
    if (!webview) {
        throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
    }
    return webview;
}

// Set a CodeMirror editor's full content through the CM view API. NOTE: in the
// chip expression editor this renders but does NOT commit to the form model —
// follow up with real keyboard input for values that must be saved.
async function cmSet(frame: Frame, text: string, index: number): Promise<void> {
    await frame.evaluate(({ text, index }) => {
        const editors = document.querySelectorAll('.cm-content');
        const el = editors[index] as any;
        if (!el) { throw new Error(`CodeMirror editor not found at index ${index}`); }
        const view = el.cmView?.view;
        if (!view) { throw new Error('CodeMirror view instance not found'); }
        view.focus();
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }, { text, index });
}

// Mode-switcher labels can render outside the viewport in the runner's window
// size — dispatch a DOM click instead of a pointer click.
async function domClick(locator: import('@playwright/test').Locator): Promise<void> {
    await locator.waitFor({ state: 'attached', timeout: 15000 });
    await locator.evaluate((el: HTMLElement) => el.click());
}

// The diagram library doesn't reliably react to Playwright's native
// click/force-click on a node's text (the event dispatches without error but
// the node's onClick handler doesn't fire — confirmed via trace inspection:
// two force-clicks completed cleanly with no resulting panel open). A full
// synthetic pointer-event sequence, matching the proven pattern already used
// for the diagram's add-button, is what the diagram library actually needs.
async function diagramClick(locator: import('@playwright/test').Locator): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    await locator.evaluate((el: HTMLElement) => {
        for (const type of ['pointerover', 'mouseover', 'mouseenter', 'pointerenter', 'pointerdown', 'mousedown', 'mouseup', 'click']) {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        }
    });
}

// A single retry after diagramClick can still leave the panel closed under
// real CI load (the same swallowed-click issue diagramClick itself works
// around, just needing more than one attempt) — confirmed by a real failure
// where two clicks in a row both failed to open the mode switcher. Keep
// re-clicking the node until it actually appears rather than giving up.
async function reopenRecordNode(node: import('@playwright/test').Locator, recordMode: import('@playwright/test').Locator): Promise<void> {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
        if (await recordMode.isVisible().catch(() => false)) return;
        await diagramClick(node);
        await page.page.waitForTimeout(1500);
    }
    await recordMode.waitFor({ state: 'visible', timeout: 15000 });
}

// Focusing the record preview editor is what opens the Record Configuration
// modal, but the click/focus can be swallowed while the panel is
// re-rendering after a mode switch — retry with real delays until the modal
// actually appears, rather than a single click with no fallback.
//
// BUG FOUND VIA TRACE INSPECTION: a real CI run failed here with the retry
// loop's own domClick(recordMode) timing out waiting for the mode-switcher
// tab itself — the side panel had fully closed mid-retry (e.g. a stray
// force-click landing on the canvas behind a stale/duplicate testid match).
// Once the panel is closed, clicking the mode tab can never reopen it — only
// re-clicking the diagram node can. The loop only had `recordMode`, with no
// way to get back to the node, so it burned the whole 120s deadline retrying
// a closed panel. Pass the node in so the loop can recover.
async function openRecordConfigModal(frame: import('@playwright/test').Frame, node: import('@playwright/test').Locator, recordMode: import('@playwright/test').Locator): Promise<import('@playwright/test').Locator> {
    const overlay = frame.locator('.unq-modal-overlay').last();
    const modalMarker = overlay.getByText('Select fields to construct the record');
    // Generous deadline: under real system load in this environment a single
    // supposedly-instant JS evaluate() has been observed to stall for ~30s
    // (confirmed via Playwright trace inspection, not a logic issue) — a
    // tight deadline can expire mid-stall even though the click sequence
    // itself is correct.
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
        if (await modalMarker.isVisible({ timeout: 1000 }).catch(() => false)) { break; }
        if (!(await recordMode.isVisible().catch(() => false))) {
            // Panel closed entirely — reopen it via the diagram node before
            // trying to click the (currently nonexistent) mode tab.
            await diagramClick(node).catch(() => { });
            await page.page.waitForTimeout(1000);
        }
        await domClick(recordMode).catch(() => { });
        await page.page.waitForTimeout(1000);
        const preview = frame.locator('[data-testid="ex-editor-expression"] textarea, [data-testid="ex-editor-expression"] input, [data-testid="ex-editor-expression"] .cm-content').last();
        await preview.click({ force: true, timeout: 5000 }).catch(() => { });
        await preview.evaluate((el: HTMLElement) => el.focus()).catch(() => { });
        await page.page.waitForTimeout(1500);
    }
    await modalMarker.waitFor({ timeout: 15000 });
    return overlay;
}

// Style used by both the configurable chip and the variable chip in the
// multi-mode expression / prompt editors — a blue inline CM widget with the
// fw-bi-variable icon.
const CHIP_BACKGROUND_STYLE = 'rgba(59, 130, 246';
const CHIP_ICON_SELECTOR = 'i.fw-bi-variable';

async function expectBlueChip(chip: import('@playwright/test').Locator): Promise<void> {
    const style = await chip.getAttribute('style');
    expect(style).toContain(CHIP_BACKGROUND_STYLE);
    expect(await chip.locator(CHIP_ICON_SELECTOR).count()).toBeGreaterThan(0);
}

async function dismissHelperPanel(): Promise<void> {
    await page.page.keyboard.press('Escape');
    await page.page.waitForTimeout(300);
    await page.page.keyboard.press('Escape');
    await page.page.waitForTimeout(300);
}

async function saveOpenForm(frame: Frame): Promise<void> {
    await dismissHelperPanel();
    const save = frame.getByRole('button', { name: 'Save' }).last();
    await save.waitFor({ timeout: 30000 });
    await save.click({ force: true });
    await frame.getByTestId('bi-diagram-canvas').waitFor({ timeout: 60000 });
    await page.page.waitForTimeout(1000);
}

async function openNodePalette(frame: Frame): Promise<SidePanel> {
    const diagram = new Diagram(page.page);
    await diagram.init();
    // Click the last visible plus button on the flow (works for a growing flow)
    // The diagram can still be re-rendering right after the previous node's
    // panel closes, so give it the same headroom as saveOpenForm's wait.
    const canvas = frame.getByTestId('bi-diagram-canvas');
    await canvas.waitFor({ timeout: 60000 });

    // The diagram can still be re-rendering right after the previous node's
    // panel closes, so the add-button testids may not exist yet — poll for
    // a bounded time with a real delay between attempts (no busy-spin).
    const clickDeadline = Date.now() + 30000;
    let clicked = false;
    while (Date.now() < clickDeadline && !clicked) {
        clicked = await frame.locator('[data-testid]').evaluateAll((elements) => {
            const candidates = elements.filter((element) => {
                const id = element.getAttribute('data-testid') || '';
                return id.startsWith('link-add-button') || id.startsWith('empty-node-add-button');
            });
            const target = candidates.find((element) => (element.getAttribute('data-testid') || '').startsWith('empty-node-add-button'))
                || candidates[candidates.length - 2]
                || candidates[candidates.length - 1];
            if (!target) { return false; }
            for (const type of ['pointerover', 'mouseover', 'mouseenter', 'pointerenter', 'pointerdown', 'mousedown', 'mouseup', 'click']) {
                target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
            }
            return true;
        });
        if (!clicked) {
            await page.page.waitForTimeout(1000);
        }
    }
    if (!clicked) {
        throw new Error('no diagram add button found after 30s');
    }
    await page.page.waitForTimeout(1000);
    const sidePanel = new SidePanel(frame, page.page);
    await sidePanel.init();
    return sidePanel;
}

export default function createTests() {
    test.describe.serial('Expression Editor Advanced Tests', {
    }, async () => {
        // Loads a fixture that already contains the `Person` record type
        // (name: string, age: int optional) — the starting step is a
        // pre-created type rather than building it through the type diagram.
        initTest(true, true, undefined, undefined, EXPRESSION_EDITOR_PROJECT_TEMPLATE);

        test('Expand Editor and Completion Driven Function Call', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            greetingName = `greeting${testAttempt}`;
            logStep(`Declaring variable ${greetingName} through expanded editor + completions`);

            await addArtifact('Automation', 'automation');
            const frame = await getWebviewFrame();
            const createBtn = frame.getByRole('button', { name: 'Create' });
            await createBtn.waitFor({ state: 'visible', timeout: 60000 });
            await createBtn.click({ timeout: 10000 });
            await frame.getByTestId('bi-diagram-canvas').waitFor({ timeout: 60000 });
            logStep('Automation created');

            const sidePanel = await openNodePalette(frame);
            await sidePanel.clickNode('Declare Variable');
            await page.page.waitForTimeout(1000);
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, frame);
            await form.switchToFormView(false, frame);
            await form.fill({
                values: {
                    'Name*Name of the variable': { type: 'input', value: greetingName }
                }
            });
            logStep('Declare Variable form open');

            // Expand the expression editor, type there, collapse, verify preserved
            const panel = frame.getByTestId('side-panel');
            const expr = panel.locator('.cm-content').last();
            await expr.waitFor({ state: 'visible', timeout: 15000 });
            await expr.click();
            await page.page.waitForTimeout(1000);
            const expandBtn = frame.locator('[title="Expand Editor"]').last();
            await expandBtn.waitFor({ state: 'visible', timeout: 15000 });
            await expandBtn.click({ force: true });
            await page.page.waitForTimeout(1500);
            logStep('Expanded editor open');

            const cmCount = await frame.locator('.cm-content').count();
            await cmSet(frame, '"Hello World"', cmCount - 1);
            await page.page.waitForTimeout(500);
            const minimize = frame.locator('[title="Minimize Editor"], [title="Minimize"]').last();
            await minimize.waitFor({ state: 'visible', timeout: 15000 });
            await minimize.click({ force: true });
            await expect(panel.locator('.cm-content').last()).toContainText('Hello World', { timeout: 15000 });
            logStep('Expanded-editor value preserved after collapse');

            // Type is int since the final expression is .length()
            await form.fill({
                values: {
                    'Type': { type: 'textarea', value: 'int', additionalProps: { clickLabel: true } }
                }
            });
            await expect(panel.getByText("incompatible types: expected 'int', found 'string'")).toBeVisible({ timeout: 15000 });
            logStep('Type-mismatch diagnostic verified: incompatible types: expected \'int\', found \'string\'');
            await dismissHelperPanel();

            // Completion-driven function call (no signature-help popup exists
            // in the multi-mode editor — insertion help is completion-based).
            // Append to the existing "Hello World" text instead of clearing
            // and retyping — placing the cursor at the end and typing ".le"
            // triggers the same completion.
            const exprCm = panel.locator('.cm-content').last();
            await exprCm.click();
            await page.page.waitForTimeout(500);
            await page.page.keyboard.press(process.platform === 'darwin' ? 'Meta+End' : 'Control+End');
            await page.page.waitForTimeout(300);
            await page.page.keyboard.type('.le', { delay: 80 });
            const option = frame.locator('.cm-tooltip-autocomplete [role="option"]', { hasText: 'length' }).first();
            await option.waitFor({ state: 'visible', timeout: 15000 });
            logStep('Completion list visible');
            await option.click({ force: true });
            await expect(exprCm).toContainText('"Hello World".length()', { timeout: 15000 });
            logStep('Completion inserted the full call');

            await saveOpenForm(frame);
            await pollGenerated('automation.bal', `int ${greetingName} = "Hello World".length()`);
            logStep('automation.bal verified');
        });

        test('Record Config Editor with Configurable Chip', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            recordVarName = `p${testAttempt}`;
            configName = `personName${testAttempt}`;
            logStep(`Declaring ${recordVarName}:${personTypeName} and wiring configurable ${configName}`);

            const frame = await getWebviewFrame();
            const panel = frame.getByTestId('side-panel');

            // Create the record variable with a typed literal (the Record mode
            // switcher only appears when editing the saved node)
            const sidePanel = await openNodePalette(frame);
            await sidePanel.clickNode('Declare Variable');
            await page.page.waitForTimeout(1000);
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, frame);
            await form.switchToFormView(false, frame);
            await form.fill({
                values: {
                    'Name*Name of the variable': { type: 'input', value: recordVarName },
                    'Type': { type: 'textarea', value: personTypeName, additionalProps: { clickLabel: true } }
                }
            });
            await dismissHelperPanel();
            const expr = panel.locator('.cm-content').last();
            await expr.click();
            await page.page.waitForTimeout(500);
            await cmSet(frame, '{name: "Anne", age: 30}', (await frame.locator('.cm-content').count()) - 1);
            await page.page.waitForTimeout(1500);
            await saveOpenForm(frame);
            await pollGenerated('automation.bal', `${personTypeName} ${recordVarName} = {name: "Anne", age: 30}`);
            logStep('Record variable saved with typed literal');

            // Reopen the node — Record / Expression mode switcher must appear.
            // CONFIRMED (verified live: 30s wait, clean state, with and
            // without touching Expression, typed vs completion-picked type):
            // this switcher never renders during CREATION, only once a
            // record-typed field is reopened for editing on a saved node —
            // so wait generously here since this is the one point it appears.
            const node = frame.getByText(new RegExp(`${recordVarName} = \\{name`)).last();
            const recordMode = frame.getByTestId('primary-mode');
            const expressionMode = frame.getByTestId('expression-mode');
            await reopenRecordNode(node, recordMode);
            expect(await recordMode.innerText()).toBe('Record');
            expect(await expressionMode.innerText()).toBe('Expression');
            logStep('Record/Expression mode switcher visible on edit');

            // Record mode → focus preview → Record Configuration modal. The
            // panel re-renders after the mode switch, so retry the focus click
            // until the modal actually appears.
            const overlay = await openRecordConfigModal(frame, node, recordMode);
            const branchText = await overlay.getByTestId('parameter-branch').first().innerText();
            expect(branchText).toContain('name');
            expect(branchText).toContain('age');
            logStep('Record Configuration modal open with field tree');

            // Helper pane menu from the modal's expression editor
            const modalCm = overlay.locator('.cm-content').last();
            await modalCm.click({ force: true });
            await frame.getByText('Configurables', { exact: true }).last().waitFor({ timeout: 15000 });

            // Position the insertion point precisely: SELECT the current
            // "Anne" value (not the whole field, not left empty) via the CM
            // API so the record's surrounding structure `{name: |, age: 30}`
            // stays intact. Creating the configurable while this selection is
            // active replaces exactly that span with the new reference —
            // no manual retype of the full literal needed afterward.
            const modalCmIndex = (await frame.locator('.cm-content').count()) - 1;
            await frame.evaluate(({ index }) => {
                const el = document.querySelectorAll('.cm-content')[index] as any;
                const view = el.cmView.view;
                const text = view.state.doc.toString();
                const start = text.indexOf('"Anne"');
                if (start === -1) { throw new Error(`"Anne" not found in record field: ${text}`); }
                view.dispatch({ selection: { anchor: start, head: start + '"Anne"'.length } });
                view.focus();
            }, { index: modalCmIndex });
            logStep('Selected "Anne" value in place (structure preserved)');

            await frame.getByText('Configurables', { exact: true }).last().click({ force: true });
            await page.page.waitForTimeout(1500);
            const newConfig = frame.getByText('New Configurable', { exact: false }).last();
            await newConfig.waitFor({ state: 'visible', timeout: 15000 });
            await newConfig.click({ force: true });
            await page.page.waitForTimeout(2000);
            logStep('New Configurable form open');

            const configNameBox = frame.getByRole('textbox', { name: /Variable Name/i }).last();
            await configNameBox.click({ force: true });
            await page.page.keyboard.type(configName, { delay: 40 });
            await page.page.keyboard.press('Tab');
            await page.page.waitForTimeout(400);
            await page.page.keyboard.type('string', { delay: 40 });
            await page.page.waitForTimeout(800);
            await page.page.keyboard.press('Escape');
            const cms = frame.locator('.cm-content');
            await cms.nth((await cms.count()) - 2).click({ force: true });
            await page.page.keyboard.type('"Anne"', { delay: 40 });
            await page.page.waitForTimeout(800);
            await page.page.keyboard.press('Escape');
            const saveConfig = frame.getByRole('button', { name: 'Save' }).last();
            await saveConfig.click({ force: true });
            await pollGenerated('config.bal', `configurable string ${configName} = "Anne"`);
            logStep('config.bal has the new configurable');

            // The blue chip appears at the selected position — wait generously
            // since this environment's render timing varies. NOTE: closing and
            // reopening the modal as a fallback was tried and found harmful —
            // it re-fetches the node's last SAVED value, discarding the
            // in-progress (unsaved) configurable insertion and reverting the
            // field back to the original "Anne" literal. A direct, longer wait
            // is safer than a "recovery" path that destroys the edit.
            const chip = overlay.locator('.cm-content span[contenteditable="false"]', { hasText: configName }).first();
            await chip.waitFor({ state: 'visible', timeout: 30000 });
            await expectBlueChip(chip);
            logStep('Configurable rendered as blue chip at the exact insertion point');

            // The record's surrounding structure must have survived the
            // insertion — no manual retype was performed.
            const modalText = (await overlay.locator('.cm-content').last().innerText()).replace(/\s+/g, ' ').trim();
            expect(modalText).toContain('name:');
            expect(modalText).toContain(configName);
            expect(modalText).toContain('age: 30');
            logStep('Record structure preserved without manual retype');

            await overlay.locator('vscode-button, button').first().click({ force: true });
            await page.page.waitForTimeout(1000);
            await saveOpenForm(frame);
            await pollGenerated('automation.bal', `${personTypeName} ${recordVarName} = {name: ${configName}, age: 30}`);
            logStep('automation.bal has the configurable reference');

            // Reopen the node and untick the optional "age" field: its entry
            // must drop entirely from the combined Expression value (not
            // just go blank), and the change must flow through to source.
            const node2 = frame.getByText(new RegExp(`${recordVarName} = \\{`)).last();
            await reopenRecordNode(node2, recordMode);
            const overlay2 = await openRecordConfigModal(frame, node2, recordMode);
            logStep('Reopened Record Configuration modal');

            // The required "name" field's checkbox is disabled; "age" (an
            // optional field) is the only enabled one.
            const ageCheckbox = overlay2.locator('[data-testid="parameter-branch"] vscode-checkbox:not([disabled])').last();
            await ageCheckbox.waitFor({ state: 'visible', timeout: 10000 });
            await ageCheckbox.click({ force: true });
            await page.page.waitForTimeout(1500);
            expect(await ageCheckbox.getAttribute('aria-checked')).toBe('false');
            logStep('Unchecked the age field');

            const modalText2 = (await overlay2.locator('.cm-content').last().innerText()).replace(/\s+/g, ' ').trim();
            expect(modalText2).not.toContain('age');
            expect(modalText2).toContain('name:');
            expect(modalText2).toContain(configName);
            logStep('Expression value dropped the age entry entirely');

            const declareSave = panel.getByRole('button', { name: 'Save' }).last();
            await expect(declareSave).toBeEnabled({ timeout: 5000 });

            await overlay2.locator('vscode-button, button').first().click({ force: true });
            await page.page.waitForTimeout(1000);
            await saveOpenForm(frame);

            // "name: personName" was already true from the earlier save, so
            // polling for its presence alone would return a stale positive —
            // wait specifically until "age" actually disappears from source.
            const deadline = Date.now() + 30000;
            let finalSource = readGenerated('automation.bal');
            while (Date.now() < deadline && finalSource.includes('age')) {
                await page.page.waitForTimeout(1000);
                finalSource = readGenerated('automation.bal');
            }
            expect(finalSource).not.toContain('age');
            expect(finalSource).toContain(`name: ${configName}`);
            logStep('automation.bal record literal has no age field');
        });

        test('MySQL Query with SQL Mode Toggle', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            logStep(`Adding MySQL connection + query (attempt ${testAttempt})`);

            const frame = await getWebviewFrame();
            const panel = frame.getByTestId('side-panel');

            await openNodePalette(frame);
            await panel.getByText('Add Connection', { exact: false }).first().click({ force: true });
            await page.page.waitForTimeout(3000);
            const search = panel.locator('input[placeholder*="Search"], input[type="text"]').first();
            if (await search.isVisible({ timeout: 5000 }).catch(() => false)) {
                await search.fill('mysql');
                await page.page.waitForTimeout(3000);
            }
            const card = frame.locator('#connector-mysql').first();
            await card.waitFor({ state: 'visible', timeout: 60000 });
            await card.click({ force: true });
            logStep('MySQL connector selected');

            const loading = frame.locator('text=Loading connector package...');
            await loading.waitFor({ state: 'visible', timeout: 10000 }).catch(() => { });
            await loading.waitFor({ state: 'hidden', timeout: 300000 }).catch(() => { });
            const connNameBox = frame.getByRole('textbox', { name: /Connection Name/i }).first();
            await connNameBox.waitFor({ state: 'visible', timeout: 60000 });
            await frame.getByRole('button', { name: 'Save Connection' }).last().click({ force: true });
            await pollGenerated('connections.bal', 'final mysql:Client mysqlClient = check new ()', 300000);
            logStep('connections.bal has mysql:Client');

            // After saving, the side panel re-renders back to the connector
            // list with mysqlClient available — this can take a few seconds
            // longer than the source-file write. Only fall back to opening a
            // fresh node palette if the panel actually closed (diagram-only).
            const mysqlEntry = panel.getByText('mysqlClient', { exact: false }).first();
            const mysqlEntryVisible = await mysqlEntry.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
            if (!mysqlEntryVisible) {
                const panelStillOpen = await panel.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
                if (!panelStillOpen) {
                    await openNodePalette(frame);
                }
                await mysqlEntry.waitFor({ state: 'visible', timeout: 30000 });
            }
            await mysqlEntry.click({ force: true });
            await page.page.waitForTimeout(2500);
            await panel.getByText('Query', { exact: true }).first().click({ force: true });
            await page.page.waitForTimeout(3000);

            const sqlMode = frame.getByTestId('primary-mode');
            const exprMode = frame.getByTestId('expression-mode');
            await sqlMode.waitFor({ state: 'visible', timeout: 15000 });
            expect(await sqlMode.innerText()).toBe('SQL');
            expect(await exprMode.innerText()).toBe('Expression');
            logStep('SQL/Expression mode switcher visible');

            const cm = panel.locator('.cm-content').first();
            await cm.click({ force: true });
            await page.page.keyboard.type('SELECT * FROM users', { delay: 30 });
            await page.page.waitForTimeout(2000);
            await domClick(exprMode);
            await expect(panel.locator('.cm-content').first()).toContainText('`SELECT * FROM users`', { timeout: 15000 });
            logStep('Expression mode shows backtick template');
            await domClick(sqlMode);
            await expect(panel.locator('.cm-content').first()).toContainText('SELECT * FROM users', { timeout: 15000 });
            logStep('SQL mode restored raw statement');

            await saveOpenForm(frame);
            await pollGenerated('automation.bal', 'mysqlClient->query(`SELECT * FROM users`)');
            logStep('automation.bal has the query call');
        });

        test('AI Agent Prompt with Markdown Tools', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            logStep(`Adding AI agent with markdown prompt (attempt ${testAttempt})`);

            const frame = await getWebviewFrame();
            const panel = frame.getByTestId('side-panel');

            await openNodePalette(frame);
            await panel.getByText('AI', { exact: true }).first().click({ force: true });
            await page.page.waitForTimeout(2000);
            await panel.getByText('Agent', { exact: true }).last().click({ force: true });
            await page.page.waitForTimeout(2500);
            await panel.getByText('Add Agent', { exact: false }).last().click({ force: true });
            await panel.getByText('AI Agent', { exact: true }).first().waitFor({ timeout: 30000 });
            logStep('AI Agent form open');

            // Expand Instructions (second Expand Editor) → markdown toolbar
            const expandBtns = panel.locator('[title="Expand Editor"]');
            await expandBtns.nth(1).waitFor({ state: 'visible', timeout: 15000 });
            await expandBtns.nth(1).click({ force: true });
            await page.page.waitForTimeout(2500);
            for (const tool of ['Bold', 'Italic', 'Bulleted List', 'Numbered List', 'Blockquote']) {
                expect(await frame.locator(`[title="${tool}"]`).count(), `markdown toolbar missing ${tool}`).toBeGreaterThan(0);
            }
            logStep('Markdown toolbar present');

            const ed = frame.locator('.cm-content, [contenteditable="true"]').last();
            await ed.click({ force: true });
            await page.page.keyboard.type('You are a helpful assistant', { delay: 20 });
            await page.page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
            await frame.locator('[title="Bold"]').last().click({ force: true });
            await page.page.waitForTimeout(800);
            await page.page.keyboard.press('End');
            await page.page.keyboard.press('Enter');
            await frame.locator('[title="Bulleted List"]').last().click({ force: true });
            await page.page.waitForTimeout(500);
            await page.page.keyboard.type('Answer briefly', { delay: 20 });
            await page.page.waitForTimeout(800);
            const html = await ed.evaluate((el) => el.innerHTML);
            expect(html).toContain('<strong>You are a helpful assistant</strong>');
            expect(html).toContain('<li>');
            logStep('Bold + bulleted list applied in the rich prompt editor');

            await frame.locator('[title="Minimize Editor"], [title="Minimize"]').last().click({ force: true });
            await page.page.waitForTimeout(1500);

            // Fill required Query: insert the "greeting" (int) variable via
            // the helper pane's Variables section — it renders as the same
            // blue chip widget used for configurables. NOTE: use a scalar
            // variable here, not the "p" record — interpolating a record
            // directly into a string template doesn't compile.
            const queryEd = panel.locator('.cm-content, [contenteditable="true"]').last();
            await queryEd.click({ force: true });
            await page.page.waitForTimeout(1000);
            await frame.getByText('Variables', { exact: true }).last().waitFor({ timeout: 10000 });
            await frame.getByText('Variables', { exact: true }).last().click({ force: true });
            const greetingOption = frame.getByText(greetingName, { exact: true }).last();
            await greetingOption.waitFor({ state: 'visible', timeout: 15000 });
            await greetingOption.click({ force: true });
            await page.page.waitForTimeout(1500);

            const varChip = queryEd.locator('span[contenteditable="false"]', { hasText: greetingName }).first();
            await varChip.waitFor({ state: 'visible', timeout: 10000 });
            await expectBlueChip(varChip);
            logStep(`${greetingName} variable rendered as blue chip in the prompt editor`);
            await page.page.keyboard.press('Escape');

            const save = panel.getByRole('button', { name: 'Save' }).last();
            await expect(save).toBeEnabled({ timeout: 15000 });
            await save.click({ force: true });
            logStep('Agent node saved');

            const agents = await pollGenerated('agents.bal', '**You are a helpful assistant**');
            expect(agents).toContain('* Answer briefly');
            await pollGenerated('automation.bal', `aiAgent.run(string \`\${${greetingName}}\`)`);
            logStep('agents.bal markdown + automation.bal run call with variable chip verified');
        });
    });
}
