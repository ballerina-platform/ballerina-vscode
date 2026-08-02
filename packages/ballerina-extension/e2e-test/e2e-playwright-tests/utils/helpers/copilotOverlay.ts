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

import { Frame } from "@playwright/test";

/**
 * Get the Copilot orb's floating surfaces out of the way.
 *
 * The orb (AgentStatusOrb) renders unconditionally in visualizer mode and docks
 * bottom-centre by default, so its two overlays sit on top of the webview:
 *
 *  - the invite box ("How can I help?"), shown whenever the orb is idle, which
 *    covers form footers — including Save;
 *  - the mini chat panel, which covers the middle of the view once opened.
 *
 * `click({ force: true })` does not help: force skips Playwright's actionability
 * checks but still dispatches at the target's coordinates, so the event lands on
 * whichever element is topmost — the overlay. The click is then silently swallowed
 * and, worse, a click that lands on the orb itself toggles the mini chat open for
 * every later test in the file.
 *
 * Best-effort by design: an absent overlay is the normal case, so nothing here
 * throws or waits long enough to matter.
 */
export async function dismissCopilotOverlay(webview: Frame | null): Promise<void> {
    if (!webview) {
        return;
    }

    const clickIfPresent = async (ariaLabel: string, timeout: number): Promise<boolean> => {
        const button = webview.locator(`button[aria-label="${ariaLabel}"]`).first();
        const present = await button.waitFor({ state: 'visible', timeout }).then(() => true, () => false);
        if (present) {
            await button.click({ timeout: 5000 }).catch(() => { });
        }
        return present;
    };

    // Close the mini chat first: `showInvite` requires `!miniOpen`, so while the
    // panel is open the invite box does not exist to be hidden.
    const closedMiniChat = await clickIfPresent('Close the mini chat', 1000);

    // Having just closed the panel, give React a moment to re-render the invite —
    // checking immediately would find nothing and leave it covering the footer.
    // Collapsing it is only sticky while the pointer stays off the orb
    // (`showInvite` re-expands on hover), so callers landing near the bottom-centre
    // dock should not rely on coordinates alone.
    await clickIfPresent('Hide the copilot prompt', closedMiniChat ? 3000 : 1000);
}
