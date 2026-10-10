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
import * as fs from 'fs';
import * as path from 'path';
import { domClick, initTest, newProjectPath, page } from '../utils/helpers';
import { logStep } from '../utils/helpers/progress';
import {
    expandAdvanced, expectNilAccepted, fillExEditor, fillReviewers, fillTextField, getWebview, selectDropdown,
    switchToExpression, waitForEnabled,
} from './roleFields';

// The durable agent's Register HumanTask and activity approval forms accept `()` in their role fields
// (wso2/product-integrator#2723). Same project as durable-agent-activity.spec.ts.
const DURABLE_AGENT_PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'durable_agent_project');

function mainSource(): string {
    return fs.readFileSync(path.join(newProjectPath, 'main.bal'), 'utf-8');
}

export default function createTests() {
    test.describe.serial('Durable Agent Role Field Tests', {
    }, async () => {
        initTest(true, true, undefined, undefined, DURABLE_AGENT_PROJECT_TEMPLATE);
        test.afterEach(async ({ }, testInfo) => {
            for (const error of testInfo.errors) {
                console.log(`  ✖ ${testInfo.title}: ${(error.message ?? '').split('\n').slice(0, 6).join(' | ')}`);
            }
        });

        test('Register a human task whose roles are () and an approval whose reviewer roles are ()', async () => {
            logStep('Open the durable agent from the integration overview');
            // The overview webview is the readiness signal here; the sidebar tree can lag behind it.
            const webview = await getWebview();
            await webview.getByText('billingAgent', { exact: true }).first().waitFor({ timeout: 90000 });
            await webview.getByText('billingAgent', { exact: true }).first().click({ force: true });
            await webview.getByTestId('durable-agent-run-node').waitFor({ state: 'visible', timeout: 60000 });

            logStep('Register HumanTask: user roles () and a named user');
            await webview.getByTestId('durable-agent-affordance-humanTask').first().click({ force: true });
            const panel = webview.getByTestId('side-panel');
            await fillTextField(panel, 'Task Name', 'agentTask');
            await expandAdvanced(panel);
            await switchToExpression(panel, 'users');
            await fillExEditor(webview, 'users', '"alice"');
            await switchToExpression(panel, 'userRoles');
            await expectNilAccepted(webview, panel, 'userRoles');
            const saveButton = panel.getByRole('button', { name: 'Save' }).first();
            await waitForEnabled(saveButton);
            await saveButton.click({ force: true });
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/humanTasks: \[\{name: "agentTask", userRoles: \(\), users: "alice"/);
            await saveButton.waitFor({ state: 'hidden', timeout: 60000 });

            logStep('Register lookupBill with a Human Approval whose reviewer roles are ()');
            await webview.getByTestId('durable-agent-affordance-activity').first().click({ force: true });
            const item = panel.getByText('lookupBill', { exact: true }).first();
            await item.waitFor({ state: 'visible', timeout: 60000 });
            await item.scrollIntoViewIfNeeded();
            await page.page.waitForTimeout(500);
            await item.click({ force: true });
            await selectDropdown(panel, /Approval Policy/, 'Human Approval');
            await fillReviewers(webview, panel, 'approvalUserRoles', 'approvalUsers');
            const registerSave = panel.getByRole('button', { name: 'Save' }).first();
            await waitForEnabled(registerSave);
            await registerSave.click({ force: true });
            await expect.poll(mainSource, { timeout: 90000 })
                .toMatch(/activity: lookupBill[^}]*approvalPolicy: \{userRoles: \(\), users: "alice"\}/);
        });
    });
}
