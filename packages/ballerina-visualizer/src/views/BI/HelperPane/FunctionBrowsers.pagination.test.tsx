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
import type { BISearchRequest, BISearchResponse, Category } from "@wso2/ballerina-core";
import type { HelperPaneFunctionCategory } from "@wso2/ballerina-side-panel";

jest.mock("@wso2/ballerina-core", () => ({}));
jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../test/rpcHarness");
    return { useRpcContext: h.useRpcContext };
});
// Keep the real pagination hook; only replace the unrelated heavy conversion dependency.
jest.mock("../../../utils/bi", () => ({
    convertToHelperPaneFunction: (categories: Category[]) => {
        const convert = (category: Category): HelperPaneFunctionCategory => ({
            label: category.metadata.label,
            items: category.items.flatMap(item => "codedata" in item
                ? [{ label: item.metadata.label, insertText: item.metadata.label }] : []),
            subCategory: category.items.some(item => !("codedata" in item))
                ? category.items.flatMap(item => "codedata" in item ? [] : [convert(item)]) : undefined,
        });
        return { category: categories.map(convert) };
    },
}));
jest.mock("../../../Context", () => ({ useModalStack: () => ({ addModal: jest.fn(), closeModal: jest.fn() }), POPUP_IDS: {} }));
jest.mock("../FunctionFormStatic", () => ({ FunctionFormStatic: (): null => null }));
jest.mock("../HelperPaneNew/utils/iconUtils", () => ({ HelperPaneIconType: {}, getHelperPaneIcon: (): null => null }));
jest.mock("../HelperPaneNew/Components/FooterButtons", () => ({ __esModule: true, default: (): null => null }));
jest.mock("@tanstack/react-query", () => ({ useMutation: () => ({ mutateAsync: jest.fn() }) }));
jest.mock("@wso2/ui-toolkit/lib/components/ExpressionEditor", () => ({ HelperPaneCustom: { Loader: () => <div>Loading</div> } }));
jest.mock("@wso2/ui-toolkit", () => {
    const shell = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
    return {
        ThemeColors: new Proxy({}, { get: () => "#000" }),
        SearchBox: ({ value, onChange }: { value: string; onChange: (value: string) => void }) =>
            <input aria-label="Search" value={value} onChange={event => onChange(event.target.value)} />,
        Typography: shell,
        ProgressRing: () => <span role="status">Fetching page</span>,
        Divider: (): null => null,
        BrowserContainer: shell, BrowserSearchContainer: shell,
        BrowserContentArea: shell,
        BrowserSectionContainer: shell, BrowserSectionBody: shell,
        BrowserItemContainer: shell, BrowserItemLabel: shell, BrowserEmptyMessage: shell,
    };
});

import { TestRpcContext } from "../../../test/rpcHarness";
import { LibraryBrowser } from "./LibraryBrowser";
import { FunctionsPage } from "../HelperPaneNew/Views/Functions";

// A viewport taller than the first page would previously cause an automatic continuation.
// The production webpack JSX runtime is automatic; the Jest preset uses classic JSX.
(globalThis as unknown as { React: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const page = (standardMore = true, extendedMore = true, empty = false): BISearchResponse => ({
    categories: empty ? [] : ["Standard Library", "Extended Library"].map((label) => ({
        metadata: { label, description: "" },
        items: [{ metadata: { label: `${label} function`, description: "" },
            codedata: { node: "FUNCTION_CALL" }, enabled: true }],
    })),
    functionPagination: {
        ballerina: { nextOffset: 180, hasMore: standardMore, source: "index" },
        ballerinax: { nextOffset: 240, hasMore: extendedMore, source: "central" },
    },
});

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => { resolve = res; });
    return { resolve, promise };
};

describe.each([
    ["library", "direct"], ["helper", "direct"], ["library", "nested"], ["helper", "nested"],
] as const)("%s function browser manual section pagination (%s categories)", (browser, layout) => {
    const fixturePage = (standardMore = true, extendedMore = true, empty = false) => {
        const response = page(standardMore, extendedMore, empty);
        if (layout === "nested") {
            response.categories = response.categories.map(category => ({
                ...category, items: [{ metadata: { label: "demo", description: "" }, items: category.items }],
            }));
        }
        return response;
    };
    let container: HTMLDivElement;
    let root: Root;
    let search: jest.Mock<Promise<BISearchResponse>, [BISearchRequest]>;
    const button = (title: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="Load more ${title} functions"]`);
    const settle = async () => { await act(async () => { jest.advanceTimersByTime(1000); }); };

    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(1000);
        jest.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(100);
        search = jest.fn();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    const mount = async () => {
        const client = { getBIDiagramRpcClient: () => ({ search }), getVisualizerLocation: async () => ({ projectPath: "/workspace" }) };
        const props = { fileName: "/workspace/main.bal", targetLineRange: {
            startLine: { line: 0, offset: 0 }, endLine: { line: 1, offset: 0 },
        }, onClose: jest.fn(), onChange: jest.fn() };
        act(() => root.render(
            <TestRpcContext.Provider value={{ rpcClient: client }}>
                {browser === "library"
                    ? <LibraryBrowser {...props} onFunctionItemSelect={async () => ({ value: "" })} />
                    : <FunctionsPage {...props} fieldKey="value" anchorRef={{ current: null }} updateImports={jest.fn()} />}
            </TestRpcContext.Provider>
        ));
        await settle();
    };

    it("fetches exactly one page for only the clicked section, with independent loading and exhaustion", async () => {
        const next = deferred<BISearchResponse>();
        search.mockResolvedValueOnce(fixturePage()).mockReturnValueOnce(next.promise);
        await mount();
        expect(button("Standard Library")).not.toBeNull();
        expect(button("Extended Library")).not.toBeNull();
        for (const title of ["Standard Library", "Extended Library"]) {
            const action = button(title)!;
            expect(action.type).toBe("button");
            const linkStyle = getComputedStyle(action);
            expect(linkStyle.textDecoration).toBe("underline");
            expect(linkStyle.whiteSpace).toBe("nowrap");
            expect(linkStyle.alignSelf).toBe("center");
            expect(linkStyle.display).toBe("flex");
            // jsdom cannot resolve fit-content widths; assert the centering rules it supports.
            expect(linkStyle.marginLeft).toBe("auto");
            expect(linkStyle.marginRight).toBe("auto");
            expect(linkStyle.marginBottom).toBe("12px");
        }
        await settle();
        act(() => container.querySelectorAll('div').forEach(element => element.dispatchEvent(new Event('scroll'))));
        expect(search).toHaveBeenCalledTimes(1);

        act(() => { button("Extended Library")!.click(); button("Extended Library")!.click(); });
        expect(search).toHaveBeenCalledTimes(2);
        expect(search.mock.calls[1][0].queryMap).toMatchObject({ orgName: "ballerinax", offset: 240, functionSource: "central" });
        expect(button("Extended Library")!.disabled).toBe(true);
        expect(button("Extended Library")!.getAttribute('aria-busy')).toBe('true');
        expect(button("Standard Library")!.disabled).toBe(false);
        expect(container.querySelector('[role="status"]')).not.toBeNull();
        await act(async () => { next.resolve(page(true, false, true)); });
        expect(button("Extended Library")).toBeNull();
        expect(button("Standard Library")).not.toBeNull();
        await settle();
        expect(search).toHaveBeenCalledTimes(2);
    });

    it("keeps Central Load more enabled after a resolved LS error and retries the same cursor", async () => {
        jest.spyOn(console, "error").mockImplementation(() => undefined);
        search.mockResolvedValueOnce(fixturePage())
            .mockResolvedValueOnce({ errorMsg: "Central unavailable" } as unknown as BISearchResponse)
            .mockResolvedValueOnce(page(true, false, true));
        await mount();
        await act(async () => { button("Extended Library")!.click(); });
        expect(button("Extended Library")).not.toBeNull();
        expect(button("Extended Library")!.disabled).toBe(false);
        expect(button("Extended Library")!.getAttribute("aria-busy")).toBe("false");
        expect(container.textContent).toContain("Extended Library function");
        await act(async () => { button("Extended Library")!.click(); });
        expect(search.mock.calls.slice(1).map(([request]) => request.queryMap)).toEqual([
            expect.objectContaining({ orgName: "ballerinax", offset: 240, functionSource: "central" }),
            expect.objectContaining({ orgName: "ballerinax", offset: 240, functionSource: "central" }),
        ]);
        expect(button("Extended Library")).toBeNull();
    });

    it("keeps empty continuing pages reachable during a search and never drains them automatically", async () => {
        search.mockResolvedValueOnce(fixturePage(false, false))
            .mockResolvedValueOnce(page(true, true, true))
            .mockResolvedValueOnce({ ...page(true, false, true), functionPagination: {
                ballerina: { hasMore: true, nextOffset: 360, source: "index" },
            } })
            .mockResolvedValueOnce(page(false, false, true));
        await mount();
        expect(button("Standard Library")).toBeNull();
        act(() => {
            const input = container.querySelector('input')!;
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'filtered');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await settle();
        expect(button("Standard Library")).not.toBeNull();
        expect(button("Extended Library")).not.toBeNull();
        expect(search).toHaveBeenCalledTimes(2);
        await act(async () => { button("Standard Library")!.click(); });
        expect(button("Standard Library")).not.toBeNull();
        await settle();
        expect(search).toHaveBeenCalledTimes(3);
        await act(async () => { button("Standard Library")!.click(); });
        expect(search.mock.calls.slice(2).map(([request]) => request.queryMap)).toEqual([
            expect.objectContaining({ q: "filtered", orgName: "ballerina", offset: 180 }),
            expect.objectContaining({ q: "filtered", orgName: "ballerina", offset: 360 }),
        ]);
        expect(button("Standard Library")).toBeNull();
        expect(button("Extended Library")).not.toBeNull();
    });
});
