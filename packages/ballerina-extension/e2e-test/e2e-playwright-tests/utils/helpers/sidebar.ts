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

import { ExtendedPage } from "@wso2/playwright-vscode-tester";
import { BI_INTEGRATOR_LABEL, BI_SIDEBAR_VIEW_ID } from "./constants";

/**
 * Wait until BI extension sidebar tree container is available.
 *
 * After a window reload the BI view container is not guaranteed to be the
 * active viewlet — newer VS Code versions don't reliably restore the last
 * open view, so its DOM is absent and a passive wait would time out. We first
 * actively open the WSO2 Integrator activity-bar view (mirroring how
 * ProjectExplorer.init() opens it), then wait for its pane to attach.
 */
export async function waitForBISidebarTreeView(page: ExtendedPage, timeout: number = 30000): Promise<void> {
    const selectors = [
        `div.composite.viewlet#${BI_SIDEBAR_VIEW_ID} div.monaco-pane-view`,
        `div.composite.viewlet[id^="${BI_SIDEBAR_VIEW_ID}"] div.monaco-pane-view`,
        `div.composite.viewlet#${BI_SIDEBAR_VIEW_ID}`,
        `div.composite.viewlet[id^="${BI_SIDEBAR_VIEW_ID}"]`,
    ];

    // On a cold start the extension can still be activating, so the activity
    // tab does not exist on the first pass. Retry the open on every iteration:
    // giving up after a single attempt leaves the viewlet unopened, and the
    // selector polling below then waits out the full budget for a view that
    // nobody ever asked for.
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const activityTab = page.page.locator(`[role="tab"][aria-label="${BI_INTEGRATOR_LABEL}"]`).first();
        if (await activityTab.isVisible().catch(() => false)) {
            const isActive = await activityTab.evaluate((el) => el.classList.contains('checked')).catch(() => false);
            if (!isActive) {
                await activityTab.click().catch(() => { });
            }
        }

        for (const selector of selectors) {
            const attached = await page.page
                .waitForSelector(selector, { timeout: 1000, state: 'attached' })
                .then(() => true, () => false);
            if (attached) {
                return;
            }
        }
    }

    throw new Error(`BI sidebar tree view not found for id '${BI_SIDEBAR_VIEW_ID}'`);
}
