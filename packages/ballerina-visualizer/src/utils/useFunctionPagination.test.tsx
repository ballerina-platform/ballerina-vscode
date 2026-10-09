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
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { BISearchRequest, BISearchResponse, Category, FunctionPageInfo } from "@wso2/ballerina-core";
import type { HelperPaneFunctionCategory } from "@wso2/ballerina-side-panel";

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../test/rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

// Conversion is not under test here. Avoid importing the diagram-wide bi.tsx dependency graph.
jest.mock("./bi", () => ({
    convertToHelperPaneFunction: (categories: Category[]) => {
        const convert = (category: Category): HelperPaneFunctionCategory => ({
            label: category.metadata.label,
            items: category.items.flatMap((item) => "codedata" in item
                ? [{ label: item.metadata.label, insertText: item.metadata.label }] : []),
            subCategory: category.items.flatMap((item) => "codedata" in item ? [] : [convert(item)]),
        });
        return { category: categories.map(convert) };
    },
}));

import { TestRpcContext } from "../test/rpcHarness";
import { useFunctionPagination } from "./useFunctionPagination";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const response = (symbol: string, nextOffset: number, hasMore: boolean,
    source?: FunctionPageInfo["source"]): BISearchResponse => ({
    categories: [{
        metadata: { label: "Standard Library", description: "" },
        items: symbol ? [{
            metadata: { label: symbol, description: "" },
            codedata: { node: "FUNCTION_CALL", org: "ballerina", module: "demo", symbol },
            enabled: true,
        }] : [],
    }],
    functionPagination: { ballerina: { hasMore, nextOffset, source }, ballerinax: { hasMore: false, nextOffset: 0 } },
});

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => { resolve = res; });
    return { promise, resolve };
};

describe("function browser pagination", () => {
    let root: Root;
    let container: HTMLDivElement;
    let api: ReturnType<typeof useFunctionPagination>;
    let search: jest.Mock<Promise<BISearchResponse>, [BISearchRequest]>;

    beforeEach(() => {
        search = jest.fn();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        const client = { getBIDiagramRpcClient: () => ({ search }) };
        function Probe(): null {
            api = useFunctionPagination({
                fileName: "/workspace/main.bal",
                targetLineRange: { startLine: { line: 0, offset: 0 }, endLine: { line: 1, offset: 0 } },
            });
            return null;
        }
        act(() => root.render(<TestRpcContext.Provider value={{ rpcClient: client }}><Probe /></TestRpcContext.Provider>));
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it("keeps short and empty filtered pages reachable, using the raw next offset", async () => {
        search.mockResolvedValueOnce(response("first", 180, true))
            .mockResolvedValueOnce(response("", 360, true))
            .mockResolvedValueOnce(response("last", 361, false));
        await act(async () => { await api.loadFirstPage("demo"); });
        expect(api.sectionsWithMore["Standard Library"]).toBe(true);
        await act(async () => { api.loadMoreSection("Standard Library"); });
        expect(api.sectionsWithMore["Standard Library"]).toBe(true);
        await act(async () => { api.loadMoreSection("Standard Library"); });
        expect(search.mock.calls.map(([request]) => request.queryMap?.offset)).toEqual([0, 180, 360]);
        expect(api.sectionsWithMore["Standard Library"]).toBe(false);
        expect(api.info?.category[0].items?.map((item) => item.label)).toEqual(["first", "last"]);
    });

    it.each(["central", "index"] as const)("pins continuation requests to %s ordering", async (source) => {
        search.mockResolvedValueOnce(response("first", 180, true, source))
            .mockResolvedValueOnce(response("last", 181, false, source));
        await act(async () => { await api.loadFirstPage("demo"); });
        await act(async () => { api.loadMoreSection("Standard Library"); });
        expect(search.mock.calls[1][0].queryMap).toMatchObject({ offset: 180, functionSource: source });
    });

    it("does not allow a superseded first page to overwrite a newer query", async () => {
        const old = deferred<BISearchResponse>();
        search.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response("new", 200, true));
        let oldLoad!: Promise<void>;
        act(() => { oldLoad = api.loadFirstPage("old"); });
        await act(async () => { await api.loadFirstPage("new"); });
        await act(async () => { old.resolve(response("old", 60, false)); await oldLoad; });
        expect(api.info?.category[0].items?.map((item) => item.label)).toEqual(["new"]);
        expect(api.sectionsWithMore["Standard Library"]).toBe(true);
    });

    it("does not merge an old page or clear a newer query's in-flight loading state", async () => {
        const oldPage = deferred<BISearchResponse>();
        const newPage = deferred<BISearchResponse>();
        search.mockResolvedValueOnce(response("old", 180, true)).mockReturnValueOnce(oldPage.promise)
            .mockResolvedValueOnce(response("new", 300, true)).mockReturnValueOnce(newPage.promise);
        await act(async () => { await api.loadFirstPage("old"); });
        act(() => api.loadMoreSection("Standard Library"));
        await act(async () => { await api.loadFirstPage("new"); });
        act(() => api.loadMoreSection("Standard Library"));
        await act(async () => { oldPage.resolve(response("stale", 181, false)); });
        expect(api.loadingSections["Standard Library"]).toBe(true);
        expect(api.info?.category[0].items?.map((item) => item.label)).toEqual(["new"]);
        await act(async () => { newPage.resolve(response("next", 301, false)); });
        expect(api.loadingSections["Standard Library"]).toBe(false);
        expect(api.info?.category[0].items?.map((item) => item.label)).toEqual(["new", "next"]);
    });

    it.each([
        ["rejected RPC", undefined],
        ["resolved error", { errorMsg: "Central unavailable" }],
        ["missing categories", { functionPagination: { ballerina: { nextOffset: 999, hasMore: false } } }],
        ["error with categories", { ...response("must-not-merge", 999, false), errorMsg: "Central unavailable" }],
    ])("preserves results and the Central cursor after %s, then retries the same page", async (_name, payload) => {
        const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
        search.mockResolvedValueOnce(response("first", 180, true, "central"));
        if (payload === undefined) {
            search.mockRejectedValueOnce(new Error("offline"));
        } else {
            // Exercise the actual LS wire failure shapes, which the success-only response type does not represent.
            search.mockResolvedValueOnce(payload as unknown as BISearchResponse);
        }
        search.mockResolvedValueOnce(response("last", 181, false, "central"));
        try {
            await act(async () => { await api.loadFirstPage("demo"); });
            const original = api.info;
            await act(async () => { api.loadMoreSection("Standard Library"); });
            expect(api.info).toBe(original);
            expect(api.sectionsWithMore["Standard Library"]).toBe(true);
            expect(api.loadingSections["Standard Library"]).toBe(false);
            await act(async () => { api.loadMoreSection("Standard Library"); });
            expect(search.mock.calls.slice(1).map(([request]) => request.queryMap)).toEqual([
                expect.objectContaining({ q: "demo", offset: 180, functionSource: "central" }),
                expect.objectContaining({ q: "demo", offset: 180, functionSource: "central" }),
            ]);
            expect(api.info?.category[0].items?.map(item => item.label)).toEqual(["first", "last"]);
            expect(api.sectionsWithMore["Standard Library"]).toBe(false);
        } finally {
            error.mockRestore();
        }
    });

    it("leaves a failed page's raw offset available for retry", async () => {
        const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
        search.mockResolvedValueOnce(response("first", 180, true)).mockRejectedValueOnce(new Error("offline"))
            .mockResolvedValueOnce(response("last", 181, false));
        try {
            await act(async () => { await api.loadFirstPage(""); });
            await act(async () => { api.loadMoreSection("Standard Library"); });
            await act(async () => { api.loadMoreSection("Standard Library"); });
            expect(search.mock.calls.map(([request]) => request.queryMap?.offset)).toEqual([0, 180, 180]);
        } finally {
            error.mockRestore();
        }
    });

    it("retains legacy paging for older servers without metadata", async () => {
        const legacy = response("first", 0, false);
        delete legacy.functionPagination;
        legacy.categories[0].items = Array.from({ length: 60 }, (_, index) => ({
            metadata: { label: `f${index}`, description: "" }, codedata: { node: "FUNCTION_CALL" }, enabled: true,
        }));
        search.mockResolvedValueOnce(legacy).mockResolvedValueOnce({ categories: [] });
        await act(async () => { await api.loadFirstPage(""); });
        expect(api.sectionsWithMore["Standard Library"]).toBe(true);
        await act(async () => { api.loadMoreSection("Standard Library"); });
        expect(search.mock.calls[1][0].queryMap?.offset).toBe(60);
        expect(api.sectionsWithMore["Standard Library"]).toBe(false);
    });
});
