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
import { ORDER_TEMPLATE, WORKFLOW_ARTICLES, projectSources } from '../common';
import { DocJourney } from '../doc-journey';
import { Integrator } from '../integrator';

// "Create a Workflow": a second workflow in the order project, input type picked from the list.

export default function createTests() {
    test.describe.serial('Create a Workflow Docs Tests', () => {
        initTest(true, true, undefined, undefined, ORDER_TEMPLATE);

        test('Create a Workflow', async () => {
            const j = new DocJourney({ title: 'Create a Workflow', slug: `${WORKFLOW_ARTICLES}/create` });
            const ui = new Integrator(j);
            const source = projectSources();
            await j.page.getByRole('treeitem', { name: /^OrderProcessor/ }).first().waitFor({ state: 'visible', timeout: 180000 });
            await ui.sidebar('OrderProcessor');
            let view = await ui.view(/Add Artifact/i, 120000);
            await j.step('1', 'In the design view, click **+ Add Artifact**.', async () => {
                await ui.clickButton(view, '+ Add Artifact');
            });
            await j.step('2', 'On the **Artifacts** page, under **Durable Workflow**, click **Durable Workflow**.', async () => {
                view = await ui.view('Durable Workflow');
                view = await ui.artifact(view, 'Durable Workflow', 'Durable Workflow', 'workflow');
            });
            await j.step('3', 'Fill in the **Create New Durable Workflow** form: **Name**, **Workflow Input Data Type**.', async () => {
                await ui.expectFields(view.locator('body'), [{ label: 'Name' }, { label: 'Workflow Input Data Type' }]);
                await ui.fill(view, 'Name', 'refundWorkflow');
                await j.click(await ui.field(view, 'Workflow Input Data Type'));
                await ui.clickText(view, 'OrderInfo');
            });
            await j.step('4', 'Click **Create**. The workflow opens on its own diagram with a single **Start** node and appears under **Workflows** in the sidebar.', async () => {
                await ui.dismiss();
                await j.clickUntil(await ui.button(view, 'Create'), view.getByText('Start', { exact: true }).filter({ visible: true }), 10000);
                view = await ui.view(/Start/, 120000);
                const listed = await ui.treeRow('refundWorkflow');
                console.log(`  ℹ️  refundWorkflow ${listed ? 'is' : 'is not'} in this build's project tree`);
                await expect.poll(source, { timeout: 60000 }).toMatch(/function refundWorkflow\(workflow:Context ctx, OrderInfo \w+\)/);
            });
            await j.step('design', 'The node panel holds **Workflow** > **Steps** (Call Activity, Await Human Task, Await Data Event, Sleep) and **Workflow** > **Workflow Functions**.', async () => {
                await ui.plusBelow(view, 'Start');
                const panel = await ui.panel();
                await ui.palette(['Workflow']);
                const shown = await panel.innerText();
                const documented = ['Steps', 'Workflow Functions', 'Call Activity', 'Await Human Task', 'Await Data Event', 'Sleep'];
                const absent = documented.filter((d) => !new RegExp(`(^|\\n)\\W*${d}\\W*($|\\n)`).test(shown));
                if (absent.length > 0) {
                    await j.finding({
                        kind: 'label',
                        says: `The **Workflow** group lists ${documented.map((d) => `**${d}**`).join(', ')}`,
                        actual: `Not in the node panel by those names: ${absent.map((d) => `**${d}**`).join(', ')}. The panel shows: ${shown.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 20).join(', ')}`,
                        suggestion: 'Use the names the node panel shows.',
                    });
                }
                await ui.dismiss();
            });
        });
    });
}
