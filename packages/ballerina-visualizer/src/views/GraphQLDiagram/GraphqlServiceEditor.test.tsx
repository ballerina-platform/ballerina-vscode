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

// L2: deleting a GraphQL operation. Nothing awaits this delete — the confirmation popup calls the
// handler and moves on — so anything that rejects inside it escapes as an unhandled rejection and
// takes down the whole webview. That is what happened when the refresh that follows the delete hit
// the language server with the range the panel was opened with, which the deletion had just made
// stale (the service is shorter now). The server-side half of that is covered by
// GetServiceModelFromSourceTest; asserted here is that this handler contains its own failures.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

// The core barrel pulls in ESM-only LS transport modules that jest cannot load; only the values
// this view reads are needed. DIRECTORY_MAP keys must match the real ones because the artifact
// lookup indexes the directory map with them.
jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    DIRECTORY_MAP: { SERVICE: "SERVICE", LISTENER: "LISTENER" },
    EVENT_TYPE: { OPEN_VIEW: "OPEN_VIEW" },
    MACHINE_VIEW: { BIServiceConfigView: "BIServiceConfigView", BIListenerConfigView: "BIListenerConfigView" },
    isSamePath: (a: string, b: string) => a === b,
    removeStatement: (position: unknown) => ({ type: "DELETE", position }),
}));

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../test/rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
    Codicon: (): null => null,
    Divider: (): null => null,
    Dropdown: (): null => null,
    Icon: (): null => null,
    LinkButton: ({ children }: any) => <span>{children}</span>,
    ProgressRing: () => <div data-testid="progress-ring" />,
    Typography: ({ children }: any) => <div>{children}</div>,
    ViewHeader: ({ children }: any) => <div>{children}</div>,
    ThemeColors: new Proxy({}, { get: () => "#000" }),
}));

jest.mock("@vscode/webview-ui-toolkit/react", () => ({
    __esModule: true,
    VSCodeButton: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

jest.mock("@wso2/ballerina-side-panel", () => ({
    __esModule: true,
    PanelContainer: ({ children }: any) => <div>{children}</div>,
}));

jest.mock("./OperationForm", () => ({ __esModule: true, OperationForm: (): null => null }));

// The accordion's own confirmation popup is not what is under test; this stub deletes on click,
// the way the popup's confirm callback does — without awaiting the handler.
jest.mock("./OperationAccordian", () => ({
    __esModule: true,
    OperationAccordion: ({ functionModel, onDeleteFunction }: any) => (
        <button data-testid={`delete-${functionModel.name.value}`} onClick={() => onDeleteFunction(functionModel)}>
            {functionModel.name.value}
        </button>
    ),
}));

const applyModifications = jest.fn(async (..._args: unknown[]): Promise<void> => undefined);
jest.mock("../../utils/utils", () => ({
    __esModule: true,
    applyModifications: (...args: unknown[]) => applyModifications.apply(null, args as []),
}));

import { TestRpcContext } from "../../test/rpcHarness";
import { GraphqlServiceEditor } from "./GraphqlServiceEditor";

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PROJECT_PATH = "/workspace/orders";
const FILE_PATH = "/workspace/orders/main.bal";
const SERVICE_NAME = "/graphql";

/** The range the panel is opened with: the service as it was before the delete. */
const STALE_LINE_RANGE = {
    startLine: { line: 4, offset: 0 },
    endLine: { line: 12, offset: 1 },
};

function serviceWith(fieldNames: string[]) {
    return {
        name: "GraphQL Service",
        // The attach point, as the language server reports it. The panel sends it back so a refresh
        // cannot be answered with a different service that has come to enclose its range.
        properties: { basePath: { value: SERVICE_NAME } },
        functions: fieldNames.map((name) => ({
            kind: "QUERY",
            name: { value: name },
            codedata: { lineRange: { startLine: { line: 5, offset: 4 }, endLine: { line: 7, offset: 5 } } },
        })),
    };
}

function makeRpc(getServiceModelFromCode: jest.Mock): any {
    const rpcClient: any = {
        getServiceDesignerRpcClient: () => ({
            getServiceModelFromCode,
            getFunctionModel: async () => ({ function: {} }),
        }),
        getVisualizerLocation: async () => ({ projectPath: PROJECT_PATH }),
        getBIDiagramRpcClient: () => ({
            getProjectStructure: async () => ({
                projects: [
                    {
                        projectPath: PROJECT_PATH,
                        directoryMap: {
                            LISTENER: [] as unknown[],
                        },
                    },
                ],
            }),
        }),
        getVisualizerRpcClient: () => ({ openView: jest.fn() }),
    };
    return rpcClient;
}

describe("GraphqlServiceEditor delete", () => {
    let container: HTMLDivElement;
    let root: Root;
    let rejections: unknown[];
    let onRejection: (reason: unknown) => void;

    beforeEach(() => {
        applyModifications.mockClear();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        rejections = [];
        onRejection = (reason: unknown) => rejections.push(reason);
        process.on("unhandledRejection", onRejection);
    });

    afterEach(() => {
        process.off("unhandledRejection", onRejection);
        act(() => root.unmount());
        container.remove();
    });

    const render = async (rpcClient: any) => {
        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient }}>
                    <GraphqlServiceEditor
                        serviceIdentifier={SERVICE_NAME}
                        filePath={FILE_PATH}
                        lineRange={STALE_LINE_RANGE}
                        onClose={(): void => undefined}
                    />
                </TestRpcContext.Provider>
            );
        });
        await settle();
    };

    /** Let the mount's fetches, and anything they chain, run to completion. */
    const settle = async () => {
        for (let i = 0; i < 10; i++) {
            await act(async () => undefined);
        }
        await new Promise((resolve) => setImmediate(resolve));
    };

    it("applies the deletion and refreshes the operations that are left", async () => {
        const getServiceModelFromCode = jest
            .fn<any, any>()
            .mockResolvedValueOnce({ service: serviceWith(["we", "other"]) })
            .mockResolvedValue({ service: serviceWith(["other"]) });
        await render(makeRpc(getServiceModelFromCode));

        expect(getServiceModelFromCode).toHaveBeenCalledTimes(1);

        await act(async () => {
            (container.querySelector('[data-testid="delete-we"]') as HTMLElement).click();
        });
        await settle();

        expect(applyModifications).toHaveBeenCalledTimes(1);
        // The edit goes to the file this panel is editing, not to whatever the visualizer's
        // current location happens to be.
        expect(applyModifications.mock.calls[0][2]).toBe(FILE_PATH);
        expect(getServiceModelFromCode).toHaveBeenCalledTimes(2);
        // The mount had no model to name a service from; the refresh does, and the range it sends is
        // the stale one, which is exactly when the server needs the name to disambiguate.
        expect(getServiceModelFromCode.mock.calls[0][0].codedata.originalName).toBeUndefined();
        expect(getServiceModelFromCode.mock.calls[1][0].codedata.originalName).toBe(SERVICE_NAME);
        expect(container.querySelector('[data-testid="delete-we"]')).toBeNull();
        expect(container.querySelector('[data-testid="delete-other"]')).toBeTruthy();
        expect(rejections).toEqual([]);
    });

    it("clears the panel when the refresh finds no service", async () => {
        // The service this panel was opened on is gone - deleted or renamed elsewhere. Keeping the
        // operations on screen would leave every one of them wired to a range that now points at
        // other text, and onDeleteFunction edits at that range.
        const getServiceModelFromCode = jest
            .fn<any, any>()
            .mockResolvedValueOnce({ service: serviceWith(["we"]) })
            .mockResolvedValue({ service: undefined });
        await render(makeRpc(getServiceModelFromCode));

        await act(async () => {
            (container.querySelector('[data-testid="delete-we"]') as HTMLElement).click();
        });
        await settle();

        expect(rejections).toEqual([]);
        expect(container.querySelector('[data-testid="delete-we"]')).toBeNull();
        expect(container.querySelector('[data-testid="progress-ring"]')).toBeTruthy();
    });

    it("contains a refresh that fails and keeps showing the fields it has", async () => {
        // The shape of the failure being guarded: the language server rejects with a plain object,
        // which is what reached the dev overlay as `[object Object]`.
        const getServiceModelFromCode = jest
            .fn<any, any>()
            .mockResolvedValueOnce({ service: serviceWith(["we"]) })
            .mockRejectedValue({ code: -32603, message: "Internal error" });
        await render(makeRpc(getServiceModelFromCode));

        expect(container.querySelector('[data-testid="delete-we"]')).toBeTruthy();

        await act(async () => {
            (container.querySelector('[data-testid="delete-we"]') as HTMLElement).click();
        });
        await settle();

        expect(rejections).toEqual([]);
        // Still the panel, not a blank frame: the last known model survives a failed refresh.
        expect(container.querySelector('[data-testid="delete-we"]')).toBeTruthy();
        expect(container.querySelector('[data-testid="progress-ring"]')).toBeNull();
    });

    it("does not fail when the project has no listeners", async () => {
        const getServiceModelFromCode = jest.fn(async (_request: unknown) => ({ service: serviceWith(["we"]) }));
        const rpcClient = makeRpc(getServiceModelFromCode);
        rpcClient.getBIDiagramRpcClient = () => ({
            // A project whose directory map carries no LISTENER entry at all.
            getProjectStructure: async () => ({
                projects: [{ projectPath: PROJECT_PATH, directoryMap: {} as Record<string, unknown[]> }],
            }),
        });

        await render(rpcClient);

        expect(rejections).toEqual([]);
        expect(container.querySelector('[data-testid="delete-we"]')).toBeTruthy();
    });
});
