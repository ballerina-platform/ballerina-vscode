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

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parse as parseYaml } from "yaml";

import {
    buildMcpProxyRequest, findMcpService, McpSourceFacts, mcpSourceStep, normalizeServicePath, PROXY_ENDPOINT_ID, proxyVersion, readMcpSources,
    repositoryRootFor, toProxyHandle, upstreamMcpUrl, withMcpEndpoint,
} from "../features/agent-manager/mcp-publish-utils";

describe("findMcpService", () => {
    it.each([
        ["named listener", `listener mcp:StreamableHttpListener mcpListener = new (8080);
@mcp:StreamableHttpServiceConfig {info: {name: "MCP Service 1", version: "1.0.0"}}
service mcp:StreamableHttpService /mcp on mcpListener {
}`, { basePath: "/mcp", port: 8080 }],
        ["typed new with check", `listener mcp:Listener tools = check new mcp:Listener(9090);
service mcp:Service /tools on tools {}`, { basePath: "/tools", port: 9090 }],
        ["inline listener", "service mcp:Service /weather on new mcp:Listener(port = 7070) {}", { basePath: "/weather", port: 7070 }],
        ["root path", "listener mcp:Listener l = new (8080);\nservice mcp:Service / on l {}", { basePath: "/", port: 8080 }],
        ["no path", "listener mcp:Listener l = new (8080);\nservice mcp:Service on l {}", { basePath: "/", port: 8080 }],
        ["configurable port", "configurable int port = 8080;\nlistener mcp:Listener l = new (port);\nservice mcp:Service /mcp on l {}", { basePath: "/mcp", port: undefined }],
    ])("reads the base path and port from a %s", (_case, source, expected) => {
        expect(findMcpService([source])).toEqual(expected);
    });

    it("finds the MCP service among other services and files", () => {
        const agent = "listener ai:Listener chat = new (listenOn = check http:getDefaultListener());\nservice /ai\\-agent on chat {}";
        const mcp = "listener mcp:Listener l = new (8080);\nservice mcp:Service /mcp on l {}";
        expect(findMcpService([agent, mcp])).toEqual({ basePath: "/mcp", port: 8080 });
    });

    it("returns undefined when there is no MCP service", () => {
        expect(findMcpService(["service / on new http:Listener(9090) {}"])).toBeUndefined();
    });
});

describe("normalizeServicePath", () => {
    it.each([
        [undefined, "/"],
        ["/", "/"],
        ["/mcp", "/mcp"],
        ["/mcp/", "/mcp"],
        ['"mcp"', "/mcp"],
        ["/ai\\-tools", "/ai-tools"],
    ])("normalizes %s to %s", (raw, expected) => {
        expect(normalizeServicePath(raw)).toBe(expected);
    });
});

describe("upstreamMcpUrl", () => {
    const devant = "https://e856ec10-dev.e1-us-east-azure.choreoapis.dev/mcp-server/mcpint/v1.0";

    it("appends the service path to the endpoint URL WSO2 Cloud shows", () => {
        expect(upstreamMcpUrl(devant, "/mcp")).toBe(`${devant}/mcp`);
    });

    it("keeps a URL that already ends with the service path", () => {
        expect(upstreamMcpUrl(`${devant}/mcp/`, "/mcp")).toBe(`${devant}/mcp`);
    });

    it("adds nothing for a service at the listener root", () => {
        expect(upstreamMcpUrl(`${devant}/`, "/")).toBe(devant);
    });

    it.each(["?a=1", "#x"])("rejects a URL with %s rather than appending the path after it", (extra) => {
        expect(() => upstreamMcpUrl(`${devant}${extra}`, "/mcp")).toThrow(/query string or fragment/);
    });

    it.each(["", "not a url", "ftp://host/mcp"])("rejects %p", (input) => {
        expect(() => upstreamMcpUrl(input, "/mcp")).toThrow(/starting with https/);
    });
});

describe("toProxyHandle", () => {
    it("kebab-cases the integration title", () => {
        expect(toProxyHandle("  Weather MCP Server! ")).toBe("weather-mcp-server");
    });

    it("falls back when nothing usable remains", () => {
        expect(toProxyHandle("!!!")).toBe("mcp-server");
    });

    it("keeps the gateway artifact name within Agent Manager's 100-character limit", () => {
        const handle = toProxyHandle("a ".repeat(200));
        const artifact = `${handle}-${PROXY_ENDPOINT_ID}-${"0".repeat(32)}`;
        expect(artifact.length).toBeLessThanOrEqual(100);
        expect(handle).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    });
});

describe("proxyVersion", () => {
    it.each([
        ["1.2.3", "1.2.3"],
        ["2.0.0-beta.1", "2.0.0-beta.1"],
        ["1.0", "1.0.0"],
        [undefined, "1.0.0"],
        [7, "1.0.0"],
    ])("maps %p to %p", (input, expected) => {
        expect(proxyVersion(input)).toBe(expected);
    });
});

describe("withMcpEndpoint", () => {
    it("creates the endpoint file with base path / when there is none", () => {
        const { content, changed } = withMcpEndpoint(undefined, 8080);
        expect(changed).toBe(true);
        expect(parseYaml(content)).toEqual({
            schemaVersion: "1.2",
            endpoints: [{ name: "mcp", displayName: "MCP", type: "REST", networkVisibilities: ["Public"], service: { port: 8080, basePath: "/" } }],
        });
    });

    it("rewrites only the base path of the endpoint on the MCP port, keeping everything else", () => {
        const existing = `schemaVersion: "1.2"
dependencies:
  connectionReferences:
    - name: db
endpoints:
  - name: api
    service: { port: 9090, basePath: /api }
    type: REST
  - name: tools
    displayName: Tools
    service: { port: 8080, basePath: /mcp }
    type: REST
    networkVisibilities: [Organization]
`;
        const { content, changed } = withMcpEndpoint(existing, 8080);
        const doc = parseYaml(content);
        expect(changed).toBe(true);
        expect(doc.dependencies).toEqual({ connectionReferences: [{ name: "db" }] });
        expect(doc.endpoints[0]).toEqual({ name: "api", service: { port: 9090, basePath: "/api" }, type: "REST" });
        expect(doc.endpoints[1]).toEqual({
            name: "tools", displayName: "Tools", service: { port: 8080, basePath: "/" }, type: "REST", networkVisibilities: ["Organization"],
        });
    });

    it("keeps the user's comments and formatting when it rewrites the file", () => {
        const existing = `# Managed by our team
schemaVersion: "1.2"
endpoints:
  # The MCP listener
  - name: tools
    service: { port: 8080, basePath: /mcp }
    type: REST
`;
        const { content } = withMcpEndpoint(existing, 8080);
        expect(content).toContain("# Managed by our team");
        expect(content).toContain("# The MCP listener");
        expect(parseYaml(content).endpoints[0].service).toEqual({ port: 8080, basePath: "/" });
    });

    it("refuses a file that isn't valid YAML", () => {
        expect(() => withMcpEndpoint("endpoints: [unclosed\n", 8080)).toThrow(/isn't valid YAML/);
    });

    it("reports no change once the endpoint is ready", () => {
        const first = withMcpEndpoint(undefined, 8080);
        expect(withMcpEndpoint(first.content, 8080).changed).toBe(false);
    });
});

describe("buildMcpProxyRequest", () => {
    const input = {
        handle: "weather-mcp",
        name: "Weather MCP",
        version: "1.0.0",
        url: "https://host/weather/v1.0/mcp",
        auth: { type: "api-key" as const, header: "api-key", value: "secret" },
        capabilities: { tools: [{ name: "forecast" }], resources: [], prompts: [] },
        environmentId: "env-1",
    };

    it("creates one endpoint in one environment, secured with Agent Identity", () => {
        expect(buildMcpProxyRequest(input)).toEqual({
            id: "weather-mcp",
            name: "Weather MCP",
            version: "1.0.0",
            description: undefined,
            context: "/default/weather-mcp",
            mcpSpecVersion: "2025-06-18",
            endpoints: [{
                id: PROXY_ENDPOINT_ID,
                upstream: { main: { url: input.url, auth: input.auth } },
                capabilities: input.capabilities,
                security: { enabled: true, identity: { enabled: true } },
                environments: [{ environmentUuid: "env-1" }],
            }],
        });
    });

    it("sends no upstream auth for a server without security", () => {
        const body = buildMcpProxyRequest({ ...input, auth: undefined }) as any;
        expect(body.endpoints[0].upstream).toEqual({ main: { url: input.url } });
    });

    it("keeps an existing endpoint's id, security, policies and tools when updating without a new key", () => {
        const existingEndpoint = {
            id: "main",
            policies: [{ name: "rate-limit", version: "v1" }],
            security: { enabled: true, apiKey: { enabled: true, key: "X-API-Key", in: "header" } },
            capabilities: { tools: [{ name: "old" }] },
            upstream: { main: { url: "https://old/mcp", auth: { type: "api-key", header: "api-key" } } },
            environments: [{ environmentUuid: "env-1", deploymentStatus: "Deployed" }],
        };
        const body = buildMcpProxyRequest({
            ...input, context: "/custom", capabilities: undefined, auth: { type: "api-key", header: "api-key" }, existingEndpoint,
        }) as any;
        expect(body.context).toBe("/custom");
        expect(body.endpoints).toEqual([{
            id: "main",
            policies: existingEndpoint.policies,
            security: existingEndpoint.security,
            capabilities: existingEndpoint.capabilities,
            upstream: { main: { url: input.url, auth: { type: "api-key", header: "api-key" } } },
            environments: [{ environmentUuid: "env-1" }],
        }]);
    });
});

describe("mcpSourceStep", () => {
    const clean: McpSourceFacts = { gitMissing: false, root: "/repo", hasRemotes: true, branch: "main", upstreamBranch: "main", dirty: 0, ahead: 0 };

    it.each([
        ["git is missing", { gitMissing: true }, "gitMissing", "Download Git"],
        ["the project isn't a Git repository", { root: undefined, hasRemotes: false }, "publishRepo", "Publish to GitHub"],
        ["the repository has no remote", { hasRemotes: false }, "publishRepo", "Publish to GitHub"],
        ["HEAD is detached", { branch: undefined, upstreamBranch: undefined }, "detached", "Check Out a Branch"],
        ["there are uncommitted changes", { dirty: 2 }, "commit", "Review and Commit"],
        ["changes are uncommitted on an unpublished branch", { dirty: 1, upstreamBranch: undefined }, "commit", "Review and Commit"],
        ["the branch isn't on the remote", { upstreamBranch: undefined }, "publishBranch", "Publish Branch"],
        ["commits aren't pushed", { ahead: 3 }, "push", "Push"],
    ])("asks for one Git step when %s", (_case, facts, id, actionLabel) => {
        expect(mcpSourceStep({ ...clean, ...facts })).toMatchObject({ id, actionLabel });
    });

    it("asks for nothing once everything is pushed", () => {
        expect(mcpSourceStep(clean)).toBeUndefined();
    });

    it("words every step as plain Git, never naming the files the extension manages", () => {
        const facts: Partial<McpSourceFacts>[] = [
            { gitMissing: true }, { hasRemotes: false }, { branch: undefined }, { dirty: 1 }, { upstreamBranch: undefined }, { ahead: 1 },
        ];
        for (const overrides of facts) {
            expect(mcpSourceStep({ ...clean, ...overrides })!.message).not.toMatch(/component\.yaml|\.choreo|base path/i);
        }
    });
});

describe("project files", () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-publish-files-"));
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("reads the package's sources and its modules', but not the local trace toggle", () => {
        fs.writeFileSync(path.join(root, "main.bal"), "main");
        fs.writeFileSync(path.join(root, "trace_enabled.bal"), "trace");
        fs.writeFileSync(path.join(root, "notes.md"), "notes");
        fs.mkdirSync(path.join(root, "modules", "tools"), { recursive: true });
        fs.writeFileSync(path.join(root, "modules", "tools", "server.bal"), "server");
        expect(readMcpSources(root).sort()).toEqual(["main", "server"]);
    });

    it("puts a package in its Ballerina workspace's repository, and a standalone package in its own", () => {
        const pkg = path.join(root, "weather");
        fs.mkdirSync(pkg);
        expect(repositoryRootFor(pkg)).toBe(pkg);
        fs.writeFileSync(path.join(root, "Ballerina.toml"), '[package]\nname = "other"\n');
        expect(repositoryRootFor(pkg)).toBe(pkg);
        fs.writeFileSync(path.join(root, "Ballerina.toml"), '[workspace]\npackages = ["weather"]\n');
        expect(repositoryRootFor(pkg)).toBe(root);
    });
});
