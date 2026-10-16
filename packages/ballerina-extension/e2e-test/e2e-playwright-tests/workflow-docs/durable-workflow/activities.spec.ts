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
import { initTest } from '../../utils/helpers';
import { ORDER_TEMPLATE, WORKFLOW_ARTICLES, openArtifact, projectSources } from '../common';
import { DocJourney } from '../doc-journey';
import { Integrator } from '../integrator';

// "Activities": create one from the sidebar, create one from a connection, and the call form's fields.

export default function createTests() {
    test.describe.serial('Activities Docs Tests', () => {
        initTest(true, true, undefined, undefined, ORDER_TEMPLATE);

        test('Activities', async () => {
            const j = new DocJourney({ title: 'Activities', slug: `${WORKFLOW_ARTICLES}/activities` });
            const ui = new Integrator(j);
            const source = projectSources();
            let view = await openArtifact(j, ui, 'OrderProcessor', 'shipmentWorkflow', 'reserveInventory');

            await j.step('scratch', 'To create an activity, click **+** on **Workflow Activities** in the left sidebar. The **Create Activity** form: **Activity Name**, **Description**, **Parameters**, **Return Type**. Click **Create**.', async () => {
                const row = await ui.treeRow('Workflow Activities');
                if (row) {
                    await j.hover(row);
                    const actions = row.locator('.action-label');
                    const labels = await actions.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
                    await j.click(actions.nth(Math.max(0, labels.findIndex((l) => /add|create|\+/i.test(l)))));
                } else {
                    // Trees without the workflow groups have no Workflow Activities row; the Activities panel opens the same form.
                    await ui.plusBelow(view, 'reserveInventory');
                    await ui.palette(['Workflow', 'Steps', 'Call Activity']);
                    const list = await ui.panel('Current Integration');
                    const add = list.getByTestId('node-list-action-onAddFunction').first();
                    const name = (await ui.view()).getByRole('textbox', { name: /Activity Name/ }).first();
                    await j.click(add);
                    // The form can take a while to open; a second click on the list would close it again.
                    if (!await name.waitFor({ state: 'visible', timeout: 30000 }).then(() => true, () => false)
                        && await add.isVisible().catch(() => false)) {
                        await add.dispatchEvent('click');
                    }
                }
                view = await ui.view(/Activity Name/i, 60000);
                const form = view.locator('body');
                await ui.expectFields(form, [{ label: 'Activity Name' }, { label: 'Description' }, { label: 'Parameters' }, { label: 'Return Type' }]);
                if (!await view.getByText(/^\s*Create Activity\s*$/).first().isVisible().catch(() => false)) {
                    const title = (await view.getByRole('heading').first().innerText().catch(() => '')).trim();
                    await j.finding({
                        kind: 'label',
                        says: 'The **Create Activity** form',
                        actual: `The form is titled **${title || 'something else'}**`,
                        suggestion: `Call it the **${title}** form.`,
                    });
                }
                const create = await ui.button(view, { doc: 'Create', ui: ['Save'] });
                await ui.fillAccepted(view, 'Activity Name', 'chargeCard', create);
                await j.click(create);
                await expect.poll(source, { timeout: 60000 }).toMatch(/function chargeCard\(/);
            });

            await j.step('connection.1', 'On the workflow diagram, click **+**, then click **Call Activity**. The **Activities** panel opens.', async () => {
                const onWorkflow = await (await ui.view()).getByText('reserveInventory').filter({ visible: true }).first()
                    .isVisible().catch(() => false);
                if (!onWorkflow) {
                    await j.finding({
                        kind: 'gap',
                        says: '"On the workflow diagram, click **+**"',
                        actual: 'After **Create**, the editor shows the new `chargeCard` activity\'s own diagram, not the workflow',
                        suggestion: 'Start this step with "Go back to the workflow: select it under **Workflows** in the sidebar".',
                    });
                }
                view = await openArtifact(j, ui, 'OrderProcessor', 'shipmentWorkflow', 'reserveInventory');
                await ui.plusBelow(view, 'reserveInventory');
                await ui.palette(['Workflow', 'Steps', 'Call Activity']);
            });
            await j.step('connection.2', 'In the **Current Integration** header, click the plug icon.', async () => {
                const panel = await ui.panel('Current Integration');
                await j.click(panel.getByTestId('node-list-action-onAdd'));
            });
            await j.step('connection.3-4', 'The **Connections** panel lists the project\'s connections. Click a connection to expand its operations, then click the operation the activity should wrap, **Get** here.', async () => {
                const panel = await ui.panel('Connections');
                await ui.clickText(panel, 'billingApi');
                await ui.clickText(panel, { doc: 'Get', ui: ['get', 'GET'] });
            });
            await j.step('connection.5', 'Fill in the form: **Activity Name**, **Description**, **Choose what the activity takes as input**, **Connection As Parameter**, **Return Type**.', async () => {
                view = await ui.view(/Activity Name/i);
                await ui.expectFields(view.locator('body'), [
                    { label: 'Activity Name' }, { label: 'Description' }, { label: 'Choose what the activity takes as input' },
                    { label: 'Connection As Parameter' }, { label: 'Return Type' },
                ]);
                await ui.fillAccepted(view, 'Activity Name', 'billingGet', await ui.button(view, 'Create Activity'));
            });
            await j.step('connection.6', 'Click **Create Activity**.', async () => {
                await ui.clickButton(view, 'Create Activity');
                await expect.poll(source, { timeout: 90000 }).toMatch(/function billingGet\(/);
            });

            await j.step('call', 'The **Call Activity** form: **Activity Arguments**, **Retry Policy**, **Result**, **Result Type**, and **Check Error** under **Advanced Configurations**.', async () => {
                // The Activities panel stays open after Create Activity; clicking chargeCard there opens the call form.
                view = await ui.view();
                // chargeCard is not on the diagram, so a visible one is the panel's card.
                let card = view.getByText('chargeCard', { exact: true }).filter({ visible: true }).first();
                if (!await card.isVisible().catch(() => false)) {
                    // After the connection flow the diagram's + stops opening the node panel; reloading the workflow fixes it.
                    await ui.sidebar('orderWorkflow');
                    await ui.view(/Start/, 60000);
                    view = await openArtifact(j, ui, 'OrderProcessor', 'shipmentWorkflow', 'reserveInventory');
                    await ui.plusBelow(view, 'reserveInventory');
                    await ui.palette(['Workflow', 'Steps', 'Call Activity']);
                    card = (await ui.panel('chargeCard')).getByText('chargeCard', { exact: true }).first();
                }
                await j.click(card);
                const panel = await ui.panel(/Retry Policy/);
                await ui.expectFields(panel, [{ label: 'Retry Policy' }, { label: 'Check Error', advanced: true }]);
                const policies = await panel.getByText(/^\s*Approval Policy\s*$/).first().isVisible().catch(() => false);
                if (policies) {
                    await j.finding({
                        kind: 'gap',
                        says: 'The **Call Activity** field table lists **Activity Arguments**, **Retry Policy**, **Result**, **Result Type** and **Check Error**',
                        actual: 'The form also has an **Approval Policy** field, above **Retry Policy**, which the table does not mention',
                        suggestion: 'Add **Approval Policy** (No Approval, Human Approval, From Expression) to the table and link to the approval-gate section.',
                    });
                }
            });
        });
    });
}
