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

import * as fs from "fs";
import * as path from "path";
import { parse } from "@iarna/toml";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { AgentManagerBuild, AgentManagerHostingMode, AgentManagerLink } from "@wso2/ballerina-core";
import { getAccessToken, getJson, getSession, httpRequest, parseJson, CertificateError } from "./auth";

// Agent Manager deploys to the pipeline's first environment, which self-hosted AMP names 'default'.
export const DEFAULT_ENVIRONMENT = "default";
const MANIFEST_FILE = path.join(".wso2", "agent-manager.yaml");

export class AgentManagerApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
    }
}

// A network failure, including one while refreshing the token, reads as unreachable rather than signed out.
async function unreachable<T>(call: () => Promise<T>): Promise<T> {
    try {
        return await call();
    } catch (error) {
        throw error instanceof AgentManagerApiError || error instanceof CertificateError ? error : new AgentManagerApiError(503, error instanceof Error ? error.message : String(error));
    }
}

async function authorize() {
    const session = await getSession();
    const token = await unreachable(getAccessToken);
    if (!session || !token) {
        throw new AgentManagerApiError(401, "Not signed in to Agent Manager.");
    }
    return { session, token };
}

async function request<T>(method: string, apiPath: string, body?: unknown): Promise<T> {
    const { session, token } = await authorize();
    const response = await unreachable(() => httpRequest(`${session.instanceUrl}/api/v1/orgs/${session.org}${apiPath}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    }));
    const { text } = response;
    if (!response.ok) {
        let message = text;
        try {
            message = JSON.parse(text).message ?? text;
        } catch { /* plain-text error */ }
        throw new AgentManagerApiError(response.status, `${method} ${apiPath} failed (${response.status}): ${message}`);
    }
    return (text ? parseJson(apiPath, text) : undefined) as T;
}

interface AgentSummary {
    name: string;
    displayName?: string;
    provisioning: { type: string; repository?: { url?: string; branch?: string; appPath?: string } };
}

interface EnvironmentVariable {
    key: string;
    value: string;
    isSensitive?: boolean;
}

export interface InternalAgentSpec {
    name: string;
    displayName: string;
    repoUrl: string;
    branch: string;
    appPath: string;
    port: number;
    basePath: string;
    schemaPath?: string;
    secretRef?: string;
    env: EnvironmentVariable[];
    file?: FileMountInput;
    autoInstrumentation: boolean;
    modelConfig: AgentConfigInput[];
    mcpConfig: AgentConfigInput[];
}

export type AgentConfigKind = "model" | "mcp";

export interface AgentConfigInput {
    handle: string;
    env: EnvNames;
}

const envVariables = (env: EnvNames) =>
    [{ key: "url", name: env.url }, ...(env.apikey ? [{ key: "apikey", name: env.apikey }] : [])];

interface FileMountInput {
    key: string;
    mountPath: string;
    value: string;
    isSensitive: boolean;
}

interface DeploymentInfo {
    status: string;
    imageId?: string;
    lastDeployed?: string;
    endpoints?: { url: string }[];
}

export const api = {
    listProjects: async () =>
        (await request<{ projects: { name: string; displayName: string }[] }>("GET", "/projects?limit=100")).projects,
    createProject: (name: string, displayName: string) =>
        request("POST", "/projects", { name, displayName, deploymentPipeline: "default" }),
    listAgents: async (project: string) =>
        (await request<{ agents: AgentSummary[] }>("GET", `/projects/${project}/agents?limit=100`)).agents,
    listGitSecrets: async () => {
        const names: string[] = [];
        for (let offset = 0; ; offset += 50) {
            const page = await request<{ secrets: { name: string }[]; total: number }>("GET", `/git-secrets?limit=50&offset=${offset}`);
            names.push(...page.secrets.map((secret) => secret.name));
            if (page.secrets.length < 50 || names.length >= page.total) {
                return names;
            }
        }
    },
    hasGitSecret: async (name: string) => (await api.listGitSecrets()).includes(name),
    createExternalAgent: (project: string, name: string, displayName: string) =>
        request("POST", `/projects/${project}/agents`, {
            name,
            displayName,
            provisioning: { type: "external" },
            agentType: { type: "external-agent-api" },
        }),
    createInternalAgent: (project: string, spec: InternalAgentSpec) =>
        request("POST", `/projects/${project}/agents`, {
            name: spec.name,
            displayName: spec.displayName,
            agentType: { type: "agent-api", subType: "custom-api" },
            provisioning: {
                type: "internal",
                repository: { url: spec.repoUrl, branch: spec.branch, appPath: spec.appPath, secretRef: spec.secretRef ?? null },
            },
            build: { type: "buildpack", buildpack: { language: "ballerina" } },
            inputInterface: {
                type: "HTTP",
                port: spec.port,
                basePath: spec.basePath,
                ...(spec.schemaPath ? { schema: { path: spec.schemaPath } } : {}),
            },
            configurations: { env: spec.env, files: spec.file ? [spec.file] : undefined, enableAutoInstrumentation: spec.autoInstrumentation },
            modelConfig: spec.modelConfig.map((config) => ({ providerName: config.handle, environmentVariables: envVariables(config.env) })),
            mcpConfig: spec.mcpConfig.map((config) => ({ proxyName: config.handle, environmentVariables: envVariables(config.env) })),
        }),
    createGitSecret: (name: string, username: string, password: string) =>
        request("POST", "/git-secrets", { name, type: "basic-auth", credentials: { username, password } }),
    deleteGitSecret: (name: string) => request("DELETE", `/git-secrets/${name}`),
    generateToken: (link: AgentManagerLink, expiresIn: string) =>
        request<{ token: string; expires_at: number }>(
            "POST", `/projects/${link.project}/agents/${link.agent}/token?environment=${link.environment}`,
            { expires_in: expiresIn }),
    getGatewayUrl: async (environment: string) => {
        const { gateways } = await request<{ gateways: { vhost?: string; environments?: { name: string }[] }[] }>(
            "GET", "/gateways");
        const gateway = gateways.find((g) => g.environments?.some((env) => env.name === environment)) ?? gateways[0];
        if (!gateway?.vhost) {
            throw new Error(`No gateway found for environment '${environment}'.`);
        }
        return gateway.vhost.replace(/\/+$/, "");
    },
    getOtelEndpoint: async (environment: string) => `${await api.getGatewayUrl(environment)}/otel`,
    listLlmProviders: async () =>
        (await request<{ providers: { id: string; uuid: string; name: string; template: string }[] }>("GET", "/llm-providers?limit=100")).providers,
    getLlmProvider: (id: string) =>
        request<{ context: string }>("GET", `/llm-providers/${id}`),
    listMcpProxies: async () =>
        (await request<{ list: { id: string; name: string; description?: string }[] }>("GET", "/mcp-proxies?limit=100")).list,
    getMcpProxy: (id: string) => request<McpProxyDetails>("GET", `/mcp-proxies/${id}`),
    listMcpProxyScopes: async (id: string) =>
        (await request<{ scopes: { scope: string }[] }>("GET", `/mcp-proxies/${id}/scopes`)).scopes.map((entry) => entry.scope),
    getEnvironmentId: async (environment: string) =>
        (await request<{ id: string; name: string }[]>("GET", "/environments")).find((env) => env.name === environment)?.id,
    getTokenUrl: async (environment: string) => {
        const { thunderInstances } = await request<{ thunderInstances: { envName: string; tokenUrl: string }[] }>("GET", "/thunder-instances");
        const tokenUrl = thunderInstances.find((instance) => instance.envName === environment)?.tokenUrl;
        if (!tokenUrl) {
            throw new Error(`Agent Manager has no identity provider for environment '${environment}'.`);
        }
        return tokenUrl;
    },
    listAgentConfigs: async (link: AgentManagerLink, kind: AgentConfigKind) => {
        const base = `/projects/${link.project}/agents/${link.agent}/${kind}-configs`;
        const { configs } = await request<{ configs: { uuid: string }[] }>("GET", `${base}?limit=100`);
        return Promise.all(configs.map(async ({ uuid }) => {
            const config = await request<any>("GET", `${base}/${uuid}`);
            const names = Object.fromEntries((config.environmentVariables ?? []).map((v: { key: string; name: string }) => [v.key, v.name]));
            return { uuid, handle: config.envMappings?.[link.environment]?.configuration?.providerName, env: { url: names.url, apikey: names.apikey } as EnvNames };
        }));
    },
    createAgentConfig: (link: AgentManagerLink, kind: AgentConfigKind, config: AgentConfigInput) =>
        request("POST", `/projects/${link.project}/agents/${link.agent}/${kind}-configs`, {
            name: config.handle,
            type: kind === "model" ? "llm" : "mcp",
            envMappings: { [link.environment]: { providerName: config.handle } },
            environmentVariables: envVariables(config.env),
        }),
    // A rename-only PUT: the provider mapping, and so its proxy and keys, stay as they are.
    renameAgentConfigEnv: (link: AgentManagerLink, kind: AgentConfigKind, uuid: string, env: EnvNames) =>
        request("PUT", `/projects/${link.project}/agents/${link.agent}/${kind}-configs/${uuid}`, { environmentVariables: envVariables(env) }),
    deleteLlmProviderKey: (uuid: string, name: string) => request("DELETE", `/llm-providers/${uuid}/api-keys/${name}`),
    createLlmProviderKey: (uuid: string, name: string, displayName: string) =>
        request<{ apiKey?: string; message?: string }>("POST", `/llm-providers/${uuid}/api-keys`, { name, displayName }),
    getLatestBuild: async (link: AgentManagerLink): Promise<AgentManagerBuild | undefined> => {
        const base = `/projects/${link.project}/agents/${link.agent}/builds`;
        const latest = (await request<{ builds: { buildName: string }[] }>("GET", `${base}?limit=1`)).builds[0];
        if (!latest) {
            return undefined;
        }
        const details = await request<any>("GET", `${base}/${latest.buildName}`);
        return {
            name: details.buildName,
            status: details.status,
            percent: details.percent,
            steps: details.steps,
            commitId: details.buildParameters?.commitId,
            imageId: details.imageId,
        };
    },
    getAgent: (link: AgentManagerLink) =>
        request<any>("GET", `/projects/${link.project}/agents/${link.agent}`),
    updateRepository: (link: AgentManagerLink, agent: any, changes: { branch?: string; secretRef?: string }) => {
        const repository = { ...agent.provisioning.repository, ...changes };
        return request("PUT", `/projects/${link.project}/agents/${link.agent}/build-parameters`, {
            provisioning: { ...agent.provisioning, repository },
            agentType: agent.agentType,
            build: agent.build,
            inputInterface: agent.inputInterface,
        });
    },
    // Without a commit, Agent Manager builds the tip of the agent's own repository and branch.
    triggerBuild: (link: AgentManagerLink) => request("POST", `/projects/${link.project}/agents/${link.agent}/builds`),
    getDeployment: async (link: AgentManagerLink) => {
        const deployments = await request<Record<string, DeploymentInfo>>(
            "GET", `/projects/${link.project}/agents/${link.agent}/deployments`);
        return deployments[link.environment];
    },
    getConfigState: async (link: AgentManagerLink, mountPath: string) => {
        const { env, files } = await getConfigItems(link);
        return { envKeys: env.map((item) => item.key), fileSaved: files.some((file) => file.mountPath === mountPath) };
    },
    // The PUT replaces whole sets, so everything else goes back as read: secrets by reference, system vars dropped (the server re-adds them).
    updateConfigurations: async (link: AgentManagerLink, env: EnvironmentVariable[], file?: FileMountInput) => {
        const current = await getConfigItems(link);
        const addedKeys = new Set(env.map((item) => item.key));
        const keptEnv = current.env.filter((item) => !item.isSystem && !addedKeys.has(item.key));
        const keptFiles = file ? current.files.filter((item) => !(item.mountPath === file.mountPath && item.key === file.key)) : [];
        const occupied = file && keptFiles.find((item) => item.mountPath === file.mountPath || item.key === file.key);
        if (occupied) {
            throw new Error(`Agent Manager already mounts ${occupied.key} at ${occupied.mountPath}, so nothing was changed. Remove it in the console first.`);
        }
        const unsafe = [...keptEnv, ...keptFiles].find((item) => (item.isSensitive ? !item.secretRef : typeof item.value !== "string"));
        if (unsafe) {
            throw new Error(`Couldn't read the current value of ${unsafe.key}, so nothing was changed. Set the value in the Agent Manager console.`);
        }
        await request("PUT", `/projects/${link.project}/agents/${link.agent}/configurations`, {
            environmentName: link.environment,
            enableAutoInstrumentation: current.autoInstrumentation,
            env: [...keptEnv.map(roundTrip), ...env],
            ...(file ? { files: [...keptFiles.map((item) => ({ ...roundTrip(item), mountPath: item.mountPath! })), file] } : {}),
        });
    },
    deploy: (link: AgentManagerLink, imageId: string) =>
        request("POST", `/projects/${link.project}/agents/${link.agent}/deployments`, { imageId }),
};

export interface McpProxyDetails {
    id: string;
    name: string;
    description?: string;
    context: string;
    vhost?: string;
    endpoints?: {
        capabilities?: { tools?: unknown[] };
        security?: { enabled?: boolean; identity?: { enabled?: boolean } };
        environments?: { environmentUuid: string; deploymentStatus?: string }[];
    }[];
}

interface ConfigItem {
    key: string;
    value?: string;
    isSensitive?: boolean;
    secretRef?: string;
    isSystem?: boolean;
    mountPath?: string;
}

function roundTrip(item: ConfigItem) {
    return item.isSensitive ? { key: item.key, isSensitive: true, secretRef: item.secretRef } : { key: item.key, value: item.value };
}

async function getConfigItems(link: AgentManagerLink): Promise<{ env: ConfigItem[]; files: ConfigItem[]; autoInstrumentation?: boolean }> {
    const config = await request<{ configurations?: { env?: ConfigItem[]; files?: ConfigItem[] }; enableAutoInstrumentation?: boolean }>(
        "GET", `/projects/${link.project}/agents/${link.agent}/configurations?environment=${link.environment}`);
    return { env: config.configurations?.env ?? [], files: config.configurations?.files ?? [], autoInstrumentation: config.enableAutoInstrumentation };
}

export async function getRuntimeLogs(link: AgentManagerLink, sinceMinutes: number): Promise<string> {
    const { session, token } = await authorize();
    const endTime = new Date();
    const query = new URLSearchParams({
        organization: session.org,
        project: link.project,
        agent: link.agent,
        environment: link.environment,
        startTime: new Date(endTime.getTime() - sinceMinutes * 60_000).toISOString(),
        endTime: endTime.toISOString(),
        sortOrder: "asc",
    });
    const body = await getJson(`${await getObserverBaseUrl(session.instanceUrl)}/api/v1/logs?${query}`, { Authorization: `Bearer ${token}` });
    return (body.logs ?? []).map((entry: { log: string; timestamp: string }) => `${entry.timestamp}  ${entry.log}`).join("\n");
}

export async function getObserverBaseUrl(instanceUrl: string): Promise<string> {
    const { observerBaseUrl } = await getJson(`${instanceUrl}/api/v1/config`);
    return new URL(observerBaseUrl, instanceUrl).toString().replace(/\/+$/, "");
}

export function consoleOrgUrl(consoleUrl: string, org: string): string {
    return `${consoleUrl}/org/${org}`;
}

export async function consoleUrl(link: AgentManagerLink): Promise<string> {
    const session = await getSession();
    if (!session) {
        throw new Error("Sign in to Agent Manager first.");
    }
    return `${consoleOrgUrl(session.consoleUrl, link.org)}/project/${link.project}/agents/${link.agent}`;
}

export interface EnvNames {
    url: string;
    apikey?: string;
}

// Committed with the project, so it holds handles and env var names, never the instance URL or keys.
export interface Manifest {
    org?: string;
    project?: string;
    agent?: string;
    llmProviders?: { provider: string; env: EnvNames }[];
    mcpServers?: { proxy: string; env: EnvNames }[];
    autoInstrumentation?: boolean;
}

export function readManifest(projectPath: string): Manifest {
    const file = path.join(projectPath, MANIFEST_FILE);
    return fs.existsSync(file) ? parseYaml(fs.readFileSync(file, "utf-8")) ?? {} : {};
}

export function updateManifest(projectPath: string, change: (manifest: Manifest) => Manifest): void {
    const file = path.join(projectPath, MANIFEST_FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeProjectFile(projectPath, file, stringifyYaml(change(readManifest(projectPath))));
}

const agentModes = new Map<string, AgentManagerHostingMode>();

// Another org, or an agent missing on the signed-in instance, reads as unlinked.
export async function readLink(projectPath: string): Promise<AgentManagerLink | undefined> {
    const session = await getSession();
    const { org, project, agent } = readManifest(projectPath);
    if (!session || !project || !agent || org !== session.org) {
        return undefined;
    }
    const link: AgentManagerLink = { instanceUrl: session.instanceUrl, org, project, agent, environment: DEFAULT_ENVIRONMENT, mode: "internal" };
    const mode = await agentMode(link);
    return mode && { ...link, mode, tokenExpiresAt: mode === "external" ? apiKeyExpiry(projectPath) : undefined };
}

async function agentMode(link: AgentManagerLink): Promise<AgentManagerHostingMode | undefined> {
    const key = `${link.instanceUrl}/${link.org}/${link.project}/${link.agent}`;
    if (!agentModes.has(key)) {
        const agent = await api.getAgent(link).catch((error) => {
            if (!(error instanceof AgentManagerApiError && error.status === 404)) {
                throw error;
            }
        });
        if (!agent) {
            return undefined;
        }
        agentModes.set(key, agent.provisioning?.type === "external" ? "external" : "internal");
    }
    return agentModes.get(key);
}

function apiKeyExpiry(projectPath: string): number | undefined {
    try {
        const config: any = parse(fs.readFileSync(path.join(projectPath, "Config.toml"), "utf-8"));
        const payload = String(config.ballerinax?.amp?.apiKey ?? "").split(".")[1];
        return payload ? JSON.parse(Buffer.from(payload, "base64url").toString()).exp : undefined;
    } catch {
        return undefined;
    }
}

export function writeLink(projectPath: string, { org, project, agent }: AgentManagerLink): void {
    updateManifest(projectPath, (manifest) => ({ ...manifest, org, project, agent }));
}

export function removeLink(projectPath: string): void {
    updateManifest(projectPath, ({ org, project, agent, ...rest }) => rest);
}

// A repo can commit symlinks, so a write could land in a tracked file elsewhere; refuse to follow them.
export function writeProjectFile(projectPath: string, file: string, content: string, append = false): void {
    for (let current = file; current.startsWith(projectPath) && current !== projectPath; current = path.dirname(current)) {
        if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
            throw new Error(`Refusing to write ${path.relative(projectPath, file)}: ${path.relative(projectPath, current)} is a symbolic link.`);
        }
    }
    (append ? fs.appendFileSync : fs.writeFileSync)(file, content, "utf-8");
}
