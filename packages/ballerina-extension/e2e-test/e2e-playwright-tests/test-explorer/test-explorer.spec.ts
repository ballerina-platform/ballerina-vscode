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
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, getWebview, initTest, page } from '../utils/helpers';
import { Form, switchToIFrame } from '@wso2/playwright-vscode-tester';

export default function createTests() {
    test.describe.serial('Test Function Tests', {
    }, async () => {
        initTest();

        test('Create Test Function with Name and Return Type', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Creating test function in test attempt: ', testAttempt);

            // 1. Wait for the BI webview to be ready so StateMachine has the project path set
            console.log('Waiting for BI webview to initialize...');
            await getWebview(BI_INTEGRATOR_LABEL, page);

            // 2. Execute command to add test function
            console.log('Executing command to add test function...');
            await page.executePaletteCommand('BI.test.add.function');

            // 3. Get the webview after command execution
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 30000);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            // 4. Verify the "Create New Test Case" form is displayed
            const createForm = artifactWebView.getByRole('heading', { name: /Create New Test Case/i });
            await createForm.waitFor({ timeout: 20000 });

            // 5. Verify the form subtitle shows "Create a new test for your integration"
            const subtitle = artifactWebView.getByText(/Create a new test for your integration/i);
            await subtitle.waitFor();

            // 6. Fill the Test Function name field
            const functionName = `testFunction${testAttempt}`;
            console.log(`Filling test function name: ${functionName}`);

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);

            await form.fill({
                values: {
                    'Name*Name of the test function': {
                        type: 'input',
                        value: functionName,
                    }
                }
            });

            // 6. Click on "Advanced Configurations" to expand the section (if not already expanded)
            const advancedConfigExpand = artifactWebView.getByText('Expand').first();
            if (await advancedConfigExpand.isVisible({ timeout: 2000 }).catch(() => false)) {
                await advancedConfigExpand.click();
                await page.page.waitForTimeout(500);
            }

            // 8. Click on the "Save" button
            const saveButton = artifactWebView.getByRole('button', { name: 'Save' }).first();
            await saveButton.waitFor();
            await saveButton.click();

            // 9. Verify the Automation is created and the automation designer view is displayed
            const diagramCanvas = artifactWebView.locator('#bi-diagram-canvas');
            await diagramCanvas.waitFor({ state: 'visible', timeout: 30000 });

            // 10. Verify the automation name is displayed (default: "main")
            const diagramTitle = artifactWebView.locator('h2', { hasText: 'Test' });
            await diagramTitle.waitFor();
        });
    });
}
