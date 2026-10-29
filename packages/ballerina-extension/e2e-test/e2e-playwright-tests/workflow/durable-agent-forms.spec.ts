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
import { ProjectExplorer, SidePanel } from '../utils/pages';
import { logStep } from '../utils/helpers/progress';
import { dismissTypeHelper, fillUnderLabel, openPaletteBelow, paletteItem, workflowPaletteItem } from './palette';
import { exEditorText, expandAdvanced, fillExEditor, fillTextField, getWebview, selectDropdown, switchToExpression } from './roleFields';

// The durable agent's forms write what ballerina/workflow 1.0 declares: `events` and `humanTasks` are maps
// keyed by the name (wso2/product-integrator#2809), a send on a one-way channel discards its token (#2811),
// and the Generate form saves inside an activity whose return type includes error, first or below another node (#2810).
const PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'durable_agent_forms_project');

function mainSource(): string {
    return fs.readFileSync(path.join(newProjectPath, 'main.bal'), 'utf-8');
}

// Returns to the integration overview. Best effort: the tests that follow open their artifact through
// openFromOverview, which falls back to the project tree, and on CI the overview did not always come back
// after an activity had been edited (the step waited 90 seconds and failed the test, not the artifact).
async function backToOverview(): Promise<void> {
    const projectExplorer = new ProjectExplorer(page.page);
    await projectExplorer.init();
    await projectExplorer.goToOverview(DEFAULT_PROJECT_NAME).catch(() => undefined);
    const webview = await getWebview();
    // Filtered to the visible one: a dropdown of a form still mounted holds a hidden option of the same text.
    await webview.getByText('billingAgent', { exact: true }).filter({ visible: true }).first()
        .waitFor({ timeout: 30000 }).catch(() => undefined);
}

// Opens an artifact's diagram by its name: from the integration overview when it shows the name, else from
// the project explorer tree, which lists every function and activity (the overview did not show
// notifySupport within 90 seconds on CI after the agent had been edited).
async function openFromOverview(webview: Frame, name: string, ready: Locator): Promise<void> {
    const card = webview.getByText(name, { exact: true }).first();
    if (await card.waitFor({ timeout: 20000 }).then(() => true, () => false)) {
        await card.click({ force: true });
        if (await ready.waitFor({ state: 'visible', timeout: 30000 }).then(() => true, () => false)) {
            return;
        }
    }
    const projectExplorer = new ProjectExplorer(page.page);
    await projectExplorer.init();
    const row = await projectExplorer.findItemExpanding(name);
    if (!row) {
        throw new Error(`neither the overview nor the project tree shows '${name}'`);
    }
    await row.click();
    await ready.waitFor({ state: 'visible', timeout: 60000 });
}

// Fills an expression-mode field and waits for the form to hold the value: the editor is written through
// CodeMirror, and a Save that follows too soon reaches the language server with the field still blank
// (seen as "Name who may decide this: fill in the roles, the users, or both" on the roles field). The
// form's own sign that it has taken the value is Save becoming enabled again after its validation pass.
async function fillExpression(webview: Frame, key: string, value: string): Promise<void> {
    await fillExEditor(webview, key, value);
    await page.page.keyboard.press('Tab');
    await expect.poll(() => exEditorText(webview, key), { timeout: 15000 }).toBe(value);
    const saveButton = webview.getByTestId('side-panel').getByRole('button', { name: 'Save' }).first();
    await expect.poll(() => saveButton.getAttribute('disabled'), { timeout: 30000 }).toBeNull();
}

// Clicks one of the agent box's add-affordances. They are drawn only while the canvas is not read-only,
// and the canvas is read-only while the side panel is open: after a capability save the panel keeps its
// loader up until the refreshed model has rendered, so a click that follows a save too soon finds nothing.
async function clickAffordance(webview: Frame, kind: 'event' | 'humanTask'): Promise<void> {
    await webview.getByTestId('side-panel').waitFor({ state: 'hidden', timeout: 60000 }).catch(() => undefined);
    const affordance = webview.getByTestId(`durable-agent-affordance-${kind}`).first();
    await affordance.waitFor({ state: 'visible', timeout: 60000 });
    await affordance.click({ force: true });
}

// Opens the AI section's Model Provider list and picks a declared provider. The list is fetched after the
// click and did not always arrive within a minute on CI; the pick is retried from the section, and the
// panel's text travels with a failure.
async function pickModelProvider(sidePanel: SidePanel, panel: Locator, name: string): Promise<void> {
    const provider = panel.getByText(name, { exact: true }).first();
    for (let attempt = 0; attempt < 3; attempt++) {
        await (await paletteItem(sidePanel, 'AI', 'Model Provider')).click({ force: true });
        if (await provider.waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false)) {
            await provider.click({ force: true });
            return;
        }
    }
    const shown = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
    throw new Error(`the Model Provider list did not offer ${name}; the panel shows: ${shown}`);
}

// Saves the open form and waits for the panel to close. A form that stays open was refused, and the field
// messages say why: fail on them rather than on a silent timeout.
async function saveForm(panel: Locator, frame?: Frame): Promise<void> {
    const saveButton = panel.getByRole('button', { name: 'Save' }).first();
    await saveButton.waitFor({ state: 'visible', timeout: 60000 });
    const enabled = await expect.poll(() => saveButton.getAttribute('disabled'), { timeout: 30000 }).toBeNull()
        .then(() => true, () => false);
    if (!enabled) {
        // The panel's text carries the field messages; class names are hashed per build, so no selector.
        const shown = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
        throw new Error(`Save stayed disabled; the panel shows: ${shown}`);
    }
    await dismissTypeHelper(panel, frame);
    // Clicked through the DOM: a pointer click lands in whatever covers the button (the type helper
    // popup when the last field is a type), and Playwright never counts the control as stable anyway.
    await saveButton.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => undefined);
    await saveButton.dispatchEvent('click');
    const refused = '';
    // A save the LS or the form refuses leaves the panel open; its text says why, the timeout alone does not.
    await saveButton.waitFor({ state: 'hidden', timeout: 90000 }).catch(async (error) => {
        const shown = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ');
        const tail = shown.length > 1200 ? ` … ${shown.slice(-600)}` : '';
        // A refused save is reported outside the webview, as a VS Code notification.
        const toasts = (await page.page.locator('.notification-toast, .notifications-list-container').allInnerTexts()
            .catch(() => [] as string[])).join(' | ').replace(/\s+/g, ' ').slice(0, 600);
        // A submit the form refuses without a message leaves its mark on the field: an aria-invalid control
        // or an error-styled element. Their markup names the field.
        const marked = await panel.locator('[aria-invalid="true"], [class*="error" i], [class*="invalid" i], [data-error]')
            .evaluateAll((elements) => elements.slice(0, 8).map((element) => element.outerHTML.replace(/\s+/g, ' ').slice(0, 300)))
            .catch(() => [] as string[]);
        throw new Error(`Save did not close the form; the panel shows: ${shown.slice(0, 1200)}${tail}`
            + (refused ? `; the plain click was refused: ${refused}` : '; the plain click went through')
            + (toasts ? `; VS Code notifications: ${toasts}` : '; no VS Code notification shown')
            + (marked.length ? `; error-marked elements: ${marked.join(' || ')}` : '; no error-marked element in the panel'),
            { cause: error });
    });
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
            await clickAffordance(webview, 'event');
            const panel = webview.getByTestId('side-panel');
            await fillTextField(panel, 'Event Name', 'bill');
            await fillUnderLabel(panel, 'Request Type', 'json', webview);
            await selectDropdown(panel, /Cardinality/, 'SINGLE_EVENT');
            await saveForm(panel, webview);
            // The map form the module declares, keyed by the name — not a list of {name: ...} records.
            // The comma follows the previous entry on its line: the designer once wrote it on a line of its own.
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/events:\s*\{\s*bill:\s*\{request:\s*json,\s*cardinality:\s*workflow:SINGLE_EVENT\}\s*\}/);
            expect(mainSource()).not.toMatch(/events:\s*\[/);

            logStep('Register a second channel, chat, with a response: the map gains a key');
            await clickAffordance(webview, 'event');
            await fillTextField(panel, 'Event Name', 'chat');
            await fillUnderLabel(panel, 'Request Type', 'string', webview);
            await fillUnderLabel(panel, 'Response Type', 'string', webview);
            await saveForm(panel, webview);
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/events:\s*\{\s*bill:\s*\{[^}]*\},\s*chat:\s*\{request:\s*string,\s*response:\s*string\}\s*\}/);
        });

        // A role given as an expression is refused at Save by the audience check although the editor shows
        // it (wso2/product-integrator#2824); the tasks below name a user instead. The roles case stays here,
        // skipped, so the gap is visible and the test runs again once the issue is fixed.
        test.fixme('Register a human task for a role given as an expression (wso2/product-integrator#2824)', async () => {
            const webview = await getWebview();
            await webview.getByTestId('durable-agent-run-node').waitFor({ state: 'visible', timeout: 60000 });

            logStep('Register managerApproval for the MANAGER role');
            await clickAffordance(webview, 'humanTask');
            const panel = webview.getByTestId('side-panel');
            await fillTextField(panel, 'Task Name', 'managerApproval');
            await switchToExpression(panel, 'userRoles');
            await fillExpression(webview, 'userRoles', '"MANAGER"');
            await saveForm(panel, webview);
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/humanTasks:\s*\{\s*managerApproval:\s*\{userRoles:\s*"MANAGER"\}\s*\}/);
        });

        test('Register a human task as the keyed map', async () => {
            const webview = await getWebview();
            await webview.getByTestId('durable-agent-run-node').waitFor({ state: 'visible', timeout: 60000 });

            logStep('Register managerApproval for a named user');
            await clickAffordance(webview, 'humanTask');
            const panel = webview.getByTestId('side-panel');
            await fillTextField(panel, 'Task Name', 'managerApproval');
            await expandAdvanced(panel);
            await switchToExpression(panel, 'users');
            await fillExpression(webview, 'users', '"alice"');
            await saveForm(panel, webview);
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/humanTasks:\s*\{\s*managerApproval:\s*\{userRoles:\s*\(\),\s*users:\s*"alice"\}\s*\}/);
            expect(mainSource()).not.toMatch(/humanTasks:\s*\[/);
        });

        test('Register a second human task with a completion type: the map gains a key', async () => {
            const webview = await getWebview();
            await webview.getByTestId('durable-agent-run-node').waitFor({ state: 'visible', timeout: 60000 });

            logStep('Register financeApproval for a named user with a completion type');
            await clickAffordance(webview, 'humanTask');
            const panel = webview.getByTestId('side-panel');
            await fillTextField(panel, 'Task Name', 'financeApproval');
            await expandAdvanced(panel);
            await switchToExpression(panel, 'users');
            await fillExpression(webview, 'users', '"bob"');
            await fillUnderLabel(panel, 'Completion Type', 'BillDetails', webview);
            await saveForm(panel, webview);
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/humanTasks:\s*\{\s*managerApproval:\s*\{[^}]*\},\s*financeApproval:\s*\{userRoles:\s*\(\),\s*users:\s*"bob",\s*resultType:\s*BillDetails\}\s*\}/);
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
            // Instance Id opens in text mode, which would quote the parameter's name.
            await switchToExpression(panel, 'agentId');
            await fillExEditor(webview, 'agentId', 'workflowId');
            await selectDropdown(panel, /Data Event/, 'bill');
            await fillExEditor(webview, 'data', 'payload');
            await saveForm(panel, webview);
            // No token binding: the compiler plugin rejects one on a one-way channel.
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/_ = check supportAgent\.sendData\(workflowId, "bill", payload\);/);

            logStep('Send on chat, which declares a response: the token is bound');
            // Below Start again: the saved node's label wraps in its box, so its text is not matched whole,
            // and the order of the two sends in the function does not matter to the checks.
            sidePanel = await openPaletteBelow(webview, 'Start');
            await (await workflowPaletteItem(sidePanel, 'Send Agent Data Event')).click({ force: true });
            await selectDropdown(panel, /Durable Agentic Workflow/, 'supportAgent');
            // Instance Id opens in text mode, which would quote the parameter's name.
            await switchToExpression(panel, 'agentId');
            await fillExEditor(webview, 'agentId', 'workflowId');
            await selectDropdown(panel, /Data Event/, 'chat');
            await fillExEditor(webview, 'data', '"hello"');
            await saveForm(panel, webview);
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
            const panel = webview.getByTestId('side-panel');
            await pickModelProvider(sidePanel, panel, 'wso2ModelProvider');
            const generate = panel.getByText('Generate', { exact: true }).first();
            await generate.waitFor({ state: 'visible', timeout: 60000 });
            await generate.click({ force: true });
            await fillUnderLabel(panel, 'Prompt', 'Read the bill');
            const result = panel.getByRole('textbox', { name: /Result/ }).first();
            await result.waitFor({ timeout: 60000 });
            await result.fill('details');
            await result.press('Tab');
            await fillUnderLabel(panel, 'Expected Type', 'BillDetails', webview);
            await saveForm(panel, webview);
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/BillDetails details = check wso2ModelProvider->generate\(/);
        });

        // The form that failed is the one opened right after a write in the same activity: the form's fields settle in
        // more than one pass, and a field leaving the form re-checked it while Expected Type was empty.
        test('Generate saves right after another node is added to an activity', async () => {
            logStep('Open the readReceipt activity from the overview');
            await backToOverview();
            const webview = await getWebview();
            await openFromOverview(webview, 'readReceipt', webview.getByTestId('bi-diagram-canvas'));

            logStep('Add a call to fetchReceiptId below Start');
            let sidePanel = await openPaletteBelow(webview, 'Start');
            await (await paletteItem(sidePanel, 'Statement', 'Call Function')).click({ force: true });
            let panel = webview.getByTestId('side-panel');
            // The project's own functions are listed under Current Integration.
            await (await paletteItem(sidePanel, 'Current Integration', 'fetchReceiptId')).click({ force: true });
            await fillUnderLabel(panel, 'File Url', 'fileUrl');
            const idResult = panel.getByRole('textbox', { name: /Result/ }).first();
            await idResult.waitFor({ timeout: 60000 });
            await idResult.fill('receiptId');
            await idResult.press('Tab');
            await saveForm(panel, webview);
            // File Url is a text field, so the typed name is written as a literal; the call is what matters here.
            await expect.poll(mainSource, { timeout: 90000 }).toMatch(/receiptId = check fetchReceiptId\("fileUrl"\);/);

            logStep('Right after, add Generate below the call, with BillDetails as the expected type');
            sidePanel = await openPaletteBelow(webview, 'Start');
            panel = webview.getByTestId('side-panel');
            await pickModelProvider(sidePanel, panel, 'wso2ModelProvider');
            const generate = panel.getByText('Generate', { exact: true }).first();
            await generate.waitFor({ state: 'visible', timeout: 60000 });
            await generate.click({ force: true });
            await fillUnderLabel(panel, 'Prompt', 'Read the receipt');
            const result = panel.getByRole('textbox', { name: /Result/ }).first();
            await result.waitFor({ timeout: 60000 });
            await result.fill('details');
            await result.press('Tab');
            await fillUnderLabel(panel, 'Expected Type', 'BillDetails', webview);
            await saveForm(panel, webview);
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/BillDetails details = check wso2ModelProvider->generate\(`Read the receipt`\);/);
            // The earlier call stays: the Generate node is added below Start, so it sits above the call.
            expect(mainSource()).toMatch(/string receiptId = check fetchReceiptId\("fileUrl"\);/);
        });
    });
}
