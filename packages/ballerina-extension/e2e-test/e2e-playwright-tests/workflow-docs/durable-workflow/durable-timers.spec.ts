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

// "Durable Timers": a one-day Sleep between validateEmailChange and performEmailChange.

export default function createTests() {
    test.describe.serial('Durable Timers Docs Tests', () => {
        initTest(true, true, undefined, undefined, ORDER_TEMPLATE);

        test('Durable Timers', async () => {
            const j = new DocJourney({ title: 'Durable Timers', slug: `${WORKFLOW_ARTICLES}/durable-timers` });
            const ui = new Integrator(j);
            const source = projectSources();
            const view = await openArtifact(j, ui, 'OrderProcessor', 'emailChangeRequest', 'validateEmailChange');
            await j.step('1', 'On the workflow diagram, click **+** where the workflow should wait, between `validateEmailChange` and `performEmailChange`.', async () => {
                await ui.plusBelow(view, 'validateEmailChange');
            });
            await j.step('2', 'In the node panel, under **Workflow** > **Steps**, click **Sleep**. The **Sleep** form opens.', async () => {
                await ui.palette(['Workflow', 'Steps', 'Sleep']);
            });
            await j.step('3', 'Fill in the form: **Duration**, on **Record** or **Expression**.', async () => {
                await ui.expectFields(await ui.panel(/Duration/), [{ label: 'Duration' }]);
            });
            await j.step('4', 'On **Record**, click the field to open the **Record Configuration** editor, select **days** and set it to `1`.', async () => {
                const panel = await ui.panel(/Duration/);
                const frame = await ui.view();
                await j.click(await ui.field(panel, 'Duration'));
                const editor = frame.getByText(/Record Configuration/i).first();
                if (!await editor.waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false)) {
                    await j.finding({
                        kind: 'behaviour',
                        says: 'On **Record**, click the field to open the **Record Configuration** editor',
                        actual: 'Clicking the **Duration** field does not open a **Record Configuration** editor',
                        suggestion: 'Describe how the duration is set on the form as it is.',
                    });
                    await ui.mode(panel, 'Duration', 'Expression');
                    await ui.fill(panel, 'Duration', '{days: 1}');
                    return;
                }
                await j.click(frame.getByText('days', { exact: true }).first().locator('xpath=preceding-sibling::*[1]'));
                // Ticking a field adds it to the record text on the right, where its value is set.
                const record = frame.locator('textarea, .cm-content').filter({ visible: true }).filter({ hasText: /days|\{/ }).last();
                await expect.poll(async () => (await record.inputValue().catch(() => record.innerText())), { timeout: 15000 }).toMatch(/days/);
                const text = await record.inputValue().catch(() => record.innerText());
                await j.click(record);
                await j.page.keyboard.press('ControlOrMeta+A');
                await j.page.keyboard.insertText(text.replace(/(days"?\s*:\s*)[^,\n}]*/, '$11'));
                await ui.clickButton(frame, { doc: 'Save', ui: ['Apply', 'Done', 'OK'] }).catch(() => undefined);
            });
            await j.step('5', 'Click **Save**.', async () => {
                await ui.saveForm();
                await expect.poll(source, { timeout: 60000 }).toMatch(/sleep\(\{\s*days:\s*1\s*\}\)/);
            });
        });
    });
}
