
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
import { confirmSaveChangesAndGoBack, createArtifactAndGetWebview, deleteArtifactFromTree, getWebview, BI_INTEGRATOR_LABEL, initTest, page } from '../utils/helpers';
import { Form } from '@wso2/playwright-vscode-tester';
import { ProjectExplorer } from '../utils/pages';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';

export default function createTests() {
    test.describe.serial('Azure Integration Tests', {
    }, async () => {
        initTest();
        test('Create Azure Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Creating a new service in test attempt: ', testAttempt);

            const artifactWebView = await createArtifactAndGetWebview('Azure Integration', 'trigger-asb');
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'connectionString': {
                        type: 'cmEditor',
                        value: '"Endpoint=sb://test.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=test"',
                        additionalProps: { clickLabel: true }
                    }
                }
            });
            // Dismiss expression helper popup triggered by CodeMirror focus before filling next field
            await page.page.keyboard.press('Escape');
            await page.page.waitForTimeout(300);
            // entityConfig defaults to Record mode (controlled React component) where view.dispatch
            // is immediately reset to {}. Switch to Expression mode first so the fill sticks.
            const entityConfigContainer = artifactWebView.locator('[data-testid="ex-editor-entityConfig"]');
            if (await entityConfigContainer.count() > 0) {
                const exprModeBtn = entityConfigContainer.locator('[data-testid="expression-mode"]');
                if (await exprModeBtn.count() > 0) {
                    await exprModeBtn.click({ force: true });
                    await page.page.waitForTimeout(300);
                }
            }
            await form.fill({
                values: {
                    'entityConfig': {
                        type: 'cmEditor',
                        value: `{ queueName: "testQueue" }`,
                        additionalProps: { clickLabel: true }
                    }
                }
            });
            await form.submit('Create', true);

            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, `Azure Service Bus Event Integration`]);

            const asbListener = `asbListener`;
            await artifactWebView.locator(`text=${asbListener}`).waitFor();
        });

        test('Editing Azure Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Editing a service in test attempt: ', testAttempt);
            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);

            const editBtn = artifactWebView.locator('vscode-button[title="Edit Service"]');
            await editBtn.waitFor();
            await editBtn.click({ force: true });

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'connectionString': {
                        type: 'cmEditor',
                        value: '"Endpoint=sb://test.updated.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=test"',
                        additionalProps: { clickLabel: true }
                    }
                }
            });
            // Dismiss expression helper popup triggered by CodeMirror focus before filling next field
            await page.page.keyboard.press('Escape');
            await page.page.waitForTimeout(300);
            // entityConfig defaults to Record mode (controlled React component) where view.dispatch
            // is immediately reset to {}. Switch to Expression mode first so the fill sticks.
            const entityConfigContainerEdit = artifactWebView.locator('[data-testid="ex-editor-entityConfig"]');
            if (await entityConfigContainerEdit.count() > 0) {
                const exprModeBtnEdit = entityConfigContainerEdit.locator('[data-testid="expression-mode"]');
                if (await exprModeBtnEdit.count() > 0) {
                    await exprModeBtnEdit.click({ force: true });
                    await page.page.waitForTimeout(300);
                }
            }
            await form.fill({
                values: {
                    'entityConfig': {
                        type: 'cmEditor',
                        value: `{ queueName: "updated-queue-name" }`,
                        additionalProps: { clickLabel: true }
                    }
                }
            });
            await form.submit('Save Changes', true);
            await confirmSaveChangesAndGoBack(artifactWebView);

            await editBtn.waitFor();

            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, `Azure Service Bus Event Integration`]);

            const asbListener = `asbListener`;
            await artifactWebView.locator(`text=${asbListener}`).waitFor({ state: 'visible' });
        });

        test('Delete Azure Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Deleting Azure integration in test attempt: ', testAttempt);

            await getWebview(BI_INTEGRATOR_LABEL, page);
            await deleteArtifactFromTree([DEFAULT_PROJECT_NAME, `Azure Service Bus Event Integration`]);
        });
    });
}
