
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
import { expect, test } from '@playwright/test';
import { confirmSaveChangesAndGoBack, createArtifactAndGetWebview, deleteArtifactFromTree, domClick, getWebview, BI_INTEGRATOR_LABEL, initTest, page } from '../utils/helpers';
import { Form } from '@wso2/playwright-vscode-tester';
import { ProjectExplorer } from '../utils/pages';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';
import { locateAddHandlerButton } from './eventIntegrationUtils';

export default function createTests() {
    test.describe.serial('RabbitMQ Integration Tests', {
    }, async () => {
        // Always the same literal (never varies by test/attempt), so it's a true
        // constant rather than state one test hands to the next — keeping it a
        // module-level const means a test re-run in isolation (e.g. CI re-running
        // only a previously-failed test, skipping this file's earlier tests)
        // still sees the right value instead of `undefined`.
        const listenerName = `rabbitmqListener`;
        let queueName: string;
        initTest();
        test('Create RabbitMQ Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Creating a new service in test attempt: ', testAttempt);

            const artifactWebView = await createArtifactAndGetWebview('RabbitMQ Integration', 'trigger-rabbitmq');
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);

            queueName = `myQueueName`;
            await form.fill({
                values: {
                    // Was 'basePath' — the field's actual key is 'queueName'; the old key
                    // never matched, so this fill silently no-opped and relied entirely on
                    // the field's own default ("myQueue", not this test's intended value).
                    'queueName': {
                        type: 'cmEditor',
                        value: `"${queueName}"`,
                        additionalProps: { switchMode: 'expression-mode' }
                    }
                }
            });
            // Dismiss the expression helper panel opened by filling the field above — it
            // can cover the submit button.
            await page.page.keyboard.press('Escape');
            await form.submit('Create');

            await artifactWebView.locator(`text=${listenerName}`).waitFor();

            const projectExplorer = new ProjectExplorer(page.page);
            // The tree label's accessor suffix is unquoted (e.g. "- myQueueName"), unlike
            // the quoted Ballerina string literal used to set it.
            await projectExplorer.findItem([DEFAULT_PROJECT_NAME, `RabbitMQ Event Integration - ${queueName}`]);
        });

        test('Add onMessage Handler', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Adding onMessage handler in test attempt: ', testAttempt);

            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);

            // "Add Handler" only lives on the dedicated service page, not the integration
            // overview the Create test can leave the webview on — navigate there first via
            // the diagram node if needed.
            const entryNode = artifactWebView.locator('[data-testid="entry-node-service"]');
            if (await entryNode.isVisible({ timeout: 3000 }).catch(() => false)) {
                await domClick(entryNode);
            }
            await artifactWebView.locator(`text=${listenerName}`).waitFor();

            const addHandlerBtn = locateAddHandlerButton(artifactWebView);
            await addHandlerBtn.first().waitFor();
            await addHandlerBtn.first().click({ force: true });
            await page.page.waitForTimeout(1000);

            // The handler picker card's testid is now "function-card-<Display Name>"
            // (e.g. "function-card-On Message"), not the camelCase function name.
            const onMessageCard = artifactWebView.locator('[data-testid="function-card-On Message"]');
            await onMessageCard.waitFor({ state: 'visible' });
            await onMessageCard.click();

            // "Define Content" is gone — the payload-type step is now reached via the
            // "Define Message Configuration" link, which opens the same type-picker modal.
            const definePanel = artifactWebView.locator('[data-testid="side-panel"]');
            const defineConfigLink = definePanel.getByText('Define Message Configuration', { exact: true });
            await defineConfigLink.waitFor({ state: 'visible', timeout: 10000 });
            await defineConfigLink.click({ force: true });

            // Select the Default JSON Type from the modal box.
            const continueWithJsonBtn = artifactWebView.getByText('Continue with JSON Type', { exact: true });
            await continueWithJsonBtn.waitFor({ state: 'visible', timeout: 5000 });
            await continueWithJsonBtn.click();

            // Click the "Save" button at the bottom of the panel.
            const saveBtn = definePanel.getByRole('button', { name: 'Save' });
            await saveBtn.first().waitFor({ state: 'visible', timeout: 5000 });
            await saveBtn.first().click({ force: true });

            // Saving lands directly on the new handler's diagram view (title bar shows its
            // name) — no separate redirect-detection needed.
            const titleBarContainer = artifactWebView.locator('[data-testid="title-bar-container"]');
            await titleBarContainer.getByText('onMessage', { exact: true }).first()
                .waitFor({ state: 'visible', timeout: 30000 });
        });

        test('Editing RabbitMQ Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Editing a service in test attempt: ', testAttempt);

            const projectExplorer = new ProjectExplorer(page.page);
            const serviceTreeItem = await projectExplorer.findItem([DEFAULT_PROJECT_NAME, `RabbitMQ Event Integration - ${queueName}`]);
            await serviceTreeItem.click({ force: true });

            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);

            // The Create test can leave the webview either on the integration overview
            // (service shown as a diagram node — click it to reach the dedicated service
            // page) or already on that dedicated page (Configure visible directly).
            const entryNode = artifactWebView.locator('[data-testid="entry-node-service"]');
            if (await entryNode.isVisible({ timeout: 3000 }).catch(() => false)) {
                await domClick(entryNode);
            }
            const configureBtn = artifactWebView.getByRole('button', { name: 'Configure' });
            await configureBtn.waitFor();
            await domClick(configureBtn);

            // 'Service Configuration' (serviceConfig) is a RECORD_MAP_EXPRESSION field — its
            // preview textarea only lets you pick which fields are included, not edit a
            // required leaf's value (queueName in this case has no in-place value editor
            // at all, confirmed via source: RecordConstructView's CustomType renders just a
            // checkbox/name/type, no input). Toggling an optional boolean field (autoAck)
            // through the "Record Configuration" modal it opens on focus is the one edit
            // this form's guided UI genuinely supports.
            const serviceConfigTextarea = artifactWebView.locator('vscode-text-area[name="serviceConfig"] textarea');
            await serviceConfigTextarea.click({ force: true });
            const recordConfigOverlay = artifactWebView.locator('.unq-modal-overlay').last();
            const autoAckCheckbox = recordConfigOverlay.locator(
                'xpath=//p[normalize-space(text())="autoAck"]/preceding-sibling::vscode-checkbox[1]'
            );
            await autoAckCheckbox.waitFor();
            await autoAckCheckbox.evaluate((el: HTMLElement) => el.click());
            await recordConfigOverlay.getByRole('button').first().click({ force: true });

            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await form.switchToFormView(false, artifactWebView);
            await form.submit('Save Changes');
            await confirmSaveChangesAndGoBack(artifactWebView);

            // Verify the edit persisted by reopening Configure and re-checking the field.
            await domClick(configureBtn);
            const reopenedTextarea = artifactWebView.locator('vscode-text-area[name="serviceConfig"] textarea');
            await reopenedTextarea.click({ force: true });
            const reopenedOverlay = artifactWebView.locator('.unq-modal-overlay').last();
            const reopenedAutoAckCheckbox = reopenedOverlay.locator(
                'xpath=//p[normalize-space(text())="autoAck"]/preceding-sibling::vscode-checkbox[1]'
            );
            await expect(reopenedAutoAckCheckbox).toHaveAttribute('current-checked', 'true');
        });

        test('Delete RabbitMQ Integration', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Deleting RabbitMQ integration in test attempt: ', testAttempt);

            await getWebview(BI_INTEGRATOR_LABEL, page);
            await deleteArtifactFromTree([DEFAULT_PROJECT_NAME, `RabbitMQ Event Integration - ${queueName}`]);
        });
    });
}
