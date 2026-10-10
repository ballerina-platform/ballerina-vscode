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

// "Send a Data Event": add Send Data Event to the payment resource and check its form.

export default function createTests() {
    test.describe.serial('Send a Data Event Docs Tests', () => {
        initTest(true, true, undefined, undefined, ORDER_TEMPLATE);

        test('Send a Data Event', async () => {
            const j = new DocJourney({ title: 'Send a Data Event', slug: `${WORKFLOW_ARTICLES}/send-data-event` });
            const ui = new Integrator(j);
            const source = projectSources();
            const view = await openArtifact(j, ui, 'OrderProcessor', '[string orderId]/payment');
            await j.step('1', 'In the trigger artifact flow design, click **+**.', async () => {
                await ui.plusBelow(view, 'Start');
            });
            await j.step('2', 'In the node panel, under **Workflow**, click **Send Data Event**.', async () => {
                await ui.palette(['Workflow', { doc: 'Send Data Event', ui: ['Send Data'] }]);
            });
            await j.step('3', 'Fill in the form: **Workflow Name**, **Target Workflow Id**, **Data Name**, **Data**.', async () => {
                const panel = await ui.panel(/Workflow/);
                await ui.expectFields(panel, [{ label: 'Workflow Name' }, { label: 'Target Workflow Id' }, { label: 'Data Name' }, { label: 'Data' }]);
                await ui.select(panel, view, 'Workflow Name', 'orderWorkflow');
                await ui.pick(panel, 'Target Workflow Id', ['Inputs', 'orderId']);
                await ui.select(panel, view, 'Data Name', 'payment');
                await ui.fill(panel, 'Data', 'true');
                await ui.dismiss();
            });
            await j.step('4', 'Click **Save**.', async () => {
                await ui.saveForm();
                await expect.poll(source, { timeout: 60000 }).toMatch(/workflow:sendData\(orderWorkflow, orderId, "payment", true\)/);
            });
        });
    });
}
