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

import { hasProjectMcpConfig } from "./configLoader";

/** Key within the `ballerina` configuration section. */
export const MCP_ENABLE_SETTING = "copilot.enableMcpTools";
/** Fully qualified key, for `affectsConfiguration` checks. */
export const MCP_ENABLE_SETTING_KEY = `ballerina.${MCP_ENABLE_SETTING}`;

function readExplicitEnableSetting(): boolean | undefined {
    const inspected = vscode.workspace.getConfiguration("ballerina").inspect<boolean>(MCP_ENABLE_SETTING);
    return inspected?.workspaceFolderValue ?? inspected?.workspaceValue ?? inspected?.globalValue;
}

/**
 * MCP tool support runs when the user turned it on, or — with the setting never
 * touched — when the project ships a `.mcp.json`. An explicit setting always
 * wins, so an opt-out survives that file being present.
 *
 * The implicit path requires workspace trust: an untrusted project's `.mcp.json`
 * is never read, so treating it as an opt-in would enable nothing.
 */
export function isMcpToolsEnabled(workspacePath?: string): boolean {
    const explicit = readExplicitEnableSetting();
    if (typeof explicit === "boolean") {
        return explicit;
    }
    return vscode.workspace.isTrusted && hasProjectMcpConfig(workspacePath);
}
