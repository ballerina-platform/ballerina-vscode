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
import type { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import { agentManagerBackend } from "./agentManagerBackend";
import { cloudBackend } from "./cloudBackend";
import type { DeployStatus } from "./deployBackend";

const asClient = (client: object) => client as unknown as BallerinaRpcClient;

const cloudStatus = (overrides: Partial<CloudDeployStatus>) => {
    const status: CloudDeployStatus = { signedIn: true, integration: { name: "orders", displayName: "Orders", project: "default" }, ...overrides };
    const rpcClient = { getPlatformRpcClient: () => ({ getCloudDeployStatus: async () => status }), getAgentManagerRpcClient: () => ({}) };
    return cloudBackend(asClient(rpcClient), "cloudIntegration").getStatus("cloudIntegration", "/project");
};

const LINK: AgentManagerLink = { instanceUrl: "https://am.example.com", org: "acme", project: "default", agent: "orders", mode: "internal", environment: "Development" };

const agentStatus = (overrides: Partial<AgentManagerStatus>) => {
    const status: AgentManagerStatus = { signedIn: true, org: "acme", link: LINK, branch: "main", ...overrides };
    const rpcClient = { getAgentManagerRpcClient: () => ({ getAgentManagerStatus: async () => status }) };
    return agentManagerBackend(asClient(rpcClient), true).getStatus("cloudAgent", "/project");
};

const cloneStep = (status: DeployStatus) => status.run?.steps.find((step) => step.id === "clone")?.state;

describe("WSO2 Cloud status", () => {
    it.each<[string, Partial<CloudDeployStatus>, Partial<DeployStatus>, string | undefined]>([
        ["shows a platform error instead of a deploy in progress", { pending: true, error: "Service unavailable" }, { error: "Service unavailable" }, undefined],
        ["counts an integration with no build as queued right after it was created here", { pending: true }, {}, "running"],
        ["shows no run for an integration with no build that wasn't created here", {}, {}, undefined],
    ])("%s", async (_name, overrides, expected, clone) => {
        const status = await cloudStatus(overrides);
        expect(status).toMatchObject(expected);
        expect(cloneStep(status)).toBe(clone);
    });
});

describe("Agent Manager status", () => {
    it.each<[string, Partial<AgentManagerStatus>, Partial<DeployStatus>]>([
        [
            "reports a failed build of a registered agent",
            { build: { name: "orders-1", status: "Failed", commitId: "abcdef1234" } },
            { registered: true, built: { branch: "main", commit: "abcdef1", state: "buildFailed" } },
        ],
        [
            "treats a crashed deployment as failed, not starting",
            { crashed: true, build: { name: "orders-1", status: "Succeeded" }, deployment: { environment: "Development", status: "in-progress" } },
            { built: { branch: "main", commit: "", state: "deployFailed" } },
        ],
        ["surfaces the status error", { unavailable: true, error: "Can't reach am.example.com." }, { error: "Can't reach am.example.com." }],
    ])("%s", async (_name, overrides, expected) => {
        const status = await agentStatus(overrides);
        expect(status).toMatchObject(expected);
        expect(status.run).toBeUndefined();
    });
});
