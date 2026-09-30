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

import vscode, { window } from 'vscode';
import { ENABLE_BACKGROUND_DRIFT_CHECK } from "../../core/preferences";
import { debounce } from 'lodash';
import { StateMachine } from "../../stateMachine";
import { addConfigFile, getConfigFilePath, getLLMDiagnostics } from "./utils";
import { NLCodeActionProvider } from './nl-code-action-provider';
import { BallerinaExtension } from 'src/core';
import {
    PROGRESS_BAR_MESSAGE_FOR_DRIFT, warningMessage, WARNING_MESSAGE_DEFAULT,
    MONITERED_EXTENSIONS,
    COMMAND_SHOW_TEXT
} from './constants';
import { isSupportedSLVersion, createVersionNumber } from "../../utils";
import { CustomDiagnostic } from './custom-diagnostics';
import { resolveProjectPath } from '../../utils/project-utils';
import { MESSAGES } from '../project';

let diagnosticCollection: vscode.DiagnosticCollection;
const BALLERINA_UPDATE_13 = createVersionNumber(2201, 13, 0); // Version 2201.13.0

export function activate(ballerinaExtInstance: BallerinaExtension) {
    const backgroundDriftCheckConfig = vscode.workspace.getConfiguration().get<boolean>(ENABLE_BACKGROUND_DRIFT_CHECK);

    // Create diagnostic collection and register it
    diagnosticCollection = vscode.languages.createDiagnosticCollection('ballerina');
    ballerinaExtInstance.context.subscriptions.push(diagnosticCollection);

    const projectPath = StateMachine.context().projectPath;
    if (backgroundDriftCheckConfig) {
        if (!ballerinaExtInstance.context || projectPath == null || projectPath == "") {
            return;
        }

        const debouncedGetLLMDiagnostics = debounce(async () => {
            const result: number | null = await getLLMDiagnostics(projectPath, diagnosticCollection);
            if (result == null) {
                return;
            }

            if (result > 400 && result < 500) {
                vscode.window.showWarningMessage(warningMessage());
                return;
            }
            vscode.window.showWarningMessage(WARNING_MESSAGE_DEFAULT);
        }, 600000);

        vscode.workspace.onDidChangeTextDocument(async event => {
            const filePath = event.document.uri.fsPath; // Get the file path
            const fileExtension = filePath.substring(filePath.lastIndexOf('.')); // Extract the file extension

            // Check if the file extension is in the monitoredExtensions array
            if (MONITERED_EXTENSIONS.includes(fileExtension)) {
                debouncedGetLLMDiagnostics();
            }
        }, null, ballerinaExtInstance.context.subscriptions);

        vscode.workspace.onDidDeleteFiles(async event => {
            let isMoniteredFileGotDeleted = false;
            event.files.forEach(file => {
                const filePath = file.fsPath; // Get the file path
                const fileExtension = filePath.substring(filePath.lastIndexOf('.')); // Extract the file extension

                // Check if the file extension is in the monitoredExtensions array
                if (MONITERED_EXTENSIONS.includes(fileExtension)) {
                    isMoniteredFileGotDeleted = true;
                }
            });

            if (isMoniteredFileGotDeleted) {
                debouncedGetLLMDiagnostics();
            }
        }, null, ballerinaExtInstance.context.subscriptions);
    }

    // Register Code Action Provider after diagnostics setup
    ballerinaExtInstance.context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider('ballerina', new NLCodeActionProvider(), {
            providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
        })
    );

    ballerinaExtInstance.context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_SHOW_TEXT, async (document: vscode.TextDocument,
            diagnostic: CustomDiagnostic, newText: string, range: vscode.Range) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage("No active editor found.");
                return;
            }

            const textToReplace = document.getText(range);

            // Create a Git conflict-like view with "|||||||", "HEAD" and "======="
            const conflictText = `<<<<<<< HEAD\n${textToReplace}\n=======\n${newText}\n>>>>>>>\n`;

            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, range, conflictText);
            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage('Changes added');
        })
    );

    vscode.commands.registerCommand("ballerina.verifyDocs", async (...args: any[]) => {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: PROGRESS_BAR_MESSAGE_FOR_DRIFT,
                cancellable: false,
            },
            async () => {
                const result: number | null = await getLLMDiagnostics(projectPath, diagnosticCollection);
                if (result == null) {
                    return;
                }

                if (result > 400 && result < 500) {
                    vscode.window.showWarningMessage(warningMessage());
                    return;
                }
                vscode.window.showWarningMessage(WARNING_MESSAGE_DEFAULT);
            }
        );
    });

    vscode.commands.registerCommand("ballerina.configureDefaultModelForNaturalFunctions", async (...args: any[]) => {
        const targetPath = await resolveProjectPath("Select an integration to configure default model for natural functions");
        if (!targetPath) {
            window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
            return;
        }

        const configPath = await getConfigFilePath(ballerinaExtInstance, targetPath);
        if (configPath != null) {
            const isNaturalFunctionsAvailableInBallerinaOrg =
                isSupportedSLVersion(ballerinaExtInstance, BALLERINA_UPDATE_13);
            addConfigFile(configPath, isNaturalFunctionsAvailableInBallerinaOrg);
        }
    });
}
