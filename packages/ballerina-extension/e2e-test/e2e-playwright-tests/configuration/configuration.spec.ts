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
import { addArtifact, BI_INTEGRATOR_LABEL, enableICP, initTest, page } from '../utils/helpers';
import { Form } from '@wso2/playwright-vscode-tester';
import { ConfigEditor } from '../utils/pages';

export default function createTests() {
    test.describe.serial('Configuration Tests', {
    }, async () => {
        initTest();
        test('Create Configuration', async () => {
            await addArtifact('Configuration', 'configurable');
            const configEditor = new ConfigEditor(page.page, BI_INTEGRATOR_LABEL);
            await configEditor.init();
            const configurationWebView = configEditor.getWebView();

            // Verify initial configuration view selects integration package
            const selectedPackage = await configEditor.getSelectedPackage();
            expect(selectedPackage).toBe('Integration');

            // Verify Configurable Variables view
            await configEditor.verifyPageLoaded();

            // Fill the form fields
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, configurationWebView);
            await form.switchToFormView(false, configurationWebView);
            await form.fill({
                values: {
                    'Variable Name*Name of the variable': {
                        type: 'input',
                        value: 'time',
                    },
                    'Variable Type': {
                        type: 'textarea',
                        value: 'int',
                        additionalProps: { clickLabel: true }
                    },
                    'defaultValue': {
                        type: 'cmEditor',
                        value: '100',
                        additionalProps: { clickLabel: true }
                    },
                    'documentation': {
                        type: 'cmEditor',
                        value: 'This is the description of the time config variable',
                        additionalProps: { clickLabel: true }
                    }
                }
            });

            await configurationWebView.getByRole('button', { name: 'Save' }).click();
            await configEditor.verifyConfigurableVariable('time', '100', '');
        });

        test('Edit Configuration', async () => {
            const configEditor = new ConfigEditor(page.page, BI_INTEGRATOR_LABEL);
            await configEditor.init();
            const configurationWebView = configEditor.getWebView();

            // Edit the existing configurable variable created in previous test
            await configEditor.editConfigurableVariable('time');
            const editForm = new Form(page.page, BI_INTEGRATOR_LABEL, configurationWebView);
            await editForm.switchToFormView(false, configurationWebView);
            await editForm.fill({
                values: {
                    'defaultValue': {
                        type: 'cmEditor',
                        value: '200',
                        additionalProps: { clickLabel: true }
                    }
                }
            });

            await configurationWebView.getByRole('button', { name: 'Save' }).click();
            await configEditor.verifyConfigurableVariable('time', '200', '');
        });

        test('Add Config TOML Value', async () => {
            const configEditor = new ConfigEditor(page.page, BI_INTEGRATOR_LABEL);
            await configEditor.init();

            // Add a config toml value to the existing configurable variable through inline editor
            await configEditor.addConfigTomlValue('time', '500');
            await page.page.waitForTimeout(1000); // Wait for the config toml value to be set.
            await configEditor.verifyConfigurableVariable('time', '200', '500');
        });

        test('Create Configuration Without Default Value and Verify Warning', async () => {
            const configEditor = new ConfigEditor(page.page, BI_INTEGRATOR_LABEL);
            await configEditor.init();
            const configurationWebView = configEditor.getWebView();

            // Create a new configurable variable with no default value and verify warning
            await configEditor.addNewConfigurableVariable();
            const addForm = new Form(page.page, BI_INTEGRATOR_LABEL, configurationWebView);
            await addForm.switchToFormView(false, configurationWebView);
            await addForm.fill({
                values: {
                    'Variable Name*Name of the variable': {
                        type: 'input',
                        value: 'place',
                    },
                    'Variable Type': {
                        type: 'textarea',
                        value: 'string',
                        additionalProps: { clickLabel: true }
                    }
                }
            });
            await configurationWebView.getByRole('button', { name: 'Save' }).click();
            await configEditor.verifyConfigurableVariable('place', '', '');
            await configEditor.verifyWarning('place');
        });

        test('Verify Multiple Warnings for Missing Configurations', async () => {
            const configEditor = new ConfigEditor(page.page, BI_INTEGRATOR_LABEL);
            await configEditor.init();
            const configurationWebView = configEditor.getWebView();

            // Verify existing 'place' variable from previous test still has warning
            await configEditor.verifyConfigurableVariable('place', '', '');
            await configEditor.verifyWarning('place');

            // Create second configurable variable with no default value
            await configEditor.addNewConfigurableVariable();
            const addForm2 = new Form(page.page, BI_INTEGRATOR_LABEL, configurationWebView);
            await addForm2.switchToFormView(false, configurationWebView);
            await addForm2.fill({
                values: {
                    'Variable Name*Name of the variable': {
                        type: 'input',
                        value: 'destination',
                    },
                    'Variable Type': {
                        type: 'textarea',
                        value: 'string',
                        additionalProps: { clickLabel: true }
                    }
                }
            });
            await configurationWebView.getByRole('button', { name: 'Save' }).click();
            await configEditor.verifyConfigurableVariable('destination', '', '');
            await configEditor.verifyWarning('destination');

            // Verify 2 warnings in the integration package
            await configEditor.verifyNumberofWarningIntegration(2);
        });

        test('Update Config TOML Value and Remove Warning', async () => {
            const configEditor = new ConfigEditor(page.page, BI_INTEGRATOR_LABEL);
            await configEditor.init();

            // Verify existing 'place' variable still has warning
            await configEditor.verifyConfigurableVariable('place', '', '');
            await configEditor.verifyWarning('place');

            // Add value to existing config variable and check if warning is removed
            await configEditor.addConfigTomlValue('place', 'new-string-value');
            await page.page.waitForTimeout(1000); // Wait for the form to be loaded.
            await configEditor.verifyConfigurableVariable('place', '', 'new-string-value');
            await configEditor.verifyNoWarning('place');
        });

        test('Delete Configuration', async () => {
            const configEditor = new ConfigEditor(page.page, BI_INTEGRATOR_LABEL);
            await configEditor.init();

            // Delete the existing configurable variable 'place'
            await configEditor.deleteConfigVariable('place');
        });

        test('Run Integration with Missing Configurations', async () => {
            const configEditor = new ConfigEditor(page.page, BI_INTEGRATOR_LABEL);
            await configEditor.init();

            // Verify existing 'destination' variable still has warning
            await configEditor.verifyConfigurableVariable('destination', '', '');
            await configEditor.verifyWarning('destination');

            // Click run integration button and check for missing configurations popup
            await page.page.locator('a[role="button"][aria-label="Run Integration"]').click();
            await page.page.getByText('Missing required configurations in Config.toml file', { exact: true }).waitFor();
            await page.page.getByRole('button', { name: 'Update Configurables' }).click();
        });

        test('Update Config TOML Value for Missing Configuration', async () => {
            const configEditor = new ConfigEditor(page.page, BI_INTEGRATOR_LABEL);
            await configEditor.init();

            // Add config value for existing missing configurable variable
            await configEditor.addConfigTomlValue('destination', 'new-destination-value');
            await page.page.waitForTimeout(1000); // Wait for the form to be loaded.
            await configEditor.verifyConfigurableVariable('destination', '', 'new-destination-value');
        });

        test('Run Integration Successfully', async () => {
            const configEditor = new ConfigEditor(page.page, BI_INTEGRATOR_LABEL);
            await configEditor.init();
            // Click run integration button
            await page.page.locator('a[role="button"][aria-label="Run Integration"]').click();

            // Verify vs code terminal is opened
            const terminalPanel = page.page.locator('div.composite.panel#terminal');
            await terminalPanel.waitFor({ state: 'visible', timeout: 60000 });
        });
    });
}
