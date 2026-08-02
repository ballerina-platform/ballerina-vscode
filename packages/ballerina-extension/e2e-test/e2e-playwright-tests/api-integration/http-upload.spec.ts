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
import { expect, test } from '@playwright/test';
import { addArtifact, BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, initTest, logStep, page } from '../utils/helpers';
import { switchToIFrame, Form } from '@wso2/playwright-vscode-tester';
import { FileUtils } from '../utils/helpers/fileSystem';

async function waitForEndpoint(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{"content":"hello"}',
            });
            return { status: response.status, body: await response.text() };
        } catch {
            await page.page.waitForTimeout(1000);
        }
    }
    throw new Error(`Timed out waiting for ${url}`);
}

async function clickVisibleText(locatorOwner: ReturnType<typeof switchToIFrame> extends Promise<infer T> ? NonNullable<T> : never, text: string) {
    const target = locatorOwner.getByText(text, { exact: true }).last();
    await target.waitFor({ state: 'attached', timeout: 30000 });
    try {
        await target.click({ force: true, timeout: 5000 });
    } catch {
        await target.evaluate((element) => (element as HTMLElement).click());
    }
}

async function clickButtonText(locatorOwner: ReturnType<typeof switchToIFrame> extends Promise<infer T> ? NonNullable<T> : never, text: string, index = -1) {
    const buttons = locatorOwner.getByRole('button', { name: text });
    const target = index >= 0 ? buttons.nth(index) : buttons.last();
    await target.waitFor({ state: 'attached', timeout: 30000 });
    try {
        await target.click({ force: true, timeout: 5000 });
    } catch {
        await target.evaluate((element) => (element as HTMLElement).click());
    }
}

async function configureUploadResourceIO(locatorOwner: ReturnType<typeof switchToIFrame> extends Promise<infer T> ? NonNullable<T> : never) {
    logStep('Configure upload resource query parameter and payload');
    await locatorOwner.getByRole('button', { name: /Configure/i }).click({ force: true });
    await expect(locatorOwner.getByText('Resource Configuration', { exact: true })).toBeVisible({ timeout: 30000 });

    await locatorOwner.getByText('Query Parameter', { exact: true }).click({ force: true });
    await locatorOwner.getByRole('textbox', { name: 'Name*' }).last().fill('name');
    await clickButtonText(locatorOwner, 'Save', 0);
    await expect.poll(async () => locatorOwner.locator('body').innerText(), { timeout: 30000 }).toContain('name');

    await locatorOwner.getByText('Define Payload', { exact: true }).click({ force: true });
    await expect(locatorOwner.getByRole('heading', { name: 'Define Payload' })).toBeVisible({ timeout: 30000 });
    await locatorOwner.locator('textarea').fill('{"content":"hello"}');
    await clickButtonText(locatorOwner, 'Import Type');
    await expect(locatorOwner.getByRole('heading', { name: 'Payload' })).toBeVisible({ timeout: 30000 });
    await expect(locatorOwner.getByText('UploadPayload', { exact: true }).first()).toBeVisible({ timeout: 30000 });
    await expect(locatorOwner.getByText('payload', { exact: true }).first()).toBeVisible({ timeout: 30000 });

    await clickButtonText(locatorOwner, 'Save');
    await locatorOwner.locator('[data-testid="bi-diagram-canvas"]').waitFor({ timeout: 60000 });
    await expect.poll(() => FileUtils.readProjectFile('main.bal'), { timeout: 30000 }).toContain('@http:Payload UploadPayload payload');
    await expect.poll(() => FileUtils.readProjectFile('main.bal'), { timeout: 30000 }).toContain('@http:Query string name');
}

async function addReturnNodeFromDiagram(locatorOwner: ReturnType<typeof switchToIFrame> extends Promise<infer T> ? NonNullable<T> : never) {
    logStep('Add Return node from diagram');
    for (let attempt = 0; attempt < 10; attempt++) {
        const addButton = locatorOwner.locator('[data-testid="empty-node-add-button-1"]').first();
        if (await addButton.waitFor({ state: 'visible', timeout: 1000 }).then(() => true, () => false)) {
            await addButton.hover({ force: true }).catch(() => {});
            await addButton.click({ force: true, timeout: 3000 }).catch(() => {});
        }
        await page.page.waitForTimeout(1000);
        if (await locatorOwner.getByText('Connections', { exact: true }).isVisible().catch(() => false)
            && await locatorOwner.getByText('Return', { exact: true }).isVisible().catch(() => false)) {
            break;
        }
        const clickedId = await locatorOwner.locator('[data-testid]').evaluateAll((elements) => {
            const isVisible = (element: Element) => {
                const rect = element.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            };
            const candidates = elements.filter((element) => {
                const id = element.getAttribute('data-testid') || '';
                return isVisible(element) && (id.startsWith('empty-node-add-button') || id.startsWith('link-add-button'));
            });
            const target = candidates.find((element) => (element.getAttribute('data-testid') || '').startsWith('empty-node-add-button')) || candidates[0];
            if (!target) {
                return '';
            }
            for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
                target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
            }
            return target.getAttribute('data-testid') || '';
        });
        await page.page.waitForTimeout(1000);
        if (await locatorOwner.getByText('Connections', { exact: true }).isVisible().catch(() => false)
            && await locatorOwner.getByText('Return', { exact: true }).isVisible().catch(() => false)) {
            break;
        }
        if (attempt === 9) {
            throw new Error(`Node panel did not open after clicking diagram add button "${clickedId}"`);
        }
    }
    await expect(locatorOwner.getByText('Connections', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(locatorOwner.getByText('Control', { exact: true })).toBeVisible({ timeout: 30000 });
    // 'Control' can render collapsed, leaving Return present but not visible.
    if (!await locatorOwner.getByText('Return', { exact: true }).isVisible().catch(() => false)) {
        await locatorOwner.getByText('Control', { exact: true }).click({ force: true });
    }
    await locatorOwner.getByText('Return', { exact: true }).click({ force: true });
    await expect(locatorOwner.getByText('Return value.', { exact: true })).toBeVisible({ timeout: 30000 });

    // Set the expression through the CodeMirror view. Typing it loses every
    // '{' to the editor's bracket/helper handling — the expression arrives as
    // ": string `uploads/name`, ..." — which leaves Save disabled.
    const expression = '{key: string `uploads/${name}`, size: payload.content.length()}';
    const cmContent = locatorOwner.locator('[data-testid="ex-editor-expression"] .cm-content');
    await cmContent.waitFor({ state: 'attached', timeout: 30000 });
    await cmContent.evaluate((element, text) => {
        const view = (element as HTMLElement & { cmView?: { view?: any } }).cmView?.view;
        if (!view) {
            throw new Error('CodeMirror view not found in ex-editor container');
        }
        view.focus();
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }, expression);
    await expect.poll(() => cmContent.evaluate((element) => element.textContent), { timeout: 30000 }).toBe(expression);

    await page.page.keyboard.press('Escape');
    await locatorOwner.getByRole('button', { name: 'Save' }).last().click({ force: true });
    // The panel closing is the real save signal — matching 'uploads' while the
    // editor is still open passes even when nothing was written to the file.
    await locatorOwner.getByTestId('side-panel').waitFor({ state: 'hidden', timeout: 60000 });
    await expect.poll(() => FileUtils.readProjectFile('main.bal'), { timeout: 30000 }).toContain(`return ${expression};`);
}

export default function createTests() {
    test.describe.serial('HTTP Upload Tests', {}, async () => {
        initTest();

        test('HTTP Upload creates POST resource and verifies endpoint', async () => {
            logStep('Create HTTP Service artifact');
            await addArtifact('HTTP Service', 'http-service-card');
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'Service Base Path*': {
                        type: 'input',
                        value: '/',
                    },
                },
            });
            await form.submit('Create');

            logStep('Add POST /upload resource');
            await artifactWebView.getByRole('button', { name: /Add Resource/i }).first().click({ force: true });
            await clickVisibleText(artifactWebView, 'POST');

            const resourcePathInput = artifactWebView.getByRole('textbox', { name: /Resource Path/i }).or(
                artifactWebView.locator('[data-testid="resource-path-input"]').or(
                    artifactWebView.locator('input[placeholder*="path/foo"]')
                )
            );
            await resourcePathInput.first().waitFor({ timeout: 10000 });
            await resourcePathInput.first().fill('upload');
            await clickVisibleText(artifactWebView, 'Save');

            await artifactWebView.locator('[data-testid="bi-diagram-canvas"]').waitFor({ timeout: 30000 });
            await expect(artifactWebView.getByText('upload', { exact: true }).first()).toBeVisible({ timeout: 30000 });

            await configureUploadResourceIO(artifactWebView);
            await addReturnNodeFromDiagram(artifactWebView);

            logStep('Run integration');
            await FileUtils.openProjectFileInEditor('main.bal');

            // executePaletteCommand types the command and presses Enter with no
            // wait, so Enter can fire before the list narrows to Run Integration.
            await page.page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+p' : 'Control+Shift+p');
            await page.page.keyboard.type('BI.project.run');
            await page.page.locator('.quick-input-list .monaco-list-row', { hasText: 'Run Integration' })
                .first().waitFor({ state: 'visible', timeout: 30000 });
            await page.page.keyboard.press('Enter');
            // Confirm the run started instead of polling a port nothing is on yet.
            await page.page.locator('.xterm-screen', { hasText: 'Running executable' })
                .first().waitFor({ timeout: 180000 });

            logStep('Verify upload endpoint response');
            const result = await waitForEndpoint('http://localhost:9090/upload?name=probe.txt', 120000);
            expect([200, 201]).toContain(result.status);
            expect(result.body).toContain('uploads/probe.txt');
            expect(result.body).toContain('"size":5');
        });
    });
}
