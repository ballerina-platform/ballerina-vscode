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

import * as path from "path";
import { AgentManagerLink } from "@wso2/ballerina-core";
import { BiDiagramRpcManager } from "../../rpc-managers/bi-diagram/rpc-manager";
import { addMissingImports, checkProjectDiagnostics } from "../../rpc-managers/ai-panel/repair-utils";
import { StateMachine } from "../../stateMachine";
import { AgentConfigInput, AgentConfigKind, api, EnvNames, readManifest } from "./client";
import { literalValue, readPackage } from "./configurables";

// Agent Manager injects these into every platform-hosted agent; the names are fixed.
export const AGENT_ID_ENV = {
    tokenUrl: "AMP_AGENTID_TOKEN_ENDPOINT",
    clientId: "AMP_AGENTID_CLIENT_ID",
    clientSecret: "AMP_AGENTID_CLIENT_SECRET",
    scopes: "AMP_AGENTID_SCOPES",
};

/** Agent Manager's own naming for a handle, e.g. "my-proxy" → "MY_PROXY". */
export function envBase(handle: string): string {
    const base = handle.toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
    return /^\d/.test(base) ? `_${base}` : base;
}

export function configs(projectPath: string): { modelConfig: AgentConfigInput[]; mcpConfig: AgentConfigInput[] } {
    const { llmProviders = [], mcpServers = [] } = readManifest(projectPath);
    return {
        modelConfig: llmProviders.map(({ provider, env }) => ({ handle: provider, env })),
        mcpConfig: mcpServers.map(({ proxy, env }) => ({ handle: proxy, env })),
    };
}

/** Env vars Agent Manager fills on the deployed agent, so deploy neither asks for nor sends the configurables reading them. */
export function injectedEnvNames(projectPath: string): Set<string> {
    const { modelConfig, mcpConfig } = configs(projectPath);
    const bound = [...modelConfig, ...mcpConfig].flatMap(({ env }) => [env.url, env.apikey]);
    return new Set([...Object.values(AGENT_ID_ENV), ...bound].filter(Boolean));
}

/** Attaches every bound provider and proxy, and restores env var names renamed in Agent Manager, which the code still reads. */
export async function reconcileAgentConfigs(projectPath: string, link: AgentManagerLink): Promise<void> {
    const wanted = configs(projectPath);
    for (const kind of ["model", "mcp"] as AgentConfigKind[]) {
        const existing = await api.listAgentConfigs(link, kind);
        for (const config of kind === "model" ? wanted.modelConfig : wanted.mcpConfig) {
            const current = existing.find((candidate) => candidate.handle === config.handle);
            if (!current) {
                await api.createAgentConfig(link, kind, config);
            } else if (!sameNames(current.env, config.env)) {
                await api.renameAgentConfigEnv(link, kind, current.uuid, config.env);
            }
        }
    }
}

const sameNames = (a: EnvNames, b: EnvNames) => a.url === b.url && (!b.apikey || a.apikey === b.apikey);

/** Root-module configurable values from Config.toml, by variable name. */
export async function localConfigValues(projectPath: string): Promise<Record<string, string | undefined>> {
    const pkg = readPackage(projectPath);
    const declared = await new BiDiagramRpcManager().getConfigVariablesV2({ projectPath, includeLibraries: false });
    const variables: any[] = (declared?.configVariables as any)?.[`${pkg.org}/${pkg.name}`]?.[""] ?? [];
    return Object.fromEntries(variables.map((node) => [node.properties?.variable?.value, literalValue(node.properties?.configValue?.value)]));
}

/** Declares `configurable string <variable> = os:getEnv("<envVar>");` (or refreshes it) with the local value in Config.toml. */
export async function writeEnvConfigurable(projectPath: string, variable: string, envVar: string, localValue?: string): Promise<void> {
    const pkg = readPackage(projectPath);
    const packageName = `${pkg.org}/${pkg.name}`;
    const rpc = new BiDiagramRpcManager();
    const declared = await rpc.getConfigVariablesV2({ projectPath, includeLibraries: false });
    const existing = (declared?.configVariables as any)?.[packageName]?.[""]
        ?.find((node: any) => node.properties?.variable?.value === variable);
    const flowNode = existing ?? (await rpc.getConfigVariableNodeTemplate({ isNew: true })).flowNode;
    const set = (key: string, value: string) => {
        flowNode.properties[key] = { ...flowNode.properties[key], value, modified: true };
    };
    set("variable", variable);
    set("type", "string");
    set("defaultValue", `os:getEnv(${JSON.stringify(envVar)})`);
    if (localValue !== undefined) {
        set("configValue", JSON.stringify(localValue));
    }
    await rpc.updateConfigVariablesV2({
        configFilePath: path.join(projectPath, "config.bal"),
        configVariable: flowNode as any,
        packageName,
        moduleName: "",
    });
}

/** Adds the `ballerina/os` import the env-reading configurables need. */
export async function addMissingImportsTo(projectPath: string): Promise<void> {
    const langClient = StateMachine.langClient();
    await addMissingImports(await checkProjectDiagnostics(langClient, projectPath), langClient);
}
