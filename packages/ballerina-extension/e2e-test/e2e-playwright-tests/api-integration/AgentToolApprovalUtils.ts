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

import { Frame, Locator } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { BI_INTEGRATOR_LABEL, getWebview, newProjectPath, page } from '../utils/helpers';

// Helpers for the agent tool approval-function flows: building a custom tool through the UI and reading
// what it generates.

export async function webview(): Promise<Frame> {
    return getWebview(BI_INTEGRATOR_LABEL, page);
}

// Diagram controls are SVG groups that ignore a synthetic coordinate click; dispatch the events instead.
export async function diagramClick(locator: Locator): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    await locator.evaluate((el) => {
        for (const type of ['pointerover', 'mouseover', 'mouseenter', 'pointerenter', 'pointerdown', 'mousedown',
            'mouseup', 'click']) {
            el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
        }
    });
}

export async function clickText(frame: Frame, text: string): Promise<void> {
    const target = frame.getByText(text, { exact: true }).last();
    await target.waitFor({ state: 'attached', timeout: 30000 });
    await target.click({ force: true });
}

export async function openAddToolPanel(): Promise<void> {
    const frame = await webview();
    for (let attempt = 0; attempt < 3; attempt++) {
        await diagramClick(frame.locator('[data-testid="agent-add-tool"]').first());
        const opened = await frame.getByText('Create Custom Tool', { exact: true }).last()
            .waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
        if (opened) {
            return;
        }
    }
    throw new Error('Add Tool panel did not open');
}

// The parameter's type box has no label of its own; it is the textbox right before the parameter's Name box.
export async function addToolParameter(type: string, name: string): Promise<void> {
    const frame = await webview();
    const nameBox = frame.getByRole('textbox', { name: /^Name\*Name of the parameter/ });
    if (!await nameBox.isVisible().catch(() => false)) {
        await frame.locator('div:has(i.codicon-add) >> text=Add Parameter').first().click();
        await nameBox.waitFor({ timeout: 15000 });
    }
    const boxes = await frame.getByRole('textbox').all();
    let typeBox: Locator | undefined;
    for (let i = 1; i < boxes.length; i++) {
        const label = await boxes[i].evaluate((e) => e.closest('vscode-text-field')?.getAttribute('aria-label')
            || e.getAttribute('aria-label') || '');
        if (label.startsWith('Name*Name of the parameter')) {
            typeBox = boxes[i - 1];
            break;
        }
    }
    if (!typeBox) {
        throw new Error('Parameter type box not found');
    }
    await typeBox.click();
    await page.page.keyboard.press('ControlOrMeta+A');
    await page.page.keyboard.insertText(type);
    await page.page.waitForTimeout(800);
    await page.page.keyboard.press('Escape');
    await nameBox.fill(name);
    const add = frame.getByRole('button', { name: 'Add', exact: true });
    for (let i = 0; i < 20 && await add.isDisabled(); i++) {
        await page.page.waitForTimeout(300);
    }
    await add.click();
    await nameBox.waitFor({ state: 'hidden', timeout: 15000 });
}

// Ticks Requires Approval if needed and adds a new approval function through the field's own form.
export async function addApprovalFunction(name?: string): Promise<void> {
    const frame = await webview();
    const add = frame.locator('#approval-function-add');
    if (!await add.isVisible().catch(() => false)) {
        await frame.locator('[data-testid="approval-required"] vscode-checkbox').first().click();
        await add.waitFor({ timeout: 15000 });
    }
    await add.click();
    await frame.locator('#approval-function-name').waitFor({ timeout: 15000 });
    if (name) {
        await frame.getByRole('textbox', { name: /^Function Name\*/ }).fill(name);
    }
    // Add stays disabled until the language server has checked the name.
    const confirm = frame.locator('#approval-function-add-confirm');
    await frame.locator('#approval-function-add-confirm vscode-button:not([disabled])').waitFor({ timeout: 20000 });
    // A dispatched DOM click doesn't reach this toolkit button's handler; a real click does.
    await confirm.click();
    await frame.locator('[data-testid="approval-function-attached"]').waitFor({ timeout: 20000 });
}

export async function backToAgentView(): Promise<void> {
    const frame = await webview();
    for (let i = 0; i < 5; i++) {
        if (await frame.locator('[data-testid="agent-add-tool"]').isVisible().catch(() => false)) {
            return;
        }
        await frame.locator('[data-testid="back-button"]').first().click({ force: true });
        await page.page.waitForTimeout(2500);
    }
    await frame.locator('[data-testid="agent-add-tool"]').waitFor({ timeout: 60000 });
}

export async function openToolEditForm(toolName: string): Promise<void> {
    await backToAgentView();
    const frame = await webview();
    const tool = frame.locator(`[data-testid="agent-tool-${toolName}"]`).first();
    await tool.waitFor({ timeout: 60000 });
    await tool.dispatchEvent('contextmenu');
    await frame.locator('#menu-item-edit').click({ timeout: 10000 });
    await frame.getByRole('heading', { name: 'Agent Tool' }).waitFor({ timeout: 60000 });
}

function balFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) {
        return [];
    }
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return entry.name === 'target' || entry.name.startsWith('.') ? [] : balFiles(full);
        }
        return entry.name.endsWith('.bal') ? [full] : [];
    });
}

export function collapseWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ');
}

// Waits until the project's sources satisfy a predicate, so a check runs after the save is written.
export async function waitForSources(predicate: (source: string) => boolean, description: string,
    timeoutMs = 60000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let source = '';
    while (Date.now() < deadline) {
        source = balFiles(newProjectPath).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
        if (predicate(source)) {
            return;
        }
        await page.page.waitForTimeout(1000);
    }
    throw new Error(`Timed out waiting for source: ${description}\n${source}`);
}
