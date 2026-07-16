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
import {
    AddToUndoStackRequest,
    ColorThemeKind,
    EVENT_TYPE,
    GoBackRequest,
    GoHomeRequest,
    HandleApprovalPopupCloseRequest,
    HistoryEntry,
    JoinProjectPathRequest,
    JoinProjectPathResponse,
    MACHINE_VIEW,
    OpenViewRequest,
    PopupVisualizerLocation,
    ProjectStructureArtifactResponse,
    ReopenApprovalViewRequest,
    SaveEvalThreadRequest,
    SaveEvalThreadResponse,
    SHARED_COMMANDS,
    undo,
    UndoRedoStateResponse,
    UpdatedArtifactsResponse,
    VisualizerAPI,
    VisualizerLocation
} from "@wso2/ballerina-core";
import fs from "fs";
import path from "path";
import { commands, Range, Uri, window, workspace, WorkspaceEdit } from "vscode";
import { URI, Utils } from "vscode-uri";
import { notifyCurrentWebview } from "../../RPCLayer";
import { approvalViewManager } from "../../features/ai/state/ApprovalViewManager";
import { history, openView, StateMachine, undoRedoManager, updateView } from "../../stateMachine";
import { openPopupView } from "../../stateMachinePopup";
import { ArtifactNotificationHandler, ArtifactsUpdated } from "../../utils/project-artifacts-handler";
import { refreshDataMapper } from "../data-mapper/utils";

export class VisualizerRpcManager implements VisualizerAPI {

    openView(params: OpenViewRequest): Promise<void> {
        return new Promise(async (resolve) => {
            if (params.isPopup) {
                const view = params.location.view;
                if (view && view === MACHINE_VIEW.PackageOverview) {
                    openPopupView(EVENT_TYPE.CLOSE_VIEW, params.location as PopupVisualizerLocation);
                } else {
                    openPopupView(params.type, params.location as PopupVisualizerLocation);
                }
            } else {
                if (params.resetHistory) {
                    // Clear history directly without calling setReadyMode() — that resets the
                    // state machine to extensionReady which can crash updateView when the
                    // project-structure context is still live.
                    history.clear();
                }
                openView(params.type, params.location as VisualizerLocation);
            }
            resolve();
        });
    }

    goBack(params: GoBackRequest): void {
        const wasReviewMode = StateMachine.context().view === MACHINE_VIEW.ReviewMode;
        history.pop();
        updateView(false, params?.identifier);
        if (wasReviewMode) {
            approvalViewManager.notifyReviewModeClosed();
        }
    }

    async getHistory(): Promise<HistoryEntry[]> {
        return history.get();
    }

    goHome(params: GoHomeRequest): void {
        history.clear();
        const isWithinBallerinaWorkspace = !!StateMachine.context().workspacePath;
        const isPackageOverview = params?.isPackageOverview;
        commands.executeCommand(SHARED_COMMANDS.FORCE_UPDATE_PROJECT_ARTIFACTS).then(() => {
            openView(
                EVENT_TYPE.OPEN_VIEW,
                {
                    view: isWithinBallerinaWorkspace && !isPackageOverview
                        ? MACHINE_VIEW.WorkspaceOverview
                        : MACHINE_VIEW.PackageOverview
                },
                true
            );
        });
    }

    goSelected(index: number): void {
        history.select(index);
        updateView();
    }

    addToHistory(entry: HistoryEntry): void {
        history.push(entry);
        updateView();
    }

    private async refreshDataMapperView(): Promise<void> {
        const stateMachineContext = StateMachine.context();
        if (stateMachineContext.view === MACHINE_VIEW.DataMapper || stateMachineContext.view === MACHINE_VIEW.InlineDataMapper) {
            const { documentUri, dataMapperMetadata: { codeData, name } } = stateMachineContext;
            await refreshDataMapper(documentUri, codeData, name);
        }
    }

    async undo(count: number): Promise<string> {
        // Handle the undo batch operation here. Use the vscode vscode.WorkspaceEdit() to revert the changes.
        return new Promise((resolve, reject) => {
            StateMachine.setEditMode();
            const workspaceEdit = new WorkspaceEdit();
            const revertedFiles = undoRedoManager.undo(count);
            if (revertedFiles) {
                for (const [filePath, content] of revertedFiles.entries()) {
                    workspaceEdit.replace(Uri.file(filePath), new Range(0, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), content);
                }
            }
            workspace.applyEdit(workspaceEdit);

            // Get the artifact notification handler instance
            const notificationHandler = ArtifactNotificationHandler.getInstance();
            // Subscribe to artifact updated notifications
            let unsubscribe = notificationHandler.subscribe(ArtifactsUpdated.method, undefined, async (payload) => {
                console.log("Received notification:", payload);
                const currentArtifact = await this.updateCurrentArtifactLocation({ artifacts: payload.data });
                clearTimeout(timeoutId);
                StateMachine.setReadyMode();
                if (!currentArtifact && StateMachine.context().view !== MACHINE_VIEW.InlineDataMapper) {
                    openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.PackageOverview });
                    resolve("Undo successful"); // resolve the undo string
                }
                notifyCurrentWebview();
                await this.refreshDataMapperView();
                unsubscribe();
                resolve("Undo successful"); // resolve the undo string
            });

            // Set a timeout to reject if no notification is received within 10 seconds
            const timeoutId = setTimeout(() => {
                console.log("No artifact update notification received within 10 seconds");
                unsubscribe();
                StateMachine.setReadyMode();
                openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.PackageOverview });
                reject(new Error("Operation timed out. Please try again."));
            }, 10000);

            // Clear the timeout when notification is received
            const originalUnsubscribe = unsubscribe;
            unsubscribe = () => {
                clearTimeout(timeoutId);
                originalUnsubscribe();
            };
        });
    }

    async redo(count: number): Promise<string> {
        // Handle the redo batch operation here. Use the vscode vscode.WorkspaceEdit() to revert the changes.
        return new Promise((resolve, reject) => {
            StateMachine.setEditMode();
            const workspaceEdit = new WorkspaceEdit();
            const revertedFiles = undoRedoManager.redo(count);
            if (revertedFiles) {
                for (const [filePath, content] of revertedFiles.entries()) {
                    workspaceEdit.replace(Uri.file(filePath), new Range(0, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), content);
                }
            }
            workspace.applyEdit(workspaceEdit);

            // Get the artifact notification handler instance
            const notificationHandler = ArtifactNotificationHandler.getInstance();
            // Subscribe to artifact updated notifications
            let unsubscribe = notificationHandler.subscribe(ArtifactsUpdated.method, undefined, async (payload) => {
                console.log("Received notification:", payload);
                await this.updateCurrentArtifactLocation({ artifacts: payload.data });
                clearTimeout(timeoutId);
                StateMachine.setReadyMode();
                notifyCurrentWebview();
                await this.refreshDataMapperView();
                unsubscribe();
                resolve("Redo successful");
            });

            // Set a timeout to reject if no notification is received within 10 seconds
            const timeoutId = setTimeout(() => {
                console.log("No artifact update notification received within 10 seconds");
                unsubscribe();
                StateMachine.setReadyMode();
                openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.PackageOverview });
                reject(new Error("Operation timed out. Please try again."));
            }, 10000);

            // Clear the timeout when notification is received
            const originalUnsubscribe = unsubscribe;
            unsubscribe = () => {
                clearTimeout(timeoutId);
                originalUnsubscribe();
            };
        });
    }

    addToUndoStack(params: AddToUndoStackRequest): void {
        // Get the current file content from file
        const currentFileContent = fs.readFileSync(params.filePath, 'utf8');
        undoRedoManager.startBatchOperation();
        undoRedoManager.addFileToBatch(params.filePath, currentFileContent, params.source);
        undoRedoManager.commitBatchOperation(params.description);
    }

    resetUndoRedoStack(): void {
        undoRedoManager.reset();
    }

    async getThemeKind(): Promise<ColorThemeKind> {
        return new Promise((resolve) => {
            resolve(window.activeColorTheme.kind);
        });
    }

    async joinProjectPath(params: JoinProjectPathRequest): Promise<JoinProjectPathResponse> {
        return new Promise((resolve) => {
            let projectPath = StateMachine.context().projectPath;
            // If code data is provided, try to find the project path from the project structure
            if (params.codeData && params.codeData.packageName) {
                const packageInfo = StateMachine.context().projectStructure.projects.find(project => {
                    console.log(">>> project", project);
                    return project.projectName === params.codeData.packageName;
                });
                if (packageInfo) {
                    projectPath = packageInfo.projectPath;
                }
            }
            if (!projectPath) {
                resolve({ filePath: "", projectPath: "" });
                return;
            }
            const filePath = Array.isArray(params.segments) ? Utils.joinPath(URI.file(projectPath), ...params.segments) : Utils.joinPath(URI.file(projectPath), params.segments);
            resolve({ filePath: filePath.fsPath, projectPath: projectPath, exists: params.checkExists ? fs.existsSync(filePath.fsPath) : undefined });
        });
    }
    async undoRedoState(): Promise<UndoRedoStateResponse> {
        return undoRedoManager.getUIState();
    }

    async updateCurrentArtifactLocation(params: UpdatedArtifactsResponse): Promise<ProjectStructureArtifactResponse> {
        return new Promise((resolve) => {
            if (params.artifacts.length === 0) {
                resolve(undefined);
                return;
            }
            console.log(">>> Updating current artifact location", { artifacts: params.artifacts });
            // Get the updated component and update the location
            const currentIdentifier = StateMachine.context().identifier;
            const currentType = StateMachine.context().type;
            const parentIdentifier = StateMachine.context().parentIdentifier;

            // Find the correct artifact by currentIdentifier (id)
            let currentArtifact = undefined;
            for (const artifact of params.artifacts) {
                if (currentType && currentType.codedata.node === "CLASS" && currentType.name === artifact.name) {
                    currentArtifact = artifact;
                    if (artifact.resources && artifact.resources.length > 0) {
                        const resource = artifact.resources.find(
                            (resource) => resource.id === currentIdentifier || resource.name === currentIdentifier
                        );
                        if (resource) {
                            currentArtifact = resource;
                            break;
                        }
                    }

                } else if (artifact.id === currentIdentifier || artifact.name === currentIdentifier) {
                    currentArtifact = artifact;
                }

                // Check if parent artifact is matched and has resources and find within those
                if (parentIdentifier && artifact.name === parentIdentifier && artifact.resources && artifact.resources.length > 0) {
                    const resource = artifact.resources.find(
                        (resource) => resource.id === currentIdentifier || resource.name === currentIdentifier
                    );
                    if (resource) {
                        currentArtifact = resource;
                    }
                }
            }

            if (currentArtifact) {
                openView(EVENT_TYPE.UPDATE_PROJECT_LOCATION, {
                    documentUri: currentArtifact.path,
                    position: currentArtifact.position,
                    identifier: currentIdentifier,
                });
            }
            resolve(currentArtifact);
        });
    }

    reviewAccepted(): void {
        approvalViewManager.clearReviewData();
        approvalViewManager.notifyReviewModeClosed();
        const currentHistory = history.get();
        const currentEntry = currentHistory[currentHistory.length - 1];

        // If currently in review mode, drop it and restore the last non-review entry.
        if (currentEntry?.location.view === MACHINE_VIEW.ReviewMode) {
            history.pop();
        }

        // Restore the latest history entry when available.
        if (history.get().length > 0) {
            updateView();
            return;
        }

        // If history is empty, fallback to the default overview.
        const isWithinBallerinaWorkspace = !!StateMachine.context().workspacePath;
        openView(EVENT_TYPE.OPEN_VIEW, {
            view: isWithinBallerinaWorkspace
                ? MACHINE_VIEW.WorkspaceOverview
                : MACHINE_VIEW.PackageOverview
        });
    }

    handleApprovalPopupClose(params: HandleApprovalPopupCloseRequest): void {
        approvalViewManager.handlePopupClosed(params.requestId);
    }

    reopenApprovalView(params: ReopenApprovalViewRequest): void {
        approvalViewManager.reopenApprovalViewPopup(params.requestId);
    }

    navigateReviewMode(index: number): void {
        approvalViewManager.navigateReviewMode(index);
    }

    async saveEvalThread(params: SaveEvalThreadRequest): Promise<SaveEvalThreadResponse> {
        try {
            const { filePath, updatedEvalSet } = params;

            // Validate and canonicalize the file path to prevent path traversal attacks
            const normalizedPath = path.normalize(filePath);
            const resolvedPath = path.resolve(normalizedPath);

            // Get workspace folders to validate the path is within an allowed workspace
            const workspaceFolders = workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                const errorMsg = 'No workspace folder is open';
                console.error('saveEvalThread error:', errorMsg);
                window.showErrorMessage(`Failed to save evalset: ${errorMsg}`);
                return { success: false, error: errorMsg };
            }

            // Check if the resolved path starts with any of the workspace roots
            const isPathInWorkspace = workspaceFolders.some(folder => {
                const workspaceRoot = folder.uri.fsPath;
                const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
                return resolvedPath.startsWith(resolvedWorkspaceRoot + path.sep) ||
                    resolvedPath === resolvedWorkspaceRoot;
            });

            if (!isPathInWorkspace) {
                const errorMsg = `Path is outside workspace: ${resolvedPath}`;
                console.error('saveEvalThread error:', errorMsg);
                window.showErrorMessage(`Failed to save evalset: Path must be within workspace`);
                return { success: false, error: errorMsg };
            }

            // Write the updated evalset back to the file using the validated path
            await fs.promises.writeFile(
                resolvedPath,
                JSON.stringify(updatedEvalSet, null, 2),
                'utf-8'
            );

            // Read back the file to get fresh data
            const savedContent = await fs.promises.readFile(resolvedPath, 'utf-8');
            const savedEvalSet = JSON.parse(savedContent);

            // Get the current threadId from context
            const currentContext = StateMachine.context();
            const threadId = currentContext.evalsetData?.threadId;

            // Reload the view with fresh data from disk using the validated path
            openView(EVENT_TYPE.OPEN_VIEW, {
                view: MACHINE_VIEW.EvalsetViewer,
                evalsetData: {
                    filePath: resolvedPath,
                    content: savedEvalSet,
                    threadId
                }
            });

            window.showInformationMessage('Evalset saved successfully');
            return { success: true };
        } catch (error) {
            console.error('Error saving evalset:', error);
            window.showErrorMessage(`Failed to save evalset: ${error}`);
            return { success: false, error: String(error) };
        }
    }
}
