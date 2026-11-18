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

jest.mock("./agentManagerBackend", () => ({ __esModule: true }));
jest.mock("./deployBackend", () => ({ __esModule: true, isAgentTarget: () => false }));

import type { CloudDeployStatus } from "@wso2/ballerina-core";
import type { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import { cloudBackend } from "./cloudBackend";

const statusOf = (buildCommit: string) => {
    const cloud: CloudDeployStatus = {
        signedIn: true,
        source: { repository: "org/repo", branch: "main", commit: "af37b9b", changedFiles: 0, unpushedCommits: 0 },
        integration: { name: "test-mcp", displayName: "Test MCP", project: "default", branch: "main" },
        build: { name: "test-mcp-1", status: "Succeeded", commit: buildCommit },
        deployment: { environment: "Development", status: "ACTIVE", commit: "218bdfe" },
    };
    const rpcClient = { getPlatformRpcClient: () => ({ getCloudDeployStatus: async () => cloud }), getAgentManagerRpcClient: () => ({}) };
    return cloudBackend(rpcClient as unknown as BallerinaRpcClient).getStatus("cloudIntegration", "/project");
};

describe("cloudBackend status", () => {
    it("offers a build newer than the running deployment", async () => {
        const status = await statusOf("af37b9b");
        expect(status.deployed?.commit).toBe("218bdfe");
        expect(status.built).toEqual({ branch: "main", commit: "af37b9b", state: "built" });
    });

    it("offers nothing when the latest build is the one running", async () => {
        expect((await statusOf("218bdfe")).built).toBeUndefined();
    });
});
