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

// The WSO2 Cloud status the package overview shows: the latest build and what runs in each environment.

import type { Build, Deployment, Environment } from "@wso2/wso2-cloud-client";
import { buildState, deploymentState, latestBuild, toBuildStatus, toEnvironmentStatus } from "../rpc-managers/platform-ext/cloud-status";

const build = (name: string, status: string, startedAt?: string, commit?: string): Build =>
    ({ name, status, startedAt, commit, trigger: "automatic" }) as Build;

const deployment = (deploymentStatusV2: Deployment["deploymentStatusV2"], sha?: string): Deployment =>
    ({
        configCount: 0,
        cron: "",
        cronTimezone: "",
        releaseId: "r1",
        deploymentStatusV2,
        build: sha ? { buildId: "b1", commit: { sha, message: "m", isLatest: true, author: {} } } : undefined,
    }) as unknown as Deployment;

const development = { id: "env-dev", name: "development", critical: false, scaleToZeroEnabled: false } as Environment;

describe("WSO2 Cloud integration status", () => {
    it("takes the newest build by start time, and one not started yet over any that has", () => {
        const older = build("a", "Succeeded", "2026-11-19T10:00:00Z");
        const newer = build("b", "Failed", "2026-11-19T11:00:00Z");
        expect(latestBuild([older, newer])?.name).toBe("b");
        expect(latestBuild([newer, build("c", "Pending"), older])?.name).toBe("c");
        expect(latestBuild([])).toBeUndefined();
    });

    it("reads the platform's build status, keeping a word it does not know as unknown", () => {
        expect(buildState("Pending")).toBe("pending");
        expect(buildState("Running")).toBe("running");
        expect(buildState("Succeeded")).toBe("succeeded");
        expect(buildState("Failed")).toBe("failed");
        expect(buildState("Cancelled")).toBe("unknown");
        expect(buildState(undefined)).toBe("unknown");
        expect(toBuildStatus(build("a", "Cancelled", "2026-11-19T10:00:00Z", "abc"))).toEqual({
            state: "unknown",
            status: "Cancelled",
            commit: "abc",
            startedAt: "2026-11-19T10:00:00Z",
            completedAt: undefined,
        });
    });

    it("reads an environment with no deployment as not deployed, and each rollout state as it is", () => {
        expect(deploymentState(undefined)).toBe("not-deployed");
        expect(deploymentState(deployment("ACTIVE"))).toBe("active");
        expect(deploymentState(deployment("IN_PROGRESS"))).toBe("in-progress");
        expect(deploymentState(deployment("ERROR"))).toBe("error");
        expect(deploymentState(deployment("SUSPENDED"))).toBe("suspended");
        expect(deploymentState(deployment(undefined))).toBe("unknown");
        expect(toEnvironmentStatus(development, deployment("ACTIVE", "abc"))).toEqual({ environment: "development", state: "active", commit: "abc" });
        expect(toEnvironmentStatus(development, undefined)).toEqual({ environment: "development", state: "not-deployed", commit: undefined });
    });
});
