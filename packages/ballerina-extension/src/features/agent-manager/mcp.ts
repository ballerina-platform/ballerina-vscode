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

import * as vscode from "vscode";
import {
    AgentManagerActionResponse,
    AgentManagerMcpBindRequest,
    AgentManagerMcpBinding,
    AgentManagerMcpProxies,
    AgentManagerMcpProxy,
} from "@wso2/ballerina-core";
import { StateMachine } from "../../stateMachine";
import { AgentManagerApiError, fetchJson, getSession } from "./auth";
import { addMissingImportsTo, AGENT_ID_ENV, envBase, localConfigValues, undeclared, writeEnvConfigurable } from "./bindings";
import { api, consoleOrgUrl, DEFAULT_ENVIRONMENT, DEFAULT_PROJECT, endpointFor, McpProxyDetails, McpProxyEndpoint, readManifest, updateManifest } from "./client";

const AGENT_ID_VARIABLES = {
    tokenUrl: "agentIdTokenUrl",
    clientId: "agentIdClientId",
    clientSecret: "agentIdClientSecret",
    scopes: "agentIdScopes",
};

const notInEnvironment = (environment: string) => `Not set up for the ${environment} environment.`;

export async function listMcpProxies(projectPath: string): Promise<AgentManagerMcpProxies> {
    const session = await getSession();
    if (!session) {
        return { signedIn: false, proxies: [] };
    }
    const project = agentProject(projectPath, session.org);
    const consoleUrl = `${consoleOrgUrl(session.consoleUrl, session.orgHandle ?? session.org)}/project/${encodeURIComponent(project)}/mcp-proxies`;
    try {
        // An Agent Manager without project MCP servers has no such route.
        const [orgProxies, projectProxies, environment] = await Promise.all([
            api.listMcpProxies(),
            api.listProjectMcpProxies(project).catch(() => []),
            environmentOf(project),
        ]);
        const environmentId = await api.getEnvironmentId(environment);
        const proxies = [...orgProxies, ...projectProxies];
        // One broken proxy shouldn't hide the rest.
        const details = await Promise.allSettled([
            ...orgProxies.map((proxy) => api.getMcpProxy(proxy.id)),
            ...projectProxies.map((proxy) => api.getProjectMcpProxy(project, proxy.id)),
        ]);
        return {
            signedIn: true,
            consoleUrl,
            proxies: details.map((result, index) => result.status === "fulfilled" ? describe(result.value, environment, environmentId) : {
                id: proxies[index].id,
                name: proxies[index].name,
                description: proxies[index].description,
                unsupportedReason: "Couldn't load this MCP server from Agent Manager.",
            }),
        };
    } catch (error) {
        return { signedIn: true, consoleUrl, proxies: [], error: error instanceof Error ? error.message : String(error) };
    }
}

// The Agent Manager project the agent is linked to, whose MCP servers are listed next to the organization's.
function agentProject(projectPath: string, org: string): string {
    const manifest = readManifest(projectPath);
    return manifest.org === org && manifest.project ? manifest.project : DEFAULT_PROJECT;
}

// An Agent Manager without the pipeline route deploys to its 'default' environment.
const environmentOf = (project: string) => api.firstEnvironment(project).catch(() => DEFAULT_ENVIRONMENT);

async function loadProxy(projectPath: string, org: string, id: string): Promise<McpProxyDetails> {
    try {
        return await api.getMcpProxy(id);
    } catch (error) {
        if (error instanceof AgentManagerApiError && error.status === 404) {
            return api.getProjectMcpProxy(agentProject(projectPath, org), id);
        }
        throw error;
    }
}

// API-key proxies get no generated auth: ballerina/mcp can't send the custom header yet, so that stays in code.
const usesOAuth = (endpoint: McpProxyEndpoint) => !!endpoint.security?.enabled && !!endpoint.security.identity?.enabled;

function describe(proxy: McpProxyDetails, environment: string, environmentId?: string): AgentManagerMcpProxy {
    const endpoint = endpointFor(proxy, environmentId);
    const summary = { id: proxy.id, name: proxy.name, description: proxy.description, toolCount: endpoint?.capabilities?.tools?.length };
    return endpoint ? summary : { ...summary, unsupportedReason: notInEnvironment(environment) };
}

async function proxyUrl(proxy: McpProxyDetails, environment: string): Promise<string> {
    const host = proxy.vhost ? (/^https?:\/\//.test(proxy.vhost) ? proxy.vhost : `https://${proxy.vhost}`) : await api.getGatewayUrl(environment);
    return `${host.replace(/\/+$/, "")}${proxy.context.replace(/\/+$/, "")}/mcp`;
}

// Handles may start with a digit, which a Ballerina identifier can't; envBase handles the env side the same way.
const urlVariableFor = (proxyId: string) => `${proxyId.replace(/[^A-Za-z0-9]+(.)?/g, (_, next: string) => next?.toUpperCase() ?? "").replace(/^(?=\d)/, "_")}McpUrl`;
const proxyEnv = (proxyId: string) => ({ url: `${envBase(proxyId)}_MCP_URL` });
// Picked but not yet saved, so not in the manifest; the open form can still list their tools.
const pickedProxies = new Set<string>();

export async function bindMcpProxy({ projectPath, proxyId }: AgentManagerMcpBindRequest): Promise<AgentManagerMcpBinding> {
    try {
        const session = await getSession();
        const proxy = await loadProxy(projectPath, session?.org ?? "", proxyId);
        const environment = await environmentOf(agentProject(projectPath, session?.org ?? ""));
        const endpoint = endpointFor(proxy, await api.getEnvironmentId(environment));
        if (!endpoint) {
            throw new Error(notInEnvironment(environment));
        }
        const urlVariable = urlVariableFor(proxyId);
        const oauth = usesOAuth(endpoint);
        const created = await undeclared(projectPath, [urlVariable, ...(oauth ? Object.values(AGENT_ID_VARIABLES) : [])]);
        await writeEnvConfigurable(projectPath, urlVariable, proxyEnv(proxyId).url, await proxyUrl(proxy, environment));
        if (oauth) {
            await writeAgentIdConfigurables(projectPath, proxyId, environment);
        }
        await addMissingImportsTo(projectPath);
        pickedProxies.add(proxyId);
        const { tokenUrl, clientId: id, clientSecret: secret, scopes } = AGENT_ID_VARIABLES;
        const auth = `{tokenUrl: ${tokenUrl}, clientId: ${id}, clientSecret: ${secret}, scopes: ${scopes}, optionalParams: {"resource": ${urlVariable}}}`;
        return { success: true, created, serverUrl: urlVariable, auth: oauth ? auth : undefined };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Couldn't connect the MCP server from Agent Manager: ${message}`);
        return { success: false, message };
    }
}

// Runs once the MCP form is saved, so deploy only attaches servers the agent actually uses.
export function commitMcpProxy({ projectPath, proxyId }: AgentManagerMcpBindRequest): AgentManagerActionResponse {
    try {
        updateManifest(projectPath, (manifest) => ({
            ...manifest,
            mcpServers: [...(manifest.mcpServers ?? []).filter((entry) => entry.proxy !== proxyId), { proxy: proxyId, env: proxyEnv(proxyId) }],
        }));
        pickedProxies.delete(proxyId);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Couldn't record the MCP server in .wso2/agent-manager.yaml: ${message}`);
        return { success: false, message };
    }
    return { success: true };
}

// Client ID and secret have no local value: Agent Manager injects the deployed agent's own, and local runs set them in Config.toml.
async function writeAgentIdConfigurables(projectPath: string, proxyId: string, environment: string): Promise<void> {
    const proxyIds = new Set([...(readManifest(projectPath).mcpServers ?? []).map((entry) => entry.proxy), proxyId]);
    const scopes = (await Promise.all([...proxyIds].map((id) => api.listMcpProxyScopes(id).catch((): string[] => [])))).flat();
    await writeEnvConfigurable(projectPath, AGENT_ID_VARIABLES.tokenUrl, AGENT_ID_ENV.tokenUrl, await api.getTokenUrl(environment));
    await writeEnvConfigurable(projectPath, AGENT_ID_VARIABLES.scopes, AGENT_ID_ENV.scopes, scopes.join(" "));
    await writeEnvConfigurable(projectPath, AGENT_ID_VARIABLES.clientId, AGENT_ID_ENV.clientId);
    await writeEnvConfigurable(projectPath, AGENT_ID_VARIABLES.clientSecret, AGENT_ID_ENV.clientSecret);
}

// Design-time token for listing an OAuth-secured proxy's tools, minted with the project's AgentID credentials.
export async function mcpAccessToken(serverUrl: string): Promise<string | undefined> {
    const projectPath = StateMachine.context().projectPath;
    const proxies = new Set([...(projectPath ? readManifest(projectPath).mcpServers ?? [] : []).map((entry) => entry.proxy), ...pickedProxies]);
    if (!projectPath || proxies.size === 0) {
        return undefined;
    }
    const values = await localConfigValues(projectPath);
    const bound = [...proxies].some((proxy) => values[urlVariableFor(proxy)] === serverUrl);
    const { tokenUrl, clientId, clientSecret, scopes } = AGENT_ID_VARIABLES;
    if (!bound || !values[tokenUrl] || !values[clientId] || !values[clientSecret]) {
        return undefined;
    }
    const body = new URLSearchParams({ grant_type: "client_credentials", resource: serverUrl, ...(values[scopes] ? { scope: values[scopes] } : {}) });
    const token = await fetchJson(values[tokenUrl], {
        method: "POST",
        headers: {
            Authorization: `Basic ${Buffer.from(`${values[clientId]}:${values[clientSecret]}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
    }).catch(() => undefined);
    return token?.access_token;
}
