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

// state-machine-utils.ts imports the real barrel (WebSocket LS client, unloadable under jest)
// and ../stateMachine (needs WorkspaceEdit/Range/createWebviewPanel the shared vscode mock lacks).
jest.mock("@wso2/ballerina-core", () => ({
    MACHINE_VIEW: {},
    DIRECTORY_MAP: {},
    EVENT_TYPE: {},
    FOCUS_FLOW_DIAGRAM_VIEW: {},
    isSamePath: (a: string, b: string) => a === b,
}));

jest.mock("../stateMachine", () => ({
    StateMachine: { context: jest.fn() },
    openView: jest.fn(),
}));

import { shouldSuppressDisruptiveTransition } from "../utils/state-machine-utils";

describe("shouldSuppressDisruptiveTransition", () => {
    // The two `true` rows are the remount storm the guard exists for; the flagged VIEW_UPDATE
    // row is the Back button mid-generation, and done.invoke.showView must never be gated.
    it.each<[string, boolean | undefined, boolean, boolean]>([
        ["VIEW_UPDATE", undefined, true, true],
        ["VIEW_UPDATE", false, true, true],
        ["VIEW_UPDATE", true, true, false],
        ["VIEW_UPDATE", undefined, false, false],
        ["VIEW_UPDATE", true, false, false],
        ["UPDATE_PROJECT_STRUCTURE", undefined, true, true],
        ["UPDATE_PROJECT_STRUCTURE", true, true, false],
        ["UPDATE_PROJECT_STRUCTURE", undefined, false, false],
        ["OPEN_VIEW", undefined, true, false],
        ["OPEN_VIEW", true, true, false],
        ["done.invoke.showView", undefined, true, false],
    ])("%s, userInitiated=%s, generationActive=%s -> suppressed=%s", (type, userInitiated, generationActive, expected) => {
        expect(shouldSuppressDisruptiveTransition({ type, userInitiated }, generationActive)).toBe(expected);
    });
});
