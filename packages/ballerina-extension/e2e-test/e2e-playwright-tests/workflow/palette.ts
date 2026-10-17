/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
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
import { expect } from '@playwright/test';
import type { Frame, Locator } from '@playwright/test';
import { page } from '../utils/helpers';
import { SidePanel } from '../utils/pages';

// Shared between the workflow specs: opening the node palette below a node, and filling the control under a
// form label. Lifted out of workflow-forms.spec.ts once a second spec needed them.

// The control under a form label: the nearest ancestor of the label text that holds a control, then that
// control. Covers text fields, web-component fields, dropdowns and CodeMirror editors, which the Await Data
// entry's Data Type is (the side panel also holds the form's own numeric editor, so the label is the anchor).
export function controlUnder(scope: Locator, label: string): Locator {
    const labelText = `translate(normalize-space(.), '*', '')='${label}'`;
    const controls = 'self::input or self::textarea or self::vscode-text-field or self::vscode-text-area or self::vscode-dropdown '
        + 'or self::select or @role="combobox" or @role="textbox" or contains(@class,"cm-content")';
    return scope.locator(`xpath=.//*[not(self::script)][${labelText}][not(.//*[${labelText}])]`).first()
        .locator(`xpath=ancestor::*[.//*[${controls}]][1]`)
        .locator(`xpath=.//*[${controls}]`).filter({ visible: true }).first();
}

export async function fillUnderLabel(scope: Locator, label: string, value: string): Promise<void> {
    let input = controlUnder(scope, label);
    await input.waitFor({ state: 'visible', timeout: 30000 });
    const kind = await input.evaluate((e) => (e.classList.contains('cm-content') || e.closest('.cm-editor') ? 'cm' : e.tagName.toLowerCase()));
    if (kind === 'cm') {
        await input.evaluate((element, text) => {
            const view = (element as HTMLElement & { cmView?: { view?: any } }).cmView?.view;
            if (!view) {
                throw new Error('CodeMirror view not found under the label');
            }
            view.focus();
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
        }, value);
        await expect.poll(() => input.textContent(), { timeout: 10000 }).toBe(value);
    } else {
        if (kind === 'vscode-text-field' || kind === 'vscode-text-area') {
            input = input.locator('input, textarea').first();
        }
        // Explicit timeouts: the suite's actions otherwise wait without limit and a stuck one burns the
        // 20-minute test budget three times over, past the e2e job's limit.
        await input.click({ timeout: 10000 });
        await input.fill('', { timeout: 10000 });
        await input.pressSequentially(value, { timeout: 10000 });
        await expect.poll(() => input.inputValue(), { timeout: 10000 }).toBe(value);
    }
    await page.page.waitForTimeout(400);
    // The type helper popup stays open over the fields below it; the next click would land in it.
    await page.page.keyboard.press('Escape');
}

export const sidePanelOpens = (webview: Frame, timeout: number) =>
    webview.getByTestId('side-panel').filter({ visible: true }).last()
        .waitFor({ state: 'visible', timeout }).then(() => true, () => false);

// Opens the node palette from the + below a node. A diagram that already has steps draws a trailing empty
// node with its own +; a fresh one (Start to End) only shows a + on the edge leaving Start while it is hovered.
// Right after a save the diagram redraws, and on a loaded runner the model takes a while to come back, so the
// helper waits for whichever of the two anchors the diagram draws first.
export async function openPaletteBelow(webview: Frame, nodeText: string): Promise<SidePanel> {
    const canvas = webview.getByTestId('bi-diagram-canvas');
    await canvas.waitFor({ timeout: 60000 });
    const sidePanel = new SidePanel(webview, page.page);
    const emptyNodeButton = canvas.locator('[data-testid^="empty-node-add-button"]').first();
    const node = canvas.getByText(nodeText, { exact: true }).filter({ visible: true }).last();
    // The named node is drawn before the trailing +, so once it shows the + still gets a grace period:
    // only a fresh Start-to-End diagram has none, and that one takes the edge fallback.
    const deadline = Date.now() + 120000;
    let nodeSeenAt: number | undefined;
    let hasEmptyNode = false;
    while (Date.now() < deadline) {
        if (await emptyNodeButton.isVisible().catch(() => false)) {
            hasEmptyNode = true;
            break;
        }
        if (await node.isVisible().catch(() => false)) {
            nodeSeenAt ??= Date.now();
            if (Date.now() - nodeSeenAt > 15000) {
                break;
            }
        }
        await page.page.waitForTimeout(1000);
    }
    if (hasEmptyNode) {
        // The + can be redrawn between the check and the click; a few tries before the edge fallback.
        for (let attempt = 0; attempt < 3; attempt++) {
            await emptyNodeButton.click({ force: true, timeout: 5000 })
                .catch(() => emptyNodeButton.dispatchEvent('click', undefined, { timeout: 5000 }).catch(() => undefined));
            if (await sidePanelOpens(webview, 5000)) {
                await sidePanel.init();
                return sidePanel;
            }
        }
    }
    await node.waitFor({ state: 'visible', timeout: 60000 });
    const nodeBox = await node.boundingBox();
    if (!nodeBox) {
        throw new Error(`node '${nodeText}' has no position`);
    }
    const nodeBottom = nodeBox.y + nodeBox.height;
    for (let attempt = 0; attempt < 3; attempt++) {
        // The edge leaving the node starts at or just above its label and runs on below it.
        for (const edge of await webview.locator('[data-testid^="diagram-link-"]').all()) {
            const box = await edge.boundingBox();
            if (!box || box.y < nodeBox.y - 40 || box.y > nodeBottom + 90 || box.y + box.height <= nodeBottom + 15) {
                continue;
            }
            const buttonId = ((await edge.getAttribute('data-testid')) ?? '').replace('diagram-link-', 'link-add-button-');
            const button = webview.locator(`[data-testid="${buttonId}"]`).first();
            // Hovered by position: an edge path can measure fine yet count as invisible to Playwright.
            await page.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            // The + is drawn on hover; give it time to render before falling back to a click on the edge.
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

// A palette item of a section. The section's state is remembered, so a click on its header while the items
// are still rendering collapses it: give the item time first, then toggle.
export async function paletteItem(sidePanel: SidePanel, section: string, label: string): Promise<Locator> {
    const panel = sidePanel.getLocator();
    const item = panel.getByText(label, { exact: true }).last();
    const shows = (ms: number) => item.waitFor({ state: 'visible', timeout: ms }).then(() => true, () => false);
    for (let attempt = 0; attempt < 2 && !await shows(10000); attempt++) {
        await sidePanel.expandSection(section);
    }
    if (!await shows(30000)) {
        const shown = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400);
        throw new Error(`the palette does not offer ${label} under ${section}; the panel shows: ${shown}`);
    }
    return item;
}

// The palette item of the Workflow section.
export function workflowPaletteItem(sidePanel: SidePanel, label: string): Promise<Locator> {
    return paletteItem(sidePanel, 'Workflow', label);
}
