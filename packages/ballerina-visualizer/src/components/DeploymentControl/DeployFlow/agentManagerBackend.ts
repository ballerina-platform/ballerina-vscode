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

import type { AgentManagerAction, AgentManagerActionRequest, AgentManagerStatus } from "@wso2/ballerina-core";
import type { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import type { DeployBackend, DeployRun, DeployStatus, PrepItem, RunStepState } from "./deployBackend";

const short = (commit?: string) => commit?.slice(0, 7) ?? "";
const stepState = (done: boolean, running: boolean): RunStepState => (done ? "done" : running ? "running" : "pending");

function toRun({ link, build, deployment }: AgentManagerStatus): DeployRun | undefined {
    const building = !!build && /running|pending/i.test(build.status);
    const deployStatus = deployment?.status ?? "";
    const live = deployStatus === "active" && !building;
    const starting = !building && /progress|pending|deploying/i.test(deployStatus);
    if (!link || !(building || starting || live)) {
        return undefined;
    }
    const cloned = !building || build?.steps?.[0]?.status === "Succeeded";
    return {
        live,
        steps: [
            { id: "register", state: "done" },
            { id: "clone", state: stepState(cloned, building) },
            { id: "build", state: stepState(!building, cloned && building), percent: build?.percent ?? 0 },
            { id: "deploy", state: stepState(live, starting) },
        ],
    };
}

function toStatus(status: AgentManagerStatus, cloud: boolean): DeployStatus {
    if (!status.signedIn) {
        return { signedIn: false };
    }
    const run = toRun(status);
    const { deployment, link } = status;
    return {
        signedIn: true,
        account: cloud ? status.orgDisplayName || status.org : `${status.instanceUrl ? new URL(status.instanceUrl).host : ""} · ${status.org}`,
        run,
        deployed: run?.live && link && deployment?.endpointUrl ? {
            name: status.displayName ?? link.agent,
            branch: status.branch ?? "",
            commit: short(status.build?.commitId),
            environment: deployment.environment,
            endpointUrl: deployment.endpointUrl,
            deployedAt: deployment.lastDeployed ? new Date(deployment.lastDeployed).getTime() : Date.now(),
        } : undefined,
        candidates: link ? undefined : status.candidates?.map((candidate) => ({
            project: candidate.project, agent: candidate.agent, name: candidate.displayName,
            repository: candidate.repository, branch: candidate.branch ?? "",
        })),
    };
}

export function includedConnections(llmProviders: string[] = [], mcpServers: string[] = []): { label: string; value: string }[] {
    return [
        ...(llmProviders.length > 0 ? [{ label: "LLM Providers", value: llmProviders.join(", ") }] : []),
        ...(mcpServers.length > 0 ? [{ label: "MCP Servers", value: mcpServers.join(", ") }] : []),
    ];
}

export function prepItems(preparation?: { openApiSpec: boolean; gitignore: boolean; ampImport: boolean }): PrepItem[] {
    if (!preparation) {
        return [];
    }
    return [
        { id: "openapi", label: "API Definition", detail: "Lets Agent Manager expose the agent's endpoints and offer Try It.", done: !preparation.openApiSpec },
        { id: "gitignore", label: "Git Ignore Rules", detail: "Keeps build output and local configuration values out of the repository.", done: !preparation.gitignore },
        { id: "tracing", label: "Enable Auto Instrumentation", detail: "Shows the agent's conversations and tool calls under Observability.", done: !preparation.ampImport, optional: true },
    ];
}

export function agentManagerBackend(rpcClient: BallerinaRpcClient, cloud = false): DeployBackend {
    const am = rpcClient.getAgentManagerRpcClient();
    const run = async (projectPath: string, action: AgentManagerAction, extra?: Partial<AgentManagerActionRequest>) => {
        const result = await am.runAgentManagerAction({ projectPath, action, ...extra });
        if (!result.success) {
            throw new Error(result.message ?? "Cancelled.");
        }
    };
    return {
        getStatus: async (_target, projectPath) => toStatus(await am.getAgentManagerStatus({ projectPath, cloud }), cloud),
        signIn: () => run("", cloud ? "signInCloud" : "signIn"),
        signOut: () => run("", "signOut"),
        async getSource(_target, projectPath) {
            const { source } = await am.getAgentManagerStatus({ projectPath });
            return {
                repository: source?.repository,
                branches: source?.branch ? [source.branch] : [],
                branch: source?.branch ?? "",
                commit: short(source?.remoteCommit),
                prepItems: prepItems(source?.preparation),
                changedFiles: source?.changedFiles ?? 0,
                unpushedCommits: source?.unpushedCommits ?? 0,
            };
        },
        prepare: (_target, projectPath, skip) => run(projectPath, "prepare", { autoInstrumentation: !skip.includes("tracing") }),
        commitAndPush: (projectPath, message) => run(projectPath, "commitAndPush", { message }),
        async getForm(_target, projectPath) {
            const form = await am.getAgentManagerCreateForm({ projectPath });
            if (form.error) {
                throw new Error(form.error);
            }
            const ordered = [...form.remotes].sort((a, b) => Number(b.name === form.defaultRemote) - Number(a.name === form.defaultRemote));
            const remotes = await Promise.all(ordered.map(async (remote) => {
                const details = await am.getAgentManagerRepoDetails({ projectPath, remote: remote.name });
                return {
                    name: remote.name, repository: remote.repository, branches: details.branches,
                    defaultBranch: details.defaultBranch ?? details.branches[0] ?? "", isPrivate: !!details.isPrivate,
                };
            }));
            return {
                name: form.agentName,
                projects: form.projects,
                environment: form.environment,
                remotes,
                appPath: form.appPath,
                gitSecrets: form.gitSecrets,
                fields: form.fields.filter((field) => !field.unsupported).map((field) => ({
                    id: field.id, label: field.label, required: field.required && !field.saved, secret: field.secret, value: field.localValue,
                })),
                included: [{ label: "Tracing", value: form.tracing ? "On" : "Off" }, ...includedConnections(form.llmProviders, form.mcpServers)],
            };
        },
        async deploy(_target, projectPath, input) {
            if ((await am.getAgentManagerStatus({ projectPath })).link) {
                return run(projectPath, "pushAndRebuild");
            }
            const form = await am.getAgentManagerCreateForm({ projectPath });
            const secrets = Object.fromEntries(form.fields.map((field) => [field.id, field.secret]));
            const result = await am.createAgentManagerAgent({
                projectPath,
                project: input.newProject ? "" : input.project,
                newProject: input.newProject,
                agentName: input.name,
                remote: input.remote,
                branch: input.branch,
                appPath: input.appPath ?? "/",
                gitSecret: input.gitSecret,
                newToken: input.newToken,
                config: { values: input.values, secrets },
            });
            if (!result.success) {
                throw new Error(result.message ?? "Couldn't register the agent.");
            }
        },
        async link(_target, projectPath, candidate) {
            const result = await am.linkAgentManagerAgent({ projectPath, project: candidate.project, agent: candidate.agent });
            if (!result.success) {
                throw new Error(result.message ?? "Couldn't link the agent.");
            }
        },
    };
}
