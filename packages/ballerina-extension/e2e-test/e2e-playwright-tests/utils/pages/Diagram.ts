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

import { Frame, FrameLocator, Locator, Page } from '@playwright/test';
import { switchToIFrame } from '@wso2/playwright-vscode-tester';
import { BI_INTEGRATOR_LABEL } from '../helpers';

export class Diagram {
    private diagramWebView!: Frame;

    // A webview passed here is used as is; otherwise init() finds it.
    constructor(private _page: Page, private webview?: Frame | FrameLocator) { }

    public async init() {
        const webview = await switchToIFrame(BI_INTEGRATOR_LABEL, this._page);
        if (!webview) {
            throw new Error('Failed to switch to Diagram View iframe');
        }
        this.diagramWebView = webview;
    }

    public getDigramWebView(): Frame {
        return this.diagramWebView;
    }

    /**
     * Used when the plus button is not visible initially. This will hover the link and click on the plus button.
     * @param index - Index of the link to hover and click on the plus button. This can be found via the data-testid of the link. It will have the format `diagram-link-${index}`
     */
    public async clickHoverAddButtonByIndex(index: number): Promise<void> {
        const link = (await this.getDiagramContainer()).getByTestId(`diagram-link-${index}`);
        await link.waitFor();
        await link.hover();

        const addButton = link.getByTestId(`link-add-button-${index}`);

        // Wait for the add button to become visible and stable
        await addButton.waitFor({
            state: 'visible',
            timeout: 5000
        });

        // Try clicking with retries if needed, to handle instability
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                await addButton.click({ trial: false, force: true, timeout: 2000 });
                return;
            } catch (err) {
                // Wait a bit and retry as element may not be stable/visible yet
                await this._page.waitForTimeout(500);
            }
        }
        // Last attempt: throw for diagnostic
        await addButton.click({ trial: false, force: true, timeout: 2000 });
    }

    /**
     * Used when the plus button is visible. This will click on the plus button.
     * @param index - Index of the plus button to click. This can be found via the data-testid of the plus button. It will have the format `empty-node-add-button-${index}`
     */
    public async clickAddButtonByIndex(index: number): Promise<void> {
        const addButton = (await this.getDiagramContainer()).getByTestId(`empty-node-add-button-${index}`);
        // The empty node is drawn once the diagram has settled after a save; give it the time the canvas needs.
        await addButton.waitFor({ state: 'visible', timeout: 30000 });
        await addButton.click({ trial: false, force: true, timeout: 5000 })
            .catch(() => addButton.dispatchEvent('click', undefined, { timeout: 1000 }));
    }

    /**
     * Clicks the + below a node found by its text: on the edge leaving it, or on the empty node drawn under it.
     * @param nth - Picks among several outgoing edges, left to right.
     */
    public async clickAddButtonBelow(nodeText: string | RegExp, nth = 0): Promise<void> {
        const frame = this.frame();
        // Only the canvas: the breadcrumb names the open diagram too, before that diagram has drawn.
        const canvas = frame.getByTestId('bi-diagram-canvas');
        const matches = (typeof nodeText === 'string' ? canvas.getByText(nodeText, { exact: true }) : canvas.getByText(nodeText))
            .filter({ visible: true });
        await matches.last().waitFor({ state: 'visible', timeout: 60000 });
        // A save redraws the canvas: the node can be replaced while it is measured, and the edge leaving it can be
        // laid out after the node shows. Measure again until the layout holds.
        const deadline = Date.now() + 30000;
        let reason: Error = new Error(`node '${nodeText}' not found`);
        for (;;) {
            const found = await this.findAddButtonBelow(matches, nodeText, nth);
            if (typeof found !== 'string') {
                try {
                    await found();
                    return;
                } catch (error) {
                    // The redraw can replace the measured edge or button before the click lands, so the click
                    // reaches a detached element and no panel opens. Measure again rather than fail on it.
                    reason = error instanceof Error ? error : new Error(String(error));
                }
            } else {
                reason = new Error(found);
            }
            if (Date.now() >= deadline) {
                throw reason;
            }
            await this._page.waitForTimeout(500);
        }
    }

    // The action that clicks the + below the node, or why none could be found in the current layout.
    private async findAddButtonBelow(matches: Locator, nodeText: string | RegExp, nth: number): Promise<(() => Promise<void>) | string> {
        const frame = this.frame();
        // An open side panel can list the same name (the Activities panel's cards); the node is on the canvas.
        let node = matches.last();
        for (const candidate of (await matches.all()).reverse()) {
            const onCanvas = candidate.evaluate((e) => !e.closest('[data-testid="side-panel"]'), undefined, { timeout: 1000 });
            if (await onCanvas.catch(() => false)) {
                node = candidate;
                break;
            }
        }
        const nodeBox = await node.boundingBox({ timeout: 1000 }).catch(() => null);
        if (!nodeBox) {
            return `node '${nodeText}' has no position`;
        }
        // In some diagrams (a resource, inside a do block) the + under a node belongs to an empty node drawn there.
        const centre = nodeBox.x + nodeBox.width / 2;
        for (const button of await frame.locator('[data-testid^="empty-node-add-button"]').all()) {
            const b = await button.boundingBox({ timeout: 1000 }).catch(() => null);
            if (b && Math.abs(b.x + b.width / 2 - centre) < 60 && b.y > nodeBox.y && b.y < nodeBox.y + nodeBox.height + 160) {
                return async () => {
                    await button.click({ force: true });
                    if (!await this.sidePanelOpens(1500)) {
                        await button.dispatchEvent('click', undefined, { timeout: 1000 }).catch(() => undefined);
                    }
                    await this.expectSidePanel(`the + under '${nodeText}'`);
                };
            }
        }
        const seen: string[] = [];
        const candidates: Array<{ id: string; top: number; left: number; el: Locator }> = [];
        const textBottom = nodeBox.y + nodeBox.height;
        for (const edge of await frame.locator('[data-testid^="diagram-link-"]').all()) {
            const box = await edge.boundingBox({ timeout: 1000 }).catch(() => null);
            const id = (await edge.getAttribute('data-testid', { timeout: 1000 }).catch(() => null)) ?? '';
            seen.push(`${id}@${box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}` : 'none'}`);
            // An edge leaving the node starts at or a little above the label and runs on below it; edges into the
            // node end above the label, side arrows stay level.
            if (box && box.y >= nodeBox.y - 40 && box.y <= textBottom + 90 && box.y + box.height > textBottom + 15) {
                candidates.push({ id, top: box.y, left: box.x, el: edge });
            }
        }
        // The topmost such edge is the one leaving this node; for several at the same height, left to right.
        candidates.sort((a, b) => (Math.abs(a.top - b.top) < 5 ? a.left - b.left : a.top - b.top));
        const edge = candidates[nth];
        if (!edge) {
            return `no edge leaves '${nodeText}' (label at y ${Math.round(nodeBox.y)}..${Math.round(textBottom)}; edges ${seen.join(', ')})`;
        }
        return () => this.clickEdgeAddButton(edge.el, edge.id);
    }

    /**
     * Clicks the + on a branch of the If added last.
     * @param index - The branch's position left to right, -1 for Else.
     */
    public async clickAddButtonOnBranch(index: number): Promise<void> {
        // The If was just saved, and a save redraws the canvas: the row of empty nodes under it can be measured
        // before the redraw replaces it, and a click on the replaced element reaches nothing. Click only once two
        // readings of the row agree, and after a click that opened no panel measure again instead of clicking the
        // element already seen.
        const deadline = Date.now() + 30000;
        let previous: string | undefined;
        let reason = 'no empty node with a + rendered';
        while (Date.now() < deadline) {
            const row = await this.lowestEmptyNodeRow();
            const key = row.map((b) => `${Math.round(b.x)},${Math.round(b.y)}`).join(' ');
            if (row.length === 0 || key !== previous) {
                previous = key;
                reason = row.length === 0 ? 'no empty node with a + rendered' : 'the row of empty nodes kept moving';
                await this._page.waitForTimeout(500);
                continue;
            }
            const target = row[index < 0 ? row.length + index : index];
            if (!target) {
                throw new Error(`no + on branch ${index} (found ${row.length})`);
            }
            await target.el.hover({ force: true }).catch(() => undefined);
            await target.el.click({ force: true, timeout: 3000 }).catch(() => undefined);
            if (await this.sidePanelOpens(1500)) {
                return;
            }
            // A static circle drawn over the button can take the click; a dispatched click reaches the button.
            await target.el.dispatchEvent('click', undefined, { timeout: 1000 }).catch(() => undefined);
            if (await this.sidePanelOpens(1500)) {
                return;
            }
            reason = `the + on branch ${index} did not open the side panel`;
            previous = undefined;
        }
        throw new Error(`${reason} within 30s`);
    }

    // The lowest row of empty nodes with a +, left to right; it belongs to the If added last.
    private async lowestEmptyNodeRow(): Promise<Array<{ el: Locator; x: number; y: number }>> {
        const buttons: Array<{ el: Locator; x: number; y: number }> = [];
        for (const el of await this.frame().locator('[data-testid^="empty-node-add-button"]').all()) {
            const b = await el.boundingBox({ timeout: 1000 }).catch(() => null);
            if (b) {
                buttons.push({ el, x: b.x, y: b.y });
            }
        }
        if (buttons.length === 0) {
            return [];
        }
        const lowest = Math.max(...buttons.map((b) => b.y));
        return buttons.filter((b) => Math.abs(b.y - lowest) < 10).sort((a, b) => a.x - b.x);
    }

    // The + on an edge is drawn at its middle and shows only while the pointer is over the edge.
    private async clickEdgeAddButton(edge: Locator, edgeId: string): Promise<void> {
        // Test ids repeat across edges (several are `diagram-link-undefined`): take the button in this edge's subtree.
        const buttonId = edgeId.replace('diagram-link-', 'link-add-button-');
        const button = edge.locator(`xpath=ancestor::*[.//*[@data-testid="${buttonId}"]][1]`)
            .locator(`[data-testid="${buttonId}"]`).first();
        const box = await edge.boundingBox({ timeout: 1000 }).catch(() => null);
        if (box) {
            // Hovered by position: an edge path can measure fine yet count as invisible to Playwright.
            await this._page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await this._page.waitForTimeout(400);
        }
        const clickMiddle = async () => {
            if (box) {
                await this._page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            }
        };
        // A redraw can hide the button between seeing it and clicking it; it is drawn at the edge's middle.
        if (await button.isVisible().catch(() => false)) {
            await button.click({ force: true, timeout: 3000 }).catch(clickMiddle);
        } else {
            await clickMiddle();
        }
        for (let attempt = 0; attempt < 3 && !await this.sidePanelOpens(800); attempt++) {
            await button.dispatchEvent('click', undefined, { timeout: 1000 }).catch(() => undefined);
        }
        await this.expectSidePanel(`the + on ${edgeId}`);
    }

    // Fails at the click that did not open the node panel, rather than at the next step.
    private async expectSidePanel(what: string): Promise<void> {
        if (!await this.sidePanelOpens(5000)) {
            throw new Error(`${what} did not open the side panel`);
        }
    }

    private sidePanelOpens(timeout: number): Promise<boolean> {
        return this.frame().getByTestId('side-panel').filter({ visible: true }).last()
            .waitFor({ state: 'visible', timeout }).then(() => true, () => false);
    }

    private frame(): Frame | FrameLocator {
        const frame = this.webview ?? this.diagramWebView;
        if (!frame) {
            throw new Error('Diagram has no webview: pass one to the constructor or call init()');
        }
        return frame;
    }

    private async getDiagramContainer(): Promise<Locator> {
        const container = this.diagramWebView.getByTestId('bi-diagram-canvas');
        await container.waitFor();
        return container;
    }
}
