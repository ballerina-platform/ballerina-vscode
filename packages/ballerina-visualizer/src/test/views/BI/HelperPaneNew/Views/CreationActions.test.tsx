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
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { Category, FlowNode } from "@wso2/ballerina-core";
import type { CompletionItem } from "@wso2/ui-toolkit";
import type { HelperPaneFunctionCategory } from "@wso2/ballerina-side-panel";

jest.mock("@wso2/ballerina-core", () => ({}));
jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../../rpcHarness");
    return { useRpcContext: h.useRpcContext };
});
// Keep the real pagination hook; only replace the unrelated heavy conversion dependency.
jest.mock("../../../../../utils/bi", () => ({
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
const mockAddModal = jest.fn();
jest.mock("../../../../../Context", () => ({ useModalStack: () => ({ addModal: mockAddModal, closeModal: jest.fn() }), POPUP_IDS: {} }));
jest.mock("../../../../../views/BI/FunctionFormStatic", () => ({ FunctionFormStatic: (): null => null }));
jest.mock("../../../../../views/BI/HelperPaneNew/utils/iconUtils", () => ({ HelperPaneIconType: {}, getHelperPaneIcon: (): null => null }));

jest.mock("@tanstack/react-query", () => ({ useMutation: () => ({ mutateAsync: jest.fn() }) }));
jest.mock("@wso2/ui-toolkit/lib/components/ExpressionEditor", () => ({ HelperPaneCustom: { Loader: () => <div>Loading</div> } }));
jest.mock("@wso2/ui-toolkit", () => {
    const shell = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
    return {
        Icon: (): null => null, Codicon: (): null => null,
        Tooltip: shell, HelperPaneCustom: { Loader: (): null => null },
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


// What the form nearest a pane holds, by field. It is the node's own form only around a plain field:
// the record editor has a form of its own, and so has each item of an array, a map or a parameter list.
const mockNearestFormValues: Record<string, unknown> = {};
jest.mock("@wso2/ballerina-side-panel", () => ({
    useFieldContext: (): { field: object; triggerCharacters: string[] } => ({ field: {}, triggerCharacters: [] }),
    useFormContext: (): { form: { getValues: (key: string) => unknown } } =>
        ({ form: { getValues: (key) => mockNearestFormValues[key] } }),
    getPropertyFromFormField: () => ({}),
}));
jest.mock("../../../../../views/BI/Forms/FlowNodeForm", () => ({
    __esModule: true, default: (): null => null, FlowNodeForm: (): null => null,
}));
jest.mock("../../../../../utils/useFunctionPagination", () => ({
    useFunctionPagination: (): { info: { category: HelperPaneFunctionCategory[] }; sectionsWithMore: object; loadingSections: object; loadFirstPage: () => Promise<void> } => ({
        info: { category: [] }, sectionsWithMore: {}, loadingSections: {},
        loadFirstPage: async (): Promise<void> => undefined,
    }),
}));
import { TestRpcContext } from "../../../../rpcHarness";
import { Variables } from "../../../../../views/BI/HelperPaneNew/Views/Variables";
import { TEMPLATE_TIMEOUT_MS } from "../../../../../views/BI/HelperPaneNew/utils/newVariable";
import { FunctionsPage } from "../../../../../views/BI/HelperPaneNew/Views/Functions";
import { Configurables } from "../../../../../views/BI/HelperPaneNew/Views/Configurables";
import fixture from "./fixtures/issue-1770.json";
import templates from "../utils/fixtures/issue-1770.json";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

// L2: a field's helper panes offer creating a function and a configurable next to the existing
// symbols. "+ New Variable" is offered only where the form has an `onSaveNewVariable` to save the
// variable through: without one (connection forms, AI agent and MCP forms) its Save did nothing.
test.each([true, false])("helper panes of a form that can save a new variable = %s", async (offerNewVariable) => {
    jest.useFakeTimers();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onChange = jest.fn();
    const onAddNewConfigurable = jest.fn();
    const excludedConfigs: string[] = [];
    const client = {
        getVisualizerLocation: async () => ({ projectPath: "/workspace" }),
        getBIDiagramRpcClient: () => ({
            getConfigVariableNodeTemplate: async () => ({ flowNode: { codedata: {} } }),
            getConfigVariablesV2: async () => ({ configVariables: {} }),
        }),
        getCommonRpcClient: () => ({ getCurrentProjectTomlValues: async () => ({}) }),
    };
    const props = {
        anchorRef: React.createRef<HTMLDivElement>(), fileName: "/workspace/connections.bal",
        targetLineRange: { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } },
        onClose: jest.fn(), onChange,
    };
    try {
        await act(async () => root.render(
            <TestRpcContext.Provider value={{ rpcClient: client }}>
                <Variables {...props} filteredCompletions={fixture.variables as CompletionItem[]} currentValue=""
                    handleRetrieveCompletions={async () => undefined}
                    onSaveNewVariable={offerNewVariable ? jest.fn() : undefined} />
                <FunctionsPage {...props} fieldKey="config" updateImports={jest.fn()} />
                <Configurables {...props} excludedConfigs={excludedConfigs} onAddNewConfigurable={onAddNewConfigurable} />
            </TestRpcContext.Provider>
        ));
        await act(async () => { jest.advanceTimersByTime(1000); });
        const buttons = Array.from(container.querySelectorAll("button")).map(button => button.textContent);
        expect(buttons.includes("New Variable")).toBe(offerNewVariable);
        expect(buttons).toContain("New Function");
        expect(buttons).toContain("New Configurable");
        const addConfigurable = Array.from(container.querySelectorAll("button"))
            .find(button => button.textContent === "New Configurable")!;
        await act(async () => { addConfigurable.click(); });
        expect(onAddNewConfigurable).toHaveBeenCalledTimes(1);
        expect(buttons).toContain("Open Function Browser");
        const item = container.querySelector('[data-testid="helper-pane-item-serviceUrl"]');
        expect(item).not.toBeNull();
        act(() => item!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
        expect(onChange).toHaveBeenCalledWith("serviceUrl", false);
    } finally {
        act(() => root.unmount());
        container.remove();
        jest.useRealTimers();
    }
});

// L2: "+ New Variable" opens its form on the language server's Declare Variable template at the field,
// whatever the pane happens to list: inside a record it lists the record's fields, and before its
// completions arrive it lists nothing (issue-1770: `var1` was suggested while `var1` existed). Every
// click that is not already waiting on a template opens exactly one form: on a local template that
// names nothing when the language server gives none or does not answer in time, rather than nothing at
// all. A pane that closed while it waited opens none: the user has moved on. The template cannot see
// the variable the form it is opened from declares itself, so one named after it is left unnamed. That
// form says what it declares, when the template arrives: the form nearest the pane is not always it
// (issue-1770: from the record editor of a Declare Variable form named var1, the new variable was var1).
describe("New Variable", () => {
    const TEMPLATE = templates.templates[0] as unknown as FlowNode;
    const NAME = TEMPLATE.properties.variable.value as string;
    const FILE = "/workspace/main.bal";
    const TARGET = { startLine: { line: 12, offset: 4 }, endLine: { line: 12, offset: 30 } };
    const formNode = (call: number): FlowNode =>
        (mockAddModal.mock.calls[call][0] as React.ReactElement<{ node: FlowNode }>).props.node;

    // Clicks "+ New Variable" `clicks` times, then lets `respond` answer any template request still open,
    // after the pane has closed if `paneClosesFirst`. `getOwnNames` is what the node's form says it declares.
    async function clickNewVariable(
        getNodeTemplate: jest.Mock, clicks = 1, respond?: () => void, paneClosesFirst = false,
        getOwnNames?: () => string[]
    ): Promise<void> {
        jest.useFakeTimers();
        mockAddModal.mockClear();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const client = {
            getVisualizerLocation: async () => ({ projectPath: "/workspace" }),
            getBIDiagramRpcClient: () => ({ getNodeTemplate }),
        };
        let paneOpen = true;
        const closePane = (): void => {
            if (paneOpen) {
                paneOpen = false;
                act(() => root.unmount());
            }
        };
        try {
            await act(async () => root.render(
                <TestRpcContext.Provider value={{ rpcClient: client }}>
                    <Variables anchorRef={React.createRef<HTMLDivElement>()} fileName={FILE} targetLineRange={TARGET}
                        onClose={jest.fn()} onChange={jest.fn()} filteredCompletions={[]} currentValue=""
                        handleRetrieveCompletions={async () => undefined} selectedType={{ name: "string", value: "string" }}
                        onSaveNewVariable={jest.fn()} getOwnNames={getOwnNames} />
                </TestRpcContext.Provider>
            ));
            // The footer row around the button: it takes clicks too, until the button is disabled.
            const newVariable = Array.from(container.querySelectorAll("button"))
                .find(button => button.textContent === "New Variable")!.parentElement!;
            for (let i = 0; i < clicks; i++) {
                await act(async () => { newVariable.click(); });
            }
            if (paneClosesFirst) {
                closePane();
            }
            await act(async () => { respond?.(); });
            await act(async () => { jest.advanceTimersByTime(1000); });
        } finally {
            closePane();
            container.remove();
            jest.useRealTimers();
        }
    }

    test("asks the language server for the variable at the field, and declares it with the field's type", async () => {
        const getNodeTemplate = jest.fn().mockResolvedValue({ flowNode: TEMPLATE });
        await clickNewVariable(getNodeTemplate);
        expect(getNodeTemplate).toHaveBeenCalledWith({ position: TARGET.startLine, filePath: FILE, id: { node: "VARIABLE" } });
        expect(mockAddModal).toHaveBeenCalledTimes(1);
        expect(formNode(0).properties.variable.value).toBe(TEMPLATE.properties.variable.value);
        expect(formNode(0).properties.type.value).toBe("string");
    });

    test.each([
        ["fails", () => jest.fn().mockRejectedValue(new Error("no language server"))],
        ["has no template", () => jest.fn().mockResolvedValue({})],
        ["answers nothing", () => jest.fn().mockResolvedValue(undefined)],
        // What the extension does with a request the language server fails: it leaves it unanswered.
        ["does not answer in time", () => jest.fn(() => new Promise(() => undefined))],
    ])("opens the form on a local template that names nothing when the language server %s", async (_case, getNodeTemplate) => {
        const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
        try {
            await clickNewVariable(getNodeTemplate(), 1, () => jest.advanceTimersByTime(TEMPLATE_TIMEOUT_MS));
            expect(mockAddModal).toHaveBeenCalledTimes(1);
            const node = formNode(0);
            expect(node.codedata).toEqual({ node: "VARIABLE", isNew: true });
            expect(node.properties.variable.value).toBe("");
            expect(node.properties.type.value).toBe("string");
            expect(node.properties.expression.optional).toBe(false);
        } finally {
            consoleError.mockRestore();
        }
    });

    test("opens one form for clicks made while the template is on its way", async () => {
        let answer: (response: { flowNode: FlowNode }) => void = () => undefined;
        const getNodeTemplate = jest.fn(() => new Promise((resolve) => { answer = resolve; }));
        await clickNewVariable(getNodeTemplate, 3, () => answer({ flowNode: TEMPLATE }));
        expect(getNodeTemplate).toHaveBeenCalledTimes(1);
        expect(mockAddModal).toHaveBeenCalledTimes(1);
    });

    test("opens no form when the pane closed while the template was on its way", async () => {
        let answer: (response: { flowNode: FlowNode }) => void = () => undefined;
        const getNodeTemplate = jest.fn(() => new Promise((resolve) => { answer = resolve; }));
        await clickNewVariable(getNodeTemplate, 1, () => answer({ flowNode: TEMPLATE }), true);
        expect(getNodeTemplate).toHaveBeenCalledTimes(1);
        expect(mockAddModal).not.toHaveBeenCalled();
    });

    describe.each((templates.nearestForms as Array<{ form: string; values: Record<string, unknown> }>)
        .map(({ form, values }) => [form, values] as const))("opened inside %s", (_form, nearest) => {
        beforeEach(() => { Object.assign(mockNearestFormValues, nearest); });
        afterEach(() => { Object.keys(mockNearestFormValues).forEach((key) => delete mockNearestFormValues[key]); });

        test.each((templates.ownNames as string[][]).map((ownNames) => [ownNames]))(
            "is left unnamed only if the template names a variable the node's form declares: %j", async (ownNames) => {
                await clickNewVariable(jest.fn().mockResolvedValue({ flowNode: TEMPLATE }), 1, undefined, false, () => ownNames);
                expect(mockAddModal).toHaveBeenCalledTimes(1);
                expect(formNode(0).properties.variable.value).toBe(ownNames.includes(NAME) ? "" : NAME);
            });
    });

    test.each([
        ["takes the template's name", [] as string[], [NAME], ""],
        ["gives the template's name up", [NAME], ["renamed"], NAME],
    ])("goes by what the node's form declares once the template arrives: a form that %s meanwhile", async (_case, before, after, name) => {
        let ownNames = before;
        let answer: (response: { flowNode: FlowNode }) => void = () => undefined;
        const getNodeTemplate = jest.fn(() => new Promise((resolve) => { answer = resolve; }));
        const respond = (): void => {
            ownNames = after;
            answer({ flowNode: TEMPLATE });
        };
        await clickNewVariable(getNodeTemplate, 1, respond, false, () => ownNames);
        expect(mockAddModal).toHaveBeenCalledTimes(1);
        expect(formNode(0).properties.variable.value).toBe(name);
    });

    test("asks again on a click after a request failed", async () => {
        const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
        try {
            const getNodeTemplate = jest.fn().mockRejectedValue(new Error("no language server"));
            await clickNewVariable(getNodeTemplate, 2);
            expect(getNodeTemplate).toHaveBeenCalledTimes(2);
            expect(mockAddModal).toHaveBeenCalledTimes(2);
        } finally {
            consoleError.mockRestore();
        }
    });
});
