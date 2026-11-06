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
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { ProjectStructureResponse, WorkspaceDevantMetadata } from "@wso2/ballerina-core";

// The core barrel pulls in ESM-only LS transport modules jest cannot load.
jest.mock("@wso2/ballerina-core", () => ({
    __esModule: true,
    BuildMode: { JAR: "jar", DOCKER: "docker" },
    DIRECTORY_MAP: {},
    ProductMode: {},
    BI_COMMANDS: {},
    isSamePath: (a: string, b: string) => a === b,
    hasWorkflowArtifacts: () => false,
}));
jest.mock("@wso2/wso2-platform-core", () => ({
    __esModule: true,
    WICommandIds: { OpenInConsole: "openInConsole", RefreshDirectoryContext: "refreshDirectoryContext" },
}));

let mockRpcClient: ReturnType<typeof makeRpcClient>;
jest.mock("@wso2/ballerina-rpc-client", () => ({ __esModule: true, useRpcContext: () => ({ rpcClient: mockRpcClient }) }));

let mockDevantMetadata: WorkspaceDevantMetadata;
jest.mock("@tanstack/react-query", () => ({
    __esModule: true,
    useQuery: () => ({ data: mockDevantMetadata, isLoading: false, refetch: jest.fn() }),
}));

jest.mock("../../providers/platform-ext-ctx-provider", () => ({
    __esModule: true,
    usePlatformExtContext: () => ({ platformExtState: { isExtInstalled: true } }),
}));
jest.mock("../../hooks/useProductMode", () => ({ __esModule: true, useProductMode: (): undefined => undefined }));
jest.mock("./AgentManagerSection", () => ({ __esModule: true }));
jest.mock("./McpPublishSection", () => ({ __esModule: true }));
jest.mock("./WorkflowSection", () => ({ __esModule: true }));
jest.mock("../../views/BI/PackageOverview/utils", () => ({
    __esModule: true,
    getWorkspaceDeploymentState: () => ({
        libraryProjectPaths: new Set(["/ws/lib"]),
        undeployedProjectScopes: [{ projectPath: "/ws/b", integrationTypes: ["AI_AGENT"] }],
        hasDeployableIntegration: true,
    }),
}));

jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Button: ({ children, onClick, disabled }: any) => <button onClick={onClick} disabled={disabled}>{children}</button>,
    Codicon: (): null => null,
    ProgressRing: () => <div data-testid="progress-ring" />,
    Typography: ({ children, className }: any) => <h3 className={className}>{children}</h3>,
    Divider: () => <hr />,
    CheckBox: (): null => null,
    ThemeColors: {},
}));
jest.mock("@vscode/webview-ui-toolkit/react", () => ({
    __esModule: true,
    VSCodeLink: ({ children, onClick }: any) => <a onClick={onClick}>{children}</a>,
}));

import { WorkspaceDeploymentPanel } from "./DeploymentPanel";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function makeRpcClient(icpEnabledPaths: string[]) {
    const biDiagram = { deployWorkspace: jest.fn().mockResolvedValue(undefined), buildProject: jest.fn() };
    const icp = {
        isIcpEnabled: jest.fn(async ({ projectPath }: { projectPath: string }) => ({ enabled: icpEnabledPaths.includes(projectPath) })),
        addICP: jest.fn().mockResolvedValue(undefined),
        disableICP: jest.fn().mockResolvedValue(undefined),
        isICPServerRunning: jest.fn().mockResolvedValue({ enabled: false }),
    };
    const common = { executeCommand: jest.fn().mockResolvedValue(undefined), openExternalUrl: jest.fn() };
    return {
        biDiagram, icp, common,
        getBIDiagramRpcClient: () => biDiagram,
        getICPRpcClient: () => icp,
        getCommonRpcClient: () => common,
    };
}

const projectCollection = {
    workspacePath: "/ws",
    projects: [
        { projectPath: "/ws/a", isLibrary: false },
        { projectPath: "/ws/b", isLibrary: false },
        { projectPath: "/ws/lib", isLibrary: true },
    ],
} as unknown as ProjectStructureResponse;

const deployedPaths = (paths: string[]): WorkspaceDevantMetadata => ({
    isLoggedIn: true,
    projectsMetadata: ["/ws/a", "/ws/b", "/ws/lib"].map((projectPath) => ({ projectPath, hasComponent: paths.includes(projectPath) })),
});

let container: HTMLDivElement;
let root: Root;

const flush = () => act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
});
const button = (label: string) => Array.from(container.querySelectorAll("button")).find((el) => el.textContent === label);
const expand = (title: string) => act(async () => {
    Array.from(container.querySelectorAll("button")).find((el) => el.textContent.startsWith(title)).click();
});

async function renderPanel() {
    await act(async () => {
        root.render(<WorkspaceDeploymentPanel projectCollection={projectCollection} isInDevant={false} isICPSupported />);
    });
    await flush();
}

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

it("deploys only the remaining integrations and enables ICP only where it is off", async () => {
    mockRpcClient = makeRpcClient(["/ws/a"]);
    mockDevantMetadata = deployedPaths(["/ws/a"]);
    await renderPanel();

    expect(container.textContent).toContain("1 of 2 integrations are deployed on WSO2 Cloud.");

    await act(async () => button("Deploy Remaining").click());
    expect(mockRpcClient.biDiagram.deployWorkspace).toHaveBeenCalledWith({
        projectScopes: [{ projectPath: "/ws/b", integrationTypes: ["AI_AGENT"] }],
        rootDirectory: "/ws",
    });

    await expand("Integration Control Plane");
    expect(container.textContent).toContain("ICP monitoring is enabled for 1 of 2 integrations.");
    await act(async () => button("Enable ICP for Remaining Integrations").click());
    await flush();
    expect(mockRpcClient.icp.addICP).toHaveBeenCalledTimes(1);
    expect(mockRpcClient.icp.addICP).toHaveBeenCalledWith({ projectPath: "/ws/b" });
});

it("offers no deploy action once every integration is deployed", async () => {
    mockRpcClient = makeRpcClient(["/ws/a", "/ws/b"]);
    mockDevantMetadata = deployedPaths(["/ws/a", "/ws/b"]);
    await renderPanel();

    expect(container.textContent).toContain("All integrations in this project are deployed on WSO2 Cloud.");
    expect(button("Deploy Remaining")).toBeUndefined();
    expect(button("Deploy to WSO2 Cloud")).toBeUndefined();
    expect(button("Open in Console")).toBeDefined();
    expect(mockRpcClient.icp.isICPServerRunning).not.toHaveBeenCalled();

    await expand("Integration Control Plane");
    expect(button("Disable ICP for All Integrations")).toBeDefined();
});
