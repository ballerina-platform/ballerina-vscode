
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
import { createArtifactAndGetWebview, deleteArtifactFromTree, getWebview, BI_INTEGRATOR_LABEL, initTest, page } from '../utils/helpers';
import { Form } from '@wso2/playwright-vscode-tester';
import { ProjectExplorer } from '../utils/pages';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';

export default function createTests() {
    test.describe.serial('Function Artifact Tests', {
    }, async () => {
        let functionName = '';
        initTest();
        test('Create Function Artifact', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Creating a new function in test attempt: ', testAttempt);

            const artifactWebView = await createArtifactAndGetWebview('Function Artifact', 'bi-function');
            functionName = `sample${testAttempt}`;
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'Name*Name of the function': {
                        type: 'input',
                        value: functionName,
                    }
                }
            });
            await form.submit('Create');
            // Both the diagram node's title and the diagram's own title-bar
            // breadcrumb render the function name, so a plain text= locator
            // (substring match) resolves to 2 elements — .first() is enough
            // since this just confirms the name rendered somewhere.
            await artifactWebView.locator(`text=${functionName}`).first().waitFor();
            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, `${functionName}`]);
        });

        test('Editing Function Artifact', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Editing a function in test attempt: ', testAttempt);
            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);

            const editBtn = artifactWebView.locator('#bi-edit');
            await editBtn.waitFor();
            await editBtn.click({ force: true });

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'Return Type': {
                        type: 'textarea',
                        value: 'string',
                        additionalProps: { clickLabel: true }
                    }
                }
            });
            await form.submit('Save');
            // Both the diagram node's title and the diagram's own title-bar
            // breadcrumb render the function name, so a plain text= locator
            // (substring match) resolves to 2 elements — .first() is enough
            // since this just confirms the name rendered somewhere.
            await artifactWebView.locator(`text=${functionName}`).first().waitFor();
        });

        test('Delete Function Artifact', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Deleting a function in test attempt: ', testAttempt);

            await getWebview(BI_INTEGRATOR_LABEL, page);
            await deleteArtifactFromTree([DEFAULT_PROJECT_NAME, `Functions`, `${functionName}`]);
        });
    });
}
