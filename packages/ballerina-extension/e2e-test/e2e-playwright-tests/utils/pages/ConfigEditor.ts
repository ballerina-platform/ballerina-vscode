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

import { Frame, Locator, Page, expect } from "@playwright/test";
import { switchToIFrame } from "@wso2/playwright-vscode-tester";
import { BI_INTEGRATOR_LABEL } from "../helpers";

export class ConfigEditor {
    private webView!: Frame;
    private container!: Locator;


    constructor(private _page: Page, private type: string = BI_INTEGRATOR_LABEL) {
    }

    public async init() {
        const webview = await switchToIFrame(`${this.type}`, this._page)
        if (!webview) {
            throw new Error("Failed to switch to Config Editor iframe");
        }
        this.webView = webview;
        this.container = webview.locator('div#root');
    }

    public getWebView(): Frame {
        return this.webView;
    }

    public async addNewConfigurableVariable() {
        // Prefer role locator, but fall back to text selector for custom button renderers in CI.
        const addConfigButton = this.webView
            .getByRole('button', { name: 'Add Config' })
            .or(this.webView.locator('button:has-text("Add Config"), vscode-button:has-text("Add Config")'));

        // The Add Config button is only shown for the Integration package.
        if (!(await addConfigButton.first().isVisible().catch(() => false))) {
            await this.selectPackage('Integration');
        }

        await addConfigButton.first().waitFor({ state: 'visible', timeout: 30000 });
        // `force` — the floating Copilot orb/invite box has been observed to
        // overlap and intercept pointer events on buttons in this webview.
        await addConfigButton.first().click({ force: true });
    }

    public async verifyPageLoaded() {
        const configurableVariablesH2 = this.webView.locator('h2', { hasText: 'Configurable Variables' });
        await configurableVariablesH2.waitFor({ state: 'visible', timeout: 30000 });
    }

    public async verifyConfigurableVariable(variableName: string, defaultValue: string, configValue: string) {
        // Verify the Configurable Variable item is visible
        console.log(`Verify config variable ${variableName}`);
        const configVariableItem = this.webView.locator(`div#${variableName}-variable`);
        await configVariableItem.waitFor({ state: 'visible', timeout: 30000 });
        // `force` — the floating Copilot orb/invite box has been observed to
        // overlap and intercept pointer events on buttons in this webview.
        await configVariableItem.click({ force: true });

        // Verify the variable name and default
        const variableExists = await configVariableItem.isVisible();
        expect(variableExists, `Configurable variable "${variableName}" was not verified successfully.`).toBe(true);

        // Verify the default value to be have element with text  (Defaults to: 10)
        if (defaultValue) {
            const defaultValueLocator = configVariableItem.locator(`text=(Defaults to: ${defaultValue})`);
            await defaultValueLocator.waitFor({ state: 'visible', timeout: 30000 });
            const defaultValueExists = await defaultValueLocator.isVisible();
            expect(defaultValueExists, `Default value "${defaultValue}" for variable "${variableName}" was not created successfully.`).toBe(true);
        }

        // Verify the config value
        const configTomlInput = this.webView.locator(`textarea[name="${variableName}-config-value"]`);
        const configTomlValue = await configTomlInput.inputValue();
        expect(configTomlValue, `ConfigToml value for variable "${variableName}"`).toBe(configValue);
    }

    public async editConfigurableVariable(variableName: string) {
        console.log(`Edit config variable ${variableName}`);
        const configVariableItem = this.webView.locator(`div#${variableName}-variable`);
        await configVariableItem.waitFor({ state: 'visible', timeout: 30000 });

        // Hover on config variable item to make the edit button visible
        await configVariableItem.hover();

        // Click on the edit button 
        const editButton = configVariableItem.locator('vscode-button[title="Edit Configurable Variable"]');
        await editButton.waitFor({ state: 'visible', timeout: 30000 });
        // `force` — the floating Copilot orb/invite box has been observed to
        // overlap and intercept pointer events on buttons in this webview.
        await editButton.click({ force: true });
    }

    public async deleteConfigVariable(variableName: string) {
        console.log(`Delete config variable ${variableName}`);
        const configVariableItem = this.webView.locator(`div#${variableName}-variable`);
        await configVariableItem.waitFor({ state: 'visible', timeout: 30000 });

        // Hover on config variable item to make the edit button visible
        await configVariableItem.hover();

        // Click on the delete button 
        const deleteButton = configVariableItem.locator('vscode-button[title="Delete Configurable Variable"]');
        await deleteButton.waitFor({ state: 'visible', timeout: 30000 });
        // `force` — the floating Copilot orb/invite box has been observed to
        // overlap and intercept pointer events on buttons in this webview.
        await deleteButton.click({ force: true });

        // Wait for the variable to be deleted
        await configVariableItem.waitFor({ state: 'detached', timeout: 30000 });

        // Verify deletion
        const variableExists = await configVariableItem.isVisible().catch(() => false);
        expect(variableExists, `Configurable variable "${variableName}" was not deleted successfully.`).toBe(false);
    }

    public async addConfigTomlValue(variableName: string, value: string) {
        console.log(`Add config toml value of variable ${variableName} as "${value}"`);
        // Set config toml value for the variable
        const configTomlInput = this.webView.locator(`textarea[name="${variableName}-config-value"]`);
        await configTomlInput.waitFor({ state: 'visible', timeout: 30000 });
        await configTomlInput.fill(value);

        // Verify the value is set
        const configTomlValue = await configTomlInput.inputValue();
        expect(configTomlValue, `ConfigToml value for variable "${variableName}"`).toBe(value);
    }

    public async verifyWarning(variableName: string) {
        console.log(`Verify warning for config variable ${variableName}`);
        const configVariableItem = this.webView.locator(`div#${variableName}-variable`);
        await configVariableItem.waitFor({ state: 'visible', timeout: 30000 });
        // `force` — the floating Copilot orb/invite box has been observed to
        // overlap and intercept pointer events on buttons in this webview.
        await configVariableItem.click({ force: true });

        // Verify the Required warning text is visible
        const requiredWarningText = configVariableItem.locator('span', { hasText: 'Required' });
        await requiredWarningText.waitFor({ state: 'visible', timeout: 30000 });
        const requiredTextVisible = await requiredWarningText.isVisible();
        expect(requiredTextVisible, `Required warning text for variable "${variableName}" was not verified successfully.`).toBe(true);
    }

    public async verifyNoWarning(variableName: string) {
        console.log(`Verify no warning for config variable ${variableName}`);
        const configVariableItem = this.webView.locator(`div#${variableName}-variable`);
        await configVariableItem.waitFor({ state: 'visible', timeout: 30000 });
        // `force` — the floating Copilot orb/invite box has been observed to
        // overlap and intercept pointer events on buttons in this webview.
        await configVariableItem.click({ force: true });

        // Wait for the Required warning text to be hidden or detached
        const requiredWarningText = configVariableItem.locator('span', { hasText: 'Required' });
        await requiredWarningText.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
        const requiredTextVisible = await requiredWarningText.isVisible().catch(() => false);
        expect(requiredTextVisible, `Required warning text for variable "${variableName}" was verified when it should not be.`).toBe(false);
    }

    public async verifyNumberofWarningIntegration(number: number) {
        console.log(`Verify number of warnings in package integration`);
        // Get the warning count span inside the integration container
        const warningCountSpan = this.webView.locator('span#integration-warning-count');
        await warningCountSpan.waitFor({ state: 'visible', timeout: 10000 });
        const warningCountText = await warningCountSpan.textContent();
        const warningCount = parseInt(warningCountText || '0', 10);
        expect(warningCount, `Expected ${number} warnings, but found ${warningCount}.`).toBe(number);
    }

    public async getSelectedPackage(): Promise<string> {
        const titleDiv = this.webView.locator('div#TitleDiv h2');
        await expect(titleDiv).not.toHaveText('', { timeout: 120000 });
        return (await titleDiv.textContent())?.trim() || '';
    }

    public async selectPackage(packageName: string) {
        console.log(`Selecting package ${packageName}`);
        const packageTreeview = this.webView.locator(`div#package-treeview`);
        await packageTreeview.waitFor({ state: 'visible', timeout: 30000 });
        // Try to click the <p> element with the package name if span is not found
        const packageItem = packageTreeview.locator('p', { hasText: packageName });
        await packageItem.waitFor({ state: 'visible', timeout: 30000 });
        // `force` — the floating Copilot orb/invite box has been observed to
        // overlap and intercept pointer events on buttons in this webview.
        await packageItem.click({ force: true });

        // Verify the package is selected
        const selectedPackage = await this.getSelectedPackage();
        expect(selectedPackage, `Package "${packageName}" was not selected successfully.`).toBe(packageName);
        console.log(`Package ${packageName} selected successfully`);
    }   
}
