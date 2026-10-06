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
    AgentManagerModelKeyRequest,
    AgentManagerModelProvider,
    AgentManagerModelProviders,
} from "@wso2/ballerina-core";
import { getSession } from "./auth";
import { addMissingImportsTo, envBase, writeEnvConfigurable } from "./bindings";
import { api, consoleOrgUrl, DEFAULT_ENVIRONMENT, updateManifest } from "./client";
import { readPackage } from "./configurables";

// The Ballerina model provider for each template, and the path its service URL must end with.
const BALLERINA_CLIENTS: Record<string, { module: string; pathSuffix: string }> = {
    anthropic: { module: "ai.anthropic", pathSuffix: "/v1" },
    openai: { module: "ai.openai", pathSuffix: "" },
    mistralai: { module: "ai.mistral", pathSuffix: "" },
    "azure-openai": { module: "ai.azure", pathSuffix: "" },
    "azureai-foundry": { module: "ai.azure", pathSuffix: "" },
    gemini: { module: "ai.google.gemini", pathSuffix: "/v1beta" },
    awsbedrock: { module: "ai.aws.bedrock", pathSuffix: "" },
};

export async function listModelProviders(): Promise<AgentManagerModelProviders> {
    const session = await getSession();
    if (!session) {
        return { signedIn: false, providers: [] };
    }
    const consoleUrl = `${consoleOrgUrl(session.instanceUrl, session.org)}/llm-providers`;
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
    if (!client) {
        return { ...summary, unsupportedReason: "Agent Builder has no model provider for this service yet." };
    }
    return { ...summary, module: client.module, pathSuffix: client.pathSuffix || undefined };
}

/** Gives a local run a provider key and URL; the deployed agent gets its own through the LLM configuration added on deploy. */
export async function createModelKey({ projectPath, providerId, urlVariable, keyVariable }: AgentManagerModelKeyRequest): Promise<AgentManagerActionResponse> {
    try {
        const pkg = readPackage(projectPath);
        const provider = (await api.listLlmProviders()).find((candidate) => candidate.id === providerId);
        if (!provider) {
            throw new Error(`The LLM provider '${providerId}' no longer exists in Agent Manager.`);
        }
        const keyName = `${pkg.name}-${keyVariable}-${Date.now().toString(36)}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
        const [{ apiKey, message }, details, gatewayUrl] = await Promise.all([
            api.createLlmProviderKey(provider.uuid, keyName, `${pkg.title ?? pkg.name} (local runs)`),
            api.getLlmProvider(providerId),
            api.getGatewayUrl(DEFAULT_ENVIRONMENT),
        ]);
        if (!apiKey) {
            throw new Error(message ?? "Agent Manager didn't return an API key.");
        }
        const env = { url: `${envBase(providerId)}_URL`, apikey: `${envBase(providerId)}_API_KEY` };
        try {
            await writeEnvConfigurable(projectPath, urlVariable, env.url, `${gatewayUrl}${details.context}`);
            await writeEnvConfigurable(projectPath, keyVariable, env.apikey, apiKey);
        } catch (error) {
            await api.deleteLlmProviderKey(provider.uuid, keyName).catch(() => undefined);
            throw error;
        }
        await addMissingImportsTo(projectPath);
        updateManifest(projectPath, (manifest) => ({
            ...manifest,
            llmProviders: [...(manifest.llmProviders ?? []).filter((entry) => entry.provider !== providerId), { provider: providerId, env }],
        }));
        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Couldn't connect the model to Agent Manager: ${message}`);
        return { success: false, message };
    }
}
