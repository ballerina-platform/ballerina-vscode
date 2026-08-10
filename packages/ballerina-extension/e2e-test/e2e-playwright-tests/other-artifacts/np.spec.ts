
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
import { createArtifactAndGetWebview, getWebview, BI_INTEGRATOR_LABEL, initTest, page } from '../utils/helpers';
import { Form } from '@wso2/playwright-vscode-tester';
import { ProjectExplorer } from '../utils/pages';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';

export default function createTests() {
    test.describe.serial('Natural Function Artifact Tests', {
    }, async () => {
        let functionName = '';
        initTest();
        test('Create Natural Function Artifact', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Creating a new natural function in test attempt: ', testAttempt);

            const artifactWebView = await createArtifactAndGetWebview('Natural Function Artifact', 'bi-ai-function');
            functionName = `sample${testAttempt}`;
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'Name*Name of the natural function': {
                        type: 'input',
                        value: functionName,
                    }
                }
            });
            await form.submit('Create');
            await artifactWebView.locator(`text=${functionName}`).waitFor();
            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, `${functionName}`]);
        });

        test('Editing Natural Function Artifact', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Editing a natural function in test attempt: ', testAttempt);
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
            await artifactWebView.locator(`text=${functionName}`).waitFor();
            const contextReturnType = artifactWebView.locator('span:has(i.fw-bi-return)', { hasText: 'string' });
            await contextReturnType.waitFor();
        });
    });
}
