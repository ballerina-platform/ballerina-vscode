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
import { commands, window } from "vscode";
import {
    TM_EVENT_PROJECT_TEST, CMP_PROJECT_TEST, sendTelemetryEvent, sendTelemetryException
} from "../../telemetry";
import { runCommand, BALLERINA_COMMANDS, PROJECT_TYPE, PALETTE_COMMANDS, MESSAGES }
    from "./cmd-runner";
import { getCurrentBallerinaProject, getCurrentBallerinaFile, getCurrenDirectoryPath } from "../../../utils/project-utils";
import { LANGUAGE } from "../../../core";
import { refreshDefaultProviderToken } from "../../ai/utils";

export function activateTestRunner() {
    // register run project tests handler
    commands.registerCommand(PALETTE_COMMANDS.TEST, async (...args: any[]) => {
        try {
            sendTelemetryEvent(extension.ballerinaExtInstance, TM_EVENT_PROJECT_TEST, CMP_PROJECT_TEST);
            if (window.activeTextEditor && window.activeTextEditor.document.isDirty) {
                await commands.executeCommand(PALETTE_COMMANDS.SAVE_ALL);
            }

            if (window.activeTextEditor && window.activeTextEditor.document.languageId != LANGUAGE.BALLERINA) {
                window.showErrorMessage(MESSAGES.NOT_IN_PROJECT);
                return;
            }
            // get Ballerina Project path for current Ballerina file
            const currentProject = await extension.ballerinaExtInstance.getDocumentContext().isActiveDiagram() ? await
                getCurrentBallerinaProject(extension.ballerinaExtInstance.getDocumentContext().getLatestDocument()?.toString())
                : await getCurrentBallerinaProject();
            if (currentProject.kind !== PROJECT_TYPE.SINGLE_FILE) {
                if (!(await refreshDefaultProviderToken(currentProject.path!))) {
                    return;
                }
                runCommand(currentProject, extension.ballerinaExtInstance.getBallerinaCmd(), BALLERINA_COMMANDS.TEST,
                    ...args, currentProject.path!);
            } else {
                if (!(await refreshDefaultProviderToken(getCurrenDirectoryPath()))) {
                    return;
                }
                runCommand(getCurrenDirectoryPath(), extension.ballerinaExtInstance.getBallerinaCmd(),
                    BALLERINA_COMMANDS.TEST, ...args, getCurrentBallerinaFile());
            }
        } catch (error) {
            if (error instanceof Error) {
                sendTelemetryException(extension.ballerinaExtInstance, error, CMP_PROJECT_TEST);
                window.showErrorMessage(error.message);
            } else {
                window.showErrorMessage("Unkown error occurred.");
            }
        }
    });
}
