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

import { FrameLocator, Page } from "@playwright/test";
import { ExtendedPage, switchToIFrame } from "@wso2/playwright-vscode-tester";
import { BI_INTEGRATOR_LABEL } from "./constants";
import { waitForBISidebarTreeView } from "./sidebar";

// The same frame switchToIFrame finds, as a FrameLocator: it re-resolves on each use, so it outlives a webview or
// window that VS Code replaces, where a held Frame detaches.
export function webviewFrame(page: Page, viewName: string = BI_INTEGRATOR_LABEL): FrameLocator {
    return page.frameLocator('iframe.webview.ready:visible').last().frameLocator(`iframe[title="${viewName}"]`);
}

/**
 * Get webview frame with retry logic
 */
export async function getWebview(viewName: string, page: ExtendedPage) {
    let webview;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
        try {
            await page.page.waitForLoadState('domcontentloaded');
            await page.page.waitForTimeout(1000);

            webview = await switchToIFrame(viewName, page.page);
            if (webview) {
                return webview;
            }
            // If webview is falsy, treat it as a failed attempt
            console.log(`Attempt ${retryCount + 1} failed: switchToIFrame returned ${webview}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('Frame was detached')) {
                console.log(`Frame was detached, retrying (${retryCount + 1}/${maxRetries})`);
            } else {
                console.log(`Attempt ${retryCount + 1} failed to access iframe:`, message);
            }
        }

        // Always increment retry count after each attempt
        retryCount++;

        // Only retry if we haven't reached max retries
        if (retryCount < maxRetries) {
            await page.page.waitForTimeout(2000);
            try {
                await waitForBISidebarTreeView(page);
            } catch (sidebarError) {
                console.log('Failed to verify BI sidebar tree view:', sidebarError);
            }
        }
    }
    throw new Error(`Failed to access iframe for ${viewName} after ${maxRetries} attempts`);
}
