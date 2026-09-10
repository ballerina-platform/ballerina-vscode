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

// A restore spans several awaits, and anything that starts a run or reparents the active thread in
// that window corrupts the chat store. The refusal has to live here rather than in the panel, so
// this pins the mechanism the RPC layer and the agent both call.

import {
    assertNoRestoreInProgress,
    beginRestore,
    endRestore,
    isRestoreInProgress,
} from "../views/ai-panel/checkpoint/restore-state";

const WORKSPACE = "/ws/orders";
const OTHER_WORKSPACE = "/ws/payments";

describe("restore-in-progress guard", () => {
    afterEach(() => {
        endRestore(WORKSPACE);
        endRestore(OTHER_WORKSPACE);
    });

    it("refuses while a restore holds the workspace and allows it again afterwards", () => {
        expect(() => assertNoRestoreInProgress(WORKSPACE, "generateAgent")).not.toThrow();

        beginRestore(WORKSPACE);
        expect(isRestoreInProgress(WORKSPACE)).toBe(true);
        expect(() => assertNoRestoreInProgress(WORKSPACE, "generateAgent")).toThrow(/restore is still in progress/);

        endRestore(WORKSPACE);
        expect(() => assertNoRestoreInProgress(WORKSPACE, "generateAgent")).not.toThrow();
    });

    it("holds only the workspace being restored", () => {
        beginRestore(WORKSPACE);

        expect(isRestoreInProgress(OTHER_WORKSPACE)).toBe(false);
        expect(() => assertNoRestoreInProgress(OTHER_WORKSPACE, "generateAgent")).not.toThrow();
    });

    it("throws rather than reporting a flag, so an awaited RPC cannot leave the panel spinning", () => {
        beginRestore(WORKSPACE);

        // The webview's send path resets its spinner from a catch; a silent refusal never reaches it.
        expect(() => assertNoRestoreInProgress(WORKSPACE, "restoreCheckpoint")).toThrow(Error);
    });

    it("does not stack, so one release frees the workspace", () => {
        // Both RPC entry points claim the same workspace, and each releases it in a `finally`.
        beginRestore(WORKSPACE);
        beginRestore(WORKSPACE);
        endRestore(WORKSPACE);

        expect(isRestoreInProgress(WORKSPACE)).toBe(false);
    });
});
