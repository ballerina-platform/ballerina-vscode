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

// "Start a Workflow": add Run Workflow to a resource and check its form against the page's field table.

export default function createTests() {
    test.describe.serial('Start a Workflow Docs Tests', () => {
        initTest(true, true, undefined, undefined, ORDER_TEMPLATE);

        test('Start a Workflow', async () => {
            const j = new DocJourney({ title: 'Start a Workflow', slug: `${WORKFLOW_ARTICLES}/start` });
            const ui = new Integrator(j);
            const source = projectSources();
            let view = await openArtifact(j, ui, 'OrderProcessor', '.');
            await j.step('1', 'In the trigger artifact flow design, click **+**.', async () => {
                await ui.plusBelow(view, 'Start');
            });
            await j.step('2', 'In the node panel, under **Workflow**, click **Run Workflow**.', async () => {
                await ui.palette(['Workflow', 'Run Workflow']);
            });
            await j.step('3', 'Fill in the form: **Input**, **Workflow ID Variable Name**.', async () => {
                // The page goes straight to the form; the panel first lists the workflows to start.
                const panel = await ui.panel();
                if (await panel.getByText('orderWorkflow', { exact: true }).first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false)
                    && !await panel.getByText(/Workflow ID Variable Name/i).first().isVisible().catch(() => false)) {
                    await j.finding({
                        kind: 'gap',
                        says: 'Click **Run Workflow**, then fill in the form',
                        actual: 'Clicking **Run Workflow** first lists the project\'s workflows; the form opens after one is picked',
                        suggestion: 'Add "Select the workflow to start, for example `orderWorkflow` under **Current Integration**", as the quickstart\'s Step 8.9 does.',
                    });
                    await ui.clickText(panel, 'orderWorkflow');
                }
                const form = await ui.panel(/Workflow ID Variable Name/i);
                await ui.expectFields(form, [{ label: 'Input' }, { label: 'Workflow ID Variable Name' }]);
                await ui.mode(form, 'Input', 'Expression').catch(() => undefined);
                await ui.pick(form, 'Input', ['Inputs', 'payload']);
            });
            await j.step('4', 'Click **Save**.', async () => {
                await ui.saveForm();
                await expect.poll(source, { timeout: 60000 }).toMatch(/workflow:run\(orderWorkflow, payload\)/);
            });
        });
    });
}
