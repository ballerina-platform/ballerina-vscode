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
import { ORDER_TEMPLATE, WORKFLOW_ARTICLES } from '../common';
import { DocJourney } from '../doc-journey';
import { Integrator } from '../integrator';

// "Deployment Modes": the Configurable Variables page lists every setting the page documents.

const DOCUMENTED = ['mode', 'url', 'namespace', 'authApiKey', 'authMtlsCert', 'authMtlsKey', 'authCaCert', 'taskQueue',
    'maxConcurrentWorkflows', 'maxConcurrentActivities', 'activityRetryInitialInterval',
    'activityRetryBackoffCoefficient', 'activityRetryMaximumInterval', 'activityRetryMaximumAttempts'];

export default function createTests() {
    test.describe.serial('Deployment Modes Docs Tests', () => {
        initTest(true, true, undefined, undefined, ORDER_TEMPLATE);

        test('Deployment Modes', async () => {
            const j = new DocJourney({ title: 'Deployment Modes', slug: `${WORKFLOW_ARTICLES}/deployment-modes` });
            const ui = new Integrator(j);
            await j.page.getByRole('treeitem', { name: /^OrderProcessor/ }).first().waitFor({ state: 'visible', timeout: 180000 });
            let view = await ui.view();
            await j.step('1', 'In the sidebar, click **Configurations**.', async () => {
                await ui.sidebar('Configurations');
                if (!await ui.view(/Configurable Variables/i, 8000).then(() => true).catch(() => false)) {
                    const row = j.page.getByRole('treeitem', { name: /^Configurations/ }).first();
                    await j.hover(row);
                    await j.click(row.locator('.action-label').last());
                }
                view = await ui.view(/Configurable Variables/i, 60000);
            });
            await j.step('2', 'On the **Configurable Variables** page, under **Imported libraries**, click **ballerina/workflow**.', async () => {
                await ui.clickText(view, 'ballerina/workflow');
            });
            await j.step('3', 'Fill in the box under the variable you want to set, for example `mode`. The page documents every setting below.', async () => {
                const text = await view.locator('body').innerText();
                const absent = DOCUMENTED.filter((name) => !new RegExp(`\\b${name}\\b`).test(text));
                if (absent.length > 0) {
                    await j.finding({
                        kind: 'missing',
                        says: `The page documents ${absent.map((n) => `\`${n}\``).join(', ')}`,
                        actual: 'The **ballerina/workflow** configurables do not include them',
                        suggestion: 'Remove them or name them as the configurables page does.',
                    });
                }
            });
        });
    });
}
