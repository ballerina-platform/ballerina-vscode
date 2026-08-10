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

import { expect, test } from '@playwright/test';
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, initTest, page } from '../utils/helpers';
import { switchToIFrame } from '@wso2/playwright-vscode-tester';
import { Diagram, ProjectExplorer } from '../utils/pages';
import { TestScenarios, FileUtils } from './DataMapperUtils';
import { FileUtils as FileSystemUtils } from '../utils/helpers/fileSystem';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';

export default function createTests() {
    test.describe.serial('Inline Data Mapper Tests', {
    }, async () => {
        initTest();
        test('Create', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;

            console.log('Inline Data Mapper - Create: START TEST ATTEMPT', testAttempt);

            await FileUtils.updateProjectFileSync('basic/types.bal.txt', 'types.bal');
            await FileSystemUtils.openProjectFileInEditor('types.bal');
            await FileUtils.updateProjectFileSync('create/inline/init.bal.txt', 'automation.bal');
            await FileSystemUtils.openProjectFileInEditor('automation.bal');

            console.log(' - Add Declare Variable Node');

            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.refresh(DEFAULT_PROJECT_NAME);

            const webView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!webView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            await webView.getByRole('heading', { name: DEFAULT_PROJECT_NAME }).waitFor();
            await page.page.getByRole('treeitem', { name: 'main' }).click();

            await webView.getByRole('heading', { name: 'Automation' }).waitFor();

            // Add a node to the diagram
            const diagram = new Diagram(page.page);
            await diagram.init();
            await diagram.clickAddButtonByIndex(1);

            await webView.getByText('Declare Variable').click();

            const varType = webView.getByRole('textbox', { name: 'Type' })
                .or(webView.locator(`vscode-text-area[arialabel="Type"] textarea`));

            await varType.click();
            await webView.getByText('OutRoot').click();
            await expect(varType).toHaveValue('OutRoot');
            // Click escape key to close the dropdown
            await page.page.keyboard.press('Escape');
            await webView.getByRole('button', { name: 'Open in Data Mapper' }).click();

            console.log(' - Wait for Data Mapper to open');
            await webView.locator('#data-mapper-canvas-container').waitFor();

            await FileUtils.verifyFileContent('create/inline/final.bal.txt', 'automation.bal');

            console.log(' - Go back to overview (using back button)');
            await webView.getByTestId('back-button').click();
            await webView.getByRole('heading', { name: 'Automation' }).waitFor();
            await webView.getByTestId('back-button').click();
            await webView.getByRole('heading', { name: DEFAULT_PROJECT_NAME }).waitFor();

            console.log('Inline Data Mapper - Create: COMPLETE TEST ATTEMPT', testAttempt);
        });

        test('Basic', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;

            console.log('Inline Data Mapper - Basic: START TEST ATTEMPT', testAttempt);

            await FileUtils.updateProjectFileSync('basic/inline/init.bal.txt', 'automation.bal');
            await FileUtils.updateProjectFileSync('basic/types.bal.txt', 'types.bal');

            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.refresh(DEFAULT_PROJECT_NAME);

            const webView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!webView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            const isDataMapperOpened = await webView.getByRole('heading', { name: 'Data Mapper' }).isVisible();
            if (!isDataMapperOpened) {
                await webView.getByRole('heading', { name: DEFAULT_PROJECT_NAME }).waitFor();
                await page.page.getByRole('treeitem', { name: 'main' }).click();

                await webView.getByRole('heading', { name: 'Automation' }).waitFor();
                await webView.getByText('output = {}').click();
                // Click escape key to close the dropdown
                await page.page.keyboard.press('Escape');
                await page.page.keyboard.press('Escape');
                await webView.getByRole('button', { name: 'Open in Data Mapper' }).click();
            }

            await TestScenarios.testBasicMappings(webView, 'automation.bal', 'inline', isDataMapperOpened);

            console.log('Inline Data Mapper - Basic: COMPLETE TEST ATTEMPT', testAttempt);
        });

        test('Array Root', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;

            console.log('Inline Data Mapper - Array Root: START TEST ATTEMPT', testAttempt);

            await FileUtils.updateProjectFileSync('array-root/inline/init.bal.txt', 'automation.bal');
            await FileUtils.updateProjectFileSync('array-root/types.bal.txt', 'types.bal');

            const webView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!webView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            const isDataMapperOpened = await webView.getByRole('heading', { name: 'Data Mapper' }).isVisible();
            if (!isDataMapperOpened) {
                await webView.getByRole('heading', { name: DEFAULT_PROJECT_NAME }).waitFor();
                await page.page.getByRole('treeitem', { name: 'main' }).click();

                await webView.getByRole('heading', { name: 'Automation' }).waitFor();
                await webView.getByText('output = []').click();
                // Click escape key to close the dropdown
                await page.page.keyboard.press('Escape');
                await webView.getByRole('button', { name: 'Open in Data Mapper' }).click();
            }

            await TestScenarios.testArrayRootMappings(webView, 'automation.bal', 'inline', isDataMapperOpened);

            console.log('Inline Data Mapper - Array Root: COMPLETE TEST ATTEMPT', testAttempt);
        });

        test('Array Inner', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;

            console.log('Inline Data Mapper - Array Inner: START TEST ATTEMPT', testAttempt);

            await FileUtils.updateProjectFileSync('array-inner/inline/init.bal.txt', 'automation.bal');
            await FileUtils.updateProjectFileSync('array-inner/types.bal.txt', 'types.bal');

            const webView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!webView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            const isDataMapperOpened = await webView.getByRole('heading', { name: 'Data Mapper' }).isVisible();
            if (!isDataMapperOpened) {
                await webView.getByRole('heading', { name: DEFAULT_PROJECT_NAME }).waitFor();
                await page.page.getByRole('treeitem', { name: 'main' }).click();

                await webView.getByRole('heading', { name: 'Automation' }).waitFor();
                await webView.getByText('output = {}').click();
                // Click escape key to close the dropdown
                await page.page.keyboard.press('Escape');
                await webView.getByRole('button', { name: 'Open in Data Mapper' }).click();
            }

            await TestScenarios.testArrayInnerMappings(webView, 'automation.bal', 'inline', isDataMapperOpened);

            console.log('Inline Data Mapper - Array Inner: COMPLETE TEST ATTEMPT', testAttempt);
        });

    });
}
