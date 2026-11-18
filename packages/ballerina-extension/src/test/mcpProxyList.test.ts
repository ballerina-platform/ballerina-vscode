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

// Agent Manager's MCP servers: the organization's and the agent's project's, each loaded once.

const mockApi = {
    listMcpProxies: jest.fn(),
    listProjectMcpProxies: jest.fn(),
    getMcpProxy: jest.fn(),
    getProjectMcpProxy: jest.fn(),
    firstEnvironment: jest.fn(async () => "Development"),
    getEnvironmentId: jest.fn(async () => "dev-id"),
};

jest.mock("@wso2/ballerina-core", () => ({ __esModule: true }));
jest.mock("../stateMachine", () => ({ __esModule: true, StateMachine: { context: () => ({ projectPath: "/project" }) } }));
jest.mock("../features/agent-manager/auth", () => ({
    __esModule: true,
    AgentManagerApiError: class extends Error {},
    getSession: async () => ({ instanceUrl: "https://am.example.com", org: "acme", consoleUrl: "https://console.example.com" }),
}));
jest.mock("../features/agent-manager/bindings", () => ({ __esModule: true, AGENT_ID_ENV: {} }));
jest.mock("../features/agent-manager/client", () => ({
    __esModule: true,
    api: mockApi,
    consoleOrgUrl: (url: string, org: string) => `${url}/${org}`,
    DEFAULT_ENVIRONMENT: "default",
    DEFAULT_PROJECT: "default",
    readManifest: () => ({ org: "acme", project: "shop" }),
}));
jest.mock("../features/agent-manager/models", () => ({ __esModule: true }));

import { listMcpProxies } from "../features/agent-manager/mcp";

const proxy = (id: string) => ({ id, name: `${id} name`, description: `${id} description` });

it("loads a server listed by the organization and the project once, through the project, and names each one that fails to load", async () => {
    mockApi.listMcpProxies.mockResolvedValue([proxy("docs"), proxy("search")]);
    mockApi.listProjectMcpProxies.mockResolvedValue([proxy("search")]);
    mockApi.getMcpProxy.mockRejectedValue(new Error("down"));
    mockApi.getProjectMcpProxy.mockRejectedValue(new Error("down"));
    const { proxies } = await listMcpProxies("/project");
    expect(proxies.map(({ id, name }) => [id, name])).toEqual([["docs", "docs name"], ["search", "search name"]]);
    expect(mockApi.getMcpProxy.mock.calls).toEqual([["docs"]]);
    expect(mockApi.getProjectMcpProxy.mock.calls).toEqual([["shop", "search"]]);
});
