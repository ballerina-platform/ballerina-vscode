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
import type { FlowNode, SubPanel } from "@wso2/ballerina-core";

// What the side panel's FlowNodeForm was rendered with.
const mockFormRenders: Array<Record<string, unknown>> = [];

jest.mock("@wso2/ballerina-core", () => ({
    SubPanelView: { HELPER_PANEL: "HELPER_PANEL", UNDEFINED: "UNDEFINED" },
    FUNCTION_TYPE: { REGULAR: "regular", EXPRESSION_BODIED: "expression-bodied" },
}));
jest.mock("@wso2/ui-toolkit", () => ({
    Button: (): null => null, Typography: (): null => null, ThemeColors: new Proxy({}, { get: () => "#000" }),
}));
jest.mock("@wso2/ballerina-side-panel", () => ({
    PanelContainer: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    NodeList: (): null => null, CardList: (): null => null,
}));
jest.mock("../../../../views/BI/Forms/FlowNodeForm", () => {
    const FlowNodeForm = (props: Record<string, unknown>): null => {
        mockFormRenders.push(props);
        return null;
    };
    return { __esModule: true, default: FlowNodeForm, FlowNodeForm };
});
jest.mock("../../../../views/BI/HelperView", () => ({ HelperView: (): null => null }));
jest.mock("../../../../utils/bi", () => ({ getContainerTitle: () => "", getSubPanelWidth: (): undefined => undefined }));
jest.mock("../../../../components/ConnectionSelector", () => ({
    ConnectionConfig: (): null => null, ConnectionCreator: (): null => null, ConnectionSelectionList: (): null => null,
    ConnectionKind: {},
}));
jest.mock("../../../../components/RelativeLoader", () => ({ RelativeLoader: (): null => null }));
jest.mock("../../../../components/RelativeLoader/styles", () => ({ LoaderContainer: (): null => null }));
jest.mock("../../../../views/BI/FlowDiagram/components/ErrorContainer", () => ({ ConnectorErrorView: (): null => null }));
jest.mock("../../../../views/BI/FlowDiagram/NewActivityFromConnection", () => ({ NewActivityFromConnection: (): null => null }));
jest.mock("../../../../views/BI/AIChatAgent/AddTool", () => ({ ADD_TOOL_TITLE: "Add Tool", addToolTitle: () => "" }));
jest.mock("../../../../views/BI/AIChatAgent/AgentEditorPanelContent", () => ({ AgentEditorPanelContent: (): null => null }));
jest.mock("../../../../views/BI/AIChatAgent/useAgentEditorController", () => ({}));
jest.mock("../../../../components/AgentManagerModels", () => ({ AgentManagerModelProviderSection: (): null => null }));

import { PanelManager, SidePanelView } from "../../../../views/BI/FlowDiagram/PanelManager";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const LINE_RANGE = { fileName: "main.bal", startLine: { line: 4, offset: 8 }, endLine: { line: 4, offset: 8 } };

// L2: a flow statement's form in the flow diagram's side panel is the one host that saves a field's
// "+ New Variable": it passes its own save as `onSaveNewVariable`, which inserts the variable before
// the node. Every other form passes none (see ConnectionConfigView/index.test.tsx), so if this one
// stopped passing it, flow forms would silently lose the action.
test.each(["VARIABLE", "ASSIGN", "FUNCTION_CALL", "REMOTE_ACTION_CALL"])(
    "%s form: the flow's save also saves a new variable", async (kind) => {
        mockFormRenders.length = 0;
        const onSubmitForm = jest.fn();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        try {
            await act(async () => root.render(
                <PanelManager showSidePanel sidePanelView={SidePanelView.FORM}
                    subPanel={{ view: "UNDEFINED" } as unknown as SubPanel} categories={[]}
                    selectedNode={{ id: "1", codedata: { node: kind, isNew: true } } as unknown as FlowNode}
                    fileName="/workspace/main.bal" targetLineRange={LINE_RANGE}
                    onSubmitForm={onSubmitForm} onClose={jest.fn()} onSelectNode={jest.fn()}
                    onDiscardSuggestions={jest.fn()} onSubPanel={jest.fn()} onUpdateExpressionField={jest.fn()}
                    onResetUpdatedExpressionField={jest.fn()} setSidePanelView={jest.fn()} />
            ));

            expect(mockFormRenders.length).toBeGreaterThan(0);
            for (const props of mockFormRenders) {
                expect(props.onSubmit).toBe(onSubmitForm);
                expect(props.onSaveNewVariable).toBe(onSubmitForm);
            }
        } finally {
            act(() => root.unmount());
            container.remove();
        }
    }
);
