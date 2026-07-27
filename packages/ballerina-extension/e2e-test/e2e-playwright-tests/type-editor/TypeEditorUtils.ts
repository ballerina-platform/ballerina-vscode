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

import { Frame, Locator, Page } from '@playwright/test';
import { Form, switchToIFrame } from '@wso2/playwright-vscode-tester';
import { BI_INTEGRATOR_LABEL } from '../utils/helpers';

/**
 * Utility class for type editor test operations
 */
export class TypeEditorUtils {
    constructor(private page: Page, private webView: Frame) { }

    /**
     * Wait for element to be visible and interactable
     */
    async waitForElement(locator: Locator, timeout: number = 60000): Promise<void> {
        await locator.waitFor({ state: 'visible', timeout });
    }

    /**
     * Fill an identifier field (double-click and type)
     */
    async fillIdentifierField(index: number = 0, value: string): Promise<void> {
        const field = this.webView.locator('[data-testid="identifier-field"]').nth(index);
        await this.waitForElement(field);
        await field.dblclick();
        await field.type(value);
    }

    /**
     * Fill a type field (double-click and type)
     */
    async fillTypeField(index: number = 0, value: string, title?: string): Promise<void> {
        const field = this.webView.locator('[data-testid="type-field"]').nth(index);
        await this.waitForElement(field);
        await field.dblclick();
        await field.type(value);
        let iframe;
        try {
            // This is due to an implementation issue with the type dropdown in the type editor
            iframe = await switchToIFrame(BI_INTEGRATOR_LABEL, this.page);
            if (!iframe) {
                throw new Error(`${BI_INTEGRATOR_LABEL} iframe not found`);
            }
            const dropdownOptions = iframe.locator('.unq-modal-overlay').getByText(value, { exact: true });
            const optionCount = await dropdownOptions.count();

            if (optionCount === 1) {
                await dropdownOptions.first().click();
            } else if (optionCount > 1) {
                // In case of dropdown appear
                await dropdownOptions.nth(1).click();
            } else {
                throw new Error(`No dropdown option found for value: ${value}`);
            }
        } catch (error) {
            console.error('Error switching to iframe:', error);
            throw error;
        }
        if (title) {
            await iframe.getByText(title).click();
        }
    }

    /**
     * Add a new enum member with the given name
     */
    async addEnumMember(memberName: string): Promise<void> {
        const addButton = this.webView.locator('[data-testid="add-member-button"]');
        await addButton.click();

        // Get the last identifier field (newly added)
        const memberFields = this.webView.locator('[data-testid="identifier-field"]');
        const count = await memberFields.count();
        await this.fillIdentifierField(count - 1, memberName);
    }

    /**
     * Delete an enum member by index
     */
    async deleteEnumMember(index: number): Promise<void> {
        const deleteButton = this.webView.locator(`[data-testid="delete-member-${index}"]`);
        await this.waitForElement(deleteButton);
        await deleteButton.click();
    }

    /**
     * Add a new record field with name and type
     */
    async addRecordField(fieldName: string, fieldType: string): Promise<void> {
        const addButton = this.webView.locator('[data-testid="add-field-button"]');
        await this.waitForElement(addButton);
        await addButton.click();

        // Fill the newly added field (last in the form)
        const identifierFields = this.webView.locator('[data-testid="identifier-field"]');

        const fieldCount = await identifierFields.count();
        const lastIndex = fieldCount - 1;

        await this.fillIdentifierField(lastIndex, fieldName);
        await this.fillTypeField(lastIndex, fieldType, 'Fields');
    }

    /**
     * Add a function to service class
     */
    async addFunction(functionName: string, returnType: string, sectionName?: string): Promise<void> {
        console.log(`Adding function: ${functionName} with return type: ${returnType}`);
        const addButton = this.webView.locator('[data-testid="function-add-button"]');
        await this.waitForElement(addButton);
        await addButton.click();
        console.log('Clicked Add Function button');

        // Fill the newly added function (last in the form)
        const identifierFields = this.webView.locator('[data-testid="identifier-field"]');

        const fieldCount = await identifierFields.count();
        const lastIndex = fieldCount - 1;

        await this.fillIdentifierField(lastIndex, functionName);
        console.log(`Filled function name: ${functionName}`);
        await this.fillTypeField(lastIndex, returnType, sectionName);
        console.log(`Filled return type: ${returnType}`);
    }

    /**
     * Create a type using the form with name and kind
     */
    async createType(name: string, kind: 'Enum' | 'Union' | 'Record' | 'Service Class'): Promise<Form> {
        const form = new Form(this.page, BI_INTEGRATOR_LABEL, this.webView);
        await form.switchToFormView(false, this.webView);

        await form.fill({
            values: {
                'Name': {
                    type: 'input',
                    value: name,
                },
                'Kind': {
                    type: 'dropdown',
                    value: kind,
                }
            }
        });

        return form;
    }

    /**
     * Save form and wait for completion
     */
    async saveAndWait(form: Form): Promise<void> {
        await form.submit('Save');
        await this.page.waitForTimeout(2000);
        await this.page.waitForLoadState('domcontentloaded');
    }

    /**
     * Wait until the diagram has returned to its base state (Add Type button
     * back in the toolbar). A prior action (e.g. an import completing) can
     * render the new type node before the toolbar chrome remounts — waiting
     * only for the node leaks that gap into whichever test runs next, where
     * it shows up as an unexplained clickAddType() timeout instead of at the
     * point it actually happens.
     */
    async waitForDiagramReady(timeout: number = 120000): Promise<void> {
        await this.waitForElement(this.webView.getByRole('button', { name: 'Add Type' }), timeout);
    }

    /**
     * Click Add Type button
     */
    async clickAddType(): Promise<void> {
        const addTypeButton = this.webView.getByRole('button', { name: 'Add Type' });
        try {
            // The type diagram's first load is slow while the language server warms up
            await this.waitForElement(addTypeButton, 120000);
        } catch (error) {
            // This has timed out intermittently on CI with zero other activity in
            // the trace — capture what's actually blocking it (a lingering modal,
            // a stuck import panel, etc.) instead of failing with just a bare
            // "element not found", so the next occurrence is diagnosable.
            const overlayVisible = await this.webView.locator('[data-testid="side-panel"], .unq-modal-overlay')
                .first().isVisible().catch(() => false);
            const visibleButtons = await this.webView.getByRole('button').allTextContents().catch(() => []);
            throw new Error(
                `clickAddType(): "Add Type" button never appeared. ` +
                `overlayVisible=${overlayVisible} visibleButtons=${JSON.stringify(visibleButtons)} ` +
                `original error: ${(error as Error).message}`
            );
        }
        await addTypeButton.click();
    }

    /**
     * Verify that a type node exists in the diagram
     */
    async verifyTypeNodeExists(typeName: string): Promise<void> {
        const typeElement = this.webView.locator(`[data-testid="type-node-${typeName}"]`);
        await this.waitForElement(typeElement);
    }

    /**
     * Snapshot the set of type node ids currently in the diagram. Use before an
     * action whose resulting node name isn't known upfront (e.g. import, where
     * the name is derived from the imported content), then diff against
     * waitForNewTypeNode() afterwards — a bare `.first()` on
     * `[data-testid^="type-node-"]` can match a pre-existing node left over
     * from an earlier test instead of the one the action just created,
     * especially under diagram virtualization.
     */
    async snapshotTypeNodeIds(): Promise<Set<string>> {
        const ids = await this.webView.locator('[data-testid^="type-node-"]').evaluateAll(
            (elements) => elements.map((element) => element.getAttribute('data-testid'))
        );
        return new Set(ids.filter((id): id is string => !!id));
    }

    /**
     * Wait for a type node not present in existingIds to appear, and return its
     * name (the node's data-testid with the "type-node-" prefix stripped).
     */
    async waitForNewTypeNode(existingIds: Set<string>, timeout: number = 30000): Promise<string> {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const currentIds = await this.snapshotTypeNodeIds();
            const newId = [...currentIds].find((id) => !existingIds.has(id));
            if (newId) {
                return newId.replace('type-node-', '');
            }
            await this.page.waitForTimeout(500);
        }
        throw new Error('New type node did not appear on the diagram within the timeout');
    }

    /**
     * Verify that a link exists between two types
     */
    async verifyTypeLink(fromType: string, field: string, toType: string): Promise<void> {
        const linkTestId = `node-link-${fromType}/${field}-${toType}`;
        const linkElement = this.webView.locator(`[data-testid="${linkTestId}"]`);
        await this.waitForElement(linkElement);
    }

    /**
     * Edit an existing type by clicking its menu
     */
    async editType(typeName: string): Promise<void> {
        const menuButton = this.webView.locator(`[data-testid="type-node-${typeName}-menu"]`);
        await this.waitForElement(menuButton);

        // The menu can briefly re-render after open on slow runners (e.g. a
        // diagram re-layout), detaching the "Edit" item mid-click. `force`
        // alone doesn't help — it skips the stability wait but still targets
        // the same doomed DOM handle if it detaches before the click
        // dispatches — so re-open the menu from scratch on each attempt.
        const editMenuItem = this.webView.getByText('Edit', { exact: true });
        let lastError: unknown;
        let opened = false;
        for (let attempt = 1; attempt <= 3 && !opened; attempt++) {
            try {
                await menuButton.click();
                await editMenuItem.click({ force: true, timeout: 10000 });
                opened = true;
            } catch (err) {
                lastError = err;
            }
        }
        if (!opened) {
            throw lastError instanceof Error ? lastError : new Error(`Could not click "Edit" for type "${typeName}"`);
        }

        // Wait for type editor to load
        const typeEditorContent = this.webView.locator('[data-testid="type-editor-container"]');
        await this.waitForElement(typeEditorContent);
    }

    /**
     * Wait for type editor to be ready
     */
    async waitForTypeEditor(): Promise<void> {
        await this.page.waitForTimeout(2000);
        await this.page.waitForLoadState('domcontentloaded');

        const typeEditorContent = this.webView.locator('[data-testid="type-editor-container"]');
        await this.waitForElement(typeEditorContent);
    }

    /**
     * Create an enum type with multiple members
     */
    async createEnumType(enumName: string, members: string[]): Promise<Form> {
        const form = await this.createType(enumName, 'Enum');

        // Fill the first member (already exists)
        if (members.length > 0) {
            await this.fillIdentifierField(0, members[0]);
        }

        // Add additional members
        for (let i = 1; i < members.length; i++) {
            await this.addEnumMember(members[i]);
        }

        return form;
    }

    /**
     * Create a union type with specified types
     */
    async createUnionType(unionName: string, types: string[]): Promise<Form> {
        const form = await this.createType(unionName, 'Union');

        // Fill union types
        for (let i = 0; i < types.length; i++) {
            await this.fillTypeField(i, types[i], 'Members');
        }

        return form;
    }

    /**
     * Create a record type with specified fields
     */
    async createRecordType(recordName: string, fields: Array<{ name: string, type: string }>): Promise<Form> {
        const form = await this.createType(recordName, 'Record');

        // Add fields
        for (const field of fields) {
            await this.addRecordField(field.name, field.type);
        }
        return form;
    }

    /**
     * Create a service class with functions
     */
    async createServiceClass(className: string, functions: Array<{ name: string, returnType: string }>): Promise<Form> {
        const form = await this.createType(className, 'Service Class');

        // Add functions
        for (const func of functions) {
            await this.addFunction(func.name, func.returnType, 'Resource Methods');
        }

        return form;
    }

    /**
     * Open an already-created service class for editing. Unlike editType()
     * (which targets the record editor and waits for `type-editor-container`),
     * a service class's Edit view renders the dedicated Method/Variable
     * buttons and has no `type-editor-container`, so this only opens the node
     * menu (via its icon) and clicks Edit, leaving the method/variable helpers
     * to wait on their own buttons.
     */
    async openServiceClassForEditing(name: string): Promise<void> {
        const menu = this.webView.getByTestId(`type-node-${name}-menu`);
        await this.waitForElement(menu, 10000);

        // The dropdown can close and re-render (e.g. a diagram re-layout)
        // between opening it and clicking "Edit", detaching the menu item
        // mid-click. A single click's built-in actionability retries keep
        // re-resolving that same doomed element, so instead re-open the menu
        // from scratch on each attempt.
        let lastError: unknown;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await menu.getByRole('img').click();
                await this.webView.getByText('Edit', { exact: true }).click({ timeout: 10000 });
                return;
            } catch (err) {
                lastError = err;
            }
        }
        throw lastError instanceof Error ? lastError : new Error(`Could not click "Edit" for service class "${name}"`);
    }

    /**
     * Add a method (Resource or Remote) to a service class already open for
     * editing (via openServiceClassForEditing()) — the edit view exposes a
     * dedicated "Method" button with a Resource/Remote picker, distinct from
     * addFunction()'s generic identifier/type fields used at creation time.
     */
    async addMethod(name: string, returnType: string, kind: 'Resource' | 'Remote'): Promise<void> {
        const methodButton = await this.waitForButton(' Method');
        await methodButton.click();

        await this.webView.getByText(kind).click();

        const inputFieldName = kind === 'Remote'
            ? 'Function Name*The name of the'
            : 'Resource Path*The resource';

        const nameField = await this.waitForTextbox(inputFieldName);
        await nameField.fill(name);

        const returnBox = await this.waitForTextbox('Return Type');
        await returnBox.click();
        await this.webView.getByText(returnType, { exact: true }).click();
        await this.handleTypeCompletion(returnBox);

        const saveButton = await this.waitForButton('Save');
        await saveButton.click();
    }

    /**
     * Add a variable to a service class already open for editing.
     */
    async addVariable(name: string, type: string): Promise<void> {
        const variableButton = await this.waitForButton(' Variable');
        await variableButton.click();

        const nameField = await this.waitForTextbox('Variable Name*The name of the variable');
        await nameField.fill(name);

        const typeField = await this.waitForTextbox('Variable Type');
        await typeField.click();
        await typeField.fill(type);
        await this.page.waitForTimeout(1000);
        await this.webView.getByText(type, { exact: true }).click();
        await this.handleTypeCompletion(typeField);

        const saveButton = await this.waitForButton('Save');
        await saveButton.click();
    }

    /**
     * Rename an existing method on a service class open for editing.
     */
    async editMethod(methodName: string, newName: string): Promise<void> {
        const editButton = this.webView.getByTestId(`edit-method-button-${methodName}`).locator('i');
        await editButton.click();

        const resourcePathField = await this.waitForTextbox('Resource Path*The resource');
        await resourcePathField.fill(newName);

        const saveButton = await this.waitForButton('Save');
        await saveButton.click();
        await this.page.waitForTimeout(3000);
    }

    /**
     * Delete an existing variable on a service class open for editing.
     */
    async deleteVariable(variableName: string): Promise<void> {
        const deleteButton = this.webView.getByTestId(`delete-variable-button-${variableName}`).locator('i');
        await deleteButton.click({ force: true });

        const okayButton = await this.waitForButton('Okay');
        await okayButton.click({ force: true });
    }

    /**
     * Wait for a button by accessible name — shared by the service-class
     * method/variable editing helpers above.
     */
    private async waitForButton(name: string, timeout: number = 10000) {
        const button = this.webView.getByRole('button', { name });
        await button.waitFor({ state: 'visible', timeout });
        return button;
    }

    /**
     * Wait for a textbox by accessible name. vscode-text-area web components
     * expose their label via a custom `arialabel` attribute rather than a
     * standard `aria-label`; the fillable element is the <textarea> inside
     * the shadow DOM, which Playwright pierces automatically via a
     * descendant CSS selector.
     */
    private async waitForTextbox(name: string, timeout: number = 10000) {
        const textbox = this.webView.getByRole('textbox', { name })
            .or(this.webView.locator(`vscode-text-area[arialabel="${name}"] textarea`));
        await textbox.waitFor({ state: 'visible', timeout });
        return textbox;
    }

    /**
     * Dismiss the type-completion suggestion popup if it appeared after
     * typing into a return-type/variable-type field, so the typed value
     * isn't immediately overwritten by an accepted suggestion.
     */
    private async handleTypeCompletion(inputElement: Locator): Promise<void> {
        await this.page.waitForTimeout(3000);
        const completion = this.webView.getByTestId('add-type-completion');
        if (await completion.isVisible()) {
            await inputElement.press('Escape');
        }
    }

    /**
     * Toggle field options by clicking the chevron icon
     * @param fieldIndex Index of the field to toggle (default is 0 for the first field)
     */
    async toggleFieldOptionsByChevron(fieldIndex: number = 0): Promise<void> {
        // Find all field rows

        const chevronIcons = this.webView.locator('[data-testid="field-expand-btn"]');
        const chevronIcon = chevronIcons.nth(fieldIndex);

        try {
            await chevronIcon.waitFor({ state: 'visible', timeout: 3000 });

            // Scroll and force click
            await chevronIcon.scrollIntoViewIfNeeded();
            await chevronIcon.click({ force: true });
            console.log('Clicked chevron for field', fieldIndex);


            await this.page.waitForTimeout(300);
        } catch (error) {
            throw new Error(`Could not click chevron icon at field index ${fieldIndex}: ${error}`);
        }
    }


    /**
     * Toggle any dropdown/collapsible section by text
     */
    async toggleDropdown(dropdownText: string, waitTime: number = 500): Promise<void> {
        const dropdownToggle = this.webView.locator(`text=${dropdownText}`);
        await this.waitForElement(dropdownToggle);
        await dropdownToggle.click();

        // Wait for animation to complete
        await this.page.waitForTimeout(waitTime);
    }

    /**
     * Set any checkbox by its aria-label or name
     */
    async setCheckbox(checkboxName: string, checked: boolean): Promise<void> {
        const checkbox = this.webView.getByRole('checkbox', { name: checkboxName });
        console.log(`Setting checkbox "${checkboxName}" to ${checked}`);
        await this.waitForElement(checkbox);

        const ariaChecked = await checkbox.getAttribute('aria-checked');
        const isCurrentlyChecked = ariaChecked === 'true';

        if (isCurrentlyChecked !== checked) {
            await checkbox.click();
        }
    }

    /**
     * Set the Format dropdown on the Import tab (JSON or XML)
     */
    async setImportFormat(format: 'JSON' | 'XML'): Promise<void> {
        const dropdown = this.webView.locator('vscode-dropdown#format-selector');
        await this.waitForElement(dropdown);
        await dropdown.click();
        const option = this.webView.locator(`vscode-option[value="${format}"]`);
        await option.waitFor();
        await option.click();
        await this.page.waitForTimeout(500);
    }

    /**
     * Fill the Name field on the Import tab (JSON format only)
     */
    async setImportTypeName(name: string): Promise<void> {
        // vscode-text-field with label="Name" renders an accessible textbox
        const input = this.webView.getByRole('textbox', { name: 'Name' });
        await input.waitFor({ timeout: 10000 });
        await input.fill(name);
    }

    /**
     * Paste content into the Import textarea (JSON or XML)
     */
    async fillImportTextArea(content: string): Promise<void> {
        const textarea = this.webView.locator('vscode-text-area textarea').first();
        await this.waitForElement(textarea);
        await textarea.click();
        await textarea.fill(content);
    }

    async switchToImportTab(): Promise<void> {
        const importBtn = this.webView.getByRole('button', { name: 'Import' });
        await this.waitForElement(importBtn);
        await importBtn.click();
        await this.page.waitForTimeout(2000);
        await this.page.waitForLoadState('domcontentloaded');
    }

    /**
     * Click the Import button and wait for the diagram to reload
     */
    async clickImportButton(): Promise<void> {
        const importBtn = this.webView.getByTestId('import-tab').getByRole('button', { name: 'Import' });
        await this.waitForElement(importBtn);
        await importBtn.click();
        await this.page.waitForTimeout(2000);
        await this.page.waitForLoadState('domcontentloaded');
        // Confirm the diagram's toolbar chrome is back before this test ends —
        // otherwise a slow remount here surfaces as a bare clickAddType()
        // timeout in whichever test runs next, far from where the delay
        // actually occurred.
        await this.waitForDiagramReady();
    }
}
