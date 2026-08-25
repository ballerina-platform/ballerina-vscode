/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { commands, languages, Uri, window, workspace } from "vscode";
import { getRunCommand, MESSAGES, PALETTE_COMMANDS, runCommand } from "./cmd-runner";
import { extension } from "../../../BalExtensionContext";
import { getConfigCompletions } from "../../config-generator/utils";
import { BiDiagramRpcManager } from "../../../rpc-managers/bi-diagram/rpc-manager";
import { findWorkspaceTypeFromWorkspaceFolders } from "../../../rpc-managers/common/utils";
import { StateMachine } from "../../../stateMachine";
import { getCurrentProjectRoot } from "../../../utils/project-utils";
import { needsProjectDiscovery, requiresPackageSelection, selectPackageOrPrompt } from "../../../utils/command-utils";
import { tryGetCurrentBallerinaFile } from "../../../utils/project-utils";
import { findBallerinaPackageRoot } from "../../../utils/file-utils";
import { discoverProjectPath } from "./doc";
import { VisualizerWebview } from "../../../views/visualizer/webview";
import { refreshDefaultProviderToken } from "../../ai/utils";

function activateConfigRunCommand() {
    // register the config view run command
    commands.registerCommand(PALETTE_COMMANDS.RUN_CONFIG, async (filePath: Uri) => {
        const currentProject = extension.ballerinaExtInstance.getDocumentContext().getCurrentProject();
        if (currentProject) {
            await refreshDefaultProviderToken(currentProject.path!);
            runCommand(currentProject, extension.ballerinaExtInstance.getBallerinaCmd(),
                getRunCommand(),
                currentProject.path!);
            return;
        }
    });

    commands.registerCommand(PALETTE_COMMANDS.CONFIG_CREATE_COMMAND, async () => {
        try {
            // Open current config.toml or create a new config.toml if it does not exist
            const result = await findWorkspaceTypeFromWorkspaceFolders();
            let { workspacePath, view: webviewType, projectPath, projectInfo } = StateMachine.context();
            const isWebviewOpen = VisualizerWebview.currentPanel !== undefined;
            const hasActiveTextEditor = !!window.activeTextEditor;
            const currentBallerinaFile = tryGetCurrentBallerinaFile();
            const projectRoot = await findBallerinaPackageRoot(currentBallerinaFile);

            let targetPath = projectPath ?? "";

            if (result.type === "MULTIPLE_PROJECTS") {
                const packageRoot = await getCurrentProjectRoot();
                if (!packageRoot) {
                    window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
                    return;
                }
                projectInfo = await StateMachine.langClient().getProjectInfo({ projectPath: packageRoot });
                targetPath = projectInfo.projectPath ?? packageRoot;
            } else if (result.type === "BALLERINA_WORKSPACE") {
                if (requiresPackageSelection(workspacePath, webviewType, projectPath, isWebviewOpen, hasActiveTextEditor)) {
                    const availablePackages = projectInfo?.children.map((child: any) => child.projectPath) ?? [];
                    const selectedPackage = await selectPackageOrPrompt(
                        availablePackages,
                        "Select the project to create Config.toml in"
                    );
                    if (!selectedPackage) {
                        return;
                    }
                    targetPath = selectedPackage;
                    await StateMachine.updateProjectRootAndInfo(selectedPackage, projectInfo);
                } else if (needsProjectDiscovery(projectInfo, projectRoot, projectPath)) {
                    targetPath = await discoverProjectPath();
                } else {
                    targetPath = await getCurrentProjectRoot();
                }
            }

            const biDiagramRpcManager = new BiDiagramRpcManager();
            await biDiagramRpcManager.openConfigToml({ filePath: targetPath });
            return;
        } catch (error) {
            if (error instanceof Error && error.message === 'No valid Ballerina project found') {
                window.showErrorMessage(error.message);
            } else {
                window.showErrorMessage("Unknown error occurred.");
            }
        }
    });

    languages.registerCompletionItemProvider({ language: 'toml' }, {
        async provideCompletionItems(document, position, token, context) {
            const currentProject = extension.ballerinaExtInstance.getDocumentContext().getCurrentProject();
            const filePath = window.activeTextEditor.document;
            const path = filePath.uri.fsPath;
            const suggestions = await getConfigCompletions(extension.ballerinaExtInstance, currentProject ? currentProject.path! : path, document, position);
            return suggestions;
        }
    });


}

export { activateConfigRunCommand };
