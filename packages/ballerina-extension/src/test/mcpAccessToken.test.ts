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

// The design-time token for an OAuth MCP server, minted with the AgentID client credentials in Config.toml.

const SERVER_URL = "https://gw.example.com/default/docs/mcp";
const mockValues: Record<string, string | undefined> = {};

jest.mock("@wso2/ballerina-core", () => ({ __esModule: true }));
jest.mock("../BalExtensionContext", () => ({ __esModule: true, extension: { context: { subscriptions: [] } } }));
jest.mock("@wso2/wso2-cloud-client", () => ({ __esModule: true, isCloudError: () => false }));
jest.mock("@wso2/wso2-cloud-client/vscode", () => ({ __esModule: true, readCloudEnvironment: () => undefined }));
jest.mock("@wso2/wso2-platform-core", () => ({ __esModule: true, WICommandIds: {} }));
jest.mock("../utils/cloud-auth", () => ({ __esModule: true, connectPlatformAPI: async (): Promise<undefined> => undefined, onDidChangeCloudSessions: () => ({ dispose: () => undefined }) }));
jest.mock("../features/ai/agent/mcp/oauth", () => ({ __esModule: true, waitForAuthCode: jest.fn() }));
jest.mock("../stateMachine", () => ({ __esModule: true, StateMachine: { context: () => ({ projectPath: "/project" }) } }));
jest.mock("../features/agent-manager/bindings", () => ({
    __esModule: true,
    AGENT_ID_ENV: {},
    envBase: (handle: string) => handle.toUpperCase(),
    localConfigValues: async () => mockValues,
}));
jest.mock("../features/agent-manager/client", () => ({ __esModule: true, api: {}, readManifest: () => ({ mcpServers: [{ proxy: "docs", env: { url: "DOCS_MCP_URL" } }] }) }));
jest.mock("../features/agent-manager/models", () => ({ __esModule: true, pickedProviderEnvNames: (): string[] => [] }));

import { mcpAccessToken } from "../features/agent-manager/mcp";

const fetchMock = jest.fn();

beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ access_token: "design-time" }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    Object.assign(mockValues, { docsMcpUrl: SERVER_URL, agentIdClientId: "client", agentIdClientSecret: "secret", agentIdScopes: "docs:read" });
});

describe("Design-time MCP token", () => {
    it("is minted from an HTTPS token URL", async () => {
        mockValues.agentIdTokenUrl = "https://idp.example.com/oauth2/token";
        expect(await mcpAccessToken(SERVER_URL)).toBe("design-time");
        expect(fetchMock.mock.calls[0][0]).toBe("https://idp.example.com/oauth2/token");
    });

    it("is minted from a local HTTP token URL", async () => {
        mockValues.agentIdTokenUrl = "http://thunder.amp.localhost:8080/oauth2/token";
        expect(await mcpAccessToken(SERVER_URL)).toBe("design-time");
    });

    it("never sends the client secret to a remote HTTP token URL", async () => {
        mockValues.agentIdTokenUrl = "http://idp.example.com/oauth2/token";
        expect(await mcpAccessToken(SERVER_URL)).toBeUndefined();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
