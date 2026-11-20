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
export function cloudHeadline(status: CloudIntegrationStatus | null | undefined): CloudHeadline {
    if (!status) {
        return { title: "Created in WSO2 Cloud", description: IN_CLOUD, tone: "idle" };
    }
    const { build, environments } = status;
    const inEnvs = (state: CloudDeploymentState) => environments.filter((env) => env.state === state).map((env) => env.environment);
    if (build?.state === "pending" || build?.state === "running") {
        return { title: "Building in WSO2 Cloud", description: "Building the latest push.", tone: "progress" };
    }
    const rollingOut = inEnvs("in-progress");
    if (rollingOut.length > 0) {
        return { title: "Deploying in WSO2 Cloud", description: "A deployment is rolling out.", tone: "progress" };
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
        return { title: "Deployment Failed in WSO2 Cloud", description: "A deployment failed. See it in the console.", tone: "error" };
    }
    const active = inEnvs("active");
    if (active.length > 0) {
        // The first environment of the pipeline is where a new build is deployed first.
        const entry = environments[0];
        // Only when both commits are known: a release that names none may well be the latest build.
        const behind = build?.state === "succeeded" && !!build.commit && !!entry?.commit && !sameCommit(build.commit, entry.commit);
        return {
            title: "Deployed in WSO2 Cloud",
            description: behind
                ? `The latest build is not deployed to ${entry.environment} yet; deploy it from the console.`
                : "Each push builds it; deploy new builds from the console.",
            tone: "ok",
        };
    }
    if (build?.state === "succeeded") {
        return { title: "Created in WSO2 Cloud", description: "Built, and not deployed yet. Deploy it from the console.", tone: "idle" };
    }
    return { title: "Created in WSO2 Cloud", description: IN_CLOUD, tone: "idle" };
}

/** Whether something is under way, so the status is worth reading again soon. */
export function isCloudSettling(status: CloudIntegrationStatus | null | undefined): boolean {
    return (
        status?.build?.state === "pending" ||
        status?.build?.state === "running" ||
        !!status?.environments.some((env) => env.state === "in-progress")
    );
}

/** What the latest build is doing, as a line of its own. */
function buildLine(state: CloudBuildState, status: string | undefined): string {
    switch (state) {
        case "pending":
            return "Build waiting to start";
        case "running":
            return "Building";
        case "succeeded":
            return "Latest build succeeded";
        case "failed":
            return "Latest build failed";
        default:
            return `Latest build: ${status || "unknown"}`;
    }
}

/** What runs in an environment; undefined when nothing does, which is not worth a line. */
function environmentLine(state: CloudDeploymentState, environment: string): string | undefined {
    switch (state) {
        case "active":
            return `Running in ${environment}`;
        case "in-progress":
            return `Deploying to ${environment}`;
        case "error":
            return `Deployment to ${environment} failed`;
        case "suspended":
            return `Stopped in ${environment}`;
        case "unknown":
            return `Deployed to ${environment}`;
        case "unavailable":
            return `Could not read ${environment}`;
        default:
            return undefined;
    }
}

export interface CloudStatusRow {
    text: string;
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
    unavailable: "idle",
};

/** A line for the latest build, then one per environment something runs in, in pipeline order. */
export function cloudStatusRows(status: CloudIntegrationStatus | null | undefined): CloudStatusRow[] {
    if (!status) {
        return [];
    }
    const rows: CloudStatusRow[] = [];
    if (status.build) {
        const { state } = status.build;
        rows.push({ text: buildLine(state, status.build.status), tone: BUILD_TONES[state], commit: status.build.commit?.slice(0, 7) });
    }
    for (const env of status.environments) {
        const text = environmentLine(env.state, env.environment);
        if (text) {
            rows.push({ text, tone: DEPLOYMENT_TONES[env.state], commit: env.commit?.slice(0, 7) });
        }
    }
    return rows;
}

/** Said when part of the status could not be read, so what is shown is not taken for all of it. */
export function cloudStatusNote(status: CloudIntegrationStatus | null | undefined): string | undefined {
    return status?.error ? "Part of the WSO2 Cloud status could not be read." : undefined;
}

/** How long after a push the status is read often: the platform starts the build a little after the push. */
export const AFTER_PUSH_MS = 2 * 60_000;

/** How often to read the status: often while something is under way or just after a push, otherwise now and then. */
export function cloudRefetchInterval(status: CloudIntegrationStatus | null | undefined, pushedAt: number | undefined, now: number): number {
    const justPushed = pushedAt !== undefined && now - pushedAt < AFTER_PUSH_MS;
    return isCloudSettling(status) || justPushed ? 5000 : 30000;
}
