/**
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.org)
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

import { Category } from "@wso2/ballerina-core";
import { listsActivity, pollActivityList } from "./activityRefresh";

const list = (...names: string[]): Category[] => [{
    metadata: { label: "Current Integration" },
    items: names.map((name) => ({ metadata: { label: name }, codedata: { node: "ACTIVITY_CALL", symbol: name } })),
} as unknown as Category];

// wso2/product-integrator#2422: the refresh that follows a save must stand down when the user has moved on.
describe("pollActivityList", () => {
    const sleep = jest.fn(() => Promise.resolve());
    beforeEach(() => sleep.mockClear());

    it("returns the first response that lists the new activity", async () => {
        const search = jest.fn()
            .mockResolvedValueOnce(list("reserveInventory"))
            .mockResolvedValueOnce(list("reserveInventory", "chargeCard"));
        const categories = await pollActivityList({ search, superseded: () => false, sleep, recentIdentifier: "chargeCard" });
        expect(listsActivity(categories, "chargeCard")).toBe(true);
        expect(search).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledTimes(1);
    });

    it("gives up after the attempts and still returns the last response", async () => {
        const search = jest.fn().mockResolvedValue(list("reserveInventory"));
        const categories = await pollActivityList({ search, superseded: () => false, sleep, recentIdentifier: "chargeCard", attempts: 2 });
        expect(search).toHaveBeenCalledTimes(3);
        expect(listsActivity(categories, "chargeCard")).toBe(false);
    });

    it("stops searching once a later action supersedes it", async () => {
        let moved = false;
        const search = jest.fn().mockImplementation(async () => {
            moved = true;
            return list("reserveInventory");
        });
        await pollActivityList({ search, superseded: () => moved, sleep, recentIdentifier: "chargeCard" });
        expect(search).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it("does not search again when superseded during the wait", async () => {
        let moved = false;
        const search = jest.fn().mockResolvedValue(list("reserveInventory"));
        const sleepThenMove = jest.fn(async () => { moved = true; });
        await pollActivityList({ search, superseded: () => moved, sleep: sleepThenMove, recentIdentifier: "chargeCard" });
        expect(search).toHaveBeenCalledTimes(1);
    });

    it("counts any activity when the written one is unknown", () => {
        expect(listsActivity(list("reserveInventory"))).toBe(true);
        expect(listsActivity([])).toBe(false);
    });
});
