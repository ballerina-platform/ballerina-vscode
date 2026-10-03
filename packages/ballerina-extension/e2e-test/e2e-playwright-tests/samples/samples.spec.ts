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
import { expect, Frame, Page, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, dataFolder, initTest, logStep, page, vscode } from '../utils/helpers';
import { switchToIFrame } from '@wso2/playwright-vscode-tester';

// `switchToIFrame` resolves the FIRST `iframe.webview.ready` on the page. A
// window that previously showed the Welcome/samples webview can still have
// that iframe present (though hidden) alongside the new BI design webview,
// so the first match isn't reliably the right one. Fall back to resolving
// the LAST such iframe and descending into it manually — the same two-stage
// strategy the e2e-authoring daemon's `waitForGuest` prelude uses.
async function findBIWebview(candidate: Page): Promise<Frame | null> {
    try {
        const frame = await switchToIFrame(BI_INTEGRATOR_LABEL, candidate, 5000);
        if (frame) {
            return frame;
        }
    } catch {
        // fall through to the manual resolution below
    }
    try {
        const webview = candidate.locator('iframe.webview.ready').last();
        if (!(await webview.isVisible({ timeout: 1000 }).catch(() => false))) {
            return null;
        }
        const handle = await webview.elementHandle();
        const outer = await handle?.contentFrame();
        const child = outer?.childFrames().find((f) => {
            try {
                return f.url().includes('vscode-webview') || f.url().includes('fake.html');
            } catch {
                return false;
            }
        }) ?? outer?.childFrames()[0] ?? outer;
        if (child) {
            await child.waitForLoadState().catch(() => undefined);
            return child;
        }
    } catch {
        // no match this pass
    }
    return null;
}

export default function createTests() {
    test.describe.serial('Use Samples in the WSO2 Integrator', {
    }, async () => {
        initTest(false);

        const downloadDir = path.join(dataFolder, 'sample_download');
        let projectWindow: Page | undefined;

        test.afterAll(async () => {
            if (projectWindow && !projectWindow.isClosed()) {
                await projectWindow.close().catch(() => undefined);
            }
            fs.rmSync(downloadDir, { recursive: true, force: true });
        });

        test('Browse and use a built-in sample', async () => {
            const workbenchPage = page.page;

            logStep('Clicking on the WSO2 Integrator activity tab');
            const wso2IntegratorActivity = workbenchPage.locator(
                `#workbench\\.parts\\.activitybar a.action-label[aria-label="${BI_INTEGRATOR_LABEL}"]`
            ).first();
            await wso2IntegratorActivity.waitFor({ state: 'visible', timeout: 120000 });
            await wso2IntegratorActivity.click();

            logStep('Clicking on the "Get Started" button in the Integrator side bar');
            const getStartedButton = workbenchPage.getByRole('button', { name: 'Get Started' }).first();
            // The sidebar can still be settling right after the activity-bar
            // switch under CI load, so give this more room than a bare 10s.
            await getStartedButton.waitFor({ timeout: 30000 });
            await getStartedButton.click();

            logStep('Waiting for the Welcome webview to load');
            const welcomeWebView = await switchToIFrame('Welcome', workbenchPage);
            if (!welcomeWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }
            await welcomeWebView.waitForLoadState();
            await welcomeWebView.getByRole('heading', { name: 'WSO2 Integrator' }).waitFor({ timeout: 60000 });

            logStep('Clicking "Explore" to open the samples browser');
            await welcomeWebView.getByRole('button', { name: 'Explore', exact: true }).click();

            // The samples page renders into this same "Welcome" webview/iframe,
            // so there's no new frame to resolve — the heading wait below is
            // what actually gates on the view swap.
            const samplesWebView = welcomeWebView;
            await samplesWebView.getByRole('heading', { name: 'Browse Samples' }).waitFor({ timeout: 60000 });
            logStep('Samples view is visible');

            const readResultCount = async (): Promise<number> => {
                const text = await samplesWebView.getByText(/^\d+ results?$/).innerText();
                const match = text.match(/(\d+)/);
                if (!match) {
                    throw new Error(`could not parse a results count from "${text}"`);
                }
                return Number(match[1]);
            };

            // Poll for the results count to settle below `below`, instead of a
            // fixed sleep — the filter/search state updates asynchronously and
            // a fixed wait can read a stale count under load.
            const waitForResultCountBelow = async (below: number, timeoutMs = 15000): Promise<number> => {
                const deadline = Date.now() + timeoutMs;
                let last = await readResultCount();
                while (last >= below && Date.now() < deadline) {
                    await workbenchPage.waitForTimeout(300);
                    last = await readResultCount();
                }
                return last;
            };

            // The count can briefly read "0 results" right after the "Browse
            // Samples" heading appears, while the catalog is still loading —
            // poll past that instead of reading it once.
            const waitForResultCountAbove = async (above: number, timeoutMs = 15000): Promise<number> => {
                const deadline = Date.now() + timeoutMs;
                let last = await readResultCount();
                while (last <= above && Date.now() < deadline) {
                    await workbenchPage.waitForTimeout(300);
                    last = await readResultCount();
                }
                return last;
            };

            const initialCount = await waitForResultCountAbove(0);
            expect(initialCount).toBeGreaterThan(0);
            logStep(`Initial sample count: ${initialCount}`);

            logStep('Clicking the "Sample" type filter (built-in samples only)');
            await samplesWebView.getByRole('button', { name: 'Sample', exact: true }).click({ force: true });
            const filteredCount = await waitForResultCountBelow(initialCount);
            logStep(`Sample-only count: ${filteredCount}`);
            expect(filteredCount).toBeGreaterThan(0);
            expect(filteredCount).toBeLessThan(initialCount);

            logStep('Clicking "All" again and searching for a sample');
            await samplesWebView.getByRole('button', { name: 'All', exact: true }).click({ force: true });
            await expect.poll(() => readResultCount(), { timeout: 15000 }).toBeGreaterThan(filteredCount);
            const searchBox = samplesWebView.getByRole('textbox', { name: 'Text field' });
            await searchBox.click({ force: true });
            await searchBox.fill('Hello World');

            const sampleCard = samplesWebView.getByRole('article').filter({ hasText: 'Hello World Service' });
            await sampleCard.waitFor({ state: 'visible', timeout: 15000 });
            logStep('Sample filtered and shown: Hello World Service');

            logStep('Clicking "Use this" on the filtered sample');
            await sampleCard.getByRole('button', { name: 'Use this' }).click({ force: true });

            // "Use this" triggers window.showOpenDialog for the download
            // directory. The harness renders VS Code's in-workbench simple file
            // dialog (files.simpleDialog.enable) rather than a native OS picker,
            // so it's reachable through the host workbench page, not the
            // samples webview. Type an explicit destination instead of
            // accepting the dialog's default (see the comment on `downloadDir`
            // above for why the default isn't safe to rely on here).
            // The path is intentionally left not-yet-created: the simple file
            // dialog auto-navigates into any typed path that already resolves
            // to an existing folder (its own "up a level" entry becomes the
            // active list item, so accepting just steps up instead of picking
            // the typed folder). Leaving it non-existent means nothing in the
            // listing matches, so the dialog accepts the typed path as-is.
            logStep('Typing an explicit sample download directory');
            const dialogPathInput = workbenchPage.locator('.quick-input-widget input[type="text"]').first();
            await dialogPathInput.waitFor({ state: 'visible', timeout: 20000 });
            await dialogPathInput.fill(downloadDir);
            const selectFolderButton = workbenchPage.getByRole('button', { name: 'Select Folder' });
            await selectFolderButton.waitFor({ state: 'visible', timeout: 20000 });
            await selectFolderButton.click();

            // Since the typed directory doesn't exist yet, VS Code asks to
            // confirm creating it before proceeding with the download.
            logStep('Confirming creation of the download directory');
            const createFolderConfirm = workbenchPage.getByRole('button', { name: 'OK', exact: true });
            await createFolderConfirm.waitFor({ state: 'visible', timeout: 10000 });
            await createFolderConfirm.click();

            logStep('Waiting for the download to finish and choosing "New Window"');
            const newWindowButton = workbenchPage.getByRole('button', { name: 'New Window' });
            await newWindowButton.waitFor({ state: 'visible', timeout: 60000 });
            await newWindowButton.click();

            // "New Window" spawns a genuinely new Electron window in some
            // environments, but has also been observed to just navigate the
            // current one in place — so every open, non-closed window is a
            // candidate here (most recently opened first), not only windows
            // that appeared after the click. Matching is still tied to this
            // specific sample's content below, which is what actually rules
            // out a stale window from an earlier retry attempt.
            logStep('Waiting for the sample\'s integration overview to load');
            const deadline = Date.now() + 120000;
            let projectWebView;
            while (Date.now() < deadline && !projectWebView) {
                const openWindows = vscode!.windows().filter((w: Page) => !w.isClosed());
                for (const candidate of [...openWindows].reverse()) {
                    try {
                        await candidate.waitForLoadState('domcontentloaded', { timeout: 3000 });
                        // "Add Artifact" alone is the generic overview affordance
                        // shown by any open BI window — tie the match to this
                        // specific sample too. The project's folder slug
                        // ("hello-world-service") never appears in the webview's
                        // own content (only its display title, "Hello World
                        // Service", does) — but it is the native OS window
                        // title, which is cheaper and more reliable to check.
                        if (!(await candidate.title()).includes('hello-world-service')) {
                            continue;
                        }
                        const frame = await findBIWebview(candidate);
                        if (!frame) {
                            continue;
                        }
                        const overviewReady = await frame.getByText('Add Artifact').first()
                            .waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
                        if (!overviewReady) {
                            continue;
                        }
                        projectWebView = frame;
                        projectWindow = candidate;
                        break;
                    } catch {
                        // Not this window (or not ready yet) — try the next one / poll again.
                    }
                }
                if (!projectWebView) {
                    await workbenchPage.waitForTimeout(2000);
                }
            }
            if (!projectWebView) {
                throw new Error('Integration overview for the downloaded sample did not appear in any open window');
            }
            logStep('Sample loaded; integration overview is visible');
        });
    });
}
