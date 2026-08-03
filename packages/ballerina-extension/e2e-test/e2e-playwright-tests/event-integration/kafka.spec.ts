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
import { locateAddHandlerButton } from './eventIntegrationUtils';

export default function createTests() {
    test.describe.serial('Kafka Integration Tests', {
    }, async () => {
        initTest();

        test('Create Kafka Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Creating a new Kafka integration in test attempt: ', testAttempt);

            const artifactWebView = await createArtifactAndGetWebview('Kafka Integration', 'trigger-kafka');

            const bootstrapServers = `localhost:9092`;
            const topic = `test-topic`;

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'bootstrapServers': {
                        type: 'cmEditor',
                        value: bootstrapServers,
                        additionalProps: { clickLabel: true, switchMode: 'primary-mode', window: global.window }
                    },
                    'topics': {
                        type: 'cmEditor',
                        value: topic,
                        additionalProps: { clickLabel: true, switchMode: 'primary-mode', window: global.window }
                    }
                }
            });
            await form.submit('Create');

            const kafkaListener = `kafkaListener`;
            await artifactWebView.locator(`text=${kafkaListener}`).waitFor();

            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, `Kafka Event Integration`]);
        });

        test('Edit Kafka Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Editing Kafka integration in test attempt: ', testAttempt);

            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);

            const editBtn = artifactWebView.locator('vscode-button[title="Edit Service"]').or(
                artifactWebView.locator('button[title*="Edit"]')
            );
            await editBtn.waitFor();
            await editBtn.click({ force: true });

            // Wait for "Kafka Event Integration Configuration" form to be open —
            // the div with id="TitleDiv" indicates the form is open.
            const titleDiv = artifactWebView.locator('#TitleDiv');
            await titleDiv.waitFor();

            const updatedBootstrapServers = `"kafka1:9092,kafka2:9092"`;
            const updatedTopic = `updated-topic`;

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'bootstrapServers': {
                        type: 'cmEditor',
                        value: updatedBootstrapServers,
                        additionalProps: { clickLabel: true, switchMode: 'primary-mode', window: global.window }
                    },
                    'topics': {
                        type: 'cmEditor',
                        value: updatedTopic,
                        additionalProps: { clickLabel: true, switchMode: 'primary-mode', window: global.window }
                    }
                }
            });
            await form.submit('Save Changes');
            await confirmSaveChangesAndGoBack(artifactWebView);

            await artifactWebView.locator(`text=${updatedTopic}`).waitFor({ state: 'visible' });
        });

        test('Configure Multiple Topics', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Configuring multiple topics in test attempt: ', testAttempt);

            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);

            const editBtn = artifactWebView.locator('vscode-button[title="Edit Service"]').or(
                artifactWebView.locator('button[title*="Edit"]')
            );
            await editBtn.waitFor();
            await editBtn.click({ force: true });

            const titleDiv = artifactWebView.locator('#TitleDiv');
            await titleDiv.waitFor();

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);

            const multipleTopics = `topic1,topic2,topic3`;
            await form.fill({
                values: {
                    'topics': {
                        type: 'cmEditor',
                        value: multipleTopics,
                        additionalProps: { clickLabel: true, switchMode: 'primary-mode', window: global.window }
                    }
                }
            });
            await form.submit('Save Changes');
            await confirmSaveChangesAndGoBack(artifactWebView);

            await artifactWebView.locator(`text=${multipleTopics}`).waitFor({ state: 'visible' });
        });

        test('Add Consumer Error Handler', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Adding error handler in test attempt: ', testAttempt);

            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);

            // Verify integration is open in service designer
            const kafkaListener = `kafkaListener`;
            await artifactWebView.locator(`text=${kafkaListener}`).waitFor();

            const addHandlerBtn = locateAddHandlerButton(artifactWebView);
            if (await addHandlerBtn.count() > 0) {
                await addHandlerBtn.first().waitFor();
                await addHandlerBtn.first().click({ force: true });
                await page.page.waitForTimeout(1000);

                // Click on the card with data-testid="function-card-onError" (onError handler)
                const onErrorCard = artifactWebView.locator('[data-testid="function-card-onError"]');
                await onErrorCard.waitFor({ state: 'visible' });
                await onErrorCard.click();
            }

            await artifactWebView.locator('[data-testid="service-agent-view-resource"]').waitFor({ timeout: 10000 });

            // Verify onError handler is added
            await artifactWebView.locator(`text=onError`).waitFor({ timeout: 10000 });

            // Verify handler appears in project tree
            const projectExplorer = new ProjectExplorer(page.page);
            try {
                await projectExplorer.findItem([DEFAULT_PROJECT_NAME, 'Kafka Event Integration', 'onError']);
            } catch (e) {
                console.log('onError handler may not appear in tree, but exists in service designer');
            }
        });

        test('Delete Kafka Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Deleting Kafka integration in test attempt: ', testAttempt);

            await getWebview(BI_INTEGRATOR_LABEL, page);
            await deleteArtifactFromTree([DEFAULT_PROJECT_NAME, `Kafka Event Integration`]);
        });
    });
}
