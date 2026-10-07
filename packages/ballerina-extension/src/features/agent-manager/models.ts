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
    AgentManagerBindResult,
    AgentManagerModelBindRequest,
    AgentManagerModelProvider,
    AgentManagerModelProviders,
} from "@wso2/ballerina-core";
import { getSession } from "./auth";
import { addMissingImportsTo, envBase, undeclared, writeEnvConfigurable } from "./bindings";
import { api, consoleOrgUrl, DEFAULT_ENVIRONMENT, updateManifest } from "./client";

// The Ballerina model provider for each template, and the path its service URL must end with.
const BALLERINA_CLIENTS: Record<string, { module: string; pathSuffix?: string }> = {
    anthropic: { module: "ai.anthropic", pathSuffix: "/v1" },
    openai: { module: "ai.openai" },
    mistralai: { module: "ai.mistral" },
    "azure-openai": { module: "ai.azure" },
    "azureai-foundry": { module: "ai.azure" },
    gemini: { module: "ai.google.gemini", pathSuffix: "/v1beta" },
    awsbedrock: { module: "ai.aws.bedrock" },
};

export async function listModelProviders(): Promise<AgentManagerModelProviders> {
    const session = await getSession();
    if (!session) {
        return { signedIn: false, providers: [] };
    }
    const consoleUrl = `${consoleOrgUrl(session.consoleUrl, session.org)}/llm-providers`;
    try {
        const [providers, gatewayUrl] = await Promise.all([api.listLlmProviders(), api.getGatewayUrl(DEFAULT_ENVIRONMENT)]);
        return { signedIn: true, consoleUrl, providers: await Promise.all(providers.map((provider) => describe(provider, gatewayUrl))) };
    } catch (error) {
        return { signedIn: true, consoleUrl, providers: [], error: error instanceof Error ? error.message : String(error) };
    }
}

async function describe(provider: { id: string; name: string; template: string }, gatewayUrl: string): Promise<AgentManagerModelProvider> {
    const details = await api.getLlmProvider(provider.id);
    const client = BALLERINA_CLIENTS[provider.template];
    const summary = { id: provider.id, name: provider.name, template: provider.template, url: `${gatewayUrl}${details.context}` };
    return client ? { ...summary, ...client } : { ...summary, unsupportedReason: "Agent Builder has no model provider for this service yet." };
}

const providerEnv = (providerId: string) => ({ url: `${envBase(providerId)}_URL`, apikey: `${envBase(providerId)}_API_KEY` });

// Declares the configurables the form's fields point at; the deploy entry waits for the form to be saved.
export async function bindModelProvider({ projectPath, providerId, urlVariable, keyVariable }: AgentManagerModelBindRequest): Promise<AgentManagerBindResult> {
    try {
        const [details, gatewayUrl] = await Promise.all([api.getLlmProvider(providerId), api.getGatewayUrl(DEFAULT_ENVIRONMENT)]);
        const env = providerEnv(providerId);
        const created = await undeclared(projectPath, [urlVariable, keyVariable]);
        await writeEnvConfigurable(projectPath, urlVariable, env.url, `${gatewayUrl}${details.context}`);
        await writeEnvConfigurable(projectPath, keyVariable, env.apikey);
        await addMissingImportsTo(projectPath);
        return { success: true, created };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Couldn't connect the model to Agent Manager: ${message}`);
        return { success: false, message };
    }
}

// The deployed agent gets its key through the LLM configuration added on deploy; local runs use a key the user creates.
export async function commitModelProvider({ projectPath, providerId, keyVariable }: AgentManagerModelBindRequest): Promise<AgentManagerActionResponse> {
    updateManifest(projectPath, (manifest) => ({
        ...manifest,
        llmProviders: [...(manifest.llmProviders ?? []).filter((entry) => entry.provider !== providerId), { provider: providerId, env: providerEnv(providerId) }],
    }));
    const open = "Open in Console";
    vscode.window.showInformationMessage(
        `To run this agent locally, create an API key for ${providerId} in Agent Manager and set ${keyVariable} in Config.toml.`, open
    ).then(async (choice) => {
        const session = choice && await getSession();
        const providers = session ? await api.listLlmProviders().catch(() => []) : [];
        const uuid = providers.find((provider) => provider.id === providerId)?.uuid;
        if (session && uuid) {
            vscode.env.openExternal(vscode.Uri.parse(`${consoleOrgUrl(session.consoleUrl, session.org)}/llm-providers/view/${uuid}`));
        }
    });
    return { success: true };
}
