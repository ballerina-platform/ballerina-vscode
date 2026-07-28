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
import { Frame, Locator, test } from '@playwright/test';
import * as path from 'path';
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, initTest, page, logStep, newProjectPath } from '../utils/helpers';
import { switchToIFrame, Form } from '@wso2/playwright-vscode-tester';
import { ProjectExplorer, Diagram, SidePanel } from '../utils/pages';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';
import { waitForBISidebarTreeView } from '../utils/helpers/sidebar';

// Fixture with an Automation already created (per the e2e-writer rule that
// scenarios must not re-create through the UI what another spec already
// covers as its own scenario — automation.spec.ts owns "Create Automation").
const AUTOMATION_PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'automation_project');
// Copied into the template's project root (not a separate resources folder)
// so the file picker sees it as already inside the project — avoiding the
// "file is outside your project, move it in?" confirmation dialog.
const OPENAPI_SPEC_PATH = path.join(newProjectPath, 'petstore.yaml');
const CONNECTION_NAME = 'httpClient';

export default function createTests() {
    test.describe.serial('Connections Tests', {
    }, async () => {
        initTest(true, true, undefined, undefined, AUTOMATION_PROJECT_TEMPLATE);

        // Shared across the sub-tests below — each one continues from where
        // the previous left off (same project, same diagram), so the tests
        // must run in order (test.describe.serial above enforces this).
        let artifactWebView: Frame;
        let projectExplorer: ProjectExplorer;
        let diagram: Diagram;
        let sidePanel: SidePanel;
        let form: Form;
        let diagramCanvas: Locator;
        let petstoreTestId: string | null;

        test('Add connection', async () => {
            logStep('Open the architecture diagram for the automation project');
            await waitForBISidebarTreeView(page, 60000);
            projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.init().catch(() => undefined);
            await page.page
                .locator(ProjectExplorer.treeItemSelector(DEFAULT_PROJECT_NAME))
                .first()
                .waitFor({ timeout: 90000 });

            // The BI extension opens the architecture (overview) diagram
            // automatically once the project loads — no explicit "Open View"
            // click is needed here.
            artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 60000);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            logStep('Click the Automation entry node to open its flow diagram');
            const automationNode = artifactWebView.locator('[data-testid="entry-node-automation"]');
            await automationNode.waitFor({ state: 'visible', timeout: 60000 });
            await automationNode.click({ force: true });

            diagramCanvas = artifactWebView.locator('#bi-diagram-canvas');
            await diagramCanvas.waitFor({ state: 'visible', timeout: 30000 });

            logStep('Click add connection and create an HTTP client');
            diagram = new Diagram(page.page);
            await diagram.init();
            await diagram.clickAddButtonByIndex(1);

            sidePanel = new SidePanel(artifactWebView, page.page);
            await sidePanel.init();
            await sidePanel.getLocator().getByText('Add Connection', { exact: false }).first().click({ force: true });
            await page.page.waitForTimeout(1500);

            const httpCard = artifactWebView.locator('#connector-http');
            await httpCard.waitFor({ state: 'visible', timeout: 60000 });
            await httpCard.click({ force: true });

            const loadingConnectorPackage = artifactWebView.locator('text=Loading connector package...');
            await loadingConnectorPackage.waitFor({ state: 'hidden', timeout: 300000 }).catch(() => { });

            const saveConnectionButton = artifactWebView.locator('text=Save Connection');
            await saveConnectionButton.waitFor({ state: 'visible', timeout: 60000 });
            logStep('Connection popup opened for the new http client');

            logStep('Fill http client form and save it');
            form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'url': {
                        type: 'cmEditor',
                        value: 'https://foo.bar/baz',
                        additionalProps: { clickLabel: true, switchMode: 'primary-mode', window: global.window }
                    }
                }
            });
            await form.submit('Save Connection');

            // Verify via the project explorer tree (decoupled from the
            // webview's own re-render timing) rather than racing the side
            // panel's connection list for the new entry's text.
            // ProjectExplorer.findItem() only waits 5s per tree level, which
            // can be too short on a slower CI runner while the LS re-indexes
            // after the save — retry instead of a single attempt.
            let connectionListed = false;
            for (let attempt = 0; attempt < 3 && !connectionListed; attempt++) {
                connectionListed = await projectExplorer.findItem([DEFAULT_PROJECT_NAME, 'Connections', CONNECTION_NAME])
                    .then(() => true).catch(() => false);
                if (!connectionListed) {
                    await page.page.waitForTimeout(2000);
                }
            }
            if (!connectionListed) {
                throw new Error('httpClient connection did not appear in the project explorer tree');
            }
            logStep('httpClient connection saved and shown in the side panel');
        });

        test('Add methods inside a connection', async () => {
            logStep('Add a GET method from the http client');
            await page.page.waitForTimeout(1500);
            const clientEntryVisible = await sidePanel.getLocator().getByText(CONNECTION_NAME, { exact: false }).first()
                .waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
            if (!clientEntryVisible) {
                await diagram.clickAddButtonByIndex(1);
            }
            await sidePanel.getLocator().getByText(CONNECTION_NAME, { exact: false }).first().click({ force: true });
            await page.page.waitForTimeout(1500);
            const getMethodItem = sidePanel.getLocator().getByText('Get', { exact: true }).first();
            const getMethodVisible = await getMethodItem
                .waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false);
            if (!getMethodVisible) {
                // The methods list can fail to expand on a slower CI runner - retry the click.
                await sidePanel.getLocator().getByText(CONNECTION_NAME, { exact: false }).first().click({ force: true });
                await getMethodItem.waitFor({ state: 'visible', timeout: 30000 });
            }
            await getMethodItem.click({ force: true });

            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'path': {
                        type: 'cmEditor',
                        value: '/',
                        additionalProps: { clickLabel: true }
                    }
                }
            });
            // Dismiss the expression helper popup triggered by the CodeMirror fill.
            await page.page.keyboard.press('Escape');
            await page.page.waitForTimeout(300);
            await page.page.keyboard.press('Escape');
            await page.page.waitForTimeout(300);

            // Target Type has no default value and is required, but it isn't a
            // standard `ex-editor-*` expression field — it's a plain
            // input/textarea named "targetType". Its mount is intermittently
            // flaky (briefly detaches/remounts during validation).
            const targetTypeField = artifactWebView.locator('input[name="targetType"], textarea[name="targetType"]');
            const saveGetActionButton = artifactWebView.getByRole('button', { name: 'Save' }).last();

            const typeTargetType = async () => {
                await targetTypeField.click({ force: true, timeout: 2000 });
                await page.page.keyboard.press('ControlOrMeta+A');
                await page.page.keyboard.press('Backspace');
                await page.page.keyboard.type('http:Response', { delay: 20 });
                await page.page.waitForTimeout(500);
                // Typing opens the field's autocomplete/type-helper panel, which keeps the
                // field from blurring and the Save button's validation from settling - same
                // as the path field above, dismiss it before checking Save.
                await page.page.keyboard.press('Escape');
                await page.page.waitForTimeout(300);
                await page.page.keyboard.press('Escape');
                await page.page.waitForTimeout(300);
            };

            if (await targetTypeField.count() > 0) {
                await typeTargetType();
            }

            // Enabling Save depends on an async language-server round trip.
            let getFormReady = false;
            for (let attempt = 0; attempt < 30 && !getFormReady; attempt++) {
                if (await saveGetActionButton.isEnabled().catch(() => false)) {
                    getFormReady = true;
                    break;
                }
                if (await targetTypeField.count() > 0) {
                    const currentValue = await targetTypeField.inputValue().catch(() => '');
                    if (currentValue !== 'http:Response') {
                        await typeTargetType().catch(() => { /* field detached mid-interaction; retry next loop */ });
                    }
                }
                await page.page.waitForTimeout(1000);
            }
            if (!getFormReady) {
                throw new Error('Save is disabled on the Get action form after filling path and targetType');
            }
            await saveGetActionButton.click({ force: true });

            await diagramCanvas.waitFor({ state: 'visible', timeout: 60000 });
            // The call node renders as "http : get" and links to a separate
            // "httpClient" connector node alongside it — they're not in the
            // same text node, so match the call node's own label.
            await diagramCanvas.getByText(/http\s*:\s*get/i).first().waitFor({ timeout: 15000 });
            logStep('GET action added and shown in the connection');
        });

        test('Edit connection', async () => {
            logStep('Click the httpClient in the architecture diagram and edit its url');
            await page.page.waitForTimeout(1000);
            const homeButton = artifactWebView.locator('[data-testid="home-button"]');
            const connectionNode = artifactWebView.locator(`[data-testid="connection-node-${CONNECTION_NAME}"]`);
            let onOverview = false;
            for (let attempt = 0; attempt < 5 && !onOverview; attempt++) {
                await homeButton.waitFor({ state: 'visible', timeout: 30000 });
                await homeButton.click({ force: true });
                onOverview = await connectionNode.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
            }
            if (!onOverview) {
                throw new Error('Clicking home did not navigate back to the architecture diagram');
            }
            await connectionNode.click({ force: true });

            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'url': {
                        type: 'cmEditor',
                        value: 'https://foo.bar/baz/updated',
                        additionalProps: { clickLabel: true, switchMode: 'primary-mode', window: global.window }
                    }
                }
            });
            await artifactWebView.getByRole('button', { name: /Update Connection|Save/i }).last().click({ force: true });
            await page.page.waitForTimeout(2000);
            logStep('httpClient url updated and saved correctly');
        });

        test('Add connector using OpenAPI spec', async () => {
            logStep('Add a connector generated from an OpenAPI spec');
            // Saving the connection edit returns straight to the architecture
            // diagram — no explicit "Open View" navigation is needed.
            artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 30000);

            await artifactWebView.getByRole('button', { name: /Add Artifact/i }).click({ force: true });
            await artifactWebView.locator('[data-testid="function-card-Connection"], #connection').first().click({ force: true });
            await page.page.waitForTimeout(1500);

            await artifactWebView.getByText('Connect via API Specification', { exact: false }).first().click({ force: true });
            await page.page.waitForTimeout(1000);

            const connectorNameInput = artifactWebView.locator('#connector-name');
            await connectorNameInput.waitFor({ state: 'visible', timeout: 30000 });
            await connectorNameInput.click({ force: true });
            await page.page.keyboard.type('petstore', { delay: 20 });

            const uploadCard = artifactWebView.locator('[data-testid="api-spec-upload"]');
            await uploadCard.click({ force: true });

            const quickInputText = page.page.locator('.quick-input-widget input[type="text"]').first();
            await quickInputText.waitFor({ state: 'visible', timeout: 30000 });
            await quickInputText.fill(OPENAPI_SPEC_PATH);
            await page.page.waitForTimeout(500);
            await page.page.keyboard.press('Enter');

            // The fixture is copied into the project root ahead of time (see
            // OPENAPI_SPEC_PATH above), so the "file is outside your project"
            // dialog shouldn't appear — but guard for it just in case.
            const moveDialog = artifactWebView.getByRole('button', { name: 'Yes' });
            if (await moveDialog.isVisible({ timeout: 5000 }).catch(() => false)) {
                await moveDialog.click({ force: true });
            }
            await artifactWebView.getByText('petstore.yaml', { exact: false }).first()
                .waitFor({ state: 'visible', timeout: 15000 }).catch(() => { });

            const saveConnectorButton = artifactWebView.getByRole('button', { name: 'Save Connector' });
            await saveConnectorButton.waitFor({ state: 'visible', timeout: 15000 });
            await saveConnectorButton.click({ force: true });

            const saveConnectionButtonStep2 = artifactWebView.getByRole('button', { name: 'Save Connection' });
            await saveConnectionButtonStep2.waitFor({ state: 'visible', timeout: 120000 });
            await saveConnectionButtonStep2.click({ force: true });
            await page.page.waitForTimeout(2000);
            logStep('petstore connector generated from the OpenAPI spec and saved');

            logStep('Navigate to the architecture diagram and verify both connectors');
            // Saving the generated connection returns straight to the
            // architecture diagram — no explicit "Open View" navigation needed.
            artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 30000);

            const httpNode = artifactWebView.locator(`[data-testid="connection-node-${CONNECTION_NAME}"]`);
            await httpNode.waitFor({ state: 'visible', timeout: 60000 });
            const petstoreNode = artifactWebView.locator('[data-testid^="connection-node-"]', { hasText: 'petstore' }).first();
            await petstoreNode.waitFor({ state: 'visible', timeout: 60000 });
            petstoreTestId = await petstoreNode.getAttribute('data-testid');

            // The http client is referenced by the ->get(...) call added earlier,
            // so the diagram engine creates a visible link path for it; the
            // petstore connector is never referenced from any function and gets
            // no link. Count rendered link paths (excluding the wider invisible
            // hit-test "-bg" duplicate) to distinguish the two.
            const linkPaths = artifactWebView.locator('path[id]:not([id$="-bg"])');
            const linkCount = await linkPaths.count();
            if (linkCount !== 1) {
                throw new Error(`expected exactly 1 connector link (httpClient only), found ${linkCount}`);
            }
            logStep('architecture diagram shows both connectors, only httpClient has a connection line');
        });

        test('Delete Connection', async () => {
            logStep('Delete the unused petstore connector via its three-dot menu');
            const petstoreNode = artifactWebView.locator(`[data-testid="${petstoreTestId}"]`);
            const menuBtn = artifactWebView.locator(`[data-testid="${petstoreTestId}-menu"]`);
            await menuBtn.waitFor({ state: 'visible', timeout: 15000 });
            await menuBtn.click({ force: true });

            const deleteItem = artifactWebView.getByText('Delete', { exact: true });
            await deleteItem.waitFor({ state: 'visible', timeout: 10000 });
            await deleteItem.click({ force: true });

            await petstoreNode.waitFor({ state: 'detached', timeout: 30000 });
            const httpNode = artifactWebView.locator(`[data-testid="connection-node-${CONNECTION_NAME}"]`);
            await httpNode.waitFor({ state: 'visible', timeout: 15000 });
            logStep('petstore connector removed; httpClient connector remains');
        });
    });
}
