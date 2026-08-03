
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
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';

export default function createTests() {
    test.describe.serial('Directory Integration Tests', {
    }, async () => {
        let listenerName: string;
        initTest();
        test('Create Directory Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Creating a new service in test attempt: ', testAttempt);

            const artifactWebView = await createArtifactAndGetWebview('Directory Integration', 'trigger-file');
            listenerName = `fileListener`;
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'path': {
                        type: 'cmEditor',
                        value: '/tmp/wso2/bi/sample',
                        additionalProps: { clickLabel: true, switchMode: 'primary-mode', window: global.window }
                    }
                }
            });
            await form.submit('Create');

            await artifactWebView.locator(`text=${listenerName}`).waitFor();
        });

        test('Editing Directory Service', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Editing a service in test attempt: ', testAttempt);
            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);

            const editBtn = artifactWebView.locator('vscode-button[title="Edit Service"]');
            await editBtn.waitFor();
            await editBtn.click({ force: true });

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);

            const updatedPath = 'updated-path';
            await form.fill({
                values: {
                    'path': {
                        type: 'cmEditor',
                        value: updatedPath,
                        additionalProps: { clickLabel: true, switchMode: 'primary-mode', window: global.window }
                    }
                }
            });
            await form.submit('Save Changes');
            await confirmSaveChangesAndGoBack(artifactWebView);

            await editBtn.waitFor();
            await artifactWebView.locator(`text=${updatedPath}`).waitFor({ state: 'visible' });
        });

        test('Delete Directory Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Deleting Directory integration in test attempt: ', testAttempt);

            await getWebview(BI_INTEGRATOR_LABEL, page);
            await deleteArtifactFromTree([DEFAULT_PROJECT_NAME, `Local Files`]);
        });
    });
}
