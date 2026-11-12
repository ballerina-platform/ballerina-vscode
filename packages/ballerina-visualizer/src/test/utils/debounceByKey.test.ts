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

// L1: per-field diagnostics debounce. A request for one field must never replace another field's
// pending request, and every field's latest request must eventually run.

import { debounceByKey } from "../../utils/debounceByKey";

describe("debounceByKey", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("INVARIANT: every key's latest call runs exactly once, regardless of interleaving", () => {
        const calls: [string, string][] = [];
        const debounced = debounceByKey(
            (key: string, value: string) => { calls.push([key, value]); },
            (key) => key,
            250
        );
        const sequence: [string, string][] = [
            ["a", "1"], ["b", "1"], ["a", "2"], ["c", "1"], ["b", "2"], ["a", "3"],
        ];
        sequence.forEach(([key, value]) => debounced(key, value));
        expect(calls).toEqual([]);

        jest.advanceTimersByTime(250);

        const latest = new Map(sequence);
        expect(calls).toHaveLength(latest.size);
        expect(new Map(calls)).toEqual(latest);
    });

    it("cancel drops every key's pending call", () => {
        const fn = jest.fn();
        const debounced = debounceByKey(fn, (key: string) => key, 250);
        debounced("a");
        debounced("b");
        debounced.cancel();
        jest.advanceTimersByTime(250);
        expect(fn).not.toHaveBeenCalled();
    });
});
