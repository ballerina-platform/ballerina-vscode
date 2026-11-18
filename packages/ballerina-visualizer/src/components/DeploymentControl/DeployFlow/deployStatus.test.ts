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

jest.mock("./deployBackend", () => ({ __esModule: true, isAgentTarget: () => false }));

import type { AgentManagerLink, AgentManagerStatus, CloudDeployStatus } from "@wso2/ballerina-core";
import { agentManagerBackend } from "./agentManagerBackend";
import { cloudBackend } from "./cloudBackend";

const cloudStatus = (overrides: Partial<CloudDeployStatus>) => {
    const status: CloudDeployStatus = { signedIn: true, integration: { name: "orders", displayName: "Orders", project: "default" }, ...overrides };
    const rpcClient = { getPlatformRpcClient: () => ({ getCloudDeployStatus: async () => status }), getAgentManagerRpcClient: () => ({}) };
    return cloudBackend(rpcClient as any).getStatus("cloudIntegration", "/project");
};

const LINK: AgentManagerLink = { instanceUrl: "https://am.example.com", org: "acme", project: "default", agent: "orders", mode: "internal", environment: "Development" };

const agentStatus = (overrides: Partial<AgentManagerStatus>) => {
    const status: AgentManagerStatus = { signedIn: true, org: "acme", link: LINK, branch: "main", ...overrides };
    const rpcClient = { getAgentManagerRpcClient: () => ({ getAgentManagerStatus: async () => status }) };
    return agentManagerBackend(rpcClient as any).getStatus("selfHosted", "/project");
};

describe("WSO2 Cloud status", () => {
    it("shows a platform error instead of a deploy in progress", async () => {
        const status = await cloudStatus({ pending: true, error: "Service unavailable" });
        expect(status.run).toBeUndefined();
        expect(status.error).toBe("Service unavailable");
    });

    it("counts an integration with no build as queued only right after it was created here", async () => {
        expect((await cloudStatus({ pending: true })).run?.steps.find((step) => step.id === "clone")?.state).toBe("running");
        expect((await cloudStatus({})).run).toBeUndefined();
    });
});

describe("Agent Manager status", () => {
    it("reports a failed build of a registered agent", async () => {
        const status = await agentStatus({ build: { name: "orders-1", status: "Failed", commitId: "abcdef1234" } });
        expect(status).toMatchObject({ registered: true, built: { branch: "main", commit: "abcdef1", state: "buildFailed" } });
        expect(status.run).toBeUndefined();
    });

    it("treats a crashed deployment as failed, not starting", async () => {
        const status = await agentStatus({
            crashed: true, build: { name: "orders-1", status: "Succeeded" }, deployment: { environment: "Development", status: "in-progress" },
        });
        expect(status.built?.state).toBe("deployFailed");
        expect(status.run).toBeUndefined();
    });

    it("surfaces the status error", async () => {
        expect((await agentStatus({ unavailable: true, error: "Can't reach am.example.com." })).error).toBe("Can't reach am.example.com.");
    });
});
