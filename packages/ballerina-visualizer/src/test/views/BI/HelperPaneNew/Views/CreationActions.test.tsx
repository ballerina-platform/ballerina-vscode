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
import type { Category } from "@wso2/ballerina-core";
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


jest.mock("@wso2/ballerina-side-panel", () => ({
    useFieldContext: (): { field: object; triggerCharacters: string[] } => ({ field: {}, triggerCharacters: [] }),
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
