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
import { CodeData, FlowNode } from "@wso2/ballerina-core";
import { PlatformExtState } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { MarketplaceItem } from "@wso2/wso2-platform-core";
import { CloudKnowledgeBaseCreator } from "../../../components/ConnectionSelector/CloudKnowledgeBaseCreator";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetNodeTemplate = jest.fn();
const mockGetVisualizerLocation = jest.fn();
const mockShowErrorMessage = jest.fn();
const mockRefreshConnectionList = jest.fn();
const mockPrepareDevantKnowledgeBase = jest.fn();

const mockRpcClient = {
    getBIDiagramRpcClient: () => ({ getNodeTemplate: mockGetNodeTemplate }),
    getCommonRpcClient: () => ({ showErrorMessage: mockShowErrorMessage }),
    getVisualizerLocation: mockGetVisualizerLocation,
};

const mockPlatformRpcClient = { refreshConnectionList: mockRefreshConnectionList };
const mockPlatformExtState = {
    session: { org: { handle: "acme", uuid: "org-uuid" } },
    selectedContext: { projectName: "docs" },
} as unknown as PlatformExtState;
const mockKnowledgeBaseItem = { name: "Policies / knowledge-base", serviceId: "policies" } as MarketplaceItem;

jest.mock("@wso2/ballerina-rpc-client", () => ({
    useRpcContext: () => ({ rpcClient: mockRpcClient }),
}));

jest.mock("../../../providers/platform-ext-ctx-provider", () => ({
    usePlatformExtContext: () => ({
        platformExtState: mockPlatformExtState,
        platformRpcClient: mockPlatformRpcClient,
    }),
}));

jest.mock("../../../views/BI/Connection/DevantConnections/devant-kb-utils", () => ({
    prepareDevantKnowledgeBase: (...args: unknown[]) => mockPrepareDevantKnowledgeBase(...args),
}));

jest.mock("../../../views/BI/Connection/DevantConnections/utils", () => ({
    errorMessageOf: (error: unknown) => error instanceof Error ? error.message : String(error),
}));

jest.mock("../../../components/RelativeLoader", () => ({
    RelativeLoader: (): null => null,
}));

jest.mock("../../../components/RelativeLoader/styles", () => {
    const React = require("react");
    return {
        LoaderContainer: ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children),
    };
});

jest.mock("../../../components/ConnectionSelector/ConnectionCreator", () => {
    const React = require("react");
    return {
        ConnectionCreator: (props: { nodeFormTemplate: { id: string } }) =>
            React.createElement("form", { "data-form-id": props.nodeFormTemplate.id }),
    };
});

jest.mock("../../../views/BI/Connection/DevantConnections/CloudKnowledgeBasePage", () => {
    const React = require("react");
    return {
        CloudKnowledgeBasePage: (props: {
            onCreateNew: () => void;
            onSelectExisting?: (item: MarketplaceItem) => void;
        }) => React.createElement(
            "div",
            null,
            React.createElement("button", { onClick: props.onCreateNew }, "Create manually"),
            React.createElement(
                "button",
                { onClick: () => props.onSelectExisting?.(mockKnowledgeBaseItem) },
                "Use existing",
            ),
        ),
    };
});

const connectorCodeData = {
    node: "NEW_CONNECTION",
    org: "ballerinax",
    module: "ai.wso2.integration",
    packageName: "ai.wso2.integration",
    object: "CloudKnowledgeBase",
} as CodeData;

describe("CloudKnowledgeBaseCreator", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetVisualizerLocation.mockResolvedValue({ projectPath: "/workspace/docs" });
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const click = async (label: string) => {
        const button = Array.from(container.querySelectorAll("button")).find(
            (candidate) => candidate.textContent === label,
        );
        expect(button).toBeDefined();
        await act(async () => button!.click());
    };

    const openedFormId = () => container.querySelector("form")?.getAttribute("data-form-id") ?? undefined;

    it("opens the blank connector form when manual configuration is selected", async () => {
        const flowNode = { id: "manual" } as unknown as FlowNode;
        mockGetNodeTemplate.mockResolvedValue({ flowNode });
        const onSave = jest.fn();

        act(() =>
            root.render(
                <CloudKnowledgeBaseCreator
                    connectorCodeData={connectorCodeData}
                    fileName="/workspace/docs/main.bal"
                    onSave={onSave}
                />,
            ),
        );
        await click("Create manually");

        expect(openedFormId()).toBe("manual");
        expect(mockGetNodeTemplate).toHaveBeenCalledWith({
            position: { line: 0, offset: 0 },
            filePath: "/workspace/docs/main.bal",
            id: connectorCodeData,
        });
    });

    it("connects a selected cloud knowledge base and opens its pre-filled form", async () => {
        const flowNode = { id: "existing" } as unknown as FlowNode;
        mockPrepareDevantKnowledgeBase.mockResolvedValue(flowNode);
        const onSave = jest.fn();

        act(() =>
            root.render(
                <CloudKnowledgeBaseCreator
                    connectorCodeData={connectorCodeData}
                    fileName="/workspace/docs/agents.bal"
                    onSave={onSave}
                />,
            ),
        );
        await click("Use existing");

        expect(openedFormId()).toBe("existing");
        expect(mockPrepareDevantKnowledgeBase).toHaveBeenCalledWith({
            rpcClient: mockRpcClient,
            platformRpcClient: mockPlatformRpcClient,
            platformExtState: mockPlatformExtState,
            item: mockKnowledgeBaseItem,
            node: { codedata: connectorCodeData },
            projectPath: "/workspace/docs",
            target: { line: 0, offset: 0 },
            fileName: "/workspace/docs/agents.bal",
        });
        expect(mockRefreshConnectionList).toHaveBeenCalledTimes(1);
    });

    it("drops the form, but still refreshes the connections, when closed while connecting", async () => {
        let resolvePrepare: (node: FlowNode) => void = () => undefined;
        mockPrepareDevantKnowledgeBase.mockReturnValue(new Promise<FlowNode>((resolve) => {
            resolvePrepare = resolve;
        }));
        const onSave = jest.fn();

        act(() =>
            root.render(
                <CloudKnowledgeBaseCreator
                    connectorCodeData={connectorCodeData}
                    fileName="/workspace/docs/agents.bal"
                    onSave={onSave}
                />,
            ),
        );
        await click("Use existing");
        act(() => root.render(<></>));
        await act(async () => resolvePrepare({ id: "existing" } as unknown as FlowNode));

        expect(openedFormId()).toBeUndefined();
        expect(onSave).not.toHaveBeenCalled();
        expect(mockShowErrorMessage).not.toHaveBeenCalled();
        expect(mockRefreshConnectionList).toHaveBeenCalledTimes(1);
    });

    it("shows why connecting failed without opening the form", async () => {
        mockPrepareDevantKnowledgeBase.mockRejectedValue(new Error("Choreo Cloud did not create a connection."));
        const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
        const onSave = jest.fn();

        act(() =>
            root.render(
                <CloudKnowledgeBaseCreator
                    connectorCodeData={connectorCodeData}
                    fileName="/workspace/docs/agents.bal"
                    onSave={onSave}
                />,
            ),
        );
        await click("Use existing");

        expect(openedFormId()).toBeUndefined();
        expect(mockShowErrorMessage).toHaveBeenCalledWith({ message: "Choreo Cloud did not create a connection." });
        consoleError.mockRestore();
    });
});
