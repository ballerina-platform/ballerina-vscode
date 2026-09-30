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

// L2: what the form shows when a load fails. Both loaders report failure through one error
// card and one `loadError` flag, and both clear the node so the previous artifact's form
// cannot stay on screen under that card. The interesting part is the interaction with
// `loadSeqRef`: a rejection that lost the race must not touch either piece of state, which
// is a two-load ordering that is impractical to reach by hand.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

// The core barrel pulls in ESM-only LS transport modules that jest cannot load. Only the
// values this view reads are needed.
jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    EVENT_TYPE: { OPEN_VIEW: "OPEN_VIEW", CLOSE_VIEW: "CLOSE_VIEW" },
    DIRECTORY_MAP: { FUNCTION: "FUNCTION", WORKFLOW: "WORKFLOW", ACTIVITY: "ACTIVITY", DURABLE_AGENT: "DURABLE_AGENT" },
    getPrimaryInputType: (): undefined => undefined,
    isTemplateType: (): boolean => false,
}));

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Button: ({ children, onClick, appearance, ...rest }: any) => (
        <button onClick={onClick} data-appearance={appearance} {...rest}>{children}</button>
    ),
    Codicon: (): null => null,
    Icon: (): null => null,
    Typography: ({ children }: any) => <div>{children}</div>,
    ThemeColors: { ERROR: "#f00", ON_SURFACE: "#000" },
    View: ({ children }: any) => <div>{children}</div>,
    ViewContent: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../test/rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

// The form body itself is irrelevant here; its presence is the assertion.
jest.mock("../Forms/ArtifactForm", () => ({
    __esModule: true,
    default: () => <div data-testid="artifact-form" />,
}));

jest.mock("../../../components/TitleBar", () => ({ __esModule: true, TitleBar: (): null => null }));
jest.mock("../../../components/TopNavigationBar", () => ({ __esModule: true, TopNavigationBar: (): null => null }));
jest.mock("../../../components/FormHeader", () => ({ __esModule: true, FormHeader: (): null => null }));
jest.mock("../../../components/DownloadIcon", () => ({ __esModule: true, DownloadIcon: (): null => null }));
jest.mock("../../../components/Loader", () => ({
    __esModule: true,
    LoadingRing: () => <div data-testid="loading-ring" />,
}));
jest.mock("../../styles", () => ({
    __esModule: true,
    LoadingContainer: ({ children }: any) => <div>{children}</div>,
    TopBar: ({ children }: any) => <div>{children}</div>,
    BodyText: ({ children }: any) => <div>{children}</div>,
}));

// One field is enough for `functionFields.length > 0`, the gate the form renders behind.
jest.mock("../../../utils/bi", () => ({
    __esModule: true,
    convertConfig: (): Record<string, unknown>[] => [{ key: "functionName", label: "Name", type: "IDENTIFIER", types: [] }],
    getImportsForProperty: (): undefined => undefined,
    orderFormFields: (fields: unknown[]) => fields,
    DURABLE_AGENT_FORM_ORDER: [] as string[],
}));

import { TestRpcContext } from "../../../test/rpcHarness";
import { FunctionForm } from "./index";

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

const FILE_PATH = "/workspace/orders/functions.bal";
const PROJECT_PATH = "/workspace/orders";
const ERROR_TEXT = "Failed to load the function. Please try again.";

const functionDefinition = (name: string) => ({
    codedata: { node: "FUNCTION_DEFINITION", lineRange: { fileName: "functions.bal", startLine: { line: 1, offset: 0 }, endLine: { line: 3, offset: 1 } } },
    properties: { functionName: { value: name } },
});

/** A promise the test settles, so a load can be left in flight while a newer one starts. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function makeRpc(overrides: Record<string, unknown> = {}) {
    return {
        getBIDiagramRpcClient: () => ({
            getEndOfFile: async () => ({ line: 10, offset: 0 }),
            getFunctionNames: async (): Promise<{ mentions: string[] }> => ({ mentions: [] }),
            getFunctionNode: async () => ({ functionDefinition: functionDefinition("greet") }),
            getNodeTemplate: async () => ({ flowNode: functionDefinition("greet") }),
            ...overrides,
        }),
        getVisualizerRpcClient: () => ({
            joinProjectPath: async () => ({ filePath: FILE_PATH }),
            openView: jest.fn(),
        }),
        onIdentifierUpdated: jest.fn(() => (): void => undefined),
    };
}

describe("FunctionForm load failures", () => {
    let container: HTMLDivElement;
    let root: Root;
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        // Both loaders log the rejection; the test asserts on the card, not the console.
        consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        jest.restoreAllMocks();
    });

    const renderForm = async (rpcClient: any, functionName: string) => {
        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient }}>
                    <FunctionForm filePath={FILE_PATH} projectPath={PROJECT_PATH} functionName={functionName} />
                </TestRpcContext.Provider>
            );
        });
        await flush();
    };

    // The mount does several awaits in sequence (end-of-file, then the load), so one act pass
    // is not enough to settle them.
    const flush = async () => {
        for (let i = 0; i < 10; i++) {
            await act(async () => undefined);
        }
    };

    const errorCard = () => container.textContent?.includes(ERROR_TEXT) ?? false;
    const form = () => container.querySelector('[data-testid="artifact-form"]');
    const retryButton = () =>
        Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Retry");

    it("shows the error card and no form when the edit-path load rejects", async () => {
        const rpc = makeRpc({ getFunctionNode: async () => { throw new Error("LS not ready"); } });
        await renderForm(rpc, "greet");

        expect(errorCard()).toBe(true);
        expect(form()).toBeNull();
        expect(container.querySelector('[data-testid="loading-ring"]')).toBeNull();
        expect(consoleError).toHaveBeenCalled();
    });

    it("shows the error card and no form when the create-path load rejects", async () => {
        const rpc = makeRpc({ getNodeTemplate: async () => { throw new Error("offline"); } });
        await renderForm(rpc, undefined);

        expect(errorCard()).toBe(true);
        expect(form()).toBeNull();
    });

    it("clears a previously loaded node when a later load rejects", async () => {
        const pending = deferred<{ functionDefinition: unknown }>();
        let call = 0;
        const rpc = makeRpc({
            getFunctionNode: async () => {
                call += 1;
                if (call === 1) {
                    return { functionDefinition: functionDefinition("greet") };
                }
                return pending.promise;
            },
        });

        await renderForm(rpc, "greet");
        expect(form()).not.toBeNull();

        // A second load of the same form, as happens when the parent swaps the artifact.
        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient: rpc }}>
                    <FunctionForm filePath={FILE_PATH} projectPath={PROJECT_PATH} functionName="farewell" />
                </TestRpcContext.Provider>
            );
        });
        await act(async () => { pending.reject(new Error("timeout")); });
        await flush();

        expect(errorCard()).toBe(true);
        expect(form()).toBeNull();
    });

    it("re-fires the load when Retry is clicked", async () => {
        const getFunctionNode = jest
            .fn()
            .mockRejectedValueOnce(new Error("LS not ready"))
            .mockResolvedValueOnce({ functionDefinition: functionDefinition("greet") });
        await renderForm(makeRpc({ getFunctionNode }), "greet");

        expect(errorCard()).toBe(true);
        const retry = retryButton();
        expect(retry).toBeDefined();

        await act(async () => { retry!.click(); });
        await flush();

        expect(getFunctionNode).toHaveBeenCalledTimes(2);
        expect(errorCard()).toBe(false);
        expect(form()).not.toBeNull();
    });

    it("ignores a superseded rejection, leaving the newer load's node in place", async () => {
        const stale = deferred<{ functionDefinition: unknown }>();
        let call = 0;
        const rpc = makeRpc({
            getFunctionNode: async () => {
                call += 1;
                // The first load never settles until the test rejects it, by which time a
                // second load has claimed loadSeqRef.
                return call === 1 ? stale.promise : { functionDefinition: functionDefinition("farewell") };
            },
        });

        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient: rpc }}>
                    <FunctionForm filePath={FILE_PATH} projectPath={PROJECT_PATH} functionName="greet" />
                </TestRpcContext.Provider>
            );
        });
        await flush();
        expect(form()).toBeNull();

        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient: rpc }}>
                    <FunctionForm filePath={FILE_PATH} projectPath={PROJECT_PATH} functionName="farewell" />
                </TestRpcContext.Provider>
            );
        });
        await flush();
        expect(form()).not.toBeNull();

        await act(async () => { stale.reject(new Error("timeout")); });
        await flush();

        expect(errorCard()).toBe(false);
        expect(form()).not.toBeNull();
    });
});
