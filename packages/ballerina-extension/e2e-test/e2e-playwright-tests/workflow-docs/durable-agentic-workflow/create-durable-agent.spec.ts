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
import { AGENT_ARTICLES, AGENT_TEMPLATE, openArtifact, projectSources } from '../common';
import { DocJourney } from '../doc-journey';
import { Integrator } from '../integrator';

// "Create a Durable Agent": the artifact, the Configure Agent form, and each capability's register form.

export default function createTests() {
    test.describe.serial('Create a Durable Agent Docs Tests', () => {
        initTest(true, true, undefined, undefined, AGENT_TEMPLATE);

        test('Create a Durable Agent', async () => {
            const j = new DocJourney({ title: 'Create a Durable Agent', slug: `${AGENT_ARTICLES}/create-durable-agent` });
            const ui = new Integrator(j);
            const source = projectSources();
            let view = await openArtifact(j, ui, 'ClaimHandler', 'ClaimHandler', /Add Artifact/i);
            await j.step('add.1-2', 'In the design view, click **+ Add Artifact**. On the **Artifacts** page, under **Durable Workflow**, click **Durable Agentic Workflow**.', async () => {
                await ui.clickButton(view, '+ Add Artifact');
                view = await ui.view('Durable Agentic Workflow');
                view = await ui.artifact(view, 'Durable Workflow', 'Durable Agentic Workflow', 'durable-agent');
            });
            await j.step('add.3', 'Set **Name**, then click **Create Agent**. The agent opens on its own model and appears under **Workflows** in the sidebar.', async () => {
                await ui.fill(view, 'Name', 'travelAgent');
                // Each prompt field opens a helper; close it before the next field, or typing lands in the helper.
                await ui.dismiss();
                await ui.fill(view, 'Role', 'Travel assistant');
                await ui.dismiss();
                await ui.fill(view, 'Instructions', 'Book travel.');
                await ui.dismiss();
                await ui.clickButton(view, 'Create Agent');
                await expect.poll(source, { timeout: 90000 }).toMatch(/workflow:DurableAgent travelAgent/);
                // Only a tree with the workflow groups lists agents; without them there is no group to check.
                const row = await ui.treeRow('travelAgent');
                const group = row && await row.evaluate((r) => {
                    const level = Number(r.getAttribute('aria-level') ?? 0);
                    let prev = r.previousElementSibling;
                    while (prev && Number(prev.getAttribute('aria-level') ?? 0) >= level) {
                        prev = prev.previousElementSibling;
                    }
                    return (prev?.getAttribute('aria-label') ?? '').split(/[,\s]/)[0];
                });
                if (group && group !== 'Workflows') {
                    await j.finding({
                        kind: 'label',
                        says: 'The agent appears under **Workflows** in the sidebar',
                        actual: `It appears under **${group}**`,
                        suggestion: `Say "appears under **${group}** in the sidebar".`,
                    });
                }
            });
            // The agent this journey created, so the Configure Agent check cannot pass on the template's agent.
            view = await openArtifact(j, ui, 'ClaimHandler', 'travelAgent', /travelAgent/);
            await j.step('configure', 'Click the agent node to open the **Configure Agent** form: **Role**, **Instructions**, **Query**, **Maximum Iterations**.', async () => {
                // The node's test id sits on a wrapper wider than the box; its centre can be empty canvas.
                const node = view.getByTestId('durable-agent-run-node').first();
                await j.clickUntil(node.getByText('travelAgent', { exact: true }).first(),
                    view.getByText('Configure Agent').filter({ visible: true }));
                const panel = await ui.panel(/Configure Agent/);
                await ui.expectFields(panel, [{ label: 'Role' }, { label: 'Instructions' }, { label: 'Query' }, { label: 'Maximum Iterations' }]);
                await ui.dismiss();
                await j.click((await ui.view()).getByTestId('close-panel-btn').first()).catch(() => undefined);
            });
            // The remaining checks open registration forms from entries the new agent does not have yet (`payClaim`);
            // the template's claimAgent carries them.
            view = await openArtifact(j, ui, 'ClaimHandler', 'claimAgent', /claimAgent/);
            await j.step('activities', 'Click **+** on the activity anchor, click `payClaim`: **Retry Policy**; under **Advanced Configurations** **Activity Name**, **Activity Description**, **Requires Approval**, **Reviewer Roles**.', async () => {
                await j.click(view.getByTestId('durable-agent-affordance-activity').first());
                await ui.clickText(await ui.panel('payClaim'), 'payClaim');
                const panel = await ui.panel(/Retry Policy/);
                await ui.expectFields(panel, [{ label: 'Retry Policy' }, { label: 'Activity Name', advanced: true },
                    { label: 'Activity Description', advanced: true }, { label: 'Requires Approval', advanced: true }, { label: 'Reviewer Roles', advanced: true }]);
                await j.click((await ui.view()).getByTestId('close-panel-btn').first()).catch(() => ui.dismiss());
            });
            await j.step('events', 'Click **+** on the event anchor at the bottom left of the agent node. The **Register Data Event** form: **Event Name**, **Request Type**, **Response Type**, **Cardinality**.', async () => {
                await j.click(view.getByTestId('durable-agent-affordance-event').first());
                const panel = await ui.panel();
                await ui.expectFields(panel, [{ label: 'Event Name' }, { label: 'Request Type' }, { label: 'Response Type' }, { label: 'Cardinality' }]);
                await j.click((await ui.view()).getByTestId('close-panel-btn').first()).catch(() => ui.dismiss());
            });
            await j.step('humanTasks', 'Click **+** on the human task anchor. The **Register HumanTask** form: **Task Name**, **User Roles**, **Title**, **Description**, **Timeout**, **Completion Type**.', async () => {
                await j.click(view.getByTestId('durable-agent-affordance-humanTask').first());
                const panel = await ui.panel();
                await ui.expectFields(panel, [{ label: 'Task Name' }, { label: 'User Roles' }, { label: 'Title' }, { label: 'Description' },
                    { label: 'Timeout' }, { label: 'Completion Type' }]);
                await j.click((await ui.view()).getByTestId('close-panel-btn').first()).catch(() => ui.dismiss());
            });
        });
    });
}
