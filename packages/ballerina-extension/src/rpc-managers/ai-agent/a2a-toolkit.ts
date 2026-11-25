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
import { A2aConfigurable } from "@wso2/ballerina-core";
import { BiDiagramRpcManager } from "../bi-diagram/rpc-manager";
import { getProjectTomlValues } from "../../utils/config";

/**
 * Adds `name` to the value of an agent's `tools` property, which is either the list's source text or the form's list
 * of entries. A name that is already there is left alone.
 */
export function addToolToList(tools: unknown, name: string): unknown {
    if (Array.isArray(tools)) {
        if (!tools.some((tool: any) => tool.value === name)) {
            tools.push({ metadata: { label: name, description: "" }, value: name, optional: false, editable: false });
        }
        return tools;
    }
    const entries = typeof tools === "string" ? toolNames(tools) : [];
    return `[${[...entries.filter((entry) => entry !== name), name].join(", ")}]`;
}

/** The entries of a list's source text such as `[a, b]`; anything that isn't a list has none. */
export function toolNames(list: string): string[] {
    const inner = list.trim().replace(/^\[/, "").replace(/\]$/, "");
    return inner.split(",").map((entry) => entry.trim()).filter(Boolean);
}

/**
 * Declares each configurable in `config.bal`, and writes its value to Config.toml when it has one. A configurable
 * that is already declared keeps its place and takes the new default and value.
 */
export async function declareConfigurables(projectPath: string, configurables: A2aConfigurable[]): Promise<void> {
    if (configurables.length === 0) {
        return;
    }
    const pkg = (await getProjectTomlValues(projectPath))?.package;
    const packageName = `${pkg?.org}/${pkg?.name}`;
    const rpc = new BiDiagramRpcManager();
    for (const configurable of configurables) {
        // Each write shifts config.bal, so what is declared is read fresh every time.
        const declared = await rpc.getConfigVariablesV2({ projectPath, includeLibraries: false });
        const existing = (declared?.configVariables as any)?.[packageName]?.[""]
            ?.find((node: any) => node.properties?.variable?.value === configurable.name);
        const flowNode = existing ?? (await rpc.getConfigVariableNodeTemplate({ isNew: true })).flowNode;
        const set = (key: string, value: string) => {
            flowNode.properties[key] = { ...flowNode.properties[key], value, modified: true };
        };
        set("variable", configurable.name);
        set("type", "string");
        set("defaultValue", configurable.defaultValue ?? "");
        if (configurable.configValue !== undefined) {
            set("configValue", JSON.stringify(configurable.configValue));
        }
        await rpc.updateConfigVariablesV2({
            configFilePath: path.join(projectPath, "config.bal"),
            configVariable: flowNode as any,
            packageName,
            moduleName: "",
        });
    }
}
