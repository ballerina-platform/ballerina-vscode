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
import { AgentManagerActionResponse, AgentManagerMcpOffer } from "@wso2/ballerina-core";
import { loadMcpConfig, MCP_ENABLE_SETTING, MCP_ENABLE_SETTING_KEY, McpHttpServerConfig, updateMcpServer, writeMcpServer } from "../ai/agent/mcp";
import { forgetTokens, signInOnNextConnect } from "../ai/agent/mcp/oauth";
import { askInstance, getSession } from "./auth";
import { getObserverBaseUrl } from "./client";

// Agent Manager pre-registers one public OAuth client per MCP endpoint, each with a pinned loopback port.
const MCP_SERVERS = [
    {
        id: "agent-manager",
        label: "Agents & Deployments",
        description: "Create, build and deploy agents",
        clientId: "am-mcp",
        callbackPort: 33418,
        baseUrl: async (instanceUrl: string) => instanceUrl,
    },
    {
        id: "agent-manager-observer",
        label: "Observability",
        description: "Read logs, metrics and traces",
        clientId: "am-obs-mcp",
        callbackPort: 33419,
        baseUrl: (instanceUrl: string) => getObserverBaseUrl(instanceUrl),
    },
];

function userServerNames(): Set<string> {
    return new Set(loadMcpConfig(undefined, false).entries.map((entry) => entry.name));
}

export async function getMcpOffer(): Promise<AgentManagerMcpOffer> {
    const session = await getSession();
    const added = userServerNames();
    return {
        signedIn: !!session,
        instance: session && new URL(session.instanceUrl).host,
        servers: MCP_SERVERS.map(({ id, label, description }) => ({ id, label, description, added: added.has(id) })),
    };
}

export async function addMcpServers(ids: string[]): Promise<AgentManagerActionResponse> {
    try {
        // Each MCP server signs in on its own, so an instance URL is all that's needed here.
        const instanceUrl = (await getSession())?.instanceUrl ?? (await askInstance())?.instanceUrl;
        if (!instanceUrl) {
            return { success: false };
        }
        const existing = userServerNames();
        for (const server of MCP_SERVERS.filter((candidate) => ids.includes(candidate.id))) {
            const config: McpHttpServerConfig = {
                type: "http",
                url: `${await server.baseUrl(instanceUrl)}/mcp`,
                oauth: { clientId: server.clientId, callbackPort: server.callbackPort },
            };
            signInOnNextConnect(config.url);
            (existing.has(server.id) ? updateMcpServer : writeMcpServer)(server.id, config, "user");
        }
        await enableMcpToolsUnlessTurnedOff();
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Couldn't add Agent Manager to Copilot: ${message}`);
        return { success: false, message };
    }
}

// An explicit "off" at any level is the user's choice, so it is pointed out rather than overridden.
async function enableMcpToolsUnlessTurnedOff(): Promise<void> {
    const config = vscode.workspace.getConfiguration("ballerina");
    const { globalValue, workspaceValue, workspaceFolderValue } = config.inspect<boolean>(MCP_ENABLE_SETTING) ?? {};
    if (![globalValue, workspaceValue, workspaceFolderValue].includes(false)) {
        await config.update(MCP_ENABLE_SETTING, true, vscode.ConfigurationTarget.Global);
        return;
    }
    const open = "Open Settings";
    void vscode.window.showInformationMessage("MCP tools are turned off in your settings. Turn them on to let Copilot use Agent Manager.", open)
        .then((choice) => choice === open && vscode.commands.executeCommand("workbench.action.openSettings", MCP_ENABLE_SETTING_KEY));
}

// Signing out of Agent Manager also signs Copilot out of its servers; the servers stay and ask to sign in again.
export async function forgetCopilotMcpTokens(): Promise<void> {
    const ids = new Set(MCP_SERVERS.map((server) => server.id));
    for (const { name, config } of loadMcpConfig(undefined, false).entries) {
        const http = config as McpHttpServerConfig;
        if (ids.has(name) && http.url && http.oauth) {
            await forgetTokens(http.url, http.oauth);
        }
    }
}
