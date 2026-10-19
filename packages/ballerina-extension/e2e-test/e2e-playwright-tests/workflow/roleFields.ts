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

import { expect } from '@playwright/test';
import type { Frame, Locator } from '@playwright/test';
import { switchToIFrame } from '@wso2/playwright-vscode-tester';
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, domClick, page } from '../utils/helpers';

// Shared steps for the forms that name who decides a task: a role field offers a list of names and an
// expression mode, and `()` typed as the expression says the named users alone decide
// (wso2/product-integrator#2719).

export const TYPE_ERROR = /incompatible types/;

export async function getWebview(): Promise<Frame> {
    const webview = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 60000);
    if (!webview) {
        throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
    }
    return webview;
}

// Writes an expression field through its CodeMirror view; see diagram/flow-nodes.spec.ts.
export async function fillExEditor(webview: Frame, key: string, value: string): Promise<void> {
    const container = webview.locator(`[data-testid="ex-editor-${key}"]`).first();
    await container.waitFor({ state: 'visible', timeout: 30000 });
    await container.locator('.cm-content').first().waitFor({ state: 'attached', timeout: 30000 });
    await container.evaluate((element, text) => {
        const cmContent = element.querySelector('.cm-content') as HTMLElement & { cmView?: { view?: any } };
        const view = cmContent?.cmView?.view;
        if (!view) {
            throw new Error('CodeMirror view not found in ex-editor container');
        }
        view.focus();
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }, value);
    await page.page.waitForTimeout(400);
    // The helper popup stays open over the fields below it; the next click would land in it.
    await page.page.keyboard.press('Escape');
}

// Fills the CodeMirror text field under a form label (Task Name is one). The content is set through
// the editor view, then a keystroke pair commits it to the form model: a text-mode editor ignores a
// dispatched change until a key arrives, and typing the whole value loses its first key to select-all.
export async function fillTextField(panel: Locator, label: string, value: string): Promise<void> {
    const labelText = `translate(normalize-space(.), '*', '')='${label}'`;
    const editor = panel.locator(`xpath=.//*[not(self::script)][${labelText}][not(.//*[${labelText}])]`).first()
        .locator('xpath=ancestor::*[.//*[contains(@class,"cm-content")]][1]')
        .locator('.cm-content').filter({ visible: true }).first();
    await editor.waitFor({ state: 'visible', timeout: 60000 });
    await editor.click({ timeout: 10000 });
    await page.page.waitForTimeout(300);
    await editor.evaluate((element, text) => {
        const view = (element as HTMLElement & { cmView?: { view?: any } }).cmView?.view;
        if (!view) {
            throw new Error('CodeMirror view not found under the label');
        }
        view.focus();
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }, value);
    await page.page.keyboard.press('End');
    await page.page.keyboard.type(' ', { delay: 30 });
    await page.page.keyboard.press('Backspace');
    await expect.poll(() => editor.textContent(), { timeout: 10000 }).toBe(value);
    await page.page.waitForTimeout(400);
    await page.page.keyboard.press('Escape');
}

// Opens a saved node's form with a real mouse click on its label: the diagram engine listens for mouse
// events, so a dispatched DOM click does nothing, and the canvas is locked for a moment after a save.
export async function openNode(canvas: Locator, label: string, formReady: Locator): Promise<void> {
    const node = canvas.getByText(label, { exact: true }).filter({ visible: true }).first();
    await node.waitFor({ state: 'visible', timeout: 60000 });
    for (let attempt = 0; attempt < 6; attempt++) {
        const box = await node.boundingBox();
        if (box) {
            await page.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        } else {
            await node.click({ force: true, timeout: 5000 }).catch(() => undefined);
        }
        if (await formReady.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false)) {
            return;
        }
        await page.page.waitForTimeout(2000);
    }
    throw new Error(`clicking the '${label}' node did not open its form`);
}

export function exEditorText(webview: Frame, key: string): Promise<string | null> {
    return webview.locator(`[data-testid="ex-editor-${key}"] .cm-content`).first().textContent();
}

// Switches a two-mode field to its expression mode. A field that already holds a value asks before the
// switch drops it; Continue keeps going.
export async function switchToExpression(panel: Locator, key: string): Promise<void> {
    const slider = panel.getByTestId(`mode-switcher-slider-${key}`);
    await slider.waitFor({ state: 'visible', timeout: 30000 });
    await domClick(slider.getByTestId('expression-mode'));
    const proceed = panel.getByRole('button', { name: 'Continue' });
    if (await proceed.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false)) {
        await domClick(proceed);
    }
    await panel.locator(`[data-testid="ex-editor-${key}"]`).first().waitFor({ state: 'visible', timeout: 30000 });
}

// Opens every collapsed "Advanced Configurations" section the panel shows, including a policy sub-form's.
export async function expandAdvanced(panel: Locator): Promise<void> {
    for (let round = 0; round < 4; round++) {
        const expand = panel.getByText('Expand', { exact: true }).filter({ visible: true }).first();
        if (!await expand.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) {
            return;
        }
        await domClick(expand);
        await page.page.waitForTimeout(500);
    }
}

// Picks an option of a dropdown field by the field's label.
export async function selectDropdown(panel: Locator, label: RegExp, option: string): Promise<void> {
    const dropdown = panel.getByRole('combobox', { name: label }).first();
    await dropdown.waitFor({ state: 'visible', timeout: 60000 });
    await dropdown.click({ force: true });
    await page.page.waitForTimeout(500);
    const item = panel.getByRole('option', { name: option }).first();
    if (await item.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) {
        await item.click({ force: true });
    } else {
        await domClick(panel.getByText(option, { exact: true }).first());
    }
    await expect(dropdown).toHaveText(new RegExp(option), { timeout: 30000 });
}

// The identifier fields validate after each edit, and Save stays disabled until the last result is in.
export async function waitForEnabled(button: Locator): Promise<void> {
    await button.waitFor({ state: 'visible', timeout: 60000 });
    await expect.poll(() => button.getAttribute('disabled'), { timeout: 30000 }).toBeNull();
    await page.page.waitForTimeout(500);
}

// Types a value the field's type refuses and then `()`: the first proves the type check runs on this
// field, the second that nil passes it.
export async function expectNilAccepted(webview: Frame, panel: Locator, key: string): Promise<void> {
    await fillExEditor(webview, key, '1');
    await expect(panel.getByText(TYPE_ERROR).first()).toBeVisible({ timeout: 60000 });
    await fillExEditor(webview, key, '()');
    await expect(panel.getByText(TYPE_ERROR)).toHaveCount(0, { timeout: 60000 });
}

// Fills the reviewer fields of a Human Approval / Retry-then-Review sub-form: roles `()`, users as the
// given expression (a literal name by default).
export async function fillReviewers(webview: Frame, panel: Locator, rolesKey: string, usersKey: string,
    users = '"alice"'): Promise<void> {
    await expandAdvanced(panel);
    await switchToExpression(panel, usersKey);
    await fillExEditor(webview, usersKey, users);
    await switchToExpression(panel, rolesKey);
    await expectNilAccepted(webview, panel, rolesKey);
}
