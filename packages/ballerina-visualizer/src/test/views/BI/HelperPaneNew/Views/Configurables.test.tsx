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

// L2: field navigation below a record-typed configurable in the helper pane. The top level
// comes from getConfigVariablesV2 (fake rpc client); below it, fields come from the
// completion round-trip the parent owns (handleRetrieveCompletions -> filteredCompletions),
// which the harness below plays with synthetic completions.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

import { CompletionItem } from "@wso2/ui-toolkit";

let mockFieldContext: any = { field: { key: "expr" }, triggerCharacters: ["."] };

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../../rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext, Context: h.TestRpcContext };
});

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Codicon: (): null => null,
    Divider: (): null => null,
    SearchBox: (): null => null,
    Typography: ({ children }: any) => <span>{children}</span>,
    HelperPaneCustom: { Loader: () => <div data-testid="loader" /> },
}));

jest.mock("@wso2/ballerina-side-panel", () => ({
    __esModule: true,
    getPropertyFromFormField: (field: any) => field,
    useOptionalFieldContext: () => mockFieldContext,
}));

jest.mock("../../../../../views/BI/Forms/FlowNodeForm", () => ({ __esModule: true, default: (): null => null }));

jest.mock("../../../../../Context", () => ({
    __esModule: true,
    POPUP_IDS: { CONFIGURABLES: "CONFIGURABLES" },
    useModalStack: () => ({ addModal: jest.fn(), closeModal: jest.fn() }),
}));

jest.mock("../../../../../views/BI/HelperPaneNew/Components/ExpandableList", () => {
    const List = ({ children }: any) => <div>{children}</div>;
    List.Section = ({ children }: any) => <div>{children}</div>;
    return { __esModule: true, default: List };
});
jest.mock("../../../../../views/BI/HelperPaneNew/Components/ScrollableContainer", () => ({
    __esModule: true,
    ScrollableContainer: ({ children }: any) => <div>{children}</div>,
}));
jest.mock("../../../../../views/BI/HelperPaneNew/Components/FooterButtons", () => ({ __esModule: true, default: (): null => null }));
jest.mock("../../../../../views/BI/HelperPaneNew/Components/TypeIndicator", () => ({
    __esModule: true,
    TypeIndicator: ({ children }: any) => <span>{children}</span>,
}));
jest.mock("../../../../../views/BI/HelperPaneNew/Components/EmptyItemsPlaceHolder", () => ({
    __esModule: true,
    EmptyItemsPlaceHolder: ({ message }: any) => <div data-testid="empty">{message}</div>,
}));
jest.mock("../../../../../views/BI/HelperPaneNew/Components/HelperPaneListItem", () => ({
    __esModule: true,
    HelperPaneListItem: ({ children, onClick, onClickEndAction, endAction, testId, endActionTestId }: any) => (
        <div>
            <button data-testid={testId} onClick={onClick}>{children}</button>
            {endAction !== undefined && <button data-testid={endActionTestId} onClick={onClickEndAction} />}
        </div>
    ),
}));
jest.mock("../../../../../views/BI/HelperPaneNew/Components/BreadcrumbNavigation", () => ({
    __esModule: true,
    BreadcrumbNavigation: ({ breadCrumbSteps, onNavigateToBreadcrumb }: any) => (
        <div>
            {breadCrumbSteps.map((step: any) => (
                <button key={step.label} data-testid={`crumb-${step.label}`} onClick={() => onNavigateToBreadcrumb(step)}>
                    {step.label}
                </button>
            ))}
        </div>
    ),
}));
jest.mock("../../../../../views/BI/HelperPaneNew/utils/iconUtils", () => ({
    __esModule: true,
    HelperPaneIconType: { CONFIGURABLE: "CONFIGURABLE" },
    getHelperPaneIcon: (): null => null,
}));
jest.mock("../../../../../views/BI/HelperPaneNew/styles/ArrayIndexStepper", () => ({
    __esModule: true,
    ArrayIndexRow: ({ children }: any) => <div data-testid="array-index">{children}</div>,
    ArrayIndexLabel: ({ children }: any) => <span>{children}</span>,
    ArrayIndexControls: ({ children }: any) => <span>{children}</span>,
    ArrayIndexStepButton: ({ children, onClick, disabled }: any) => (
        <button data-testid={`index-step-${children}`} onClick={onClick} disabled={disabled}>{children}</button>
    ),
    ArrayIndexBadge: ({ children }: any) => <span data-testid="index-badge">{children}</span>,
}));

import { TestRpcContext } from "../../../../rpcHarness";
import { Configurables } from "../../../../../views/BI/HelperPaneNew/Views/Configurables";

declare global {
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// Jest compiles JSX with the classic runtime; Configurables.tsx relies on the automatic one.
(globalThis as any).React = React;

const configurable = (name: string, type: string) => ({
    id: name,
    properties: { variable: { value: name }, type: { value: type } },
});

// Grouped as getConfigVariablesV2 returns them: category -> module ("" is the default module) -> items.
const CONFIG_VARIABLES = {
    "my/pkg": {
        "": [
            configurable("slack", "SlackConfig"),
            configurable("port", "int"),
            configurable("host", "string"),
            configurable("enabled", "boolean"),
        ],
        "my/pkg.db": [configurable("dbConfig", "DbConfig")],
    },
};

const field = (label: string, description: string, value = label): CompletionItem => ({
    label, description, value, kind: "field", sortText: label,
} as CompletionItem);

// What the LS returns for `<path>.` under each navigation path.
const FIELDS: Record<string, CompletionItem[]> = {
    "slack.": [field("token", "string"), field("auth", "Auth"), field("channels", "Channel[]")],
    "slack.auth.": [field("user", "string")],
    "slack.channels[0].": [field("id", "string")],
    "slack.channels[1].": [field("id", "string")],
};

const fakeRpcClient = {
    getBIDiagramRpcClient: () => ({
        getConfigVariableNodeTemplate: async () => ({ flowNode: { codedata: {} } }),
        getConfigVariablesV2: async () => ({ configVariables: CONFIG_VARIABLES, errorMsg: "" }),
    }),
    getVisualizerLocation: async () => ({ projectPath: "/project" }),
    getCommonRpcClient: () => ({ getCurrentProjectTomlValues: async (): Promise<any> => ({ package: {} }) }),
};

const EXCLUDED: string[] = [];
const LINE_RANGE = { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } } as any;

type Retrieve = (value: string, property: any, offset: number, triggerCharacter?: string) => Promise<void>;

// Plays the parent (FlowNodeForm/FocusFlowDiagram): owns filteredCompletions and publishes
// each response into it, as the real debounced callback does.
let publish: (items: CompletionItem[]) => void;
const Harness = ({ retrieve, withCompletions = true, onChange, onClose }: {
    retrieve?: Retrieve; withCompletions?: boolean; onChange: jest.Mock; onClose: jest.Mock;
}) => {
    const [completions, setCompletions] = React.useState<CompletionItem[]>([]);
    publish = setCompletions;
    return (
        <TestRpcContext.Provider value={{ rpcClient: fakeRpcClient }}>
            <Configurables
                onChange={onChange}
                onClose={onClose}
                anchorRef={{ current: null }}
                fileName="/project/main.bal"
                targetLineRange={LINE_RANGE}
                excludedConfigs={EXCLUDED}
                filteredCompletions={withCompletions ? completions : undefined}
                handleRetrieveCompletions={retrieve}
            />
        </TestRpcContext.Provider>
    );
};

const answeringRetrieve = jest.fn<Promise<void>, Parameters<Retrieve>>(async (value) => {
    publish(FIELDS[value] ?? []);
});

describe("Configurables helper pane field navigation", () => {
    let container: HTMLDivElement;
    let root: Root;
    let onChange: jest.Mock;
    let onClose: jest.Mock;

    const q = (testId: string) => container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    const flush = async () => { await act(async () => { await Promise.resolve(); }); };

    const renderPane = async (props: { retrieve?: Retrieve; withCompletions?: boolean } = {}) => {
        await act(async () => {
            root.render(<Harness retrieve={answeringRetrieve} {...props} onChange={onChange} onClose={onClose} />);
        });
        // The top-level list waits on a 500 ms minimum loader the first time.
        await act(async () => { jest.advanceTimersByTime(500); });
        await flush();
    };

    beforeEach(() => {
        jest.useFakeTimers();
        mockFieldContext = { field: { key: "expr" }, triggerCharacters: ["."] };
        answeringRetrieve.mockClear();
        onChange = jest.fn();
        onClose = jest.fn();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        jest.useRealTimers();
    });

    it("offers drill-in only on non-primitive configurables of the default module", async () => {
        await renderPane();

        const navigable = ["slack", "port", "host", "enabled", "dbConfig"].filter((name) => q(`helper-pane-nav-${name}`));
        expect(navigable).toEqual(["slack"]);
    });

    it.each([
        ["no completion callback", { retrieve: undefined as Retrieve }],
        ["no completion results", { withCompletions: false }],
    ])("stays a flat list with %s", async (_label, props) => {
        await renderPane(props);
        expect(q("helper-pane-item-slack")).not.toBeNull();
        expect(q("helper-pane-nav-slack")).toBeNull();
    });

    it("stays a flat list outside a field context", async () => {
        mockFieldContext = undefined;
        await renderPane();
        expect(q("helper-pane-nav-slack")).toBeNull();
    });

    it("drills into a configurable, inserts a nested field path, and returns to the root", async () => {
        await renderPane();

        await act(async () => q("helper-pane-nav-slack")!.click());
        expect(answeringRetrieve).toHaveBeenLastCalledWith("slack.", mockFieldContext.field, "slack.".length, ".");
        expect(q("helper-pane-item-token")).not.toBeNull();
        expect(q("helper-pane-item-slack")).toBeNull();

        await act(async () => q("helper-pane-nav-auth")!.click());
        expect(answeringRetrieve).toHaveBeenLastCalledWith("slack.auth.", mockFieldContext.field, "slack.auth.".length, ".");

        await act(async () => q("helper-pane-item-user")!.click());
        expect(onChange).toHaveBeenCalledWith("slack.auth.user", false);
        expect(onClose).toHaveBeenCalled();

        await act(async () => q("crumb-Configurables")!.click());
        expect(q("helper-pane-item-slack")).not.toBeNull();
        expect(q("helper-pane-item-token")).toBeNull();
    });

    it("steps the index of an array-of-record field", async () => {
        await renderPane();
        await act(async () => q("helper-pane-nav-slack")!.click());
        expect(q("array-index")).toBeNull();

        await act(async () => q("helper-pane-nav-channels")!.click());
        expect(answeringRetrieve).toHaveBeenLastCalledWith("slack.channels[0].", expect.anything(), expect.any(Number), ".");
        expect(q("index-badge")!.textContent).toBe("0");
        expect(q("index-step--")!.disabled).toBe(true);

        await act(async () => q("index-step-+")!.click());
        expect(q("index-badge")!.textContent).toBe("1");
        await act(async () => { jest.advanceTimersByTime(400); });
        await flush();
        expect(answeringRetrieve).toHaveBeenLastCalledWith("slack.channels[1].", expect.anything(), expect.any(Number), ".");

        await act(async () => q("helper-pane-item-id")!.click());
        expect(onChange).toHaveBeenCalledWith("slack.channels[1].id", false);
    });

    it("drops a pending index step when the user navigates away before it flushes", async () => {
        await renderPane();
        await act(async () => q("helper-pane-nav-slack")!.click());
        await act(async () => q("helper-pane-nav-channels")!.click());

        await act(async () => q("index-step-+")!.click());
        await act(async () => q("crumb-slack")!.click());
        await act(async () => { jest.advanceTimersByTime(400); });
        await flush();

        // The stale timer would restore `slack.channels[1]` over the breadcrumb the user chose.
        expect(q("crumb-channels[1]")).toBeNull();
        expect(q("array-index")).toBeNull();
        expect(q("helper-pane-item-token")).not.toBeNull();
        expect(answeringRetrieve).toHaveBeenLastCalledWith("slack.", expect.anything(), expect.any(Number), ".");
    });

    it("shows a failure instead of stale fields when the completion request rejects", async () => {
        const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
        const failing = jest.fn<Promise<void>, Parameters<Retrieve>>(async (value) => {
            if (value === "slack.auth.") {
                throw new Error("LS unavailable");
            }
            publish(FIELDS[value] ?? []);
        });
        await renderPane({ retrieve: failing });

        await act(async () => q("helper-pane-nav-slack")!.click());
        await act(async () => q("helper-pane-nav-auth")!.click());

        expect(q("empty")!.textContent).toBe("Failed to load fields");
        expect(q("helper-pane-item-token")).toBeNull();
        consoleError.mockRestore();
    });

    it("keeps the loader until the latest path's request settles", async () => {
        const pending: Record<string, () => void> = {};
        const deferred = jest.fn<Promise<void>, Parameters<Retrieve>>((value) =>
            new Promise<void>((resolve) => {
                pending[value] = () => { publish(FIELDS[value] ?? []); resolve(); };
            })
        );
        await renderPane({ retrieve: deferred });

        await act(async () => q("helper-pane-nav-slack")!.click());
        await act(async () => pending["slack."]());
        await act(async () => q("helper-pane-nav-auth")!.click());
        await act(async () => q("crumb-slack")!.click());
        // The superseded `slack.auth.` request finishes after the newer `slack.` one was sent.
        await act(async () => pending["slack.auth."]());

        expect(q("loader")).not.toBeNull();
        expect(q("helper-pane-item-user")).toBeNull();
    });
});
