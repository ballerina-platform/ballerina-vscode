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
import { expect, test, Frame } from '@playwright/test';
import * as path from 'path';
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR, initTest, logStep, page } from '../utils/helpers';
import { Form, switchToIFrame } from '@wso2/playwright-vscode-tester';
import { ProjectExplorer, Diagram, SidePanel } from '../utils/pages';
import { DEFAULT_PROJECT_NAME } from '../utils/helpers/constants';
import { FileUtils } from '../utils/helpers/fileSystem';
import { waitForBISidebarTreeView } from '../utils/helpers/sidebar';

// Fixture with an Automation already created (per the e2e-writer rule that
// scenarios must not re-create through the UI what another spec already
// covers as its own scenario — automation.spec.ts owns "Create Automation").
const AUTOMATION_PROJECT_TEMPLATE = path.join(__dirname, '..', 'data', 'automation_project');

const EXPECTED_SOURCE = [
    'int count = 1',
    'string msg = "started"',
    'log:printInfo',
    'log:printDebug',
    'if count > 10',
    'else',
    'match count',
    '1 =>',
    'log:printError("sample error log")',
    'log:printWarn("sample warn log")',
    'while count < 3',
];

function expectSourceFragments(source: string) {
    const missing = EXPECTED_SOURCE.filter((expected) => !source.includes(expected));
    expect(missing, `Missing source fragments:\n${missing.join('\n')}`).toEqual([]);
}

async function dismissHelperPanel() {
    await page.page.keyboard.press('Escape');
    await page.page.waitForTimeout(300);
    await page.page.keyboard.press('Escape');
    await page.page.waitForTimeout(300);
}

async function saveForm(webview: Frame) {
    await dismissHelperPanel();
    await webview.getByRole('button', { name: 'Save' }).last().click({ force: true });
    await webview.getByText(/Saving\.\.\./).waitFor({ state: 'hidden', timeout: 60000 }).catch(async (error) => {
        const panelText = await webview.getByTestId('side-panel').innerText({ timeout: 1000 }).catch(() => '');
        throw new Error(`Flow node form did not finish saving.\n${panelText}\n${error}`);
    });
    // Retry the Save click once — on slow CI runners the first click can land
    // before the form's onChange state settles, leaving the panel open.
    const closed = await webview.getByTestId('side-panel').waitFor({ state: 'hidden', timeout: 20000 }).then(() => true, () => false);
    if (!closed) {
        await dismissHelperPanel();
        await webview.getByRole('button', { name: 'Save' }).last().click({ force: true }).catch(() => { });
        await webview.getByTestId('side-panel').waitFor({ state: 'hidden', timeout: 60000 }).catch(async (error) => {
            const panelText = await webview.getByTestId('side-panel').innerText({ timeout: 1000 }).catch(() => '');
            throw new Error(`Flow node form did not close after saving.\n${panelText}\n${error}`);
        });
    }
    await webview.locator('[data-testid="bi-diagram-canvas"]').waitFor({ state: 'visible', timeout: 60000 });
    await page.page.waitForTimeout(1000);
}

async function selectNode(sidePanel: SidePanel, nodeTitle: string, sectionTitle?: string) {
    await sidePanel.init();
    if (sectionTitle) {
        await sidePanel.expandSection(sectionTitle);
    }
    await sidePanel.clickNode(nodeTitle);
}

// Fills a named ex-editor field directly via the CodeMirror view. Unlike
// Form.fill's cmEditor handler (which silently no-ops if the ex-editor
// container has not rendered yet — observed on slow Linux CI runners),
// this explicitly waits for the editor to be mounted before dispatching.
async function fillExEditor(webview: Frame, key: string, value: string) {
    const container = webview.locator(`[data-testid="ex-editor-${key}"]`);
    await container.waitFor({ state: 'visible', timeout: 30000 });
    await container.locator('.cm-content').first().waitFor({ state: 'attached', timeout: 30000 });
    await container.evaluate((element, text) => {
        const cmContent = element.querySelector('.cm-content') as HTMLElement & { cmView?: { view?: any } };
        const view = cmContent?.cmView?.view;
        if (!view) {
            throw new Error('CodeMirror view not found in ex-editor container');
        }
        view.focus();
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }, value);
}

async function fillFirstCodeMirror(webview: Frame, value: string) {
    await fillCodeMirror(webview, value, 0);
}

async function fillCodeMirror(webview: Frame, value: string, index: number) {
    await webview.evaluate(({ text, editorIndex }) => {
        const panel = document.querySelector('[data-testid="side-panel"]');
        const editors = [...(panel || document).querySelectorAll('.cm-content')] as Array<HTMLElement & { cmView?: { view?: any } }>;
        const visibleEditors = editors.filter((editor) => {
            const rect = editor.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });
        const editor = visibleEditors[editorIndex];
        const view = editor?.cmView?.view;
        if (!view) {
            throw new Error('CodeMirror editor not found');
        }
        view.focus();
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    }, { text: value, editorIndex: index });
}

async function clickLinkButtonText(webview: Frame, text: string) {
    const linkText = webview.getByText(text, { exact: true }).first();
    await linkText.waitFor({ state: 'visible', timeout: 10000 });
    await linkText.evaluate((element) => {
        const clickable = element.closest('button, vscode-button, a, [role="button"]') || element;
        clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    });
}

// Mirrors the original clickNextDiagramPlus algorithm from the main branch but
// uses real Playwright hover instead of synthetic dispatchEvent (which does not
// trigger React event handlers on Linux GitHub runners).
// Priority: empty-node-add-button (always visible) > second-to-last link-add-button.
// Second-to-last avoids the function-level link after the Error Handler (always last).
async function clickNextDiagramPlus(webview: Frame) {
    await webview.locator('[data-testid="bi-diagram-canvas"]').waitFor({ state: 'visible', timeout: 30000 });
    await page.page.waitForTimeout(500);

    // Prefer always-visible empty-node-add-buttons (branch/clause placeholders)
    const emptyBtns = webview.locator('[data-testid^="empty-node-add-button"]');
    if (await emptyBtns.count() > 0) {
        await emptyBtns.first().click({ force: true });
        await webview.getByTestId('side-panel').waitFor({ state: 'visible', timeout: 30000 });
        return;
    }

    // As the diagram grows it extends past the viewport, making lower links
    // unhoverable ("Element is outside of the viewport" on 1080p CI runners).
    // The diagram registers VerticalScrollCanvasAction, so a real mouse wheel
    // over the canvas pans the diagram vertically — scroll each link into the
    // canvas area before hovering it.
    const canvasBox = await webview.locator('[data-testid="bi-diagram-canvas"]').boundingBox();
    const scrollLinkIntoView = async (link: ReturnType<Frame['locator']>) => {
        if (!canvasBox) return;
        await page.page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
        for (let attempt = 0; attempt < 20; attempt++) {
            const box = await link.boundingBox();
            if (box && box.y >= canvasBox.y + 10 && box.y + box.height <= canvasBox.y + canvasBox.height - 10) {
                return;
            }
            const delta = box && box.y < canvasBox.y + 10 ? -200 : 200;
            await page.page.mouse.wheel(0, delta);
            await page.page.waitForTimeout(150);
        }
    };

    // Hover every diagram link with real Playwright so React renders the
    // link-add-button overlays, then identify the second-to-last button.
    const links = webview.locator('[data-testid^="diagram-link-"]');
    const linkCount = await links.count();
    for (let i = 0; i < linkCount; i++) {
        await scrollLinkIntoView(links.nth(i));
        await links.nth(i).hover({ force: true }).catch(() => { });
        await page.page.waitForTimeout(100);
    }

    const addBtns = webview.locator('[data-testid^="link-add-button-"]');
    const btnCount = await addBtns.count();
    if (btnCount === 0) throw new Error('No diagram add button was available');

    // Re-hover the specific link for the second-to-last button so the button is
    // visible at click time (hover state resets as we iterate over all links).
    // Second-to-last avoids the function-level continuation link (which is last).
    const targetBtnIdx = Math.max(0, btnCount - 2);
    const targetBtnTestId = await addBtns.nth(targetBtnIdx).getAttribute('data-testid');
    const correspondingLinkId = targetBtnTestId?.replace('link-add-button', 'diagram-link');
    if (correspondingLinkId) {
        const targetLink = webview.locator(`[data-testid="${correspondingLinkId}"]`);
        await scrollLinkIntoView(targetLink);
        await targetLink.hover({ force: true });
        await page.page.waitForTimeout(200);
    }
    await addBtns.nth(targetBtnIdx).click({ force: true });
    await webview.getByTestId('side-panel').waitFor({ state: 'visible', timeout: 30000 });
}


export default function createTests() {
    test.describe.serial('Automation Flow Nodes Tests', {}, async () => {
        initTest(true, true, undefined, undefined, AUTOMATION_PROJECT_TEMPLATE);

        test('Flow Nodes builds Statement and Control nodes from diagram', async () => {
            logStep('Open the pre-baked Automation via the Entry Points tree item');
            // Cold start on a fresh fixture: the sidebar tree isn't guaranteed
            // to be the active viewlet yet and the LS needs time to index the
            // project.
            await waitForBISidebarTreeView(page, 60000);
            const projectExplorer = new ProjectExplorer(page.page);
            await projectExplorer.init().catch(() => undefined);
            await page.page
                .locator(ProjectExplorer.treeItemSelector(DEFAULT_PROJECT_NAME))
                .first()
                .waitFor({ timeout: 90000 });
            const mainEntryPoint = await projectExplorer.findItem([DEFAULT_PROJECT_NAME, 'Entry Points', 'main']);
            await mainEntryPoint.click();

            const artifactWebView = await switchToIFrame(BI_INTEGRATOR_LABEL, page.page, 30000);
            if (!artifactWebView) {
                throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
            }

            await artifactWebView.locator('[data-testid="bi-diagram-canvas"]').waitFor({ state: 'visible', timeout: 30000 });

            const diagram = new Diagram(page.page);
            await diagram.init();
            const sidePanel = new SidePanel(artifactWebView, page.page);
            const form = new Form(page.page, BI_INTEGRATOR_LABEL, artifactWebView);

            logStep('Add Log Info node');
            await diagram.clickAddButtonByIndex(1);
            await selectNode(sidePanel, 'Log Info', 'Logging');
            await form.switchToFormView(false, artifactWebView);
            await fillExEditor(artifactWebView, 'msg', '"flow started"');
            await saveForm(artifactWebView);

            logStep('Add int count Declare Variable node');
            await diagram.clickHoverAddButtonByIndex(1);
            await selectNode(sidePanel, 'Declare Variable');
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'Name*Name of the variable': { type: 'input', value: 'count' },
                    'Type': { type: 'textarea', value: 'int', additionalProps: { clickLabel: true } },
                    'expression': { type: 'cmEditor', value: '1', additionalProps: { clickLabel: true } }
                }
            });
            await saveForm(artifactWebView);

            logStep('Add string msg Declare Variable node');
            await diagram.clickHoverAddButtonByIndex(2);
            await selectNode(sidePanel, 'Declare Variable');
            await form.switchToFormView(false, artifactWebView);
            await form.fill({
                values: {
                    'Name*Name of the variable': { type: 'input', value: 'msg' },
                    'Type': { type: 'textarea', value: 'string', additionalProps: { clickLabel: true } },
                    'expression': { type: 'cmEditor', value: '"started"', additionalProps: { clickLabel: true } }
                }
            });
            await saveForm(artifactWebView);

            logStep('Add Log Debug node');
            await diagram.clickHoverAddButtonByIndex(3);
            await selectNode(sidePanel, 'Log Debug', 'Logging');
            await form.switchToFormView(false, artifactWebView);
            await fillExEditor(artifactWebView, 'msg', 'string `initial ${count} ${msg}`');
            await saveForm(artifactWebView);

            logStep('Add If node with Else block');
            await diagram.clickHoverAddButtonByIndex(4);
            await selectNode(sidePanel, 'If', 'Control');
            await form.switchToFormView(false, artifactWebView);
            await fillFirstCodeMirror(artifactWebView, 'count > 10');
            await clickLinkButtonText(artifactWebView, 'Add Else Block');
            await artifactWebView.getByText('Remove Else Block', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
            await saveForm(artifactWebView);

            logStep('Add Match node');
            await clickNextDiagramPlus(artifactWebView);
            await selectNode(sidePanel, 'Match', 'Control');
            await form.switchToFormView(false, artifactWebView);
            await fillCodeMirror(artifactWebView, 'count', 0);
            await fillCodeMirror(artifactWebView, '1', 1);
            await saveForm(artifactWebView);

            logStep('Add Log Error node');
            await clickNextDiagramPlus(artifactWebView);
            await selectNode(sidePanel, 'Log Error', 'Logging');
            await form.switchToFormView(false, artifactWebView);
            await fillExEditor(artifactWebView, 'msg', '"sample error log"');
            await saveForm(artifactWebView);

            logStep('Add Log Warn node');
            await clickNextDiagramPlus(artifactWebView);
            await selectNode(sidePanel, 'Log Warn', 'Logging');
            await form.switchToFormView(false, artifactWebView);
            await fillExEditor(artifactWebView, 'msg', '"sample warn log"');
            await saveForm(artifactWebView);

            logStep('Add While node');
            await clickNextDiagramPlus(artifactWebView);
            await selectNode(sidePanel, 'While', 'Control');
            await form.switchToFormView(false, artifactWebView);
            await fillFirstCodeMirror(artifactWebView, 'count < 3');
            await saveForm(artifactWebView);

            logStep('Verify generated automation.bal source');
            expectSourceFragments(FileUtils.readProjectFile('automation.bal'));
        });
    });
}
