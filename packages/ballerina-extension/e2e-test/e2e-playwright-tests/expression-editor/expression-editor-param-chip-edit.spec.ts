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
    test.describe.serial('Expression Editor Parameter Chip Click-to-Edit Tests', {
    }, async () => {
        // Loads a fixture with getFullName(string, string) returns string
        // already defined — see PARAM_CHIP_PROJECT_TEMPLATE above.
        initTest(true, true, undefined, undefined, PARAM_CHIP_PROJECT_TEMPLATE);

        test('Type into a function-call parameter chip, including a space and a boundary click', async ({ }, testInfo) => {
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

            // Insert getFullName(...) via the helper pane's Functions section —
            // the same path the multi-mode chip editor uses in the product:
            // a completion ending in "()" triggers extractArgsFromFunction and
            // produces $1/$2 placeholder chips for the two arguments.
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

            let { text } = await readChips(frame);
            expect(text, `function call not inserted as expected: ${text}`).toMatch(/^getFullName\(.*,.*\)$/);
            logStep(`Function call inserted with placeholder chips: ${text}`);

            // Click the first (still-a-chip) parameter placeholder and type a
            // value containing a space. This is the exact shape of the original
            // bug: typing a space used to trigger a background token refresh
            // that could blank out or corrupt the sibling placeholder chip.
            const firstChip = exprCm.locator('[data-chip-widget]').nth(0);
            await firstChip.click({ force: true });
            await page.page.waitForTimeout(500);
            await page.page.keyboard.type('"first name"', { delay: 60 });
            await page.page.waitForTimeout(800);

            ({ text } = await readChips(frame));
            expect(text, 'typed value did not land fully inside the first param box, or corrupted the sibling placeholder')
                .toBe('getFullName("first name",  )');
            logStep('Typed "first name" landed fully inside the first param box; sibling placeholder untouched');

            // While the chip is still in edit mode, Backspace should delete a single
            // trailing character like normal text editing - not yank the whole chip,
            // which is the behavior for Backspace next to a chip that ISN'T being edited.
            // The cursor sits right after the closing quote that was just typed, so the
            // character Backspace removes is that closing quote, not the last letter.
            await page.page.keyboard.press('Backspace');
            await page.page.waitForTimeout(400);

            ({ text } = await readChips(frame));
            expect(text, 'Backspace while editing a chip should delete one character, not the whole chip')
                .toBe('getFullName("first name,  )');
            logStep('Backspace during edit removed a single character from the active chip');

            // Restore the deleted character before continuing.
            await page.page.keyboard.type('"', { delay: 60 });
            await page.page.waitForTimeout(400);

            ({ text } = await readChips(frame));
            expect(text).toBe('getFullName("first name",  )');

            // Commit with Enter - the chip should re-collapse showing the
            // finished value as ONE chip, not left as raw editable text.
            await page.page.keyboard.press('Enter');
            await page.page.waitForTimeout(1000);

            let result = await readChips(frame);
            expect(result.text).toBe('getFullName("first name",  )');
            expect(result.chips).toEqual(['"first name"', '']);
            logStep(`First param chip committed via Enter and re-collapsed correctly: ${JSON.stringify(result)}`);

            // Click as close to the second chip's edge as possible (not dead
            // center) to exercise the boundary-click fallback: a click landing
            // on the sliver of plain text/gap right at a chip's boundary, not
            // square on its widget, used to fall through to plain cursor
            // placement instead of activating the chip.
            const secondChip = exprCm.locator('[data-chip-widget]').nth(1);
            const box = await secondChip.boundingBox();
            if (!box) throw new Error('second parameter chip not found');
            await page.page.mouse.click(box.x + 1, box.y + box.height / 2);
            await page.page.waitForTimeout(500);
            await page.page.keyboard.type('"last name"', { delay: 60 });
            await page.page.waitForTimeout(800);

            ({ text } = await readChips(frame));
            expect(text, 'edge click did not activate the second param box correctly')
                .toBe('getFullName("first name", "last name")');
            logStep(`Edge click activated the second param box; typed value landed inside it: ${text}`);

            // Commit by moving focus away (blur) instead of pressing Enter.
            const nameField = frame.getByRole('textbox', { name: /Name.*Name of the variable/i }).first();
            await nameField.click({ force: true });
            await page.page.waitForTimeout(1000);

            result = await readChips(frame);
            expect(result.text).toBe('getFullName("first name", "last name")');
            expect(result.chips).toEqual(['"first name"', '"last name"']);
            logStep(`Second param chip committed via blur and re-collapsed correctly: ${JSON.stringify(result)}`);

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
