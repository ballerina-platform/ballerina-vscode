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

// L2: TypeDiagram model-fetch behaviour. The type model is fetched asynchronously and
// re-fetched whenever the visualizer location changes, so two fetches can be in flight at
// once. `getComponentModel` must ignore an older response that lands after a newer one,
// and must always clear the loading state - including when there is nothing to fetch.
// Both failure modes (a stale model flashing in, a progress ring that never goes away)
// are easy to miss by hand, so they are pinned here.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

// The core barrel pulls in ESM-only LS transport modules that jest cannot load; only two
// enum-like values are used here.
jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    EVENT_TYPE: { OPEN_VIEW: "OPEN_VIEW", UPDATE_PROJECT_LOCATION: "UPDATE_PROJECT_LOCATION" },
    MACHINE_VIEW: { BIServiceClassDesigner: "BIServiceClassDesigner" },
}));

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../test/rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

// Heavy children are irrelevant to fetch ordering; stub them so the test stays in jsdom
// with no diagram canvas, no type editor and no VSCode.
jest.mock("@wso2/type-diagram", () => ({
    __esModule: true,
    TypeDiagram: ({ typeModel }: any) => (
        <div data-testid="type-model">{(typeModel ?? []).map((t: any) => t.name).join(",")}</div>
    ),
}));
// Keep the refresh debounce out of the test's way.
jest.mock("../BI/diagramRefreshDebounce", () => ({ __esModule: true, DIAGRAM_REFRESH_DEBOUNCE_MS: 0 }));

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Button: ({ children, ...rest }: any) => <button {...rest}>{children}</button>,
    Codicon: (): null => null,
    ProgressRing: () => <div data-testid="progress-ring" />,
    ThemeColors: { PRIMARY: "#000", ON_SURFACE: "#000" },
    View: ({ children }: any) => <div>{children}</div>,
    ViewContent: ({ children }: any) => <div>{children}</div>,
}));
jest.mock("@wso2/ballerina-side-panel", () => ({
    __esModule: true,
    PanelContainer: ({ children }: any) => <div>{children}</div>,
}));
jest.mock("@wso2/type-editor", () => {
    const react = require("react");
    return { __esModule: true, EditorContext: react.createContext({}) };
});
jest.mock("../../components/TopNavigationBar", () => ({ __esModule: true, TopNavigationBar: (): null => null }));
jest.mock("../../components/TitleBar", () => ({ __esModule: true, TitleBar: (): null => null }));
jest.mock("../../components/Modal", () => ({ __esModule: true, default: ({ children }: any) => <div>{children}</div> }));
jest.mock("../BI/TypeEditor", () => ({ __esModule: true, FormTypeEditor: (): null => null }));
jest.mock("./NodeSelectorView/NodeSelector", () => ({ __esModule: true, NodeSelector: (): null => null }));
jest.mock("../BI/Forms/FlowNodeForm", () => ({
    __esModule: true,
    BreadcrumbContainer: ({ children }: any) => <div>{children}</div>,
    BreadcrumbItem: ({ children }: any) => <span>{children}</span>,
    BreadcrumbSeparator: ({ children }: any) => <span>{children}</span>,
}));

import { TestRpcContext } from "../../test/rpcHarness";
import { TypeDiagram } from "./index";

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

function makeRpc(recordFilePath: string | null = "/p/types.bal") {
    const pending: Array<{ resolve: (names: string[]) => void; reject: (error: Error) => void }> = [];
    const listeners: Array<(state: boolean) => void> = [];
    const getTypes = jest.fn(
        () =>
            new Promise((resolve, reject) => {
                pending.push({
                    resolve: (names) => resolve({ types: names.map((name) => ({ name })) }),
                    reject,
                });
            })
    );

    const rpcClient = {
        getVisualizerLocation: jest.fn(async () => ({ metadata: recordFilePath ? { recordFilePath } : {} })),
        getBIDiagramRpcClient: () => ({ getTypes }),
        getCommonRpcClient: () => ({ executeCommand: jest.fn(), showErrorMessage: jest.fn() }),
        onProjectContentUpdated: jest.fn((cb: (state: boolean) => void) => {
            listeners.push(cb);
            return (): void => undefined;
        }),
    };

    return { rpcClient, getTypes, pending, listeners };
}

describe("TypeDiagram model fetching", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const renderDiagram = async (projectPath: string, rpcClient: any) => {
        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient }}>
                    <TypeDiagram projectPath={projectPath} />
                </TestRpcContext.Provider>
            );
        });
    };

    const settle = async () => {
        for (let i = 0; i < 5; i++) {
            await act(async () => undefined);
        }
    };

    // Poll the observable condition rather than sleeping for a fixed interval: the refresh
    // is debounced, so any fixed wait is either flaky or slower than it needs to be.
    const waitFor = async (condition: () => boolean, description: string) => {
        for (let i = 0; i < 50; i++) {
            if (condition()) {
                return;
            }
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 0));
            });
        }
        throw new Error(`Timed out waiting for ${description}`);
    };

    const renderedModel = () => container.querySelector('[data-testid="type-model"]');
    const progressRing = () => container.querySelector('[data-testid="progress-ring"]');

    it("ignores a stale response that resolves after a newer request completed", async () => {
        const { rpcClient, getTypes, pending } = makeRpc();

        await renderDiagram("/a", rpcClient);
        await settle();
        expect(getTypes).toHaveBeenCalledTimes(1);

        // A second fetch starts (the location changed) while the first is still in flight.
        await renderDiagram("/b", rpcClient);
        await settle();
        expect(getTypes).toHaveBeenCalledTimes(2);

        // The newer request completes first, then the older one comes back late.
        await act(async () => pending[1].resolve(["Newer"]));
        await act(async () => pending[0].resolve(["Stale"]));
        await settle();

        expect(renderedModel()?.textContent).toBe("Newer");
    });

    it("refreshes against the current location when the project content changes", async () => {
        const { rpcClient, getTypes, pending, listeners } = makeRpc();

        await renderDiagram("/a", rpcClient);
        await settle();
        await act(async () => pending[0].resolve(["First"]));
        await settle();
        expect(getTypes).toHaveBeenCalledTimes(1);

        // The debounced refresh must run the CURRENT getComponentModel. A closure captured
        // on the first render still sees `visualizerLocation` as undefined and silently
        // bails out, so a second fetch never happens.
        await act(async () => listeners.forEach((cb) => cb(true)));
        await waitFor(() => getTypes.mock.calls.length === 2, "the debounced refresh to re-fetch");

        expect(getTypes).toHaveBeenCalledTimes(2);
    });

    it("clears the loading state when the location has no types file", async () => {
        const { rpcClient, getTypes } = makeRpc(null);

        await renderDiagram("/a", rpcClient);
        await settle();

        // Nothing can be fetched, but the diagram must still leave the progress ring.
        expect(getTypes).not.toHaveBeenCalled();
        expect(progressRing()).toBeNull();
        expect(renderedModel()).not.toBeNull();
    });

    it("clears the loading state when the fetch fails", async () => {
        const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
        const { rpcClient, pending } = makeRpc();

        await renderDiagram("/a", rpcClient);
        await settle();
        expect(progressRing()).not.toBeNull();

        await act(async () => pending[0].reject(new Error("getTypes failed")));
        await settle();

        // A rejected fetch must leave the progress ring too, not hang on it forever.
        expect(progressRing()).toBeNull();
        consoleError.mockRestore();
    });
});
