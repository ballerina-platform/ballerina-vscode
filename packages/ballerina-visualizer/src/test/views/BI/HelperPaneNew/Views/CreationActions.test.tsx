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
import type { EditorConfig, FlowNode } from "@wso2/ballerina-core";
import type { CompletionItem } from "@wso2/ui-toolkit";
import type { HelperPaneFunctionCategory } from "@wso2/ballerina-side-panel";
import type { FormSubmitOptions } from "../../../../../views/BI/FlowDiagram";

jest.mock("@wso2/ballerina-core", () => ({ EditorDisplayMode: { NONE: "none", POPUP: "popup", VIEW: "view" } }));
jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../../rpcHarness");
    return { useRpcContext: h.useRpcContext };
});
// Replaces the heavy utils/bi module; the panes only need it to import (pagination is mocked below).
jest.mock("../../../../../utils/bi", () => ({}));
const mockAddModal = jest.fn();
const mockCloseModal = jest.fn();
jest.mock("../../../../../Context", () => ({
    useModalStack: () => ({ addModal: mockAddModal, closeModal: mockCloseModal }), POPUP_IDS: { VARIABLE: "VARIABLE" },
}));
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


jest.mock("@wso2/ballerina-side-panel", () => ({
    useFieldContext: (): { field: object; triggerCharacters: string[] } => ({ field: {}, triggerCharacters: [] }),
    useOptionalFieldContext: (): undefined => undefined,
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
import { FunctionsPage } from "../../../../../views/BI/HelperPaneNew/Views/Functions";
import { Configurables } from "../../../../../views/BI/HelperPaneNew/Views/Configurables";
import fixture from "./fixtures/issue-1770.json";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const client = {
    getVisualizerLocation: async () => ({ projectPath: "/workspace" }),
    getBIDiagramRpcClient: () => ({
        getConfigVariableNodeTemplate: async () => ({ flowNode: { codedata: {} } }),
        getConfigVariablesV2: async () => ({ configVariables: {} }),
    }),
    getCommonRpcClient: () => ({ getCurrentProjectTomlValues: async () => ({}) }),
};

const paneProps = () => ({
    anchorRef: React.createRef<HTMLDivElement>(), fileName: "/workspace/connections.bal",
    targetLineRange: { startLine: { line: 0, offset: 0 }, endLine: { line: 0, offset: 0 } },
    onClose: jest.fn(), onChange: jest.fn(),
});

// Renders the panes and lets their minimum loading time pass. Call unmount() in a finally block.
const renderPanes = async (panes: React.ReactElement) => {
    jest.useFakeTimers();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(
        <TestRpcContext.Provider value={{ rpcClient: client }}>{panes}</TestRpcContext.Provider>
    ));
    await act(async () => { jest.advanceTimersByTime(1000); });
    const button = (label: string) => Array.from(container.querySelectorAll("button")).find(b => b.textContent === label);
    const unmount = () => {
        act(() => root.unmount());
        container.remove();
        jest.useRealTimers();
    };
    return { container, button, unmount };
};

beforeEach(() => jest.clearAllMocks());

// L2: a field's helper panes offer creating a function and a configurable next to the existing
// symbols, and "+ New Variable" only when the host form supplies `onSaveNewVariable` to save it through.
test.each([true, false])("helper panes of a form that can save a new variable = %s", async (offerNewVariable) => {
    const props = paneProps();
    const onAddNewConfigurable = jest.fn();
    const excludedConfigs: string[] = [];
    const panes = await renderPanes(<>
        <Variables {...props} filteredCompletions={fixture.variables as CompletionItem[]} currentValue=""
            handleRetrieveCompletions={async () => undefined}
            onSaveNewVariable={offerNewVariable ? jest.fn() : undefined} />
        <FunctionsPage {...props} fieldKey="config" updateImports={jest.fn()} />
        <Configurables {...props} excludedConfigs={excludedConfigs} onAddNewConfigurable={onAddNewConfigurable} />
    </>);
    try {
        const buttons = Array.from(panes.container.querySelectorAll("button")).map(button => button.textContent);
        expect(buttons.includes("New Variable")).toBe(offerNewVariable);
        expect(buttons).toContain("New Function");
        expect(buttons).toContain("New Configurable");
        await act(async () => { panes.button("New Configurable")!.click(); });
        expect(onAddNewConfigurable).toHaveBeenCalledTimes(1);
        expect(buttons).toContain("Open Function Browser");
        const item = panes.container.querySelector('[data-testid="helper-pane-item-serviceUrl"]');
        expect(item).not.toBeNull();
        act(() => item!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
        expect(props.onChange).toHaveBeenCalledWith("serviceUrl", false);
    } finally {
        panes.unmount();
    }
});

type NewVariableForm = React.ReactElement<{ isInModal: boolean; onSubmit: (node?: FlowNode, editorConfig?: EditorConfig) => void }>;

// L2: where it is offered, "+ New Variable" opens a Declare Variable form in a modal. The form's
// Save goes through `onSaveNewVariable` (the flow form inserts the variable before the node), never
// through the surrounding form's own submit; the variable reaches the field only once that save
// is done.
test("a new variable is saved through onSaveNewVariable before it reaches the field", async () => {
    const props = paneProps();
    const onSaveNewVariable = jest.fn();
    const panes = await renderPanes(
        <Variables {...props} filteredCompletions={fixture.variables as CompletionItem[]} currentValue=""
            handleRetrieveCompletions={async () => undefined} onSaveNewVariable={onSaveNewVariable} />
    );
    try {
        await act(async () => { panes.button("New Variable")!.click(); });
        expect(mockAddModal).toHaveBeenCalledWith(expect.anything(), "VARIABLE", "New Variable", 600);
        const form: NewVariableForm = mockAddModal.mock.calls[0][0];
        expect(form.props.isInModal).toBe(true);

        const node = { properties: { variable: { value: "proxyHost" } } } as unknown as FlowNode;
        act(() => form.props.onSubmit(node));
        expect(onSaveNewVariable).toHaveBeenCalledTimes(1);
        const [savedNode, editorConfig, options] = onSaveNewVariable.mock.calls[0] as [FlowNode, EditorConfig, FormSubmitOptions];
        expect(savedNode).toBe(node);
        expect(editorConfig).toEqual({ view: undefined, displayMode: "none" });
        expect(options).toEqual(expect.objectContaining({ closeSidePanel: false, isChangeFromHelperPane: true }));
        expect(props.onChange).not.toHaveBeenCalled();

        act(() => options.postUpdateCallBack!());
        expect(mockCloseModal).toHaveBeenCalledWith("VARIABLE");
        expect(props.onChange).toHaveBeenCalledWith("proxyHost", false, true);
    } finally {
        panes.unmount();
    }
});
