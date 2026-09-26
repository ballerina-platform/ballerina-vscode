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

import { Locator } from "@playwright/test";
import { domClick } from "./artifacts";

/**
 * Reads the element's real disabled state.
 *
 * Playwright's `isEnabled()` only honours `disabled` on native form controls
 * (`button`, `input`, `select`, ...) or `aria-disabled="true"`. Every Save in
 * the BI webviews is a `<vscode-button disabled>` custom element, so
 * `isEnabled()` reports it as ENABLED and a subsequent `click({ force: true })`
 * is a silent no-op. Read the attributes instead.
 */
export async function isControlDisabled(locator: Locator): Promise<boolean> {
    await locator.waitFor({ state: "attached", timeout: 15000 });
    return locator.evaluate((el: HTMLElement) =>
        el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true');
}

/**
 * Waits until the control is genuinely enabled, and fails with the reason if it
 * never is. Use before clicking any Save: a disabled Save otherwise swallows the
 * click and the test dies 30-60s later somewhere unrelated.
 */
export async function waitUntilEnabled(locator: Locator, label: string, timeout = 15000): Promise<void> {
    const deadline = Date.now() + timeout;
    let disabled = true;
    while (Date.now() < deadline) {
        disabled = await isControlDisabled(locator);
        if (!disabled) {
            return;
        }
        await locator.page().waitForTimeout(250);
    }
    throw new Error(`"${label}" is still disabled after ${timeout}ms — the form is rejecting its current state ` +
        `(a field diagnostic or a missing required value), so clicking it would be a no-op.`);
}

/**
 * Clicks a control and verifies the click actually did something.
 *
 * Distinct from the per-spec `clickUntil(node, expectedLocator, ...)` helpers:
 * this one takes a predicate, so the effect can be an attribute flip or an
 * element disappearing, not only something becoming visible.
 *
 * A bare `.click()` on these webviews can be swallowed three ways: the control is
 * a disabled `vscode-button` (see `isControlDisabled`), an overlay intercepts the
 * coordinate, or the element remounts between resolution and click. All three fail
 * silently. `expectation` describes the observable effect of the click; the click is
 * retried until it holds, and the failure names the control instead of surfacing as
 * an unrelated timeout further down the test.
 *
 * @param locator     control to click
 * @param expectation resolves true once the click has taken effect
 * @param label       what this click is meant to do, used in the failure message
 */
export async function clickUntilEffect(
    locator: Locator,
    expectation: () => Promise<boolean>,
    label: string,
    options: { attempts?: number; settleMs?: number } = {}
): Promise<void> {
    const attempts = options.attempts ?? 3;
    const settleMs = options.settleMs ?? 5000;
    const page = locator.page();

    if (await expectation()) {
        return;
    }

    for (let attempt = 1; attempt <= attempts; attempt++) {
        if (await isControlDisabled(locator)) {
            throw new Error(`${label}: the control is disabled, so the click would be a no-op.`);
        }
        await domClick(locator);

        const deadline = Date.now() + settleMs;
        while (Date.now() < deadline) {
            if (await expectation()) {
                return;
            }
            await page.waitForTimeout(250);
        }
        console.log(`  ↻ ${label}: no effect after attempt ${attempt}/${attempts}, retrying`);
    }

    throw new Error(`${label}: clicked ${attempts} times and the expected effect never happened.`);
}
