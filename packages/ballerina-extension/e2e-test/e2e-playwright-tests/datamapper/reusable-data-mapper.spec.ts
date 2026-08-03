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
import { TestScenarios, FileUtils } from './DataMapperUtils';
import { FileUtils as FileSystemUtils } from '../utils/helpers/fileSystem';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';
import { ProjectExplorer } from '../utils/pages';

export default function createTests() {
    test.describe.serial('Reusable Data Mapper Tests', {
    }, async () => {
        initTest();
        test('Create', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;

            console.log('Reusable Data Mapper - Create: START TEST ATTEMPT', testAttempt);

            await FileUtils.updateProjectFileSync('basic/types.bal.txt', 'types.bal');
            await FileSystemUtils.openProjectFileInEditor('types.bal');
            await FileUtils.updateProjectFileSync('empty.txt', 'data_mappings.bal');
            await FileSystemUtils.openProjectFileInEditor('data_mappings.bal');

            console.log(' - Create reusable Data Mapper');

            // Refresh the project explorer
            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.refresh(DEFAULT_PROJECT_NAME);

            const webView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!webView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            await page.page.getByRole('treeitem', { name: 'Data Mappers' }).hover();
            await page.page.getByLabel('Add Data Mapper').click();

            await webView.getByRole('textbox', { name: 'Data Mapper Name*Name of the' }).fill('output');

            await webView.getByText('Add Input').click();
            const inputType = webView.getByRole('textbox', { name: 'Type' })
                .or(webView.locator(`vscode-text-area[arialabel="Type"] textarea`));
            await inputType.click();
            await webView.getByText('InRoot').click();
            await expect(inputType).toHaveValue('InRoot');

            await webView.getByRole('textbox', { name: 'Name*Name of the parameter' }).click();
            await webView.getByRole('textbox', { name: 'Name*Name of the parameter' }).fill('input');
            await webView.getByRole('button', { name: 'Add' }).click();
            await webView.getByTestId('input-item').waitFor();

            const outputType = webView.getByRole('textbox', { name: 'Output' })
                .or(webView.locator(`vscode-text-area[arialabel="Output"] textarea`));
            await outputType.click({ force: true });
            await webView.getByText('OutRoot').click({ force: true });
            await expect(outputType).toHaveValue('OutRoot');

            await webView.getByRole('button', { name: 'Create', exact: true }).click();

            console.log(' - Wait for Data Mapper to open');
            await webView.locator('#data-mapper-canvas-container').waitFor();

            await FileUtils.verifyFileContent('basic/reusable/init.bal.txt', 'data_mappings.bal');

            console.log('Reusable Data Mapper - Create: COMPLETE TEST ATTEMPT', testAttempt);
        });

        test('Basic', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;

            console.log('Reusable Data Mapper - Basic: START TEST ATTEMPT', testAttempt);

            await FileUtils.updateProjectFileSync('basic/reusable/init.bal.txt', 'data_mappings.bal');
            await FileUtils.updateProjectFileSync('basic/types.bal.txt', 'types.bal');

            const webView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!webView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            const isDataMapperOpened = await webView.getByRole('heading', { name: 'Data Mapper' }).isVisible();
            if (!isDataMapperOpened) {
                await webView.getByRole('heading', { name: DEFAULT_PROJECT_NAME }).waitFor();
                await page.page.getByRole('treeitem', { name: 'output' }).click();
            }

            await TestScenarios.testBasicMappings(webView, 'data_mappings.bal', 'reusable', isDataMapperOpened);

            console.log('Reusable Data Mapper - Basic: COMPLETE TEST ATTEMPT', testAttempt);
        });

        test('Array Root', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;

            console.log('Reusable Data Mapper - Array Root: START TEST ATTEMPT', testAttempt);

            await FileUtils.updateProjectFileSync('array-root/reusable/init.bal.txt', 'data_mappings.bal');
            await FileUtils.updateProjectFileSync('array-root/types.bal.txt', 'types.bal');

            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.refresh(DEFAULT_PROJECT_NAME);

            const webView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!webView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            const isDataMapperOpened = await webView.getByRole('heading', { name: 'Data Mapper' }).isVisible();
            if (!isDataMapperOpened) {
                await webView.getByRole('heading', { name: DEFAULT_PROJECT_NAME }).waitFor();
                await page.page.getByRole('treeitem', { name: 'output' }).click();
            }

            await TestScenarios.testArrayRootMappings(webView, 'data_mappings.bal', 'reusable', isDataMapperOpened);

            console.log('Reusable Data Mapper - Array Root: COMPLETE TEST ATTEMPT', testAttempt);
        });

        test('Array Inner', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;

            console.log('Reusable Data Mapper - Array Inner: START TEST ATTEMPT', testAttempt);

            await FileUtils.updateProjectFileSync('array-inner/reusable/init.bal.txt', 'data_mappings.bal');
            await FileUtils.updateProjectFileSync('array-inner/types.bal.txt', 'types.bal');

            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.refresh(DEFAULT_PROJECT_NAME);

            const webView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page);
            if (!webView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            const isDataMapperOpened = await webView.getByRole('heading', { name: 'Data Mapper' }).isVisible();
            if (!isDataMapperOpened) {
                await webView.getByRole('heading', { name: DEFAULT_PROJECT_NAME }).waitFor();
                await page.page.getByRole('treeitem', { name: 'output' }).click();
            }

            await TestScenarios.testArrayInnerMappings(webView, 'data_mappings.bal', 'reusable', isDataMapperOpened);

            console.log('Reusable Data Mapper - Array Inner: COMPLETE TEST ATTEMPT', testAttempt);
        });

    });
}
