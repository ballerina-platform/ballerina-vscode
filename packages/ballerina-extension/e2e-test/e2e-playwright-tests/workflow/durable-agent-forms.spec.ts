/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
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
import { initTest, newProjectPath, page } from '../utils/helpers';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';
import { ProjectExplorer } from '../utils/pages';
import { logStep } from '../utils/helpers/progress';
import { fillUnderLabel, openPaletteBelow, paletteItem, workflowPaletteItem } from './palette';
import { fillExEditor, fillTextField, getWebview, selectDropdown, switchToExpression, waitForEnabled } from './roleFields';

// The durable agent's forms write what ballerina/workflow 1.0 declares: `events` and `humanTasks` are maps
// keyed by the name (wso2/product-integrator#2809), a send on a one-way channel discards its token (#2811),
// and the Generate form saves inside an activity whose return type includes error (#2810).
const PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'durable_agent_forms_project');

function mainSource(): string {
    return fs.readFileSync(path.join(newProjectPath, 'main.bal'), 'utf-8');
}

// Returns to the integration overview, where every artifact is listed by name.
async function backToOverview(): Promise<void> {
    const projectExplorer = new ProjectExplorer(page.page);
    await projectExplorer.init().catch(() => undefined);
    await projectExplorer.goToOverview(DEFAULT_PROJECT_NAME);
    await page.page.waitForTimeout(1000);
}

// Opens an artifact's diagram from the integration overview by its name.
async function openFromOverview(webview: Frame, name: string, ready: Locator): Promise<void> {
    const card = webview.getByText(name, { exact: true }).first();
    await card.waitFor({ timeout: 90000 });
    await card.click({ force: true });
    await ready.waitFor({ state: 'visible', timeout: 60000 });
}

// Saves the open form and waits for the panel to close. A form that stays open was refused, and the field
// messages say why: fail on them rather than on a silent timeout.
async function saveForm(panel: Locator): Promise<void> {
    const saveButton = panel.getByRole('button', { name: 'Save' }).first();
    await saveButton.waitFor({ state: 'visible', timeout: 60000 });
    const enabled = await expect.poll(() => saveButton.getAttribute('disabled'), { timeout: 30000 }).toBeNull()
        .then(() => true, () => false);
    if (!enabled) {
        const problems = await panel.locator('[class*=error], [class*=diagnostic]').allInnerTexts().catch(() => []);
        throw new Error(`Save stayed disabled${problems.length ? `: ${problems.join(' | ').slice(0, 400)}` : ''}`);
    }
    await page.page.waitForTimeout(500);
    await saveButton.click({ force: true });
    await saveButton.waitFor({ state: 'hidden', timeout: 90000 });
}

export default function createTests() {
    test.describe.serial('Durable Agent Form Tests', {
    }, async () => {
        initTest(true, true, undefined, undefined, PROJECT_TEMPLATE);
        test.afterEach(async ({ }, testInfo) => {
            for (const error of testInfo.errors) {
                console.log(`  ✖ ${testInfo.title}: ${(error.message ?? '').split('\n').slice(0, 6).join(' | ')}`);
            }
        });

        test('Register data events as the keyed map', async () => {
            logStep('Open billingAgent from the integration overview');
            const webview = await getWebview();
            await openFromOverview(webview, 'billingAgent', webview.getByTestId('durable-agent-run-node'));

            logStep('Register a one-way SINGLE_EVENT channel named bill');
            await webview.getByTestId('durable-agent-affordance-event').first().click({ force: true });
            const panel = webview.getByTestId('side-panel');
            await fillTextField(panel, 'Event Name', 'bill');
            await fillUnderLabel(panel, 'Request Type', 'json');
            await selectDropdown(panel, /Cardinality/, 'SINGLE_EVENT');
            await saveForm(panel);
            // The map form the module declares, keyed by the name — not a list of {name: ...} records.
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/events:\s*\{\s*bill:\s*\{request:\s*json,\s*cardinality:\s*workflow:SINGLE_EVENT\}\s*\}/);
            expect(mainSource()).not.toMatch(/events:\s*\[/);

            logStep('Register a second channel, chat, with a response: the map gains a key');
            await webview.getByTestId('durable-agent-affordance-event').first().click({ force: true });
            await fillTextField(panel, 'Event Name', 'chat');
            await fillUnderLabel(panel, 'Request Type', 'string');
            await fillUnderLabel(panel, 'Response Type', 'string');
            await saveForm(panel);
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/events:\s*\{\s*bill:\s*\{[^}]*\},\s*chat:\s*\{request:\s*string,\s*response:\s*string\}\s*\}/);
        });

        test('Register human tasks as the keyed map', async () => {
            const webview = await getWebview();
            await webview.getByTestId('durable-agent-run-node').waitFor({ state: 'visible', timeout: 60000 });

            logStep('Register managerApproval for the MANAGER role with a completion type');
            await webview.getByTestId('durable-agent-affordance-humanTask').first().click({ force: true });
            const panel = webview.getByTestId('side-panel');
            await fillTextField(panel, 'Task Name', 'managerApproval');
            await switchToExpression(panel, 'userRoles');
            await fillExEditor(webview, 'userRoles', '"MANAGER"');
            await fillUnderLabel(panel, 'Completion Type', 'BillDetails');
            await saveForm(panel);
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/humanTasks:\s*\{\s*managerApproval:\s*\{userRoles:\s*"MANAGER",\s*resultType:\s*BillDetails\}\s*\}/);
            expect(mainSource()).not.toMatch(/humanTasks:\s*\[/);

            logStep('Register a second task: the form can still add to the map');
            await webview.getByTestId('durable-agent-affordance-humanTask').first().click({ force: true });
            await fillTextField(panel, 'Task Name', 'financeApproval');
            await switchToExpression(panel, 'userRoles');
            await fillExEditor(webview, 'userRoles', '"FINANCE"');
            await saveForm(panel);
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/humanTasks:\s*\{\s*managerApproval:\s*\{[^}]*\},\s*financeApproval:\s*\{userRoles:\s*"FINANCE"\}\s*\}/);
        });

        test('Send Agent Data Event discards the token on a one-way channel', async () => {
            logStep('Open the notifySupport function from the overview');
            await backToOverview();
            const webview = await getWebview();
            await openFromOverview(webview, 'notifySupport', webview.getByTestId('bi-diagram-canvas'));

            logStep('Send on bill, which declares no response');
            let sidePanel = await openPaletteBelow(webview, 'Start');
            await (await workflowPaletteItem(sidePanel, 'Send Agent Data Event')).click({ force: true });
            const panel = webview.getByTestId('side-panel');
            await selectDropdown(panel, /Durable Agentic Workflow/, 'supportAgent');
            await fillExEditor(webview, 'agentId', 'workflowId');
            await selectDropdown(panel, /Data Event/, 'bill');
            await fillExEditor(webview, 'data', 'payload');
            await saveForm(panel);
            // No token binding: the compiler plugin rejects one on a one-way channel.
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/_ = check supportAgent\.sendData\(workflowId, "bill", payload\);/);

            logStep('Send on chat, which declares a response: the token is bound');
            sidePanel = await openPaletteBelow(webview, 'Send Agent Data Event');
            await (await workflowPaletteItem(sidePanel, 'Send Agent Data Event')).click({ force: true });
            await selectDropdown(panel, /Durable Agentic Workflow/, 'supportAgent');
            await fillExEditor(webview, 'agentId', 'workflowId');
            await selectDropdown(panel, /Data Event/, 'chat');
            await fillExEditor(webview, 'data', '"hello"');
            await saveForm(panel);
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/string eventToken = check supportAgent\.sendData\(workflowId, "chat", "hello"\);/);
        });

        test('Generate saves in an activity whose return type includes error', async () => {
            logStep('Open the readBill activity from the overview');
            await backToOverview();
            const webview = await getWebview();
            await openFromOverview(webview, 'readBill', webview.getByTestId('bi-diagram-canvas'));

            logStep('Add Generate on wso2ModelProvider with BillDetails as the expected type');
            const sidePanel = await openPaletteBelow(webview, 'Start');
            await (await paletteItem(sidePanel, 'AI', 'Model Provider')).click({ force: true });
            const panel = webview.getByTestId('side-panel');
            const provider = panel.getByText('wso2ModelProvider', { exact: true }).first();
            await provider.waitFor({ state: 'visible', timeout: 60000 });
            await provider.click({ force: true });
            const generate = panel.getByText('Generate', { exact: true }).first();
            await generate.waitFor({ state: 'visible', timeout: 60000 });
            await generate.click({ force: true });
            await fillUnderLabel(panel, 'Prompt', 'Read the bill');
            const result = panel.getByRole('textbox', { name: /Result/ }).first();
            await result.waitFor({ timeout: 60000 });
            await result.fill('details');
            await result.press('Tab');
            await fillUnderLabel(panel, 'Expected Type', 'BillDetails');
            await saveForm(panel);
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/BillDetails details = check wso2ModelProvider->generate\(/);
        });
    });
}
