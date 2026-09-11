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
 * software distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import * as vscode from 'vscode';
import { isSamePath } from '@wso2/ballerina-core';
import { BallerinaExtension } from '../../core';
import { TracerMachine } from './tracer-machine';
import { TraceTreeDataProvider } from './trace-tree-view';
import { TraceServer, Trace } from './trace-server';
import { TraceDetailsWebview } from './trace-details-webview';
import { StateMachine } from '../../stateMachine';
import { VisualizerWebview } from '../../views/visualizer/webview';
import { initTraceAnimation, disposeTraceAnimation } from './trace-animation';
import { executeTraceServerTask } from './trace-server-task';
import { getCurrentProjectRoot, tryGetCurrentBallerinaFile } from '../../utils/project-utils';
import { findBallerinaPackageRoot } from '../../utils';
import { requiresPackageSelection, selectPackageOrPrompt } from '../../utils/command-utils';
import { sendTracingStatusChangedNotification } from '../../RPCLayer';
import { isIntegrationRunningAt, restartIntegration } from '../project/integration-runner-state';

export const TRACE_WINDOW_COMMAND = 'ballerina.showTraceWindow';
export const ENABLE_TRACING_COMMAND = 'ballerina.enableTracing';
export const DISABLE_TRACING_COMMAND = 'ballerina.disableTracing';
export const CLEAR_TRACES_COMMAND = 'ballerina.clearTraces';
export const SHOW_TRACE_DETAILS_COMMAND = 'ballerina.showTraceDetails';
export const TOGGLE_AGENT_FILTER_COMMAND = 'ballerina.toggleAgentFilter';
export const START_TRACE_SERVER_COMMAND = 'ballerina.startTraceServer';
export const TRACE_VIEW_ID = 'ballerina-traceView';

let treeDataProvider: TraceTreeDataProvider | undefined;
let treeView: vscode.TreeView<vscode.TreeItem> | undefined;

export function activateTracing(ballerinaExtInstance: BallerinaExtension) {
    // Initialize TracerMachine with child project paths for workspace projects
    const { projectPath, projectInfo } = StateMachine.context();
    const childProjectPaths = projectInfo?.children
        ?.map((child: any) => child.projectPath)
        .filter(Boolean) as string[] | undefined;
    TracerMachine.initialize(projectPath, childProjectPaths);

    // When project info isn't available yet (e.g. workspace still loading),
    // listen for StateMachine transitions and refresh once it becomes available.
    if (!projectPath && !childProjectPaths?.length) {
        let hasRefreshed = false;
        StateMachine.service().onTransition((state) => {
            if (hasRefreshed) {
                return;
            }
            const ctx = state.context;
            const newProjectPath = ctx?.projectPath;
            const newChildPaths = ctx?.projectInfo?.children
                ?.map((child: any) => child.projectPath)
                .filter(Boolean) as string[] | undefined;

            if (newProjectPath || newChildPaths?.length) {
                hasRefreshed = true;
                TracerMachine.refresh(newProjectPath, newChildPaths);
            }
        });
    }

    // Create TreeDataProvider
    treeDataProvider = new TraceTreeDataProvider();

    // Create and register TreeView in bottom panel (debug container)
    treeView = vscode.window.createTreeView(TRACE_VIEW_ID, {
        treeDataProvider: treeDataProvider,
        showCollapseAll: true
    });

    let prevEnabled = false;
    // Subscribe to TracerMachine state changes to update VS Code context
    TracerMachine.onUpdate(async (state: any) => {
        await updateContextFromState(state);

        // Initialize trace animation when tracing transitions to enabled, dispose when it transitions to disabled
        const isEnabled = typeof state === 'string'
            ? state === 'enabled'
            : (typeof state === 'object' && state !== null && 'enabled' in state);
        if (!prevEnabled && isEnabled) {
            initTraceAnimation();
        } else if (prevEnabled && !isEnabled) {
            disposeTraceAnimation();
        }
        sendTracingStatusChangedNotification({ enabled: isEnabled });
        prevEnabled = isEnabled;
    });

    // Set initial context based on current state
    const initialState = TracerMachine.getState();
    updateContextFromState(initialState);

    // Register commands
    const showTraceWindowCommand = vscode.commands.registerCommand(TRACE_WINDOW_COMMAND, async () => {
        await showTraceWindow();
    });

    const enableTracingCommand = vscode.commands.registerCommand(ENABLE_TRACING_COMMAND, async (useAmpProvider?: boolean) => {
        const targetPath = await resolveTracingTargetPath("Select an integration to enable tracing");
        if (!targetPath) {
            return;
        }

        TracerMachine.enable(targetPath, useAmpProvider === true);
        await notifyTracingToggle(true, targetPath);
    });

    const disableTracingCommand = vscode.commands.registerCommand(DISABLE_TRACING_COMMAND, async () => {
        const targetPath = await resolveTracingTargetPath("Select an integration to disable tracing");
        if (!targetPath) {
            return;
        }
        TracerMachine.disable(targetPath);
        await notifyTracingToggle(false, targetPath);
    });

    const clearTracesCommand = vscode.commands.registerCommand(CLEAR_TRACES_COMMAND, () => {
        // Clear traces from the server
        TraceServer.clearTraces();

        // The TraceServer.onTracesCleared callback will update the context and refresh the tree
    });

    const showTraceDetailsCommand = vscode.commands.registerCommand(
        SHOW_TRACE_DETAILS_COMMAND,
        (trace: Trace, focusSpanId?: string, isAgentChat?: boolean, showSidebar?: boolean) => {
            showTraceDetails(trace, focusSpanId, isAgentChat, showSidebar);
        }
    );

    let traceServerStarting = false;
    const startTraceServerCommand = vscode.commands.registerCommand(START_TRACE_SERVER_COMMAND, async () => {
        if (TraceServer.isRunning()) {
            vscode.window.showInformationMessage('Trace server is already running.');
            return;
        }
        if (traceServerStarting) {
            vscode.window.showInformationMessage('Trace server is already starting.');
            return;
        }
        traceServerStarting = true;
        try {
            await executeTraceServerTask();
        } finally {
            traceServerStarting = false;
        }
    });

    const toggleAgentFilterCommand = vscode.commands.registerCommand(
        TOGGLE_AGENT_FILTER_COMMAND,
        async () => {
            treeDataProvider!.toggleAgentFilter();
            const enabled = treeDataProvider!.agentFilterEnabled;
            await vscode.commands.executeCommand('setContext', 'ballerina.agentFilterEnabled', enabled);
            // Set empty state context: filter is on but no agent traces matched
            const hasAgentTraces = enabled && TraceServer.getTraces().some(t =>
                t.spans.some(s => s.attributes?.some(a => a.key === 'gen_ai.operation.name' && a.value === 'invoke_agent'))
            );
            await vscode.commands.executeCommand('setContext', 'ballerina.agentFilterEmpty', enabled && !hasAgentTraces);
        }
    );

    // Add all subscriptions
    ballerinaExtInstance.context.subscriptions.push(
        treeView,
        showTraceWindowCommand,
        enableTracingCommand,
        disableTracingCommand,
        clearTracesCommand,
        showTraceDetailsCommand,
        startTraceServerCommand,
        toggleAgentFilterCommand,
        treeDataProvider
    );
}

/**
 * Resolves the target project path for tracing operations.
 * Handles integration selection when required and updates the state machine accordingly.
 * @param promptMessage - The message to display when prompting for integration selection
 * @returns The resolved target path, or undefined if the user cancelled the selection
 */
async function resolveTracingTargetPath(promptMessage: string): Promise<string | undefined> {
    const { workspacePath, view: webviewType, projectPath, projectInfo } = StateMachine.context();
    const isWebviewOpen = VisualizerWebview.currentPanel !== undefined;
    const hasActiveTextEditor = !!vscode.window.activeTextEditor;
    const currentBallerinaFile = tryGetCurrentBallerinaFile();
    const projectRoot = await findBallerinaPackageRoot(currentBallerinaFile);

    let targetPath = projectPath ?? "";

    if (requiresPackageSelection(workspacePath, webviewType, projectPath, isWebviewOpen, hasActiveTextEditor)) {
        const availablePackages = projectInfo?.children.map((child: any) => child.projectPath) ?? [];
        const selectedPackage = await selectPackageOrPrompt(availablePackages, promptMessage);
        if (!selectedPackage) {
            return undefined;
        }
        targetPath = selectedPackage;
        await StateMachine.updateProjectRootAndInfo(selectedPackage, projectInfo);
    } else if (projectRoot && !isSamePath(projectRoot, projectPath)) {
        targetPath = await getCurrentProjectRoot();
        await StateMachine.updateProjectRootAndInfo(targetPath, projectInfo);
    }

    return targetPath;
}

/**
 * Update VS Code context based on TracerMachine state
 */
async function updateContextFromState(state: any): Promise<void> {
    const isEnabled = typeof state === 'string'
        ? state === 'enabled'
        : (typeof state === 'object' && state !== null && 'enabled' in state);

    await vscode.commands.executeCommand('setContext', 'ballerina.tracingEnabled', isEnabled);

    if (isEnabled) {
        // Check if traces exist
        const traces = TraceServer.getTraces();
        await vscode.commands.executeCommand('setContext', 'ballerina.tracesEmpty', traces.length === 0);
    }
}

/**
 * Show/reveal the trace window
 */
async function showTraceWindow(): Promise<void> {
    if (!treeView) {
        return;
    }

    try {
        // Show the view by executing the show command for the debug container
        // The trace view is in the debug container (bottom panel)
        await vscode.commands.executeCommand('workbench.view.debug');

        // Small delay to ensure the view is ready
        await new Promise(resolve => setTimeout(resolve, 100));

        // If there are traces, try to reveal the first one
        const traces = TraceServer.getTraces();
        if (traces.length > 0 && treeDataProvider) {
            const children = await treeDataProvider.getChildren();
            if (children && children.length > 0 && children[0]) {
                // Reveal the first trace node
                await treeView.reveal(children[0], { focus: true, select: false });
            }
        }
    } catch (error) {
        // If reveal fails, at least ensure the view is visible
        // The error might be due to getParent, but the view should still be shown
        console.error('Error revealing trace window:', error);
    }
}

/**
 * Show trace details in a webview
 */
function showTraceDetails(trace: Trace, focusSpanId?: string, isAgentChat?: boolean, showSidebar?: boolean): void {
    try {
        TraceDetailsWebview.show(trace, isAgentChat ?? false, focusSpanId, undefined, showSidebar);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to show trace details: ${message}`);
    }
}

async function notifyTracingToggle(enabled: boolean, targetPath: string): Promise<void> {
    if (!isIntegrationRunningAt(targetPath)) {
        vscode.window.showInformationMessage(enabled ? 'Tracing enabled.' : 'Tracing disabled.');
        return;
    }
    const restartAction = "Restart Integration";
    const selection = await vscode.window.showWarningMessage(
        "Tracing changes only take effect on a new run. Restart the integration to apply.",
        restartAction,
        "Dismiss"
    );
    if (selection === restartAction) {
        await restartIntegration(targetPath);
    }
}
