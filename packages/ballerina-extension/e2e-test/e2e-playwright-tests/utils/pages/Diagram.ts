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
        await addButton.click({ trial: false, force: true, timeout: 2000 });
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
        // An open side panel can list the same name (the Activities panel's cards); the node is on the canvas.
        let node = matches.last();
        for (const candidate of (await matches.all()).reverse()) {
            if (await candidate.evaluate((e) => !e.closest('[data-testid="side-panel"]')).catch(() => false)) {
                node = candidate;
                break;
            }
        }
        const nodeBox = await node.boundingBox();
        if (!nodeBox) {
            throw new Error(`node '${nodeText}' has no position`);
        }
        // In some diagrams (a resource, inside a do block) the + under a node belongs to an empty node drawn there.
        const centre = nodeBox.x + nodeBox.width / 2;
        for (const button of await frame.locator('[data-testid^="empty-node-add-button"]').all()) {
            const b = await button.boundingBox();
            if (b && Math.abs(b.x + b.width / 2 - centre) < 60 && b.y > nodeBox.y && b.y < nodeBox.y + nodeBox.height + 160) {
                await button.click({ force: true });
                if (!await this.sidePanelOpens(1500)) {
                    await button.dispatchEvent('click');
                }
                await this.expectSidePanel(`the + under '${nodeText}'`);
                return;
            }
        }
        const seen: string[] = [];
        const candidates: Array<{ id: string; top: number; left: number; el: Locator }> = [];
        const textBottom = nodeBox.y + nodeBox.height;
        for (const edge of await frame.locator('[data-testid^="diagram-link-"]').all()) {
            const box = await edge.boundingBox();
            const id = (await edge.getAttribute('data-testid')) ?? '';
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
            throw new Error(`no edge leaves '${nodeText}' (label at y ${Math.round(nodeBox.y)}..${Math.round(textBottom)}; edges ${seen.join(', ')})`);
        }
        await this.clickEdgeAddButton(edge.el, edge.id);
    }

    /**
     * Clicks the + on a branch of the If added last.
     * @param index - The branch's position left to right, -1 for Else.
     */
    public async clickAddButtonOnBranch(index: number): Promise<void> {
        const frame = this.frame();
        const buttons: Array<{ el: Locator; x: number; y: number }> = [];
        const deadline = Date.now() + 30000;
        while (buttons.length === 0 && Date.now() < deadline) {
            for (const el of await frame.locator('[data-testid^="empty-node-add-button"]').all()) {
                const b = await el.boundingBox();
                if (b) {
                    buttons.push({ el, x: b.x, y: b.y });
                }
            }
            if (buttons.length === 0) {
                await this._page.waitForTimeout(500);
            }
        }
        if (buttons.length === 0) {
            throw new Error('no empty node with a + rendered within 30s');
        }
        // The lowest row of empty nodes belongs to the If just added.
        const lowest = Math.max(...buttons.map((b) => b.y));
        const row = buttons.filter((b) => Math.abs(b.y - lowest) < 10).sort((a, b) => a.x - b.x);
        const target = row[index < 0 ? row.length + index : index];
        if (!target) {
            throw new Error(`no + on branch ${index} (found ${row.length})`);
        }
        await target.el.hover({ force: true }).catch(() => undefined);
        await target.el.click({ force: true });
        // A static circle drawn over the button can take the click; a dispatched click reaches the button.
        if (!await this.sidePanelOpens(1500)) {
            await target.el.dispatchEvent('click');
        }
        await this.expectSidePanel(`the + on branch ${index}`);
    }

    // The + on an edge is drawn at its middle and shows only while the pointer is over the edge.
    private async clickEdgeAddButton(edge: Locator, edgeId: string): Promise<void> {
        // Test ids repeat across edges (several are `diagram-link-undefined`): take the button in this edge's subtree.
        const buttonId = edgeId.replace('diagram-link-', 'link-add-button-');
        const button = edge.locator(`xpath=ancestor::*[.//*[@data-testid="${buttonId}"]][1]`)
            .locator(`[data-testid="${buttonId}"]`).first();
        const box = await edge.boundingBox();
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
            await button.dispatchEvent('click').catch(() => undefined);
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
