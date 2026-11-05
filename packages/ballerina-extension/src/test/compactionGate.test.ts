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

import { shouldFailForMissingCompaction } from "../features/ai/agent/compaction-gate";

describe("shouldFailForMissingCompaction", () => {
    it("fails when the floor is at/over the trigger, compaction is supported, and the flag is set", () => {
        // undefined compactionOptions means the floor is at or over COMPACT_TRIGGER_TOKENS.
        expect(shouldFailForMissingCompaction(true, undefined, true)).toBe(true);
    });

    it("does not fail when the flag is unset, even if compaction is unavailable", () => {
        expect(shouldFailForMissingCompaction(true, undefined, false)).toBe(false);
        expect(shouldFailForMissingCompaction(true, undefined, undefined)).toBe(false);
    });

    it("does not fail when the floor is under the trigger and compaction is available", () => {
        expect(shouldFailForMissingCompaction(true, { anthropic: {} }, true)).toBe(false);
    });

    it("does not fail when the login method never supports compaction, regardless of the flag", () => {
        expect(shouldFailForMissingCompaction(false, undefined, true)).toBe(false);
    });
});
