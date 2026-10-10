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

import { Locator, Page } from "@playwright/test";
import { BI_INTEGRATOR_LABEL } from "../helpers/constants";

export class ProjectExplorer {
    private explorer!: Locator;

    constructor(private page: Page) {
        this.explorer = this.page.getByRole('tree').locator('div').first();
    }

    /**
     * Builds a tree-item selector that tolerates VS Code appending a
     * ", <description>" suffix to the aria-label (behaviour introduced in
     * newer VS Code versions). Matches either the exact label or the label
     * followed by the ", " separator, so it works on old and new VS Code.
     */
    public static treeItemSelector(label: string): string {
        // Escape backslashes and double quotes so labels that themselves
        // contain quotes (e.g. `RabbitMQ Event Integration - "myQueue"`) don't
        // produce a malformed double-quoted CSS attribute selector.
        const escaped = label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `div[role="treeitem"][aria-label="${escaped}"], div[role="treeitem"][aria-label^="${escaped}, "]`;
    }

    public async init() {
        const wso2IntegratorActivityTab = this.page.locator(`[role="tab"][aria-label="${BI_INTEGRATOR_LABEL}"]`).first();
        const isChecked = await wso2IntegratorActivityTab.evaluate((el) => el.classList.contains('checked'));
        if (!isChecked) {
            await wso2IntegratorActivityTab.click();
        }
    }

    public async findItem(path: string[], timeout: number = 5000) {
        let currentItem;
        for (let i = 0; i < path.length; i++) {

            currentItem = this.explorer.locator(ProjectExplorer.treeItemSelector(path[i]));
            await currentItem.waitFor({ timeout });
        }
        return currentItem;
    }

    // Without a name, the integration at the root of the tree.
    public async goToOverview(projectName?: string) {
        const projectExplorerRoot = projectName === undefined
            ? this.page.locator('[role=treeitem][aria-level="1"]').filter({ visible: true }).first()
            : this.explorer.locator(ProjectExplorer.treeItemSelector(projectName));
        await projectExplorerRoot.waitFor();
        await projectExplorerRoot.hover();
        // Builds name the action on the row Open View, or put Open Overview on the view's title bar.
        const locator = this.explorer.getByLabel('Open View')
            .or(this.page.getByRole('button', { name: 'Open Overview' })).filter({ visible: true }).first();
        await locator.waitFor();
        await this.page.waitForTimeout(500); // To fix intermittent issues
        await locator.click();
    }

    // The row for an item anywhere in the tree, opening collapsed groups and refreshing a tree that lags behind an
    // artifact just added; undefined when the tree does not list it.
    public async findItemExpanding(item: string): Promise<Locator | undefined> {
        const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const row = this.page.getByRole('treeitem', { name: new RegExp(`^${escaped}(\\b|$)`) }).first();
        const visible = () => row.isVisible().catch(() => false);
        const expand = async () => {
            const collapsed = this.page.locator('[role=treeitem][aria-expanded=false]').filter({ visible: true });
            for (let i = 0; i < 12 && !await visible() && await collapsed.count() > 0; i++) {
                await collapsed.first().click({ force: true }).catch(() => undefined);
                await this.page.waitForTimeout(400);
            }
        };
        await expand();
        for (let i = 0; i < 2 && !await visible(); i++) {
            await this.page.getByRole('button', { name: /^Refresh/ }).filter({ visible: true }).first().click().catch(() => undefined);
            await this.page.waitForTimeout(3000);
            await expand();
        }
        return await visible() ? row : undefined;
    }

    public async refresh(projectName: string) {
        await this.page.getByRole('treeitem', { name: projectName }).hover();
        const refreshBtn = this.page.getByRole('button', { name: 'Refresh' });
        await refreshBtn.click();
        // Open overview
        const openOverviewBtn = this.page.getByRole('button', { name: 'Open Overview' });
        await openOverviewBtn.click();
    }
}
