'use strict';
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

import { tests, workspace, TestRunProfileKind, TestController, Uri, window, commands } from "vscode";
import { BallerinaExtension } from "../../core";
import { runHandler } from "./runner";
import { activateEditBiTest } from "./commands";
import { createNewEvalset, createNewThread, deleteEvalset, deleteThread } from "./evalset-commands";
import { discoverTestFunctionsInProject, debouncedHandleFileChange, handleFileDelete as handleTestFileDelete } from "./discover";
import { extension } from "../../BalExtensionContext";
import { getCurrentBallerinaProject, getWorkspaceRoot } from "../../utils/project-utils";
import { checkIsBallerinaPackage, checkIsBallerinaWorkspace } from "../../utils";
import { hasMultipleBallerinaPackages } from "../../utils/config";
import { PROJECT_TYPE } from "../project";
import { EvalsetTreeDataProvider } from "./evalset-tree-view";
import { openView } from "../../stateMachine";
import { EvalSet, EVENT_TYPE, MACHINE_VIEW } from "@wso2/ballerina-core";
import * as fs from 'fs';
import { EvaluationHistoryWebview } from '../../views/evaluation-history/webview';

export let testController: TestController;

export const EVALUATION_GROUP = 'evaluations';

export function refreshTestsForFile(filePath: string) {
    if (!testController) {
        return;
    }
    debouncedHandleFileChange(extension.ballerinaExtInstance, Uri.file(filePath), testController);
}

export async function activate(ballerinaExtInstance: BallerinaExtension) {
    // Register command to open evalset viewer
    const openEvalsetCommand = commands.registerCommand('ballerina.openEvalsetViewer', async (uri: Uri, threadId?: string) => {
        try {
            const content = await fs.promises.readFile(uri.fsPath, 'utf-8');
            const evalsetData = JSON.parse(content) as EvalSet;

            openView(EVENT_TYPE.OPEN_VIEW, {
                view: MACHINE_VIEW.EvalsetViewer,
                evalsetData: {
                    filePath: uri.fsPath,
                    content: evalsetData,
                    threadId: threadId
                }
            });
        } catch (error) {
            console.error('Error opening evalset:', error);
            window.showErrorMessage(`Failed to open evalset: ${error}`);
        }
    });

    // Register command to save evalset changes
    const saveEvalThreadCommand = commands.registerCommand('ballerina.saveEvalThread', async (data: { filePath: string, updatedEvalSet: EvalSet }) => {
        try {
            const { filePath, updatedEvalSet } = data;

            // Write the updated evalset back to the file
            await fs.promises.writeFile(
                filePath,
                JSON.stringify(updatedEvalSet, null, 2),
                'utf-8'
            );

            window.showInformationMessage('Evalset saved successfully');
            return { success: true };
        } catch (error) {
            console.error('Error saving evalset:', error);
            window.showErrorMessage(`Failed to save evalset: ${error}`);
            return { success: false, error: String(error) };
        }
    });

    // Register command to open evaluation history summary webview
    // When invoked from the test explorer inline button, the TestItem is passed as the first arg.
    const openEvalHistoryCommand = commands.registerCommand('ballerina.openEvaluationHistory', async (testItem?: any) => {
        // Try to resolve the project path from the argument
        let projectPath: string | undefined;
        if (typeof testItem === 'string') {
            projectPath = testItem;
        } else if (testItem?.uri?.fsPath) {
            projectPath = testItem.uri.fsPath;
        } else if (testItem?.parent?.uri?.fsPath) {
            projectPath = testItem.parent.uri.fsPath;
        }

        if (!projectPath) {
            projectPath = getWorkspaceRoot();
        }
        if (!projectPath) {
            window.showErrorMessage('No workspace found');
            return;
        }
        await EvaluationHistoryWebview.createOrShow(projectPath);
    });

    // Register commands for creating evalsets and threads
    const createEvalsetCommand = commands.registerCommand('ballerina.createNewEvalset', createNewEvalset);
    const createThreadCommand = commands.registerCommand('ballerina.createNewThread', createNewThread);
    const deleteEvalsetCommand = commands.registerCommand('ballerina.deleteEvalset', deleteEvalset);
    const deleteThreadCommand = commands.registerCommand('ballerina.deleteThread', deleteThread);

    testController = tests.createTestController('ballerina-integrator-tests', 'WSO2 Integrator Tests');

    const workspaceRoot = getWorkspaceRoot();

    if (!workspaceRoot) {
        return;
    }

    const isBallerinaWorkspace = await checkIsBallerinaWorkspace(Uri.file(workspaceRoot));
    const isBallerinaProject = !isBallerinaWorkspace && await checkIsBallerinaPackage(Uri.file(workspaceRoot));
    const isMultiProjectWorkspace = !isBallerinaWorkspace && !isBallerinaProject && await hasMultipleBallerinaPackages(Uri.file(workspaceRoot));
    const currentProject = !isBallerinaWorkspace && !isBallerinaProject && !isMultiProjectWorkspace && await getCurrentBallerinaProject();
    const isSingleFile = currentProject && currentProject.kind === PROJECT_TYPE.SINGLE_FILE;

    if (!isBallerinaWorkspace && !isBallerinaProject && !isMultiProjectWorkspace && !isSingleFile) {
        return;
    }

    // Make evalset view visible — this runs only after we've confirmed a valid Ballerina project context
    commands.executeCommand('setContext', 'hasEvalsetSupport', true);

    // Create and register Evalset TreeView
    const evalsetTreeDataProvider = new EvalsetTreeDataProvider();
    const evalsetTreeView = window.createTreeView('ballerina-evalsets', {
        treeDataProvider: evalsetTreeDataProvider,
        showCollapseAll: true
    });

    // Create test profiles to display.
    testController.createRunProfile('Run Tests', TestRunProfileKind.Run, runHandler, true);
    testController.createRunProfile('Debug Tests', TestRunProfileKind.Debug, runHandler, true);

    // Register a file watcher for test files
    const fileWatcher = workspace.createFileSystemWatcher('**/tests/**/*.bal');

    // Handle file creation, modification, and deletion
    fileWatcher.onDidCreate((uri) => debouncedHandleFileChange(ballerinaExtInstance, uri, testController));
    fileWatcher.onDidChange((uri) => debouncedHandleFileChange(ballerinaExtInstance, uri, testController));
    fileWatcher.onDidDelete((uri) => handleTestFileDelete(uri, testController));

    // Initial test discovery
    discoverTestFunctionsInProject(ballerinaExtInstance, testController);

    // Register the test controller and file watcher with the extension context
    ballerinaExtInstance.context?.subscriptions.push(testController, fileWatcher, evalsetTreeView, evalsetTreeDataProvider, openEvalsetCommand, saveEvalThreadCommand, createEvalsetCommand, createThreadCommand, deleteEvalsetCommand, deleteThreadCommand, openEvalHistoryCommand);

    activateEditBiTest(ballerinaExtInstance);
}


