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

// Which Agent Manager the extension talks to: a self-hosted session it stored, else Agent Manager on WSO2 Cloud through
// WSO2 Integrator's sign-in. WSO2 Integrator's API and the extension's secret storage are fakes.

const mockSecrets = new Map<string, string>();
const mockCloud = {
    signedIn: true,
    organizations: [{ name: "acme-org", handle: "acme", displayName: "Acme" }] as { name: string; handle?: string; displayName?: string }[],
    requests: [] as { service: string; method: string; path: string }[],
    failWith: undefined as undefined | { status: number; message: string },
};

jest.mock("../BalExtensionContext", () => ({
    __esModule: true,
    extension: {
        context: {
            subscriptions: [],
            secrets: {
                get: async (key: string) => mockSecrets.get(key),
                store: async (key: string, value: string) => void mockSecrets.set(key, value),
                delete: async (key: string) => void mockSecrets.delete(key),
            },
        },
    },
}));
jest.mock("@wso2/wso2-cloud-client/vscode", () => ({
    __esModule: true,
    readCloudEnvironment: () => ({ name: "dev", consoleUrl: "https://console.example.com", apiBaseUrl: "https://gw.example.com/ipaas" }),
}));
jest.mock("../utils/cloud-auth", () => ({
    __esModule: true,
    onDidChangeCloudSessions: () => ({ dispose: () => undefined }),
    connectPlatformAPI: async () => mockCloud.signedIn ? {
        getAuthState: () => ({ status: "signed-in", session: { org: { handle: "acme", name: "Acme Inc" }, user: {} } }),
        request: async (request: { service: string; method: string; path: string }) => {
            mockCloud.requests.push(request);
            if (mockCloud.failWith) {
                throw Object.assign(new Error(mockCloud.failWith.message), { cloudError: true, code: "forbidden", details: { status: mockCloud.failWith.status } });
            }
            return request.path === "/orgs" ? { organizations: mockCloud.organizations } : { items: [] };
        },
    } : undefined,
}));
jest.mock("../features/ai/agent/mcp/oauth", () => ({ __esModule: true, waitForAuthCode: jest.fn() }));

import { AgentManagerApiError, cloudRequest, getSession, isCloudSession } from "../features/agent-manager/auth";

const SESSION_KEY = "ballerina.agentManager.session";
const selfHosted = { instanceUrl: "https://am.example.com/api", consoleUrl: "https://am.example.com", org: "default", accessToken: "t", expiresAt: Date.now() + 3_600_000 };

beforeEach(() => {
    mockSecrets.clear();
    mockCloud.signedIn = true;
    mockCloud.requests = [];
    mockCloud.failWith = undefined;
});

describe("Agent Manager session", () => {
    it("uses the stored self-hosted instance over WSO2 Cloud", async () => {
        mockSecrets.set(SESSION_KEY, JSON.stringify(selfHosted));
        const session = await getSession();
        expect(session?.instanceUrl).toBe(selfHosted.instanceUrl);
        expect(isCloudSession(session!)).toBe(false);
    });

    it("uses Agent Manager on WSO2 Cloud through WSO2 Integrator's sign-in otherwise", async () => {
        const session = await getSession();
        expect(session).toMatchObject({
            instanceUrl: "https://gw.example.com/agent-manager-service-agent-manager-api",
            org: "acme-org",
            orgHandle: "acme",
            orgDisplayName: "Acme",
        });
        expect(isCloudSession(session!)).toBe(true);
        expect(mockCloud.requests[0]).toMatchObject({ service: "agent-manager", method: "GET", path: "/orgs" });
    });

    it("ignores a WSO2 Cloud session stored by the old sign-in", async () => {
        mockSecrets.set(SESSION_KEY, JSON.stringify({ ...selfHosted, instanceUrl: "https://gw.example.com/agent-manager-service-agent-manager-api" }));
        mockCloud.signedIn = false;
        expect(await getSession()).toBeUndefined();
    });

    it("reports a failed WSO2 Cloud call with its HTTP status", async () => {
        mockCloud.failWith = { status: 403, message: "forbidden" };
        await expect(cloudRequest("GET", "/orgs/acme-org/projects")).rejects.toMatchObject({ status: 403 });
        await expect(cloudRequest("GET", "/orgs/acme-org/projects")).rejects.toBeInstanceOf(AgentManagerApiError);
    });
});
