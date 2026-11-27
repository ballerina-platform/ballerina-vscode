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

import { SyntaxTree } from "@wso2/ballerina-core";
import { CaptureBindingPattern, ModulePart, STKindChecker } from "@wso2/syntax-tree";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Uri, WorkspaceEdit, workspace } from "vscode";
import { StateMachine } from "../../../stateMachine";
import { getRepoRoot, ProxyConfigEnvVars } from "../platform-utils";

/** Devant's name, as WSO2 Integrator reports the platform in its configuration. */
export const DEVANT_PLATFORM = "devant";

/** The header Devant's gateway takes an API key in. */
export const DEVANT_API_KEY_HEADER = "Choreo-API-Key";

const importBalHttp = () => `import ballerina/http;\n`;

/** The proxy configurables a connection to an organization or project service routes through in a local run. */
const proxyConfigurable = () => `
configurable string? ${ProxyConfigEnvVars.proxyHost.varName} = ();
configurable int? ${ProxyConfigEnvVars.proxyPort.varName} = ();
http:ProxyConfig? ${ProxyConfigEnvVars.proxyConfig.varName} = ${ProxyConfigEnvVars.proxyHost.varName} is string && ${ProxyConfigEnvVars.proxyPort.varName} is int ? { host: <string> ${ProxyConfigEnvVars.proxyHost.varName}, port: <int> ${ProxyConfigEnvVars.proxyPort.varName} } : ();
\n`;

/** Adds the proxy configurables to `config.bal`, with the http import, unless they are there. */
export const addProxyConfigurable = async (configBalFileUri: Uri) => {
    const configBalEdits = new WorkspaceEdit();

    const syntaxTree = (await StateMachine.context().langClient.getSyntaxTree({
        documentIdentifier: { uri: configBalFileUri.toString() },
    })) as SyntaxTree;
    if (
        !(syntaxTree?.syntaxTree as ModulePart)?.imports?.some((item) => item.source?.includes("import ballerina/http"))
    ) {
        configBalEdits.insert(configBalFileUri, new vscode.Position(0, 0), importBalHttp());
    }

    if (
        !(syntaxTree?.syntaxTree as ModulePart)?.members?.find(
            (member) =>
                STKindChecker.isModuleVarDecl(member) &&
                (member.typedBindingPattern?.bindingPattern as CaptureBindingPattern)?.variableName?.value ===
                    ProxyConfigEnvVars.proxyConfig.varName,
        )
    ) {
        const newConfigEditLine = (syntaxTree?.syntaxTree?.position?.endLine ?? 0) + 1;
        configBalEdits.insert(configBalFileUri, new vscode.Position(newConfigEditLine, 0), proxyConfigurable());
    }

    await workspace.applyEdit(configBalEdits);
};

/** Whether the repository holding `projectPath` has a context file, `.wso2/context.yaml` or the older `.choreo/context.yaml`. */
export const hasDevantContextYaml = (projectPath: string): boolean => {
    try {
        const repoRoot = getRepoRoot(projectPath);
        if (!repoRoot) {
            return false;
        }
        return [".wso2", ".choreo"].some((dir) => fs.existsSync(path.join(repoRoot, dir, "context.yaml")));
    } catch {
        return false;
    }
};
