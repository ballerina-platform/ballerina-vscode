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
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import type { FlowNode } from "@wso2/ballerina-core";

jest.mock("@wso2/ballerina-core", () =>
    new Proxy(
        { EVENT_TYPE: {}, MACHINE_VIEW: {}, TRIGGER_CHARACTERS: [], __esModule: true },
        { get: (target, key) => (key in target ? target[key as keyof typeof target] : {}) }
    )
);
jest.mock("../../../constants", () => ({ BALLERINA: "ballerina" }));
jest.mock("@wso2/ballerina-side-panel", () => ({}));
jest.mock("@wso2/bi-diagram", () => ({}));
jest.mock("../../../utils/bi", () => ({ convertNodePropertyToFormField: jest.fn() }));
jest.mock("../FlowDiagram/utils", () => ({ findClassByName: jest.fn(), findFunctionByName: jest.fn() }));
jest.mock("../Connection/ConnectorBrowser/connectorActions", () => ({ REST_RESOURCE_PATH: "" }));

let current: FlowNode;
const showErrorMessage = jest.fn();
const rpcClient = {
    getBIDiagramRpcClient: () => ({
        getModuleNodes: async () => ({ flowModel: { connections: [] as FlowNode[], variables: [current] } }),
    }),
    getCommonRpcClient: () => ({ showErrorMessage }),
    getVisualizerRpcClient: () => ({ beginUndoGroup: async () => undefined, endUndoGroup: async () => undefined }),
};
jest.mock("@wso2/ballerina-rpc-client", () => ({ useRpcContext: () => ({ rpcClient }) }));

import { AgentEditorController, useAgentEditorController } from "./useAgentEditorController";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const agent = (tools: string): FlowNode => ({
    id: "agent",
    codedata: { node: "AGENT", lineRange: { fileName: "agents.bal", startLine: { line: 3, offset: 0 }, endLine: { line: 5, offset: 2 } } },
    properties: { variable: { value: "aiAgent" }, tools: { value: tools } },
} as unknown as FlowNode);

it("drops a queued add whose tool name an earlier queued add put on the agent", async () => {
    current = agent("[getTool]");
    const host = { projectPath: "/p", onModelSelect: jest.fn(), onRefresh: jest.fn() };
    const controller = {} as { current: AgentEditorController };
    function Probe(): null {
        controller.current = useAgentEditorController(host);
        return null;
    }
    act(() => createRoot(document.createElement("div")).render(<Probe />));

    const saved: string[] = [];
    const addTool = (label: string) => {
        act(() => controller.current.diagramCallbacks.onAddTool(agent("[getTool]")));
        act(() => controller.current.addToolInBackground({ name: "xTool" }, async () => {
            await new Promise((r) => setTimeout(r, 20));
            current = agent("[getTool, xTool]");
            saved.push(label);
            return undefined;
        }));
    };
    addTool("first");
    addTool("second");
    await act(() => new Promise((r) => setTimeout(r, 100)));

    expect(saved).toEqual(["first"]);
    expect(showErrorMessage).toHaveBeenCalledWith({ message: expect.stringContaining("already on the agent") });
    expect(controller.current.addingTools.map((tool) => tool.name)).toEqual(["xTool"]);
});
