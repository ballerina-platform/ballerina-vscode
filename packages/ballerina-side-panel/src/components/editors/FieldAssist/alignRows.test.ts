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

import { alignRows } from "@wso2/ballerina-core";

const changed = (before: string[], after: string[]) => alignRows(before, after).filter((step) => step.was !== step.now);

describe("alignRows", () => {
    it("reads a row inserted at the top as one addition", () => {
        expect(changed(["vip", "email"], ["items > 10", "vip", "email"])).toEqual([{ after: 0, now: "items > 10" }]);
    });

    it("reads a row appended at the end as one addition", () => {
        expect(changed(["vip"], ["vip", "items > 10"])).toEqual([{ after: 1, now: "items > 10" }]);
    });

    it("reads an edited row as one change", () => {
        expect(changed(["vip", "email"], ["vip", "email && paid"])).toEqual([{ before: 1, after: 1, was: "email", now: "email && paid" }]);
    });

    it("reads a removed row as one removal", () => {
        expect(changed(["vip", "email", "paid"], ["vip", "paid"])).toEqual([{ before: 1, was: "email" }]);
    });

    it("pairs renamed rows in order when none match", () => {
        expect(alignRows(["worker1", "worker2"], ["total", "count"])).toEqual([
            { before: 0, after: 0, was: "worker1", now: "total" },
            { before: 1, after: 1, was: "worker2", now: "count" },
        ]);
    });
});
