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
import { Uri } from "vscode";
import { AgentManagerLink, Diagnostics, isSamePath, SyntaxTreeResponse } from "@wso2/ballerina-core";
import { BiDiagramRpcManager } from "../../rpc-managers/bi-diagram/rpc-manager";
import { addMissingImports, checkProjectDiagnostics, removeUnusedImports } from "../../rpc-managers/ai-panel/repair-utils";
import { StateMachine } from "../../stateMachine";
import { AgentConfigInput, AgentConfigKind, api, EnvNames, readManifest, updateManifest } from "./client";
import { getProjectTomlValues } from "../../utils/config";
import { envVarRead, literalValue } from "./configurables";

// Agent Manager injects these into every platform-hosted agent; the names are fixed.
export const AGENT_ID_ENV = {
    tokenUrl: "AMP_AGENTID_TOKEN_ENDPOINT",
    clientId: "AMP_AGENTID_CLIENT_ID",
    clientSecret: "AMP_AGENTID_CLIENT_SECRET",
    scopes: "AMP_AGENTID_SCOPES",
};

// Matches Agent Manager's own env naming for a handle, e.g. "my-proxy" → "MY_PROXY".
export function envBase(handle: string): string {
    const base = handle.toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
    return /^\d/.test(base) ? `_${base}` : base;
}

export function configs(projectPath: string): { modelConfig: AgentConfigInput[]; mcpConfig: AgentConfigInput[] } {
    const { llmProviders = [], mcpServers = [] } = readManifest(projectPath);
    return toConfigs(llmProviders, mcpServers);
}

function toConfigs(llmProviders: { provider: string; env: EnvNames }[], mcpServers: { proxy: string; env: EnvNames }[]) {
    return {
        modelConfig: llmProviders.map(({ provider, env }) => ({ handle: provider, env })),
        mcpConfig: mcpServers.map(({ proxy, env }) => ({ handle: proxy, env })),
    };
}

// The code decides what an agent uses: an entry whose URL configurable nothing references is dropped from the manifest.
export async function usedConfigs(projectPath: string): Promise<{ modelConfig: AgentConfigInput[]; mcpConfig: AgentConfigInput[] }> {
    const manifest = readManifest(projectPath);
    const variables = await rootConfigVariables(projectPath).catch((): any[] | undefined => undefined);
    const inUse = async (env: EnvNames) => {
        const node = variables?.find((variable) => envVarRead(variable) === env.url);
        return !variables || (!!node && await isReferenced(projectPath, node));
    };
    const keep = async <T extends { env: EnvNames }>(entries: T[] = []) => {
        const used = await Promise.all(entries.map((entry) => inUse(entry.env)));
        return entries.filter((_, index) => used[index]);
    };
    const [llmProviders, mcpServers] = await Promise.all([keep(manifest.llmProviders), keep(manifest.mcpServers)]);
    if (llmProviders.length !== (manifest.llmProviders?.length ?? 0) || mcpServers.length !== (manifest.mcpServers?.length ?? 0)) {
        updateManifest(projectPath, (current) => ({ ...current, llmProviders, mcpServers }));
    }
    return toConfigs(llmProviders, mcpServers);
}

// Anything but the declaration counts; when the language server can't tell, the configurable is treated as used.
async function isReferenced(projectPath: string, node: any): Promise<boolean> {
    const { fileName, startLine, endLine } = node.codedata?.lineRange ?? {};
    const filePath = path.join(projectPath, fileName ?? "");
    const uri = Uri.file(filePath).toString();
    const langClient = StateMachine.langClient();
    try {
        const tree = await langClient.getSTByRange({
            documentIdentifier: { uri },
            lineRange: { start: { line: startLine.line, character: startLine.offset }, end: { line: endLine.line, character: endLine.offset } },
        }) as SyntaxTreeResponse;
        const name = (tree?.syntaxTree as any)?.typedBindingPattern?.bindingPattern?.variableName?.position;
        if (!name) {
            return true;
        }
        const references = await langClient.getReferences({
            textDocument: { uri },
            position: { line: name.startLine, character: name.startColumn },
            context: { includeDeclaration: false },
        });
        const isDeclaration = (ref: { uri: string; range: { start: { line: number; character: number } } }) =>
            isSamePath(Uri.parse(ref.uri).fsPath, filePath) && ref.range.start.line === name.startLine && ref.range.start.character === name.startColumn;
        return (references ?? []).some((ref) => !isDeclaration(ref));
    } catch {
        return true;
    }
}

// Agent Manager fills these on the deployed agent, so deploy neither asks for nor sends the configurables reading them.
export function injectedEnvNames(projectPath: string): Set<string> {
    const { modelConfig, mcpConfig } = configs(projectPath);
    const bound = [...modelConfig, ...mcpConfig].flatMap(({ env }) => [env.url, env.apikey]);
    return new Set([...Object.values(AGENT_ID_ENV), ...bound].filter(Boolean));
}

// Restores env var names renamed in Agent Manager, since the code still reads the old ones.
export async function reconcileAgentConfigs(projectPath: string, link: AgentManagerLink): Promise<void> {
    const wanted = await usedConfigs(projectPath);
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

async function packageKey(projectPath: string): Promise<string> {
    const pkg = (await getProjectTomlValues(projectPath))?.package;
    return `${pkg?.org}/${pkg?.name}`;
}

async function rootConfigVariables(projectPath: string): Promise<any[]> {
    const declared = await new BiDiagramRpcManager().getConfigVariablesV2({ projectPath, includeLibraries: false });
    return (declared?.configVariables as any)?.[await packageKey(projectPath)]?.[""] ?? [];
}

export async function localConfigValues(projectPath: string): Promise<Record<string, string | undefined>> {
    const variables = await rootConfigVariables(projectPath);
    return Object.fromEntries(variables.map((node) => [node.properties?.variable?.value, literalValue(node.properties?.configValue?.value)]));
}

// Declares or refreshes `configurable string <variable> = os:getEnv("<envVar>");`, with the local value in Config.toml.
export async function writeEnvConfigurable(projectPath: string, variable: string, envVar: string, localValue?: string): Promise<void> {
    const packageName = await packageKey(projectPath);
    const rpc = new BiDiagramRpcManager();
    const declared = await rpc.getConfigVariablesV2({ projectPath, includeLibraries: false });
    const existing = (declared?.configVariables as any)?.[packageName]?.[""]?.find((node: any) => node.properties?.variable?.value === variable);
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

export async function addMissingImportsTo(projectPath: string): Promise<void> {
    const langClient = StateMachine.langClient();
    await addMissingImports(await checkProjectDiagnostics(langClient, projectPath), langClient);
}

export async function undeclared(projectPath: string, variables: string[]): Promise<string[]> {
    const declared = await localConfigValues(projectPath);
    return variables.filter((variable) => !(variable in declared));
}

// Undoes a pick whose form closed unsaved: drops the configurables it added, then any config.bal import they leave unused.
export async function removeConfigurables(projectPath: string, variables: string[]): Promise<void> {
    const packageName = await packageKey(projectPath);
    const configFilePath = path.join(projectPath, "config.bal");
    const rpc = new BiDiagramRpcManager();
    for (const variable of variables) {
        // Each deletion shifts the file, so positions are read fresh every time.
        const declared = await rpc.getConfigVariablesV2({ projectPath, includeLibraries: false });
        const node = (declared?.configVariables as any)?.[packageName]?.[""]?.find((candidate: any) => candidate.properties?.variable?.value === variable);
        if (node) {
            await rpc.deleteConfigVariableV2({ configFilePath, configVariable: node, packageName, moduleName: "" });
        }
    }
    const langClient = StateMachine.langClient();
    const diagnostics = await checkProjectDiagnostics(langClient, projectPath).catch((): Diagnostics[] => []);
    await removeUnusedImports(diagnostics.filter((diagnostic) => isSamePath(Uri.parse(diagnostic.uri).fsPath, configFilePath)), langClient);
}
