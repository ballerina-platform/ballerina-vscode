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
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, DEFAULT_PROJECT_NAME, getWebview, initTest, newProjectPath, page } from '../utils/helpers';
import { Form, switchToIFrame } from '@wso2/playwright-vscode-tester';
import { waitForBISidebarTreeView } from '../utils/helpers/sidebar';
import { ProjectExplorer } from '../utils/pages';
import { dataFolder } from '../utils/helpers/setup';

export default function createTests() {
    test.describe.serial('Project Creation Tests', {
    }, async () => {
        initTest(false);
        test('Create Project', async () => {
            const workbenchPage = page.page;
            // Activity bar entry is an <a class="action-label" aria-label="...">, not a tab role.
            console.log('Clicking on the WSO2 Integrator activity tab');
            const wso2IntegratorActivity = workbenchPage.locator(
                `#workbench\\.parts\\.activitybar a.action-label[aria-label="${BI_INTEGRATOR_LABEL}"]`
            ).first();
            await wso2IntegratorActivity.waitFor({ state: 'visible', timeout: 120000 });
            await wso2IntegratorActivity.click();


            // Click on Getting Started
            // Click on the "Get Started" button in the Integrator side bar
            console.log('Clicking on the "Get Started" button in the Integrator side bar');
            const getStartedButton = workbenchPage.getByRole('button', { name: 'Get Started' }).first();
            await getStartedButton.waitFor({ timeout: 10000 });
            await getStartedButton.click();

            // Wait for Welcome webview to load (identified by iframe with BI_INTEGRATOR_LABEL)
            console.log('Waiting for Welcome webview to load');
            const welcomeWebView = await switchToIFrame('Welcome', workbenchPage);
            if (!welcomeWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }
            await welcomeWebView.waitForLoadState();

            console.log('Clicking Create on Create New Integration card');
            await welcomeWebView.getByRole('heading', { name: 'Create New Integration' }).waitFor({ timeout: 60000 });
            await welcomeWebView.locator('h3').filter({ hasText: 'Create New Integration' }).locator('..').getByRole('button', { name: 'Create' }).click();

            const biWebview = await getWebview("Welcome", page);
            const form = new Form(workbenchPage, "Welcome", biWebview);
            await form.switchToFormView(false, biWebview);

            console.log('Filling integration create form');

            const integrationName = "testIntegration";
            await form.fill({
                values: {
                    'Integration Name*': {
                        type: 'input',
                        value: integrationName,
                    }
                },
            });

            // Fill the project Path
            const projectPathInput = biWebview.locator('input#project-folder-selector-input');
            await projectPathInput.fill(dataFolder);

            await form.submit('Create Integration');

            console.log('Waiting for project and BI webview');
            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);
            console.log('Waiting for integration name to be visible');
            await artifactWebView.locator(`text=${integrationName}`).waitFor({ timeout: 40000 });

            console.log('Clicking on the integration name');
            // Click on the integration name ("testIntegration") directly from the BI webview project tree, not the project explorer
            const integrationNodeInWebview = artifactWebView.locator(`text=${integrationName}`);
            // await expect(integrationNodeInWebview).toBeVisible();
            await integrationNodeInWebview.click({ force: true });
        });
    });
}
