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
import { Frame,Page } from '@playwright/test';
import { Form } from '@wso2/playwright-vscode-tester';
import { TypeEditorUtils } from '../type-editor/TypeEditorUtils';
import { BI_INTEGRATOR_LABEL } from '../utils/helpers';

export class GraphQLServiceUtils {
    /**
     * Constructor for GraphQLServiceUtils
     * @param webView - The Playwright frame/locator for the webview
     */
    constructor(private page: Page, private webView: Frame) {}

    async addGraphQLOperation(operationType: string, name: string, fieldType: string) {
        const addBtnTestId = `graphql-add-${operationType}-btn`;
        await this.webView.getByTestId(addBtnTestId).waitFor({ state: 'visible', timeout: 10000 });
        const addBtn = this.webView.getByTestId(addBtnTestId);
        await addBtn.click();

        await this.setSidePanel({
            fieldName: { value: name, label: 'Field Name' },
            fieldType: { value: fieldType, label: 'Field Type' }
        });

        await this.webView.getByTestId(addBtnTestId).waitFor({ state: 'visible', timeout: 20000 });
    }

    async addFunction(outputType: string,argument: { name: string, type: string }) {
        await this.webView.getByTestId(`type-node-${outputType}`).getByText(`${outputType}`).click();
        await this.webView.getByRole('button', { name: '   Implement' }).click();
        await this.webView.getByTestId('add-variable-button').click({ force: true });
        await this.setSidePanel({
            fieldName: { value: argument.name, label: 'Variable Name' },
            fieldType: { value: argument.type, label: 'Variable Type' }
        });
        await this.webView.getByTestId('back-button').click();
    }

    private async setSidePanel(params: { 
        fieldName: { value: string; label: string }; 
        fieldType: { value: string; label: string }; 
    }) {
        const { fieldName, fieldType } = params;

        const fieldNameBox = this.webView.getByRole('textbox', { name: fieldName.label });
        await this.waitForElement(fieldNameBox);
        await fieldNameBox.fill(fieldName.value);

        const fieldTypeBox = this.getTypeEditorByLabel(fieldType.label);
        await this.waitForElement(fieldTypeBox);
        await fieldTypeBox.fill(fieldType.value);
        console.log(`Filled ${fieldType.label} with value: ${fieldType.value}`);

        // Wait a short moment to allow UI to register the value
        await this.page.waitForTimeout(10000);
        const fieldDefaultCompletion = this.webView.getByText(fieldType.value, {exact: true });
        await this.waitForElement(fieldDefaultCompletion);
        console.log(`Field default completion is visible: ${await fieldDefaultCompletion.isVisible()}`);
        // Click on Field Type label to move focus out of the input box
        await this.webView.getByText(fieldType.label, { exact: true }).click();

        // TODO: https://github.com/wso2/product-ballerina-integrator/issues/917
        if (await fieldDefaultCompletion.isVisible()) {
            await fieldTypeBox.press('Escape');
        }

        const saveBtn = this.webView.getByRole('button', { name: 'Save' });
        await this.waitForElement(saveBtn);
        await saveBtn.click();
        await this.page.waitForTimeout(2000);
        await this.page.waitForLoadState('domcontentloaded');  
    }   

    async clickButtonByTestId(testId: string) {
        const button = this.webView.getByTestId(testId);
        await this.waitForElement(button);
        await button.click();
    }

    async addOutputObject(outputType: string) {
        const createFromScratchTab = this.webView.getByTestId('create-from-scratch-tab');
        await this.getTypeEditorByLabel('Field Type').click();
        console.log('Clicked on Field Type textbox');
        await this.webView.getByText('Create New Type').click();

        const form = new Form(this.page, BI_INTEGRATOR_LABEL, this.webView);
        await form.switchToFormView(false, this.webView);
        console.log('Switched to form view for creating new type');
        await form.fill({
            values: {
                'Name': {
                    type: 'input',
                    value: outputType,
                },  
                'Kind': {
                    type: 'dropdown',
                    value: 'Object',
                }
            }
        });
        console.log('Filled form for new output object type');
        const typeEditorUtils = new TypeEditorUtils(this.page, this.webView);
        await typeEditorUtils.addFunction("function1", "string");
        console.log('Added function to the new type');
        await this.webView.getByTestId('type-create-save').getByRole('button', { name: 'Save' }).click();
        console.log('Saved the new output object type');
    }

    async createInputObjectFromScratch(argument: { name: string, type: string }) {
        const form = new Form(this.page, BI_INTEGRATOR_LABEL, this.webView);
        await this.webView.getByText('Add Argument').click();
        await this.getTypeEditorByLabel('Argument Type').click();
        await this.webView.getByText('Create New Type').click();
        await form.fill({
            values: {
                'Name': {
                    type: 'input',
                    value: argument.type,
                },
                'Kind': {
                    type: 'dropdown',
                    value: 'Input Object',
                }
            }
        });

        await this.webView.getByTestId('type-create-save').getByRole('button', { name: 'Save' }).click();
        await this.webView.getByRole('textbox', { name: 'Argument Name*The name of the' }).fill(argument.name);
        await this.webView.getByRole('button', { name: 'Add' }).click();
    }

    async addArgumentToGraphQLService(argument: { name: string, type: string }) {
        await this.webView.getByText('Add Argument').click();
        await this.getTypeEditorByLabel('Argument Type').click();
        await this.webView.getByText(argument.type, { exact: true }).click();
        await this.webView.getByText('Argument Type*').click();
        await this.webView.getByRole('textbox', { name: 'Argument Name*The name of the' }).fill(argument.name);
        await this.webView.getByText('Argument Name*').click();
        await this.webView.getByRole('button', { name: 'Add' }).click();
    }

    getTypeEditorByLabel(label: string) {
        return this.webView.locator(`label:has-text("${label}")`)
            .locator('xpath=ancestor::*[.//vscode-text-area][1]//vscode-text-area')
            .locator('textarea');
    }

    async waitForElement(locator: any, timeout = 10000) {
        await locator.waitFor({ state: 'visible', timeout });
    }

    async closePanel() {
        await this.page.waitForTimeout(2000);
        const closeButton = this.webView.getByTestId('close-panel-btn');
        await this.waitForElement(closeButton);

        await closeButton.click({ force: true });
        await closeButton.waitFor({
            state: 'detached',
            timeout: 10000
        });
    }
}
