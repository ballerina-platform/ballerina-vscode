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

// What the connection form's FlowNodeForm was rendered with.
const mockFormRenders: Array<Record<string, unknown>> = [];

jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../../rpcHarness");
    return { useRpcContext: h.useRpcContext };
});
jest.mock("../../../../../views/BI/Forms/FlowNodeForm", () => {
    const FlowNodeForm = (props: Record<string, unknown>): null => {
        mockFormRenders.push(props);
        return null;
    };
    return { __esModule: true, default: FlowNodeForm, FlowNodeForm };
});

import { TestRpcContext } from "../../../../rpcHarness";
import { ConnectionConfigView } from "../../../../../views/BI/Connection/ConnectionConfigView";

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });

const LINE_RANGE = { fileName: "connections.bal", startLine: { line: 2, offset: 0 }, endLine: { line: 2, offset: 40 } };

// L2: every connection popup with expression fields (add, edit, API, AI agent, Devant) renders its
// form through ConnectionConfigView. The form gets no `onSaveNewVariable`, so its helper panes,
// record editor included, offer no "+ New Variable" and route nothing into `onSubmit`, which would
// save it as the connection.
test.each([
    { form: "new connection", node: { codedata: { node: "NEW_CONNECTION", isNew: true } } },
    { form: "edited connection", node: { codedata: { node: "NEW_CONNECTION", lineRange: LINE_RANGE } } },
])("$form: no New Variable and no helper-pane save into the connection", async ({ node }) => {
    mockFormRenders.length = 0;
    const getEndOfFile = jest.fn().mockResolvedValue({ line: 5, offset: 0 });
    const client = { getBIDiagramRpcClient: () => ({ getEndOfFile }) };
    const onSubmit = jest.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
        await act(async () => root.render(
            <TestRpcContext.Provider value={{ rpcClient: client }}>
                <ConnectionConfigView fileName="/workspace/connections.bal" selectedNode={node as unknown as FlowNode}
                    onSubmit={onSubmit} />
            </TestRpcContext.Provider>
        ));

        expect(mockFormRenders.length).toBeGreaterThan(0);
        for (const props of mockFormRenders) {
            expect(props.onSubmit).toBe(onSubmit);
            expect(props.onSaveNewVariable).toBeUndefined();
        }
    } finally {
        act(() => root.unmount());
        container.remove();
    }
});
