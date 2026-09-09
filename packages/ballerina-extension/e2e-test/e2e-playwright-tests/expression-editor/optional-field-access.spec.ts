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
import { expect, test, Frame, Locator } from '@playwright/test';
import {
    addArtifact,
    BI_INTEGRATOR_LABEL,
    BI_WEBVIEW_NOT_FOUND_ERROR,
    initTest,
    logStep,
    newProjectPath,
    page,
    submitArtifactCreation
} from '../utils/helpers';
import { Form, switchToIFrame } from '@wso2/playwright-vscode-tester';
import { Diagram, SidePanel } from '../utils/pages';

// Fixture with a `Doc` record type that has a nullable optional field
// (`string? documentId?`) already created — matching issue
// product-integrator#2173. Type creation is owned by type-editor specs, so we
// don't rebuild it through the UI here.
const OPTIONAL_FIELD_PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'optional_field_access_project');

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

/**
 * Click an architecture-diagram node until it actually navigates. These nodes
 * wire onMouseDown/onMouseUp through a click-with-drag-tolerance handler, so a
 * layout shift mid-click reads as a drag and the click is silently dropped.
 * Retry against `expected` — the view the click is supposed to open.
 */
async function clickUntil(
    node: Locator,
    expected: Locator,
    description: string,
    attempts: number = 5
): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt++) {
        await node.click({ force: true, timeout: 15000 }).catch(() => { /* node re-rendering; retry */ });
        const opened = await expected.waitFor({ state: 'visible', timeout: 15000 })
            .then(() => true).catch(() => false);
        if (opened) {
            return;
        }
    }
    throw new Error(`Clicking the ${description} did not open the expected view after ${attempts} attempts`);
}

async function getWebviewFrame(): Promise<Frame> {
    const webview = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
    if (!webview) {
        throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
    }
    return webview;
}

// Set a CodeMirror editor's full content through the CM view API.
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
    await frame.getByTestId('bi-diagram-canvas').waitFor({ timeout: 120000 });
    await page.page.waitForTimeout(1000);
}

async function openNodePalette(frame: Frame): Promise<SidePanel> {
    const diagram = new Diagram(page.page);
    await diagram.init();
    await frame.getByRole('button', { name: 'Close the mini chat' }).click({ force: true, timeout: 2000 }).catch(() => { });
    const canvas = frame.getByTestId('bi-diagram-canvas');
    await canvas.waitFor({ timeout: 120000 });

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

// Declare a variable node (name + type), then set its expression literal and save.
async function declareVariable(frame: Frame, name: string, type: string, expression: string): Promise<void> {
    const sidePanel = await openNodePalette(frame);
    await sidePanel.clickNode('Declare Variable');
    await page.page.waitForTimeout(1000);
    const form = new Form(page.page, BI_INTEGRATOR_LABEL, frame);
    await form.switchToFormView(false, frame);
    await form.fill({
        values: {
            'Name*Name of the variable': { type: 'input', value: name },
            'Type': { type: 'textarea', value: type, additionalProps: { clickLabel: true } }
        }
    });
    await dismissHelperPanel();
    const panel = frame.getByTestId('side-panel');
    const expr = panel.locator('.cm-content').last();
    await expr.click({ force: true });
    await page.page.waitForTimeout(500);
    await cmSet(frame, expression, (await frame.locator('.cm-content').count()) - 1);
    await page.page.waitForTimeout(1000);
    await saveOpenForm(frame);
}

// Build a field-access expression entirely through the helper pane: open a new
// Declare Variable node, focus the Expression editor, open the Variables
// section, drill through `navPath` (each entry clicks that row's navigation
// arrow), then click the `leaf` field to insert it. Returns the built
// expression text. The variable is saved with `name` so multiple cases in the
// same automation don't collide (the name is set AFTER the drill because the
// helper pane's completion re-render clears a name set beforehand).
async function buildFieldAccess(
    frame: Frame,
    opts: { navPath: string[]; leaf: string; resultType: string; name: string }
): Promise<string> {
    const sidePanel = await openNodePalette(frame);
    await sidePanel.clickNode('Declare Variable');
    await page.page.waitForTimeout(1000);
    const form = new Form(page.page, BI_INTEGRATOR_LABEL, frame);
    await form.switchToFormView(false, frame);
    await form.fill({
        values: {
            'Type': { type: 'textarea', value: opts.resultType, additionalProps: { clickLabel: true } }
        }
    });
    await dismissHelperPanel();

    const panel = frame.getByTestId('side-panel');
    const expr = panel.locator('.cm-content').last();
    await expr.click({ force: true });
    await page.page.waitForTimeout(1000);

    const variablesTab = frame.getByText('Variables', { exact: true }).last();
    await variablesTab.waitFor({ state: 'visible', timeout: 15000 });
    await variablesTab.click({ force: true });
    await page.page.waitForTimeout(1000);

    for (const nav of opts.navPath) {
        const navBtn = frame.locator(`[data-testid="helper-pane-nav-${nav}"]`).first();
        await navBtn.waitFor({ state: 'visible', timeout: 15000 });
        await navBtn.click({ force: true });
        await page.page.waitForTimeout(1500);
        logStep(`Drilled into ${nav}`);
    }

    const leafItem = frame.locator(`[data-testid="helper-pane-item-${opts.leaf}"]`).first();
    await leafItem.waitFor({ state: 'visible', timeout: 15000 });
    await leafItem.click({ force: true });
    await page.page.waitForTimeout(1500);

    const built = (await panel.locator('.cm-content').last().innerText()).replace(/\s+/g, '');
    logStep(`Helper pane built: ${built}`);

    // Name the variable (after the drill) so serial cases don't collide.
    await form.fill({
        values: {
            'Name*Name of the variable': { type: 'input', value: opts.name }
        }
    });
    await dismissHelperPanel();
    await saveOpenForm(frame);
    return built;
}

// Shared across the serial cases (one automation, one `doc` variable).
let docVar = 'doc';

export default function createTests() {
    test.describe.serial('Optional Field Access Tests', {
    }, async () => {
        initTest(true, true, undefined, undefined, OPTIONAL_FIELD_PROJECT_TEMPLATE);

        test('Setup: automation with a Doc variable', async ({ }, testInfo) => {
            docVar = `doc${testInfo.retry + 1}`;
            logStep(`Optional field access setup (${docVar})`);

            await addArtifact('Automation', 'automation');
            const frame = await getWebviewFrame();
            await submitArtifactCreation(frame);

            const diagramCanvas = frame.getByTestId('bi-diagram-canvas');
            const automationNode = frame.locator('[data-testid="entry-node-automation"]');
            const landedOnDiagram = await diagramCanvas.waitFor({ timeout: 10000 })
                .then(() => true).catch(() => false);
            if (!landedOnDiagram) {
                await automationNode.waitFor({ state: 'visible', timeout: 30000 });
                await clickUntil(automationNode, diagramCanvas, 'Automation entry node');
            }
            logStep('Automation created');

            // `meta` is a nilable record field (`Meta?`), set to nil here.
            await declareVariable(frame, docVar, 'Doc', '{name: "sample", meta: ()}');
            await pollGenerated('automation.bal', `Doc ${docVar} = {name: "sample", meta: ()}`);
            logStep(`${docVar} : Doc declared`);
        });

        // Case 1: accessing a required field THROUGH a nilable record field
        // (`meta: Meta?`) must use `?.` — the nilability-across-navigation fix.
        test('Nested nilable record field access uses ?.', async () => {
            const frame = await getWebviewFrame();
            const built = await buildFieldAccess(frame, {
                navPath: [docVar, 'meta'],
                leaf: 'documentId',
                resultType: 'string?',
                name: 'nestedRequired'
            });
            expect(built).toContain(`${docVar}.meta?.documentId`);
            expect(built).not.toContain(`${docVar}.meta.documentId`);

            const source = await pollGenerated('automation.bal', `${docVar}.meta?.documentId`);
            expect(source).toContain(`= ${docVar}.meta?.documentId`);
            expect(source).not.toContain(`${docVar}.meta.documentId`);
            logStep('Verified: doc.meta?.documentId');
        });

        // Case 2: an OPTIONAL field (`label?`) inside the nilable record is still
        // reached with `?.`, because the access passes through the nilable `meta`.
        test('Optional field inside a nilable record uses ?.', async () => {
            const frame = await getWebviewFrame();
            const built = await buildFieldAccess(frame, {
                navPath: [docVar, 'meta'],
                leaf: 'label',
                resultType: 'string?',
                name: 'nestedOptional'
            });
            expect(built).toContain(`${docVar}.meta?.label`);
            expect(built).not.toContain(`${docVar}.meta.label`);

            const source = await pollGenerated('automation.bal', `${docVar}.meta?.label`);
            expect(source).toContain(`= ${docVar}.meta?.label`);
            expect(source).not.toContain(`${docVar}.meta.label`);
            logStep('Verified: doc.meta?.label');
        });

        // Case 3: an OPTIONAL primitive field on the (non-nilable) root record is
        // reached with plain `.` — the parent `doc` is not nilable, so no `?.` is
        // added. Guards against spurious optional access.
        test('Optional primitive field on the root record uses plain access', async () => {
            const frame = await getWebviewFrame();
            const built = await buildFieldAccess(frame, {
                navPath: [docVar],
                leaf: 'docId',
                resultType: 'string?',
                name: 'rootOptional'
            });
            expect(built).toContain(`${docVar}.docId`);
            expect(built).not.toContain(`${docVar}?.docId`);

            const source = await pollGenerated('automation.bal', `= ${docVar}.docId`);
            expect(source).toContain(`= ${docVar}.docId`);
            expect(source).not.toContain(`${docVar}?.docId`);
            logStep('Verified: doc.docId (plain access)');
        });
    });
}
