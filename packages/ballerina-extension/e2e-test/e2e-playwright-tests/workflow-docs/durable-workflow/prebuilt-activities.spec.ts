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

import { test } from '@playwright/test';
import { initTest } from '../../utils/helpers';
import { ORDER_TEMPLATE, WORKFLOW_ARTICLES, openArtifact } from '../common';
import { DocJourney } from '../doc-journey';
import { Integrator } from '../integrator';

// "Prebuilt Activities" and its three pages: the entries under Prebuilt Activities and each one's form.


const PREBUILT = `${WORKFLOW_ARTICLES}/prebuilt-activities`;

const FORMS: Array<{ entry: string; page: string; fields: Array<{ label: string; advanced?: boolean }> }> = [
    { entry: 'Call REST API', page: 'call-rest-api', fields: [{ label: 'Connection' }, { label: 'Method' }, { label: 'Path' },
        { label: 'Result' }, { label: 'Databinding Type' }, { label: 'Retry Policy' }, { label: 'Headers', advanced: true }] },
    { entry: 'Call SOAP API', page: 'call-soap-api', fields: [{ label: 'Connection' }, { label: 'Body' }, { label: 'Action' },
        { label: 'Result' }, { label: 'Retry Policy' }, { label: 'Headers', advanced: true }, { label: 'Path', advanced: true }] },
    { entry: 'Send Email (SMTP)', page: 'send-email', fields: [{ label: 'Connection' }, { label: 'To' }, { label: 'Subject' },
        { label: 'Body' }, { label: 'From' }, { label: 'Retry Policy' }, { label: 'CC', advanced: true }, { label: 'BCC', advanced: true }] },
];

export default function createTests() {
    test.describe.serial('Prebuilt Activities Docs Tests', () => {
        initTest(true, true, undefined, undefined, ORDER_TEMPLATE);

        test('Prebuilt Activities', async () => {
            const j = new DocJourney({ title: 'Prebuilt Activities', slug: `${WORKFLOW_ARTICLES}/prebuilt-activities` });
            const ui = new Integrator(j);
            const view = await openArtifact(j, ui, 'OrderProcessor', 'shipmentWorkflow', 'reserveInventory');
            for (const form of FORMS) {
                await j.step(form.page, `In the **Activities** panel, expand **Prebuilt Activities** and click **${form.entry}**. Check its fields against the ${form.page} page.`, async () => {
                    await ui.plusBelow(view, 'reserveInventory');
                    await ui.palette(['Workflow', 'Steps', 'Call Activity']);
                    const panel = await ui.panel('Prebuilt Activities');
                    const entry = panel.getByText(form.entry.replace(' (SMTP)', '').replace(/ API$/, '')).filter({ visible: true }).first();
                    if (!await entry.isVisible().catch(() => false)) {
                        // The group remembers it is open; a second click would close it.
                        await ui.clickText(panel, 'Prebuilt Activities');
                    }
                    await ui.clickText(panel, { doc: form.entry, ui: [form.entry.replace(' (SMTP)', ''), form.entry.replace('API', 'Service')] });
                    const formPanel = await ui.panel(/Retry Policy|Connection/);
                    await ui.expectFields(formPanel, form.fields);
                    await j.click((await ui.view()).getByTestId('close-panel-btn').first()).catch(() => ui.dismiss());
                    await j.page.waitForTimeout(800);
                });
            }
        });
    });
}
