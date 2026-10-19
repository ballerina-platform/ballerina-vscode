/**
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
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
import type { Frame } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { switchToIFrame } from '@wso2/playwright-vscode-tester';
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, initTest, newProjectPath, page } from '../utils/helpers';
import { logStep } from '../utils/helpers/progress';
import { ProjectExplorer } from '../utils/pages';

// The overview's Workflow section for an integration that imports ballerina/workflow: shown from the import,
// reports that nothing listens at the default runtime URL, and switches to the in-memory runtime
// (wso2/product-integrator#2737).
const ORDER_TEMPLATE = path.join(__dirname, '..', 'data', 'workflow_order_project');
// Port 1 is never served, so the result does not depend on whatever the machine runs on 7233.
const UNSERVED_RUNTIME_URL = '127.0.0.1:1';

async function getWebview(): Promise<Frame> {
    const webview = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 60000);
    if (!webview) {
        throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
    }
    return webview;
}

function configToml(): string {
    const file = path.join(newProjectPath, 'Config.toml');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
}

export default function createTests() {
    test.describe.serial('Workflow Runtime Section Tests', () => {
        initTest(true, true, undefined, undefined, ORDER_TEMPLATE);

        test('Workflow section reports the missing runtime and switches to in-memory', async () => {
            test.setTimeout(240000);

            logStep('Point the runtime at an unserved port, then open the integration overview');
            await page.page.getByRole('treeitem', { name: /^OrderProcessor/ }).first().waitFor({ state: 'visible', timeout: 180000 });
            fs.writeFileSync(path.join(newProjectPath, 'Config.toml'), `[ballerina.workflow]\nurl = "${UNSERVED_RUNTIME_URL}"\n`, 'utf-8');
            // The overview probes on mount, so leave it for a workflow's card and come back to get a fresh probe.
            await new ProjectExplorer(page.page).goToOverview();
            let webview = await getWebview();
            await webview.getByText('orderWorkflow', { exact: true }).first().click({ timeout: 120000 });
            await webview.getByText('Start', { exact: true }).first().waitFor({ state: 'visible', timeout: 60000 });
            await new ProjectExplorer(page.page).goToOverview();
            webview = await getWebview();
            await webview.getByRole('button', { name: /^Workflow Management/ }).click({ timeout: 120000 });
            const section = webview.getByTestId('workflow-section');
            await section.waitFor({ state: 'visible', timeout: 120000 });

            logStep('Nothing listens at the unserved URL, so both options are offered');
            await expect(section.getByText(`No workflow runtime at ${UNSERVED_RUNTIME_URL}.`)).toBeVisible({ timeout: 30000 });
            const actions = section.getByTestId('workflow-runtime-actions');
            await expect(actions.getByRole('button', { name: 'Use in-memory runtime' })).toBeVisible();
            await expect(actions.getByRole('button', { name: 'Configure runtime' })).toBeVisible();
            await expect(section.getByRole('checkbox', { name: /Enable Workflow Management REST API/ })).toBeVisible();
            await section.screenshot({ path: path.join(__dirname, '..', '..', 'test-resources', 'screenshots', 'workflow-section-no-runtime.png') }).catch(() => undefined);

            logStep('Switch to the in-memory runtime');
            await actions.getByRole('button', { name: 'Use in-memory runtime' }).click();
            await expect(section.getByText('Using the in-memory runtime (testing only).')).toBeVisible({ timeout: 30000 });
            await expect(section.getByText(`No workflow runtime at ${UNSERVED_RUNTIME_URL}.`)).toHaveCount(0);
            await expect.poll(configToml, { timeout: 30000 }).toMatch(/\[ballerina\.workflow\]\s*\nmode = "IN_MEMORY"\s*\nurl = /);
            await section.screenshot({ path: path.join(__dirname, '..', '..', 'test-resources', 'screenshots', 'workflow-section-in-memory.png') }).catch(() => undefined);

            logStep('Configure runtime opens the configurable variables view');
            await section.getByRole('button', { name: 'Configure runtime' }).click();
            webview = await getWebview();
            await expect(webview.getByText('Configurable Variables').first()).toBeVisible({ timeout: 60000 });

            logStep('Back on the overview the section is still there and still in-memory');
            await new ProjectExplorer(page.page).goToOverview();
            webview = await getWebview();
            await webview.getByRole('button', { name: /^Workflow Management/ }).click({ timeout: 120000 });
            await expect(webview.getByTestId('workflow-section').getByText('Using the in-memory runtime (testing only).')).toBeVisible({ timeout: 120000 });
        });
    });
}
