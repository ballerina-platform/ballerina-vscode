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
import { test } from '@playwright/test';
import * as path from 'path';
import { initTest, logStep, page, toggleNotifications } from '../../utils/helpers';
import { waitForBISidebarTreeView } from '../../utils/helpers/sidebar';
import { ProjectExplorer } from '../../utils/pages';
import { DEFAULT_PROJECT_NAME } from '../../utils/helpers/constants';
import { FileUtils } from '../../utils/helpers/fileSystem';

const RUN_BUTTON_SELECTOR = 'ul.actions-container[role="toolbar"] li.action-item a[role="button"][aria-label="Run Integration"]';
// Integrations run concurrently; only re-running the SAME integration prompts
// to restart it (product-integrator#1012). This suite uses a single-package
// project, so a second Run always targets the same integration.
const CONFLICT_PROMPT_TEXT = 'This integration is already running';

// Single-package template with a pre-baked long-running automation
// (~5 min sleep) so the first run stays alive while conflicts are triggered.
// Pre-baked per the e2e-writer rule: scenarios must not modify Ballerina
// sources at runtime.
const PROJECT_TEMPLATE = path.join(__dirname, '..', '..', 'data', 'run_conflict_project');
const RUN_MARKER = 'run-conflict automation started';

async function clickRunButton() {
    const runButton = page.page.locator(RUN_BUTTON_SELECTOR).first();
    await runButton.waitFor({ timeout: 10000 });
    await runButton.click();
}

function conflictNotification() {
    return page.page.locator('.notification-toast-container', { hasText: CONFLICT_PROMPT_TEXT }).first();
}

function runningMarker() {
    return page.page.locator('.xterm-screen', { hasText: RUN_MARKER }).first();
}

// Clicks the debug toolbar Stop button until no session remains (bounded).
async function stopAllRunningIntegrations() {
    for (let i = 0; i < 4; i++) {
        const stopButton = page.page.locator('.debug-toolbar a[aria-label^="Stop"]').first();
        if (!await stopButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            return;
        }
        await stopButton.click().catch(() => undefined);
        await page.page.waitForTimeout(1500);
    }
}

export default function createTests() {
    test.describe.serial('Run Conflict (Same-Integration Restart) Tests', {
    }, async () => {
        initTest(true, true, undefined, undefined, PROJECT_TEMPLATE);

        test.afterAll(async () => {
            logStep('run-conflict: cleaning up runs and notifications');
            // Dismiss any notification/quickpick a failed test may have left open.
            await page.page.keyboard.press('Escape').catch(() => undefined);
            // Stop the long-running automation so it does not leak into
            // subsequent suites on the soft-reload path.
            await stopAllRunningIntegrations();
            // Restore Do Not Disturb for the rest of the suite.
            await toggleNotifications(true);
        });

        test('Start first run', async () => {
            logStep('Disabling Do Not Disturb so prompts render');
            // Conflict prompts are notifications; DND must be off to see them.
            await toggleNotifications(false);

            logStep('Waiting for the BI sidebar and project tree (cold start)');
            // On a standalone (cold-start) run no prior suite has warmed up the
            // extension: dismiss any stuck quick input, switch to the WSO2
            // Integrator activity (the file explorer is focused initially),
            // and give the language server time to index the project.
            await page.page.keyboard.press('Escape').catch(() => undefined);
            const gitPrompt = page.page.locator('.notification-toast-container', { hasText: 'git repository was found' });
            if (await gitPrompt.isVisible({ timeout: 1000 }).catch(() => false)) {
                await gitPrompt.getByRole('button', { name: 'Never' }).click().catch(() => undefined);
            }
            await waitForBISidebarTreeView(page, 60000);
            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.init().catch(() => undefined);
            await page.page
                .locator(ProjectExplorer.treeItemSelector(DEFAULT_PROJECT_NAME))
                .first()
                .waitFor({ timeout: 90000 });

            logStep('Locating automation entry point in explorer');
            const mainEntryPoint = await projectExplorer.findItem([DEFAULT_PROJECT_NAME, 'Entry Points', 'main']);

            // Open automation.bal so ${file} in the launch config resolves.
            await FileUtils.openProjectFileInEditor('automation.bal');
            await mainEntryPoint.click();

            logStep('Clicking Run Integration (first run)');
            await clickRunButton();

            logStep('Waiting for run output marker');
            await runningMarker().waitFor({ timeout: 60000 });
            logStep('First run is alive');
        });

        test('Second run shows conflict prompt', async () => {
            logStep('Clicking Run Integration while a run is active');
            await clickRunButton();

            logStep('Waiting for the restart prompt');
            const notification = conflictNotification();
            await notification.waitFor({ timeout: 15000 });

            // Both choices must be offered.
            await notification.getByRole('button', { name: 'Yes', exact: true }).waitFor({ timeout: 5000 });
            await notification.getByRole('button', { name: 'No', exact: true }).waitFor({ timeout: 5000 });
            logStep('Restart prompt visible with Yes/No');
        });

        test('Decline keeps the current run', async () => {
            logStep('Declining the restart prompt');
            const notification = conflictNotification();
            await notification.getByRole('button', { name: 'No', exact: true }).click();
            await notification.waitFor({ state: 'detached', timeout: 10000 });

            logStep('Verifying the original run is untouched');
            // The original process must still be alive: its output is still on
            // screen and no termination message has appeared.
            await runningMarker().waitFor({ timeout: 10000 });

            // The cancelled session must not leave an error notification behind.
            const errorNotification = page.page.locator('.notification-toast-container', { hasText: /Failed to run/i });
            if (await errorNotification.isVisible({ timeout: 2000 }).catch(() => false)) {
                throw new Error('Cancelled launch produced an error notification');
            }
            logStep('Decline path verified');
        });

        test('Accept stops old run and starts new run', async () => {
            logStep('Clicking Run Integration again');
            await clickRunButton();

            logStep('Accepting the restart prompt');
            const notification = conflictNotification();
            await notification.waitFor({ timeout: 15000 });
            await notification.getByRole('button', { name: 'Yes', exact: true }).click();

            logStep('Waiting for a fresh compile/run cycle');
            // The new task must reach a fresh "Compiling source" → run-output
            // cycle. The old task's terminal is replaced, so waiting for a
            // fresh start marker is sufficient.
            const compiling = page.page.locator('.xterm-screen', { hasText: 'Compiling source' }).first();
            await compiling.waitFor({ timeout: 60000 });
            await runningMarker().waitFor({ timeout: 60000 });
            logStep('Restart (accept) path verified');
        });

        test('Exactly one instance runs after restart', async () => {
            logStep('Clicking Run to confirm a single active instance');
            // A further Run click must prompt again — proving the previous
            // accept path left exactly one active instance of this integration.
            await clickRunButton();

            const notification = conflictNotification();
            await notification.waitFor({ timeout: 15000 });
            await notification.getByRole('button', { name: 'No', exact: true }).click();
            await notification.waitFor({ state: 'detached', timeout: 10000 });
            logStep('Single-instance invariant verified');
        });

        test('Rapid double Run shows at most one prompt', async () => {
            logStep('Clearing leftover notifications');
            // Clear any lingering notification from the previous test first.
            await page.page.keyboard.press('Escape').catch(() => undefined);
            await page.page.waitForTimeout(500);

            logStep('Clicking Run twice in quick succession');
            // Two quick launches of the same integration must not stack two
            // conflict prompts — the duplicate launch is cancelled quietly
            // (in-flight guard dedup in integration-runner-state).
            await clickRunButton();
            await clickRunButton();

            logStep('Waiting for the (single) restart prompt');
            const notification = conflictNotification();
            await notification.waitFor({ timeout: 20000 });
            await page.page.waitForTimeout(1500);
            const promptCount = await page.page
                .locator('.notification-toast-container', { hasText: CONFLICT_PROMPT_TEXT })
                .count();
            if (promptCount > 1) {
                throw new Error(`Expected at most one conflict prompt, found ${promptCount}`);
            }
            await notification.getByRole('button', { name: 'No', exact: true }).click();
            await notification.waitFor({ state: 'detached', timeout: 10000 });

            logStep('Verifying the original run survived the double click');
            // The original run must still be alive.
            await runningMarker().waitFor({ timeout: 10000 });
            logStep('Rapid double Run verified');
        });

        test('Run right after stopping does not claim already running', async () => {
            logStep('Stopping the running integration via debug toolbar');
            // product-integrator#1690: stopping kills the debug session, but the
            // bal process takes a moment to exit. Running again in that window
            // must NOT show the "already running" prompt — the guard silently
            // waits for the process to exit and proceeds.
            const stopButton = page.page.locator('.debug-toolbar a[aria-label^="Stop"]').first();
            await stopButton.waitFor({ timeout: 10000 });
            await stopButton.click();

            logStep('Re-running immediately, before the process exits');
            // Immediately re-run, without waiting for the process to exit.
            await clickRunButton();

            if (await conflictNotification().isVisible({ timeout: 3000 }).catch(() => false)) {
                throw new Error('"Already running" prompt appeared for a stopped integration (#1690)');
            }

            logStep('Waiting for the fresh run to start');
            // A fresh run must start.
            const compiling = page.page.locator('.xterm-screen', { hasText: 'Compiling source' }).first();
            await compiling.waitFor({ timeout: 60000 });
            await runningMarker().waitFor({ timeout: 60000 });
            logStep('Stop-then-rerun (#1690) verified');
        });
    });
}
