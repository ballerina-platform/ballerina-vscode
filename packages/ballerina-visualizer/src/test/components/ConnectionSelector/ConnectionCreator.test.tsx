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
import { Root, createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { FlowNode } from "@wso2/ballerina-core";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getSourceCode = jest.fn();
const onSave = jest.fn();

jest.mock("@wso2/ballerina-core", () => ({
    GET_DEFAULT_EMBEDDING_PROVIDER: "getDefaultEmbeddingProvider",
    GET_DEFAULT_MODEL_PROVIDER: "getDefaultModelProvider",
    getPrimaryInputType: (): undefined => undefined,
}));

jest.mock("@wso2/ballerina-rpc-client", () => ({
    useRpcContext: () => ({
        rpcClient: {
            getVisualizerLocation: () => Promise.resolve({ projectPath: "/project" }),
            getBIDiagramRpcClient: () => ({
                getEndOfFile: () => Promise.resolve({ line: 0, offset: 0 }),
                getSourceCode,
            }),
            getAIAgentRpcClient: () => ({ configureDefaultModelProvider: jest.fn() }),
        },
    }),
}));

jest.mock("@wso2/ballerina-side-panel", () => ({
    FormLoadingState: (): null => null,
}));

jest.mock("../../../views/BI/FlowDiagram/context/PanelOverlayContext", () => {
    const React = require("react");
    return { PanelOverlayContext: React.createContext(undefined) };
});

jest.mock("../../../views/BI/Forms/ArtifactForm", () => ({
    ArtifactForm: ({ onSubmit }: { onSubmit: (data: Record<string, unknown>) => void }) => (
        <button onClick={() => onSubmit({})}>Save connection</button>
    ),
}));

jest.mock("../../../components/ConnectionSelector/connectionFormFields", () => ({
    convertConnectionConfig: () => [{ key: "variable", editable: true }],
}));

jest.mock("../../../components/ConnectionSelector/config", () => ({
    getConnectionSpecialConfig: (): undefined => undefined,
}));

jest.mock("../../../constants", () => ({
    CONNECTIONS_FILE: "connections.bal",
}));

jest.mock("../../../components/ConnectionSelector/useCreateNode", () => ({
    useCreateNode: () => jest.fn(),
}));

jest.mock("../../../components/ConnectionSelector/utils", () => ({
    updateFormFieldsWithData: jest.fn(),
    updateNodeTemplateProperties: jest.fn(),
    updateNodeWithConnectionVariable: jest.fn(),
    updateNodeLineRange: jest.fn(),
}));

jest.mock("../../../views/BI/FlowDiagram/utils", () => ({
    settlePendingSetup: () => Promise.resolve(),
}));

import { ConnectionCreator } from "../../../components/ConnectionSelector/ConnectionCreator";

describe("ConnectionCreator", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        jest.clearAllMocks();
        getSourceCode.mockResolvedValue({ artifacts: [] });
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it("passes the generated declaration name to onSave", async () => {
        const nodeFormTemplate = {
            codedata: { node: "EMBEDDING_PROVIDER", symbol: "init" },
            properties: { variable: { value: "openAiEmbeddingProvider" } },
        } as unknown as FlowNode;
        const selectedNode = { codedata: {}, properties: {} } as FlowNode;

        await act(async () => {
            root.render(
                <ConnectionCreator
                    connectionKind="EMBEDDING_PROVIDER"
                    selectedNode={selectedNode}
                    nodeFormTemplate={nodeFormTemplate}
                    onSave={onSave}
                />
            );
        });

        const saveButton = Array.from(container.querySelectorAll("button")).find(
            (button) => button.textContent === "Save connection"
        );
        expect(saveButton).toBeDefined();
        await act(async () => saveButton!.click());

        expect(onSave).toHaveBeenCalledWith(selectedNode, [], "openAiEmbeddingProvider");
    });
});
