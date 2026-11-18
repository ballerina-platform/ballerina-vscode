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
// completion round-trip the parent owns: handleRetrieveCompletions returns this pane's
// response and also publishes it into the shared filteredCompletions, which the harness
// below plays with synthetic completions.

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
    Tooltip: ({ children }: any) => <>{children}</>,
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
Object.assign(globalThis, { React });

const configurable = (name: string, type: string): any => ({
    id: name,
    properties: { variable: { value: name }, type: { value: type } },
});

// Grouped as getConfigVariablesV2 returns them: category -> module ("" is the default module,
// a submodule is keyed by its short name) -> items.
const DEFAULT_MODULE_CONFIGURABLES = [
    configurable("slack", "SlackConfig"),
    configurable("port", "int"),
    configurable("host", "string"),
    configurable("enabled", "boolean"),
];
let configVariables: Record<string, Record<string, any[]>>;
let tomlPackage: { org?: string; name?: string };

// Type definitions of the edited module, as getTypes returns them.
const MODULE_TYPES = [
    { name: "SlackConfig", codedata: { node: "RECORD" } },
    { name: "Auth", codedata: { node: "RECORD" } },
    { name: "Channel", codedata: { node: "RECORD" } },
    { name: "Level", codedata: { node: "ENUM" } },
    { name: "Choice", codedata: { node: "UNION" } },
];

const field = (label: string, description: string, value = label): CompletionItem => ({
    label, description, value, kind: "field", sortText: label,
} as CompletionItem);

// What the LS returns for `<path>.` under each navigation path.
const FIELDS: Record<string, CompletionItem[]> = {
    "slack.": [
        field("token", "string"), field("auth", "Auth"), field("channels", "Channel[]"),
        field("pair", "Channel[2]"), field("level", "Level"), field("tags", "string[]?"),
        field("optChannels", "Channel[]?"), field("backup", "Auth?"),
    ],
    "slack.auth.": [field("user", "string"), field("auth", "Auth")],
    "slack.auth.auth.": [field("user", "string")],
    // Reached through `?.`: an array below an optional value may be nil.
    "slack.backup?.": [field("user", "string"), field("channels", "Channel[]")],
    "slack.channels[0].": [field("id", "string")],
    "slack.channels[1].": [field("id", "string")],
    "slack.pair[0].": [field("id", "string")],
    "slack.pair[1].": [field("id", "string")],
};

const fakeRpcClient = {
    getBIDiagramRpcClient: () => ({
        getConfigVariableNodeTemplate: async () => ({ flowNode: { codedata: {} } }),
        getConfigVariablesV2: async () => ({ configVariables, errorMsg: "" }),
        getTypes: async () => ({ types: MODULE_TYPES }),
    }),
    getVisualizerLocation: async () => ({ projectPath: "/project" }),
    getCommonRpcClient: () => ({ getCurrentProjectTomlValues: async () => ({ package: tomlPackage }) }),
};

const EXCLUDED: string[] = [];
const LINE_RANGE = { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } } as any;

type Retrieve = (value: string, property: any, offset: number, triggerCharacter?: string) => Promise<CompletionItem[] | void>;

// Plays the parent (FlowNodeForm/ArtifactForm): owns filteredCompletions, publishes each
// response into it, and returns that response to the caller, as the real callback does.
let publish: (items: CompletionItem[]) => void;
const Harness = ({ retrieve, withCompletions = true, fileName = "/project/main.bal", lineRange = LINE_RANGE, onChange, onClose }: {
    retrieve?: Retrieve; withCompletions?: boolean; fileName?: string; lineRange?: any; onChange: jest.Mock; onClose: jest.Mock;
}) => {
    const [completions, setCompletions] = React.useState<CompletionItem[]>([]);
    publish = setCompletions;
    return (
        <TestRpcContext.Provider value={{ rpcClient: fakeRpcClient }}>
            <Configurables
                onChange={onChange}
                onClose={onClose}
                anchorRef={{ current: null }}
                fileName={fileName}
                targetLineRange={lineRange}
                excludedConfigs={EXCLUDED}
                filteredCompletions={withCompletions ? completions : undefined}
                handleRetrieveCompletions={retrieve}
            />
        </TestRpcContext.Provider>
    );
};

const answeringRetrieve = jest.fn<Promise<CompletionItem[]>, Parameters<Retrieve>>(async (value) => {
    const items = FIELDS[value] ?? [];
    publish(items);
    return items;
});

describe("Configurables helper pane field navigation", () => {
    let container: HTMLDivElement;
    let root: Root;
    let onChange: jest.Mock;
    let onClose: jest.Mock;

    const q = (testId: string) => container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    const flush = async () => { await act(async () => { await Promise.resolve(); }); };

    const renderPane = async (props: { retrieve?: Retrieve; withCompletions?: boolean; fileName?: string } = {}) => {
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
        configVariables = { "my/pkg": { "": DEFAULT_MODULE_CONFIGURABLES, "db": [configurable("dbConfig", "SlackConfig")] } };
        tomlPackage = {};
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

    it("offers drill-in only on record-typed configurables of the edited file's module", async () => {
        configVariables["my/pkg"][""] = [
            ...DEFAULT_MODULE_CONFIGURABLES,
            configurable("level", "Level"),
            configurable("choice", "Choice"),
            configurable("tags", "int[]?"),
            configurable("labels", "map<string>?"),
            configurable("grid", "string[][]"),
            configurable("small", "int:Unsigned8"),
            configurable("letter", "string:Char"),
            configurable("channels", "readonly & Channel[]"),
            configurable("maybeChannels", "Channel[]?"),
            configurable("client", "http:ClientConfiguration"),
        ];
        await renderPane();

        const names = Object.values(configVariables["my/pkg"]).flat().map((c) => c.properties.variable.value);
        const navigable = names.filter((name) => q(`helper-pane-configurable-nav-${name}`));
        // Imported types can't be resolved locally; their fields come from the completions.
        expect(navigable).toEqual(["slack", "channels", "client"]);
    });

    it("offers drill-in on a submodule's configurables when editing a file of that submodule", async () => {
        await renderPane({ fileName: "/project/modules/db/db.bal" });

        expect(q("helper-pane-configurable-nav-dbConfig")).not.toBeNull();
        expect(q("helper-pane-configurable-nav-slack")).toBeNull();
    });

    it("keeps test IDs distinct from the Variables pane", async () => {
        await renderPane();
        expect(container.querySelector('[data-testid^="helper-pane-item-"]')).toBeNull();
        expect(container.querySelector('[data-testid^="helper-pane-nav-"]')).toBeNull();
    });

    it.each([
        ["no completion callback", { retrieve: undefined as Retrieve }],
        ["no completion results", { withCompletions: false }],
    ])("stays a flat list with %s", async (_label, props) => {
        await renderPane(props);
        expect(q("helper-pane-configurable-slack")).not.toBeNull();
        expect(q("helper-pane-configurable-nav-slack")).toBeNull();
    });

    it("stays a flat list outside a field context", async () => {
        mockFieldContext = undefined;
        await renderPane();
        expect(q("helper-pane-configurable-nav-slack")).toBeNull();
    });

    it("drills into a configurable, inserts a nested field path, and returns to the root", async () => {
        await renderPane();

        await act(async () => q("helper-pane-configurable-nav-slack")!.click());
        expect(answeringRetrieve).toHaveBeenLastCalledWith("slack.", mockFieldContext.field, "slack.".length, ".");
        expect(q("helper-pane-configurable-token")).not.toBeNull();
        expect(q("helper-pane-configurable-slack")).toBeNull();
        // Enums and arrays of primitives have no fields to drill into; an optional array can't be indexed.
        expect(q("helper-pane-configurable-nav-auth")).not.toBeNull();
        expect(q("helper-pane-configurable-nav-level")).toBeNull();
        expect(q("helper-pane-configurable-nav-tags")).toBeNull();
        expect(q("helper-pane-configurable-nav-optChannels")).toBeNull();

        await act(async () => q("helper-pane-configurable-nav-auth")!.click());
        expect(answeringRetrieve).toHaveBeenLastCalledWith("slack.auth.", mockFieldContext.field, "slack.auth.".length, ".");

        await act(async () => q("helper-pane-configurable-user")!.click());
        expect(onChange).toHaveBeenCalledWith("slack.auth.user", false);
        expect(onClose).toHaveBeenCalled();

        await act(async () => q("crumb-Configurables")!.click());
        expect(q("helper-pane-configurable-slack")).not.toBeNull();
        expect(q("helper-pane-configurable-token")).toBeNull();
    });

    it("steps the index of an array-of-record field", async () => {
        await renderPane();
        await act(async () => q("helper-pane-configurable-nav-slack")!.click());
        expect(q("array-index")).toBeNull();

        await act(async () => q("helper-pane-configurable-nav-channels")!.click());
        expect(answeringRetrieve).toHaveBeenLastCalledWith("slack.channels[0].", expect.anything(), expect.any(Number), ".");
        expect(q("index-badge")!.textContent).toBe("0");
        expect(q("index-step--")!.disabled).toBe(true);

        await act(async () => q("index-step-+")!.click());
        expect(q("index-badge")!.textContent).toBe("1");
        await act(async () => { jest.advanceTimersByTime(400); });
        await flush();
        expect(answeringRetrieve).toHaveBeenLastCalledWith("slack.channels[1].", expect.anything(), expect.any(Number), ".");

        await act(async () => q("helper-pane-configurable-id")!.click());
        expect(onChange).toHaveBeenCalledWith("slack.channels[1].id", false);
    });

    it("drops a pending index step when the user navigates away before it flushes", async () => {
        await renderPane();
        await act(async () => q("helper-pane-configurable-nav-slack")!.click());
        await act(async () => q("helper-pane-configurable-nav-channels")!.click());

        await act(async () => q("index-step-+")!.click());
        await act(async () => q("crumb-slack")!.click());
        await act(async () => { jest.advanceTimersByTime(400); });
        await flush();

        // The stale timer would restore `slack.channels[1]` over the breadcrumb the user chose.
        expect(q("crumb-channels[1]")).toBeNull();
        expect(q("array-index")).toBeNull();
        expect(q("helper-pane-configurable-token")).not.toBeNull();
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

        await act(async () => q("helper-pane-configurable-nav-slack")!.click());
        await act(async () => q("helper-pane-configurable-nav-auth")!.click());

        expect(q("empty")!.textContent).toBe("Failed to load fields");
        expect(q("helper-pane-configurable-token")).toBeNull();
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

        await act(async () => q("helper-pane-configurable-nav-slack")!.click());
        await act(async () => pending["slack."]());
        await act(async () => q("helper-pane-configurable-nav-auth")!.click());
        await act(async () => q("crumb-slack")!.click());
        // The superseded `slack.auth.` request finishes after the newer `slack.` one was sent.
        await act(async () => pending["slack.auth."]());

        expect(q("loader")).not.toBeNull();
        expect(q("helper-pane-configurable-user")).toBeNull();
    });

    it("bounds the index of a fixed-length array field by its length", async () => {
        await renderPane();
        await act(async () => q("helper-pane-configurable-nav-slack")!.click());
        await act(async () => q("helper-pane-configurable-nav-pair")!.click());
        expect(answeringRetrieve).toHaveBeenLastCalledWith("slack.pair[0].", expect.anything(), expect.any(Number), ".");

        await act(async () => q("index-step-+")!.click());
        expect(q("index-badge")!.textContent).toBe("1");
        expect(q("index-step-+")!.disabled).toBe(true);
        await act(async () => q("index-step-+")!.click());
        expect(q("index-badge")!.textContent).toBe("1");
    });

    it("lists the fields of the latest path when an earlier request finishes last", async () => {
        const pending: Record<string, () => void> = {};
        const deferred = jest.fn<Promise<CompletionItem[]>, Parameters<Retrieve>>((value) =>
            new Promise<CompletionItem[]>((resolve) => {
                pending[value] = () => { publish(FIELDS[value] ?? []); resolve(FIELDS[value] ?? []); };
            })
        );
        await renderPane({ retrieve: deferred });

        await act(async () => q("helper-pane-configurable-nav-slack")!.click());
        await act(async () => pending["slack."]());
        await act(async () => q("helper-pane-configurable-nav-auth")!.click());
        await act(async () => q("crumb-slack")!.click());
        await act(async () => pending["slack."]());
        // The superseded `slack.auth.` response lands last and overwrites the shared completions.
        await act(async () => pending["slack.auth."]());

        expect(q("helper-pane-configurable-token")).not.toBeNull();
        expect(q("helper-pane-configurable-user")).toBeNull();
    });

    it("ignores completions other callers publish while drilled in", async () => {
        await renderPane();
        await act(async () => q("helper-pane-configurable-nav-slack")!.click());

        // e.g. the expression editor fetching root completions as the user types.
        await act(async () => publish([{ label: "myVar", description: "int", value: "myVar", kind: "variable", sortText: "a" } as CompletionItem]));

        expect(q("helper-pane-configurable-token")).not.toBeNull();
        expect(q("helper-pane-configurable-myVar")).toBeNull();
    });

    it.each([
        ["the project's package", "my/pkg", true],
        ["another package", "other/lib", false],
    ])("drill-in for a configurable of %s", async (_label, category, navigable) => {
        tomlPackage = { org: "my", name: "pkg" };
        configVariables = { [category as string]: { "": [configurable("slack", "SlackConfig")] } };
        await renderPane();
        expect(q("helper-pane-configurable-nav-slack") !== null).toBe(navigable);
    });

    it("offers no index drill-in on an array reached through optional access", async () => {
        await renderPane();
        await act(async () => q("helper-pane-configurable-nav-slack")!.click());
        await act(async () => q("helper-pane-configurable-nav-backup")!.click());
        expect(answeringRetrieve).toHaveBeenLastCalledWith("slack.backup?.", expect.anything(), expect.any(Number), ".");

        expect(q("helper-pane-configurable-channels")).not.toBeNull();
        expect(q("helper-pane-configurable-nav-channels")).toBeNull();
    });

    it("hides the previous index's fields while an index step is pending", async () => {
        await renderPane();
        await act(async () => q("helper-pane-configurable-nav-slack")!.click());
        await act(async () => q("helper-pane-configurable-nav-channels")!.click());

        await act(async () => q("index-step-+")!.click());
        expect(q("helper-pane-configurable-id")).toBeNull();
        expect(q("loader")).not.toBeNull();

        await act(async () => { jest.advanceTimersByTime(400); });
        await flush();
        await act(async () => q("helper-pane-configurable-id")!.click());
        expect(onChange).toHaveBeenCalledWith("slack.channels[1].id", false);
    });

    it("does not re-request when the parent passes an equal line range", async () => {
        await renderPane();
        await act(async () => q("helper-pane-configurable-nav-slack")!.click());
        const calls = answeringRetrieve.mock.calls.length;

        await act(async () => {
            root.render(<Harness retrieve={answeringRetrieve} lineRange={{ ...LINE_RANGE }} onChange={onChange} onClose={onClose} />);
        });
        expect(answeringRetrieve.mock.calls.length).toBe(calls);

        const moved = { startLine: { line: 1, offset: 0 }, endLine: { line: 1, offset: 0 } };
        await act(async () => {
            root.render(<Harness retrieve={answeringRetrieve} lineRange={moved} onChange={onChange} onClose={onClose} />);
        });
        expect(answeringRetrieve.mock.calls.length).toBe(calls + 1);
    });

    it("returns to the clicked breadcrumb when two steps share a label", async () => {
        await renderPane();
        await act(async () => q("helper-pane-configurable-nav-slack")!.click());
        await act(async () => q("helper-pane-configurable-nav-auth")!.click());
        await act(async () => q("helper-pane-configurable-nav-auth")!.click());
        expect(answeringRetrieve).toHaveBeenLastCalledWith("slack.auth.auth.", expect.anything(), expect.any(Number), ".");

        await act(async () => container.querySelectorAll<HTMLButtonElement>('[data-testid="crumb-auth"]')[1].click());
        // Still at `slack.auth.auth`, not truncated to the first `auth`.
        expect(container.querySelectorAll('[data-testid="crumb-auth"]').length).toBe(2);
    });
});
