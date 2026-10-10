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

// The control under a form label: the nearest ancestor of the label text that holds a control, then that
// control. Covers text fields, web-component fields, dropdowns and CodeMirror editors, which the Await Data
// entry's Data Type is (the side panel also holds the form's own numeric editor, so the label is the anchor).
function controlUnder(scope: Locator, label: string): Locator {
    const labelText = `translate(normalize-space(.), '*', '')='${label}'`;
    const controls = 'self::input or self::textarea or self::vscode-text-field or self::vscode-text-area or self::vscode-dropdown '
        + 'or self::select or @role="combobox" or @role="textbox" or contains(@class,"cm-content")';
    return scope.locator(`xpath=.//*[not(self::script)][${labelText}][not(.//*[${labelText}])]`).first()
        .locator(`xpath=ancestor::*[.//*[${controls}]][1]`)
        .locator(`xpath=.//*[${controls}]`).filter({ visible: true }).first();
}

async function fillUnderLabel(scope: Locator, label: string, value: string): Promise<void> {
    let input = controlUnder(scope, label);
    await input.waitFor({ state: 'visible', timeout: 30000 });
    const kind = await input.evaluate((e) => (e.classList.contains('cm-content') || e.closest('.cm-editor') ? 'cm' : e.tagName.toLowerCase()));
    if (kind === 'cm') {
        await input.evaluate((element, text) => {
            const view = (element as HTMLElement & { cmView?: { view?: any } }).cmView?.view;
            if (!view) {
                throw new Error('CodeMirror view not found under the label');
            }
            view.focus();
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
        }, value);
        await expect.poll(() => input.textContent(), { timeout: 10000 }).toBe(value);
    } else {
        if (kind === 'vscode-text-field' || kind === 'vscode-text-area') {
            input = input.locator('input, textarea').first();
        }
        // Explicit timeouts: the suite's actions otherwise wait without limit and a stuck one burns the
        // 20-minute test budget three times over, past the e2e job's limit.
        await input.click({ timeout: 10000 });
        await input.fill('', { timeout: 10000 });
        await input.pressSequentially(value, { timeout: 10000 });
        await expect.poll(() => input.inputValue(), { timeout: 10000 }).toBe(value);
    }
    await page.page.waitForTimeout(400);
    // The type helper popup stays open over the fields below it; the next click would land in it.
    await page.page.keyboard.press('Escape');
}

// The identifier fields validate after each edit, and Save stays disabled until the last result is in.
async function waitForEnabled(button: Locator): Promise<void> {
    await button.waitFor({ state: 'visible', timeout: 60000 });
    await expect.poll(() => button.getAttribute('disabled'), { timeout: 30000 }).toBeNull();
    await page.page.waitForTimeout(500);
}

const sidePanelOpens = (webview: Frame, timeout: number) =>
    webview.getByTestId('side-panel').filter({ visible: true }).last()
        .waitFor({ state: 'visible', timeout }).then(() => true, () => false);

// Opens the node palette from the + below a node. A diagram that already has steps draws a trailing empty
// node with its own +; a fresh one (Start to End) only shows a + on the edge leaving Start while it is hovered.
async function openPaletteBelow(webview: Frame, nodeText: string): Promise<SidePanel> {
    const canvas = webview.getByTestId('bi-diagram-canvas');
    await canvas.waitFor({ timeout: 60000 });
    const sidePanel = new SidePanel(webview, page.page);
    // Right after a save the diagram redraws; give the trailing empty node a moment to come back.
    const emptyNodeButton = canvas.locator('[data-testid^="empty-node-add-button"]').first();
    if (await emptyNodeButton.waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false)) {
        await emptyNodeButton.click({ force: true, timeout: 5000 }).catch(() => emptyNodeButton.dispatchEvent('click'));
        if (!await sidePanelOpens(webview, 5000)) {
            await emptyNodeButton.dispatchEvent('click');
        }
        await sidePanel.init();
        return sidePanel;
    }
    const node = canvas.getByText(nodeText, { exact: true }).filter({ visible: true }).last();
    await node.waitFor({ state: 'visible', timeout: 60000 });
    const nodeBox = await node.boundingBox();
    if (!nodeBox) {
        throw new Error(`node '${nodeText}' has no position`);
    }
    const nodeBottom = nodeBox.y + nodeBox.height;
    for (let attempt = 0; attempt < 3; attempt++) {
        // The edge leaving the node starts at or just above its label and runs on below it.
        for (const edge of await webview.locator('[data-testid^="diagram-link-"]').all()) {
            const box = await edge.boundingBox();
            if (!box || box.y < nodeBox.y - 40 || box.y > nodeBottom + 90 || box.y + box.height <= nodeBottom + 15) {
                continue;
            }
            const buttonId = ((await edge.getAttribute('data-testid')) ?? '').replace('diagram-link-', 'link-add-button-');
            const button = webview.locator(`[data-testid="${buttonId}"]`).first();
            // Hovered by position: an edge path can measure fine yet count as invisible to Playwright.
            await page.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            // The + is drawn on hover; give it time to render before falling back to a click on the edge.
            if (await button.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) {
                await button.click({ force: true, timeout: 3000 }).catch(() => page.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2));
            } else {
                await page.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            }
            if (await sidePanelOpens(webview, 3000)) {
                await sidePanel.init();
                return sidePanel;
            }
        }
        await page.page.waitForTimeout(1000);
    }
    throw new Error(`the + below '${nodeText}' did not open the side panel`);
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
        // The failure summary is only printed once the whole group ends; log each failure as it happens so a
        // group that runs out of time still says what went wrong.
        test.afterEach(async ({ }, testInfo) => {
            for (const error of testInfo.errors) {
                console.log(`  ✖ ${testInfo.title}: ${(error.message ?? '').split('\n').slice(0, 6).join(' | ')}`);
            }
        });

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
            const sidePanel = await openPaletteBelow(webview, 'Start');
            await sidePanel.clickNode('Await Data');
            const panel = sidePanel.getLocator();
            const variable = panel.getByRole('textbox', { name: /Data Receive Variable Name/ }).first();
            await variable.waitFor({ timeout: 60000 });
            await variable.fill('payment');
            await fillUnderLabel(panel, 'Data Type', 'boolean');
            const dataName = panel.getByRole('textbox', { name: /^Data Name/ }).first();
            await dataName.fill('payment');
            await dataName.press('Escape');
            // Add reads the entry sub-form's state, which commits a beat after typing; a press before that is
            // ignored and leaves the sub-form open, so retry until Cancel is gone.
            const cancel = panel.getByRole('button', { name: 'Cancel' });
            for (let attempt = 0; attempt < 4; attempt++) {
                await page.page.waitForTimeout(800);
                await domClick(panel.getByRole('button', { name: 'Add' }).first());
                if (await cancel.waitFor({ state: 'hidden', timeout: 5000 }).then(() => true, () => false)) {
                    break;
                }
            }
            await expect(cancel).toBeHidden();
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
            const sidePanel = await openPaletteBelow(webview, 'Start');
            const panel = sidePanel.getLocator();
            const search = panel.locator('input[placeholder*="Search"], input[type="text"]').first();
            await search.waitFor({ timeout: 60000 });
            await search.fill('Call Activity');
            // The cross-kind search is debounced and then asks the language server; its results replace the list.
            const result = panel.getByText('Call Activity', { exact: true }).last();
            await result.waitFor({ state: 'visible', timeout: 90000 });
            await domClick(result);
            // #2624: the pick opens the activity list rather than collapsing the panel. An empty project has no
            // Current Integration section yet; the prebuilt activities and the empty-state link are what shows.
            const prebuilt = panel.getByText('Prebuilt Activities', { exact: true }).first();
            if (!await prebuilt.waitFor({ timeout: 60000 }).then(() => true, () => false)) {
                const shown = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
                throw new Error(`picking Call Activity from the search results did not open the activity list; the panel shows: ${shown}`);
            }

            logStep('Create the first activity from the empty-state link');
            await domClick(panel.getByText(/^\+?\s*Create Activity$/).first());
            await createActivity(webview, 'chargeCard');

            logStep('Create a second activity while the list is still refreshing');
            // After the save the list is restored at once and refreshed for up to six seconds; the form
            // opened in that window must keep what is typed (#2422). The list now has a Current Integration
            // section, whose header carries the + for another activity.
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

            logStep('Call the first activity from the workflow');
            // The activity's own diagram is reached from its call node; the overview on this build does not list activities.
            await domClick(panel.getByText('chargeCard', { exact: true }).first());
            const callPanel = panel.getByRole('combobox', { name: /Retry Policy/ });
            await callPanel.waitFor({ timeout: 60000 });
            const callSave = panel.getByRole('button', { name: 'Save' }).first();
            await waitForEnabled(callSave);
            await callSave.click({ force: true });
            await expect.poll(projectSource, { timeout: 90000 }).toMatch(/callActivity\(chargeCard/);
            await callSave.waitFor({ state: 'hidden', timeout: 60000 });

            logStep('Open the activity\'s own diagram from its node and check the edit form reads the name from source');
            const canvas = webview.getByTestId('bi-diagram-canvas');
            const callNode = canvas.getByText('chargeCard', { exact: true }).filter({ visible: true }).last();
            await callNode.waitFor({ timeout: 60000 });
            const openIcon = callNode.locator('xpath=ancestor::*[.//*[contains(@class,"bi-open-in")]][1]').locator('[class*="bi-open-in"]').first();
            await openIcon.click({ force: true, timeout: 10000 }).catch(() => openIcon.dispatchEvent('click'));
            const activityView = await getWebview();
            // Arrived when the name shows outside the canvas: the header of the activity's own view.
            await expect.poll(async () => {
                for (const el of await activityView.getByText('chargeCard', { exact: true }).filter({ visible: true }).all()) {
                    if (!await el.evaluate((e) => !!e.closest('[data-testid="bi-diagram-canvas"]'))) {
                        return true;
                    }
                }
                return false;
            }, { timeout: 60000 }).toBe(true);
            const editButton = activityView.locator('#bi-edit').first();
            await editButton.waitFor({ timeout: 60000 });
            await editButton.click({ force: true });
            await expect(activityView.getByRole('textbox', { name: /^Name/ }).first()).toHaveValue('chargeCard', { timeout: 60000 });
        });

        test('Send data to the workflow from the automation and reopen the node', async () => {
            logStep('Open the automation and add a Send Data step');
            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.init().catch(() => undefined);
            const automation = await projectExplorer.findItem([DEFAULT_PROJECT_NAME, 'Entry Points', 'main'], 30000);
            await automation?.click();
            const webview = await getWebview();
            await webview.getByTestId('start-node').waitFor({ timeout: 60000 });
            const sidePanel = await openPaletteBelow(webview, 'Start');
            const panel = sidePanel.getLocator();
            // Outside a workflow diagram the Workflow category starts collapsed; open it rather than search.
            const sendData = panel.getByText('Send Data Event', { exact: true }).last();
            if (!await sendData.isVisible().catch(() => false)) {
                await sidePanel.expandSection('Workflow');
            }
            if (!await sendData.waitFor({ state: 'visible', timeout: 60000 }).then(() => true, () => false)) {
                const shown = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
                throw new Error(`the automation's palette does not offer Send Data Event; the panel shows: ${shown}`);
            }
            await domClick(sendData);

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
