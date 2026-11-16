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
import type { FlowNode } from "@wso2/ballerina-core";

// What the side panel's FlowNodeForm was rendered with, and how many of them were mounted.
const mockFormRenders: Array<Record<string, unknown>> = [];
const mockFormMounts: unknown[] = [];

jest.mock("../../../../views/BI/Forms/FlowNodeForm", () => {
    const { useEffect } = require("react");
    const FlowNodeForm = (props: Record<string, unknown>): null => {
        mockFormRenders.push(props);
        useEffect(() => { mockFormMounts.push(props.node); }, []);
        return null;
    };
    return { __esModule: true, default: FlowNodeForm, FlowNodeForm };
});

// The rest of what the side panel can show is left out: only its form is rendered here, and the
// modules behind the others do not load under jest.
jest.mock("@wso2/ballerina-core", () => ({
    SubPanelView: { HELPER_PANEL: "helperPanel" },
    FUNCTION_TYPE: {},
}));
jest.mock("@wso2/ui-toolkit", () => ({ Button: (): null => null, Typography: (): null => null, ThemeColors: {} }));
jest.mock("@wso2/ballerina-side-panel", () => ({
    PanelContainer: ({ children }: { children?: unknown }) => children,
    NodeList: (): null => null,
    CardList: (): null => null,
}));
jest.mock("../../../../views/BI/HelperView", () => ({ HelperView: (): null => null }));
jest.mock("../../../../utils/bi", () => ({ getContainerTitle: () => "", getSubPanelWidth: () => 0 }));
jest.mock("../../../../components/ConnectionSelector", () => ({
    ConnectionConfig: (): null => null,
    ConnectionCreator: (): null => null,
    ConnectionSelectionList: (): null => null,
    ConnectionKind: {},
}));
jest.mock("../../../../components/RelativeLoader", () => ({ RelativeLoader: (): null => null }));
jest.mock("../../../../components/RelativeLoader/styles", () => ({ LoaderContainer: (): null => null }));
jest.mock("../../../../views/BI/FlowDiagram/components/ErrorContainer", () => ({ ConnectorErrorView: (): null => null }));
jest.mock("../../../../views/BI/FlowDiagram/NewActivityFromConnection", () => ({ NewActivityFromConnection: (): null => null }));
jest.mock("../../../../views/BI/AIChatAgent/AddTool", () => ({ ADD_TOOL_TITLE: "", addToolTitle: () => "" }));
jest.mock("../../../../views/BI/AIChatAgent/AgentEditorPanelContent", () => ({ AgentEditorPanelContent: (): null => null }));

import { PanelManager, SidePanelView } from "../../../../views/BI/FlowDiagram/PanelManager";

type PanelManagerProps = React.ComponentProps<typeof PanelManager>;

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const LINE_RANGE = { fileName: "automation.bal", startLine: { line: 4, offset: 4 }, endLine: { line: 4, offset: 30 } };

// L2: the flow diagram's side panel is the one place a form is handed `onSaveNewVariable`, which is
// what makes its helper panes offer "+ New Variable" (issue-1770; ConnectionConfigView's test holds
// the other side: a connection form is handed none). The save is the diagram's own, which inserts
// the variable before the node, and the form is keyed on the node: FlowNodeForm keeps the values its
// form reported for the names it declares, and must not carry them over to another node.
test.each([
    { form: "new node", node: { id: "31", codedata: { node: "VARIABLE", isNew: true } } },
    { form: "edited node", node: { id: "42", codedata: { node: "FUNCTION_CALL", lineRange: LINE_RANGE } } },
])("$form: the side panel form saves a New Variable through the diagram", async ({ node }) => {
    mockFormRenders.length = 0;
    mockFormMounts.length = 0;
    const onSubmitForm = jest.fn();
    const props = {
        showSidePanel: true,
        sidePanelView: SidePanelView.FORM,
        subPanel: {},
        categories: [],
        selectedNode: node as unknown as FlowNode,
        fileName: "/workspace/automation.bal",
        targetLineRange: LINE_RANGE,
        onClose: jest.fn(),
        onSubmitForm,
    } as unknown as PanelManagerProps;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
        await act(async () => root.render(
            <PanelManager {...props} />
        ));

        expect(mockFormRenders.length).toBeGreaterThan(0);
        for (const formProps of mockFormRenders) {
            expect(formProps.node).toBe(node);
            expect(formProps.onSubmit).toBe(onSubmitForm);
            expect(formProps.onSaveNewVariable).toBe(onSubmitForm);
        }

        // The node as the diagram reads it again keeps its form; another node gets another form.
        const readAgain = { ...node } as unknown as FlowNode;
        await act(async () => root.render(<PanelManager {...props} selectedNode={readAgain} />));
        expect(mockFormRenders[mockFormRenders.length - 1].node).toBe(readAgain);
        expect(mockFormMounts).toEqual([node]);

        const other = { ...node, id: `${node.id}-other` } as unknown as FlowNode;
        await act(async () => root.render(<PanelManager {...props} selectedNode={other} />));
        expect(mockFormMounts).toEqual([node, other]);
    } finally {
        act(() => root.unmount());
        container.remove();
    }
});
