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
import { AGENT_ARTICLES, AGENT_TEMPLATE, openArtifact, projectSources, selectAgent } from '../common';
import { DocJourney } from '../doc-journey';
import { Integrator } from '../integrator';

// "Get an Agent Result": add the step to a resource and check its form against the page's field table.

export default function createTests() {
    test.describe.serial('Get an Agent Result Docs Tests', () => {
        initTest(true, true, undefined, undefined, AGENT_TEMPLATE);

        test('Get an Agent Result', async () => {
            const j = new DocJourney({ title: 'Get an Agent Result', slug: `${AGENT_ARTICLES}/get-agent-result` });
            const ui = new Integrator(j);
            const source = projectSources();
            const view = await openArtifact(j, ui, 'ClaimHandler', '[string workflowId]/result');
            await j.step('1', 'On the flow diagram, click **+**.', async () => {
                await ui.plusBelow(view, 'Start');
            });
            await j.step('2', 'In the node panel, under **Workflow**, click **Get Agent Result**.', async () => {
                await ui.palette(['Workflow', 'Get Agent Result']);
            });
            await j.step('3', 'Fill in the form: **Durable Agentic Workflow**, **Instance Id**, **Wait For Result**, **Result**, **Result Type**.', async () => {
                const panel = await ui.panel(/Instance Id/i);
                await ui.expectFields(panel, [{ label: 'Durable Agentic Workflow' }, { label: 'Instance Id' }, { label: 'Wait For Result' }, { label: 'Result' }, { label: 'Result Type' }]);
                await selectAgent(j, ui, panel, view);
                await ui.pick(panel, 'Instance Id', ['Inputs', 'workflowId']);
            });
            await j.step('4', 'Click **Save**.', async () => {
                await ui.saveForm();
                await expect.poll(source, { timeout: 60000 }).toMatch(/claimAgent\.(waitForResult|getResult)\(/);
            });
        });
    });
}
