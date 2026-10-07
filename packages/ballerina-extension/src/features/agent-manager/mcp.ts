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
import { fetchJson, getSession } from "./auth";
import { addMissingImportsTo, AGENT_ID_ENV, envBase, localConfigValues, undeclared, writeEnvConfigurable } from "./bindings";
import { api, consoleOrgUrl, DEFAULT_ENVIRONMENT, McpProxyDetails, readManifest, updateManifest } from "./client";

const AGENT_ID_VARIABLES = {
    tokenUrl: "agentIdTokenUrl",
    clientId: "agentIdClientId",
    clientSecret: "agentIdClientSecret",
    scopes: "agentIdScopes",
};

type Endpoint = NonNullable<McpProxyDetails["endpoints"]>[number];
const NOT_IN_ENVIRONMENT = `Not set up for the ${DEFAULT_ENVIRONMENT} environment.`;

export async function listMcpProxies(projectPath: string): Promise<AgentManagerMcpProxies> {
    const session = await getSession();
    if (!session) {
        return { signedIn: false, proxies: [] };
    }
    const consoleUrl = `${consoleOrgUrl(session.consoleUrl, session.org)}/mcp-proxies`;
    try {
        const [proxies, environmentId] = await Promise.all([api.listMcpProxies(), api.getEnvironmentId(DEFAULT_ENVIRONMENT)]);
        const details = await Promise.all(proxies.map((proxy) => api.getMcpProxy(proxy.id)));
        return { signedIn: true, consoleUrl, proxies: details.map((proxy) => describe(proxy, environmentId)) };
    } catch (error) {
        return { signedIn: true, consoleUrl, proxies: [], error: error instanceof Error ? error.message : String(error) };
    }
}

function endpointFor(proxy: McpProxyDetails, environmentId?: string): Endpoint | undefined {
    return proxy.endpoints?.find((endpoint) => endpoint.environments?.some((env) => env.environmentUuid === environmentId));
}

// API-key proxies get no generated auth: ballerina/mcp can't send the custom header yet, so that stays in code.
const usesOAuth = (endpoint: Endpoint) => !!endpoint.security?.enabled && !!endpoint.security.identity?.enabled;

function describe(proxy: McpProxyDetails, environmentId?: string): AgentManagerMcpProxy {
    const endpoint = endpointFor(proxy, environmentId);
    const summary = { id: proxy.id, name: proxy.name, description: proxy.description, toolCount: endpoint?.capabilities?.tools?.length };
    return endpoint ? summary : { ...summary, unsupportedReason: NOT_IN_ENVIRONMENT };
}

async function proxyUrl(proxy: McpProxyDetails): Promise<string> {
    const host = proxy.vhost ? (/^https?:\/\//.test(proxy.vhost) ? proxy.vhost : `https://${proxy.vhost}`) : await api.getGatewayUrl(DEFAULT_ENVIRONMENT);
    return `${host.replace(/\/+$/, "")}${proxy.context.replace(/\/+$/, "")}/mcp`;
}

const urlVariableFor = (proxyId: string) => `${proxyId.replace(/[^A-Za-z0-9]+(.)?/g, (_, next: string) => next?.toUpperCase() ?? "")}McpUrl`;
const proxyEnv = (proxyId: string) => ({ url: `${envBase(proxyId)}_MCP_URL` });
// Picked but not yet saved, so not in the manifest; the open form can still list their tools.
const pickedProxies = new Set<string>();

export async function bindMcpProxy({ projectPath, proxyId }: AgentManagerMcpBindRequest): Promise<AgentManagerMcpBinding> {
    try {
        const proxy = await api.getMcpProxy(proxyId);
        const endpoint = endpointFor(proxy, await api.getEnvironmentId(DEFAULT_ENVIRONMENT));
        if (!endpoint) {
            throw new Error(NOT_IN_ENVIRONMENT);
        }
        const urlVariable = urlVariableFor(proxyId);
        const oauth = usesOAuth(endpoint);
        const created = await undeclared(projectPath, [urlVariable, ...(oauth ? Object.values(AGENT_ID_VARIABLES) : [])]);
        await writeEnvConfigurable(projectPath, urlVariable, proxyEnv(proxyId).url, await proxyUrl(proxy));
        if (oauth) {
            await writeAgentIdConfigurables(projectPath, proxyId);
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
    updateManifest(projectPath, (manifest) => ({
        ...manifest,
        mcpServers: [...(manifest.mcpServers ?? []).filter((entry) => entry.proxy !== proxyId), { proxy: proxyId, env: proxyEnv(proxyId) }],
    }));
    pickedProxies.delete(proxyId);
    return { success: true };
}

// Client ID and secret have no local value: Agent Manager injects the deployed agent's own, and local runs set them in Config.toml.
async function writeAgentIdConfigurables(projectPath: string, proxyId: string): Promise<void> {
    const proxyIds = new Set([...(readManifest(projectPath).mcpServers ?? []).map((entry) => entry.proxy), proxyId]);
    const scopes = (await Promise.all([...proxyIds].map((id) => api.listMcpProxyScopes(id).catch((): string[] => [])))).flat();
    await writeEnvConfigurable(projectPath, AGENT_ID_VARIABLES.tokenUrl, AGENT_ID_ENV.tokenUrl, await api.getTokenUrl(DEFAULT_ENVIRONMENT));
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
