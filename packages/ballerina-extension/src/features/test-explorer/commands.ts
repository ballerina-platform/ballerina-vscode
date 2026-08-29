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

import { commands, TestItem, window, workspace, WorkspaceEdit, Uri, Range } from "vscode";
import { openView, StateMachine, history } from "../../stateMachine";
import { BI_COMMANDS, EVENT_TYPE, MACHINE_VIEW, Annotation, ValueProperty, GetTestFunctionResponse, ComponentInfo, isSamePath } from "@wso2/ballerina-core";
import { isTestFunctionItem } from "./discover";
import path from "path";
import { promises as fs } from 'fs';
import { needsProjectDiscovery, requiresPackageSelection, selectPackageOrPrompt } from "../../utils/command-utils";
import { VisualizerWebview } from "../../views/visualizer/webview";
import { getCurrentProjectRoot, tryGetCurrentBallerinaFile } from "../../utils/project-utils";
import { findBallerinaPackageRoot } from "../../utils";
import { MESSAGES } from "../project";
import { BallerinaExtension } from "../../core";
import { isSupportedSLVersion, createVersionNumber } from "../../utils/config";
import { EVALUATION_GROUP } from "./activator";

export function activateEditBiTest(ballerinaExtInstance: BallerinaExtension) {
    // Check if AI Evaluation features are supported
    const isAIEvaluationSupported = isSupportedSLVersion(
        ballerinaExtInstance,
        createVersionNumber(2201, 13, 2)
    );

    // Set VS Code context for UI visibility control
    commands.executeCommand('setContext', 'ballerina.ai.evaluationSupported', isAIEvaluationSupported);
    // register run project tests handler
    commands.registerCommand(BI_COMMANDS.BI_EDIT_TEST_FUNCTION, async (entry: TestItem) => {
        const projectPath = await findProjectPath(entry.uri?.fsPath);

        if (!projectPath) {
            window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
            return;
        }

        if (!isTestFunctionItem(entry)) {
            return;
        }

        const fileName = entry.id.split(":")[2];
        const fileUri = path.resolve(projectPath, `tests`, fileName);
        if (fileUri) {
            const range = entry.range;
            openView(EVENT_TYPE.OPEN_VIEW, {
                view: MACHINE_VIEW.BIDiagram,
                documentUri: fileUri,
                identifier: entry.label,
                position: {
                    startLine: range.start.line, startColumn: range.start.character,
                    endLine: range.end.line, endColumn: range.end.character
                }
            });
            history.clear();
        }
    });

    commands.registerCommand(BI_COMMANDS.BI_ADD_TEST_FUNCTION, async (entry?: TestItem) => {
        const projectPath = await findProjectPath(entry?.uri?.fsPath);

        if (!projectPath) {
            window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
            return;
        }

        const fileUri = path.resolve(projectPath, `tests`, `tests.bal`);
        ensureFileExists(fileUri);
        openView(EVENT_TYPE.OPEN_VIEW, {
            view: MACHINE_VIEW.BITestFunctionForm,
            documentUri: fileUri, identifier: '', serviceType: 'ADD_NEW_TEST'
        });
    });

    commands.registerCommand(BI_COMMANDS.BI_ADD_AI_EVALUATION, async (entry?: TestItem) => {
        const projectPath = await findProjectPath(entry?.uri?.fsPath);

        if (!projectPath) {
            window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
            return;
        }

        const fileUri = path.resolve(projectPath, `tests`, `tests.bal`);
        ensureFileExists(fileUri);
        openView(EVENT_TYPE.OPEN_VIEW, {
            view: MACHINE_VIEW.BIAIEvaluationForm,
            documentUri: fileUri,
            identifier: '',
            serviceType: 'ADD_NEW_TEST',
            metadata: {
                featureSupport: {
                    aiEvaluation: isAIEvaluationSupported
                }
            }
        });
    });

    commands.registerCommand(BI_COMMANDS.BI_EDIT_TEST_FUNCTION_DEF, async (entry: TestItem) => {
        const fileUri = entry.uri?.fsPath;

        if (!fileUri) {
            window.showErrorMessage(MESSAGES.NO_FILE_FOUND);
            return;
        }

        if (!isTestFunctionItem(entry)) {
            return;
        }

        if (fileUri) {
            const range = entry.range;

            // Fetch the test function to check if it belongs to the "evaluations" group
            let viewToOpen = MACHINE_VIEW.BITestFunctionForm; // Default to regular test form

            try {
                const response = await ballerinaExtInstance.langClient?.getTestFunction({
                    functionName: entry.label,
                    filePath: fileUri
                });
                if (response && isValidTestFunctionResponse(response) && response.function) {
                    const isEvaluation = hasEvaluationGroup(response.function);
                    if (isEvaluation) {
                        viewToOpen = MACHINE_VIEW.BIAIEvaluationForm;
                    }
                }
            } catch (error) {
                console.warn('Failed to fetch test function, defaulting to regular test form:', error);
                // Continue with default form if fetching fails
            }

            openView(EVENT_TYPE.OPEN_VIEW, {
                view: viewToOpen,
                documentUri: fileUri,
                identifier: entry.label,
                position: {
                    startLine: range.start.line,
                    startColumn: range.start.character,
                    endLine: range.end.line,
                    endColumn: range.end.character
                },
                serviceType: 'UPDATE_TEST',
                metadata: {
                    featureSupport: {
                        aiEvaluation: isAIEvaluationSupported
                    }
                }
            });
        }
    });

    commands.registerCommand(BI_COMMANDS.BI_DELETE_TEST_FUNCTION, async (entry: TestItem) => {
        const projectPath = await findProjectPath(entry.uri?.fsPath);

        if (!projectPath) {
            window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
            return;
        }

        if (!isTestFunctionItem(entry)) {
            window.showErrorMessage('Invalid test item. Please select a test function to delete.');
            return;
        }

        // Parse test ID: test:${projectPath}:${fileName}:${functionName}
        const idParts = entry.id.split(":");
        if (idParts.length < 4) {
            window.showErrorMessage('Unable to parse test item ID.');
            return;
        }

        const fileName = idParts[2];
        const functionName = idParts[3];
        const fileUri = path.resolve(projectPath, `tests`, fileName);

        // Determine test type for confirmation message
        let testType = "test function";
        let dataProviderName: string | undefined;
        try {
            const response = await ballerinaExtInstance.langClient?.getTestFunction({
                functionName: entry.label,
                filePath: fileUri
            });

            if (response && isValidTestFunctionResponse(response) && response.function) {
                if (hasEvaluationGroup(response.function)) {
                    testType = "AI evaluation test";
                    dataProviderName = response.function.annotations
                        ?.find((a: Annotation) => a.name === 'Config')?.fields
                        ?.find((f: ValueProperty) => f.originalName === 'dataProvider')?.value as string;
                }
            }
        } catch (error) {
            console.warn('Failed to determine test type, proceeding with default:', error);
        }

        // Confirmation dialog
        const confirmation = await window.showWarningMessage(
            `Are you sure you want to delete ${testType} '${functionName}'?`,
            { modal: true },
            'Delete'
        );

        if (confirmation !== 'Delete') {
            return;
        }

        try {
            if (!entry.range) {
                window.showErrorMessage('Test function range not available. Cannot delete.');
                return;
            }

            // Create ComponentInfo from TestItem range
            const component: ComponentInfo = {
                name: functionName,
                filePath: fileUri,
                startLine: entry.range.start.line,
                startColumn: entry.range.start.character,
                endLine: entry.range.end.line,
                endColumn: entry.range.end.character
            };

            // Call language server to delete the component
            const response = await ballerinaExtInstance.langClient?.deleteByComponentInfo({
                filePath: fileUri,
                component: component
            });

            if (!response || !response.textEdits) {
                window.showErrorMessage('Failed to delete test function. No response from language server.');
                return;
            }

            // Apply the text edits returned by language server
            const edit = new WorkspaceEdit();

            for (const [filePath, edits] of Object.entries(response.textEdits)) {
                const uri = Uri.file(filePath);
                for (const textEdit of edits) {
                    edit.replace(
                        uri,
                        new Range(
                            textEdit.range.start.line,
                            textEdit.range.start.character,
                            textEdit.range.end.line,
                            textEdit.range.end.character
                        ),
                        textEdit.newText
                    );
                }
            }

            await addDataProviderDeletion(edit, ballerinaExtInstance, fileUri, dataProviderName);

            const success = await workspace.applyEdit(edit);

            if (success) {
                window.showInformationMessage(`Test function '${functionName}' deleted successfully.`);
                // File watcher automatically triggers test rediscovery
            } else {
                window.showErrorMessage(`Failed to apply deletion edits for test function '${functionName}'.`);
            }
        } catch (error) {
            window.showErrorMessage(`Error deleting test function: ${error}`);
            console.error('Delete test function error:', error);
        }
    });
}

/**
 * Type guard to check if response is a valid GetTestFunctionResponse
 * @param response The response to check
 * @returns true if response is GetTestFunctionResponse, false if NOT_SUPPORTED_TYPE
 */
function isValidTestFunctionResponse(response: any): response is GetTestFunctionResponse {
    return 'function' in response || 'errorMsg' in response || 'stacktrace' in response;
}

/**
 * Check if a test function belongs to the "evaluations" group
 * @param testFunction The test function to check
 * @returns true if the function has "evaluations" in its groups, false otherwise
 */
function hasEvaluationGroup(testFunction: any): boolean {
    if (!testFunction?.annotations) { return false; }

    // Find the Config annotation
    const configAnnotation = testFunction.annotations.find(
        (annotation: Annotation) => annotation.name === 'Config'
    );

    if (!configAnnotation?.fields) { return false; }

    // Find the groups field
    const groupsField = configAnnotation.fields.find(
        (field: ValueProperty) => field.originalName === 'groups'
    );

    if (!groupsField?.value) { return false; }
    if (!Array.isArray(groupsField.value)) { return false; }

    // Check if "evaluations" is in the groups array
    const hasEvaluation = groupsField.value.some((group: string) => {
        return group.replace(/^"|"$/g, '') === EVALUATION_GROUP;
    });
    return hasEvaluation;
}

/** Adds the removal of the data provider generated alongside an evaluation. */
async function addDataProviderDeletion(edit: WorkspaceEdit, ballerinaExtInstance: BallerinaExtension,
    fileUri: string, name?: string) {
    if (!name) { return; }
    try {
        const fn = await ballerinaExtInstance.langClient?.getTestFunction({ functionName: name, filePath: fileUri });
        const range = isValidTestFunctionResponse(fn) ? fn.function?.codedata?.lineRange : undefined;
        if (!range) { return; }

        const res = await ballerinaExtInstance.langClient?.deleteByComponentInfo({
            filePath: fileUri,
            component: {
                name, filePath: fileUri,
                startLine: range.startLine.line, startColumn: range.startLine.offset,
                endLine: range.endLine.line, endColumn: range.endLine.offset
            }
        });
        for (const [file, edits] of Object.entries(res?.textEdits ?? {})) {
            edits.forEach((e) => edit.replace(Uri.file(file), new Range(e.range.start.line,
                e.range.start.character, e.range.end.line, e.range.end.character), e.newText));
        }
    } catch (error) {
        console.warn('Failed to delete the evaluation data provider:', error);
    }
}

async function ensureFileExists(filePath: string) {
    try {
        await fs.access(filePath);
    } catch {
        // Ensure the directory exists
        await fs.mkdir(path.dirname(filePath), { recursive: true });

        await fs.writeFile(filePath, '', 'utf8');
        console.log('File created:', filePath);
    }
}

async function findProjectPath(filePath?: string): Promise<string | undefined> {
    const { projectInfo, projectPath, view, workspacePath } = StateMachine.context();

    // 1. Try resolving from provided file path
    if (filePath) {
        const projectRoot = await findBallerinaPackageRoot(filePath);
        if (projectRoot) {
            if (!projectPath || !isSamePath(projectRoot, projectPath)) {
                await StateMachine.updateProjectRootAndInfo(projectRoot, projectInfo);
            }
            return projectRoot;
        }
    }

    // 2. Try package selection if needed
    const isWebviewOpen = VisualizerWebview.currentPanel !== undefined;
    const hasActiveTextEditor = !!window.activeTextEditor;

    if (requiresPackageSelection(workspacePath, view, projectPath, isWebviewOpen, hasActiveTextEditor)) {
        const availablePackages = projectInfo?.children.map((child: any) => child.projectPath) ?? [];
        const selectedPackage = await selectPackageOrPrompt(availablePackages);
        if (selectedPackage) {
            await StateMachine.updateProjectRootAndInfo(selectedPackage, projectInfo);
            return selectedPackage;
        }
        return undefined;
    }

    // 3. Try project discovery if needed
    const currentBallerinaFile = tryGetCurrentBallerinaFile();
    const projectRoot = await findBallerinaPackageRoot(currentBallerinaFile);

    if (needsProjectDiscovery(projectInfo, projectRoot, projectPath)) {
        try {
            const packageRoot = await getCurrentProjectRoot();
            if (!packageRoot) {
                return undefined;
            }

            // Test explorer only supports build-projects and workspace-projects.
            // Single-file projects don't require discovery, so we only proceed for workspaces.
            if (!!workspacePath) {
                await StateMachine.updateProjectRootAndInfo(packageRoot, projectInfo);
                return packageRoot;
            }
        } catch {
            window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
        }
        return undefined;
    }

    return projectPath;
}
