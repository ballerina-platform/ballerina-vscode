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
import * as path from 'path';
import * as os from 'os';
import fs from 'fs';
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, initTest, logStep, newProjectPath, page, toggleNotifications } from '../utils/helpers';
import { switchToIFrame } from '@wso2/playwright-vscode-tester';

type WebView = NonNullable<Awaited<ReturnType<typeof switchToIFrame>>>;

const BASE_URL = 'http://localhost:9090';
const GREETING_JSON = '"message":"Hello, Ballerina!"';

// Fixture with an HTTP service already defined in service.bal (pre-baked, per
// the e2e-writer rule that scenarios must not modify Ballerina sources at
// runtime). Unlike http-try-it.spec.ts, this suite does NOT create the
// project/service through the UI — it opens the existing project directly
// and exercises Try It against the already-defined service.
const PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'http_try_it_existing_project');

async function getWebView(): Promise<WebView> {
    const webview = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
    if (!webview) {
        throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
    }
    return webview;
}

async function clickNotificationButton(name: string, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    const btn = page.page.locator('.notifications-toasts').getByRole('button', { name, exact: true }).first();
    while (Date.now() < deadline) {
        if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
            await btn.scrollIntoViewIfNeeded().catch(() => {});
            if (await btn.click({ timeout: 4000 }).then(() => true, () => false)) {
                return;
            }
        }
        await page.page.waitForTimeout(400);
    }
    throw new Error(`Notification action "${name}" not found within ${timeoutMs}ms`);
}

// hurl.toContain(`GET ${url}/greeting`) also matches `GET .../greeting/name`,
// so a request line is checked for an exact match instead.
function hasExactHurlLine(hurl: string, line: string): boolean {
    return hurl.split('\n').some((l) => l.trim() === line);
}

async function fetchEndpoint(url: string, init: RequestInit = { method: 'GET' }): Promise<{ status: number; body: string; headers: Headers }> {
    const response = await fetch(url, init);
    return { status: response.status, body: await response.text(), headers: response.headers };
}

async function waitForEndpoint(url: string, timeoutMs: number, init?: RequestInit): Promise<{ status: number; body: string; headers: Headers }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            return await fetchEndpoint(url, init);
        } catch {
            await page.page.waitForTimeout(1000);
        }
    }
    throw new Error(`Timed out waiting for ${url}`);
}

/**
 * The Overview's architecture diagram discovers the pre-existing service from
 * source and renders a "http:Service" node; clicking it opens the Service
 * Designer, which already shows the Try It button (no artifact creation).
 */
async function openServiceDesignerForExistingService(webview: WebView) {
    logStep('Open Service Designer for the pre-existing HTTP service');
    const serviceNode = webview.getByText('http:Service', { exact: false }).first();
    await serviceNode.waitFor({ timeout: 30000 });
    await serviceNode.click({ force: true });
    await webview.getByText('Try It', { exact: true }).first().waitFor({ timeout: 30000 });
}

/**
 * Drive Try It entirely from the Service Designer toolbar button. Since the
 * service was never run in this session, the button flow auto-starts it:
 *   Try It -> Hurl-vs-AI pick (first use only) -> "Run Integration"
 *          -> "Test with Try It Client?" -> notebook opens.
 */
async function tryItAutoStartAndWaitForHurl(webview: WebView): Promise<string> {
    logStep('Click the Service Designer Try It button');
    await webview.getByRole('button', { name: /Try It/ }).first().click({ force: true });
    await page.page.waitForTimeout(1500);

    const hurlOption = page.page.getByRole('option', { name: /Try It.*Hurl Client/ }).first();
    if (await hurlOption.isVisible({ timeout: 8000 }).catch(() => false)) {
        logStep('Select the Hurl client from the Try It quick pick');
        await hurlOption.click({ force: true });
    }

    logStep('Let Try It auto-start the integration via "Run Integration"');
    await clickNotificationButton('Run Integration', 30000);

    logStep('Confirm "Test with Try It Client?" / wait for the notebook');
    const hurlPath = path.join(newProjectPath, 'target', 'TryIt.hurl');
    const deadline = Date.now() + 180000;
    let openedCenterAt = 0;
    while (Date.now() < deadline && !fs.existsSync(hurlPath)) {
        for (const container of ['.notifications-toasts', '.notifications-center']) {
            const testBtn = page.page.locator(container).getByRole('button', { name: 'Test', exact: true }).first();
            if (await testBtn.isVisible({ timeout: 300 }).catch(() => false)) {
                await testBtn.click({ timeout: 3000 }).catch(() => {});
                break;
            }
        }
        if (await hurlOption.isVisible({ timeout: 300 }).catch(() => false)) {
            await hurlOption.click({ force: true }).catch(() => {});
        }
        if (Date.now() - openedCenterAt > 8000) {
            await page.executePaletteCommand('Notifications: Show Notifications').catch(() => {});
            openedCenterAt = Date.now();
        }
        await page.page.waitForTimeout(1000);
    }
    if (!fs.existsSync(hurlPath)) {
        throw new Error('TryIt.hurl was not generated after Run Integration / Test');
    }
    return fs.readFileSync(hurlPath, 'utf8');
}

export default function createTests() {
    test.describe.serial('HTTP Try It Existing Service Tests', {}, async () => {
        initTest(true, true, undefined, undefined, PROJECT_TEMPLATE);

        test('Try It works against a pre-existing HTTP service without any authoring step', async () => {
            const webview = await getWebView();

            // initTest turns on Do Not Disturb, which suppresses the notification
            // toasts the Try It auto-start flow relies on. Surface them first.
            await toggleNotifications(false);

            await openServiceDesignerForExistingService(webview);

            const hurl = await tryItAutoStartAndWaitForHurl(webview);
            logStep('Verify the generated TryIt.hurl request cell');
            expect(hasExactHurlLine(hurl, `GET ${BASE_URL}/greeting`)).toBe(true);

            logStep('Verify the notebook opened');
            await expect(page.page.locator('.tabs-container .tab', { hasText: 'TryIt.hurl' }).first())
                .toBeVisible({ timeout: 30000 });

            logStep('Verify the pre-existing service auto-started is serving');
            const running = await waitForEndpoint(`${BASE_URL}/greeting`, 120000);
            expect(running.status).toBe(200);
            expect(running.body).toContain(GREETING_JSON);

            logStep('Execute the request cell and confirm the send succeeds');
            const requestCell = page.page.locator('.cell.code .monaco-editor').first();
            // The notebook tab appearing (checked above) doesn't guarantee the cell's
            // Monaco editor has mounted yet — clicking before it does is a silent
            // no-op with force:true, leaving nothing focused for Control+Enter to run.
            await requestCell.waitFor({ state: 'visible', timeout: 15000 });
            await requestCell.click({ force: true });
            await page.page.waitForTimeout(500);

            // Diagnostics added after two CI-only timeouts (30s, then 60s) confirmed
            // the click/focus itself was fine (focused=DIV.native-edit-context, no
            // notification toast in the way, cell counts matched a healthy local
            // run) — yet no "running" state ever appeared after Control+Enter. That
            // isolates the problem to the raw keybinding itself: on CI's virtual
            // display the Electron window likely never gets real OS-level focus, so
            // "when clause"-gated keybindings like the notebook's Control+Enter can
            // silently no-op even though the DOM element is genuinely focused.
            //
            // The shared executePaletteCommand() helper types the command then
            // immediately presses Enter, racing the quick pick's async filtering —
            // it submits before "Execute Cell" has actually filtered to the top,
            // so build the same flow here but wait for and click the filtered
            // row directly instead of blindly pressing Enter.
            await page.page.keyboard.press(os.platform() === 'darwin' ? 'Meta+Shift+p' : 'Control+Shift+p');
            await page.page.keyboard.insertText('Execute Cell');
            const executeCellCommand = page.page.locator('.quick-input-list').getByText('Execute Cell', { exact: true }).first();
            await executeCellCommand.waitFor({ state: 'visible', timeout: 5000 });
            await executeCellCommand.click();
            await expect(page.page.locator('.codicon-notebook-state-success').first())
                .toBeVisible({ timeout: 30000 });

            logStep('Verify the response status, body and headers');
            const response = await fetchEndpoint(`${BASE_URL}/greeting`);
            expect(response.status).toBe(200);
            expect(response.body).toContain(GREETING_JSON);
            expect(response.headers.get('content-type') ?? '').toContain('application/json');
        });

        // Service-level Try It (already triggered above) generates one
        // markdown+hurl cell pair per resource in the service, so the same
        // notebook from the previous test already contains cells for path
        // param / query param / header param / POST JSON body. The notebook
        // is virtualized (only 1-2 code cells ever mount), so per-cell
        // navigation is unreliable — use "Run All" instead (confirmed via the
        // authoring daemon) and verify each live response with a direct probe,
        // same approach as the GET case above.
        test('POST, path param, query param and header param requests all work as generated', async () => {
            logStep('Verify the generated Hurl cells for the additional resources');
            const hurlPath = path.join(newProjectPath, 'target', 'TryIt.hurl');
            const hurl = fs.readFileSync(hurlPath, 'utf8');
            expect(hurl).toContain(`GET ${BASE_URL}/greeting/name`);
            expect(hurl).toContain(`GET ${BASE_URL}/search`);
            expect(hurl).toContain('q: q');
            expect(hurl).toContain(`GET ${BASE_URL}/secure`);
            expect(hurl).toContain('X-Api-Key: X-Api-Key');
            expect(hurl).toContain(`POST ${BASE_URL}/echo`);
            expect(hurl).toContain('Content-Type: application/json');

            logStep('Run all notebook cells');
            await page.page.getByRole('button', { name: /Run All/i }).first().click({ force: true });
            // The notebook is virtualized (only 1-2 cells ever mount, per the
            // comment above), so per-cell success states can't be counted to
            // confirm all 4 cells finished. Wait for a visible success state
            // as confirmation execution actually started/completed (same
            // signal used for the single-cell case above), then rely on the
            // endpoint probes below — each already polls for up to 30s — for
            // the real correctness check.
            await expect(page.page.locator('.codicon-notebook-state-success').first())
                .toBeVisible({ timeout: 15000 });

            logStep('Verify the path param request');
            const pathParamResponse = await waitForEndpoint(`${BASE_URL}/greeting/name`, 30000);
            expect(pathParamResponse.status).toBe(200);
            expect(pathParamResponse.body).toContain('Hello, name!');

            logStep('Verify the query param request');
            const queryParamResponse = await waitForEndpoint(`${BASE_URL}/search?q=q`, 30000);
            expect(queryParamResponse.status).toBe(200);
            expect(queryParamResponse.body).toContain('"query":"q"');

            logStep('Verify the header param request');
            const headerParamResponse = await waitForEndpoint(`${BASE_URL}/secure`, 30000, {
                method: 'GET', headers: { 'X-Api-Key': 'X-Api-Key' }
            });
            expect(headerParamResponse.status).toBe(200);
            expect(headerParamResponse.body).toContain('"header":"X-Api-Key"');

            logStep('Verify the POST request with a JSON body');
            const postResponse = await waitForEndpoint(`${BASE_URL}/echo`, 30000, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"message":"{?}"}'
            });
            // Ballerina's default response status for a POST resource is 201
            // (Created), not 200 — assert on the actual product behavior.
            expect(postResponse.status).toBe(201);
            expect(postResponse.body).toContain('"echoed":"{?}"');
        });

        // Resource-level Try It: a DIFFERENT button than the Service
        // Designer's (this one lives on a specific resource's flow diagram
        // title bar, tooltip "Try Resource") and is scoped to just that one
        // resource. This only works reliably when the service is ALREADY
        // running (true here, left running by the previous tests) — if it
        // isn't, the click races against the debug-session's own auto-start
        // hook, which calls Try It generically and produces the full
        // multi-resource notebook instead of a scoped one.
        test('Try It from a resource\'s own menu is scoped to just that resource', async () => {
            const webview = await getWebView();

            logStep('Navigate to the secure resource\'s flow diagram');
            await webview.getByText('HTTP Service - /', { exact: false }).first().click({ force: true });
            await page.page.waitForTimeout(1000);
            const secureRow = webview.getByText('secure', { exact: false }).first();
            await secureRow.waitFor({ timeout: 15000 });
            await secureRow.click({ force: true });
            await page.page.waitForTimeout(1500);

            const hurlPath = path.join(newProjectPath, 'target', 'TryIt.hurl');
            const before = fs.statSync(hurlPath).mtimeMs;

            logStep('Click the resource\'s own Try It button');
            const tryResourceBtn = webview.locator('vscode-button[title="Try Resource"]').first();
            await tryResourceBtn.waitFor({ timeout: 15000 });
            await tryResourceBtn.click({ force: true });
            await page.page.waitForTimeout(1500);

            const hurlOption = page.page.getByRole('option', { name: /Try It.*Hurl Client/ }).first();
            if (await hurlOption.isVisible({ timeout: 5000 }).catch(() => false)) {
                await hurlOption.click({ force: true });
            }

            logStep('Discard the prior notebook\'s unsaved state and wait for the scoped notebook');
            const deadline = Date.now() + 30000;
            while (Date.now() < deadline && fs.statSync(hurlPath).mtimeMs <= before) {
                // Re-opening TryIt.hurl scoped to one resource replaces the
                // still-open (executed) service-level notebook at the same
                // path, which triggers a blocking "save changes?" dialog.
                const saveDialog = page.page.locator('.monaco-dialog-box', { hasText: 'Do you want to save the changes' });
                if (await saveDialog.isVisible({ timeout: 300 }).catch(() => false)) {
                    await saveDialog.getByRole('button', { name: "Don't Save", exact: true }).click({ timeout: 3000 }).catch(() => {});
                }
                const testBtn = page.page.locator('.notifications-toasts, .notifications-center').getByRole('button', { name: 'Test', exact: true }).first();
                if (await testBtn.isVisible({ timeout: 300 }).catch(() => false)) {
                    await testBtn.click({ timeout: 3000 }).catch(() => {});
                }
                await page.page.waitForTimeout(500);
            }
            expect(fs.statSync(hurlPath).mtimeMs).toBeGreaterThan(before);

            logStep('Verify the notebook is scoped to just /secure');
            const hurl = fs.readFileSync(hurlPath, 'utf8');
            expect(hurl).toContain(`GET ${BASE_URL}/secure`);
            expect(hurl).not.toContain('/greeting');
            expect(hurl).not.toContain('/search');
            expect(hurl).not.toContain('/echo');

            logStep('Verify the live response');
            const response = await waitForEndpoint(`${BASE_URL}/secure`, 15000, {
                method: 'GET', headers: { 'X-Api-Key': 'X-Api-Key' }
            });
            expect(response.status).toBe(200);
            expect(response.body).toContain('"header":"X-Api-Key"');
        });
    });
}
