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

import * as vscode from "vscode";

import { isWebSearchEnabled } from "../features/ai/agent/tools/web-search-setting";

const ws = vscode.workspace as any;
const originalGetConfiguration = ws.getConfiguration;

/** Stubs the `ballerina` section so `get` returns the given effective value, or the caller's default. */
function stubSetting(effective: boolean | undefined) {
    ws.getConfiguration = () => ({
        get: (_key: string, defaultValue?: boolean) => effective ?? defaultValue,
        inspect: () => undefined,
        update: () => Promise.resolve(),
    });
}

afterEach(() => {
    ws.getConfiguration = originalGetConfiguration;
});

// Writes go through the settings panel's generic Copilot toggle (setCopilotToggleSetting), which
// updates the workspace value when the workspace sets one.
describe("web search setting", () => {
    it("is on by default", () => {
        stubSetting(undefined);
        expect(isWebSearchEnabled()).toBe(true);
    });

    it("follows an explicit value", () => {
        stubSetting(false);
        expect(isWebSearchEnabled()).toBe(false);
    });
});
