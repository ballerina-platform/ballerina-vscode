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

import type { Build, Deployment, DirectoryIntegration, Environment } from "@wso2/wso2-cloud-client";
import {
    type CloudStatusApi,
    buildState,
    deploymentState,
    latestBuild,
    cloudIntegrationStatus,
    readCloudIntegrationStatus,
    toBuildStatus,
    toEnvironmentStatus,
} from "../rpc-managers/platform-ext/cloud-status";

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

    it("keeps the platform's order between runs that have not started, and reads an unreadable start time as not started", () => {
        const started = build("a", "Succeeded", "2026-11-19T10:00:00Z");
        expect(latestBuild([started, build("p1", "Pending"), build("p2", "Pending")])?.name).toBe("p1");
        expect(latestBuild([started, build("p2", "Pending"), build("p1", "Pending")])?.name).toBe("p2");
        expect(latestBuild([started, build("bad", "Pending", "not a date")])?.name).toBe("bad");
    });

    it("reads the platform's build status, keeping a word it does not know as unknown", () => {
        expect(buildState("Pending")).toBe("pending");
        expect(buildState("Running")).toBe("running");
        expect(buildState("Succeeded")).toBe("succeeded");
        expect(buildState("Failed")).toBe("failed");
        expect(buildState("Cancelled")).toBe("unknown");
        // A run with no status yet is pending, as the cloud client's own wait for a build reads it.
        expect(buildState(undefined)).toBe("pending");
        expect(buildState("")).toBe("pending");
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

    describe("reading it through WSO2 Integrator's API", () => {
        const production = { ...development, id: "env-prod", name: "production" } as Environment;
        const linked = (fsPath: string, id: string): DirectoryIntegration =>
            ({
                fsPath,
                relativePath: ".",
                workspaceName: "w",
                integration: { id, name: `${id} display name`, projectId: "default-project" },
            }) as unknown as DirectoryIntegration;

        function fakeApi(overrides: { integrations?: DirectoryIntegration[]; builds?: () => Promise<Build[]>; deployment?: (env: string) => Promise<Deployment | undefined> } = {}) {
            const calls: string[] = [];
            const api = {
                getDirectoryIntegrations: () => overrides.integrations ?? [linked("/repo/other", "other"), linked("/repo/hello", "hello")],
                builds: {
                    list: async (name: string, projectName?: string) => {
                        calls.push(`builds ${name} ${projectName}`);
                        return overrides.builds ? overrides.builds() : [build("b1", "Succeeded", "2026-11-19T10:00:00Z", "abc")];
                    },
                },
                environments: { listOrdered: async () => [development, production] },
                deployments: {
                    get: async (name: string, envId: string, projectName?: string) => {
                        calls.push(`deployment ${name} ${envId} ${projectName}`);
                        return overrides.deployment ? overrides.deployment(envId) : deployment("ACTIVE", "abc");
                    },
                },
            } as unknown as CloudStatusApi;
            return { api, calls };
        }

        it("reads the integration linked to the directory by its resource name, in its project", async () => {
            const { api, calls } = fakeApi();
            const status = await readCloudIntegrationStatus(api, "/repo/hello");
            expect(calls).toEqual([
                "builds hello default-project",
                "deployment hello env-dev default-project",
                "deployment hello env-prod default-project",
            ]);
            expect(status).toEqual({
                integrationName: "hello",
                projectName: "default-project",
                build: { state: "succeeded", status: "Succeeded", commit: "abc", startedAt: "2026-11-19T10:00:00Z", completedAt: undefined },
                environments: [
                    { environment: "development", state: "active", commit: "abc" },
                    { environment: "production", state: "active", commit: "abc" },
                ],
                error: undefined,
            });
        });

        it("answers nothing for a directory no integration is linked to, including one linked only under it", async () => {
            const { api, calls } = fakeApi({ integrations: [] });
            expect(await readCloudIntegrationStatus(api, "/repo/hello")).toBeUndefined();
            const nested = fakeApi({ integrations: [linked("/repo/hello/inner", "inner")] });
            expect(await readCloudIntegrationStatus(nested.api, "/repo/hello")).toBeUndefined();
            expect([...calls, ...nested.calls]).toEqual([]);
        });

        it("answers nothing, and reads nothing, without an API to read through", async () => {
            const { api, calls } = fakeApi();
            const connect = jest.fn(async () => undefined);
            expect(await cloudIntegrationStatus(connect, "/repo/hello")).toBeUndefined();
            expect(connect).toHaveBeenCalledTimes(1);
            expect(calls).toEqual([]);
            expect(await cloudIntegrationStatus(async () => api, "/repo/hello")).toMatchObject({ integrationName: "hello" });
        });

        it("keeps every read that worked when one environment's read or the builds read fails", async () => {
            const { api } = fakeApi({
                builds: async () => {
                    throw new Error("builds are down");
                },
                deployment: async (env) => {
                    if (env === "env-prod") {
                        throw new Error("forbidden");
                    }
                    return undefined;
                },
            });
            const status = await readCloudIntegrationStatus(api, "/repo/hello");
            expect(status?.build).toBeUndefined();
            // The unreadable one keeps its place, so the first environment of the pipeline is still the first.
            expect(status?.environments).toEqual([
                { environment: "development", state: "not-deployed", commit: undefined },
                { environment: "production", state: "unavailable" },
            ]);
            expect(status?.error).toBe("builds: builds are down; production: forbidden");
        });
    });
});
