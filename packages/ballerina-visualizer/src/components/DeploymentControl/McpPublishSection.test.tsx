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

// L2: the "Host on WSO2 Cloud and Publish to Agent Manager" card. What it pins is that each
// state offers exactly the next step — deploy, commit or push, connect, publish or update — and that each
// button reaches the right RPC with the right arguments, since a wrong target looks identical
// on screen.

import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { AgentManagerMcpPublishStatus } from "@wso2/ballerina-core";

// The core barrel pulls in ESM-only LS transport modules jest cannot load; the card only reads SCOPE.MCP.
jest.mock("@wso2/ballerina-core", () => ({ __esModule: true, SCOPE: { MCP: "mcp-server" } }));

let mockRpcClient: ReturnType<typeof makeRpcClient>;
jest.mock("@wso2/ballerina-rpc-client", () => ({ __esModule: true, useRpcContext: () => ({ rpcClient: mockRpcClient }) }));

let mockStatus: AgentManagerMcpPublishStatus | undefined;
let mockQueryError: Error | undefined;
// Like react-query's, resolves with the status as re-read after the action.
const mockRefetch = jest.fn(async () => ({ data: mockStatus }));
jest.mock("@tanstack/react-query", () => ({
    __esModule: true,
    useQuery: () => ({
        data: mockQueryError ? undefined : mockStatus, isLoading: false, isError: !!mockQueryError, error: mockQueryError, isFetching: false,
        refetch: mockRefetch,
    }),
}));

// Plain elements, so assertions read real buttons and inputs rather than toolkit abstractions.
jest.mock("@wso2/ui-toolkit", () => ({
    __esModule: true,
    Button: ({ children, onClick, disabled, tooltip }: any) => (
        <button onClick={onClick} disabled={disabled} aria-label={tooltip || undefined}>{children}</button>
    ),
    Codicon: (): null => null,
    ProgressRing: () => <div data-testid="progress-ring" />,
    Dropdown: ({ id, value, items, onValueChange }: any) => (
        <select id={id} value={value} onChange={(event) => onValueChange(event.target.value)}>
            {items.map((item: any) => <option key={item.value} value={item.value}>{item.content}</option>)}
        </select>
    ),
    TextField: ({ id, label, value, onTextChange, type }: any) => (
        <label>
            {label}
            <input id={id} type={type} value={value} onChange={(event) => onTextChange(event.target.value)} />
        </label>
    ),
}));
jest.mock("@vscode/webview-ui-toolkit/react", () => ({
    __esModule: true,
    VSCodeLink: ({ children, onClick }: any) => <a onClick={onClick}>{children}</a>,
}));
// The real module pulls in the AI panel's configuration collector, which is irrelevant here.
jest.mock("./AgentManagerConfigFields", () => ({
    __esModule: true,
    ErrorText: ({ children }: any) => <span role="alert">{children}</span>,
    Muted: ({ children }: any) => <span>{children}</span>,
    GroupTitle: ({ children }: any) => <h4>{children}</h4>,
}));

// The popup's real frame animates and the Connection styles pull in the toolkit; plain wrappers keep jsdom simple.
const mockClose = jest.fn();
jest.mock("../PopupModal", () => ({
    __esModule: true,
    PopupModal: ({ children, onClose }: any) => <div role="dialog">{children(() => { mockClose(); onClose(); })}</div>,
    PopupModalStep: ({ children }: any) => <div>{children}</div>,
}));
jest.mock("../../views/BI/Connection/styles", () => {
    const Box = ({ children }: any) => <div>{children}</div>;
    return {
        __esModule: true,
        CloseButton: ({ children, onClick }: any) => <button aria-label="Close" onClick={onClick}>{children}</button>,
        HeaderTitleContainer: Box, PopupContent: Box, PopupFooter: Box, PopupHeader: Box, PopupSubtitle: Box, PopupTitle: Box,
    };
});

import { McpCloudState, McpPublishSection, mcpPublishTag } from "./McpPublishSection";

declare global {
    // eslint-disable-next-line no-var
    var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PROJECT = "/work/mcpint";
const DEVANT_URL = "https://abc-dev.e1-us-east-azure.choreoapis.dev/mcp-server/mcpint/v1.0";

function makeRpcClient() {
    const agentManager = {
        prepareAgentManagerMcpEndpoint: jest.fn().mockResolvedValue({ success: true }),
        fixAgentManagerMcpSource: jest.fn().mockResolvedValue({ success: true }),
        publishAgentManagerMcpProxy: jest.fn().mockResolvedValue({ success: true }),
        runAgentManagerAction: jest.fn().mockResolvedValue({ success: true }),
    };
    const biDiagram = { deployProject: jest.fn().mockResolvedValue({ isCompleted: true }) };
    const common = { executeCommand: jest.fn().mockResolvedValue(undefined), openExternalUrl: jest.fn() };
    return {
        agentManager, biDiagram, common,
        getAgentManagerRpcClient: () => agentManager,
        getBIDiagramRpcClient: () => biDiagram,
        getCommonRpcClient: () => common,
    };
}

const cloudState = (overrides: Partial<McpCloudState> = {}): McpCloudState => ({
    available: true, isDeployed: true, isRefreshing: false, refresh: jest.fn().mockResolvedValue(undefined), ...overrides,
});

const COMMIT_STEP = { id: "commit" as const, message: "Commit and push your changes. WSO2 Cloud builds from your remote repository.", actionLabel: "Review and Commit" };

const signedIn: AgentManagerMcpPublishStatus = {
    signedIn: true, instanceUrl: "https://am.example.com", org: "acme", endpointReady: true, servicePath: "/mcp",
};

let container: HTMLDivElement;
let root: Root;
const goToDevant = jest.fn();

beforeEach(() => {
    mockRpcClient = makeRpcClient();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockStatus = undefined;
    mockQueryError = undefined;
    jest.clearAllMocks();
});

function render(cloud: McpCloudState) {
    act(() => root.render(<McpPublishSection projectPath={PROJECT} active cloud={cloud} goToDevant={goToDevant} />));
}

const buttons = () => Array.from(document.body.querySelectorAll("button")).map((button) => button.textContent);
const button = (text: string) => Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === text)!;
const dialog = () => document.body.querySelector("[role=dialog]");

function type(id: string, value: string) {
    const input = document.body.querySelector<HTMLInputElement>(`#${id}`)!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

async function click(text: string) {
    await act(async () => {
        button(text).click();
    });
}

describe("hosting step", () => {
    const HOSTING_LABELS = ["Deploy to WSO2 Cloud", "Redeploy to WSO2 Cloud", "Review and Commit"];

    it.each([
        ["not deployed and never prepared", cloudState({ isDeployed: false }), { endpointReady: false }, "Deploy to WSO2 Cloud"],
        ["not deployed, prepared and pushed", cloudState({ isDeployed: false }), { endpointReady: true }, "Deploy to WSO2 Cloud"],
        ["deployed before the endpoint was prepared", cloudState(), { endpointReady: false }, "Redeploy to WSO2 Cloud"],
        ["deployed with changes still to push", cloudState(), { endpointReady: true, source: COMMIT_STEP }, "Review and Commit"],
        ["not deployed with changes still to push", cloudState({ isDeployed: false }), { endpointReady: true, source: COMMIT_STEP }, "Review and Commit"],
        ["deployed and current", cloudState(), { endpointReady: true }, undefined],
    ])("offers exactly the next action when %s", (_case, cloud, state, expected) => {
        mockStatus = { ...signedIn, ...state };
        render(cloud);
        expect(buttons().filter((text) => HOSTING_LABELS.includes(text!))).toEqual(expected ? [expected] : []);
    });

    it("never mentions the endpoint file it manages", () => {
        mockStatus = { ...signedIn, endpointReady: true, source: COMMIT_STEP };
        render(cloudState());
        expect(container.textContent).not.toMatch(/component\.yaml|\.choreo/);
        expect(container.textContent).toContain("Commit and push your changes");
    });

    it("asks to commit and push instead of opening WSO2 Cloud when preparing leaves changes", async () => {
        mockStatus = { ...signedIn, endpointReady: false };
        mockRpcClient.agentManager.prepareAgentManagerMcpEndpoint.mockImplementation(async () => {
            mockStatus = { ...signedIn, endpointReady: true, source: COMMIT_STEP };
            return { success: true };
        });
        render(cloudState({ isDeployed: false }));
        await click("Deploy to WSO2 Cloud");
        expect(mockRpcClient.agentManager.prepareAgentManagerMcpEndpoint).toHaveBeenCalledWith({ projectPath: PROJECT });
        expect(mockRpcClient.biDiagram.deployProject).not.toHaveBeenCalled();
        render(cloudState({ isDeployed: false }));
        expect(button("Review and Commit")).toBeDefined();
    });

    it("opens WSO2 Cloud's create flow as an MCP server once everything is pushed", async () => {
        mockStatus = { ...signedIn, endpointReady: true };
        const cloud = cloudState({ isDeployed: false });
        render(cloud);
        await click("Deploy to WSO2 Cloud");
        expect(mockRpcClient.biDiagram.deployProject).toHaveBeenCalledWith({ integrationTypes: ["mcp-server"] });
        expect(cloud.refresh).toHaveBeenCalled();
    });

    it("runs the Git step the status asks for", async () => {
        mockStatus = { ...signedIn, endpointReady: true, source: COMMIT_STEP };
        render(cloudState());
        await click("Review and Commit");
        expect(mockRpcClient.agentManager.fixAgentManagerMcpSource).toHaveBeenCalledWith({ projectPath: PROJECT, step: "commit" });
        expect(mockRpcClient.biDiagram.deployProject).not.toHaveBeenCalled();
    });

    it("stops and shows why when the endpoint can't be prepared", async () => {
        mockStatus = { ...signedIn, endpointReady: false };
        mockRpcClient.agentManager.prepareAgentManagerMcpEndpoint.mockResolvedValue({ success: false, message: "No port" });
        render(cloudState({ isDeployed: false }));
        await click("Deploy to WSO2 Cloud");
        expect(mockRpcClient.biDiagram.deployProject).not.toHaveBeenCalled();
        expect(container.querySelector("[role=alert]")?.textContent).toBe("No port");
    });
});

describe("publishing step", () => {
    it("asks to connect to Agent Manager before anything else", async () => {
        mockStatus = { signedIn: false, endpointReady: true };
        render(cloudState());
        expect(buttons()).toEqual(["Connect to Agent Manager"]);
        await click("Connect to Agent Manager");
        expect(mockRpcClient.agentManager.runAgentManagerAction).toHaveBeenCalledWith({ projectPath: PROJECT, action: "signIn" });
    });

    it.each([
        ["not deployed", cloudState({ isDeployed: false }), { endpointReady: true }],
        ["deployed with changes still to push", cloudState(), { endpointReady: true, source: COMMIT_STEP }],
        ["deployed before the endpoint was prepared", cloudState(), { endpointReady: false }],
    ])("disables publishing until the server is running on WSO2 Cloud (%s)", async (_case, cloud, state) => {
        mockStatus = { ...signedIn, ...state };
        render(cloud);
        expect(button("Publish to Agent Manager").disabled).toBe(true);
        await click("Publish to Agent Manager");
        expect(dialog()).toBeNull();
    });

    it("keeps the card to one button and opens the form in a popup", async () => {
        mockStatus = signedIn;
        render(cloudState());
        expect(document.body.querySelector("#am-mcp-url")).toBeNull();
        await click("Publish to Agent Manager");
        expect(dialog()).not.toBeNull();
        expect(dialog()!.querySelector("#am-mcp-url")).not.toBeNull();
    });

    it("enables Publish only once the URL and key are entered, sends them, and closes", async () => {
        mockStatus = signedIn;
        render(cloudState());
        await click("Publish to Agent Manager");
        expect(button("Publish").disabled).toBe(true);
        type("am-mcp-url", DEVANT_URL);
        expect(button("Publish").disabled).toBe(true);
        type("am-mcp-key", "secret");
        expect(button("Publish").disabled).toBe(false);
        await click("Publish");
        expect(mockRpcClient.agentManager.publishAgentManagerMcpProxy).toHaveBeenCalledWith({
            projectPath: PROJECT, url: DEVANT_URL, security: "apiKey", header: "api-key", apiKey: "secret",
        });
        expect(dialog()).toBeNull();
        expect(mockRefetch).toHaveBeenCalled();
    });

    it("keeps the popup open and shows the reason when publishing fails", async () => {
        mockStatus = signedIn;
        mockRpcClient.agentManager.publishAgentManagerMcpProxy.mockResolvedValue({ success: false, message: "401 from upstream" });
        render(cloudState());
        await click("Publish to Agent Manager");
        type("am-mcp-url", DEVANT_URL);
        type("am-mcp-key", "wrong");
        await click("Publish");
        expect(dialog()).not.toBeNull();
        expect(dialog()!.querySelector("[role=alert]")?.textContent).toBe("401 from upstream");
    });

    it("closes without publishing on Cancel", async () => {
        mockStatus = signedIn;
        render(cloudState());
        await click("Publish to Agent Manager");
        await click("Cancel");
        expect(dialog()).toBeNull();
        expect(mockRpcClient.agentManager.publishAgentManagerMcpProxy).not.toHaveBeenCalled();
    });

    it("shows a published proxy and lets it be updated without re-entering the key", async () => {
        mockStatus = {
            ...signedIn,
            published: {
                id: "mcpint", name: "mcpInt", url: `${DEVANT_URL}/mcp`, toolCount: 1, deployed: true, consoleUrl: "https://console/x",
                upstreamSecurity: "apiKey", upstreamHeader: "api-key",
            },
        };
        render(cloudState());
        expect(container.textContent).toContain("mcpInt");
        expect(container.textContent).toContain("1 tool");
        expect(buttons()).not.toContain("Publish to Agent Manager");
        await click("Open in Agent Manager");
        expect(mockRpcClient.common.openExternalUrl).toHaveBeenCalledWith({ url: "https://console/x" });

        await act(async () => {
            document.body.querySelector<HTMLButtonElement>("button[aria-label='Change URL or API Key']")!.click();
        });
        expect(dialog()!.querySelector<HTMLInputElement>("#am-mcp-url")!.value).toBe(`${DEVANT_URL}/mcp`);
        expect(button("Update").disabled).toBe(false);
        await click("Update");
        expect(mockRpcClient.agentManager.publishAgentManagerMcpProxy).toHaveBeenCalledWith({
            projectPath: PROJECT, url: `${DEVANT_URL}/mcp`, security: "apiKey", header: "api-key", apiKey: undefined,
        });
    });
});

describe("security section", () => {
    const securityType = () => document.body.querySelector<HTMLSelectElement>("#am-mcp-security");

    async function choose(value: string) {
        const select = securityType()!;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
        await act(async () => {
            setter.call(select, value);
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });
    }

    it("defaults to API Key and shows its fields", async () => {
        mockStatus = signedIn;
        render(cloudState());
        await click("Publish to Agent Manager");
        expect(securityType()!.value).toBe("apiKey");
        expect(document.body.querySelector("#am-mcp-key-header")).not.toBeNull();
        expect(document.body.querySelector("#am-mcp-key")).not.toBeNull();
    });

    it("hides the key fields for None and publishes with just the URL", async () => {
        mockStatus = signedIn;
        render(cloudState());
        await click("Publish to Agent Manager");
        await choose("none");
        expect(document.body.querySelector("#am-mcp-key-header")).toBeNull();
        expect(document.body.querySelector("#am-mcp-key")).toBeNull();
        type("am-mcp-url", DEVANT_URL);
        expect(button("Publish").disabled).toBe(false);
        await click("Publish");
        expect(mockRpcClient.agentManager.publishAgentManagerMcpProxy).toHaveBeenCalledWith({
            projectPath: PROJECT, url: DEVANT_URL, security: "none", header: undefined, apiKey: undefined,
        });
    });

    it("drops the type choice once a key is stored and opens on the stored header", async () => {
        mockStatus = {
            ...signedIn,
            published: {
                id: "mcpint", name: "mcpInt", url: `${DEVANT_URL}/mcp`, deployed: true, consoleUrl: "c",
                upstreamSecurity: "apiKey", upstreamHeader: "X-Key",
            },
        };
        render(cloudState());
        await act(async () => {
            document.body.querySelector<HTMLButtonElement>("button[aria-label='Change URL or API Key']")!.click();
        });
        expect(securityType()).toBeNull();
        expect(document.body.querySelector<HTMLInputElement>("#am-mcp-key-header")!.value).toBe("X-Key");
        expect(document.body.querySelector("#am-mcp-key")).not.toBeNull();
        expect(button("Update").disabled).toBe(false);
    });

    it("opens a proxy without a key on None", async () => {
        mockStatus = {
            ...signedIn,
            published: { id: "mcpint", name: "mcpInt", url: `${DEVANT_URL}/mcp`, deployed: true, consoleUrl: "c", upstreamSecurity: "none" },
        };
        render(cloudState());
        await act(async () => {
            document.body.querySelector<HTMLButtonElement>("button[aria-label='Change URL or API Key']")!.click();
        });
        expect(securityType()!.value).toBe("none");
        expect(document.body.querySelector("#am-mcp-key")).toBeNull();
    });
});

describe("status errors", () => {
    it("shows why the status couldn't load and offers a retry instead of spinning forever", async () => {
        mockQueryError = new Error("connect ECONNREFUSED");
        render(cloudState());
        expect(container.querySelector("[data-testid=progress-ring]")).toBeNull();
        expect(container.querySelector("[role=alert]")?.textContent).toContain("connect ECONNREFUSED");
        await click("Try Again");
        expect(mockRefetch).toHaveBeenCalled();
    });
});

describe("mcpPublishTag", () => {
    it.each([
        [undefined, undefined],
        [signedIn, undefined],
        [{ ...signedIn, published: { id: "a", name: "a", url: "u", deployed: false, consoleUrl: "c", upstreamSecurity: "none" as const } }, "Publishing"],
        [{ ...signedIn, published: { id: "a", name: "a", url: "u", deployed: true, consoleUrl: "c", upstreamSecurity: "none" as const } }, "Published"],
    ])("tags %#", (status, expected) => {
        expect(mcpPublishTag(status)).toBe(expected);
    });
});
