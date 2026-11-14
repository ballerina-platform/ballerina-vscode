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

import type { CloudDeployAction, CloudDeployResponse, CloudDeploySourceCheck, CloudDeployStatus } from "@wso2/ballerina-core";
import type { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import { includedConnections, prepItems } from "./agentManagerBackend";
import { type DeployBackend, type DeployRun, type DeployStatus, type DeployTarget, isAgentTarget, type RunStepState, type SourceCheck } from "./deployBackend";

const SOURCE_ACTION_LABELS: Record<string, string> = {
    sourceControl: "Open Source Control",
    pushChanges: "Push Changes",
    grantAccess: "Grant Access",
    authorize: "Authorize",
    manageCredentials: "Manage Credentials",
};

const stepState = (done: boolean, running: boolean): RunStepState => (done ? "done" : running ? "running" : "pending");

function ensure(result: CloudDeployResponse, fallback: string): void {
    if (!result.success) {
        throw new Error(result.message ?? fallback);
    }
}

function toRun({ integration, build, deployment }: CloudDeployStatus): DeployRun | undefined {
    const queued = !build && !deployment;
    const building = !!build && /pending|running/i.test(build.status);
    const live = deployment?.status === "ACTIVE" && !building;
    const starting = !building && deployment?.status === "IN_PROGRESS";
    if (!integration || !(queued || building || starting || live)) {
        return undefined;
    }
    return {
        live,
        steps: [
            { id: "register", state: "done" },
            { id: "clone", state: stepState(!queued && (!building || !!build?.commit), queued || building) },
            { id: "build", state: stepState(!building && !queued, building) },
            { id: "deploy", state: stepState(live, starting) },
        ],
    };
}

function builtOf({ integration, build, deployment }: CloudDeployStatus): DeployStatus["built"] {
    const buildFailed = /fail/i.test(build?.status ?? "");
    const deployFailed = deployment?.status === "ERROR";
    if (!integration || !build || !(buildFailed || (build.status === "Succeeded" && (!deployment || deployFailed)))) {
        return undefined;
    }
    const state = buildFailed ? "buildFailed" : deployFailed ? "deployFailed" : "built";
    return { branch: integration.branch ?? "", commit: build.commit ?? "", state };
}

function toStatus(status: CloudDeployStatus): DeployStatus {
    if (!status.signedIn) {
        return { signedIn: false };
    }
    const run = toRun(status);
    const { integration, deployment, source } = status;
    return {
        signedIn: true,
        account: status.account,
        run,
        deployed: run?.live && integration && deployment ? {
            name: integration.displayName,
            branch: integration.branch ?? "",
            commit: deployment.commit ?? status.build?.commit ?? "",
            environment: deployment.environment,
            endpointUrl: deployment.endpointUrl ?? "",
            deployedAt: deployment.deployedAt ? new Date(deployment.deployedAt).getTime() : Date.now(),
        } : undefined,
        built: builtOf(status),
        linked: !!integration,
        pendingChanges: !!integration && (source?.changedFiles ?? 0) + (source?.unpushedCommits ?? 0) > 0,
    };
}

const repositoryOf = (url: string) => url.replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");

function toSourceCheck(check: CloudDeploySourceCheck): SourceCheck {
    const { readiness } = check;
    return {
        remotes: check.remotes.map((url) => ({ name: url, repository: repositoryOf(url), branches: url === check.gitRemote ? check.branches : [], defaultBranch: "", isPrivate: false })),
        remote: check.gitRemote ?? "",
        branch: check.branch ?? "",
        readiness: { ...readiness, actionLabel: readiness.action && SOURCE_ACTION_LABELS[readiness.action] },
    };
}

// Every step but the read-only status runs in WSO2 Integrator, which owns WSO2 Cloud deploys; agents are prepared by Agent Manager's own code first.
export function cloudBackend(rpcClient: BallerinaRpcClient, target: DeployTarget): DeployBackend {
    const cloud = rpcClient.getPlatformRpcClient();
    const agentManager = rpcClient.getAgentManagerRpcClient();
    const action = async (projectPath: string, name: CloudDeployAction) =>
        ensure(await cloud.runCloudDeployAction({ projectPath, action: name }), "Couldn't reach WSO2 Cloud.");
    const status = (projectPath: string) => cloud.getCloudDeployStatus({ projectPath, preparation: isAgentTarget(target) });
    return {
        getStatus: async (_target, projectPath) => toStatus(await status(projectPath)),
        signIn: () => action("", "signIn"),
        signOut: () => action("", "signOut"),
        async getSource(_target, projectPath) {
            // The wizard opens on the push step, so the MCP endpoint is written before the source is committed.
            if (!isAgentTarget(target)) {
                await action(projectPath, "prepareMcpEndpoint");
            }
            const { source, preparation } = await cloud.getCloudDeployStatus({ projectPath, preparation: true });
            return {
                repository: source?.repository,
                branches: source?.branch ? [source.branch] : [],
                branch: source?.branch ?? "",
                commit: source?.commit,
                prepItems: prepItems(preparation),
                changedFiles: source?.changedFiles ?? 0,
                unpushedCommits: source?.unpushedCommits ?? 0,
            };
        },
        async prepare(_target, projectPath, skip) {
            const result = await agentManager.runAgentManagerAction({ projectPath, action: "prepare", autoInstrumentation: !skip.includes("tracing") });
            ensure(result, "Couldn't prepare the project.");
        },
        async commitAndPush(projectPath, message) {
            ensure(await agentManager.runAgentManagerAction({ projectPath, action: "commitAndPush", message }), "Couldn't push to GitHub.");
            await action(projectPath, "syncAgentConfigs");
        },
        async getForm(_target, projectPath) {
            const form = await cloud.getCloudDeployForm({ projectPath, agent: isAgentTarget(target) });
            if (form.error) {
                throw new Error(form.error);
            }
            return { ...form, remotes: [], fields: [], included: includedConnections(form.llmProviders, form.mcpServers) };
        },
        inspectSource: async (projectPath, remote, branch) =>
            toSourceCheck(await cloud.inspectCloudDeploySource({ projectPath, gitRemote: remote || undefined, branch: branch || undefined })),
        sourceAction: (projectPath, name) => action(projectPath, name as CloudDeployAction),
        deployBuild: (projectPath) => action(projectPath, "deployBuild"),
        refresh: () => action("", "refresh"),
        async deploy(_target, projectPath, input) {
            const result = await cloud.startCloudDeploy({
                projectPath, name: input.name, integrationType: input.integrationType ?? "", project: input.newProject ? undefined : input.project,
                newProject: input.newProject, gitRemote: input.remote, branch: input.branch,
            });
            ensure(result, "Couldn't deploy to WSO2 Cloud.");
        },
        link: async () => {
            throw new Error("WSO2 Cloud links an existing integration when you deploy.");
        },
    };
}

export const openCloudConsole = (rpcClient: BallerinaRpcClient, projectPath: string) =>
    rpcClient.getPlatformRpcClient().runCloudDeployAction({ projectPath, action: "openInConsole" });
