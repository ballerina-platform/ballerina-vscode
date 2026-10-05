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
import { AgentManagerBuild, AgentManagerHostingMode, AgentManagerLink } from "@wso2/ballerina-core";
import { extension } from "../../BalExtensionContext";
import { getAccessToken, getJson, getSession, httpRequest, parseJson } from "./auth";

const LINKS_KEY = "ballerina.agentManager.links";

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
        throw error instanceof AgentManagerApiError ? error : new AgentManagerApiError(503, error instanceof Error ? error.message : String(error));
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

export interface EnvironmentVariable {
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
}

export interface FileMountInput {
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
        (await request<{ agents: { name: string; provisioning: { type: string } }[] }>(
            "GET", `/projects/${project}/agents?limit=100`)).agents,
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
        }),
    createGitSecret: (name: string, username: string, password: string) =>
        request("POST", "/git-secrets", { name, type: "basic", credentials: { username, password } }),
    deleteGitSecret: (name: string) => request("DELETE", `/git-secrets/${name}`),
    hasGitSecret: async (name: string) => {
        const pageSize = 50;
        for (let offset = 0; ; offset += pageSize) {
            const page = await request<{ secrets: { name: string }[]; total: number }>(
                "GET", `/git-secrets?limit=${pageSize}&offset=${offset}`);
            if (page.secrets.some((secret) => secret.name === name)) {
                return true;
            }
            if (page.secrets.length < pageSize || offset + pageSize >= page.total) {
                return false;
            }
        }
    },
    generateToken: (link: AgentManagerLink, expiresIn: string) =>
        request<{ token: string; expires_at: number }>(
            "POST", `/projects/${link.project}/agents/${link.agent}/token?environment=${link.environment}`,
            { expires_in: expiresIn }),
    getOtelEndpoint: async (environment: string) => {
        const { gateways } = await request<{ gateways: { vhost?: string; environments?: { name: string }[] }[] }>(
            "GET", "/gateways");
        const gateway = gateways.find((g) => g.environments?.some((env) => env.name === environment)) ?? gateways[0];
        if (!gateway?.vhost) {
            throw new Error(`No gateway found for environment '${environment}'.`);
        }
        return `${gateway.vhost.replace(/\/+$/, "")}/otel`;
    },
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
            startedAt: details.startedAt,
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
    triggerBuild: (link: AgentManagerLink, commitId: string) =>
        request("POST", `/projects/${link.project}/agents/${link.agent}/builds?commitId=${encodeURIComponent(commitId)}`),
    getDeployment: async (link: AgentManagerLink) => {
        const deployments = await request<Record<string, DeploymentInfo>>(
            "GET", `/projects/${link.project}/agents/${link.agent}/deployments`);
        return deployments[link.environment];
    },
    getAutoInstrumentation: async (link: AgentManagerLink) => (await getConfigItems(link)).autoInstrumentation === true,
    getConfigState: async (link: AgentManagerLink, mountPath: string) => {
        const { env, files } = await getConfigItems(link);
        return { envKeys: env.map((item) => item.key), fileSaved: files.some((file) => file.mountPath === mountPath) };
    },
    // The PUT replaces whole sets, so everything else goes back as read: secrets by reference, system vars dropped (the server re-adds them).
    updateConfigurations: async (link: AgentManagerLink, env: EnvironmentVariable[], file?: FileMountInput, autoInstrumentation?: boolean) => {
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
            enableAutoInstrumentation: autoInstrumentation ?? current.autoInstrumentation,
            env: [...keptEnv.map(roundTrip), ...env],
            ...(file ? { files: [...keptFiles.map((item) => ({ ...roundTrip(item), mountPath: item.mountPath! })), file] } : {}),
        });
    },
    deploy: (link: AgentManagerLink, imageId: string) =>
        request("POST", `/projects/${link.project}/agents/${link.agent}/deployments`, { imageId }),
};

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
    if (!isSameSite(observerBaseUrl, instanceUrl)) {
        throw new Error(`Refusing to trust the observer at ${observerBaseUrl}: it isn't part of ${instanceUrl}.`);
    }
    return String(observerBaseUrl).replace(/\/+$/, "");
}

// Same registrable domain (last two labels) and protocol, e.g. traces.amp.localhost next to api.amp.localhost.
function isSameSite(candidate: string, trusted: string): boolean {
    try {
        const [a, b] = [new URL(candidate), new URL(trusted)];
        const site = (url: URL) => url.hostname.split(".").slice(-2).join(".");
        return a.protocol === b.protocol && site(a) === site(b);
    } catch {
        return false;
    }
}

export function consoleUrl(link: AgentManagerLink): string {
    // Prototype assumption: a self-hosted console sits next to the API as console.<domain>.
    const url = new URL(link.instanceUrl);
    url.hostname = url.hostname.replace(/^api\./, "console.");
    return `${url.origin}/org/${link.org}/project/${link.project}/agents/${link.agent}`;
}

type StoredLink = Pick<AgentManagerLink, "instanceUrl" | "org" | "project" | "agent" | "environment">;

function storedLinks(): Record<string, StoredLink> {
    return extension.context.globalState.get<Record<string, StoredLink>>(LINKS_KEY) ?? {};
}

const linkKey = (projectPath: string) => path.resolve(projectPath);

const agentModes = new Map<string, AgentManagerHostingMode>();

/** Links stay on this machine, so nothing about the instance is committed; another instance or org reads as unlinked. */
export async function readLink(projectPath: string): Promise<AgentManagerLink | undefined> {
    const session = await getSession();
    const stored = storedLinks()[linkKey(projectPath)];
    if (!session || !stored || stored.instanceUrl !== session.instanceUrl || stored.org !== session.org) {
        return undefined;
    }
    const link: AgentManagerLink = { ...stored, mode: "internal" };
    const mode = await agentMode(link);
    if (!mode) {
        return undefined;
    }
    link.mode = mode;
    link.tokenExpiresAt = mode === "external" ? apiKeyExpiry(projectPath) : undefined;
    return link;
}

async function agentMode(link: AgentManagerLink): Promise<AgentManagerHostingMode | undefined> {
    const key = `${link.instanceUrl}/${link.org}/${link.project}/${link.agent}`;
    if (!agentModes.has(key)) {
        const agent = await api.getAgent(link).catch((error) => {
            if (error instanceof AgentManagerApiError && error.status === 404) {
                return undefined;
            }
            throw error;
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

export async function writeLink(projectPath: string, link: AgentManagerLink): Promise<void> {
    const { instanceUrl, org, project, agent, environment } = link;
    await extension.context.globalState.update(LINKS_KEY, { ...storedLinks(), [linkKey(projectPath)]: { instanceUrl, org, project, agent, environment } });
}

export async function removeLink(projectPath: string): Promise<void> {
    const { [linkKey(projectPath)]: _removed, ...rest } = storedLinks();
    await extension.context.globalState.update(LINKS_KEY, rest);
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
