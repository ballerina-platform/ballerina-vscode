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

// "Await Data Events": pause shipmentWorkflow on a data event bounded by a timeout.

export default function createTests() {
    test.describe.serial('Await Data Events Docs Tests', () => {
        initTest(true, true, undefined, undefined, ORDER_TEMPLATE);

        test('Await Data Events', async () => {
            const j = new DocJourney({ title: 'Await Data Events', slug: `${WORKFLOW_ARTICLES}/data-events` });
            const ui = new Integrator(j);
            const source = projectSources();
            const view = await openArtifact(j, ui, 'OrderProcessor', 'shipmentWorkflow', 'reserveInventory');
            await j.step('1', 'On the workflow diagram, click **+** where the workflow should wait.', async () => {
                await ui.plusBelow(view, 'reserveInventory');
            });
            await j.step('2', 'In the node panel, under **Workflow** > **Steps**, click **Await Data Event**. The **Await Data** form opens.', async () => {
                await ui.palette(['Workflow', 'Steps', { doc: 'Await Data Event', ui: 'Await Data' }]);
            });
            await j.step('3', 'Fill in the form: **Data Receive Variable Name**, **Data Type**, **Data Name**; **Min Count** and **Timeout** under **Advanced Configurations**.', async () => {
                const panel = await ui.panel(/Data/);
                await ui.expectFields(panel, [
                    { label: 'Data Receive Variable Name' }, { label: 'Data Type' }, { label: 'Data Name' },
                    { label: 'Min Count', advanced: true }, { label: 'Timeout', advanced: true },
                ]);
                await ui.fill(panel, 'Data Receive Variable Name', 'shipped');
                await ui.fill(panel, 'Data Type', 'boolean');
                await ui.dismiss();
                await ui.fill(panel, 'Data Name', 'shipped');
                await ui.dismiss();
            });
            await j.step('4', 'Click **Add** to commit the **Data Waits** entry. Use **+ Add Data Waits** to wait on more than one event.', async () => {
                const panel = await ui.panel();
                await ui.clickButton(panel, 'Add');
                // The product must offer another wait; only its wording may differ from the page's.
                await j.resolve({ doc: '+ Add Data Waits' },
                    (name) => panel.getByText(new RegExp(`^\\W*${name.replace(/^\+\s*/, '')}$`, 'i')));
            });
            await j.step('5', 'Click **Save**.', async () => {
                await ui.saveForm();
                await expect.poll(source, { timeout: 60000 }).toMatch(/future<boolean> shipped/);
            });
        });
    });
}
