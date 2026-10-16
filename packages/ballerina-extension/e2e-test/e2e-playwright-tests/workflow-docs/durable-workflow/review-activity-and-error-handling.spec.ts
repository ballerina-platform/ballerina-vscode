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

// "Error Handling and Review Activities": the retry policies on a call, then handling a failure in the flow.

export default function createTests() {
    test.describe.serial('Error Handling and Review Activities Docs Tests', () => {
        initTest(true, true, undefined, undefined, ORDER_TEMPLATE);

        test('Error Handling and Review Activities', async () => {
            const j = new DocJourney({ title: 'Error Handling and Review Activities', slug: `${WORKFLOW_ARTICLES}/review-activity-and-error-handling` });
            const ui = new Integrator(j);
            const source = projectSources();
            let view = await openArtifact(j, ui, 'OrderProcessor', 'fulfilmentWorkflow', 'sendConfirmationEmail');
            await j.step('policies', 'Every activity call takes a **Retry Policy**: **No Automatic Retry**, **Auto Retry**, **Human Review**.', async () => {
                await ui.clickText(view, 'sendConfirmationEmail');
                const panel = await ui.panel(/Retry Policy/);
                const retry = await ui.field(panel, 'Retry Policy');
                await j.click(retry);
                const options = (await (await ui.view()).locator('[role=option], vscode-option').filter({ visible: true }).allInnerTexts()).map((o) => o.trim()).filter(Boolean);
                await j.page.keyboard.press('Escape');
                const documented = ['No Automatic Retry', 'Auto Retry', 'Human Review'];
                const absent = documented.filter((d) => !options.includes(d));
                if (absent.length > 0) {
                    await j.finding({
                        kind: 'label',
                        says: `The three retry policies: ${documented.map((d) => `**${d}**`).join(', ')}`,
                        actual: `The **Retry Policy** dropdown offers ${options.map((o) => `**${o}**`).join(', ')}`,
                        suggestion: 'List the policies by the names the dropdown uses, including any the page does not cover.',
                    });
                }
            });
            await j.step('auto', 'Choosing **Auto Retry** adds **Max Retries**, **Retry Delay**, **Retry Backoff** and **Max Retry Delay**.', async () => {
                const panel = await ui.panel(/Retry Policy/);
                await ui.select(panel, await ui.view(), 'Retry Policy', 'Auto Retry');
                await ui.expectFields(panel, [{ label: 'Max Retries' }, { label: 'Retry Delay' }, { label: 'Retry Backoff' }, { label: 'Max Retry Delay' }]);
            });
            await j.step('review', 'Choosing **Human Review** shows **Reviewer Roles**.', async () => {
                const panel = await ui.panel(/Retry Policy/);
                await ui.select(panel, await ui.view(), 'Retry Policy', 'Human Review');
                await ui.expectFields(panel, [{ label: 'Reviewer Roles' }]);
                await ui.select(panel, await ui.view(), 'Retry Policy', { doc: 'No Automatic Retry', ui: 'No Retry' });
            });
            await j.step('2', 'Expand **Advanced Configurations** and clear **Check Error**. A **Result** field appears.', async () => {
                const panel = await ui.panel(/Retry Policy/);
                await ui.expectFields(panel, [{ label: 'Check Error', advanced: true }]);
                // The box is the element before the label and its description.
                await j.clickUntil(panel.getByText('Check Error', { exact: true }).locator('xpath=../preceding-sibling::*[1]'),
                    panel.getByText('Result', { exact: true }).filter({ visible: true }), 6000);
                await ui.expectFields(panel, [{ label: 'Result' }]);
            });
            await j.step('3', 'Name the **Result** variable `emailResult`, and click **Save**.', async () => {
                const panel = await ui.panel(/Result/);
                await ui.fill(panel, 'Result', 'emailResult');
                await ui.saveForm();
                await expect.poll(source, { timeout: 60000 }).toMatch(/emailResult = ctx->callActivity\(sendConfirmationEmail/);
            });
            await j.step('4', 'Click **+** below the activity and, in the node panel under **Control**, click **If**.', async () => {
                view = await ui.view('sendConfirmationEmail');
                await ui.plusBelow(view, 'sendConfirmationEmail');
                await ui.palette(['Control', 'If']);
            });
            await j.step('5', 'In **Condition**, write the error check, `emailResult is error`. Click **Save**.', async () => {
                const panel = await ui.panel(/Condition/i);
                await ui.fill(panel, 'Condition', 'emailResult is error');
                await ui.dismiss();
                await ui.saveForm();
            });
            await j.step('6', 'Click **+** on the branch taken when the condition holds and add a **Call Activity** step calling `notifyFailedEmail`. Click **Save**.', async () => {
                await ui.plusOnBranch(view, 'emailResult is error', 0);
                await ui.palette(['Workflow', 'Steps', 'Call Activity']);
                await ui.clickText(await ui.panel('notifyFailedEmail'), 'notifyFailedEmail');
                const panel = await ui.panel(/Retry Policy/);
                await ui.mode(panel, 'Order Info', 'Expression').catch(() => undefined);
                await ui.pick(panel, 'Order Info', ['Inputs', 'input']);
                await ui.saveForm();
                await expect.poll(source, { timeout: 60000 }).toMatch(/if emailResult is error \{[\s\S]*notifyFailedEmail/);
            });
        });
    });
}
