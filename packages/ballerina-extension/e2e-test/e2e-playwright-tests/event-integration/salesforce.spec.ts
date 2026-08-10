
/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import { confirmSaveChangesAndGoBack, createArtifactAndGetWebview, deleteArtifactFromTree, domClick, getWebview, BI_INTEGRATOR_LABEL, initTest, page } from '../utils/helpers';
import { Form } from '@wso2/playwright-vscode-tester';
import { ProjectExplorer } from '../utils/pages';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';

export default function createTests() {
    test.describe.serial('Salesforce Integration Tests', {
    }, async () => {
        let listenerName: string;
        initTest();
        test('Create Salesforce Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Creating a new service in test attempt: ', testAttempt);

            const artifactWebView = await createArtifactAndGetWebview('Salesforce Integration', 'trigger-salesforce');

            // The trigger form defaults to OAuth2 auth; switch to Username & Password
            // (SOAP API) to match this test's plain username/password credentials.
            await domClick(artifactWebView.getByRole('radio', { name: 'Username & Password (SOAP API)' }));
            await artifactWebView.locator('div[data-testid="ex-editor-username"]').waitFor();

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'username': {
                        type: 'cmEditor',
                        value: `test`,
                    },
                    'password': {
                        type: 'cmEditor',
                        value: `test`,
                    }
                }
            });
            // Dismiss the expression helper panel opened by filling the fields above —
            // it can cover the submit button.
            await page.page.keyboard.press('Escape');
            await form.submit('Create');
            console.log('Form submitted, waiting for service creation to complete.');

            await artifactWebView.locator(`text="onCreate"`).waitFor();
            await artifactWebView.locator(`text="onUpdate"`).waitFor();
            // On the integration overview card the remaining handlers are collapsed
            // behind "Show More Resources"; the dedicated service page shows all of
            // them directly with no such toggle. Expand only if it's present.
            const showMoreResources = artifactWebView.getByText('Show More Resources');
            if (await showMoreResources.isVisible({ timeout: 3000 }).catch(() => false)) {
                await domClick(showMoreResources);
            }
            await artifactWebView.locator(`text="onDelete"`).waitFor();
            await artifactWebView.locator(`text="onRestore"`).waitFor();

            console.log('Service created successfully, proceeding with assertions.');
            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, `Salesforce Event Integration`], 30000);

            listenerName = `salesforceListener`;
            await artifactWebView.locator(`text=${listenerName}`).waitFor();
        });

        test('Editing Salesforce Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Editing a service in test attempt: ', testAttempt);
            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);

            // The Create test can leave the webview either on the integration overview
            // (service shown as a diagram node — click it to reach the dedicated service
            // page) or already on that dedicated page (Configure visible directly).
            const entryNode = artifactWebView.locator('[data-testid="entry-node-service"]');
            if (await entryNode.isVisible({ timeout: 3000 }).catch(() => false)) {
                await domClick(entryNode);
            }
            const configureBtn = artifactWebView.getByRole('button', { name: 'Configure' });
            await configureBtn.waitFor();
            await domClick(configureBtn);

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);

            // Unlike the create form's separate username/password fields, the edit form
            // exposes the whole listener config (including the nested auth record) as a
            // single expression.
            const updatedListenerConfig = `{auth: {username: "updated-username", password: "updated-password"}, isSandBox: false}`;
            await form.fill({
                values: {
                    'listenerConfig': {
                        type: 'cmEditor',
                        value: updatedListenerConfig,
                        additionalProps: { switchMode: 'expression-mode' }
                    }
                }
            });
            await page.page.keyboard.press('Escape');
            await form.submit('Save Changes');
            await confirmSaveChangesAndGoBack(artifactWebView);

            await configureBtn.waitFor();
            await artifactWebView.locator(`text=${listenerName}`).waitFor();
        });

        test('Delete Salesforce Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Deleting Salesforce integration in test attempt: ', testAttempt);

            await getWebview(BI_INTEGRATOR_LABEL, page);
            await deleteArtifactFromTree([DEFAULT_PROJECT_NAME, `Salesforce Event Integration`]);
        });
    });
}
