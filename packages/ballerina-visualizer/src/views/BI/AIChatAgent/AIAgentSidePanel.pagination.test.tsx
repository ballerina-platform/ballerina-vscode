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

// Every module the panel only renders or forms with is a stub: any export is a component that renders nothing.
const stubModule = () => {
    const Stub = (): null => null;
    return new Proxy({}, {
        get: (_target, key) => key === "__esModule" ? true
            : key === "ThemeColors" ? new Proxy({}, { get: () => "#000" })
                : Stub,
    });
};

// Helpers the panel only calls on other paths: any export is a function that returns an empty list.
const helperModule = (values: Record<string, unknown> = {}) => new Proxy(values, {
    get: (target, key) => key === "__esModule" ? true : key in target ? target[key as string] : (): unknown[] => [],
});

let nodeListProps: Record<string, any> | undefined;
jest.mock("@wso2/ballerina-side-panel", () => new Proxy({}, {
    get: (_target, key) => key === "__esModule" ? true
        : key === "NodeList" ? (props: Record<string, any>) => { nodeListProps = props; return null; }
            : (): null => null,
}));
jest.mock("@wso2/ballerina-core", () => ({
    FUNCTION_TYPE: { REGULAR: "regular" }, MACHINE_VIEW: {}, EVENT_TYPE: {}, DIRECTORY_MAP: {},
    getPrimaryInputType: (): undefined => undefined, TRIGGER_CHARACTERS: [],
}));
jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../test/rpcHarness");
    return { useRpcContext: h.useRpcContext };
});
jest.mock("../../../utils/bi", () => ({
    convertBICategoriesToSidePanelCategories: (): unknown[] => [],
    // One panel node per function, keyed by name, as the real conversion produces.
    convertFunctionCategoriesToSidePanelCategories: (categories: Category[]) => categories.map(category => ({
        title: category.metadata.label,
        items: category.items.map(item => ({ id: item.metadata.label, label: item.metadata.label })),
    })),
}));
jest.mock("@wso2/ui-toolkit", () => stubModule());
jest.mock("@wso2/bi-diagram", () => stubModule());
jest.mock("../Forms/ArtifactForm", () => stubModule());
jest.mock("../../../components/RelativeLoader", () => stubModule());
jest.mock("../../../components/ImplementationBadge", () => stubModule());
jest.mock("../../../components/ConnectionSelector/useCreateNode", () => ({ useCreateNode: () => jest.fn() }));
jest.mock("../Connection/AddConnectionPopup/AddConnectionPopupContent", () => stubModule());
jest.mock("../Connection/ConnectionConfigurationPopup", () => stubModule());
jest.mock("../Connection/ConnectorBrowser", () => stubModule());
jest.mock("../Connection/styles", () => stubModule());
jest.mock("./formUtils", () => helperModule({ createRequiresApprovalField: (): unknown => ({}) }));
jest.mock("./toolForm", () => helperModule());
jest.mock("./utils", () => helperModule({ ZERO_LINE_RANGE: {} }));
jest.mock("./agentTools", () => helperModule());
jest.mock("./NewTool", () => ({
    NewToolSelectionMode: { CONNECTION: "connection", FUNCTION: "function", ALL: "all", CUSTOM_TOOL: "custom_tool" },
}));

import { TestRpcContext } from "../../../test/rpcHarness";
import { AIAgentSidePanel } from "./AIAgentSidePanel";
import { NewToolSelectionMode } from "./NewTool";

(globalThis as unknown as { React: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const library = (label: string, names: string[]) => ({
    metadata: { label, description: "" },
    items: names.map(name => ({ metadata: { label: name, description: "" }, codedata: { node: "FUNCTION_CALL" } })),
});

const response = (standard: string[], extended: string[], standardMore = true): BISearchResponse => ({
    categories: [library("Standard Library", standard), library("Extended Library", extended)] as Category[],
    functionPagination: {
        ballerina: { hasMore: standardMore, nextOffset: 100, source: "central" },
        ballerinax: { hasMore: true, nextOffset: 60, source: "index" },
    },
});

const sectionNames = (title: string): string[] =>
    nodeListProps.categories.find((category: { title: string }) => category.title === title)
        .items.map((item: { label: string }) => item.label);

describe("agent tool function picker pagination", () => {
    let container: HTMLDivElement;
    let root: Root;
    let search: jest.Mock<Promise<BISearchResponse>, [BISearchRequest]>;

    beforeEach(() => {
        nodeListProps = undefined;
        search = jest.fn();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const mount = async () => {
        const rpcClient = { getBIDiagramRpcClient: () => ({ search }), onParentPopupSubmitted: jest.fn() };
        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient }}>
                    <AIAgentSidePanel {...{ agentNode: { codedata: {} }, projectPath: "/workspace",
                        mode: NewToolSelectionMode.FUNCTION } as any} />
                </TestRpcContext.Provider>
            );
        });
    };

    it("pages library sections from the default view and from a search", async () => {
        search.mockResolvedValueOnce(response(["println"], ["toEdiString"]));
        await mount();
        expect(search.mock.calls[0][0].queryMap).toEqual(
            { q: "", limit: 60, offset: 0, includeAvailableFunctions: "true" });
        expect(nodeListProps.sectionsWithMore).toEqual({ "Standard Library": true, "Extended Library": true });

        search.mockResolvedValueOnce({ categories: [library("Standard Library", ["printInfo"])] as Category[],
            functionPagination: { ballerina: { hasMore: false, nextOffset: 200, source: "central" } } });
        await act(async () => { await nodeListProps.onLoadMoreSection("Standard Library"); });
        expect(search.mock.calls[1][0].queryMap).toEqual({ q: "", limit: 60, offset: 100, orgName: "ballerina",
            functionSource: "central", includeAvailableFunctions: "true" });
        expect(sectionNames("Standard Library")).toEqual(["println", "printInfo"]);
        expect(nodeListProps.sectionsWithMore["Standard Library"]).toBe(false);

        search.mockResolvedValueOnce(response(["fromEdiString"], ["edifactFn"], false));
        await act(async () => { await nodeListProps.onSearchTextChange("edi"); });
        expect(search.mock.calls[2][0].queryMap).toEqual(
            { q: "edi", limit: 60, offset: 0, includeAvailableFunctions: "true" });
        expect(nodeListProps.sectionsWithMore).toEqual({ "Standard Library": false, "Extended Library": true });

        search.mockResolvedValueOnce({ categories: [library("Extended Library", ["edifactFn2"])] as Category[] });
        await act(async () => { await nodeListProps.onLoadMoreSection("Extended Library"); });
        expect(search.mock.calls[3][0].queryMap).toMatchObject({ q: "edi", offset: 60, orgName: "ballerinax",
            functionSource: "index" });
        expect(sectionNames("Extended Library")).toEqual(["edifactFn", "edifactFn2"]);

        // Clearing the search restores the first default page together with its continuation.
        await act(async () => { await nodeListProps.onSearchTextChange(""); });
        expect(sectionNames("Standard Library")).toEqual(["println"]);
        expect(nodeListProps.sectionsWithMore).toEqual({ "Standard Library": true, "Extended Library": true });
    });

    it("ignores a search response that a newer search superseded", async () => {
        search.mockResolvedValueOnce(response(["println"], []));
        await mount();
        let resolveOld!: (value: BISearchResponse) => void;
        search.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
        search.mockResolvedValueOnce(response(["fromEdiString"], [], false));
        let old!: Promise<unknown>;
        await act(async () => {
            old = nodeListProps.onSearchTextChange("ed");
            await nodeListProps.onSearchTextChange("edi");
        });
        await act(async () => { resolveOld(response(["stale"], [])); await old; });
        expect(sectionNames("Standard Library")).toEqual(["fromEdiString"]);
        expect(nodeListProps.sectionsWithMore["Standard Library"]).toBe(false);
    });
});
