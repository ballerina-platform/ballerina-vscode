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

import { BI_COMMANDS, DIRECTORY_MAP, EVENT_TYPE, MACHINE_VIEW, SCOPE, findScope, isSamePath } from "@wso2/ballerina-core";
import {
    WICommandIds,
    ICommitAndPushCmdParams,
    ICreateNewIntegrationCmdParams,
    resolveIntegrationType,
    AUTOMATION_WITH_LISTENER_WARNING,
} from "@wso2/wso2-platform-core";
import { BallerinaExtension } from "../../core";
import { openView, StateMachine } from "../../stateMachine";
import { commands, window } from "vscode";
import * as path from "path";
import * as fs from "fs";
import { debug, isInDevant } from "../../utils";
import { getPlatformExtensionAPI } from "../../utils/ai/auth";

export function activateDevantFeatures(_ballerinaExtInstance: BallerinaExtension) {
    if (isInDevant()) {
        // Set the connection token context for Devant UI features
        commands.executeCommand("setContext", "devant.editor", true);
    }

    commands.registerCommand(BI_COMMANDS.DEVANT_PUSH_TO_CLOUD, handleComponentPushToDevant);
}

const handleComponentPushToDevant = async () => {
    const projectRoot = StateMachine.context().projectPath;
    if (!projectRoot) {
        return;
    }

    const platformExtAPI = await getPlatformExtensionAPI();
    if (!platformExtAPI) {
        return;
    }
    if (isGitRepo(projectRoot)) {
        // push changes to repo if component for the directory already exists
        await commands.executeCommand(WICommandIds.CommitAndPushToGit, {
            componentPath: projectRoot,
        } as ICommitAndPushCmdParams);
    } else if (platformExtAPI.getDirectoryComponents(projectRoot)?.length) {
        debug(`project url: ${projectRoot}`);
        // push changes to repo if component for the directory already exists
        const hasChanges = await platformExtAPI.localRepoHasChanges(projectRoot);
        if (!hasChanges) {
            window.showInformationMessage("There are no new changes to push to cloud");
            return;
        }
        await commands.executeCommand(WICommandIds.CommitAndPushToGit, {
            componentPath: projectRoot,
        } as ICommitAndPushCmdParams);
    } else {
        // create a new component if it doesn't exist for the directory
        if (!StateMachine.context().projectStructure) {
            return;
        }
        const projectStructure = StateMachine.context().projectStructure.projects.find(
            (proj) => isSamePath(proj.projectPath, projectRoot)
        );
        if (!projectStructure) {
            return;
        }
        const services = projectStructure?.directoryMap[DIRECTORY_MAP.SERVICE];
        const automation = projectStructure?.directoryMap[DIRECTORY_MAP.AUTOMATION];
        const scopeSet = new Set<SCOPE>();

        if (services) {
            services.find((svc) => {
                const scope = findScope(svc?.kind, svc?.moduleName);
                if (scope) {
                    scopeSet.add(scope);
                }
            });
        }

        if (automation?.length > 0) {
            scopeSet.add(SCOPE.AUTOMATION);
        }

        let integrationType: SCOPE | undefined;

        if (scopeSet.size === 0) {
            window
                .showInformationMessage(
                    "Please add a construct and try again to deploy your integration",
                    "Add Construct"
                )
                .then((resp) => {
                    if (resp === "Add Construct") {
                        openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.BIComponentView });
                    }
                });
            return;
        }

        const resolution = resolveIntegrationType([...scopeSet]);

        if (resolution.kind === "autoPick") {
            integrationType = resolution.scope as SCOPE;
        } else if (resolution.kind === "autoPickWithWarning") {
            const choice = await window.showWarningMessage(
                AUTOMATION_WITH_LISTENER_WARNING,
                { modal: true },
                "Continue",
            );
            if (choice !== "Continue") {
                return;
            }
            integrationType = resolution.scope as SCOPE;
        } else {
            const selectedScope = await window.showQuickPick(resolution.choices, {
                placeHolder: "Multiple types of artifacts detected. Please select the artifact type to be deployed",
            });
            if (!selectedScope) {
                return;
            }
            integrationType = selectedScope as SCOPE;
        }

        const deployementParams: ICreateNewIntegrationCmdParams = {
            buildPackLang:"ballerina",
            workspaceDir: StateMachine.context().workspacePath || StateMachine.context().projectPath,
            integrations: [{
                fsPath: StateMachine.context().projectPath,
                supportedIntegrationTypes: [integrationType],
                name: projectStructure?.projectTitle || projectStructure?.projectName
            }]
        };
        commands.executeCommand(WICommandIds.CreateNewComponent, deployementParams);
    }
};


function isGitRepo(dir: string): boolean {
    let currentDir = dir;
    while (true) {
        const gitDir = path.join(currentDir, ".git");
        if (fs.existsSync(gitDir)) {
            return true;
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            // Reached the root directory
            break;
        }
        currentDir = parentDir;
    }
    return false;
}
