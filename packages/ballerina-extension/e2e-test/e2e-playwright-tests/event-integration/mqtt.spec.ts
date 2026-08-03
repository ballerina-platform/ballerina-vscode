
/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import { confirmSaveChangesAndGoBack, createArtifactAndGetWebview, deleteArtifactFromTree, getWebview, BI_INTEGRATOR_LABEL, initTest, page } from '../utils/helpers';
import { Form } from '@wso2/playwright-vscode-tester';
import { ProjectExplorer } from '../utils/pages';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';

export default function createTests() {
    test.describe.serial('MQTT Integration Tests', {
    }, async () => {
        initTest();
        test('Create MQTT Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Creating a new service in test attempt: ', testAttempt);

            const artifactWebView = await createArtifactAndGetWebview('MQTT Integration', 'trigger-mqtt');
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'serviceUri': {
                        type: 'cmEditor',
                        value: `tcp://localhost:1883`,
                        additionalProps: { clickLabel: true, switchMode: 'primary-mode', window: global.window }
                    },
                    'clientId': {
                        type: 'cmEditor',
                        value: `clientId${testAttempt}`,
                        additionalProps: { clickLabel: true, switchMode: 'primary-mode', window: global.window }
                    },
                    'subscriptions': {
                        type: 'cmEditor',
                        value: `testTopic`,
                        additionalProps: { clickLabel: true, switchMode: 'primary-mode', window: global.window }
                    }
                }
            });
            await form.submit('Create');

            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, `MQTT Event Integration`]);

            const mqttListener = `mqttListener`;
            await artifactWebView.locator(`text=${mqttListener}`).waitFor();
        });

        test('Editing MQTT Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Editing a service in test attempt: ', testAttempt);
            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);

            const editBtn = artifactWebView.locator('vscode-button[title="Edit Service"]');
            await editBtn.waitFor();
            await editBtn.click({ force: true });

            // Wait for "Kafka Event Integration Configuration" form to be open —
            // the div with id="TitleDiv" indicates the form is open.
            const titleDiv = artifactWebView.locator('#TitleDiv');
            await titleDiv.waitFor();

            const updatedServiceUri = `tcp://localhost:1010`;
            const updatedTopic = `"updated-topic"`;

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'serverUri': {
                        type: 'cmEditor',
                        value: updatedServiceUri,
                        additionalProps: { clickLabel: true, switchMode: 'primary-mode', window: global.window }
                    },
                    'subscriptions': {
                        type: 'cmEditor',
                        value: updatedTopic,
                        additionalProps: { clickLabel: true, switchMode: 'expression-mode', window: global.window }
                    }
                }
            });
            await form.submit('Save Changes');
            await confirmSaveChangesAndGoBack(artifactWebView);

            await artifactWebView.locator(`text=${updatedTopic}`).waitFor({ state: 'visible' });
        });

        test('Delete MQTT Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Deleting MQTT integration in test attempt: ', testAttempt);

            await getWebview(BI_INTEGRATOR_LABEL, page);
            await deleteArtifactFromTree([DEFAULT_PROJECT_NAME, `MQTT Event Integration`]);
        });
    });
}
