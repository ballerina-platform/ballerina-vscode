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

// Fixture with `getFullName(string firstName, string lastName) returns string`
// already defined in functions.bal — function creation through the ParamManager
// UI is covered by other-artifacts/function.spec.ts; this spec only needs a
// stable multi-string-parameter function to call from the expression editor.
const PARAM_CHIP_PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'expression_editor_param_chip_project');

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

async function dismissHelperPanel(): Promise<void> {
    await page.page.keyboard.press('Escape');
    await page.page.waitForTimeout(300);
    await page.page.keyboard.press('Escape');
    await page.page.waitForTimeout(300);
}

async function openNodePalette(frame: Frame): Promise<SidePanel> {
    const diagram = new Diagram(page.page);
    await diagram.init();
    // The floating Copilot orb's mini chat can end up open and sit on top of
    // the diagram — close it defensively so it never masks the canvas wait.
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

// Reads every value/parameter chip's rendered text out of the given CodeMirror
// expression editor (the widget spans the ChipExpressionEditor click-to-edit
// fix marks with `data-chip-widget`).
async function readChips(frame: Frame): Promise<{ text: string; chips: string[] }> {
    return frame.evaluate(() => {
        const editors = document.querySelectorAll('.cm-content');
        const el = editors[editors.length - 1] as HTMLElement;
        return {
            text: el.textContent ?? '',
            chips: Array.from(el.querySelectorAll('[data-chip-widget]')).map((c) => (c.textContent ?? '').trim())
        };
    });
}

export default function createTests() {
    test.describe.serial('Expression Editor Function Call Arguments Tests', {
    }, async () => {
        // Loads a fixture with getFullName(string, string) returns string
        // already defined — see PARAM_CHIP_PROJECT_TEMPLATE above.
        initTest(true, true, undefined, undefined, PARAM_CHIP_PROJECT_TEMPLATE);

        test('Type the arguments of a function call inserted from the helper pane', async ({ }, testInfo) => {
            logStep('Creating automation and declaring a variable initialized with getFullName(...)');

            await addArtifact('Automation', 'automation');
            const frame = await getWebviewFrame();
            await submitArtifactCreation(frame);

            const diagramCanvas = frame.getByTestId('bi-diagram-canvas');
            await diagramCanvas.waitFor({ timeout: 30000 });
            logStep('Automation created');

            const sidePanel = await openNodePalette(frame);
            await sidePanel.clickNode('Declare Variable');
            await page.page.waitForTimeout(1000);
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, frame);
            await form.switchToFormView(false, frame);
            await form.fill({
                values: {
                    'Name*Name of the variable': { type: 'input', value: 'fullName' },
                    'Type': { type: 'textarea', value: 'string', additionalProps: { clickLabel: true } }
                }
            });
            await dismissHelperPanel();
            logStep('Declare Variable form open: name=fullName, type=string');

            // Insert getFullName() via the helper pane's Functions section — the
            // same path the multi-mode expression editor uses in the product.
            const panel = frame.getByTestId('side-panel');
            const exprCm = panel.locator('.cm-content').last();
            await exprCm.click({ force: true });
            await page.page.waitForTimeout(800);
            await frame.getByText('Functions', { exact: true }).first().click({ force: true });
            await page.page.waitForTimeout(800);
            const search = frame.getByRole('textbox', { name: 'Text field' }).last();
            await search.click({ force: true });
            await search.fill('getFullName');
            await page.page.waitForTimeout(1200);
            await frame.getByText('getFullName()', { exact: true }).first().click({ force: true });
            await page.page.waitForTimeout(1200);

            // Expression mode shows plain source, so the call lands with an empty
            // argument list and the cursor inside it, not $1/$2 placeholder chips
            // (which would otherwise be literal text in the source).
            let result = await readChips(frame);
            expect(result.text, `function call not inserted as expected: ${result.text}`).toBe('getFullName()');
            expect(result.chips, 'Expression mode should render no chips').toEqual([]);
            logStep(`Function call inserted with an empty argument list: ${result.text}`);

            // Type both arguments, including spaces, straight into the parentheses.
            // Focus without clicking: CodeMirror keeps the cursor the insert placed.
            await exprCm.focus();
            await page.page.waitForTimeout(300);
            await page.page.keyboard.type('"first name", "last name"', { delay: 60 });
            await page.page.waitForTimeout(800);

            result = await readChips(frame);
            expect(result.text, 'typed arguments did not land inside the call parentheses')
                .toBe('getFullName("first name", "last name")');
            expect(result.chips).toEqual([]);
            logStep(`Arguments typed inside the parentheses: ${result.text}`);

            // Moving focus away must keep the source exactly as typed.
            const nameField = frame.getByRole('textbox', { name: /Name.*Name of the variable/i }).first();
            await nameField.click({ force: true });
            await page.page.waitForTimeout(1000);

            result = await readChips(frame);
            expect(result.text).toBe('getFullName("first name", "last name")');
            logStep(`Source unchanged after blur: ${result.text}`);

            await dismissHelperPanel();
            const save = frame.getByRole('button', { name: 'Save' }).last();
            await save.waitFor({ timeout: 30000 });
            await save.click({ force: true });
            await diagramCanvas.waitFor({ timeout: 60000 });

            await pollGenerated('automation.bal', 'string fullName = getFullName("first name", "last name");');
            logStep('automation.bal verified: string fullName = getFullName("first name", "last name");');
        });
    });
}
