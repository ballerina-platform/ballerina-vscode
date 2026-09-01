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

// The project explorer's per-category "+" buttons all end in the same place: a
// `BI.project-explorer.add-*` command that calls `handleCommandWithContext(item, <view>)`,
// which navigates the MAIN panel (not the popup) to that view. A view with no `case` in
// MainPanel's router renders nothing at all, so the button silently does nothing — exactly
// what happened to "Workflow Activities" (BIActivityForm), which was routed only in
// PopupPanel.
//
// Rendering MainPanel in jsdom would mean mocking its whole lazy-loaded view graph, so this
// pins the routing contract at the source level instead: every view the explorer's add
// commands open must have a case in MainPanel's switch.

import { readFileSync } from "fs";
import path from "path";

const MAIN_PANEL = path.join(__dirname, "MainPanel.tsx");
const ACTIVATOR = path.join(
    __dirname,
    "..",
    "..",
    "ballerina-extension",
    "src",
    "features",
    "bi",
    "activator.ts"
);

function readViewsOpenedByExplorerCommands(): string[] {
    const source = readFileSync(ACTIVATOR, "utf8");
    const views = new Set<string>();
    const call = /handleCommandWithContext\(\s*item\s*,\s*MACHINE_VIEW\.(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = call.exec(source)) !== null) {
        views.add(match[1]);
    }
    return [...views].sort();
}

function readViewsRoutedByMainPanel(): Set<string> {
    const source = readFileSync(MAIN_PANEL, "utf8");
    const routed = new Set<string>();
    const caseLabel = /case\s+MACHINE_VIEW\.(\w+)\s*:/g;
    let match: RegExpExecArray | null;
    while ((match = caseLabel.exec(source)) !== null) {
        routed.add(match[1]);
    }
    return routed;
}

describe("MainPanel routing", () => {
    it("routes every view the project explorer's add commands open", () => {
        const opened = readViewsOpenedByExplorerCommands();
        // Guards the regex above against a refactor that renames the helper: an empty list
        // would make the assertion below vacuously true.
        expect(opened.length).toBeGreaterThan(5);

        const routed = readViewsRoutedByMainPanel();
        expect(opened.filter((view) => !routed.has(view))).toEqual([]);
    });

    it("routes the workflow activity form", () => {
        // Regression pin for the "Create Activity" flow specifically: the explorer's
        // "Workflow Activities" + button opens BIActivityForm in the main panel.
        expect(readViewsOpenedByExplorerCommands()).toContain("BIActivityForm");
        expect(readViewsRoutedByMainPanel()).toContain("BIActivityForm");
    });
});
