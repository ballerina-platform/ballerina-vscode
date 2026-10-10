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

// "Run a Durable Agent": add the step to a resource and check its form against the page's field table.

export default function createTests() {
    test.describe.serial('Run a Durable Agent Docs Tests', () => {
        initTest(true, true, undefined, undefined, AGENT_TEMPLATE);

        test('Run a Durable Agent', async () => {
            const j = new DocJourney({ title: 'Run a Durable Agent', slug: `${AGENT_ARTICLES}/run-durable-agent` });
            const ui = new Integrator(j);
            const source = projectSources();
            const view = await openArtifact(j, ui, 'ClaimHandler', 'claim');
            await j.step('1', 'On the flow diagram, click **+**.', async () => {
                await ui.plusBelow(view, 'Start');
            });
            await j.step('2', 'In the node panel, under **Workflow**, click **Run Durable Agent**.', async () => {
                await ui.palette(['Workflow', 'Run Durable Agent']);
            });
            await j.step('3', 'Fill in the form: **Durable Agentic Workflow**, **Query**, **Input**, **Instance ID Variable Name**.', async () => {
                const panel = await ui.panel(/Query/);
                await ui.expectFields(panel, [{ label: 'Durable Agentic Workflow' }, { label: 'Query' }, { label: 'Input' }, { label: 'Instance ID Variable Name' }]);
                await selectAgent(j, ui, panel, view);
                await ui.fill(panel, 'Query', 'Start a new claim workflow');
                await ui.dismiss();
                await ui.pick(panel, 'Input', ['Inputs', 'payload']);
            });
            await j.step('4', 'Click **Save**.', async () => {
                await ui.saveForm();
                await expect.poll(source, { timeout: 60000 }).toMatch(/claimAgent\.run\(/);
            });
        });
    });
}
