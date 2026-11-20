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

// L1: the diagnostics hosts (FlowNodeForm, ArtifactForm) debounce each field on its own. With one
// shared debounce, an edit in one field replaced another field's pending check, so that field kept
// its old clean diagnostics and an invalid value could be saved.

import { debouncePerKey } from "../../utils/debouncePerKey";

describe("debouncePerKey", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const setup = () => {
        const fn = jest.fn((key: string, value: string) => `${key}=${value}`);
        const debounced = debouncePerKey(fn, 250, (key) => key);
        return { fn, debounced };
    };

    it("INVARIANT: a call for one key never replaces another key's pending call", () => {
        const { fn, debounced } = setup();
        debounced("b", "foo(");
        jest.advanceTimersByTime(100);
        debounced("a", "hello");
        jest.advanceTimersByTime(250);

        expect(fn.mock.calls).toEqual(expect.arrayContaining([["b", "foo("], ["a", "hello"]]));
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("INVARIANT: calls for the same key still collapse to the latest", () => {
        const { fn, debounced } = setup();
        debounced("a", "h");
        debounced("a", "he");
        debounced("a", "hello");
        jest.advanceTimersByTime(250);

        expect(fn.mock.calls).toEqual([["a", "hello"]]);
    });

    it("waits the full interval after the key's latest call", () => {
        const { fn, debounced } = setup();
        debounced("a", "h");
        jest.advanceTimersByTime(200);
        debounced("a", "hello");
        jest.advanceTimersByTime(200);
        expect(fn).not.toHaveBeenCalled();

        jest.advanceTimersByTime(50);
        expect(fn.mock.calls).toEqual([["a", "hello"]]);
    });
});
