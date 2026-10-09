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

import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import type { BISearchResponse, FunctionPageInfo } from "@wso2/ballerina-core";
import { useFunctionPaginationController } from "./useFunctionPaginationController";

const pagination = {
    ballerina: { nextOffset: 180, hasMore: true, source: "central" as const },
    ballerinax: { nextOffset: 240, hasMore: true, source: "index" as const },
};
const deferred = () => {
    let resolve!: (response: BISearchResponse) => void;
    const promise = new Promise<BISearchResponse>(res => { resolve = res; });
    return { promise, resolve };
};

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Use the package's existing React harness rather than adding a testing-library dependency.
let root: Root;
let container: HTMLDivElement;
const renderHook = (hook: typeof useFunctionPaginationController) => {
    const result = {} as { current: ReturnType<typeof useFunctionPaginationController> };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    function Probe(): null {
        result.current = hook();
        return null;
    }
    act(() => root.render(<Probe />));
    return { result };
};

describe("shared function pagination ownership", () => {
    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });
    it("coalesces duplicate clicks while paging both sections independently", async () => {
        const { result } = renderHook(() => useFunctionPaginationController());
        act(() => result.current.seed(pagination, () => 1));
        const standard = deferred();
        const extended = deferred();
        const fetch = jest.fn((org: string, _cursor: FunctionPageInfo) =>
            org === "ballerina" ? standard.promise : extended.promise);
        const apply = jest.fn(() => 0);
        let first!: Promise<void>;
        let second!: Promise<void>;
        act(() => {
            first = result.current.loadSection("Standard Library", fetch, apply);
            void result.current.loadSection("Standard Library", fetch, apply);
            second = result.current.loadSection("Extended Library", fetch, apply);
        });
        expect(fetch.mock.calls).toEqual([["ballerina", pagination.ballerina], ["ballerinax", pagination.ballerinax]]);
        expect(result.current.loadingSections).toEqual({ "Standard Library": true, "Extended Library": true });
        await act(async () => {
            standard.resolve({ categories: [], functionPagination: { ballerina: { hasMore: false, nextOffset: 181 } } });
            await first;
        });
        expect(result.current.sectionsWithMore).toEqual({ "Standard Library": false, "Extended Library": true });
        expect(result.current.loadingSections["Extended Library"]).toBe(true);
        await act(async () => { extended.resolve({ categories: [] }); await second; });
        await act(async () => { await result.current.loadSection("Standard Library", fetch, apply); });
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("rejects pages from an old panel even without a new query", async () => {
        const { result } = renderHook(() => useFunctionPaginationController());
        act(() => result.current.seed(pagination, () => 1));
        let panelActive = true;
        const pending = deferred();
        const apply = jest.fn(() => 1);
        let load!: Promise<void>;
        act(() => { load = result.current.loadSection("Standard Library", () => pending.promise, apply, () => panelActive); });
        panelActive = false;
        // Navigation invalidates the cursor and releases the old loading ownership.
        act(() => result.current.reset());
        await act(async () => { pending.resolve({ categories: [] }); await load; });
        expect(apply).not.toHaveBeenCalled();
        expect(result.current.sectionsWithMore).toEqual({});
        expect(result.current.loadingSections).toEqual({});
    });

    it("keeps cursors across a selection so Back can still load more", async () => {
        const { result } = renderHook(() => useFunctionPaginationController());
        act(() => result.current.seed(pagination, () => 1));
        const pending = deferred();
        const apply = jest.fn(() => 1);
        let load!: Promise<void>;
        act(() => { load = result.current.loadSection("Standard Library", () => pending.promise, apply); });
        // Selecting a function drops the in-flight page but not the list's continuation.
        act(() => result.current.invalidate());
        expect(result.current.loadingSections).toEqual({});
        await act(async () => {
            pending.resolve({ categories: [], functionPagination: { ballerina: { hasMore: false, nextOffset: 240 } } });
            await load;
        });
        expect(apply).not.toHaveBeenCalled();
        expect(result.current.sectionsWithMore).toEqual({ "Standard Library": true, "Extended Library": true });
        const fetch = jest.fn(() => Promise.resolve({ categories: [] } as BISearchResponse));
        await act(async () => { await result.current.loadSection("Standard Library", fetch, apply); });
        expect(fetch).toHaveBeenCalledWith("ballerina", pagination.ballerina);
    });
});
