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
import { AgentManagerApiError, fetchJson, getAccessToken, getSession, requireSession } from "./auth";

// Agent Manager deploys to the pipeline's first environment, which self-hosted AMP names 'default'.
export const DEFAULT_ENVIRONMENT = "default";
const MANIFEST_FILE = path.join(".wso2", "agent-manager.yaml");
export const CONFIG_FILE = { key: "Config.toml", mountPath: "/workspace" };
// Agent Manager's rule for project, agent and git secret names.
export const MAX_RESOURCE_NAME = 25;
const RESOURCE_NAME = /^[a-z][a-z0-9-]{0,24}$/;

async function authorize() {
    const session = await getSession();
    const token = await getAccessToken();
    if (!session || !token) {
        throw new AgentManagerApiError(401, "Not signed in to Agent Manager.");
    }
    return { session, token };
}

// Manifest values reach these paths, so each segment is encoded to keep a crafted name inside its own resource.
const agentPath = (link: AgentManagerLink) => `/projects/${encodeURIComponent(link.project)}/agents/${encodeURIComponent(link.agent)}`;

async function request<T>(method: string, apiPath: string, body?: unknown): Promise<T> {
    const { session, token } = await authorize();
    return fetchJson<T>(`${session.instanceUrl}/api/v1/orgs/${encodeURIComponent(session.org)}${apiPath}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
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

interface InternalAgentSpec {
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

// The MCP proxy list caps a page at 50, so every list uses that size.
const PAGE_SIZE = 50;

async function listAll<T>(apiPath: string, items: (page: any) => T[]): Promise<T[]> {
    const all: T[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = items(await request("GET", `${apiPath}?limit=${PAGE_SIZE}&offset=${offset}`)) ?? [];
        all.push(...page);
        if (page.length < PAGE_SIZE) {
            return all;
        }
    }
}

export const api = {
    listProjects: () =>
        listAll<{ name: string; displayName: string }>("/projects", (page) => page.projects),
    createProject: (name: string, displayName: string) =>
        request("POST", "/projects", { name, displayName, deploymentPipeline: "default" }),
    listAgents: (project: string) =>
        listAll<AgentSummary>(`/projects/${encodeURIComponent(project)}/agents`, (page) => page.agents),
    listGitSecrets: async () =>
        (await listAll<{ name: string }>("/git-secrets", (page) => page.secrets)).map((secret) => secret.name),
    createExternalAgent: (project: string, name: string, displayName: string) =>
        request("POST", `/projects/${encodeURIComponent(project)}/agents`, {
            name,
            displayName,
            provisioning: { type: "external" },
            agentType: { type: "external-agent-api" },
        }),
    createInternalAgent: (project: string, spec: InternalAgentSpec) =>
        request("POST", `/projects/${encodeURIComponent(project)}/agents`, {
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
    generateToken: (link: AgentManagerLink, expiresIn: string) =>
        request<{ token: string; expires_at: number }>(
            "POST", `${agentPath(link)}/token?environment=${encodeURIComponent(link.environment)}`,
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
    listLlmProviders: () =>
        listAll<{ id: string; uuid: string; name: string; template: string }>("/llm-providers", (page) => page.providers),
    getLlmProvider: (id: string) =>
        request<{ context: string }>("GET", `/llm-providers/${encodeURIComponent(id)}`),
    listMcpProxies: () =>
        listAll<{ id: string; name: string; description?: string }>("/mcp-proxies", (page) => page.list),
    getMcpProxy: (id: string) => request<McpProxyDetails>("GET", `/mcp-proxies/${encodeURIComponent(id)}`),
    listMcpProxyScopes: async (id: string) =>
        (await request<{ scopes: { scope: string }[] }>("GET", `/mcp-proxies/${encodeURIComponent(id)}/scopes`)).scopes.map((entry) => entry.scope),
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
        const base = `${agentPath(link)}/${kind}-configs`;
        const { configs } = await request<{ configs: { uuid: string }[] }>("GET", `${base}?limit=100`);
        return Promise.all(configs.map(async ({ uuid }) => {
            const config = await request<any>("GET", `${base}/${uuid}`);
            const names = Object.fromEntries((config.environmentVariables ?? []).map((v: { key: string; name: string }) => [v.key, v.name]));
            return { uuid, handle: config.envMappings?.[link.environment]?.configuration?.providerName, env: { url: names.url, apikey: names.apikey } as EnvNames };
        }));
    },
    createAgentConfig: (link: AgentManagerLink, kind: AgentConfigKind, config: AgentConfigInput) =>
        request("POST", `${agentPath(link)}/${kind}-configs`, {
            name: config.handle,
            type: kind === "model" ? "llm" : "mcp",
            envMappings: { [link.environment]: { providerName: config.handle } },
            environmentVariables: envVariables(config.env),
        }),
    // A rename-only PUT: the provider mapping, and so its proxy and keys, stay as they are.
    renameAgentConfigEnv: (link: AgentManagerLink, kind: AgentConfigKind, uuid: string, env: EnvNames) =>
        request("PUT", `${agentPath(link)}/${kind}-configs/${uuid}`, { environmentVariables: envVariables(env) }),
    getLatestBuild: async (link: AgentManagerLink): Promise<AgentManagerBuild | undefined> => {
        const base = `${agentPath(link)}/builds`;
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
        request<any>("GET", `${agentPath(link)}`),
    // Without a commit, Agent Manager builds the tip of the agent's own repository and branch.
    triggerBuild: (link: AgentManagerLink) => request("POST", `${agentPath(link)}/builds`),
    getDeployment: async (link: AgentManagerLink) => {
        const deployments = await request<Record<string, DeploymentInfo>>(
            "GET", `${agentPath(link)}/deployments`);
        return deployments[link.environment];
    },
    // Names Agent Manager already holds values for, so the Deploy card only asks for the rest.
    getConfigState: async (link: AgentManagerLink) => {
        const config = await request<{ configurations?: { env?: { key: string }[]; files?: { mountPath?: string }[] } }>(
            "GET", `${agentPath(link)}/configurations?environment=${encodeURIComponent(link.environment)}`);
        return {
            envKeys: (config.configurations?.env ?? []).map((item) => item.key),
            fileSaved: (config.configurations?.files ?? []).some((file) => file.mountPath === CONFIG_FILE.mountPath),
        };
    },
    deploy: (link: AgentManagerLink, imageId: string) =>
        request("POST", `${agentPath(link)}/deployments`, { imageId }),
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

export async function getObserverBaseUrl(instanceUrl: string): Promise<string> {
    const { observerBaseUrl } = await fetchJson(`${instanceUrl}/api/v1/config`);
    return new URL(observerBaseUrl, instanceUrl).toString().replace(/\/+$/, "");
}

export function consoleOrgUrl(consoleUrl: string, org: string): string {
    return `${consoleUrl}/org/${encodeURIComponent(org)}`;
}

export async function consoleUrl(link: AgentManagerLink): Promise<string> {
    return `${consoleOrgUrl((await requireSession()).consoleUrl, link.org)}/project/${encodeURIComponent(link.project)}/agents/${encodeURIComponent(link.agent)}`;
}

export interface EnvNames {
    url: string;
    apikey?: string;
}

// Committed with the project, so it holds handles and env var names, never the instance URL or keys.
interface Manifest {
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
    fs.writeFileSync(file, stringifyYaml(change(readManifest(projectPath))));
}

const agentModes = new Map<string, AgentManagerHostingMode>();

// Another org, a name Agent Manager couldn't have issued, or an agent missing on the signed-in instance, reads as unlinked.
export async function readLink(projectPath: string): Promise<AgentManagerLink | undefined> {
    const session = await getSession();
    const { org, project = "", agent = "" } = readManifest(projectPath);
    if (!session || org !== session.org || !RESOURCE_NAME.test(project) || !RESOURCE_NAME.test(agent)) {
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
