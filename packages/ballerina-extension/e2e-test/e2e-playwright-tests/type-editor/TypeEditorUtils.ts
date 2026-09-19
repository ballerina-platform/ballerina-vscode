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

import { expect, Frame, Locator, Page } from '@playwright/test';
import { Form, switchToIFrame } from '@wso2/playwright-vscode-tester';
import { BI_INTEGRATOR_LABEL, domClick } from '../utils/helpers';

/** How many times replaceLastFieldValue() re-enters a value that did not settle. */
const REPLACE_VALUE_ATTEMPTS = 4;

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
        // `force` — the floating Copilot orb/invite box has been observed to
        // overlap and intercept pointer events on this button.
        await form.submit('Save', true);
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
        // `force` — the floating Copilot orb/invite box has been observed to
        // overlap and intercept pointer events on this button.
        await addTypeButton.click({ force: true });
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
     * Open a type node's three-dot menu and click one of its items.
     *
     * The popover can close on its own while the diagram re-renders (the LS
     * pushes an updated model right after a save), which detaches the item
     * mid-click. Playwright then keeps retrying against a menu that no longer
     * exists and burns the whole click timeout without ever recovering —
     * "element was detached from the DOM, retrying" until it fails. Re-opening
     * the menu is the only thing that can recover, so drive the open+click as
     * one retryable unit and stop as soon as `isOpen` confirms the target view
     * actually came up.
     *
     * Targets the menu item by its `#menu-item-<id>` id (set by ui-toolkit's
     * MenuItem) rather than by visible text, so it can't match stray "Edit"
     * text rendered elsewhere in the webview.
     */
    private async openTypeNodeMenuItem(
        typeName: string,
        menuItemId: string,
        isOpen: () => Promise<boolean>,
        attempts: number = 5
    ): Promise<void> {
        const menuButton = this.webView.locator(`[data-testid="type-node-${typeName}-menu"]`);
        const menuItem = this.webView.locator(`#menu-item-${menuItemId}`);

        for (let attempt = 0; attempt < attempts; attempt++) {
            await this.waitForElement(menuButton, 15000);
            // The clickable target is the MoreVert icon inside the MenuButton;
            // fall back to the button host if the icon doesn't expose a role.
            const menuIcon = menuButton.getByRole('img');
            const target = await menuIcon.count() > 0 ? menuIcon.first() : menuButton;
            await target.click({ force: true });

            const clicked = await menuItem.waitFor({ state: 'visible', timeout: 5000 })
                .then(() => menuItem.click({ force: true, timeout: 5000 }))
                .then(() => true)
                .catch(() => false);

            if (clicked && await isOpen()) {
                return;
            }
            await this.page.waitForTimeout(1000);
        }
        throw new Error(
            `"${menuItemId}" did not open from the ${typeName} node menu after ${attempts} attempts`
        );
    }

    /**
     * Edit an existing type by clicking its menu
     */
    async editType(typeName: string): Promise<void> {
        const typeEditorContent = this.webView.locator('[data-testid="type-editor-container"]');
        await this.openTypeNodeMenuItem(typeName, 'edit', () =>
            typeEditorContent.waitFor({ state: 'visible', timeout: 30000 })
                .then(() => true).catch(() => false));
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
        // The edit view's own "Method" button is the post-condition here — the
        // service class editor has no `type-editor-container` to wait on.
        const methodButton = this.webView.getByRole('button', { name: ' Method' });
        await this.openTypeNodeMenuItem(name, 'edit', () =>
            methodButton.waitFor({ state: 'visible', timeout: 30000 })
                .then(() => true).catch(() => false));
    }

    /**
     * Select the "Create from scratch" tab in the New Type panel. The panel has
     * been observed to come up on the Import tab, where the Kind dropdown
     * createType() fills does not exist. Clicking the tab resets the form, so
     * call this before filling anything.
     */
    async openCreateFromScratchTab(): Promise<void> {
        // The tab button carries no testid; `create-from-scratch-tab` is the id
        // of the content it reveals, which is what confirms the switch landed.
        const tabButton = this.webView.getByRole('button', { name: /Create from scratch/ }).first();
        await this.waitForElement(tabButton, 30000);
        await tabButton.click({ force: true });
        await this.waitForElement(this.webView.locator('[data-testid="create-from-scratch-tab"]'), 30000);
    }

    /**
     * Open the Service Function form for a service class's `init` method from
     * the designer's Constructor section. `init` is configured there rather
     * than through the inline OperationForm, so this waits on the form's own
     * (non-editable) name field as the post-condition.
     */
    async openInitFunctionForm(): Promise<void> {
        const editInit = this.webView.getByTestId('edit-method-button-init');
        await this.waitForElement(editInit, 30000);
        await editInit.locator('i').click({ force: true });
        await this.waitForElement(this.webView.getByRole('textbox', { name: /Function Name/ }).first(), 30000);
    }

    /**
     * Add a parameter through the Service Function form's param manager.
     */
    async addFunctionParameter(name: string, type: string): Promise<void> {
        // ParamManager's add affordance is a LinkButton, not a <button>.
        const addParam = this.webView.locator('div:has(i.codicon-add) >> text=Add Parameter').first();
        await this.waitForElement(addParam, 30000);
        await addParam.click({ force: true });

        // FormExpressionEditor exposes its label through `arialabel` on the
        // vscode-text-area host; the editable node is its shadow-DOM textarea.
        const typeField = this.webView.locator('vscode-text-area[arialabel="Parameter Type"] textarea').first();
        await this.waitForElement(typeField, 30000);
        await typeField.click({ force: true });
        await typeField.fill(type);
        await this.handleTypeCompletion(typeField);

        const nameField = this.webView.getByRole('textbox', { name: /Parameter Name/ }).first();
        await nameField.fill(name);

        // Add stays disabled until the typed values validate; a force click
        // before then silently no-ops and leaves the param editor open.
        const addButton = this.webView.getByRole('button', { name: 'Add', exact: true });
        await this.waitForElement(addButton, 15000);
        await expect(addButton).toBeEnabled({ timeout: 30000 });
        await addButton.click({ force: true });

        // ParamItem takes the saved parameter's name as its testid prefix.
        await this.waitForElement(this.webView.getByTestId(`${name}-item`), 30000);
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
     * Open the Add Type panel's "Create from scratch" tab. The panel keeps
     * whichever tab was last used, so a test that runs after an import test
     * cannot assume it. The tab buttons render outside the viewport at the
     * test window size, which makes Playwright refuse even a force-click, so
     * dispatch a real DOM click.
     */
    async openCreateFromScratchTab(): Promise<Locator> {
        const content = this.webView.locator('[data-testid="create-from-scratch-tab"]');
        if (!(await content.isVisible().catch(() => false))) {
            await domClick(this.webView.getByRole('button', { name: 'Create from scratch' }));
        }
        await this.waitForElement(content, 30000);
        return content;
    }

    /**
     * Set the type name on the Create-from-scratch tab.
     */
    async setTypeName(name: string): Promise<void> {
        const input = this.webView.getByRole('textbox', { name: 'Name' }).first();
        await this.waitForElement(input, 30000);
        await input.fill(name);
    }

    /**
     * Add an empty record field row, leaving its default name and type.
     *
     * `add-field-button` is a div wrapping a `vscode-button`; the click handler
     * sits on the inner button, so a DOM click on the div is a no-op. A
     * force-click works, but the button can be reported outside the viewport
     * while the panel is still laying out — retry until a row appears.
     */
    async addEmptyRecordField(): Promise<void> {
        const addButton = this.webView.locator('[data-testid="add-field-button"]');
        const rows = this.webView.locator('[data-testid="type-field"]');
        const before = await rows.count();
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
            if (await rows.count() > before) {
                return;
            }
            await addButton.scrollIntoViewIfNeeded().catch(() => { });
            await addButton.click({ force: true, timeout: 5000 }).catch(() => { });
            await this.page.waitForTimeout(1000);
        }
        throw new Error('add-field-button never added a field row');
    }

    /**
     * Replace the contents of the last field row's name or type box. Unlike
     * fillIdentifierField()/fillTypeField() this clears the existing value
     * instead of appending, and never accepts a type-helper suggestion — the
     * point is to leave a value the user typed, valid or not.
     *
     * Deliberately a single fill() rather than keystrokes. The box is a
     * `vscode-text-field` whose value is React-controlled, and on a loaded
     * runner a re-render lands between the first two keystrokes and drops what
     * was typed so far, leaving the value short of its leading characters —
     * `NoSuchTypeHere` arrived as `oSuchTypeHere` on the Linux CI agent, and
     * the same happens locally under 8x CPU throttling. Retyping does not help
     * because the re-render is triggered by focusing the field, so every
     * attempt loses the same characters. fill() sets the value in one input
     * event, which that re-render cannot cut in half.
     */
    private async replaceLastFieldValue(testId: 'identifier-field' | 'type-field', value: string): Promise<void> {
        const field = this.webView.locator(`[data-testid="${testId}"]`).last();
        await this.waitForElement(field);
        // `vscode-text-field` keeps the real <input> in its shadow root, which
        // Playwright's CSS engine pierces. fill() and inputValue() both need
        // that inner input — neither accepts the custom element wrapper.
        const input = field.locator('input');
        await this.waitForElement(input);

        let settled = '';
        for (let attempt = 1; attempt <= REPLACE_VALUE_ATTEMPTS; attempt++) {
            await field.dblclick();
            await input.fill(value);
            if (testId === 'type-field') {
                // The type helper panel opens on focus and covers the form.
                await this.page.keyboard.press('Escape');
            }
            // A re-render can still clobber the whole value; that one is
            // recoverable, because by the next attempt the field has settled.
            settled = await this.waitForFieldValue(input, value);
            if (settled === value) {
                return;
            }
            console.log(`  ⚠️  ${testId} settled as ${JSON.stringify(settled)}, re-entering ` +
                `${JSON.stringify(value)} (attempt ${attempt} of ${REPLACE_VALUE_ATTEMPTS})`);
        }
        throw new Error(
            `expected the ${testId} to hold ${JSON.stringify(value)}, got ${JSON.stringify(settled)}`
        );
    }

    /**
     * Poll the input until it holds `expected`, and return whatever it holds
     * when the wait ends. A re-render can still overwrite the box after it was
     * filled, so the value is only treated as final once it has survived a
     * further beat.
     */
    private async waitForFieldValue(input: Locator, expected: string, timeout: number = 10000): Promise<string> {
        const deadline = Date.now() + timeout;
        let current = await input.inputValue().catch(() => '');
        while (Date.now() < deadline) {
            if (current === expected) {
                await this.page.waitForTimeout(500);
                current = await input.inputValue().catch(() => '');
                if (current === expected) {
                    return current;
                }
                continue;
            }
            await this.page.waitForTimeout(250);
            current = await input.inputValue().catch(() => '');
        }
        return current;
    }

    async setLastFieldName(name: string): Promise<void> {
        await this.replaceLastFieldValue('identifier-field', name);
    }

    async setLastFieldType(type: string): Promise<void> {
        await this.replaceLastFieldValue('type-field', type);
    }

    /**
     * Diagnostics render through TextField's `errorMsg` -> `ErrorBanner` in the
     * ui-toolkit, which carries no data-testid (and lives in `submodules/`, out
     * of scope to change). The warning codicon is its only stable marker.
     */
    private fieldDiagnostics(panel: Locator): Locator {
        return panel.locator('div:has(> i.codicon-warning)');
    }

    private async diagnosticTexts(panel: Locator): Promise<string[]> {
        const texts = await this.fieldDiagnostics(panel).allInnerTexts().catch(() => []);
        return texts.map((text) => text.trim()).filter(Boolean);
    }

    /**
     * Wait for the given diagnostic message to be shown in the panel.
     *
     * Validation is debounced 250ms and then round-trips to the language
     * server, and the banner can briefly show the message for an intermediate
     * keystroke, so wait for the settled text rather than the first message
     * that appears.
     */
    async verifyFieldDiagnostic(panel: Locator, message: string, timeout: number = 60000): Promise<void> {
        const deadline = Date.now() + timeout;
        let texts: string[] = [];
        while (Date.now() < deadline) {
            texts = await this.diagnosticTexts(panel);
            if (texts.includes(message)) {
                return;
            }
            await this.page.waitForTimeout(500);
        }
        throw new Error(
            `expected diagnostic ${JSON.stringify(message)} in the type editor, got ${JSON.stringify(texts)}`
        );
    }

    /**
     * Wait until no diagnostic is shown in the panel.
     */
    async verifyNoFieldDiagnostic(panel: Locator, timeout: number = 60000): Promise<void> {
        const deadline = Date.now() + timeout;
        let texts: string[] = [];
        while (Date.now() < deadline) {
            texts = await this.diagnosticTexts(panel);
            if (texts.length === 0) {
                return;
            }
            await this.page.waitForTimeout(500);
        }
        throw new Error(`expected no diagnostic in the type editor, got ${JSON.stringify(texts)}`);
    }

    /**
     * Close the type editor side panel, discarding whatever is in the form.
     */
    async closePanel(): Promise<void> {
        await this.webView.locator('[data-testid="close-panel-btn"]').click({ force: true });
        await this.waitForDiagramReady();
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
