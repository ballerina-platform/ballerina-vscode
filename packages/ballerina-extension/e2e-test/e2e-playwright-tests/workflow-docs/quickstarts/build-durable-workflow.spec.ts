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
import { initTest, newProjectPath, stopAllRunningIntegrations } from '../../utils/helpers';
import { projectSources, QUICKSTARTS, WORKFLOW_QUICKSTART_TEMPLATE } from '../common';
import { DocJourney } from '../doc-journey';
import { Integrator } from '../integrator';
import { httpPost, listenerPort, waitForPort, waitForTerminal } from '../project';

// Follows "Build a Durable Workflow" as written, by the page's own step numbers. Where the UI names a control
// differently, the UI's name is used and a finding is recorded.

export default function createTests() {
    test.describe.serial('Build a Durable Workflow Docs Tests', () => {
        initTest(true, true, undefined, undefined, WORKFLOW_QUICKSTART_TEMPLATE);

        // Step 10 runs the integration; the later specs share this window and port 9090.
        test.afterAll(async () => {
            await stopAllRunningIntegrations();
        });

        test('Build an Order Processing Workflow', async () => {
            const j = new DocJourney({ title: 'Build a Durable Workflow', slug: `${QUICKSTARTS}/build-durable-workflow` });
            const ui = new Integrator(j);
            const source = projectSources();

            // Step 1 creates the project from the home page; the harness opens an empty project of the same name.
            let view = await ui.view(/Add Artifact/i, 180000);

            // ---------------------------------------------------------------- Step 2
            await j.step('2.1', 'In the design view, click **Add Artifact Manually**.', async () => {
                await ui.clickButton(view, 'Add Artifact Manually');
            });
            await j.step('2.2', 'On the **Artifacts** page, under **Durable Workflow**, click **Durable Workflow**. The **Create New Durable Workflow** form opens.', async () => {
                view = await ui.view('Durable Workflow');
                view = await ui.artifact(view, 'Durable Workflow', 'Durable Workflow', 'workflow');
                await view.getByText('Create New Durable Workflow').waitFor();
            });
            await j.step('2.3', 'Set **Name** to `orderWorkflow`.', async () => {
                await ui.fill(view, 'Name', 'orderWorkflow');
            });
            await j.step('2.4', 'Click the **Workflow Input Data Type** field, then create a new type for the order information that the workflow needs.', async () => {
                await j.click(await ui.field(view, 'Workflow Input Data Type'));
            });
            await ui.createRecordType(view, 'OrderInfo', [
                ['id', 'string'], ['customerId', 'string'], ['customerEmail', 'string'], ['total', 'int'],
            ], '2.5-10');
            await j.step('2.11', 'Click **Create**. The workflow is generated and its diagram opens with a single **Start** node, ready for the first step.', async () => {
                await ui.dismiss();
                await ui.clickButton(view, 'Create');
                view = await ui.view(/Start/, 120000);
                await expect(view.getByTestId('start-node')).toBeVisible({ timeout: 60000 });
            });
            expect(source('types.bal')).toMatch(/type OrderInfo record/);

            // The page's code names the workflow input `orderInfo`; the designer names it whatever it generated.
            const input = (source('workflows.bal').match(/function orderWorkflow\(workflow:Context ctx, OrderInfo (\w+)/) ?? [])[1] ?? 'orderInfo';
            if (input !== 'orderInfo') {
                await j.finding({
                    step: '2.11',
                    kind: 'behaviour',
                    says: 'The code tab declares `function orderWorkflow(workflow:Context ctx, OrderInfo orderInfo)`, and later code uses `orderInfo`',
                    actual: `The designer generates the parameter as \`${input}\`, so the value helper lists \`${input}\` and the code in Steps 3, 6 and 7 does not match a project built from the visual steps`,
                    suggestion: `Use \`${input}\` in the workflow's code tabs (\`{orderInfo: ${input}}\`), or show how to rename the parameter.`,
                });
            }

            // ---------------------------------------------------------------- Step 3
            await j.step('3.1', 'On the workflow diagram, click **+**.', async () => {
                await ui.plusBelow(view, 'Start');
            });
            await j.step('3.2', 'In the node panel, under **Workflow** > **Steps**, click **Call Activity**. The **Activities** panel opens, listing everything this workflow can call.', async () => {
                await ui.palette(['Workflow', 'Steps', 'Call Activity']);
                await (await ui.panel()).getByText('Current Integration').waitFor();
            });
            await j.step('3.3', 'Under **Current Integration**, click **+ Create Activity**.', async () => {
                await openCreateActivity(j, ui, true);
            });
            await createActivity(j, ui, '3', 'reserveInventory', [['OrderInfo', 'orderInfo']]);
            await j.step('3.7', 'In the **Activities** panel, under **Current Integration**, click `reserveInventory` to add the activity call to the workflow diagram.', async () => {
                await ui.clickText(await ui.panel('reserveInventory'), 'reserveInventory');
            });
            await j.step('3.8', 'Fill in the call form: **Order Info** — switch to **Expression** and set it to the workflow\'s input parameter; **Retry Policy** — **No Automatic Retry** for now.', async () => {
                const panel = await ui.panel(/Retry Policy/);
                await ui.mode(panel, 'Order Info', 'Expression');
                await ui.pick(panel, 'Order Info', ['Inputs', input]);
                await ui.select(panel, view, 'Retry Policy', { doc: 'No Automatic Retry', ui: 'No Retry' });
            });
            await j.step('3.9', 'Click **Save**. The `reserveInventory` node appears on the diagram.', async () => {
                await ui.saveForm();
                await expect.poll(() => source('workflows.bal'), { timeout: 60000 }).toMatch(/callActivity\(reserveInventory/);
                const call = (source('workflows.bal').match(/^\s*(.*callActivity\(reserveInventory.*)$/m) ?? [])[1] ?? '';
                if (!/anydata inventoryResult =/.test(call)) {
                    await j.finding({
                        kind: 'behaviour',
                        says: 'The code tab shows `anydata inventoryResult = check ctx->callActivity(reserveInventory, {orderInfo: orderInfo});`',
                        actual: `The designer writes \`${call.trim()}\` for an activity that returns nothing`,
                        suggestion: 'Show the generated line, or explain that an activity with no return value binds to `() _`.',
                    });
                }
            });
            await j.step('3.10', 'Click the open icon on the node to open its own diagram. To keep it simple, mock the implementation with a log line.', async () => {
                await ui.openNode(view, 'reserveInventory');
                view = await ui.view(/Start/);
            });
            await j.step('3.11', 'Click **+**, then **Log Info** under **Logging**. Set **Msg** to `Inventory reserved` and click **Save**.', async () => {
                await ui.plusBelow(view, 'Start');
                await ui.palette(['Logging', 'Log Info']);
                const panel = await ui.panel(/Msg/i);
                await ui.fill(panel, 'Msg', 'Inventory reserved');
                await ui.dismiss();
                await ui.saveForm();
                await expect.poll(() => source('functions.bal'), { timeout: 60000 }).toMatch(/Inventory reserved/);
            });

            // ---------------------------------------------------------------- Step 4
            await j.step('4.1', 'Log a line first. Go back to the **orderWorkflow** under workflows. Click the **+** below the reserveInventory step. In the node panel, scroll down and click **Show More Functions**.', async () => {
                await ui.sidebar('orderWorkflow');
                view = await ui.view('reserveInventory');
                await ui.plusBelow(view, 'reserveInventory');
                await ui.clickText(await ui.panel(), 'Show More Functions');
            });
            await j.step('4.2', 'In the **Functions** panel, under **Imported Functions** > **log**, click **printInfo**. Set **Msg** to `Waiting for payment` and click **Save**.', async () => {
                await ui.palette(['Imported Functions', 'log', 'printInfo']);
                const form = await ui.panel(/Msg/i);
                await ui.fill(form, 'Msg', 'Waiting for payment');
                await ui.dismiss();
                await ui.saveForm();
                await j.finding({
                    kind: 'clarity',
                    says: 'Steps 4.1–4.2 log through **Show More Functions** > **Imported Functions** > **log** > **printInfo**',
                    actual: 'Step 3.11 logs with **Log Info** under **Logging**, which is two clicks and opens the same form',
                    suggestion: 'Use **Log Info** under **Logging** here too, so the page teaches one way to log.',
                });
            });
            await j.step('4.3', 'Now add the wait. Click **+** below the log step.', async () => {
                await ui.plusBelow(view, /Waiting for payment|printInfo/);
            });
            await j.step('4.4', 'In the node panel, under **Workflow** > **Steps**, click **Await Data Event**. The **Await Data** form opens.', async () => {
                await ui.palette(['Workflow', 'Steps', { doc: 'Await Data Event', ui: 'Await Data' }]);
            });
            await j.step('4.5', 'Under **Data Waits**, fill in the entry: **Data Receive Variable Name** `payment`, **Data Type** `boolean`, **Data Name** `payment`.', async () => {
                const panel = await ui.panel(/Data/);
                await ui.fill(panel, 'Data Receive Variable Name', 'payment');
                await ui.fill(panel, 'Data Type', 'boolean');
                await ui.dismiss();
                await ui.fill(panel, 'Data Name', 'payment');
                await ui.dismiss();
            });
            await j.step('4.6', 'Click **Add** then click **Save**.', async () => {
                const panel = await ui.panel();
                await ui.clickButton(panel, 'Add');
                await ui.saveForm();
                await expect(view.getByText(/Wait for payment/i).first()).toBeVisible();
            });

            // ---------------------------------------------------------------- Step 5
            await j.step('5.1', 'Click **+** below the wait.', async () => {
                await ui.plusBelow(view, 'Wait for payment');
            });
            await j.step('5.2', 'In the node panel, under **Control**, click **If**.', async () => {
                await ui.palette(['Control', 'If']);
            });
            await j.step('5.3', '**Condition** is prefilled with `true`. Replace it with the value the wait produced: click the field and pick `payment` under **Variables** in the value helper.', async () => {
                const panel = await ui.panel(/Condition/i);
                await j.click(await ui.field(panel, 'Condition'));
                await j.page.keyboard.press('ControlOrMeta+A');
                await j.page.keyboard.press('Backspace');
                await ui.pick(panel, 'Condition', ['Variables', 'payment']);
            });
            await j.step('5.4', 'Click **Add Else Block**.', async () => {
                await ui.clickText(await ui.panel(), 'Add Else Block');
            });
            await j.step('5.5', 'Click **Save**.', async () => {
                await ui.saveForm();
                await expect.poll(() => source('workflows.bal'), { timeout: 60000 }).toMatch(/if payment \{[\s\S]*\} else \{/);
            });

            // ---------------------------------------------------------------- Step 6
            await j.step('6.1', 'Click **+** on the `payment` path, then under **Workflow** > **Steps**, click **Call Activity**.', async () => {
                await ui.plusOnBranch(view, 'payment', 0);
                await ui.palette(['Workflow', 'Steps', 'Call Activity']);
            });
            await j.step('6.2', 'The **Activities** panel already lists `reserveInventory`, so click the **+** on the **Current Integration** header to add another activity.', async () => {
                await openCreateActivity(j, ui, false);
            });
            await createActivity(j, ui, '6.3', 'sendEmail', [['OrderInfo', 'orderInfo']]);
            await j.step('6.4', 'Click `sendEmail` in the **Activities** panel under **Current Integration**.', async () => {
                await ui.clickText(await ui.panel('sendEmail'), 'sendEmail');
            });
            await j.step('6.5', 'In the **Order Info** field, switch from **Record** to **Expression**, then select the workflow\'s input, and click **Save**.', async () => {
                const panel = await ui.panel(/Retry Policy/);
                await ui.mode(panel, 'Order Info', 'Expression');
                await ui.pick(panel, 'Order Info', ['Inputs', input]);
                await ui.saveForm();
                await expect.poll(() => source('workflows.bal'), { timeout: 60000 }).toMatch(/callActivity\(sendEmail/);
            });
            await j.step('6.6', 'Click the open icon on the `sendEmail` node to open its diagram.', async () => {
                await ui.openNode(view, 'sendEmail');
                view = await ui.view(/Start/);
            });
            await j.step('6.7', 'Click **+**, then click **Log Info** under **Logging**.', async () => {
                await ui.plusBelow(view, 'Start');
                await ui.palette(['Logging', 'Log Info']);
            });
            await j.step('6.8', 'Leave **Msg** on **Text** and type `Email sent to `. Click on the text box to open the field\'s value helper, then click **Inputs** > `orderInfo` > `customerEmail`.', async () => {
                const panel = await ui.panel(/Msg/i);
                await ui.fill(panel, 'Msg', 'Email sent to ');
                await ui.pick(panel, 'Msg', ['Inputs', 'orderInfo', 'customerEmail']);
            });
            await j.step('6.9', 'Click **Save**.', async () => {
                await ui.saveForm();
                await expect.poll(() => source('functions.bal'), { timeout: 60000 }).toMatch(/Email sent to \$\{orderInfo\.customerEmail\}/);
            });

            // ---------------------------------------------------------------- Step 7
            await j.step('7.1', 'Click **+** on the **Else** path, then under **Workflow** > **Steps**, click **Call Activity**.', async () => {
                // Step 6 ends on sendEmail's own diagram; the page does not say to return to the workflow.
                if (!(await view.getByText('Wait for payment').first().isVisible().catch(() => false))) {
                    await j.finding({
                        kind: 'gap',
                        says: '"Click **+** on the **Else** path"',
                        actual: 'After Step 6 the editor shows `sendEmail`\'s own diagram, which has no Else path',
                        suggestion: 'Start Step 7 with "Go back to **orderWorkflow** under **Workflows** in the sidebar", as Step 4.1 does.',
                    });
                    await ui.sidebar('orderWorkflow');
                    view = await ui.view('Wait for payment');
                }
                await ui.plusOnBranch(view, 'Else', -1);
                await ui.palette(['Workflow', 'Steps', 'Call Activity']);
            });
            await j.step('7.2', 'Click the **+** on the **Current Integration** header.', async () => {
                await openCreateActivity(j, ui, false);
            });
            await createActivity(j, ui, '7.3', 'cancelOrder', [['OrderInfo', 'orderInfo']]);
            await j.step('7.4', 'Click `cancelOrder` in the **Activities** panel under **Current Integration**.', async () => {
                await ui.clickText(await ui.panel('cancelOrder'), 'cancelOrder');
            });
            await j.step('7.5', 'In the **Order Info** field, switch from **Record** to **Expression**, then select the workflow\'s input, and click **Save**.', async () => {
                const panel = await ui.panel(/Retry Policy/);
                await ui.mode(panel, 'Order Info', 'Expression');
                await ui.pick(panel, 'Order Info', ['Inputs', input]);
                await ui.saveForm();
                await expect.poll(() => source('workflows.bal'), { timeout: 60000 }).toMatch(/callActivity\(cancelOrder/);
            });

            // ---------------------------------------------------------------- Step 8
            await j.step('8.1', 'At the top of the screen, click `OrderProcessor` to return to the project.', async () => {
                view = await ui.crumb('OrderProcessor', /Add Artifact/i).catch(() => ui.overview());
            });
            await j.step('8.2', 'Click **+ Add Artifact**, then under **Integration as API**, click **HTTP Service**.', async () => {
                await ui.clickButton(view, '+ Add Artifact');
                view = await ui.view('Integration as API');
                view = await ui.artifact(view, 'Integration as API', 'HTTP Service', 'http-service-card');
            });
            await j.step('8.3', 'On the **Create HTTP Service** form, keep **Service Contract** on **Design From Scratch**, set **Service Base Path** to `/\'order`, and click **Create**.', async () => {
                view = await ui.view(/Service Base Path/i);
                await ui.fill(view, 'Service Base Path', "/'order");
                await ui.clickButton(view, 'Create');
            });
            await j.step('8.4', 'The service opens with no resources. Click **+ Add Resource**.', async () => {
                view = await ui.view(/Add Resource/i, 120000);
                await ui.clickButton(view, '+ Add Resource');
            });
            await j.step('8.5', 'Set **HTTP Method** to **POST** and **Resource Path** to `.`.', async () => {
                await chooseHttpMethod(j, ui, 'POST', '8.5');
                const panel = await ui.panel('New Resource Configuration');
                await ui.fill(panel, 'Resource Path', '.');
            });
            await j.step('8.6', 'Click **+ Define Payload**, open the **Browse Existing Types** tab, click `OrderInfo` under the current integration, and click **Save**.', async () => {
                await ui.clickText(await ui.panel(), '+ Define Payload');
                const frame = await ui.view('Browse Existing Types');
                await ui.clickText(frame, 'Browse Existing Types');
                await ui.clickText(frame, 'OrderInfo');
                await j.click(frame.getByRole('button', { name: 'Save' }).last());
            });
            await j.step('8.7', 'Click **Save** to create the resource. Its own diagram opens.', async () => {
                await ui.saveForm();
                view = await ui.view(/Start/, 120000);
            });
            await j.step('8.8', 'Click **+**, then under **Workflow**, click **Run Workflow**.', async () => {
                await ui.plusBelow(view, 'Start');
                await ui.palette(['Workflow', 'Run Workflow']);
            });
            await j.step('8.9', 'Select the `orderWorkflow` under **Current Integration**.', async () => {
                await ui.clickText(await ui.panel('orderWorkflow'), 'orderWorkflow');
            });
            await j.step('8.10', 'Under **Input**, switch from **Record** to **Expression** and set **Input** to the request payload. Leave **Workflow ID Variable Name** as `workflowId`, then click **Save**.', async () => {
                const panel = await ui.panel(/Workflow ID Variable Name/i);
                await ui.mode(panel, 'Input', 'Expression');
                await ui.pick(panel, 'Input', ['Inputs', 'payload']);
                await ui.saveForm();
            });
            await j.step('8.11', 'Click **+** below the **Run Workflow** node, then click **Return** under **Control**. In the **Expression** field, select **Variables**, then select `workflowId`, and click **Save**.', async () => {
                await ui.plusBelow(view, /Run Workflow|orderWorkflow/);
                await ui.palette(['Control', 'Return']);
                const panel = await ui.panel(/Expression/);
                await ui.pick(panel, 'Expression', ['Variables', 'workflowId']);
                await ui.saveForm();
                await expect.poll(() => source('main.bal'), { timeout: 60000 }).toMatch(/workflow:run\(orderWorkflow/);
            });

            // ---------------------------------------------------------------- Step 9
            await j.step('9.1', 'On the service, click the **+** button next to **Resources**.', async () => {
                // Step 8 ends on the resource's own diagram; the page does not say how to get back to the service.
                await j.finding({
                    kind: 'gap',
                    says: '"On the service, click the **+** button next to **Resources**"',
                    actual: 'After Step 8.11 the editor shows the `post .` resource\'s diagram, which has no **Resources** list',
                    suggestion: 'Start Step 9 with "Return to the service: click **HTTP Service - /\'order** under **Entry Points** in the sidebar".',
                });
                await ui.sidebar("HTTP Service - /'order");
                view = await ui.view('Resources');
                // With a resource in place the header button reads "+ Resource"; that is the + next to Resources.
                await ui.clickButton(view, { doc: '+ Resource', ui: ['Add Resource'] });
            });
            await j.step('9.2', 'Set **HTTP Method** to **POST**.', async () => {
                await chooseHttpMethod(j, ui, 'POST', '9.2');
            });
            await j.step('9.3', 'Click **+ Path Param** and fill in the **Path Parameter** form: **Name** `orderId`, **Type** `string`.', async () => {
                const panel = await ui.panel('New Resource Configuration');
                // The inline Path Parameter editor opens with its Name box focused and holding `param`; Type
                // already defaults to `string`.
                await j.clickUntil(await ui.text(panel, '+ Path Param'), panel.getByText('Path Parameter', { exact: true }));
                await j.typeFocused('orderId');
            });
            await j.step('9.4', 'Click **Save**. The segment lands in **Resource Path** as `[string orderId]`. Complete the path so it reads `[string orderId]/payment`.', async () => {
                const panel = await ui.panel('New Resource Configuration');
                // The editor's own Save, inside the Path Parameter box; the form's Save stays for Step 9.5.
                const editor = panel.getByText('Path Parameter', { exact: true }).locator('xpath=ancestor::*[.//button[normalize-space()="Save"] or .//vscode-button[normalize-space()="Save"]][1]');
                await j.click(editor.getByRole('button', { name: 'Save' }).first());
                await expect(panel.getByText('Path Parameter', { exact: true })).toBeHidden();
                const resourcePath = await ui.field(panel, 'Resource Path');
                const pathValue = async () => resourcePath.inputValue().catch(() => resourcePath.locator('input').inputValue()).catch(() => '');
                await expect.poll(pathValue, { message: 'Resource Path after saving the path parameter' }).toContain('orderId');
                await j.click(resourcePath);
                await j.page.keyboard.press('End');
                await j.typeFocused('/payment', false);
                await expect.poll(pathValue).toBe('[string orderId]/payment');
            });
            await j.step('9.5', 'Click **Save** to create the resource. Its diagram opens.', async () => {
                await ui.saveForm();
                view = await ui.view(/Start/, 120000);
            });
            await j.step('9.6', 'Click **+**, then under **Workflow**, click **Send Data Event**.', async () => {
                await ui.plusBelow(view, 'Start');
                await ui.palette(['Workflow', { doc: 'Send Data Event', ui: ['Send Data'] }]);
            });
            await j.step('9.7', 'Fill in the **Send Data** form: **Workflow Name** `orderWorkflow`, **Target Workflow Id** `orderId`, **Data Name** `payment`, **Data** `true`.', async () => {
                const panel = await ui.panel(/Workflow/);
                await ui.select(panel, view, 'Workflow Name', 'orderWorkflow');
                await ui.pick(panel, 'Target Workflow Id', ['Inputs', 'orderId']);
                await ui.select(panel, view, 'Data Name', 'payment');
                await ui.fill(panel, 'Data', 'true');
                await ui.dismiss();
            });
            await j.step('9.8', 'Click **Save**.', async () => {
                await ui.saveForm();
                await expect.poll(() => source('main.bal'), { timeout: 60000 }).toMatch(/sendData\(orderWorkflow/);
            });

            // ---------------------------------------------------------------- Step 10
            await j.step('10.1-3', 'In the sidebar, click **Configurations**. Under **Imported libraries**, click **ballerina/workflow**. In the box under `mode`, enter `"IN_MEMORY"`.', async () => {
                await ui.sidebar('Configurations');
                let opened = await ui.view(/Configurable Variables/i, 8000).then(() => true).catch(() => false);
                if (!opened) {
                    // The row only selects; its inline view icon opens the page.
                    const row = j.page.getByRole('treeitem', { name: /^Configurations/ }).first();
                    await j.hover(row);
                    const actions = row.locator('.action-label');
                    const labels = await actions.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
                    const viewIndex = labels.findIndex((l) => /view|open/i.test(l));
                    await j.click(actions.nth(viewIndex >= 0 ? viewIndex : labels.length - 1));
                    opened = await ui.view(/Configurable Variables/i, 30000).then(() => true).catch(() => false);
                    await j.finding({
                        kind: 'behaviour',
                        says: 'In the sidebar, click **Configurations**',
                        actual: `Clicking **Configurations** only selects the row; the page opens from the row's inline icon (${labels.filter(Boolean).join(', ') || 'no label'})`,
                        suggestion: 'Say "hover **Configurations** in the sidebar and click its view icon", or make a click on the row open the page.',
                    });
                }
                view = await ui.view(/Configurable Variables/i);
                await ui.clickText(view, 'ballerina/workflow');
                await ui.fill(view, 'mode', '"IN_MEMORY"');
                await j.page.keyboard.press('Tab');
                await j.page.waitForTimeout(1500);
            });
            let workflowId = '';
            const port = await listenerPort(j, newProjectPath);
            await j.step('10.4-5', 'Click **Run** at the top of the Integrator window. Post an order and keep the returned workflow ID.', async () => {
                // The run icon in the window's editor title actions; the overview's Run button does the same.
                const titleRun = j.page.locator('.editor-actions .action-label, .title-actions .action-label')
                    .filter({ has: j.page.locator('[class*="codicon-play"], [class*="debug-start"], [class*="run"]') })
                    .or(j.page.getByRole('button', { name: /^Run( Integration)?\b/ })).first();
                if (await titleRun.isVisible().catch(() => false)) {
                    await j.click(titleRun);
                } else {
                    await ui.sidebar('OrderProcessor');
                    await ui.clickButton(await ui.view(/Add Artifact/i), 'Run');
                }
                await waitForTerminal(j, /Running executable/, 300000);
                await waitForPort(port);
                const response = await httpPost(`http://localhost:${port}/order`,
                    { id: 'ORD-1', customerId: 'CUS-9', customerEmail: 'ann@example.com', total: 4500 });
                expect(response.status).toBeLessThan(300);
                // A string payload comes back as plain text, as the page shows it.
                workflowId = response.body.trim().replace(/^"|"$/g, '');
                await waitForTerminal(j, /Waiting for payment/, 60000);
            });
            await j.step('10.6', 'Confirm the payment with the workflow ID from the previous response.', async () => {
                const response = await httpPost(`http://localhost:${port}/order/${workflowId}/payment`, true);
                expect(response.status).toBeLessThan(300);
                await waitForTerminal(j, /Email sent to ann@example\.com/, 60000);
            });
        });
    });
}

// Steps 8.5 and 9.2. The page sets the method on the resource form; the UI asks for it first, in a "Select HTTP Method
// to Add" list, and opens the form for that method.
async function chooseHttpMethod(j: DocJourney, ui: Integrator, method: string, step: string) {
    const frame = await ui.view();
    const picker = frame.getByText('Select HTTP Method to Add');
    if (await picker.waitFor({ state: 'visible', timeout: 10000 }).then(() => true).catch(() => false)) {
        // Only inside the method list: the service view also shows each resource's method badge.
        const list = frame.getByTestId('side-panel').filter({ hasText: 'Select HTTP Method to Add' }).last();
        const option = list.getByText(method, { exact: true }).first();
        await j.click(option);
        // The handler sits on the card around the text; when a click on the text does not reach it, the
        // card is clicked directly.
        const formOpen = frame.getByText('New Resource Configuration');
        for (const target of [option, option.locator('xpath=..'), option.locator('xpath=../..')]) {
            if (await formOpen.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
                break;
            }
            await target.dispatchEvent('click').catch(() => undefined);
        }
        // The resource form opens over the list; the list stays behind it.
        await frame.getByText('New Resource Configuration').waitFor({ state: 'visible', timeout: 15000 });
        if (step === '8.5') {
            await j.finding({
                kind: 'behaviour',
                says: '**+ Add Resource**, then "Set **HTTP Method** to **POST** and **Resource Path** to `.`"',
                actual: '**+ Add Resource** first opens a **Select HTTP Method to Add** list; picking **POST** there opens **New Resource Configuration** with the method already set',
                suggestion: 'Say "Click **+ Add Resource**, then **POST**. Set **Resource Path** to `.`." Same for Step 9.2.',
            });
        }
        return;
    }
    throw new Error('the Select HTTP Method to Add list did not open');
}

// Steps 3.3, 6.2 and 7.2: the entry that opens the Workflow Activity form.
async function openCreateActivity(j: DocJourney, ui: Integrator, firstTime: boolean) {
    const panel = await ui.panel('Current Integration');
    const createLink = panel.getByText(/^\+?\s*Create Activity$/);
    if (firstTime && await createLink.first().isVisible().catch(() => false)) {
        await j.click(createLink.first());
        return;
    }
    if (firstTime) {
        await j.finding({
            kind: 'label',
            says: 'Under **Current Integration**, click **+ Create Activity**',
            actual: 'There is no "+ Create Activity" entry; the **Current Integration** header has a **+** icon (tooltip "Create Activity")',
            suggestion: 'Say "click the **+** on the **Current Integration** header", as Step 6 does.',
        });
    }
    await j.click(panel.getByTestId('node-list-action-onAddFunction'));
}

// Steps 3.4 to 3.6 (and their repeats in Steps 6.3 and 7.3): the Workflow Activity form.
async function createActivity(j: DocJourney, ui: Integrator, step: string, name: string, params: Array<[string, string]>) {
    await j.step(`${step}.4`, `In the **Workflow Activity** form, set **Activity Name** to \`${name}\`.`, async () => {
        const panel = await ui.panel(/Activity Name/);
        const box = (await ui.field(panel, 'Activity Name'));
        const value = async () => box.inputValue().catch(() => box.locator('input').inputValue()).catch(() => '');
        // The form fills itself from a template that can arrive after it opens, overwriting anything typed
        // before then; wait until the default has held for a second.
        let last = await value();
        for (let stable = 0, i = 0; stable < 4 && i < 60; i++) {
            await j.page.waitForTimeout(250);
            const now = await value();
            stable = now === last && now !== '' ? stable + 1 : 0;
            last = now;
        }
        await ui.fill(panel, 'Activity Name', name);
        for (let attempt = 0; attempt < 3; attempt++) {
            await j.page.waitForTimeout(1500);
            const now = await value();
            if (now === name) {
                break;
            }
            await ui.fill(panel, 'Activity Name', name);
        }
    });
    for (const [type, paramName] of params) {
        await j.step(`${step}.5`, `Under **Parameters**, click **+ Add Parameter**, set **Type** to \`${type}\` and **Name** to \`${paramName}\`, then click **Add**.`, async () => {
            const panel = await ui.panel();
            await ui.clickText(panel, '+ Add Parameter');
            await ui.fill(panel, 'Type', type);
            await ui.dismiss();
            await ui.fill(panel, 'Name', paramName);
            // Add reads the sub-form's state, which commits a beat after typing; a press before that is
            // ignored and leaves the sub-form open with Save disabled.
            const cancel = panel.getByRole('button', { name: 'Cancel' });
            for (let attempt = 0; attempt < 3; attempt++) {
                await j.page.waitForTimeout(600);
                await ui.clickButton(panel, 'Add');
                if (await cancel.waitFor({ state: 'hidden', timeout: 5000 }).then(() => true).catch(() => false)) {
                    break;
                }
            }
            await expect(cancel).toBeHidden();
        });
    }
    await j.step(`${step}.6`, 'Leave **Return Type** empty. Click **Save**.', async () => {
        const panel = await ui.panel();
        const nameBox = await ui.field(panel, 'Activity Name');
        const value = () => nameBox.locator('input').inputValue().catch(() => nameBox.inputValue()).catch(() => '');
        let reported = false;
        // A late diagram refresh re-initialises the form and resets the name; report it once, re-enter it and save again.
        for (let attempt = 0; attempt < 3; attempt++) {
            const current = await value();
            if (current !== name) {
                if (!reported) {
                    reported = true;
                    await j.finding({
                        kind: 'behaviour',
                        says: `Set **Activity Name** to \`${name}\`, add the parameter, then **Save**`,
                        actual: `The name was reset to \`${current}\` while the form was open (a diagram refresh from the previous save re-initialised the form)`,
                        suggestion: 'Product bug: an open Workflow Activity form should keep what the user typed when the diagram refreshes.',
                    });
                }
                await ui.fill(panel, 'Activity Name', name);
                await j.page.waitForTimeout(1500);
                continue;
            }
            await ui.clickButton(panel, 'Save');
            const listed = await (await ui.view()).getByText(name, { exact: true }).first()
                .waitFor({ state: 'visible', timeout: 60000 }).then(() => true).catch(() => false);
            if (listed) {
                return;
            }
        }
        throw new Error(`the ${name} activity was not created`);
    });
}
