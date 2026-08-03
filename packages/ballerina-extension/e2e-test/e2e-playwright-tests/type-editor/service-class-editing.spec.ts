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
import { addArtifact, BI_INTEGRATOR_LABEL, getWebview, initTest, page } from '../utils/helpers';
import { TypeEditorUtils } from './TypeEditorUtils';

export default function createTests() {
    test.describe.serial('Type Editor Service Class Editing Tests', {
    }, async () => {
        initTest();

        test('Add, rename and delete methods and variables on a Service Class', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Editing Service Class methods/variables in test attempt: ', testAttempt);

            await addArtifact('Type', 'type');
            await page.page.waitForLoadState('networkidle');

            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);
            const typeUtils = new TypeEditorUtils(page.page, artifactWebView);
            await typeUtils.waitForTypeEditor();

            const serviceClassName = `MyService${testAttempt}`;
            const form = await typeUtils.createType(serviceClassName, 'Service Class');
            await typeUtils.saveAndWait(form);
            await typeUtils.verifyTypeNodeExists(serviceClassName);

            // Add a Resource and a Remote method, plus two variables, via the
            // edit view's dedicated Method/Variable buttons — a different UI
            // path than addFunction()'s creation-time identifier/type fields.
            await typeUtils.openServiceClassForEditing(serviceClassName);
            await typeUtils.addMethod('name', 'string', 'Resource');
            await typeUtils.addMethod('age', 'int', 'Remote');
            await typeUtils.addVariable('firstName', 'string');
            await typeUtils.addVariable('id', 'int');

            await typeUtils.editMethod('name', 'fullName');
            await typeUtils.deleteVariable('id');

            // Verify the edits actually persisted in the editor (these testids
            // are the same scheme editMethod/deleteVariable target, so a silent
            // persistence failure fails here instead of passing unnoticed):
            //   - method renamed:  fullName present, old 'name' gone
            //   - variable kept:   firstName present
            //   - variable deleted: id gone
            await expect(artifactWebView.getByTestId('edit-method-button-fullName')).toBeVisible({ timeout: 15000 });
            await expect(artifactWebView.getByTestId('edit-method-button-name')).toHaveCount(0);
            await expect(artifactWebView.getByTestId('delete-variable-button-firstName')).toBeVisible();
            await expect(artifactWebView.getByTestId('delete-variable-button-id')).toHaveCount(0);
        });
    });
}
