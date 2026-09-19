/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import fs from 'fs';
import path from 'path';
import { addArtifact, BI_INTEGRATOR_LABEL, getWebview, initTest, logStep, newProjectPath, page } from '../utils/helpers';
import { TypeEditorUtils } from './TypeEditorUtils';

export default function createTests() {
    test.describe.serial('Type Editor Service Class Init Tests', {
    }, async () => {
        initTest();

        test('Configure the init method of a Service Class', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Configuring a Service Class init method in test attempt: ', testAttempt);

            const serviceClassName = `InitService${testAttempt}`;

            logStep('Open the Type Editor');
            await addArtifact('Type', 'type');
            await page.page.waitForLoadState('networkidle');

            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);
            const typeUtils = new TypeEditorUtils(page.page, artifactWebView);
            await typeUtils.waitForTypeEditor();

            logStep(`Create the ${serviceClassName} service class`);
            await typeUtils.openCreateFromScratchTab();
            const form = await typeUtils.createType(serviceClassName, 'Service Class');
            await typeUtils.saveAndWait(form);
            await typeUtils.verifyTypeNodeExists(serviceClassName);

            logStep('Open the service class designer');
            await typeUtils.openServiceClassForEditing(serviceClassName);

            // The generated `init` is rendered as a FunctionCard in its own
            // Constructor section (kind badge uppercased), not as the old
            // read-only "Constructor: init" link.
            logStep('Verify the Constructor section renders the init function card');
            await expect(artifactWebView.getByText('Constructor', { exact: true })).toBeVisible({ timeout: 30000 });
            await expect(artifactWebView.getByText('INIT', { exact: true })).toBeVisible();
            await expect(artifactWebView.getByTestId('edit-method-button-init')).toBeVisible();

            logStep('Open the init function form');
            await typeUtils.openInitFunctionForm();

            // The card's edit action opens ServiceFunctionForm, whose
            // getFunctionFromSource model carries the init guards: the name is
            // fixed and the return type field is not rendered at all.
            const functionName = artifactWebView.getByRole('textbox', { name: /Function Name/ }).first();
            await expect(functionName).toHaveValue('init');
            await expect(functionName).toHaveAttribute('readonly', '');
            await expect(artifactWebView.getByRole('textbox', { name: /Return Type/ })).toHaveCount(0);

            logStep('Add a parameter to init');
            await typeUtils.addFunctionParameter('greeting', 'string');

            logStep('Save the init configuration');
            const saveButton = artifactWebView.getByRole('button', { name: 'Save', exact: true });
            await saveButton.waitFor({ state: 'visible', timeout: 15000 });
            await saveButton.click({ force: true });

            // Saving returns to the service class designer, Constructor card intact.
            await expect(artifactWebView.getByTestId('edit-method-button-init')).toBeVisible({ timeout: 60000 });

            logStep('Verify the parameter reached types.bal');
            const typesBal = path.join(newProjectPath, 'types.bal');
            await expect.poll(
                () => (fs.existsSync(typesBal) ? fs.readFileSync(typesBal, 'utf-8') : ''),
                { timeout: 60000, message: 'init parameter was not written to types.bal' }
            ).toMatch(/function init\s*\(\s*string greeting/);
        });
    });
}
