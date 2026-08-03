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
import { addArtifact, BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, initTest, page } from '../utils/helpers';
import { switchToIFrame } from '@wso2/playwright-vscode-tester';
import { Diagram, SidePanel } from '../utils/pages';

export default function createTests() {
    test.describe.serial('Expression Editor Tests', {
    }, async () => {
        initTest();
        test('Retrieving suggestions', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Retrieving suggestions: ', testAttempt);

            // Create an automation
            await addArtifact('Automation', 'automation');

            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }
            await artifactWebView.getByRole('button', { name: 'Create' }).click();

            // Add a node to the diagram
            const diagram = new Diagram(page.page);
            await diagram.init();
            await diagram.clickAddButtonByIndex(1);

            // Click on the node in the side panel
            const sidePanel = new SidePanel(artifactWebView, page.page);
            await sidePanel.init();
            await sidePanel.clickNode('Declare Variable');
        });
    });
}