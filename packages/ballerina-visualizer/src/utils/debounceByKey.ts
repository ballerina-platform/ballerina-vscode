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

import { debounce, DebouncedFunc } from "lodash";

export type KeyedDebouncedFunc<A extends unknown[], R> = ((...args: A) => R | undefined) & {
    cancel: () => void;
};

// Debounces calls separately per key, so a call for one key never replaces another key's pending
// call: each key's latest call still runs once its own wait elapses.
export function debounceByKey<A extends unknown[], R>(
    fn: (...args: A) => R,
    keyOf: (...args: A) => string,
    wait: number
): KeyedDebouncedFunc<A, R> {
    const debouncers = new Map<string, DebouncedFunc<(...args: A) => R>>();
    const keyed = (...args: A) => {
        const key = keyOf(...args);
        let debounced = debouncers.get(key);
        if (!debounced) {
            debounced = debounce(fn, wait);
            debouncers.set(key, debounced);
        }
        return debounced(...args);
    };
    keyed.cancel = () => {
        debouncers.forEach((debounced) => debounced.cancel());
        debouncers.clear();
    };
    return keyed;
}
