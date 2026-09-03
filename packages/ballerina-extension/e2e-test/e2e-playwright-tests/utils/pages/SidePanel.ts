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

import { Frame, Locator, Page } from "@playwright/test";
import { domClick } from "../helpers";

export class SidePanel {
    private sidePanel!: Locator;

    constructor(private _container: Frame, private _page: Page) { }

    public async init() {
        this.sidePanel = this._container.getByTestId('side-panel');
        await this.sidePanel.waitFor();
    }

    public getLocator(): Locator {
        return this.sidePanel;
    }

    /**
     * Click on a node in the side panel by title
     * @param nodeTitle - Title of the node to click. This can be found via the title attribute of the node.
     */
    public async clickNode(nodeTitle: string): Promise<void> {
        const isVisibleWithin = (locator: Locator, timeout: number) =>
            locator.waitFor({ state: 'visible', timeout }).then(() => true, () => false);
        let nodeContainer = this.getLocator().getByText(nodeTitle, { exact: true }).last();
        if (!await isVisibleWithin(nodeContainer, 3000)) {
            const search = this.getLocator().locator('input[placeholder*="Search"], input[type="text"]').first();
            if (await isVisibleWithin(search, 5000)) {
                await search.fill(nodeTitle);
                await this._page.waitForTimeout(1200);
                nodeContainer = this.getLocator().getByText(nodeTitle, { exact: true }).last();
            }
        }
        await nodeContainer.waitFor({ state: 'visible', timeout: 30000 });
        // domClick — the floating Copilot orb/invite box has been observed to
        // overlap and intercept pointer events on nodes in this panel.
        await domClick(nodeContainer);
    }

    /**
     * Expand a section in the side panel by title
     * @param sectionTitle - Title of the section to expand. This can be found via the title attribute of the section.
     */
    public async expandSection(sectionTitle: string): Promise<void> {
        const sectionContainer = this.getLocator().getByText(sectionTitle, { exact: true });
        try {
            await sectionContainer.click({ timeout: 5000 });
        } catch {
            // Fall back to domClick if a VS Code overlay (e.g. notification popup,
            // the Copilot orb) is blocking the element.
            await domClick(sectionContainer);
        }
    }
}
