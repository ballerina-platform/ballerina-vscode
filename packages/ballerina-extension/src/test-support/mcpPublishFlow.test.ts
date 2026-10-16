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

// The orchestration in mcp-publish.ts: which proxy a publish creates or updates, what it refuses, what the
// status reports when Agent Manager or the project is in a bad state, and how GitHub publishing commits.
// Agent Manager, Git and the agent flow's helpers are mocked; the project itself is real files in a temp folder.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

class MockApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
    }
}

const mockProxies = new Map<string, any>();
let mockManifest: any = {};
let mockEnvironmentId: string | undefined = "env-1";
const mockApi = {
    getEnvironmentId: jest.fn(async () => mockEnvironmentId),
    getMcpProxy: jest.fn(async (id: string) => {
        if (!mockProxies.has(id)) {
            throw new MockApiError(404, `no proxy ${id}`);
        }
        return mockProxies.get(id);
    }),
    fetchMcpServerInfo: jest.fn(async () => ({ serverInfo: { version: "2.1.0" }, tools: [{ name: "forecast" }], resources: [], prompts: [] })),
    createMcpProxy: jest.fn(async (body: any) => body),
    updateMcpProxy: jest.fn(async (_id: string, body: any) => body),
};

jest.mock("../features/agent-manager/auth", () => ({
    __esModule: true,
    AgentManagerApiError: MockApiError,
    getSession: jest.fn(async () => ({ instanceUrl: "https://am", consoleUrl: "https://console", org: "acme" })),
    requireSession: jest.fn(async () => ({ instanceUrl: "https://am", consoleUrl: "https://console", org: "acme" })),
}));
jest.mock("../features/agent-manager/client", () => ({
    __esModule: true,
    api: mockApi,
    DEFAULT_ENVIRONMENT: "default",
    consoleOrgUrl: (consoleUrl: string, org: string) => `${consoleUrl}/org/${org}`,
    endpointFor: (proxy: any, environmentId?: string) =>
        proxy.endpoints?.find((endpoint: any) => endpoint.environments?.some((env: any) => env.environmentUuid === environmentId)),
    readManifest: () => mockManifest,
    updateManifest: (_projectPath: string, change: (manifest: any) => any) => {
        mockManifest = change(mockManifest);
    },
}));
// `respond` reports success or the thrown message, as the real one does minus its notifications.
jest.mock("../features/agent-manager/flows", () => ({
    __esModule: true,
    GIT_FIXES: {},
    readPackageTitle: async () => "Weather MCP",
    respond: async (step: () => Promise<string | void>) => {
        try {
            return { success: true, message: (await step()) || undefined };
        } catch (error) {
            return { success: false, message: (error as Error).message };
        }
    },
}));

const mockGitCalls: string[][] = [];
let mockHasCommits = false;
let mockFacts: any = { gitMissing: false, hasRemotes: true, branch: "main", upstreamBranch: "main", dirty: 0, ahead: 0, root: "/repo" };
const mockIgnored: string[] = [];
jest.mock("../features/agent-manager/github", () => ({
    __esModule: true,
    LOCAL_ONLY_FILES: ["Config.toml", "trace_enabled.bal"],
    readFacts: async () => mockFacts,
    ensureGitIgnored: async (_projectPath: string, file: string) => {
        mockIgnored.push(file);
        return true;
    },
    git: async (_cwd: string, args: string[]) => {
        mockGitCalls.push(args);
        const failed = args[0] === "rev-parse" && !mockHasCommits;
        return { status: failed ? 1 : 0, stdout: "", stderr: "", missing: false };
    },
}));

import { getMcpPublishStatus, publishMcpProxy, publishToGitHub } from "../features/agent-manager/mcp-publish";

const DEVANT_URL = "https://abc-dev.choreoapis.dev/mcp-server/weather/v1.0";
const UPSTREAM = `${DEVANT_URL}/mcp`;
const MCP_SOURCE = "listener mcp:Listener l = new (8080);\nservice mcp:Service /mcp on l {}\n";

let workspace: string;
let project: string;

beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-publish-flow-"));
    project = path.join(workspace, "weather");
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, "main.bal"), MCP_SOURCE);
    mockProxies.clear();
    mockManifest = {};
    mockEnvironmentId = "env-1";
    mockGitCalls.length = 0;
    mockIgnored.length = 0;
    mockHasCommits = false;
    mockFacts = { gitMissing: false, hasRemotes: true, branch: "main", upstreamBranch: "main", dirty: 0, ahead: 0, root: "/repo" };
});

afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
    jest.clearAllMocks();
});

const proxyWith = (url: string, header?: string) => ({
    id: "weather-mcp",
    name: "Weather MCP",
    version: "1.0.0",
    context: "/default/weather-mcp",
    endpoints: [{
        id: "primary",
        upstream: { main: { url, auth: header ? { type: "api-key", header } : undefined } },
        security: { enabled: true, identity: { enabled: true } },
        policies: [{ name: "rate-limit", version: "v1" }],
        capabilities: { tools: [{ name: "old" }] },
        environments: [{ environmentUuid: "env-1", deploymentStatus: "Deployed" }],
    }],
});

const publish = (request: Partial<Parameters<typeof publishMcpProxy>[0]> = {}) =>
    publishMcpProxy({ projectPath: project, url: DEVANT_URL, security: "apiKey", header: "api-key", apiKey: "secret", ...request });

describe("publishMcpProxy", () => {
    it("creates a proxy with Agent Identity security, the probed tools and the key, and records it", async () => {
        const result = await publish();
        expect(result.success).toBe(true);
        expect(mockApi.fetchMcpServerInfo).toHaveBeenCalledWith(UPSTREAM, { type: "api-key", header: "api-key", value: "secret" });
        const body = mockApi.createMcpProxy.mock.calls[0][0];
        expect(body).toMatchObject({ id: "weather-mcp", name: "Weather MCP", version: "2.1.0", context: "/default/weather-mcp" });
        expect(body.endpoints[0]).toMatchObject({
            upstream: { main: { url: UPSTREAM, auth: { type: "api-key", header: "api-key", value: "secret" } } },
            security: { enabled: true, identity: { enabled: true } },
            environments: [{ environmentUuid: "env-1" }],
        });
        expect(mockManifest.publishedMcpProxy).toEqual({ id: "weather-mcp", url: UPSTREAM });
    });

    it("adopts a same-id proxy that fronts the same server instead of duplicating it", async () => {
        mockProxies.set("weather-mcp", proxyWith(UPSTREAM, "api-key"));
        const result = await publish({ apiKey: "" });
        expect(result.success).toBe(true);
        expect(mockApi.createMcpProxy).not.toHaveBeenCalled();
        expect(mockApi.updateMcpProxy).toHaveBeenCalledWith("weather-mcp", expect.anything());
        // No new key, so the stored one is kept and the tools stay as last discovered.
        expect(mockApi.fetchMcpServerInfo).not.toHaveBeenCalled();
        const endpoint = mockApi.updateMcpProxy.mock.calls[0][1].endpoints[0];
        expect(endpoint.upstream.main.auth).toEqual({ type: "api-key", header: "api-key" });
        expect(endpoint.policies).toEqual([{ name: "rate-limit", version: "v1" }]);
        expect(endpoint.capabilities).toEqual({ tools: [{ name: "old" }] });
    });

    it("refuses a same-id proxy for a different server", async () => {
        mockProxies.set("weather-mcp", proxyWith("https://elsewhere/mcp", "api-key"));
        const result = await publish();
        expect(result).toMatchObject({ success: false, message: expect.stringContaining("for a different server") });
        expect(mockApi.updateMcpProxy).not.toHaveBeenCalled();
        expect(mockApi.createMcpProxy).not.toHaveBeenCalled();
    });

    it("requires a key when Agent Manager doesn't store one", async () => {
        const result = await publish({ apiKey: "" });
        expect(result).toMatchObject({ success: false, message: expect.stringContaining("Enter the API key") });
        expect(mockApi.fetchMcpServerInfo).not.toHaveBeenCalled();
    });

    it("refuses to switch a proxy with a stored key to no security", async () => {
        mockManifest = { publishedMcpProxy: { id: "weather-mcp", url: UPSTREAM } };
        mockProxies.set("weather-mcp", proxyWith(UPSTREAM, "api-key"));
        const result = await publish({ security: "none", header: undefined, apiKey: undefined });
        expect(result).toMatchObject({ success: false, message: expect.stringContaining("can't remove the API key") });
        expect(mockApi.updateMcpProxy).not.toHaveBeenCalled();
    });

    it("probes and publishes without a credential when security is None", async () => {
        const result = await publish({ security: "none", header: undefined, apiKey: undefined });
        expect(result.success).toBe(true);
        expect(mockApi.fetchMcpServerInfo).toHaveBeenCalledWith(UPSTREAM, undefined);
        expect(mockApi.createMcpProxy.mock.calls[0][0].endpoints[0].upstream).toEqual({ main: { url: UPSTREAM } });
    });

    it("finds an MCP service declared in a module", async () => {
        fs.writeFileSync(path.join(project, "main.bal"), "public function main() {}\n");
        fs.mkdirSync(path.join(project, "modules", "tools"), { recursive: true });
        fs.writeFileSync(path.join(project, "modules", "tools", "server.bal"), MCP_SOURCE);
        expect((await publish()).success).toBe(true);
    });
});

describe("getMcpPublishStatus", () => {
    it("reports an unreadable component.yaml instead of failing", async () => {
        fs.mkdirSync(path.join(project, ".choreo"));
        fs.writeFileSync(path.join(project, ".choreo", "component.yaml"), "endpoints: [unclosed\n");
        const status = await getMcpPublishStatus(project);
        expect(status.endpointReady).toBe(false);
        expect(status.error).toContain("isn't valid YAML");
    });

    it("reports a missing environment instead of showing Deploying forever", async () => {
        mockManifest = { publishedMcpProxy: { id: "weather-mcp", url: UPSTREAM } };
        mockProxies.set("weather-mcp", proxyWith(UPSTREAM, "api-key"));
        mockEnvironmentId = undefined;
        const status = await getMcpPublishStatus(project);
        expect(status.published).toBeUndefined();
        expect(status.error).toContain("no 'default' environment");
    });

    it("reads a published proxy's deployment, tools and upstream security", async () => {
        mockManifest = { publishedMcpProxy: { id: "weather-mcp", url: UPSTREAM } };
        mockProxies.set("weather-mcp", proxyWith(UPSTREAM, "api-key"));
        const status = await getMcpPublishStatus(project);
        expect(status.published).toMatchObject({
            id: "weather-mcp", deployed: true, toolCount: 1, upstreamSecurity: "apiKey", upstreamHeader: "api-key",
            consoleUrl: "https://console/org/acme/mcp-proxies/view/weather-mcp",
        });
    });
});

describe("publishToGitHub", () => {
    const executeCommand = jest.spyOn(vscode.commands, "executeCommand");

    it("creates the repository at the Ballerina workspace root and commits it, keeping local-only files out", async () => {
        fs.writeFileSync(path.join(workspace, "Ballerina.toml"), '[workspace]\npackages = ["weather"]\n');
        mockFacts = { gitMissing: false, hasRemotes: false, dirty: 0, ahead: 0 };
        await publishToGitHub(project);
        expect(mockGitCalls).toEqual([["init"], ["rev-parse", "--verify", "--quiet", "HEAD"], ["add", "-A"], ["commit", "-m", "Initial commit"]]);
        expect(mockIgnored).toEqual(["Config.toml", "trace_enabled.bal"]);
        expect(executeCommand).toHaveBeenCalledWith("github.publish");
    });

    it("never commits to a repository that already has history", async () => {
        mockFacts = { gitMissing: false, hasRemotes: false, root: workspace, dirty: 3, ahead: 0 };
        mockHasCommits = true;
        await publishToGitHub(project);
        expect(mockGitCalls).toEqual([["rev-parse", "--verify", "--quiet", "HEAD"]]);
        expect(mockIgnored).toEqual([]);
        expect(executeCommand).toHaveBeenCalledWith("github.publish");
    });
});
