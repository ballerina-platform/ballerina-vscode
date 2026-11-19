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

import type {
    CloudBuildState,
    CloudDeploymentState,
    CloudIntegrationStatus,
} from "@wso2/ballerina-core/lib/rpc-types/platform-ext/interfaces";

/** How a state reads at a glance: under way, fine, failed, or nothing to say. */
export type CloudTone = "progress" | "ok" | "error" | "idle";

export interface CloudHeadline {
    title: string;
    description: string;
    tone: CloudTone;
}

const IN_CLOUD = "This integration is in WSO2 Cloud. Each push builds it; deploy it from the console.";

/** Two commits are the same when one names the other, a short sha included. */
function sameCommit(a: string | undefined, b: string | undefined): boolean {
    return !!a && !!b && (a.startsWith(b) || b.startsWith(a));
}

/**
 * What the overview says about an integration in WSO2 Cloud. Work under way
 * comes first, then a failure, then what runs; without a status it only
 * says the integration is there.
 */
export function cloudHeadline(status: CloudIntegrationStatus | undefined): CloudHeadline {
    if (!status) {
        return { title: "Created in WSO2 Cloud", description: IN_CLOUD, tone: "idle" };
    }
    const { build, environments } = status;
    const inEnvs = (state: CloudDeploymentState) => environments.filter((env) => env.state === state).map((env) => env.environment);
    if (build?.state === "pending" || build?.state === "running") {
        return { title: "Building in WSO2 Cloud", description: "WSO2 Cloud is building your latest push.", tone: "progress" };
    }
    const rollingOut = inEnvs("in-progress");
    if (rollingOut.length > 0) {
        return { title: "Deploying in WSO2 Cloud", description: `Deploying to ${rollingOut.join(", ")}.`, tone: "progress" };
    }
    if (build?.state === "failed") {
        return {
            title: "Build Failed in WSO2 Cloud",
            description: "The latest build failed. See its logs in the console, then push a fix.",
            tone: "error",
        };
    }
    const failed = inEnvs("error");
    if (failed.length > 0) {
        return { title: "Deployment Failed in WSO2 Cloud", description: `The deployment to ${failed.join(", ")} failed. See it in the console.`, tone: "error" };
    }
    const active = inEnvs("active");
    if (active.length > 0) {
        // The first environment of the pipeline is where a new build is deployed first.
        const entry = environments[0];
        const behind = build?.state === "succeeded" && build.commit && entry && !sameCommit(build.commit, entry.commit);
        return {
            title: "Deployed in WSO2 Cloud",
            description: `Running in ${active.join(", ")}.${behind ? ` The latest build is not deployed to ${entry.environment} yet; deploy it from the console.` : ""}`,
            tone: "ok",
        };
    }
    if (build?.state === "succeeded") {
        return { title: "Created in WSO2 Cloud", description: "Built, and not deployed yet. Deploy it from the console.", tone: "idle" };
    }
    return { title: "Created in WSO2 Cloud", description: IN_CLOUD, tone: "idle" };
}

/** Whether something is under way, so the status is worth reading again soon. */
export function isCloudSettling(status: CloudIntegrationStatus | undefined): boolean {
    return (
        status?.build?.state === "pending" ||
        status?.build?.state === "running" ||
        !!status?.environments.some((env) => env.state === "in-progress")
    );
}

const BUILD_LABELS: Record<CloudBuildState, string> = {
    pending: "Waiting to build",
    running: "Building",
    succeeded: "Built",
    failed: "Build failed",
    unknown: "Build",
};

const DEPLOYMENT_LABELS: Record<CloudDeploymentState, string> = {
    "not-deployed": "Not deployed",
    "in-progress": "Deploying",
    active: "Running",
    error: "Deployment failed",
    suspended: "Stopped",
    unknown: "Unknown",
};

export interface CloudStatusRow {
    label: string;
    value: string;
    tone: CloudTone;
    commit?: string;
}

const BUILD_TONES: Record<CloudBuildState, CloudTone> = { pending: "progress", running: "progress", succeeded: "ok", failed: "error", unknown: "idle" };
const DEPLOYMENT_TONES: Record<CloudDeploymentState, CloudTone> = {
    "not-deployed": "idle",
    "in-progress": "progress",
    active: "ok",
    error: "error",
    suspended: "idle",
    unknown: "idle",
};

/** One row for the latest build, then one per environment in pipeline order. */
export function cloudStatusRows(status: CloudIntegrationStatus | undefined): CloudStatusRow[] {
    if (!status) {
        return [];
    }
    const rows: CloudStatusRow[] = [];
    if (status.build) {
        const { state } = status.build;
        rows.push({
            label: "Latest build",
            value: state === "unknown" ? status.build.status || "Unknown" : BUILD_LABELS[state],
            tone: BUILD_TONES[state],
            commit: status.build.commit?.slice(0, 7),
        });
    }
    for (const env of status.environments) {
        rows.push({ label: env.environment, value: DEPLOYMENT_LABELS[env.state], tone: DEPLOYMENT_TONES[env.state], commit: env.commit?.slice(0, 7) });
    }
    return rows;
}
