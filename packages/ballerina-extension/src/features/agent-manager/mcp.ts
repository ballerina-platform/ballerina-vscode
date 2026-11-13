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
    AgentManagerStatusRequest,
} from "@wso2/ballerina-core";
import { StateMachine } from "../../stateMachine";
import { AgentManagerApiError, AgentManagerSession, fetchJson, getSession } from "./auth";
import { addMissingImportsTo, AGENT_ID_ENV, envBase, localConfigValues, removeUnusedGeneratedConfigurables, serially, undeclared, writeEnvConfigurable } from "./bindings";
import { api, consoleOrgUrl, DEFAULT_ENVIRONMENT, DEFAULT_PROJECT, endpointFor, McpProxyDetails, McpProxyEndpoint, readManifest, updateManifest } from "./client";
import { pickedProviderEnvNames } from "./models";

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
        listedEnvironment = { key: environmentKey(session, project), environment, environmentId };
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

// The environment the last list load resolved, so a pick from that list doesn't look it up again; Refresh reloads it.
let listedEnvironment: { key: string; environment: string; environmentId?: string } | undefined;
const environmentKey = (session: AgentManagerSession, project: string) => `${session.instanceUrl} ${session.org} ${project}`;

async function environmentFor(session: AgentManagerSession | undefined, project: string): Promise<{ environment: string; environmentId?: string }> {
    if (session && listedEnvironment?.key === environmentKey(session, project)) {
        return listedEnvironment;
    }
    const environment = await environmentOf(project);
    return { environment, environmentId: await api.getEnvironmentId(environment) };
}

async function loadProxy(projectPath: string, org: string, id: string): Promise<McpProxyDetails> {
    try {
        const proxy = await api.getMcpProxy(id);
        // The organization route returns a project's server without its per-environment endpoints.
        return proxy.projectName ? await api.getProjectMcpProxy(proxy.projectName, id) : proxy;
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

async function proxyUrl(proxy: McpProxyDetails, gateway: Promise<string>): Promise<string> {
    const host = proxy.vhost ? (/^https?:\/\//.test(proxy.vhost) ? proxy.vhost : `https://${proxy.vhost}`) : await gateway;
    return `${host.replace(/\/+$/, "")}${proxy.context.replace(/\/+$/, "")}/mcp`;
}

// Handles may start with a digit, which a Ballerina identifier can't; envBase handles the env side the same way.
const urlVariableFor = (proxyId: string) => `${proxyId.replace(/[^A-Za-z0-9]+(.)?/g, (_, next: string) => next?.toUpperCase() ?? "").replace(/^(?=\d)/, "_")}McpUrl`;
const proxyEnv = (proxyId: string) => ({ url: `${envBase(proxyId)}_MCP_URL` });
// Picked but not yet saved, so not in the manifest; the open form can still list their tools.
const pickedProxies = new Set<string>();
// The AgentID token URL and scopes of the last pick, written after its form opens; never rejects.
let agentIdValues: Promise<void> = Promise.resolve();

export async function bindMcpProxy({ projectPath, proxyId }: AgentManagerMcpBindRequest): Promise<AgentManagerMcpBinding> {
    try {
        const session = await getSession();
        const { environment, environmentId } = await environmentFor(session, agentProject(projectPath, session?.org ?? ""));
        // Fetched alongside the proxy to save a round trip, though only a proxy without its own host uses it.
        const gateway = api.getGatewayUrl(environment);
        gateway.catch((): undefined => undefined);
        const proxy = await loadProxy(projectPath, session?.org ?? "", proxyId);
        const endpoint = endpointFor(proxy, environmentId);
        if (!endpoint) {
            throw new Error(notInEnvironment(environment));
        }
        const url = await proxyUrl(proxy, gateway);
        const urlVariable = urlVariableFor(proxyId);
        const oauth = usesOAuth(endpoint);
        const created = await serially(async () => {
            const added = await undeclared(projectPath, [urlVariable, ...(oauth ? Object.values(AGENT_ID_VARIABLES) : [])]);
            await writeEnvConfigurable(projectPath, urlVariable, proxyEnv(proxyId).url, url);
            if (oauth) {
                await declareAgentIdConfigurables(projectPath);
            }
            await addMissingImportsTo(projectPath);
            return added;
        });
        if (oauth) {
            agentIdValues = serially(() => writeAgentIdValues(projectPath, proxyId, environment)).catch((error) => {
                vscode.window.showWarningMessage(`Couldn't set the AgentID token URL and scopes for local runs: ${error instanceof Error ? error.message : String(error)}`);
            });
        }
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

// Runs after an MCP toolkit or a model provider is deleted; an unsaved pick's form may still need its configurables, so they stay meanwhile.
export function releaseConfigurables({ projectPath }: AgentManagerStatusRequest): Promise<void> {
    const keep = [...(pickedProxies.size > 0 ? Object.values(AGENT_ID_ENV) : []), ...pickedProviderEnvNames()];
    return serially(() => removeUnusedGeneratedConfigurables(projectPath, keep));
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

async function declareAgentIdConfigurables(projectPath: string): Promise<void> {
    for (const key of Object.keys(AGENT_ID_VARIABLES) as (keyof typeof AGENT_ID_VARIABLES)[]) {
        await writeEnvConfigurable(projectPath, AGENT_ID_VARIABLES[key], AGENT_ID_ENV[key]);
    }
}

// Local values only, since Agent Manager injects all four on the deployed agent; local runs set the client ID and secret in Config.toml.
async function writeAgentIdValues(projectPath: string, proxyId: string, environment: string): Promise<void> {
    const proxyIds = new Set([...(readManifest(projectPath).mcpServers ?? []).map((entry) => entry.proxy), proxyId]);
    const [scopes, tokenUrl] = await Promise.all([
        Promise.all([...proxyIds].map((id) => api.listMcpProxyScopes(id).catch((): string[] => []))),
        api.getTokenUrl(environment),
    ]);
    await writeEnvConfigurable(projectPath, AGENT_ID_VARIABLES.tokenUrl, AGENT_ID_ENV.tokenUrl, tokenUrl);
    await writeEnvConfigurable(projectPath, AGENT_ID_VARIABLES.scopes, AGENT_ID_ENV.scopes, scopes.flat().join(" "));
}

// Design-time token for listing an OAuth-secured proxy's tools, minted with the project's AgentID credentials.
export async function mcpAccessToken(serverUrl: string): Promise<string | undefined> {
    await agentIdValues;
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
