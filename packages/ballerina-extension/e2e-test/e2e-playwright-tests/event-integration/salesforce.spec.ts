
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
    test.describe.serial('Salesforce Integration Tests', {
    }, async () => {
        let listenerName: string;
        initTest();
        test('Create Salesforce Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Creating a new service in test attempt: ', testAttempt);

            const artifactWebView = await createArtifactAndGetWebview('Salesforce Integration', 'trigger-salesforce');
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'auth': {
                        type: 'cmEditor',
                        value: `{ username: "test", password: "test" }`,
                        additionalProps: { clickLabel: true, switchMode: 'expression-mode', window: global.window }
                    }
                }
            });
            await form.submit('Create');
            console.log('Form submitted, waiting for service creation to complete.');

            await artifactWebView.locator(`text="onCreate"`).waitFor();
            await artifactWebView.locator(`text="onUpdate"`).waitFor();
            await artifactWebView.locator(`text="onDelete"`).waitFor();
            await artifactWebView.locator(`text="onRestore"`).waitFor();

            console.log('Service created successfully, proceeding with assertions.');
            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, `Salesforce Event Integration - "/data/ChangeEvents"`]);

            listenerName = `salesforceListener`;
            await artifactWebView.locator(`text=${listenerName}`).waitFor();
        });

        test('Editing Salesforce Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Editing a service in test attempt: ', testAttempt);
            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);

            const editBtn = artifactWebView.locator('vscode-button[title="Edit Service"]');
            await editBtn.waitFor();
            await editBtn.click({ force: true });

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);

            const updatedAuth = `{ username: "updated-username", password: "updated-password" }`;
            await form.fill({
                values: {
                    'auth': {
                        type: 'cmEditor',
                        value: updatedAuth,
                        additionalProps: { clickLabel: true, switchMode: 'expression-mode', window: global.window }
                    }
                }
            });
            await form.submit('Save Changes');
            await confirmSaveChangesAndGoBack(artifactWebView);

            await editBtn.waitFor();
            await artifactWebView.locator(`text=${listenerName}`).waitFor();
        });

        test('Delete Salesforce Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Deleting Salesforce integration in test attempt: ', testAttempt);

            await getWebview(BI_INTEGRATOR_LABEL, page);
            await deleteArtifactFromTree([DEFAULT_PROJECT_NAME, `Salesforce Event Integration - "/data/ChangeEvents"`]);
        });
    });
}
