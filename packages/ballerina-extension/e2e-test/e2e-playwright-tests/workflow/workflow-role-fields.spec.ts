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
import type { Frame, Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { createArtifactAndGetWebview, domClick, initTest, newProjectPath, page, submitArtifactCreation } from '../utils/helpers';
import { logStep } from '../utils/helpers/progress';
import { SidePanel } from '../utils/pages';
import {
    exEditorText, expandAdvanced, fillExEditor, fillReviewers, fillTextField, getWebview, openNode, selectDropdown,
    switchToExpression, TYPE_ERROR, waitForEnabled,
} from './roleFields';

// A human task addressed to users only, and reviews whose roles are `()`, built from an empty project
// (wso2/product-integrator#2720, #2721, #2722).
const EMPTY_PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'empty_project');

const HUMAN_TASK_CALL = /awaitHumanTask\("reviewTask", userRoles = \(\), taskInput = \{\}, users = "alice"\)/;
const REVIEWERS_EXPRESSION = '"ali" + "ce"';
const RETRY_POLICY = /retryPolicy = \{maxRetries: 3, userRoles: \(\), users: "ali" \+ "ce"\}/;
const APPROVAL_POLICY = /approvalPolicy = \{userRoles: \(\), users: "alice"\}/;

// Every .bal file of the project, joined: the designer decides which file a declaration lands in.
function projectSource(): string {
    return fs.readdirSync(newProjectPath)
        .filter((name) => name.endsWith('.bal'))
        .map((name) => fs.readFileSync(path.join(newProjectPath, name), 'utf-8'))
        .join('\n');
}

const sidePanelOpens = (webview: Frame, timeout: number) =>
    webview.getByTestId('side-panel').filter({ visible: true }).last()
        .waitFor({ state: 'visible', timeout }).then(() => true, () => false);

// Opens the node palette from the + below a node. A diagram that already has steps draws a trailing empty
// node with its own +; a fresh one (Start to End) only shows a + on the edge leaving Start while it is hovered.
async function openPaletteBelow(webview: Frame, nodeText: string): Promise<SidePanel> {
    const canvas = webview.getByTestId('bi-diagram-canvas');
    await canvas.waitFor({ timeout: 60000 });
    const sidePanel = new SidePanel(webview, page.page);
    const emptyNodeButton = canvas.locator('[data-testid^="empty-node-add-button"]').first();
    if (await emptyNodeButton.waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false)) {
        await emptyNodeButton.click({ force: true, timeout: 5000 }).catch(() => emptyNodeButton.dispatchEvent('click'));
        if (!await sidePanelOpens(webview, 5000)) {
            await emptyNodeButton.dispatchEvent('click');
        }
        await sidePanel.init();
        return sidePanel;
    }
    const node = canvas.getByText(nodeText, { exact: true }).filter({ visible: true }).last();
    await node.waitFor({ state: 'visible', timeout: 60000 });
    const nodeBox = await node.boundingBox();
    if (!nodeBox) {
        throw new Error(`node '${nodeText}' has no position`);
    }
    const nodeBottom = nodeBox.y + nodeBox.height;
    for (let attempt = 0; attempt < 3; attempt++) {
        for (const edge of await webview.locator('[data-testid^="diagram-link-"]').all()) {
            const box = await edge.boundingBox();
            if (!box || box.y < nodeBox.y - 40 || box.y > nodeBottom + 90 || box.y + box.height <= nodeBottom + 15) {
                continue;
            }
            const buttonId = ((await edge.getAttribute('data-testid')) ?? '').replace('diagram-link-', 'link-add-button-');
            const button = webview.locator(`[data-testid="${buttonId}"]`).first();
            await page.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            if (await button.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) {
                await button.click({ force: true, timeout: 3000 }).catch(() => page.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2));
            } else {
                await page.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            }
            if (await sidePanelOpens(webview, 3000)) {
                await sidePanel.init();
                return sidePanel;
            }
        }
        await page.page.waitForTimeout(1000);
    }
    throw new Error(`the + below '${nodeText}' did not open the side panel`);
}

// Fills the Workflow Activity form's name and saves it; returns once the activity is in the source.
async function createActivity(webview: Frame, name: string): Promise<void> {
    const nameInput = webview.getByRole('textbox', { name: /Activity Name/ }).first();
    await nameInput.waitFor({ timeout: 60000 });
    await nameInput.fill(name);
    await nameInput.press('Tab');
    const saveButton = webview.getByRole('button', { name: 'Save' }).first();
    await waitForEnabled(saveButton);
    await saveButton.click({ force: true });
    await expect.poll(projectSource, { timeout: 90000 }).toMatch(new RegExp(`@workflow:Activity\\s+function ${name}\\(`));
}

async function saveForm(panel: Locator): Promise<Locator> {
    const saveButton = panel.getByRole('button', { name: 'Save' }).first();
    await waitForEnabled(saveButton);
    await saveButton.click({ force: true });
    return saveButton;
}

export default function createTests() {
    test.describe.serial('Workflow Role Field Tests', {
    }, async () => {
        initTest(true, true, undefined, undefined, EMPTY_PROJECT_TEMPLATE);
        test.afterEach(async ({ }, testInfo) => {
            for (const error of testInfo.errors) {
                console.log(`  ✖ ${testInfo.title}: ${(error.message ?? '').split('\n').slice(0, 6).join(' | ')}`);
            }
        });

        test('Save a human task addressed to users only and reopen it', async () => {
            logStep('Create the Durable Workflow artifact');
            const artifactWebView = await createArtifactAndGetWebview('Durable Workflow', 'workflow');
            const nameInput = artifactWebView.getByRole('textbox', { name: /^Name/ }).first();
            await nameInput.waitFor({ timeout: 60000 });
            await nameInput.fill('reviewWorkflow');
            await nameInput.press('Tab');
            await submitArtifactCreation(artifactWebView);
            const webview = await getWebview();
            await webview.getByTestId('start-node').waitFor({ timeout: 120000 });

            logStep('Add a Human Task with no user roles and a user named in expression mode');
            const sidePanel = await openPaletteBelow(webview, 'Start');
            await sidePanel.clickNode('Human Task');
            const panel = sidePanel.getLocator();
            await fillTextField(panel, 'Task Name', 'reviewTask');
            await switchToExpression(panel, 'taskInput');
            await fillExEditor(webview, 'taskInput', '{}');
            await expandAdvanced(panel);
            await switchToExpression(panel, 'users');
            await fillExEditor(webview, 'users', '"alice"');
            await expect(panel.getByText(TYPE_ERROR)).toHaveCount(0);

            logStep('Save: the roles are written as () beside the users (#2720)');
            const saveButton = await saveForm(panel);
            await expect.poll(projectSource, { timeout: 90000 }).toMatch(HUMAN_TASK_CALL);
            await saveButton.waitFor({ state: 'hidden', timeout: 60000 });

            logStep('Reopen the node: the users and the task input come back, and a save keeps the call');
            const canvas = webview.getByTestId('bi-diagram-canvas');
            // The node carries the step's label; the task name is read back from the form.
            await openNode(canvas, 'Human Task', panel.getByText('Task Name', { exact: false }).first());
            // The task input reopens as the `{}` it was written as, not as an empty map editor.
            await expect.poll(() => exEditorText(webview, 'taskInput'), { timeout: 30000 }).toBe('{}');
            await expandAdvanced(panel);
            // The literal reads back as alice, in the mode the form reopens it in: on CI the resolved-signature
            // form keeps the expression editor and shows "alice" there, so the check accepts either control.
            await expect.poll(async () => {
                const asExpression = await exEditorText(webview, 'users').catch(() => null);
                if (asExpression && /^"?alice"?$/.test(asExpression.trim())) {
                    return true;
                }
                return panel.getByText('alice', { exact: true }).first().isVisible().catch(() => false);
            }, { timeout: 30000 }).toBe(true);
            const reopenedSave = await saveForm(panel);
            await reopenedSave.waitFor({ state: 'hidden', timeout: 60000 });
            await page.page.waitForTimeout(2000);
            expect(projectSource()).toMatch(HUMAN_TASK_CALL);
        });

        test('Accept () as the reviewer roles of a call activity review and approval', async () => {
            const webview = await getWebview();
            logStep('Create an activity from the Call Activity list');
            // Added above the human task: the edge leaving Start is the one the + reliably shows on.
            const sidePanel = await openPaletteBelow(webview, 'Start');
            await sidePanel.clickNode('Call Activity');
            const panel = sidePanel.getLocator();
            await panel.getByText('Prebuilt Activities', { exact: true }).first().waitFor({ timeout: 60000 });
            await domClick(panel.getByText(/^\+?\s*Create Activity$/).first());
            await createActivity(webview, 'checkStock');
            await panel.getByText('checkStock', { exact: true }).first().waitFor({ timeout: 120000 });
            await domClick(panel.getByText('checkStock', { exact: true }).first());

            logStep('Retry, then Review: the reviewer roles take () (#2721)');
            await selectDropdown(panel, /Retry Policy/, 'Retry, then Review');
            await fillExEditor(webview, 'maxRetries', '3');
            // A computed expression, not a literal: it must survive a reopen as the expression it is (#2716).
            await fillReviewers(webview, panel, 'retryUserRoles', 'retryUsers', REVIEWERS_EXPRESSION);

            logStep('Human Approval: the reviewer roles take () (#2722)');
            await selectDropdown(panel, /Approval Policy/, 'Human Approval');
            await fillReviewers(webview, panel, 'approvalUserRoles', 'approvalUsers');

            logStep('Save: both policies name the users with nil roles');
            const saveButton = await saveForm(panel);
            await expect.poll(projectSource, { timeout: 90000 }).toMatch(RETRY_POLICY);
            expect(projectSource()).toMatch(APPROVAL_POLICY);
            await saveButton.waitFor({ state: 'hidden', timeout: 60000 });

            logStep('Reopen the call: the reviewer expression comes back in expression mode and a save keeps it');
            const canvas = webview.getByTestId('bi-diagram-canvas');
            await openNode(canvas, 'checkStock', panel.getByRole('combobox', { name: /Retry Policy/ }));
            await expandAdvanced(panel);
            await expect.poll(() => exEditorText(webview, 'retryUsers'), { timeout: 30000 }).toBe(REVIEWERS_EXPRESSION);
            const reopenedSave = await saveForm(panel);
            if (!await reopenedSave.waitFor({ state: 'hidden', timeout: 60000 }).then(() => true, () => false)) {
                const shown = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 1500);
                throw new Error(`the reopened call did not save; the panel shows: ${shown}`);
            }
            await page.page.waitForTimeout(2000);
            expect(projectSource()).toMatch(RETRY_POLICY);
            expect(projectSource()).toMatch(APPROVAL_POLICY);
        });
    });
}
