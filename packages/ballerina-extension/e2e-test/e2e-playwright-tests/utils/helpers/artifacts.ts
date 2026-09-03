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

import { Frame, Locator } from "@playwright/test";
import { getWebview } from "./webview";
import { page } from "./setup";
import { BI_INTEGRATOR_LABEL, BI_WEBVIEW_NOT_FOUND_ERROR } from "./constants";

/**
 * Clicks a locator via the DOM `click()` method instead of a coordinate-based
 * mouse click. The floating Copilot orb (AgentStatusOrb) is fixed-position,
 * docks at the webview's bottom-center by default, and sits ABOVE page
 * content (z-index 10000) — the wizard's Configure-step submit button is a
 * full-width, bottom-pinned "footer action button" (see ArtifactForm's
 * `footerActionButton`), so its center point can coincide exactly with the
 * orb's. A coordinate click there — even with `force: true`, which only
 * skips Playwright's actionability checks, not real hit-testing — lands on
 * the orb instead and silently opens its mini chat rather than submitting
 * the form. Dispatching through the DOM node bypasses hit-testing entirely.
 */
export async function domClick(locator: Locator): Promise<void> {
    await locator.waitFor({ state: "attached", timeout: 15000 });
    await locator.evaluate((el: HTMLElement) => el.click());
}

// Tail-anchored: a codicon glyph prefixes the header button's name, and stopping at "Artifact"
// keeps that pattern from also matching "…Artifact manually".
const ADD_ARTIFACT_ROUTES = [
    { label: 'Add Artifact manually', name: /Add Artifact manually$/i },
    { label: 'Add Artifact', name: /Add Artifact$/i },
] as const;

/**
 * Add an artifact to the project. A card click in the picker goes straight to the form.
 *
 * An "Add Integration" button is a failure, not an alternative. It opens the creation
 * wizard's Type step — a card picker restricted to the kinds the wizard supports, sharing the
 * flat picker's card ids but needing an explicit "Next" — so a helper that followed it would
 * keep passing against a second entry point the overview is not meant to have.
 */
export async function addArtifact(artifactName: string, testId: string) {
    console.log(`Adding artifact: ${artifactName}`);
    const artifactWebView = await getWebview(BI_INTEGRATOR_LABEL, page);
    if (!artifactWebView) {
        throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
    }
    const addArtifactBtn = artifactWebView.getByRole('button', { name: /Add Artifact/i });
    await addArtifactBtn.waitFor({ timeout: 30000 });
    // Report the route only. Selecting on it instead would change what gets clicked, and this
    // helper front-runs every artifact spec, so a wrong guess breaks the whole suite.
    for (const route of ADD_ARTIFACT_ROUTES) {
        if (await artifactWebView.getByRole('button', { name: route.name }).count() > 0) {
            console.log(`  via "${route.label}"`);
        }
    }

    // `force` throughout — the floating Copilot orb/invite box intermittently overlaps
    // and intercepts pointer events on cards and buttons across these views.
    await addArtifactBtn.click({ force: true });
    const card = artifactWebView.locator(`#${testId}`);
    await card.waitFor();
    await domClick(card);
}

/**
 * Add an artifact and return its just-opened creation webview. Shared by
 * every artifact's create test — `addArtifact` followed by an iframe fetch
 * is identical across artifact types.
 */
export async function createArtifactAndGetWebview(artifactName: string, testId: string) {
    await addArtifact(artifactName, testId);
    return getWebview(BI_INTEGRATOR_LABEL, page);
}

/**
 * Submits the artifact creation form shown after `addArtifact`/
 * `createArtifactAndGetWebview` — "Create" in the in-project form, "Create
 * Integration" in the wizard's Configure step (reached on a still-empty
 * integration). MUST use `domClick`, not a coordinate click: unlike the
 * in-project form's button, the wizard's is a full-width footer action
 * button (see ArtifactForm's `footerActionButton`) whose center sits exactly
 * where the floating Copilot orb docks by default, so a coordinate click —
 * even with `force: true` — can silently land on the orb instead and open its
 * mini chat rather than submitting the form.
 */
export async function submitArtifactCreation(webview: Frame): Promise<void> {
    const submitBtn = webview.getByRole('button', { name: /^Create( Integration)?$/ });
    await submitBtn.waitFor({ state: 'visible', timeout: 60000 });
    await domClick(submitBtn);
}

/**
 * Enable ICP (Integration Control Plane)
 */
export async function enableICP() {
    console.log('Enabling ICP');
    const webview = await getWebview(BI_INTEGRATOR_LABEL, page);
    if (!webview) {
        throw new Error(BI_WEBVIEW_NOT_FOUND_ERROR);
    }
    const icpToggle = webview.getByRole('checkbox', { name: 'Enable ICP monitoring' });
    await icpToggle.waitFor();
    if (!(await icpToggle.isChecked())) {
        await icpToggle.click();
    }
}
