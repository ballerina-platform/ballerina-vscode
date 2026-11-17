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

import { IDLE_LABEL, LABEL_GRACE_MS, labelWaitMs, MIN_LABEL_VISIBLE_MS } from "../../../../../../views/AIPanel/components/AIChat/Footer/activityLabel";

describe("labelWaitMs", () => {
    it("goes back to the idle label at once, so a finished step is not held on screen", () => {
        expect(labelWaitMs(IDLE_LABEL, 15)).toBe(0);
        expect(labelWaitMs(IDLE_LABEL, 0)).toBe(0);
    });

    it("waits out the grace before showing a step, so a step that ends in milliseconds never shows", () => {
        expect(labelWaitMs("Finding .bal files", 5000)).toBe(LABEL_GRACE_MS);
    });

    it("keeps the previous step up for the minimum time, so a burst does not strobe", () => {
        expect(labelWaitMs("Reading main.bal in mcp", 100)).toBe(MIN_LABEL_VISIBLE_MS - 100);
        expect(labelWaitMs("Reading main.bal in mcp", MIN_LABEL_VISIBLE_MS - LABEL_GRACE_MS)).toBe(LABEL_GRACE_MS);
    });
});
