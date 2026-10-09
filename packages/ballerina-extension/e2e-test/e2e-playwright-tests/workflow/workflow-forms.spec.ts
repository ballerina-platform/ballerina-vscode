/**
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.org)
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
import type { Frame, Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { switchToIFrame } from '@wso2/playwright-vscode-tester';
import {
    BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, createArtifactAndGetWebview, domClick, initTest, newProjectPath,
    page, submitArtifactCreation,
} from '../utils/helpers';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';
import { logStep } from '../utils/helpers/progress';
import { ProjectExplorer, SidePanel } from '../utils/pages';

// Workflow forms built from an empty project, then reopened: what the designer wrote must come back
// from source (wso2/product-integrator#2624, #2493, #2422).
const EMPTY_PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'empty_project');

// Every .bal file of the project, joined: the designer decides which file a declaration lands in.
function projectSource(): string {
    return fs.readdirSync(newProjectPath)
        .filter((name) => name.endsWith('.bal'))
        .map((name) => fs.readFileSync(path.join(newProjectPath, name), 'utf-8'))
        .join('\n');
}

async function getWebview(): Promise<Frame> {
    const webview = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 60000);
    if (!webview) {
        throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
    }
    return webview;
}

// Writes an expression field through its CodeMirror view; see diagram/flow-nodes.spec.ts.
async function fillExEditor(webview: Frame, key: string, value: string): Promise<void> {
    const container = webview.locator(`[data-testid="ex-editor-${key}"]`);
    await container.waitFor({ state: 'visible', timeout: 30000 });
    await container.locator('.cm-content').first().waitFor({ state: 'attached', timeout: 30000 });
    await container.evaluate((element, text) => {
        const cmContent = element.querySelector('.cm-content') as HTMLElement & { cmView?: { view?: any } };
        const view = cmContent?.cmView?.view;
        if (!view) {
            throw new Error('CodeMirror view not found in ex-editor container');
        }
        view.focus();
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }, value);
}

// The identifier fields validate after each edit, and Save stays disabled until the last result is in.
async function waitForEnabled(button: Locator): Promise<void> {
    await button.waitFor({ state: 'visible', timeout: 60000 });
    await expect.poll(() => button.getAttribute('disabled'), { timeout: 30000 }).toBeNull();
    await page.page.waitForTimeout(500);
}

// Opens the node palette from the diagram's trailing empty node. Its add button's test id carries the
// node's own index, not 0, and a coordinate click can land on the floating orb, so fall back to a DOM click.
async function openPalette(webview: Frame): Promise<SidePanel> {
    const canvas = webview.getByTestId('bi-diagram-canvas');
    await canvas.waitFor({ timeout: 60000 });
    const addButton = canvas.locator('[data-testid^="empty-node-add-button"]').first();
    await addButton.waitFor({ state: 'visible', timeout: 60000 });
    const sidePanel = new SidePanel(webview, page.page);
    await addButton.click({ force: true, timeout: 5000 }).catch(() => addButton.dispatchEvent('click'));
    const opened = () => webview.getByTestId('side-panel').waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    if (!await opened()) {
        await addButton.dispatchEvent('click');
    }
    await sidePanel.init();
    return sidePanel;
}

// Fills the Workflow Activity form's name and saves it; returns once the activity is in the source.
async function createActivity(webview: Frame, name: string): Promise<void> {
    const nameInput = webview.getByRole('textbox', { name: /Activity Name/ }).first();
    await nameInput.waitFor({ timeout: 60000 });
    await nameInput.fill(name);
    await nameInput.press('Tab');
    const saveButton = webview.getByRole('button', { name: 'Save' }).first();
    await waitForEnabled(saveButton);
    await saveButton.click({ force: true });
    await expect.poll(projectSource, { timeout: 90000 }).toMatch(new RegExp(`@workflow:Activity\\s+function ${name}\\(`));
}

export default function createTests() {
    test.describe.serial('Workflow Form Tests', {
    }, async () => {
        initTest(true, true, undefined, undefined, EMPTY_PROJECT_TEMPLATE);

        test('Create a workflow without an input and wait for a data event', async () => {
            logStep('Create the Durable Workflow artifact with a name only');
            const artifactWebView = await createArtifactAndGetWebview('Durable Workflow', 'workflow');
            const nameInput = artifactWebView.getByRole('textbox', { name: /^Name/ }).first();
            await nameInput.waitFor({ timeout: 60000 });
            await nameInput.fill('orderWorkflow');
            await nameInput.press('Tab');
            await submitArtifactCreation(artifactWebView);
            const webview = await getWebview();
            await webview.getByTestId('start-node').waitFor({ timeout: 120000 });
            // No input type was given, so the workflow takes the context only.
            expect(projectSource()).toMatch(/function orderWorkflow\(workflow:Context \w+\)/);

            logStep('Add an Await Data step for a boolean data event named payment');
            const sidePanel = await openPalette(webview);
            await sidePanel.clickNode('Await Data');
            const panel = sidePanel.getLocator();
            const variable = panel.getByRole('textbox', { name: /Data Receive Variable Name/ }).first();
            await variable.waitFor({ timeout: 60000 });
            await variable.fill('payment');
            const dataType = panel.getByRole('textbox', { name: /^Data Type/ }).first();
            await dataType.fill('boolean');
            await dataType.press('Escape');
            const dataName = panel.getByRole('textbox', { name: /^Data Name/ }).first();
            await dataName.fill('payment');
            await dataName.press('Escape');
            await domClick(panel.getByRole('button', { name: 'Add' }).first());
            await panel.getByRole('button', { name: 'Cancel' }).waitFor({ state: 'hidden', timeout: 30000 });
            const saveButton = panel.getByRole('button', { name: 'Save' }).first();
            await waitForEnabled(saveButton);
            await saveButton.click({ force: true });

            logStep('The data record is the workflow\'s second parameter');
            await expect.poll(projectSource, { timeout: 90000 }).toMatch(/future<boolean> payment;/);
            // The record follows the context directly: the data lookup must not assume a third parameter.
            expect(projectSource()).toMatch(/function orderWorkflow\(workflow:Context \w+, \w+ \w+\)/);
            await saveButton.waitFor({ state: 'hidden', timeout: 60000 });
        });

        test('Open the activity list from the palette search and keep a typed activity name', async () => {
            const webview = await getWebview();
            logStep('Search the palette for Call Activity and pick the result');
            const sidePanel = await openPalette(webview);
            const panel = sidePanel.getLocator();
            const search = panel.locator('input[placeholder*="Search"], input[type="text"]').first();
            await search.waitFor({ timeout: 60000 });
            await search.fill('Call Activity');
            await page.page.waitForTimeout(1500);
            await domClick(panel.getByText('Call Activity', { exact: true }).last());
            // #2624: the pick opens the activity list rather than collapsing the panel.
            await panel.getByText('Current Integration', { exact: true }).first().waitFor({ timeout: 60000 });
            await expect(panel.getByTestId('node-list-action-onAddFunction').first()).toBeVisible();

            logStep('Create the first activity');
            await domClick(panel.getByTestId('node-list-action-onAddFunction').first());
            await createActivity(webview, 'chargeCard');

            logStep('Create a second activity while the list is still refreshing');
            // After the save the list is restored at once and refreshed for up to six seconds; the form
            // opened in that window must keep what is typed (#2422).
            await panel.getByText('Current Integration', { exact: true }).first().waitFor({ timeout: 60000 });
            await domClick(panel.getByTestId('node-list-action-onAddFunction').first());
            const nameInput = webview.getByRole('textbox', { name: /Activity Name/ }).first();
            await nameInput.waitFor({ timeout: 60000 });
            await nameInput.fill('notifyCustomer');
            await page.page.waitForTimeout(8000);
            await expect(nameInput).toBeVisible();
            await expect(nameInput).toHaveValue('notifyCustomer');
            await nameInput.press('Tab');
            const saveButton = webview.getByRole('button', { name: 'Save' }).first();
            await waitForEnabled(saveButton);
            await saveButton.click({ force: true });
            await expect.poll(projectSource, { timeout: 90000 }).toMatch(/@workflow:Activity\s+function notifyCustomer\(/);

            logStep('The refreshed list offers both activities');
            await panel.getByText('chargeCard', { exact: true }).first().waitFor({ timeout: 120000 });
            await panel.getByText('notifyCustomer', { exact: true }).first().waitFor({ timeout: 120000 });

            logStep('Reopen the first activity\'s form from its own diagram');
            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.goToOverview(DEFAULT_PROJECT_NAME);
            const overview = await getWebview();
            await domClick(overview.getByText('chargeCard', { exact: true }).first());
            const activityView = await getWebview();
            const editButton = activityView.locator('#bi-edit').first();
            await editButton.waitFor({ timeout: 60000 });
            await editButton.click({ force: true });
            await expect(activityView.getByRole('textbox', { name: /^Name/ }).first()).toHaveValue('chargeCard', { timeout: 60000 });
        });

        test('Send data to the workflow from the automation and reopen the node', async () => {
            logStep('Open the automation and add a Send Data step');
            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, 'Entry Points', 'main']);
            const webview = await getWebview();
            await webview.getByTestId('start-node').waitFor({ timeout: 60000 });
            const sidePanel = await openPalette(webview);
            await sidePanel.clickNode('Send Data');
            const panel = sidePanel.getLocator();

            logStep('The only workflow is selected and its data event offered');
            const workflowName = panel.getByRole('combobox', { name: /Workflow Name/ });
            await workflowName.waitFor({ timeout: 60000 });
            await expect(workflowName).toHaveText(/orderWorkflow/, { timeout: 60000 });
            // #2493: Data Name follows the selected workflow's data record.
            const dataName = panel.getByRole('combobox', { name: /Data Name/ });
            await expect(dataName).toHaveText(/payment/, { timeout: 60000 });
            await fillExEditor(webview, 'workflowId', '"wf-1"');
            await fillExEditor(webview, 'data', 'true');
            const saveButton = panel.getByRole('button', { name: 'Save' }).first();
            await waitForEnabled(saveButton);
            await saveButton.click({ force: true });
            await expect.poll(projectSource, { timeout: 90000 }).toMatch(/sendData\(orderWorkflow, "wf-1", "payment", true\)/);
            await saveButton.waitFor({ state: 'hidden', timeout: 60000 });

            logStep('Reopen the node: the form shows what the source holds');
            await domClick(webview.getByText(/payment/).filter({ visible: true }).first());
            await expect(panel.getByRole('combobox', { name: /Workflow Name/ })).toHaveText(/orderWorkflow/, { timeout: 60000 });
            await expect(panel.getByRole('combobox', { name: /Data Name/ })).toHaveText(/payment/, { timeout: 60000 });
            await expect.poll(() => webview.locator('[data-testid="ex-editor-workflowId"] .cm-content').textContent(), { timeout: 30000 }).toBe('"wf-1"');
        });
    });
}
