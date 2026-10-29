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

import * as vscode from 'vscode';
import { AIPanelPrompt, EVENT_TYPE, MACHINE_VIEW, ProjectInfo, SHARED_COMMANDS } from '@wso2/ballerina-core';
import { closeAIWebview, openAIWebview } from './aiMachine';
import { BallerinaExtension } from '../../core';
import { notifyAiWebview } from '../../RPCLayer';
// TODO(auto-memory): temporarily disabled for this release — restore once the memory feature is refined.
// import { initAutoDream, setDreamSettingsProvider, setDreamCallbacks, setMemorySettingsProvider } from '../../features/ai/memory/autoDream';
import { openView, StateMachine } from '../../stateMachine';
import { MESSAGES } from '../../features/project/cmds/cmd-runner';
import { VisualizerWebview } from '../visualizer/webview';
import { selectPackageOrPrompt, needsProjectDiscovery, requiresPackageSelection } from '../../utils/command-utils';
import { getCurrentProjectRoot, tryGetCurrentBallerinaFile } from '../../utils/project-utils';
import { findBallerinaPackageRoot } from '../../utils';
import { findWorkspaceTypeFromWorkspaceFolders } from '../../rpc-managers/common/utils';
import { AiPanelWebview } from './webview';
import { setCompanionTextEditor, setCompanionVisualizer } from './activeFileContext';
import { chatStateStorage } from './chatStateStorage';
import { sendGenerationStatusNotification } from '../../features/ai/utils/ai-utils';
import { approvalViewManager } from '../../features/ai/state/ApprovalViewManager';

export function activateAiPanel(ballerinaExtInstance: BallerinaExtension) {
    setCompanionTextEditor(vscode.window.activeTextEditor);
    ballerinaExtInstance.context.subscriptions.push({
        dispose: chatStateStorage.onGenerationStatusChanged((generationId, status) => {
            sendGenerationStatusNotification(generationId, status);
            if (status === 'accepted' || status === 'reverted') {
                approvalViewManager.clearReviewData(generationId);
            }
        })
    });
    ballerinaExtInstance.context.subscriptions.push(
        vscode.commands.registerCommand(SHARED_COMMANDS.OPEN_AI_PANEL, handleOpenAIPanel)
    );
    ballerinaExtInstance.context.subscriptions.push(
        vscode.commands.registerCommand(SHARED_COMMANDS.CLOSE_AI_PANEL, () => {
            closeAIWebview();
        })
    );
    ballerinaExtInstance.context.subscriptions.push(
        vscode.window.onDidChangeActiveColorTheme((_event) => {
            notifyAiWebview();
        })
    );
    ballerinaExtInstance.context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            // VS Code reports undefined when focus moves into a webview. Retain
            // the preceding surface so the AI panel can describe what is beside it.
            if (editor) {
                setCompanionTextEditor(editor);
            }
        })
    );

    // TODO(auto-memory): auto-memory / auto-dream wiring temporarily disabled for this release — restore once the memory feature is refined.
    // // Wire VS Code settings providers (read dynamically so toggling takes effect without restart)
    // setMemorySettingsProvider(() => ({
    //     autoMemoryEnabled: vscode.workspace.getConfiguration('ballerina.ai.autoMemory').get<boolean>('enabled', false),
    // }));
    // setDreamSettingsProvider(() => ({
    //     autoDreamEnabled: vscode.workspace.getConfiguration('ballerina.ai.autoDream').get<boolean>('enabled', true),
    // }));
    //
    // // Status bar for auto-dream visibility
    // const dreamStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    // dreamStatusBar.tooltip = 'WSO2 Integrator Copilot memory consolidation';
    // ballerinaExtInstance.context.subscriptions.push(dreamStatusBar);
    //
    // let dreamHideTimeout: ReturnType<typeof setTimeout> | undefined;
    //
    // setDreamCallbacks({
    //     onDreamStart: () => {
    //         // Cancel any pending hide from a previous dream's completion timer
    //         // so the spinning indicator is not hidden while a new dream is running.
    //         clearTimeout(dreamHideTimeout);
    //         dreamHideTimeout = undefined;
    //         dreamStatusBar.text = '$(sync~spin) Copilot Dreaming...';
    //         dreamStatusBar.show();
    //     },
    //     onDreamComplete: () => {
    //         dreamStatusBar.text = '$(check) Memory updated';
    //         dreamStatusBar.show();
    //         dreamHideTimeout = setTimeout(() => dreamStatusBar.hide(), 5_000);
    //     },
    //     onDreamFail: () => {
    //         clearTimeout(dreamHideTimeout);
    //         dreamHideTimeout = undefined;
    //         dreamStatusBar.hide();
    //     },
    // });
    //
    // // Initialise background memory consolidation
    // initAutoDream();
    //
    // // Clear the dream-status timer on extension deactivation
    // ballerinaExtInstance.context.subscriptions.push({
    //     dispose: () => {
    //         clearTimeout(dreamHideTimeout);
    //         dreamHideTimeout = undefined;
    //     },
    // });

    console.log("AI Panel Activated");
}

// --- AI Panel Command Helpers ---

async function handleOpenAIPanel(defaultPrompt?: AIPanelPrompt): Promise<void> {
    if (!AiPanelWebview.currentPanel?.getWebview()?.active) {
        if (VisualizerWebview.isVisualizerActive()) {
            setCompanionVisualizer();
        } else {
            setCompanionTextEditor(vscode.window.activeTextEditor);
        }
    }

    const { projectInfo, projectPath, view, workspacePath } = StateMachine.context();
    const isWebviewOpen = VisualizerWebview.currentPanel !== undefined;
    const hasActiveTextEditor = !!vscode.window.activeTextEditor;

    // When opening from WorkspaceOverview, skip package selection and open AI panel directly.
    // The agent will operate on all packages in the workspace without an active package.
    if (view === MACHINE_VIEW.WorkspaceOverview) {
        openAIWebviewWithPrompt(defaultPrompt);
        return;
    }

    const currentBallerinaFile = tryGetCurrentBallerinaFile();
    const projectRoot = await findBallerinaPackageRoot(currentBallerinaFile);

    const needsPackageSelection = requiresPackageSelection(
        workspacePath, view, projectPath, isWebviewOpen, hasActiveTextEditor
    );

    if (needsPackageSelection) {
        const handled = await handleWorkspaceLevelAIPanel(projectInfo);
        if (handled) {
            return;
        }
    }

    if (needsProjectDiscovery(projectInfo, projectRoot, projectPath)) {
        const success = await handleProjectDiscoveryForAIPanel();
        if (!success) {
            return;
        }
    }

    openAIWebviewWithPrompt(defaultPrompt);
}

async function handleWorkspaceLevelAIPanel(projectInfo: ProjectInfo): Promise<boolean> {
    const availablePackages = projectInfo?.children.map((child: ProjectInfo) => child.projectPath) ?? [];

    try {
        const selectedPackage = await selectPackageOrPrompt(availablePackages, "Select an integration to open AI panel");
        if (!selectedPackage) {
            return true;
        }

        openPackageOverviewView(selectedPackage);
        return false; // Continue to open AI webview
    } catch (error) {
        console.error("Error selecting integration:", error);
        return true;
    }
}

async function handleProjectDiscoveryForAIPanel(): Promise<boolean> {
    try {
        const success = await tryOpenPackageOverviewForDiscoveredProject();
        if (!success) {
            vscode.window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
            return false;
        }
        return true;
    } catch {
        vscode.window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
        return false;
    }
}

function openAIWebviewWithPrompt(defaultPrompt?: AIPanelPrompt): void {
    const prompt = defaultPrompt instanceof vscode.Uri ? null : defaultPrompt;
    openAIWebview(prompt);
}

function openPackageOverviewView(projectPath?: string, resetHistory = false): void {
    openView(
        EVENT_TYPE.OPEN_VIEW,
        { view: MACHINE_VIEW.PackageOverview, projectPath },
        resetHistory
    );
}

async function tryOpenPackageOverviewForDiscoveredProject(): Promise<boolean> {
    const workspaceType = await findWorkspaceTypeFromWorkspaceFolders();
    const packageRoot = await getCurrentProjectRoot();

    if (!packageRoot) {
        return false;
    }

    if (workspaceType.type === "MULTIPLE_PROJECTS") {
        const projectInfo = await StateMachine.langClient().getProjectInfo({ projectPath: packageRoot });
        await StateMachine.updateProjectRootAndInfo(packageRoot, projectInfo);
        openPackageOverviewView(packageRoot, true);
        return true;
    }

    if (workspaceType.type === "BALLERINA_WORKSPACE") {
        openPackageOverviewView(packageRoot, true);
        return true;
    }

    return false;
}

// --- End AI Panel Command Helpers ---
