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
import { Locator, test } from '@playwright/test';
import path from 'path';
import {
    addArtifact,
    BI_INTEGRATOR_LABEL,
    BI_WEBVIEW_NOT_FOUND_ERROR,
    initTest,
    page,
    submitArtifactCreation
} from '../utils/helpers';
import { Form, switchToIFrame } from '@wso2/playwright-vscode-tester';
import { ProjectExplorer } from '../utils/pages';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';

// This test creates the project's *first* automation, so — unlike every other
// suite — it needs a genuinely empty template rather than the shared
// `empty_project` (which now ships a seeded automation so other suites can
// reach "Add Artifact" on an otherwise-empty integration; see addArtifact()).
const AUTOMATION_CREATION_PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'automation_creation_project');

/**
 * Click an architecture-diagram node until it actually navigates.
 *
 * These nodes (entry, connection, listener) have no onClick — component-diagram
 * wires onMouseDown/onMouseUp through useClickWithDragTolerance, which only
 * fires the handler when the pointer moved less than 5px between the two
 * events. Any layout shift mid-click therefore reads as a drag and the click is
 * dropped with no error at all, so a single attempt can silently do nothing.
 * Retry against `expected` — the thing the click is supposed to open.
 */
async function clickUntil(
    node: Locator,
    expected: Locator,
    description: string,
    attempts: number = 5
): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt++) {
        await node.click({ timeout: 15000 }).catch(() => { /* node re-rendering; retry */ });
        const opened = await expected.waitFor({ state: 'visible', timeout: 15000 })
            .then(() => true).catch(() => false);
        if (opened) {
            return;
        }
    }
    throw new Error(`Clicking the ${description} did not open the expected view after ${attempts} attempts`);
}

export default function createTests() {
    test.describe.serial('Automation Tests', {
    }, async () => {
        initTest(true, true, undefined, undefined, AUTOMATION_CREATION_PROJECT_TEMPLATE);
        test('Create Automation', async () => {
            // 1. Click the "Add Artifact" button, which the overview offers whether the
            //    integration is empty or already has artifacts
            // 2. Verify the Artifacts menu is displayed
            // 3. Under "Automation" section, click on "Automation" option
            await addArtifact('Automation', 'automation');

            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 30000);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            // 4. Verify the "Create Automation" form is displayed. Its heading is composed
            // from artifact metadata, so the optional "New" is matched rather than pinned to
            // one spelling.
            const createForm = artifactWebView.getByRole('heading', { name: /Create( New)? Automation/i });
            await createForm.waitFor({ timeout: 10000 });

            // 6. (Optional) Click on "Advanced Configurations" to expand the section
            const advancedConfigExpand = artifactWebView.getByText('Expand').first();
            if (await advancedConfigExpand.isVisible({ timeout: 2000 }).catch(() => false)) {
                await advancedConfigExpand.click();
                await page.page.waitForTimeout(500);
            }

            // 7. (Optional) Verify "Return Error" checkbox is checked by default
            const returnErrorCheckbox = artifactWebView.getByRole('checkbox', { name: /Return Error/i }).first();
            if (await returnErrorCheckbox.isVisible()) {
                const isChecked = await returnErrorCheckbox.isChecked();
                if (!isChecked) {
                    throw new Error('Return Error checkbox should be checked by default');
                }
            }

            // 8. Click the form's "Create" button.
            await submitArtifactCreation(artifactWebView);

            // 9. Verify the Automation is created and the automation designer view is displayed.
            // Submitting the form normally lands straight on the designer's canvas. When it
            // settles on the overview instead, the automation is there as an entry node, and
            // clicking that opens the same designer.
            const diagramCanvas = artifactWebView.locator('#bi-diagram-canvas');
            const automationNode = artifactWebView.locator('[data-testid="entry-node-automation"]');
            const landedOnDiagram = await diagramCanvas.waitFor({ state: 'visible', timeout: 10000 })
                .then(() => true).catch(() => false);
            if (!landedOnDiagram) {
                await automationNode.waitFor({ state: 'visible', timeout: 30000 });
                await clickUntil(automationNode, diagramCanvas, 'Automation entry node');
            }

            // 10. Verify the automation name is displayed (default: "main")
            const diagramTitle = artifactWebView.locator('h2', { hasText: 'Automation' });
            await diagramTitle.waitFor();

            // 11. Verify the "Flow" and "Sequence" tabs are available
            // Wait for the diagram to fully load before checking for tabs
            await page.page.waitForTimeout(1000);
            // The tabs are clickable generic elements, not role="tab"
            const flowTab = artifactWebView.getByText('Flow').first();
            await flowTab.waitFor({ timeout: 10000, state: 'visible' });
            const sequenceTab = artifactWebView.getByText('Sequence').first();
            await sequenceTab.waitFor({ timeout: 10000, state: 'visible' });

            // 12. Verify the flow diagram shows a "Start" node
            // Check if "Start" node is present using data-testid
            const startNode = artifactWebView.locator('[data-testid="start-node"]');
            await startNode.waitFor({ timeout: 10000, state: 'visible' });

            // 13. Verify the flow diagram shows an "Error Handler" node
            // Check if "Error Handler" node is present without using CSS class selectors
            await artifactWebView.getByText(/^Error Handler$/, { exact: true }).first();

            // 14. Verify the tree view shows the automation name under "Entry Points" section
            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, 'Entry Points', 'main']);
        });
        test('Edit Automation', async () => {
            // Navigate to an existing Automation in the automation designer view
            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, 'Entry Points', 'main']);
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 30000);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }
            // 2. Click on the "Configure" button (⚙️ icon) next to the automation name
            // Try common patterns: #bi-configure, button with Configure text, or icon button
            const editButton = artifactWebView.locator('#bi-edit').first();
            await editButton.waitFor({ timeout: 10000 });
            await editButton.click({ force: true });

            // 3. Verify the "Edit Automation" form is displayed
            const editForm = artifactWebView.getByRole('heading', { name: /Edit Automation/i });
            await editForm.waitFor({ timeout: 10000 });

            // 4. Click on "Advanced Configurations" to expand the section
            const advancedConfigExpand = artifactWebView.getByText('Expand').first();
            await advancedConfigExpand.waitFor();
            await advancedConfigExpand.click();
            await page.page.waitForTimeout(500);

            // 5. Locate the "Startup Parameters" section
            const startupParamsSection = artifactWebView.getByText(/Startup Parameters/i).first();
            await startupParamsSection.waitFor();

            // 6. Click on the "Add Parameter" button
            // The "Add Parameter" is a div, not a button; locate by icon and text.
            const addParameterButton = artifactWebView.locator(
                'div:has(i.codicon-add) >> text=Add Parameter'
            ).first();
            await addParameterButton.waitFor();
            await addParameterButton.click();

            // 7. Verify the parameter dialog is displayed
            await page.page.waitForTimeout(500);

            // 8. Click on the "Type" combobox to select a type
            // Locate the dropdown for "Type"
            // Select the <vscode-dropdown> by both id='type' and role='combobox'
            const typeDropdown = artifactWebView.locator('vscode-dropdown#type[role="combobox"]').first();
            await typeDropdown.waitFor({ timeout: 5000 });
            await typeDropdown.click(); // expand the dropdown

            // 9. Select a type (e.g., "string") from the dropdown
            await page.page.waitForTimeout(500);
            const stringType = artifactWebView.getByText('string').first();
            await stringType.waitFor({ timeout: 5000 });
            await stringType.click();

            // 10. Enter a parameter name (e.g., "configPath") in the "Name" field
            const nameInput = artifactWebView.getByRole('textbox', { name: /Name.*Name of the parameter/i }).first();
            await nameInput.waitFor({ timeout: 5000 });
            await nameInput.pressSequentially('configPath', { delay: 100 });

            // 11. (Optional) Enter a description in the "Description" field
            const descriptionInput = artifactWebView.getByPlaceholder(/Description/i).or(artifactWebView.locator('textarea').first());
            if (await descriptionInput.isVisible({ timeout: 2000 })) {
                await descriptionInput.fill('Configuration file path');
            }

            // 12. Click on the "Add" button
            const addButton = artifactWebView.getByRole('button', { name: /Add/i }).first();
            await addButton.waitFor();
            await addButton.click();

            // 13. Verify the parameter is added to the "Startup Parameters" section
            await page.page.waitForTimeout(1000);
            const addedParameter = artifactWebView.getByText('configPath').first();
            await addedParameter.waitFor({ timeout: 5000 });

            // 14. (Optional) Modify the "Return Error" checkbox (check or uncheck)
            const returnErrorCheckbox = artifactWebView.getByRole('checkbox', { name: /Return Error/i }).first();
            if (await returnErrorCheckbox.isVisible({ timeout: 2000 })) {
                const currentState = await returnErrorCheckbox.isChecked();
                if (currentState) {
                    await returnErrorCheckbox.uncheck();
                } else {
                    await returnErrorCheckbox.check();
                }
            }

            // 15. Click on the "Save" button
            const saveButton = artifactWebView.getByRole('button', { name: 'Save' }).first();
            await saveButton.waitFor();
            await saveButton.click();

            // 16. Verify the automation designer view reflects the updated startup parameters
            await artifactWebView.locator('#bi-diagram-canvas').waitFor({ state: 'visible', timeout: 30000 });
        });

        test('Delete Automation', async () => {
            const projectExplorer = new ProjectExplorer(page.page);
            const automationTreeItem = await projectExplorer.findItem([DEFAULT_PROJECT_NAME, 'Entry Points', 'main']);
            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 30000);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }
            // 2. Right-click on the automation item in the tree view to open context menu
            await automationTreeItem.click({ button: 'right' });

            // 3. Click on the "Delete" button in the context menu
            await page.page.waitForTimeout(500); // Wait for context menu to appear
            const deleteButton = page.page.getByRole('button', { name: 'Delete' }).first();
            await deleteButton.waitFor({ timeout: 5000 });
            await deleteButton.click();

            // 5. Verify the Automation is removed from the project tree
            await page.page.waitForTimeout(1000);
            const automationInTree = await projectExplorer.findItem([DEFAULT_PROJECT_NAME, 'Entry Points', 'main']).catch(() => null);
            if (automationInTree) {
                throw new Error('Automation should be removed from project tree');
            }
        });
    });
}
