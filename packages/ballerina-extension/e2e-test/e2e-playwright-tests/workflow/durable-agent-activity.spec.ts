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
import { expect, Frame, Locator, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { switchToIFrame } from '@wso2/playwright-vscode-tester';
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, initTest, newProjectPath, page } from '../utils/helpers';
import { logStep } from '../utils/helpers/progress';
import { waitForBISidebarTreeView } from '../utils/helpers/sidebar';

// A project with a declared `workflow:DurableAgent`, an http:Client connection and two
// @workflow:Activity functions, one of which takes the client (wso2/product-integrator#2622).
const DURABLE_AGENT_PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'durable_agent_project');

// A list row can still be sliding in when it first resolves, which Playwright reports as outside the
// viewport; settle it before clicking.
async function clickListItem(sidePanel: Locator, name: string): Promise<void> {
    const item = sidePanel.getByText(name, { exact: true }).first();
    await item.waitFor({ state: 'visible', timeout: 60000 });
    await item.scrollIntoViewIfNeeded();
    await page.page.waitForTimeout(500);
    await item.click({ force: true });
}

// Panel controls (the category header's icon buttons, a long form's Save) can be reported outside the
// viewport while the panel is still settling. Settle, then fall back to a DOM click.
async function clickPanelControl(control: Locator): Promise<void> {
    await control.waitFor({ state: 'visible', timeout: 60000 });
    await control.scrollIntoViewIfNeeded();
    await page.page.waitForTimeout(500);
    await control.click({ force: true, timeout: 5000 }).catch(() => control.dispatchEvent('click'));
}

// A capability save hides the form behind an "Applying changes..." loader but keeps the panel open
// until the refreshed canvas lands, and then refreshes the canvas again on a fixed 1.5s/4s ladder.
// Waiting for Save to hide is therefore not enough: the next action would race the refresh, which
// either re-targets the form a later save writes through or closes a panel opened in the meantime.
async function waitForPanelToClose(webview: Frame): Promise<void> {
    await webview.getByTestId('side-panel').waitFor({ state: 'detached', timeout: 90000 });
    await page.page.waitForTimeout(5000);
}

// The tests share one window, so each one makes sure the durable agent's own diagram is showing.
async function openDurableAgent(webview: Frame): Promise<void> {
    const agentBox = webview.getByTestId('durable-agent-run-node');
    if (await agentBox.isVisible()) {
        return;
    }
    await webview.getByText('billingAgent', { exact: true }).first().waitFor({ timeout: 90000 });
    await webview.getByText('billingAgent', { exact: true }).first().click({ force: true });
    await agentBox.waitFor({ state: 'visible', timeout: 60000 });
}

// Opens the agent's Add Tool/Activity list. The list is recognised by its "Create Activity" header
// action: an activity name alone also matches the title of an activity's edit form.
async function openActivityList(webview: Frame): Promise<Locator> {
    await openDurableAgent(webview);
    await webview.getByTestId('durable-agent-add-activity').first().click({ force: true });
    const sidePanel = webview.getByTestId('side-panel');
    await sidePanel.getByTestId('node-list-action-onAddFunction').first().waitFor({ state: 'visible', timeout: 60000 });
    await sidePanel.getByText('lookupBill', { exact: true }).first().waitFor({ timeout: 60000 });
    return sidePanel;
}

export default function createTests() {
    test.describe.serial('Durable Agent Activity Tests', {
    }, async () => {
        initTest(true, true, undefined, undefined, DURABLE_AGENT_PROJECT_TEMPLATE);

        test('Register an activity on a durable agent', async () => {
            logStep('Open the durable agent from the integration overview');
            await waitForBISidebarTreeView(page, 60000);
            const webview = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 60000);
            if (!webview) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }
            await openDurableAgent(webview);

            logStep('Open the Add Activity list from the agent box');
            const sidePanel = await openActivityList(webview);

            logStep('Pick lookupBill and check the registration form');
            await clickListItem(sidePanel, 'lookupBill');
            const saveButton = webview.getByRole('button', { name: 'Save' });
            await saveButton.waitFor({ state: 'visible', timeout: 60000 });
            // The activity is already chosen: the form asks for the binding and the policies only.
            await expect(webview.getByText('Activity Name', { exact: true })).toHaveCount(0);
            await expect(webview.getByText('Activity Description', { exact: true })).toHaveCount(0);
            await expect(webview.getByRole('combobox', { name: 'Api' })).toBeVisible();
            await expect(webview.getByRole('combobox', { name: 'Approval Policy' })).toBeVisible();
            await expect(webview.getByRole('combobox', { name: 'Retry Policy' })).toBeVisible();

            logStep('Save the registration');
            await saveButton.click({ force: true });
            await expect.poll(() => fs.readFileSync(path.join(newProjectPath, 'main.bal'), 'utf-8'), {
                timeout: 60000,
            }).toMatch(/activities:\s*\[[\s\S]*activity:\s*lookupBill[\s\S]*api:\s*billingApi[\s\S]*\]/);
            await waitForPanelToClose(webview);
            // The registered activity hangs off the agent box as a capability circle.
            const capability = webview.getByTestId('durable-agent-capability-activity-lookupBill');
            await capability.waitFor({ timeout: 60000 });

            logStep('Open the registered entry and check its edit form');
            await capability.click({ force: true });
            await saveButton.waitFor({ state: 'visible', timeout: 60000 });
            // The name and description show what the runtime uses, read-only: the function's name and doc comment.
            await expect(webview.getByText('Activity Name', { exact: true })).toBeVisible();
            await expect(webview.getByText('Activity Description', { exact: true })).toBeVisible();
            await expect(webview.getByRole('combobox', { name: 'Api' })).toHaveText(/billingApi/);
            const name = webview.getByTestId('readonly-field-name');
            await expect(name).toContainText('lookupBill');
            const description = webview.locator('vscode-text-area#description');
            await expect(description).toHaveAttribute('placeholder', 'Look up a bill activity');
            await expect(description).toHaveAttribute('readonly', 'true');

            logStep('Saving the edit form leaves the entry without a name');
            // The edit form is longer than the register form, so Save can sit below the fold, where
            // Playwright may still report it outside the viewport after scrolling.
            await clickPanelControl(saveButton);
            // The panel closes once the edit is written; only then is the source final.
            await waitForPanelToClose(webview);
            await webview.getByTestId('durable-agent-capability-activity-lookupBill').waitFor({ timeout: 60000 });
            expect(fs.readFileSync(path.join(newProjectPath, 'main.bal'), 'utf-8')).not.toMatch(/activity:\s*lookupBill[^}]*name:/);
        });

        test('Create a new activity from the agent and register it', async () => {
            const webview = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 60000);
            if (!webview) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }
            logStep('Open the Add Activity list and choose to create a new activity');
            const sidePanel = await openActivityList(webview);
            await clickPanelControl(sidePanel.getByTestId('node-list-action-onAddFunction').first());

            logStep('Fill the Workflow Activity form and save');
            const nameInput = webview.getByRole('textbox', { name: /Activity Name/ }).first();
            await nameInput.waitFor({ timeout: 60000 });
            await nameInput.fill('notifyCustomer');
            // The identifier field validates on blur and Save stays disabled until it has.
            await nameInput.press('Tab');
            const createButton = webview.getByRole('button', { name: 'Save' }).first();
            await expect.poll(() => createButton.getAttribute('disabled'), { timeout: 30000 }).toBeNull();
            await page.page.waitForTimeout(500);
            await createButton.click({ force: true });
            await expect.poll(() => {
                const file = path.join(newProjectPath, 'functions.bal');
                return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
            }, { timeout: 90000 }).toMatch(/@workflow:Activity\s+function notifyCustomer\(/);

            logStep('The list returns with the new activity; register it');
            // The panel comes back to the agent's activity list once the project has recompiled.
            await sidePanel.getByText('notifyCustomer', { exact: true }).first().waitFor({ timeout: 120000 });
            await clickListItem(sidePanel, 'notifyCustomer');
            const saveButton = webview.getByRole('button', { name: 'Save' });
            await saveButton.waitFor({ state: 'visible', timeout: 60000 });
            await expect(webview.getByText('Activity Name', { exact: true })).toHaveCount(0);
            await expect(webview.getByText('Activity Description', { exact: true })).toHaveCount(0);
            await saveButton.click({ force: true });
            await expect.poll(() => fs.readFileSync(path.join(newProjectPath, 'main.bal'), 'utf-8'), {
                timeout: 60000,
            }).toMatch(/activities: \[[\s\S]*notifyCustomer[\s\S]*\]/);
            await waitForPanelToClose(webview);
            await webview.getByTestId('durable-agent-capability-activity-notifyCustomer').waitFor({ timeout: 60000 });
        });

        test('Offer the connections for an activity from a connection', async () => {
            const webview = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 60000);
            if (!webview) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }
            logStep('Open the Add Activity list and choose an activity from a connection');
            const sidePanel = await openActivityList(webview);
            await clickPanelControl(sidePanel.getByTestId('node-list-action-onAdd').first());
            // The wizard's first step lists the project's connections to build the activity from.
            await sidePanel.getByText('billingApi', { exact: true }).first().waitFor({ timeout: 60000 });
            await expect(sidePanel.getByText('Connections').first()).toBeVisible();
        });
    });
}
