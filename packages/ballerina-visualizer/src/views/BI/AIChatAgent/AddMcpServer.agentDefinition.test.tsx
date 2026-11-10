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

import React, { useState } from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";

// Every module the panel only renders with is a stub: any export is a component that renders nothing.
const stubModule = () => new Proxy({}, {
    get: (_target, key) => key === "__esModule" ? true : (): null => null,
});

// Counts the mounts of the Agent Manager gate, which keeps the step the user chose in its own state. Like the
// real gate on "Connect Manually", it hands the panel's parent a back handler when it mounts.
let gateMounts = 0;
jest.mock("../../../components/AgentManagerModels/McpProxies", () => {
    const { useEffect } = require("react");
    return {
        __esModule: true,
        applyMcpBinding: (): void => undefined,
        AgentManagerMcpGate: ({ onSetBackOverride }: { onSetBackOverride?: (handler: () => void) => void }): null => {
            useEffect(() => {
                gateMounts++;
                onSetBackOverride?.(() => undefined);
            }, []);
            return null;
        },
    };
});
jest.mock("@wso2/ballerina-core", () => ({ __esModule: true, ProductMode: { AGENT_BUILDER: "agent-builder" } }));
jest.mock("@wso2/ballerina-rpc-client", () => {
    const h = require("../../../test/rpcHarness");
    return { __esModule: true, useRpcContext: h.useRpcContext };
});
jest.mock("../../../hooks/useProductMode", () => ({ useProductMode: () => "agent-builder" }));
jest.mock("../../../components/RelativeLoader", () => stubModule());
jest.mock("../Forms/FlowNodeForm", () => stubModule());
jest.mock("./Mcp/McpToolsSelection", () => stubModule());
jest.mock("./Mcp/DiscoverToolsModal", () => stubModule());
jest.mock("./Mcp/RequiresAuthCheckbox", () => stubModule());
// Layout wrappers render their children, so the gate inside them mounts. One component per export: a new one
// on each read would be a new component type on each render, remounting everything inside it.
jest.mock("./styles", () => {
    const Wrapper = ({ children }: { children?: React.ReactNode }) => children ?? null;
    return new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : Wrapper });
});
jest.mock("./utils", () => ({
    __esModule: true,
    getEndOfFileLineRange: async () => ({ endLine: { line: 0, offset: 0 } }),
    checkAiPackageVersionSupport: async () => true,
    extractAccessToken: (): undefined => undefined,
    refreshAgentNodeLineRange: (): undefined => undefined,
    removeQuotes: (value: string) => value,
    resolveAgentNodePosition: (): undefined => undefined,
    resolveVariableValue: async (value: string) => value,
    resolveAuthConfig: async (value: string) => value,
}));

import { TestRpcContext } from "../../../test/rpcHarness";
import { AddMcpServer } from "./AddMcpServer";

(globalThis as unknown as { React: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const agentNode = { codedata: { lineRange: { fileName: "agents.bal" } } } as any;

let rerenderDesigner: () => void = () => undefined;

// Renders the panel as the agent definition designer does: a fresh agentDefinition object on each render, and
// the back handler the panel hands up kept in the designer's state, which re-renders it.
function AgentDefinitionDesigner() {
    const [, setBackHandler] = useState<(() => void) | null>(null);
    const [, setRenders] = useState(0);
    rerenderDesigner = () => setRenders((renders) => renders + 1);
    return (
        <AddMcpServer
            agentNode={agentNode}
            agentDefinition={{
                filePath: "agents.bal",
                classLineRange: { fileName: "agents.bal", startLine: { line: 1, offset: 0 }, endLine: { line: 9, offset: 1 } },
                reservedNames: ["model"],
            }}
            onSetBackOverride={(handler) => setBackHandler(() => handler)}
        />
    );
}

describe("adding an MCP server to an agent definition", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        gateMounts = 0;
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it("keeps the Agent Manager gate when the designer re-renders", async () => {
        const getNodeTemplate = jest.fn(async () => ({
            flowNode: { codedata: { node: "MCP_TOOL_KIT" }, properties: { variable: { value: "mcpToolKit" } } },
        }));
        const rpcClient = {
            getVisualizerLocation: async () => ({ projectPath: "/project" }),
            getVisualizerRpcClient: () => ({ joinProjectPath: async () => ({ filePath: "/project/agents.bal" }) }),
            getBIDiagramRpcClient: () => ({ getNodeTemplate }),
        };

        await act(async () => {
            root.render(
                <TestRpcContext.Provider value={{ rpcClient }}>
                    <AgentDefinitionDesigner />
                </TestRpcContext.Provider>
            );
        });
        const settle = () => act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        await settle();
        // The gate shows once the panel has loaded, and hands the designer its back handler
        const mountsAfterLoad = gateMounts;
        expect(mountsAfterLoad).toBeGreaterThan(0);

        // The designer re-renders, as it does when the gate's chosen step sets its back handler
        await act(async () => rerenderDesigner());
        await settle();
        await act(async () => rerenderDesigner());
        await settle();

        expect(getNodeTemplate).toHaveBeenCalledTimes(1);
        expect(gateMounts).toBe(mountsAfterLoad);
    });
});
