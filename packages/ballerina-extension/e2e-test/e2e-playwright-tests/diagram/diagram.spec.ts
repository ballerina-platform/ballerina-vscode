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
import * as path from 'path';
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, initTest, page } from '../utils/helpers';
import { switchToIFrame, Form } from '@wso2/playwright-vscode-tester';
import { ProjectExplorer, Diagram, SidePanel } from '../utils/pages';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';
import { waitForBISidebarTreeView } from '../utils/helpers/sidebar';

// Fixture with an Automation already created (per the e2e-writer rule that
// scenarios must not re-create through the UI what another spec already
// covers as its own scenario — automation.spec.ts owns "Create Automation").
const AUTOMATION_PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'automation_project');

export default function createTests() {
    test.describe.serial('Diagram Tests', {
    }, async () => {
        initTest(true, true, undefined, undefined, AUTOMATION_PROJECT_TEMPLATE);
        test('Add variables and if-else logic to diagram', async () => {
            // Open the pre-baked automation via the Entry Points tree item
            // instead of creating one through the UI. Cold start on a fresh
            // fixture: the sidebar tree isn't guaranteed to be the active
            // viewlet yet and the LS needs time to index the project.
            await waitForBISidebarTreeView(page, 60000);
            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.init().catch(() => undefined);
            await page.page
                .locator(ProjectExplorer.treeItemSelector(DEFAULT_PROJECT_NAME))
                .first()
                .waitFor({ timeout: 90000 });
            const mainEntryPoint = await projectExplorer.findItem([DEFAULT_PROJECT_NAME, 'Entry Points', 'main']);
            await mainEntryPoint.click();

            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 30000);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            // Verify the automation designer view is displayed
            const diagramCanvas = artifactWebView.locator('#bi-diagram-canvas');
            await diagramCanvas.waitFor({ state: 'visible', timeout: 30000 });

            // 15. Add first variable with value "foo"
            const diagram = new Diagram(page.page);
            await diagram.init();
            await diagram.clickAddButtonByIndex(1);

            const sidePanel = new SidePanel(artifactWebView, page.page);
            await sidePanel.init();
            await sidePanel.clickNode('Declare Variable');

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'Name*Name of the variable': {
                        type: 'input',
                        value: 'var1',
                    },
                    'Type': {
                        type: 'textarea',
                        value: 'string',
                        additionalProps: { clickLabel: true }
                    },
                    'expression': {
                        type: 'cmEditor',
                        value: '"foo"',
                        additionalProps: { clickLabel: true }
                    }
                }
            });
            await artifactWebView.getByRole('button', { name: 'Save' }).click();
            await page.page.waitForTimeout(1000);

            // 16. Add second variable with value "bar"
            await diagram.clickHoverAddButtonByIndex(1);
            await sidePanel.clickNode('Declare Variable');

            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'Name*Name of the variable': {
                        type: 'input',
                        value: 'var2',
                    },
                    'Type': {
                        type: 'textarea',
                        value: 'string',
                        additionalProps: { clickLabel: true }
                    },
                    'expression': {
                        type: 'cmEditor',
                        value: '"bar"',
                        additionalProps: { clickLabel: true }
                    }
                }
            });
            await artifactWebView.getByRole('button', { name: 'Save' }).click();
            await page.page.waitForTimeout(1000);

            // 17. Add if condition to check if variables are equal
            await diagram.clickHoverAddButtonByIndex(2);
            await sidePanel.clickNode('If');

            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'branch-0': {
                        type: 'cmEditor',
                        value: 'var1 == var2',
                        additionalProps: { clickLabel: true }
                    }
                }
            });

            // Dismiss the expression helper popup triggered by the CodeMirror fill: the first
            // Escape closes the completion tooltip, the second the helper pane itself.
            await page.page.keyboard.press('Escape');
            await page.page.waitForTimeout(300);
            await page.page.keyboard.press('Escape');
            await page.page.waitForTimeout(300);

            // Click the add Else Block
            // The "Add Else Block" is not a button, but a div with text. The helper pane can
            // linger over it on CI, so bypass the pointer-interception check.
            const addElseBlockDiv = artifactWebView.getByText('Add Else Block', { exact: true });
            await addElseBlockDiv.click({ force: true });
            await artifactWebView.getByRole('button', { name: 'Save' }).click();
            await page.page.waitForTimeout(1000);

            // 18. Add log statement in the if block (true case - Equal)
            // Wait for the if node to be fully rendered
            await page.page.waitForTimeout(1500);

            // Try to find and click the add button in the true branch of the if node
            // The if node should have add buttons for both true and false branches
            const diagramContainer = artifactWebView.locator('#bi-diagram-canvas');
            const ifTrueAddButtons = diagramContainer.locator('[data-testid*="if-true"], [data-testid*="if-block-true"], [data-testid*="empty-node-add-button"]').filter({ hasText: /^$/ }).first();

            await diagram.clickAddButtonByIndex(2);
            // Wait for the side panel to be visible before expanding logging section.
            await artifactWebView.getByTestId('side-panel').waitFor({ state: 'visible', timeout: 5000 });
            await sidePanel.expandSection('Logging');

            await sidePanel.clickNode('Log Info');

            await form.switchToFormView(false, artifactWebView);
            // Confirmed locally (not just on CI): Form.fill()'s cmEditor handling
            // silently no-ops if the field's `div[data-testid="ex-editor-msg"]`
            // container isn't mounted yet when it runs — no error, no retry, the
            // field is just left empty, which is why Save then stays disabled
            // forever (there's nothing that will ever change it). This form sits
            // inside an if/else branch, one level deeper than the flat
            // declare-variable steps above (whose identical fill+Save has never
            // flaked here), so it can render slightly later. Wait for the real
            // container Form.fill() itself looks for before calling it.
            await artifactWebView.locator('div[data-testid="ex-editor-msg"]').waitFor({ state: 'visible', timeout: 15000 });
            await form.fill({
                values: {
                    'msg': {
                        type: 'cmEditor',
                        value: '"Equal"',
                        additionalProps: { clickLabel: true }
                    }
                }
            });
            // Belt-and-braces: if the field still ended up empty for some other
            // reason, fail with that fact up front instead of a bare "Save never
            // enabled" timeout.
            const msgFieldContent = await artifactWebView.locator('div[data-testid="ex-editor-msg"] .cm-content')
                .first().textContent().catch(() => null);
            if (!msgFieldContent) {
                throw new Error(`msg field is empty after form.fill() — got "${msgFieldContent}"`);
            }
            await artifactWebView.getByRole('button', { name: 'Save' }).click({ timeout: 30000 });
            await page.page.waitForTimeout(1000);

            // 19. Add log statement in the else block (false case - Not Equal)
            await page.page.waitForTimeout(4000);


            await diagram.clickAddButtonByIndex(2);

            // Wait for the side panel to be visible before expanding logging section.
            await artifactWebView.getByTestId('side-panel').waitFor({ state: 'visible', timeout: 5000 });
            await sidePanel.clickNode('Log Info');

            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'msg': {
                        type: 'cmEditor',
                        value: '"Not Equal"',
                        additionalProps: { clickLabel: true }
                    }
                }
            });
            await artifactWebView.getByRole('button', { name: 'Save' }).click();
            await page.page.waitForTimeout(1000);
        });
    });
}
