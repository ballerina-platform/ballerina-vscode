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

// "Management API", "From the designer": the overview checkbox that adds the REST module.

export default function createTests() {
    test.describe.serial('Management API Docs Tests', () => {
        initTest(true, true, undefined, undefined, ORDER_TEMPLATE);

        test('Management API', async () => {
            const j = new DocJourney({ title: 'Management API', slug: `${WORKFLOW_ARTICLES}/management-api` });
            const ui = new Integrator(j);
            const source = projectSources();
            await j.page.getByRole('treeitem', { name: /^OrderProcessor/ }).first().waitFor({ state: 'visible', timeout: 180000 });
            let view = await ui.view();
            await j.step('1', 'Open the integration overview.', async () => {
                await ui.sidebar('OrderProcessor');
                view = await ui.view(/Add Artifact/i, 120000);
            });
            await j.step('2', 'In the right panel, below **Integration Control Plane**, find the **Workflow** section.', async () => {
                await expect(view.getByRole('heading', { name: 'Integration Control Plane' })).toBeVisible();
                await expect(view.getByRole('heading', { name: 'Workflow', exact: true })).toBeVisible();
            });
            await j.step('3', 'Select **Enable Workflow Management REST API**. Selecting it adds the `ballerina/workflow.management.rest` import to `main.bal`.', async () => {
                await j.click(view.getByRole('checkbox', { name: /Enable Workflow Management REST API/ }));
                await expect.poll(source, { timeout: 60000 }).toMatch(/import ballerina\/workflow\.management\.rest/);
            });
        });
    });
}
