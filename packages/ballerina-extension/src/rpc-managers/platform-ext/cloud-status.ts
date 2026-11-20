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


import type { Build, Deployment, Environment, IWso2PlatformExtensionAPI } from "@wso2/wso2-cloud-client";
import { isSamePath } from "@wso2/ballerina-core/lib/utils/path-utils";
import type {
    CloudBuildState,
    CloudBuildStatus,
    CloudDeploymentState,
    CloudEnvironmentStatus,
    CloudIntegrationStatus,
} from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";

/**
 * The newest build. The platform does not promise an order, so it is chosen
 * by start time; a run that has not started yet is newer than any that has.
 */
export function latestBuild(builds: readonly Build[]): Build | undefined {
    const started = (build: Build) => (build.startedAt ? Date.parse(build.startedAt) : Number.POSITIVE_INFINITY);
    return [...builds].sort((a, b) => started(b) - started(a))[0];
}

/** The platform reports Pending, Running, Succeeded or Failed in practice, but passes other completion reasons through. */
export function buildState(status: string | undefined): CloudBuildState {
    switch (status?.toLowerCase()) {
        case "pending":
            return "pending";
        case "running":
            return "running";
        case "succeeded":
            return "succeeded";
        case "failed":
        case "error":
            return "failed";
        default:
            return "unknown";
    }
}

export function toBuildStatus(build: Build | undefined): CloudBuildStatus | undefined {
    if (!build) {
        return undefined;
    }
    return {
        state: buildState(build.status),
        status: build.status,
        commit: build.commit,
        startedAt: build.startedAt,
        completedAt: build.completedAt,
    };
}

/** An environment the integration was never deployed to answers no deployment. */
export function deploymentState(deployment: Deployment | undefined): CloudDeploymentState {
    if (!deployment) {
        return "not-deployed";
    }
    switch (deployment.deploymentStatusV2) {
        case "ACTIVE":
            return "active";
        case "IN_PROGRESS":
            return "in-progress";
        case "ERROR":
            return "error";
        case "SUSPENDED":
            return "suspended";
        default:
            return "unknown";
    }
}

export function toEnvironmentStatus(environment: Environment, deployment: Deployment | undefined): CloudEnvironmentStatus {
    return {
        environment: environment.name,
        state: deploymentState(deployment),
        commit: deployment?.build?.commit?.sha,
    };
}

/** The part of WSO2 Integrator's API the status is read through. */
export type CloudStatusApi = Pick<IWso2PlatformExtensionAPI, "getDirectoryIntegrations" | "builds" | "environments" | "deployments">;

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The latest build of the directory's integration and what runs in each
 * environment of its project; undefined when no integration is linked to
 * the directory. Each read stands alone: one that fails is left out and
 * named in `error`, and the rest are still answered.
 */
export async function readCloudIntegrationStatus(api: CloudStatusApi, projectPath: string): Promise<CloudIntegrationStatus | undefined> {
    const found = api.getDirectoryIntegrations(projectPath);
    const match = found.find((item) => isSamePath(item.fsPath, projectPath)) ?? found[0];
    if (!match) {
        return undefined;
    }
    // The resource name: `name` is the display name.
    const name = match.integration.id;
    const projectName = match.integration.projectId;
    const failures: string[] = [];
    const readEnvironments = async (): Promise<CloudEnvironmentStatus[]> => {
        const environments = await api.environments.listOrdered(projectName);
        const reads = await Promise.allSettled(environments.map((env) => api.deployments.get(name, env.id, projectName)));
        return environments.flatMap((env, i) => {
            const read = reads[i];
            if (read.status === "rejected") {
                failures.push(`${env.name}: ${reasonOf(read.reason)}`);
                return [];
            }
            return [toEnvironmentStatus(env, read.value)];
        });
    };
    const [builds, environments] = await Promise.allSettled([api.builds.list(name, projectName), readEnvironments()]);
    if (builds.status === "rejected") {
        failures.unshift(`builds: ${reasonOf(builds.reason)}`);
    }
    if (environments.status === "rejected") {
        failures.push(`environments: ${reasonOf(environments.reason)}`);
    }
    return {
        integrationName: name,
        projectName,
        build: builds.status === "fulfilled" ? toBuildStatus(latestBuild(builds.value)) : undefined,
        environments: environments.status === "fulfilled" ? environments.value : [],
        error: failures.length > 0 ? failures.join("; ") : undefined,
    };
}
