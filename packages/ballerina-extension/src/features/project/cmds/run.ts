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

import { extension } from "../../../BalExtensionContext";
import { commands, Uri, window } from "vscode";
import {
    TM_EVENT_PROJECT_RUN, CMP_PROJECT_RUN, sendTelemetryEvent, sendTelemetryException
} from "../../telemetry";
import { runCommand, PROJECT_TYPE, PALETTE_COMMANDS, runCommandWithConf, MESSAGES, getRunCommand } from "./cmd-runner";
import { getCurrentBallerinaProject, getCurrentBallerinaFile, getCurrenDirectoryPath } from "../../../utils/project-utils";
import { prepareAndGenerateConfig } from '../../config-generator/configGenerator';
import { LANGUAGE } from "../../../core";
import { StateMachine } from "../../../stateMachine";
import { VisualizerWebview } from "../../../views/visualizer/webview";
import { requiresPackageSelection } from "../../../utils/command-utils";
import { confirmAndStopActiveRun } from "../integration-runner-state";
import { ensureDependenciesCompatible } from "../dependency-compatibility";

function activateRunCmdCommand() {

    commands.registerCommand(PALETTE_COMMANDS.RUN, async (filePath: Uri) => {
        let actualFilePath: string | undefined;
        if (typeof filePath === 'string') {
            actualFilePath = Uri.parse(filePath).fsPath;
        } else if (filePath instanceof Uri) {
            actualFilePath = filePath.fsPath;
        }

        let needsPackageSelection = false;
        const isActiveTextEditor = window.activeTextEditor;

        if (!actualFilePath && !isActiveTextEditor) {    
        
            const context = StateMachine.context();
            const { workspacePath, view, projectPath, projectInfo } = context;
            const isWebviewOpen = VisualizerWebview.currentPanel !== undefined;

            needsPackageSelection = requiresPackageSelection(
                workspacePath, view, projectPath, isWebviewOpen, !!isActiveTextEditor
            );
            
            if (needsPackageSelection && projectInfo?.children?.length === 0) {
                window.showErrorMessage("No integrations found in the project.");
                return;
            } else if (!needsPackageSelection && !projectPath) {
                window.showErrorMessage("No integration found.");
                return;
            }

            actualFilePath = needsPackageSelection ? workspacePath : projectPath;
        }

        prepareAndGenerateConfig(extension.ballerinaExtInstance, actualFilePath, false, false, true, needsPackageSelection);
    });

    // register ballerina run handler
    commands.registerCommand(PALETTE_COMMANDS.RUN_CMD, async (filePath: string) => {
        await run(filePath);
    });

    async function run(filePath: string) {
        try {

            sendTelemetryEvent(extension.ballerinaExtInstance, TM_EVENT_PROJECT_RUN, CMP_PROJECT_RUN);
            if (window.activeTextEditor && window.activeTextEditor.document.isDirty) {
                await commands.executeCommand(PALETTE_COMMANDS.SAVE_ALL);
            }

            let currentProject;
            if (window.activeTextEditor) {
                if (window.activeTextEditor.document.languageId != LANGUAGE.BALLERINA) {
                    window.showErrorMessage(MESSAGES.NOT_IN_PROJECT);
                    return;
                }
                currentProject = await getCurrentBallerinaProject(filePath);
            } else {
                const document = extension.ballerinaExtInstance.getDocumentContext().getLatestDocument();
                if (document) {
                    currentProject = await getCurrentBallerinaProject(document.fsPath);
                } else {
                    for (let editor of window.visibleTextEditors) {
                        if (editor.document.languageId === LANGUAGE.BALLERINA) {
                            currentProject = await getCurrentBallerinaProject(editor.document.uri.toString());
                            break;
                        }
                    }
                }
                if (!currentProject) {
                    currentProject = await getCurrentBallerinaProject(filePath);
                }
            }

            if (!currentProject) {
                window.showErrorMessage(MESSAGES.NOT_IN_PROJECT);
                return;
            }

            // TODO: Test in the cloud editor environment and remove the comments if working
            // This should be handles automatically by the platform

            // Check if we should update auth token (only in cloud editor with private package dependencies)
            // const shouldUpdate = await shouldUpdateAuthToken();
            
            // if (shouldUpdate) {
            //     try {
            //         // Get the STS token from platform extension for authenticated operations
            //         const stsToken = await getDevantStsToken();
            //         console.log("Cloud editor detected with dependencies, checking STS token...");
                    
            //         // Only update Settings.toml if token needs updating
            //         if (stsToken && stsToken.trim() !== "") {
            //             const currentToken = await getCurrentAccessToken();
                        
            //             if (shouldUpdateToken(currentToken, stsToken)) {
            //                 await updateBallerinaSettingsWithStsToken(stsToken);
            //                 console.log('Token updated in Settings.toml for cloud editor');
            //                 // Don't show notification in cloud editor to avoid noise
            //             }
            //         } else {
            //             console.warn('Unable to retrieve STS token in cloud editor environment');
            //         }
            //     } catch (error) {
            //         console.warn('Failed to update authentication token in cloud editor:', error);
            //         // Continue execution even if token update fails
            //     }
            // }

            if (currentProject.kind !== PROJECT_TYPE.SINGLE_FILE) {
                if (!await ensureDependenciesCompatible(currentProject.path!)) {
                    return;
                }
                // Per-integration restart guard (#1012): integrations run
                // concurrently; only re-running this same project prompts to
                // restart it. (No-op when invoked right after
                // restartIntegration, which clears its runner state first.)
                if (await confirmAndStopActiveRun(currentProject.path!) === "cancelled") {
                    return;
                }
                const configPath: string = extension.ballerinaExtInstance.getBallerinaConfigPath();
                extension.ballerinaExtInstance.setBallerinaConfigPath('');
                runCommandWithConf(currentProject, extension.ballerinaExtInstance.getBallerinaCmd(),
                    getRunCommand(),
                    configPath, currentProject.path!
                );
            } else {
                if (await confirmAndStopActiveRun(getCurrenDirectoryPath()) === "cancelled") {
                    return;
                }
                runCurrentFile();
            }

        } catch (error) {
            if (error instanceof Error) {
                sendTelemetryException(extension.ballerinaExtInstance, error, CMP_PROJECT_RUN);
                window.showErrorMessage(error.message);
            } else {
                window.showErrorMessage("Unkown error occurred.");
            }
        }
    }
}

function runCurrentFile() {
    runCommand(getCurrenDirectoryPath(), extension.ballerinaExtInstance.getBallerinaCmd(),
        getRunCommand(),
        getCurrentBallerinaFile());
}

export { activateRunCmdCommand };
