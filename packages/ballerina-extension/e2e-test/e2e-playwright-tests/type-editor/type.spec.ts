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
import { addArtifact, BI_INTEGRATOR_LABEL, getWebview, initTest, logStep, page, verifyGeneratedSource, verifyRecordFields } from '../utils/helpers';
import { Form } from '@wso2/playwright-vscode-tester';
import { TypeEditorUtils } from './TypeEditorUtils';
import path from 'path';

export default function createTests() {
    test.describe.serial('Type Editor Tests', {
    }, async () => {
        initTest();

        test('Create Types from Scratch', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            console.log('Creating types from scratch in test attempt: ', testAttempt);

            // Navigate to type editor
            await addArtifact('Type', 'type');

            // Wait for page to be stable before accessing iframe
            await page.page.waitForLoadState('networkidle');

            // Get webview directly from utils
            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);
            const typeUtils = new TypeEditorUtils(page.page, artifactWebView);

            // Wait for type editor to be ready
            await typeUtils.waitForTypeEditor();

            // ENUM: Role
            const enumName = `Role${testAttempt}`;

            // Create enum with members, delete one, then save
            const enumForm = await typeUtils.createEnumType(enumName, ['Admin', 'Engineer', 'Sales', 'Marketing']);
            await typeUtils.deleteEnumMember(1); // Delete 'Engineer'
            await typeUtils.saveAndWait(enumForm);
            await typeUtils.verifyTypeNodeExists(enumName);

            // UNION: Id
            await typeUtils.clickAddType();
            const unionName = `Id${testAttempt}`;
            const unionForm = await typeUtils.createUnionType(unionName, ['int', 'string']);
            await typeUtils.saveAndWait(unionForm);
            await typeUtils.verifyTypeNodeExists(unionName);

            // RECORD: Organization
            await typeUtils.clickAddType();
            const organizationName = `Organization${testAttempt}`;
            const organizationForm = await typeUtils.createRecordType(organizationName, [
                { name: 'id', type: unionName },
                { name: 'name', type: 'string' },
                { name: 'location', type: 'string' }
            ]);

            // Test Advanced Options functionality
            console.log('Expanding Advanced Options...');
            await typeUtils.toggleDropdown('Advanced Options');

            console.log('Testing Allow Additional Fields checkbox...');
            await typeUtils.setCheckbox('Allow Additional Fields', true);
            await typeUtils.saveAndWait(organizationForm);
            await typeUtils.verifyTypeNodeExists(organizationName);
            await typeUtils.verifyTypeLink(organizationName, 'id', unionName);


            // RECORD: Employee (initially with just id field)
            await typeUtils.clickAddType();
            const recordName = `Employee${testAttempt}`;
            const recordForm = await typeUtils.createRecordType(recordName, [
                { name: 'id', type: unionName }
            ]);
            await typeUtils.saveAndWait(recordForm);
            await typeUtils.verifyTypeNodeExists(recordName);

            // Verify link
            await typeUtils.verifyTypeLink(recordName, 'id', unionName);

            // Edit Employee type to add role field
            await typeUtils.editType(recordName);
            await typeUtils.addRecordField('role', enumName);
            const editForm = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);
            await typeUtils.saveAndWait(editForm);
            await typeUtils.verifyTypeLink(recordName, 'role', enumName);

            // Add name field to Employee record
            await typeUtils.editType(recordName);
            await typeUtils.addRecordField('name', 'string');

            // Toggle drop down
            await typeUtils.toggleFieldOptionsByChevron(2);
            await typeUtils.setCheckbox('Readonly', true);

            // Test Advanced Options functionality
            console.log('Expanding Advanced Options...');
            await typeUtils.toggleDropdown('Advanced Options');

            console.log('Testing Is Readonly Type checkbox...');
            await typeUtils.setCheckbox('Is Readonly Type', true);

            await typeUtils.saveAndWait(recordForm);
            await typeUtils.verifyTypeNodeExists(recordName);

            // Create Service Class: Project
            await typeUtils.clickAddType();
            const serviceClassName = `Project${testAttempt}`;
            const serviceForm = await typeUtils.createServiceClass(serviceClassName, [
                { name: 'employeeDetails', returnType: recordName }
            ]);
            await typeUtils.saveAndWait(serviceForm);
            await typeUtils.verifyTypeNodeExists(serviceClassName);
            await typeUtils.verifyTypeLink(serviceClassName, 'employeeDetails', recordName);

            // Verify the generated types.bal matches testOutput.bal. The fixture is
            // written against attempt 1; on retries, identifiers are suffixed with
            // the attempt number to avoid clashing with leftover types, so
            // substitute the expected identifiers to match.
            const expectedFilePath = path.join(__dirname, 'testOutput.bal');
            const substitutions = testAttempt === 1 ? undefined : {
                'Role1': enumName,
                'Id1': unionName,
                'Organization1': organizationName,
                'Employee1': recordName,
                'Project1': serviceClassName,
            };
            await verifyGeneratedSource('types.bal', expectedFilePath, substitutions);

        });

        test('Import Type from JSON', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            logStep(`Import type from JSON — attempt ${testAttempt}`);

            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);
            const typeUtils = new TypeEditorUtils(page.page, artifactWebView);

            logStep('Opening Add Type panel');
            await typeUtils.clickAddType();

            logStep('Switching to Import tab');
            await typeUtils.switchToImportTab();

            // Format defaults to JSON — no change needed
            const typeName = `PersonJson${testAttempt}`;
            logStep(`Setting type name: ${typeName}`);
            await typeUtils.setImportTypeName(typeName);

            logStep('Pasting JSON content');
            await typeUtils.fillImportTextArea('{"name": "John", "age": 30, "city": "New York"}');

            logStep('Clicking Import button');
            await typeUtils.clickImportButton();

            logStep(`Verifying type node ${typeName}`);
            await typeUtils.verifyTypeNodeExists(typeName);

            logStep('Verifying generated record fields in types.bal');
            await verifyRecordFields('types.bal', typeName, ['name', 'age', 'city']);
        });

        test('Import Type from XML', async ({ }, testInfo) => {
            const testAttempt = testInfo.retry + 1;
            logStep(`Import type from XML — attempt ${testAttempt}`);

            const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);
            const typeUtils = new TypeEditorUtils(page.page, artifactWebView);

            // XML import names the type from the root element, so the name isn't
            // known upfront — snapshot existing nodes now and diff afterwards.
            // A bare `.first()` on `[data-testid^="type-node-"]` can otherwise
            // match a node left over from an earlier test in this serial block
            // instead of the one this import creates.
            const existingTypeNodeIds = await typeUtils.snapshotTypeNodeIds();

            logStep('Opening Add Type panel');
            await typeUtils.clickAddType();

            logStep('Switching to Import tab');
            await typeUtils.switchToImportTab();

            logStep('Changing format to XML');
            await typeUtils.setImportFormat('XML');

            logStep('Pasting XML content');
            await typeUtils.fillImportTextArea('<person><name>John</name><age>30</age></person>');

            logStep('Clicking Import button');
            await typeUtils.clickImportButton();

            logStep('Verifying type node appears (name derived from XML root element)');
            const generatedTypeName = await typeUtils.waitForNewTypeNode(existingTypeNodeIds);
            logStep(`Type node visible: type-node-${generatedTypeName}`);

            logStep('Verifying generated record fields in types.bal');
            await verifyRecordFields('types.bal', generatedTypeName, ['name', 'age']);
        });

    });
}
