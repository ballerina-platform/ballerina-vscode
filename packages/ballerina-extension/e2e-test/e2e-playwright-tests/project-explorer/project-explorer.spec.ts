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
import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import { initTest, logStep, page, reacquireWindow } from '../utils/helpers';
import { waitForBISidebarTreeView } from '../utils/helpers/sidebar';
import { getWebview } from '../utils/helpers';
import { BI_INTEGRATOR_LABEL } from '../utils/helpers/constants';
import { ProjectExplorer } from '../utils/pages';

// Two-package Ballerina workspace ("Education") used as the multi-integration
// fixture for this suite:
//   - institutes: a RabbitMQ event integration ("myQueue" / onMessage)
//   - school: an HTTP service (/foo), a Kafka event integration
//     (kafkaListener / onConsumerRecord) and an Automation ("main")
const EDUCATION_WORKSPACE_TEMPLATE = path.join(__dirname, '..', 'data', 'project_explorer_workspace');

// Non-bundled Central packages this fixture's event integrations depend on.
// `bal pull` fetches each package together with its transitive dependencies
// (e.g. kafka pulls the confluent.* modules).
const CONNECTOR_MODULES = ['ballerinax/kafka', 'ballerinax/rabbitmq'];

// The event-integration tree nodes ("Kafka Event Integration", the RabbitMQ
// listener) only appear once the language server resolves the connector
// packages above and builds the project's semantic model. Unlike ballerina/http
// (bundled in the distribution), these are pulled from Ballerina Central. On a
// cold cache — every fresh CI runner — that resolution doesn't finish within
// the tree assertion window, so the nodes never render and the suite fails
// consistently. Pre-pulling the packages into the shared central cache before
// VS Code opens the workspace makes CI mirror a warm local cache. `bal pull` is
// idempotent: when a package is already cached it prints "Package already
// exists." and exits 0, so this is a fast no-op on developer machines.
function warmConnectorDependencies() {
    for (const module of CONNECTOR_MODULES) {
        try {
            logStep(`Ensuring ${module} is available in the local Ballerina cache`);
            execFileSync('bal', ['pull', module], { stdio: 'pipe', timeout: 180000 });
        } catch (err) {
            const details = err as { stdout?: unknown; stderr?: unknown; message?: string };
            const output = `${details.stdout ?? ''}${details.stderr ?? ''}`;
            // A non-zero exit for an already-cached package is expected on some
            // distributions; only surface genuinely unexpected failures.
            if (!/already exists/i.test(output)) {
                console.warn(`  ⚠️  Failed to pre-pull ${module}: ${output || details.message}`);
            }
        }
    }
}

function treeItem(label: string) {
    return page.page.locator(ProjectExplorer.treeItemSelector(label)).first();
}

// Dismisses the "git repository was found in parent folders" toast (raised
// for any workspace not itself a git repo) and switches to the WSO2
// Integrator activity so the project tree renders.
async function openWorkspaceTree() {
    logStep('Opening WSO2 Integrator sidebar for the Education workspace');

    const dismissPromptsAndWaitForTree = async () => {
        await page.page.keyboard.press('Escape').catch(() => undefined);
        const gitPrompt = page.page.locator('.notification-toast-container', { hasText: 'git repository was found' });
        const gitPromptShown = await gitPrompt.waitFor({ state: 'visible', timeout: 2000 }).then(() => true).catch(() => false);
        if (gitPromptShown) {
            await gitPrompt.getByRole('button', { name: 'Never' }).click().catch(() => undefined);
        }
        await waitForBISidebarTreeView(page, 60000);
        await treeItem('School').waitFor({ timeout: 60000 });
    };

    try {
        await dismissPromptsAndWaitForTree();
    } catch (err) {
        // The BI extension can reload the window once while finishing
        // activation, closing the page this test was launched with. Depending on
        // timing this surfaces either as "Target page ... has been closed" or as
        // a downstream wait failing against the now-dead page. Retry only when
        // the window was actually closed (the reliable signal); any other error
        // propagates unchanged.
        const message = (err as Error)?.message ?? '';
        const windowClosed = page.page?.isClosed?.() === true || /has been closed/i.test(message);
        if (!windowClosed) {
            throw err;
        }
        logStep('Window reloaded during activation — re-acquiring VS Code window and retrying');
        await reacquireWindow(60000);
        await dismissPromptsAndWaitForTree();
    }
}

export default function createTests() {
    test.describe.serial('Project Explorer Tests', {}, async () => {
        // Warm the connector packages into the central cache before initTest
        // launches VS Code, so the language server can resolve the event
        // integrations without a slow cold-cache pull mid-test.
        test.beforeAll(warmConnectorDependencies);

        initTest(true, true, undefined, undefined, EDUCATION_WORKSPACE_TEMPLATE);

        test('View project tree for a multi-integration workspace', async () => {
            await openWorkspaceTree();

            await expect(treeItem('Institutes')).toBeVisible();
            await expect(treeItem('School')).toBeVisible();

            const sideBar = page.page.locator('#workbench\\.parts\\.sidebar');
            await expect(sideBar.getByRole('button', { name: 'Open Overview' })).toBeVisible();
            await expect(sideBar.getByRole('button', { name: 'Refresh' })).toBeVisible();
        });

        test('Expand and collapse an integration node', async () => {
            logStep('Expanding "School"');
            const schoolItem = treeItem('School');
            await schoolItem.click();
            await expect(schoolItem).toHaveAttribute('aria-expanded', 'true', { timeout: 10000 });
            await expect(treeItem('Entry Points')).toBeVisible();
            await expect(treeItem('HTTP Service - /foo')).toBeVisible();
            await expect(treeItem('Kafka Event Integration')).toBeVisible();
            await expect(treeItem('main')).toBeVisible();

            logStep('Collapsing "Entry Points"');
            const entryPoints = treeItem('Entry Points');
            await entryPoints.click();
            await expect(entryPoints).toHaveAttribute('aria-expanded', 'false', { timeout: 10000 });
            await expect(treeItem('HTTP Service - /foo')).not.toBeVisible();
            await expect(treeItem('main')).not.toBeVisible();

            logStep('Re-expanding "Entry Points"');
            await entryPoints.click();
            await expect(entryPoints).toHaveAttribute('aria-expanded', 'true', { timeout: 10000 });
            await expect(treeItem('HTTP Service - /foo')).toBeVisible();
        });

        test('Select an artifact in the tree navigates to its designer view', async () => {
            logStep('Clicking "HTTP Service - /foo" in the tree');
            await treeItem('HTTP Service - /foo').click();

            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);
            await expect(artifactWebView.getByRole('heading', { name: 'HTTP Service' })).toBeVisible({ timeout: 15000 });
            await expect(artifactWebView.getByText('bar', { exact: true }).first()).toBeVisible({ timeout: 15000 });
            await expect(artifactWebView.getByText('greeting', { exact: true }).first()).toBeVisible({ timeout: 15000 });
        });

        test('Show Visualizer opens the integration overview', async () => {
            logStep('Hovering "School" and clicking its "Show Visualizer" action');
            const schoolItem = treeItem('School');
            await schoolItem.hover();
            const sideBar = page.page.locator('#workbench\\.parts\\.sidebar');
            const vizBtn = sideBar.getByRole('button', { name: 'Show Visualizer' }).first();
            await vizBtn.waitFor({ timeout: 10000 });
            await vizBtn.click();

            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);
            await expect(artifactWebView.getByRole('button', { name: /Add Artifact/i })).toBeVisible({ timeout: 15000 });
        });

        test('Open Overview and Refresh from the project root', async () => {
            const sideBar = page.page.locator('#workbench\\.parts\\.sidebar');

            logStep('Clicking "Open Overview" on the workspace-root toolbar');
            await sideBar.getByRole('button', { name: 'Open Overview' }).first().click();
            const workspaceWebView = await getWebview(BI_INTEGRATOR_LABEL, page);
            await expect(workspaceWebView.getByRole('heading', { name: 'Education' })).toBeVisible({ timeout: 15000 });

            logStep('Clicking "Refresh" on the workspace-root toolbar');
            await sideBar.getByRole('button', { name: 'Refresh' }).first().click();
            await expect(treeItem('Institutes')).toBeVisible({ timeout: 15000 });
            await expect(treeItem('School')).toBeVisible({ timeout: 15000 });
        });

        test('Delete an artifact from the tree via the context menu', async () => {
            logStep('Right-clicking "main" (Automation) and choosing Delete');
            const mainItem = treeItem('main');
            await mainItem.waitFor({ timeout: 10000 });
            await mainItem.click({ button: 'right' });

            const deleteButton = page.page.getByRole('button', { name: 'Delete' }).first();
            await deleteButton.waitFor({ timeout: 5000 });
            await deleteButton.click();

            await expect(mainItem).not.toBeVisible({ timeout: 10000 });
        });

        test('Add an artifact from the tree via the Entry Points "Add" button', async () => {
            const entryPoints = treeItem('Entry Points');
            const sideBar = page.page.locator('#workbench\\.parts\\.sidebar');
            const addBtn = sideBar.getByRole('button', { name: 'Add Entry Point' }).first();

            // The preceding test deletes "main" from the tree, which can leave
            // the sidebar mid-reflow: a hover/click landing during that reflow
            // is silently swallowed (no error — the row just doesn't react),
            // so the "Artifacts" panel never opens. Retry hover+click a few
            // times instead of trusting the first one to land.
            let artifactWebView;
            let lastError: unknown;
            for (let attempt = 1; attempt <= 3 && !artifactWebView; attempt++) {
                logStep(`Hovering "Entry Points" and clicking "Add Entry Point" (attempt ${attempt})`);
                try {
                    await entryPoints.scrollIntoViewIfNeeded();
                    await entryPoints.hover({ force: true });
                    await addBtn.waitFor({ timeout: 10000 });
                    await addBtn.click({ force: true });

                    const webView = await getWebview(BI_INTEGRATOR_LABEL, page);
                    await expect(webView.getByRole('heading', { name: 'Artifacts', exact: true })).toBeVisible({ timeout: 15000 });
                    artifactWebView = webView;
                } catch (err) {
                    lastError = err;
                }
            }
            if (!artifactWebView) {
                throw lastError instanceof Error ? lastError : new Error('The "Artifacts" panel never opened after clicking "Add Entry Point"');
            }

            logStep('Selecting "Automation" and creating it');
            const automationCard = artifactWebView.locator('[data-testid="automation"], #automation').first();
            await automationCard.waitFor({ timeout: 10000 });
            await automationCard.click({ force: true });
            await artifactWebView.getByRole('button', { name: 'Create' }).click({ force: true });

            await expect(treeItem('main')).toBeVisible({ timeout: 30000 });
        });
    });
}
