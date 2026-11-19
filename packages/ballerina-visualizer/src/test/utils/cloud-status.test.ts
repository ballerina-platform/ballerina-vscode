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


import type { CloudIntegrationStatus } from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";
import { cloudHeadline, cloudStatusRows, isCloudSettling } from "../../views/BI/PackageOverview/cloudStatus";

const status = (overrides: Partial<CloudIntegrationStatus>): CloudIntegrationStatus => ({
    integrationName: "hello",
    projectName: "default",
    environments: [
        { environment: "development", state: "not-deployed" },
        { environment: "production", state: "not-deployed" },
    ],
    ...overrides,
});

describe("the overview's WSO2 Cloud status", () => {
    it("says only that the integration is there while no status was read", () => {
        expect(cloudHeadline(undefined)).toMatchObject({ title: "Created in WSO2 Cloud", tone: "idle" });
        expect(cloudStatusRows(undefined)).toEqual([]);
    });

    it("says a build under way before anything else", () => {
        const building = status({
            build: { state: "running", commit: "abcdef123" },
            environments: [{ environment: "development", state: "error" }],
        });
        expect(cloudHeadline(building)).toMatchObject({ title: "Building in WSO2 Cloud", tone: "progress" });
        expect(isCloudSettling(building)).toBe(true);
    });

    it("says a rollout under way, then a failed build, then a failed deployment", () => {
        expect(
            cloudHeadline(status({ build: { state: "succeeded" }, environments: [{ environment: "development", state: "in-progress" }] })).title,
        ).toBe("Deploying in WSO2 Cloud");
        expect(
            cloudHeadline(status({ build: { state: "failed" }, environments: [{ environment: "development", state: "active" }] })).title,
        ).toBe("Build Failed in WSO2 Cloud");
        expect(
            cloudHeadline(status({ build: { state: "succeeded" }, environments: [{ environment: "development", state: "error" }] })),
        ).toMatchObject({ title: "Deployment Failed in WSO2 Cloud", tone: "error" });
    });

    it("says where it runs, and when the latest build is not deployed to the first environment yet", () => {
        const deployed = status({
            build: { state: "succeeded", commit: "abcdef1234567" },
            environments: [
                { environment: "development", state: "active", commit: "abcdef1" },
                { environment: "production", state: "not-deployed" },
            ],
        });
        expect(cloudHeadline(deployed)).toEqual({ title: "Deployed in WSO2 Cloud", description: "Running in development.", tone: "ok" });
        expect(isCloudSettling(deployed)).toBe(false);

        const behind = status({ ...deployed, build: { state: "succeeded", commit: "9999999aaaa" } });
        expect(cloudHeadline(behind).description).toBe(
            "Running in development. The latest build is not deployed to development yet; deploy it from the console.",
        );
    });

    it("says a successful build that runs nowhere is not deployed yet", () => {
        expect(cloudHeadline(status({ build: { state: "succeeded" } }))).toMatchObject({
            title: "Created in WSO2 Cloud",
            description: "Built, and not deployed yet. Deploy it from the console.",
        });
    });

    it("lists the latest build, then each environment in pipeline order, with short commits", () => {
        const rows = cloudStatusRows(
            status({
                build: { state: "unknown", status: "Cancelled", commit: "abcdef1234567" },
                environments: [
                    { environment: "development", state: "active", commit: "1234567890" },
                    { environment: "production", state: "suspended" },
                ],
            }),
        );
        expect(rows).toEqual([
            { label: "Latest build", value: "Cancelled", tone: "idle", commit: "abcdef1" },
            { label: "development", value: "Running", tone: "ok", commit: "1234567" },
            { label: "production", value: "Stopped", tone: "idle", commit: undefined },
        ]);
    });
});
