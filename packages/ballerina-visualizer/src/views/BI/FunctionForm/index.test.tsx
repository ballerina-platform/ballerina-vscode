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
import type { BISourceCodeRequest } from "@wso2/ballerina-core";

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

// The form body itself is irrelevant here; its presence is the assertion. Its props are kept so a
// test can submit the form.
let mockArtifactFormProps: { onSubmit: (data: Record<string, unknown>) => Promise<void> } | undefined;
jest.mock("../Forms/ArtifactForm", () => ({
    __esModule: true,
    default: (props: any) => {
        mockArtifactFormProps = props;
        return <div data-testid="artifact-form" />;
    },
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

// The mount does several awaits in sequence (end-of-file, then the load), so one act pass
// is not enough to settle them.
const flush = async () => {
    for (let i = 0; i < 10; i++) {
        await act(async () => undefined);
    }
};

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

// L2: what the form shows while creating a workflow artifact waits on Central. Saving adds the
// workflow import, and the project's first compile then pulls workflow's dependencies before the
// save can finish (wso2/product-integrator#2731).
describe("FunctionForm pulling status while saving", () => {
    const SAVE_PULL_TEXT = "Please wait while the workflow's dependencies are being pulled.";
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        // Only timers are faked: act and the RPC promises need real microtasks and ticks.
        jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        mockArtifactFormProps = undefined;
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    /** Renders a create form and submits it; the save stays in flight on `getSourceCode`. */
    const submitCreate = async (kind: { isWorkflow?: boolean; isDurableAgent?: boolean; isActivity?: boolean }) => {
        const pendingSave = deferred<unknown>();
        const rpc = makeRpc({ getSourceCode: () => pendingSave.promise });
        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient: rpc }}>
                    <FunctionForm filePath={FILE_PATH} projectPath={PROJECT_PATH} functionName={undefined} {...kind} />
                </TestRpcContext.Provider>
            );
        });
        await flush();
        expect(mockArtifactFormProps).toBeDefined();
        await act(async () => {
            void mockArtifactFormProps!.onSubmit({ functionName: "orderFlow" });
        });
        await flush();
    };

    const pullCard = () => container.textContent?.includes(SAVE_PULL_TEXT) ?? false;
    const loadingRing = () => container.querySelector('[data-testid="loading-ring"]');

    // All three create flows import ballerina/workflow, so all three can wait on its dependencies.
    it.each([
        ["Durable Workflow", { isWorkflow: true }],
        ["Durable Agentic Workflow", { isDurableAgent: true }],
        ["Workflow Activity", { isActivity: true }],
    ])("%s: shows the plain loader first, then the pulling status once the save runs past the delay", async (_, kind) => {
        await submitCreate(kind);
        expect(loadingRing()).not.toBeNull();
        expect(pullCard()).toBe(false);

        await act(async () => { jest.advanceTimersByTime(3000); });
        expect(pullCard()).toBe(true);
        expect(loadingRing()).toBeNull();
    });

    it("keeps the plain loader for an artifact that pulls no workflow package", async () => {
        await submitCreate({});
        await act(async () => { jest.advanceTimersByTime(3000); });
        expect(pullCard()).toBe(false);
        expect(loadingRing()).not.toBeNull();
    });
});

// L2: an edit after the name was renamed in place (wso2/product-integrator#2799). The name field
// renames through the LS before Save, which moves the end of the signature; rewriting the range
// read at load time then cut into the data mapper's `=>` and left it a block-bodied function.
describe("FunctionForm save after an in-place rename", () => {
    let container: HTMLDivElement;
    let root: Root;

    const LOADED_RANGE = { fileName: "data_mappings.bal", startLine: { line: 4, offset: 0 }, endLine: { line: 4, offset: 52 } };
    const RENAMED_RANGE = { fileName: "data_mappings.bal", startLine: { line: 4, offset: 0 }, endLine: { line: 4, offset: 47 } };

    const dataMapper = (name: string, lineRange: typeof LOADED_RANGE) => ({
        codedata: { node: "DATA_MAPPER_DEFINITION", lineRange },
        properties: { functionName: { value: name } },
    });

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        mockArtifactFormProps = undefined;
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        jest.restoreAllMocks();
    });

    /** Loads `transformPerson`, submits the form with `formName`, and returns the save's mocks. */
    const submitAs = async (formName: string, getFunctionNode: jest.Mock, extra: Record<string, unknown> = {}) => {
        const getSourceCode = jest.fn(async (_request: BISourceCodeRequest) => ({ artifacts: [] as unknown[] }));
        const showErrorMessage = jest.fn();
        const rpc = {
            ...makeRpc({ getFunctionNode, getSourceCode }),
            getCommonRpcClient: () => ({ showErrorMessage }),
        };
        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient: rpc }}>
                    <FunctionForm filePath={FILE_PATH} projectPath={PROJECT_PATH} functionName="transformPerson" isDataMapper />
                </TestRpcContext.Provider>
            );
        });
        await flush();
        expect(mockArtifactFormProps).toBeDefined();
        await act(async () => {
            await mockArtifactFormProps!.onSubmit({ functionName: formName, ...extra });
        });
        await flush();
        return { getSourceCode, showErrorMessage };
    };

    /** Submits as `formName` and returns the node the save sent to the LS. */
    const saveAs = async (formName: string, getFunctionNode: jest.Mock, extra: Record<string, unknown> = {}) => {
        const { getSourceCode } = await submitAs(formName, getFunctionNode, extra);
        expect(getSourceCode).toHaveBeenCalledTimes(1);
        return getSourceCode.mock.calls[0][0].flowNode;
    };

    /** The load answers with `transformPerson`; each later re-read answers from `byName`. */
    const lookups = (byName: Record<string, unknown>) => {
        let loaded = false;
        return jest.fn(async ({ functionName }: { functionName: string }): Promise<unknown> => {
            if (!loaded) {
                loaded = true;
                return { functionDefinition: dataMapper("transformPerson", LOADED_RANGE) };
            }
            return byName[functionName];
        });
    };
    let getFunctionNode: ReturnType<typeof lookups>;

    it("rewrites the signature at its range under the new name", async () => {
        getFunctionNode = lookups({ toEmp: { functionDefinition: dataMapper("toEmp", RENAMED_RANGE) } });

        const flowNode = await saveAs("toEmp", getFunctionNode);

        expect(getFunctionNode).toHaveBeenLastCalledWith(expect.objectContaining({ functionName: "toEmp" }));
        expect(flowNode.codedata.lineRange).toEqual(RENAMED_RANGE);
        expect(flowNode.codedata.node).toBe("DATA_MAPPER_DEFINITION");
    });

    it("keeps the loaded range without re-reading when the name is unchanged", async () => {
        getFunctionNode = lookups({});

        const flowNode = await saveAs("transformPerson", getFunctionNode);

        expect(getFunctionNode).toHaveBeenCalledTimes(1);
        expect(flowNode.codedata.lineRange).toEqual(LOADED_RANGE);
    });

    /** A parameter loaded from source as `person`, now named `name` in the form. Its name is
     *  renamed in place unless `identifierEditable` (as for data mappers, whose names the save rewrites).
     *  As after an edit, `key` already follows the new name and only `loadedKey` keeps the old one. */
    const loadedParam = (name: string, identifierEditable = false) => ({
        key: name,
        loadedKey: "person",
        identifierEditable,
        identifierRange: { fileName: "data_mappings.bal", startLine: { line: 4, offset: 30 }, endLine: { line: 4, offset: 36 } },
        formValues: { type: "Person", variable: name },
    });

    // A parameter renamed in place moves the end of the signature just as a function rename does.
    it("re-reads the range when a parameter was renamed in place under an unchanged name", async () => {
        getFunctionNode = lookups({ transformPerson: { functionDefinition: dataMapper("transformPerson", RENAMED_RANGE) } });

        const flowNode = await saveAs("transformPerson", getFunctionNode, { parameters: [loadedParam("p")] });

        expect(getFunctionNode).toHaveBeenCalledTimes(2);
        expect(getFunctionNode).toHaveBeenLastCalledWith(expect.objectContaining({ functionName: "transformPerson" }));
        expect(flowNode.codedata.lineRange).toEqual(RENAMED_RANGE);
    });

    it("keeps the loaded range when parameters are untouched or newly added", async () => {
        getFunctionNode = lookups({});
        const added = { key: "", identifierEditable: true, identifierRange: undefined as unknown, formValues: { type: "int", variable: "age" } };

        const flowNode = await saveAs("transformPerson", getFunctionNode, { parameters: [loadedParam("person"), added] });

        expect(getFunctionNode).toHaveBeenCalledTimes(1);
        expect(flowNode.codedata.lineRange).toEqual(LOADED_RANGE);
    });

    it("keeps the loaded range when an editable parameter name changes", async () => {
        getFunctionNode = lookups({});

        const flowNode = await saveAs("transformPerson", getFunctionNode, { parameters: [loadedParam("p", true)] });

        expect(getFunctionNode).toHaveBeenCalledTimes(1);
        expect(flowNode.codedata.lineRange).toEqual(LOADED_RANGE);
    });

    it("aborts the save when re-reading after a parameter rename fails", async () => {
        getFunctionNode = lookups({ transformPerson: undefined });

        const { getSourceCode, showErrorMessage } = await submitAs("transformPerson", getFunctionNode, { parameters: [loadedParam("p")] });

        expect(getSourceCode).not.toHaveBeenCalled();
        expect(showErrorMessage).toHaveBeenCalledTimes(1);
    });

    // The form takes the new name whenever renameIdentifier resolves, including when the LS
    // applied no edit, so the source can still carry the original name.
    it("falls back to the original name when the rename was not applied", async () => {
        getFunctionNode = lookups({ transformPerson: { functionDefinition: dataMapper("transformPerson", LOADED_RANGE) } });

        const flowNode = await saveAs("toEmp", getFunctionNode);

        expect(getFunctionNode).toHaveBeenNthCalledWith(2, expect.objectContaining({ functionName: "toEmp" }));
        expect(getFunctionNode).toHaveBeenNthCalledWith(3, expect.objectContaining({ functionName: "transformPerson" }));
        expect(flowNode.codedata.lineRange).toEqual(LOADED_RANGE);
    });

    // The rpc-manager resolves `undefined` on an LS error and the LS answers a miss with an empty
    // definition, so those are the shapes a failed re-read takes in production.
    it.each([
        ["nothing", undefined],
        ["an empty definition", { functionDefinition: {} }],
    ])("aborts the save when a renamed definition re-reads as %s", async (_, miss) => {
        getFunctionNode = lookups({ toEmp: miss, transformPerson: miss });

        const { getSourceCode, showErrorMessage } = await submitAs("toEmp", getFunctionNode);

        expect(getSourceCode).not.toHaveBeenCalled();
        expect(showErrorMessage).toHaveBeenCalledTimes(1);
    });

    it("aborts the save when re-reading a renamed definition rejects", async () => {
        const rejecting = jest
            .fn()
            .mockResolvedValueOnce({ functionDefinition: dataMapper("transformPerson", LOADED_RANGE) })
            .mockRejectedValue(new Error("LS not ready"));

        const { getSourceCode, showErrorMessage } = await submitAs("toEmp", rejecting);

        expect(getSourceCode).not.toHaveBeenCalled();
        expect(showErrorMessage).toHaveBeenCalledTimes(1);
    });
});
