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

import {
    AgentManagerActionResponse,
    AgentManagerCreateForm,
    AgentManagerCreateRequest,
    AgentManagerLinkRequest,
    AgentManagerRepoDetails,
    AgentManagerRepoRequest,
    AgentManagerSourceCheck,
    AgentManagerSourceCheckRequest,
} from "@wso2/ballerina-core";
import { getSession } from "./auth";
import { configs } from "./bindings";
import { api, DEFAULT_ENVIRONMENT, readManifest, writeLink } from "./client";
import { CONFIG_FILE } from "./configurables";
import {
    chooseGitSecret, ensureDevTracingOff, repoSecretName, saveRepoToken, hasAmpImport, loadConfigFields, prepareHttpInterface, readPackageTitle, readPreparation, requireHttpEntryPoint,
    resolveConfig, respond, toResourceName, warnIfDefaultModelProvider,
} from "./flows";
import { checkPushed, defaultRemote, githubRemotes, readFacts, repoDetails } from "./github";

async function requireSession() {
    const session = await getSession();
    if (!session) {
        throw new Error("Sign in to Agent Manager first.");
    }
    return session;
}

export function linkAgent({ projectPath, project, agent }: AgentManagerLinkRequest): Promise<AgentManagerActionResponse> {
    return respond(async () => {
        const { instanceUrl, org } = await requireSession();
        writeLink(projectPath, { instanceUrl, org, project, agent, environment: DEFAULT_ENVIRONMENT, mode: "internal" });
        return `Linked to '${agent}' in ${project}.`;
    });
}

export async function getCreateForm(projectPath: string): Promise<AgentManagerCreateForm> {
    const remotes = githubRemotes(projectPath);
    const { llmProviders = [], mcpServers = [] } = readManifest(projectPath);
    const form: AgentManagerCreateForm = {
        projects: [],
        agentName: readPackageTitle(projectPath),
        remotes,
        defaultRemote: defaultRemote(projectPath, remotes),
        appPath: readFacts(projectPath).appPath ?? "/",
        gitSecrets: [],
        tracing: hasAmpImport(projectPath),
        llmProviders: llmProviders.map((entry) => entry.provider),
        mcpServers: mcpServers.map((entry) => entry.proxy),
        environment: DEFAULT_ENVIRONMENT,
        fields: [],
    };
    try {
        requireHttpEntryPoint(projectPath);
        const [session, projects, gitSecrets, config] = await Promise.all([
            requireSession(), api.listProjects(), api.listGitSecrets(), loadConfigFields(projectPath),
        ]);
        return { ...form, org: session.org, projects, gitSecrets, fields: config.fields };
    } catch (error) {
        return { ...form, error: error instanceof Error ? error.message : String(error) };
    }
}

export async function getRepoDetails({ projectPath, remote }: AgentManagerRepoRequest): Promise<AgentManagerRepoDetails> {
    const repository = githubRemotes(projectPath).find((candidate) => candidate.name === remote)?.repository;
    return { ...await repoDetails(projectPath, remote), secretName: repository && repoSecretName(repository) };
}

export async function checkSource({ projectPath, remote, branch, appPath }: AgentManagerSourceCheckRequest): Promise<AgentManagerSourceCheck> {
    return checkPushed(projectPath, remote, branch, appPath, (await readPreparation(projectPath)).buildFiles);
}

export function createAgent(request: AgentManagerCreateRequest): Promise<AgentManagerActionResponse> {
    const { projectPath, remote, branch, appPath } = request;
    return respond(async () => {
        const { instanceUrl, org } = await requireSession();
        const repository = githubRemotes(projectPath).find((candidate) => candidate.name === remote)?.repository;
        if (!repository) {
            throw new Error(`The remote '${remote}' no longer points at a GitHub repository.`);
        }
        const check = await checkSource(request);
        if (!check.ok) {
            throw new Error(check.message);
        }
        await ensureDevTracingOff(projectPath);
        await warnIfDefaultModelProvider(projectPath);
        const project = request.newProject ? toResourceName(request.newProject) : request.project;
        if (request.newProject) {
            await api.createProject(project, request.newProject);
        }
        const name = toResourceName(request.agentName);
        if ((await api.listAgents(project)).some((agent) => agent.name === name)) {
            throw new Error(`'${name}' already exists in ${project}. Link it from the Deploy panel instead.`);
        }
        const iface = await prepareHttpInterface(projectPath);
        const isPrivate = (await repoDetails(projectPath, remote)).isPrivate !== false;
        const secretRef = request.gitSecret
            ?? (isPrivate ? (request.newToken ? await saveRepoToken(repository, request.newToken) : await chooseGitSecret(repository)) : undefined);
        // Required values left empty are set later; the Deploy card lists what the agent still needs.
        const split = resolveConfig((await loadConfigFields(projectPath)).fields, request.config, true);
        await api.createInternalAgent(project, {
            name,
            displayName: request.agentName,
            repoUrl: `https://github.com/${repository}`,
            branch,
            appPath,
            port: iface.port,
            basePath: iface.basePath,
            schemaPath: iface.schemaPath,
            secretRef,
            autoInstrumentation: hasAmpImport(projectPath),
            env: split.env,
            file: split.file && { ...CONFIG_FILE, ...split.file },
            ...configs(projectPath),
        });
        writeLink(projectPath, { instanceUrl, org, project, agent: name, environment: DEFAULT_ENVIRONMENT, mode: "internal" });
        return `'${name}' created in Agent Manager. Building ${branch} from ${repository}.`;
    });
}
