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
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, getWebview, initTest, logStep, page, vscode } from '../utils/helpers';
import { switchToIFrame } from '@wso2/playwright-vscode-tester';

export default function createTests() {
    test.describe.serial('Use Samples in the WSO2 Integrator', {
    }, async () => {
        initTest(false);
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
            await getStartedButton.waitFor({ timeout: 10000 });
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

            const samplesWebView = await getWebview('Welcome', page);
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

            const initialCount = await readResultCount();
            expect(initialCount).toBeGreaterThan(0);
            logStep(`Initial sample count: ${initialCount}`);

            logStep('Clicking the "Sample" type filter (built-in samples only)');
            await samplesWebView.getByRole('button', { name: 'Sample', exact: true }).click({ force: true });
            await workbenchPage.waitForTimeout(1000);
            const filteredCount = await readResultCount();
            logStep(`Sample-only count: ${filteredCount}`);
            expect(filteredCount).toBeLessThan(initialCount);

            logStep('Clicking "All" again and searching for a sample');
            await samplesWebView.getByRole('button', { name: 'All', exact: true }).click({ force: true });
            await workbenchPage.waitForTimeout(1000);
            const searchBox = samplesWebView.getByRole('textbox', { name: 'Text field' });
            await searchBox.click({ force: true });
            await searchBox.fill('Hello World');
            await workbenchPage.waitForTimeout(1000);

            const sampleCard = samplesWebView.getByRole('article').filter({ hasText: 'Hello World Service' });
            await sampleCard.waitFor({ state: 'visible', timeout: 15000 });
            logStep('Sample filtered and shown: Hello World Service');

            logStep('Clicking "Use this" on the filtered sample');
            await sampleCard.getByRole('button', { name: 'Use this' }).click({ force: true });

            // "Use this" triggers window.showOpenDialog for the download
            // directory. The harness renders VS Code's in-workbench simple file
            // dialog (files.simpleDialog.enable) rather than a native OS picker,
            // so it's reachable through the host workbench page, not the
            // samples webview. Confirming it keeps the default directory
            // (the already-open test workspace), which is fine for this flow.
            logStep('Confirming the sample download directory');
            const selectFolderButton = workbenchPage.getByRole('button', { name: 'Select Folder' });
            await selectFolderButton.waitFor({ state: 'visible', timeout: 20000 });
            await selectFolderButton.click();

            logStep('Waiting for the download to finish and choosing "New Window"');
            const newWindowButton = workbenchPage.getByRole('button', { name: 'New Window' });
            await newWindowButton.waitFor({ state: 'visible', timeout: 60000 });
            await newWindowButton.click();

            // The sample opens in a brand-new Electron window rather than
            // reloading the current one. Counting `vscode.windows()` before
            // and after is unreliable — VS Code can also settle back to the
            // same window count if a stale window closes as the new one
            // opens — so instead repeatedly try every currently open,
            // non-closed window (most recent first) until one of them shows
            // the sample's integration overview.
            logStep('Waiting for the sample\'s integration overview to load');
            const deadline = Date.now() + 120000;
            let projectWebView;
            while (Date.now() < deadline && !projectWebView) {
                const openWindows = vscode!.windows().filter((w) => !w.isClosed());
                for (const candidate of [...openWindows].reverse()) {
                    try {
                        await candidate.waitForLoadState('domcontentloaded', { timeout: 3000 });
                        const frame = await switchToIFrame(BI_INTEGRATOR_LABEL, candidate, 5000);
                        if (frame && await frame.getByText('Add Artifact').isVisible({ timeout: 3000 }).catch(() => false)) {
                            projectWebView = frame;
                            break;
                        }
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
