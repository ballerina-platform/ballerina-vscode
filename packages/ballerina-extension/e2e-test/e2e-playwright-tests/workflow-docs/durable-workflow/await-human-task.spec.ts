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

// "Await Human Task": the onboarding workflow asks an HR lead to assign a team.

export default function createTests() {
    test.describe.serial('Await Human Task Docs Tests', () => {
        initTest(true, true, undefined, undefined, ORDER_TEMPLATE);

        test('Await Human Task', async () => {
            const j = new DocJourney({ title: 'Await Human Task', slug: `${WORKFLOW_ARTICLES}/await-human-task` });
            const ui = new Integrator(j);
            const source = projectSources();
            const view = await openArtifact(j, ui, 'OrderProcessor', 'onboardingWorkflow');
            await j.step('1', 'On the workflow diagram, click **+** where the workflow should wait.', async () => {
                await ui.plusBelow(view, 'Start');
            });
            await j.step('2', 'In the node panel, under **Workflow** > **Steps**, click **Await Human Task**.', async () => {
                await ui.palette(['Workflow', 'Steps', { doc: 'Await Human Task', ui: 'Human Task' }]);
            });
            await j.step('3', 'Fill in the form: **Task Name**, **User Roles**, **Task Input**, **Title**, **Description**, **Timeout**, **Result**, **Completion Type**.', async () => {
                const panel = await ui.panel();
                await ui.expectFields(panel, [
                    { label: 'Task Name' }, { label: 'User Roles' }, { label: 'Task Input' }, { label: 'Result' },
                    { label: 'Completion Type' },
                    { label: 'Title', advanced: true }, { label: 'Description', advanced: true }, { label: 'Timeout', advanced: true },
                ]);
                await ui.fill(panel, 'Task Name', 'Assign Employee to Team');
                await ui.dismiss();
                const roles = await ui.field(panel, 'User Roles');
                await j.click(roles);
                await j.typeFocused('HRManager', false);
                await j.page.keyboard.press('Enter');
                const taskInput = await panel.getByText(/^Task Input\*?$/).first().locator('xpath=..').innerText().catch(() => '');
                if (/\*/.test(taskInput)) {
                    await j.finding({
                        kind: 'behaviour',
                        says: '**Task Input** is optional (Required: No)',
                        actual: 'The form marks **Task Input** required: a task with nothing to show must say so with `{}`',
                        suggestion: 'Mark **Task Input** required in the table and say to enter `{}` when there is nothing to show.',
                    });
                }
                await ui.mode(panel, 'Task Input', 'Expression');
                // Expression mode starts from `{}` and an emptied field returns to it, so the value is typed over it.
                await ui.fill(panel, 'Task Input', 'input');
                await ui.fill(panel, 'Result', 'assignment');
                await j.click(await ui.field(panel, 'Completion Type'));
                await ui.createRecordType(await ui.view(), 'TeamAssignment', [['team', 'string'], ['lead', 'string']], '3.type');
            });
            await j.step('4', 'Click **Save**.', async () => {
                await ui.dismiss();
                await ui.saveForm();
                await expect.poll(source, { timeout: 60000 }).toMatch(/TeamAssignment assignment = check/);
            });
        });
    });
}
