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
import { PlatformExtState } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { ContextItemEnriched } from "@wso2/wso2-cloud-client";
import { CloudKnowledgeBasePage } from "../../../../../views/BI/Connection/DevantConnections/CloudKnowledgeBasePage";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockPlatformExtState: PlatformExtState;
const mockDeployIntegration = jest.fn();
const mockHandleLinkWorkspace = jest.fn();
const mockUseQuery = jest.fn();

jest.mock("@tanstack/react-query", () => ({
    useQuery: (options: unknown) => mockUseQuery(options),
}));

jest.mock("../../../../../providers/platform-ext-ctx-provider", () => ({
    usePlatformExtContext: () => ({
        platformExtState: mockPlatformExtState,
        platformRpcClient: { deployIntegrationInDevant: mockDeployIntegration },
        handleLinkWorkspace: mockHandleLinkWorkspace,
    }),
}));

jest.mock("@vscode/webview-ui-toolkit/react", () => {
    const React = require("react");
    return {
        VSCodeLink: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) =>
            React.createElement("button", { onClick }, children),
    };
});

jest.mock("@wso2/ui-toolkit", () => ({
    Codicon: (): null => null,
    ProgressRing: (): null => null,
    }));

jest.mock("../../../../../components/ButtonCard", () => {
    const React = require("react");
    return ({ title, onClick, disabled }: { title: string; onClick?: () => void; disabled?: boolean }) =>
        React.createElement("button", { onClick, disabled }, title);
});

jest.mock("../../../../../views/BI/Connection/AddConnectionPopup/styles", () => {
    const React = require("react");
    const Box = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
    return { ConnectorsGrid: Box, Section: Box, SectionHeader: Box, SectionTitle: Box };
});

jest.mock("../../../../../views/styles", () => {
    const React = require("react");
    return {
        BodyTinyInfo: ({ children }: { children?: React.ReactNode }) => React.createElement("p", null, children),
    };
});

jest.mock("../../../../../views/BI/Connection/DevantConnections/CloudAccessNotice", () => ({
    CloudAccessNotice: (): null => null,
    useCloudAccessRefresh: (): undefined => undefined,
}));

const state = (values: Partial<PlatformExtState>): PlatformExtState => ({
    isExtInstalled: true,
    integrations: [],
    isLoggedIn: false,
    session: null,
    ...values,
});
const context = (values: Partial<ContextItemEnriched>): ContextItemEnriched => ({
    orgHandle: "acme",
    projectName: "docs",
    contextDirs: [],
    ...values,
});

describe("CloudKnowledgeBasePage cloud project guidance", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        jest.clearAllMocks();
        mockUseQuery.mockReturnValue({ data: { data: [] }, isLoading: false, error: null });
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const renderPage = () => {
        act(() =>
            root.render(
                <CloudKnowledgeBasePage
                    onCreateNew={jest.fn()}
                    onSelectExisting={jest.fn()}
                />,
            ),
        );
    };

    const click = (label: string) => {
        const button = Array.from(container.querySelectorAll("button")).find(
            (candidate) => candidate.textContent === label,
        );
        expect(button).toBeDefined();
        act(() => button!.click());
    };

    it("offers associating a project when the workspace has no cloud project", () => {
        mockPlatformExtState = state({ isLoggedIn: true, selectedContext: context({ local: true }) });

        renderPage();

        expect(container.textContent).toContain(
            "Associate the workspace with a WSO2 Cloud project to see existing knowledge bases.",
        );
        expect(mockUseQuery.mock.calls[0][0]).toMatchObject({ enabled: false });

        click("Associate the workspace");
        expect(mockDeployIntegration).not.toHaveBeenCalled();
        expect(mockHandleLinkWorkspace).toHaveBeenCalledTimes(1);
    });

    it("lists knowledge bases but requires a cloud integration before connecting one", () => {
        mockPlatformExtState = state({
            isLoggedIn: true,
            selectedContext: context({ local: false, foreignOrg: false }),
        });
        mockUseQuery.mockReturnValue({
            data: {
                data: [{
                    name: "public-docs / knowledge-base",
                    resourceId: "kb-1",
                    serviceId: "svc:public-docs",
                    projectId: "ai-services",
                }],
            },
            isLoading: false,
            error: null,
        });

        renderPage();

        expect(container.textContent).toContain(
            "Create this integration in WSO2 Cloud to connect it to these knowledge bases. It doesn't have to be deployed.",
        );
        expect(mockUseQuery.mock.calls[0][0]).toMatchObject({ enabled: true });
        const knowledgeBase = Array.from(container.querySelectorAll("button")).find(
            (candidate) => candidate.textContent === "public-docs Knowledge Base",
        );
        expect(knowledgeBase).toBeDisabled();

        click("Create this integration");
        expect(mockDeployIntegration).toHaveBeenCalledTimes(1);
    });
});
