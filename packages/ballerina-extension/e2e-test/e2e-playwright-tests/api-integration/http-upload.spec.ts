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
    // 20 attempts (~60s worst case): late in a long suite run the diagram can take
    // noticeably longer to become interactive under accumulated system load, even
    // though the click/dispatch strategy itself is not the flaky part.
    for (let attempt = 0; attempt < 20; attempt++) {
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
        if (attempt === 19) {
            throw new Error(`Node panel did not open after clicking diagram add button "${clickedId}"`);
        }
    }
    await expect(locatorOwner.getByText('Connections', { exact: true })).toBeVisible({ timeout: 30000 });
    await expect(locatorOwner.getByText('Control', { exact: true })).toBeVisible({ timeout: 30000 });
    await locatorOwner.getByText('Return', { exact: true }).click({ force: true });
    await expect(locatorOwner.getByText('Return value.', { exact: true })).toBeVisible({ timeout: 30000 });
    await locatorOwner.locator('[data-testid="ex-editor-expression"]').click({ force: true });
    await locatorOwner.getByRole('button', { name: 'Open Helper Panel' }).click({ force: true });
    await expect(locatorOwner.getByText('Inputs', { exact: true })).toBeVisible({ timeout: 30000 });
    await locatorOwner.getByText('Inputs', { exact: true }).click({ force: true });
    await expect(locatorOwner.getByText('payload', { exact: true })).toBeVisible({ timeout: 30000 });
    await locatorOwner.getByText('payload', { exact: true }).click({ force: true });
    await expect.poll(async () => locatorOwner.locator('[data-testid="ex-editor-expression"] .cm-content').evaluate((element) => element.textContent)).toBe('payload');
    // Dispatch directly into CM6 — typing this key-by-key risks bracket auto-close mangling it.
    const expressionText = '{key: string `uploads/${name}`, size: payload.content.length()}';
    const exEditorContainer = locatorOwner.locator('[data-testid="ex-editor-expression"]');
    const dispatched = await exEditorContainer.evaluate((container, text) => {
        const cmContent = container.querySelector('.cm-content');
        const view = (cmContent as any)?.cmView?.view;
        if (!view) {
            return false;
        }
        view.focus();
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
        return true;
    }, expressionText);
    if (!dispatched) {
        const editorInput = exEditorContainer.locator('div[contenteditable="true"]');
        await editorInput.click({ clickCount: 3 });
        await editorInput.fill(expressionText);
    }
    await locatorOwner.getByRole('button', { name: 'Close Helper Panel' }).click({ force: true }).catch(() => {});
    await locatorOwner.getByText('Return value.', { exact: true }).click({ force: true }).catch(() => {});
    await locatorOwner.getByRole('button', { name: 'Save' }).click({ force: true });
    await expect(locatorOwner.getByText(/uploads\/\$\{name\}|uploads/).first()).toBeVisible({ timeout: 60000 });
    await expect.poll(() => FileUtils.readProjectFile('main.bal')).toContain('return {key: string `uploads/${name}`, size: payload.content.length()};');
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

            // The command palette matches against the label ("Run Integration"), not the
            // raw command ID — "BI.project.run" contains no letters the label has, so it
            // never matches and Run never fires. Same pattern automation-run.spec.ts uses.
            await page.page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+Shift+P');
            await page.page.waitForTimeout(500);
            await page.page.keyboard.type('Run Integration');
            await page.page.waitForTimeout(500);
            await page.page.keyboard.press('Enter');

            logStep('Verify upload endpoint response');
            const result = await waitForEndpoint('http://localhost:9090/upload?name=probe.txt', 120000);
            expect([200, 201]).toContain(result.status);
            expect(result.body).toContain('uploads/probe.txt');
            expect(result.body).toContain('"size":5');
        });
    });
}
