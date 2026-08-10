
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
    test.describe.serial('Github Integration Tests', {
    }, async () => {
        let listenerName: string;
        initTest();
        test('Create Github Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Creating a new service in test attempt: ', testAttempt);

            const artifactWebView = await createArtifactAndGetWebview('Github Integration', 'trigger-trigger-github');

            // Event Channel already defaults to "Issues" (github:IssuesService), matching
            // this test's intent, so only the newly-required Webhook Secret needs filling.
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'webhookSecret': {
                        type: 'cmEditor',
                        value: `test-secret`,
                    }
                }
            });
            // Dismiss the expression helper panel opened by filling the field above —
            // it can cover the submit button.
            await page.page.keyboard.press('Escape');
            await form.submit('Create');

            await artifactWebView.locator(`text="onOpened"`).waitFor();

            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, `github:IssuesService`]);

            listenerName = `githubListener`;
            await artifactWebView.locator(`text=${listenerName}`).waitFor();
        });

        test('Editing Github Service', async ({ }, testInfo) => {
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
            await form.fill({
                values: {
                    'listenOn': {
                        type: 'cmEditor',
                        value: `9090`,
                        additionalProps: { switchMode: 'primary-mode' }
                    }
                }
            });
            await page.page.keyboard.press('Escape');
            await form.submit('Save Changes');
            await confirmSaveChangesAndGoBack(artifactWebView);

            await configureBtn.waitFor();

            await artifactWebView.locator(`text=${listenerName}`).waitFor();
            await artifactWebView.locator(`text="onOpened"`).waitFor();
        });

        test('Delete Github Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Deleting Github integration in test attempt: ', testAttempt);

            await getWebview(BI_INTEGRATOR_LABEL, page);
            await deleteArtifactFromTree([DEFAULT_PROJECT_NAME, `github:IssuesService`]);
        });
    });
}
