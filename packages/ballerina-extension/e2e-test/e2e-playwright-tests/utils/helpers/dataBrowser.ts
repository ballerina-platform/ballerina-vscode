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

// A frame, frame locator or locator the Data Browser renders in.
type Scope = { locator(selector: string): Locator };

const ROW = '[role="treeitem"]';
const SEARCH = 'vscode-text-field[placeholder="Search Values and Functions"]';
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Opens the Data Browser from the Browse Values button of the field that `field` is, or is inside. */
export async function openDataBrowser(scope: Scope, field: Locator): Promise<void> {
    const container = field.locator('xpath=ancestor-or-self::*[.//button[@aria-label="Browse Values"]][1]');
    await container.getByRole("button", { name: "Browse Values" }).first().click({ force: true });
    await scope.locator(SEARCH).last().waitFor({ state: "visible", timeout: 15000 });
}

/**
 * Picks a value from the open Data Browser: `group` is Inputs or a group the browser lists (Variables, Module Variables,
 * Configurables, Functions); `path` is the value's name, after any records it is a field of. A function is named
 * without its parentheses.
 */
export async function pickFromDataBrowser(scope: Scope, group: string, path: string[]): Promise<void> {
    if (group !== "Inputs") {
        const groupRow = scope.locator(`${ROW}[data-group="${group}"]`).last();
        await groupRow.waitFor({ state: "visible", timeout: 15000 });
        await groupRow.click({ force: true });
    }
    for (const [index, name] of path.entries()) {
        // A row's title is its access path and type: "order.customer?.city:  string".
        const byPath = index === 0 ? `[title^="${name}:"]` : `[aria-level="${index + 1}"][title*=".${name}:"]`;
        const row = scope.locator(`${ROW}${byPath}`)
            .or(scope.locator(ROW).filter({ hasText: new RegExp(`^${escapeRegExp(name)}\\(`) }))
            .last();
        await row.waitFor({ state: "visible", timeout: 15000 });
        if (index === path.length - 1) {
            await row.click({ force: true });
        } else if (await row.getAttribute("aria-expanded") !== "true") {
            await row.locator("span").first().click({ force: true });
        }
    }
}
