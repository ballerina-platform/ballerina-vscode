/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import { createArtifactAndGetWebview, domClick, initTest, logStep, page } from '../utils/helpers';
import {
    addApprovalFunction, addToolParameter, backToAgentView, clickText, collapseWhitespace, openAddToolPanel,
    openToolEditForm, waitForSources, webview,
} from './AgentToolApprovalUtils';

// The approval function (`@ai:AgentTool { requiresApproval: <fn> }`) of a custom agent tool, managed entirely
// through the UI, with the generated source checked after each save.
export default function createTests() {
    test.describe.serial('Agent Tool Approval Function Tests', {}, async () => {
        initTest();

        test('Create a chat agent', async () => {
            logStep('Creating a Chat Agent Service');
            const frame = await createArtifactAndGetWebview('Chat Agent Service', 'ai-agent-card');
            await frame.locator('div[data-testid="ex-editor-role"]').waitFor({ state: 'visible', timeout: 60000 });
            await frame.evaluate(({ role, instructions }) => {
                const editors = document.querySelectorAll('.cm-content');
                [role, instructions].forEach((text, index) => {
                    const view = (editors[index] as any)?.cmView?.view;
                    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
                });
            }, { role: 'You are a mail assistant.', instructions: 'Send emails the user asks for.' });
            await frame.getByRole('textbox', { name: /Agent Name/i }).fill('mailer');
            await domClick(frame.locator('vscode-button:has-text("Create")'));

            logStep('Opening the agent from the chat resource');
            const resource = frame.locator('[data-testid="service-agent-view-resource"]').first();
            await resource.waitFor({ state: 'visible', timeout: 240000 });
            await resource.click({ force: true });
            await frame.locator('[data-testid="open-agent-button"]').first().click({ force: true, timeout: 240000 });
            await frame.locator('[data-testid="agent-add-tool"]').first().waitFor({ timeout: 120000 });
        });

        test('Create a tool with a new approval function', async () => {
            logStep('Opening Create Custom Tool');
            await openAddToolPanel();
            const frame = await webview();
            await clickText(frame, 'Create Custom Tool');
            const toolName = frame.getByRole('textbox', { name: /^Name\*Name of the agent tool/ });
            await toolName.waitFor({ timeout: 60000 });
            await toolName.fill('sendEmail');
            await addToolParameter('string', 'to');
            await addToolParameter('string', 'subject');

            logStep('Adding the approval function');
            await addApprovalFunction();
            const attached = await frame.locator('[data-testid="approval-function-attached"]').innerText();
            if (!attached.includes('sendEmailApproval')) {
                throw new Error(`Unexpected default approval function name: ${attached}`);
            }
            await frame.getByRole('button', { name: 'Create Tool' }).click();
            await frame.locator('[data-testid="agent-tool-sendEmail"]').waitFor({ timeout: 120000 });

            logStep('Verifying the generated tool and approval function');
            await waitForSources((src) => {
                const flat = collapseWhitespace(src);
                return flat.includes('@ai:AgentTool { requiresApproval: sendEmailApproval }')
                    && flat.includes('isolated function sendEmailApproval(string to, string subject) returns boolean');
            }, 'sendEmail gated by a generated sendEmailApproval');
        });

        test('Editing the tool parameters updates the approval function', async () => {
            await openToolEditForm('sendEmail');
            await addToolParameter('string', 'cc');
            const frame = await webview();
            const note = frame.locator('[data-testid="approval-function-sync-note"]');
            await note.waitFor({ timeout: 15000 });
            if (!(await note.innerText()).includes('sendEmailApproval will be updated to match when you save')) {
                throw new Error(`Unexpected sync note: ${await note.innerText()}`);
            }
            await frame.getByRole('button', { name: 'Save', exact: true }).click();
            await waitForSources((src) => collapseWhitespace(src)
                .includes('isolated function sendEmailApproval(string to, string subject, string cc) returns boolean'),
            'sendEmailApproval synced with the new parameter');
            // Saving from the edit page rewrites the annotation; its layout is kept, with no blank line inside.
            await waitForSources((src) => /@ai:AgentTool \{\r?\n {4}requiresApproval: sendEmailApproval\r?\n\}/.test(src),
                'the @ai:AgentTool annotation keeps its layout after an edit');
        });

        test('The approval function form keeps its parameters read-only', async () => {
            await openToolEditForm('sendEmail');
            let frame = await webview();
            await frame.locator('[data-testid="approval-function-open"]').click();
            await frame.getByRole('heading', { name: 'Function' }).waitFor({ timeout: 60000 });
            await frame.getByRole('button', { name: /Configure/ }).click();
            frame = await webview();
            await frame.getByText(/Approval function for sendEmail\./).waitFor({ timeout: 60000 });
            for (const param of ['to', 'subject', 'cc']) {
                await frame.locator(`[data-testid="${param}-item"]`).waitFor({ timeout: 15000 });
            }
            const editIcons = await frame.locator('.codicon-edit, .codicon-trash').count();
            if (editIcons !== 0) {
                throw new Error(`Approval function parameters should be read-only; found ${editIcons} edit/delete icons`);
            }
            await frame.locator('[data-testid="readonly-field-type"]').waitFor({ timeout: 15000 });
        });

        test('Removing the approval function deletes it', async () => {
            await openToolEditForm('sendEmail');
            const frame = await webview();
            const deleteNote = frame.locator('[data-testid="approval-function-delete-note"]');
            await frame.locator('[data-testid="approval-function-remove"]').click();
            await frame.locator('#approval-function-add').waitFor({ timeout: 15000 });
            logStep('Warning that saving deletes the removed function');
            await deleteNote.waitFor({ timeout: 15000 });

            logStep('Adding the same function back is accepted and clears the warning');
            await addApprovalFunction();
            const attached = await frame.locator('[data-testid="approval-function-attached"]').innerText();
            if (!attached.includes('sendEmailApproval')) {
                throw new Error(`The removed function's name should be accepted again: ${attached}`);
            }
            await deleteNote.waitFor({ state: 'hidden', timeout: 15000 });
            // It's the existing function again, not a new one: it can be opened and isn't "created".
            await frame.locator('[data-testid="approval-function-open"]').waitFor({ timeout: 15000 });
            if (await frame.getByText('Created when you save the tool.').isVisible()) {
                throw new Error('The re-added existing function should not be marked as created on save');
            }

            logStep('Removing it again and saving deletes it');
            await frame.locator('[data-testid="approval-function-remove"]').click();
            await deleteNote.waitFor({ timeout: 15000 });
            await frame.getByRole('button', { name: 'Save', exact: true }).click();
            await waitForSources((src) => collapseWhitespace(src).includes('@ai:AgentTool { requiresApproval: true }')
                && !src.includes('function sendEmailApproval'), 'requiresApproval: true and sendEmailApproval deleted');
        });

        test('Adding an approval function while editing generates it', async () => {
            await openToolEditForm('sendEmail');
            const frame = await webview();
            await frame.locator('#approval-function-add').click();
            await frame.getByText('New Approval Function', { exact: true }).waitFor({ timeout: 15000 });
            const rows = await frame.locator('[data-testid="approval-function-param"]').allTextContents();
            if (rows.join('|') !== 'stringto|stringsubject|stringcc') {
                throw new Error(`Unexpected mirrored parameters: ${rows}`);
            }
            // Keep the suggested name.
            await frame.locator('#approval-function-add-confirm vscode-button:not([disabled])').waitFor({ timeout: 20000 });
            await frame.locator('#approval-function-add-confirm').click();
            await frame.locator('[data-testid="approval-function-attached"]').waitFor({ timeout: 20000 });
            await frame.getByRole('button', { name: 'Save', exact: true }).click();
            await waitForSources((src) => {
                const flat = collapseWhitespace(src);
                return flat.includes('@ai:AgentTool { requiresApproval: sendEmailApproval }')
                    && flat.includes('isolated function sendEmailApproval(string to, string subject, string cc) returns boolean');
            }, 'sendEmailApproval attached and generated');
        });

        test('Renaming the tool keeps its approval function', async () => {
            await openToolEditForm('sendEmail');
            const frame = await webview();
            await frame.locator('vscode-button[title="Rename"]').click();
            await frame.getByText('Note: Renaming will update all references across the project')
                .waitFor({ timeout: 15000 });
            await frame.getByRole('textbox', { name: /^Name\*Name of the agent tool/ }).fill('sendMail');
            // The first Save belongs to the rename controls; the page's own Save is further down.
            await frame.getByRole('button', { name: 'Save', exact: true }).first().click();
            await waitForSources((src) => {
                const flat = collapseWhitespace(src);
                return flat.includes('@ai:AgentTool { requiresApproval: sendEmailApproval } isolated function sendMail(')
                    && flat.includes('tools = [sendMail]');
            }, 'tool renamed to sendMail with its approval function kept');
        });

        test('Turning approval off deletes the approval function', async () => {
            await openToolEditForm('sendMail');
            const frame = await webview();
            await frame.locator('[data-testid="approval-required"] vscode-checkbox').first().click();
            await frame.locator('[data-testid="approval-function-attached"]').waitFor({ state: 'hidden', timeout: 15000 });
            const note = frame.locator('[data-testid="approval-function-delete-note"]');
            await note.waitFor({ timeout: 15000 });
            if (!(await note.innerText()).includes('Saving will delete sendEmailApproval')) {
                throw new Error(`Unexpected delete warning: ${await note.innerText()}`);
            }
            await frame.getByRole('button', { name: 'Save', exact: true }).last().click();
            await waitForSources((src) => !src.includes('requiresApproval') && !src.includes('function sendEmailApproval')
                && src.includes('function sendMail('), 'requiresApproval removed and sendEmailApproval deleted');
        });

        test('Deleting the tool deletes its approval function', async () => {
            await openToolEditForm('sendMail');
            let frame = await webview();
            await addApprovalFunction();
            await frame.getByRole('button', { name: 'Save', exact: true }).last().click();
            await waitForSources((src) => collapseWhitespace(src)
                .includes('isolated function sendMailApproval(string to, string subject, string cc) returns boolean'),
            'sendMailApproval generated');

            await backToAgentView();
            frame = await webview();
            const tool = frame.locator('[data-testid="agent-tool-sendMail"]').first();
            await tool.dispatchEvent('contextmenu');
            await frame.locator('#menu-item-delete').click({ timeout: 10000 });

            logStep('Confirming that the approval function is deleted with the tool');
            const dialog = page.page.locator('.monaco-dialog-box').first();
            await dialog.waitFor({ timeout: 15000 });
            if (!(await dialog.innerText()).includes('sendMailApproval')) {
                throw new Error(`The confirm should name the approval function: ${await dialog.innerText()}`);
            }
            await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
            await tool.waitFor({ state: 'detached', timeout: 120000 });
            await waitForSources((src) => !src.includes('function sendMail(') && !src.includes('sendMailApproval'),
                'tool and its approval function deleted');
        });
    });
}
