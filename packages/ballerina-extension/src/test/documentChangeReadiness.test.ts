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

// The visualizer's text-change handler decides whether to refresh the view from the state the
// machine was in when the change arrived. On a slow file system (the 2 GB cloud editor) the
// save outlasts `updateSourceCode`'s edit, and reading the state after it turned the extension's
// own write into a refresh that popped the open Add Durable Workflow form (product-integrator#2939).

import { wasReadyBeforeSave } from "../views/visualizer/document-change";

describe("wasReadyBeforeSave", () => {
    const cases = [
        { readyAtChange: false, readyAfterSave: false },
        { readyAtChange: false, readyAfterSave: true }, // the cloud editor race
        { readyAtChange: true, readyAfterSave: false },
        { readyAtChange: true, readyAfterSave: true },
    ];

    it.each(cases)(
        "reports the state at change time (ready at change: $readyAtChange, after save: $readyAfterSave)",
        async ({ readyAtChange, readyAfterSave }) => {
            let ready = readyAtChange;
            const save = jest.fn(async () => {
                await new Promise((resolve) => setTimeout(resolve, 0));
                ready = readyAfterSave; // EDIT_DONE lands while the save is in flight
            });

            await expect(wasReadyBeforeSave(() => ready, save)).resolves.toBe(readyAtChange);
            expect(save).toHaveBeenCalledTimes(1);
        }
    );

    it("waits for the save before resolving", async () => {
        let saved = false;
        await wasReadyBeforeSave(() => true, async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
            saved = true;
        });
        expect(saved).toBe(true);
    });

    it("reads the state when there is nothing to save", async () => {
        await expect(wasReadyBeforeSave(() => true)).resolves.toBe(true);
        await expect(wasReadyBeforeSave(() => false)).resolves.toBe(false);
    });
});
