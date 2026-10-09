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
    isSamePath,
    JoinProjectPathRequest,
    JoinProjectPathResponse,
    MACHINE_VIEW,
    OpenViewRequest,
    PopupVisualizerLocation,
    ProjectStructureArtifactResponse,
    NavigateReviewModeRequest,
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
import { pickClosestArtifact } from "../../utils/state-machine-utils";
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
        updateView(false, params?.identifier, { userInitiated: true });
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
                true,
                // Home is the way back up to the workspace, so it keeps the workspace overview
                // even when a single integration would otherwise collapse onto itself — the
                // landing view is already that integration, so redirecting here does nothing.
                { exactView: true }
            );
        });
    }

    goSelected(index: number): void {
        history.select(index);
        updateView(false, undefined, { userInitiated: true });
    }

    mergeHistoryLocation(location: VisualizerLocation): void {
        const current = history.get().at(-1);
        if (current) {
            history.updateCurrentEntry({ ...current, location: { ...current.location, ...location } });
        }
    }

    addToHistory(entry: HistoryEntry): void {
        history.push(entry);
        updateView(false, undefined, { userInitiated: true });
    }

    private async refreshDataMapperView(): Promise<void> {
        const stateMachineContext = StateMachine.context();
        if (stateMachineContext.view === MACHINE_VIEW.DataMapper || stateMachineContext.view === MACHINE_VIEW.InlineDataMapper) {
            const { documentUri, dataMapperMetadata: { codeData, name } } = stateMachineContext;
            await refreshDataMapper(documentUri, codeData, name);
        }
    }

    async undo(count: number): Promise<string> {
        return this.applyUndoRedo(undoRedoManager.undo(count), "Undo successful");
    }

    async redo(count: number): Promise<string> {
        return this.applyUndoRedo(undoRedoManager.redo(count), "Redo successful");
    }

    private applyUndoRedo(revertedFiles: Map<string, string> | null, successMessage: string): Promise<string> {
        const currentText = (filePath: string) =>
            workspace.textDocuments.find((document) => isSamePath(document.uri.fsPath, filePath))?.getText()
            ?? (fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : undefined);
        // A file already holding its target content produces no change event and so no artifact publish.
        const changedPaths = [...(revertedFiles?.entries() ?? [])]
            .filter(([filePath, content]) => currentText(filePath) !== content)
            .map(([filePath]) => filePath);
        if (changedPaths.length === 0) {
            return Promise.resolve(successMessage);
        }
        return new Promise((resolve, reject) => {
            StateMachine.setEditMode();
            const workspaceEdit = new WorkspaceEdit();
            for (const [filePath, content] of revertedFiles.entries()) {
                workspaceEdit.replace(Uri.file(filePath), new Range(0, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), content);
            }

            // Artifacts are published per changed source file; the view's artifact may live in any of them.
            let pendingPublishes = changedPaths.filter((filePath) => filePath.endsWith(".bal")).length;
            if (pendingPublishes === 0) {
                workspace.applyEdit(workspaceEdit).then(() => {
                    StateMachine.setReadyMode();
                    notifyCurrentWebview();
                    resolve(successMessage);
                });
                return;
            }
            const publishedArtifacts: ProjectStructureArtifactResponse[] = [];
            const notificationHandler = ArtifactNotificationHandler.getInstance();
            let unsubscribe = notificationHandler.subscribe(ArtifactsUpdated.method, undefined, async (payload) => {
                publishedArtifacts.push(...payload.data);
                if (--pendingPublishes > 0) {
                    return;
                }
                unsubscribe();
                const currentArtifact = await this.updateCurrentArtifactLocation({ artifacts: publishedArtifacts });
                StateMachine.setReadyMode();
                const { documentUri, view } = StateMachine.context();
                // Only a change to the file on screen can remove what the view shows.
                const viewFileChanged = !!documentUri
                    && changedPaths.some((filePath) => isSamePath(filePath, documentUri));
                if (!currentArtifact && viewFileChanged && view !== MACHINE_VIEW.InlineDataMapper) {
                    openView(EVENT_TYPE.OPEN_VIEW, { view: MACHINE_VIEW.PackageOverview });
                }
                notifyCurrentWebview();
                await this.refreshDataMapperView();
                resolve(successMessage);
            });
            workspace.applyEdit(workspaceEdit);

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

    async beginUndoGroup(): Promise<void> {
        undoRedoManager.beginGroup();
    }

    async endUndoGroup(description?: string): Promise<void> {
        undoRedoManager.endGroup(description);
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
            const { identifier: currentIdentifier, type: currentType, parentIdentifier, documentUri, position } = StateMachine.context();
            const matchesIdentifier = (artifact: ProjectStructureArtifactResponse) =>
                artifact.id === currentIdentifier || artifact.name === currentIdentifier;

            // Find the correct artifact by currentIdentifier (id)
            let classArtifact: ProjectStructureArtifactResponse = undefined;
            let classResource: ProjectStructureArtifactResponse = undefined;
            const candidates: ProjectStructureArtifactResponse[] = [];
            for (const artifact of params.artifacts) {
                if (currentType && currentType.codedata.node === "CLASS" && currentType.name === artifact.name) {
                    classArtifact = artifact;
                    classResource = artifact.resources?.find(matchesIdentifier);
                    if (classResource) {
                        break;
                    }
                } else if (matchesIdentifier(artifact)) {
                    candidates.push(artifact);
                }

                // Check if parent artifact is matched and has resources and find within those
                if (parentIdentifier && artifact.name === parentIdentifier && artifact.resources && artifact.resources.length > 0) {
                    const resource = artifact.resources.find(matchesIdentifier);
                    if (resource) {
                        candidates.push(resource);
                    }
                }
            }
            const currentArtifact = classResource ?? pickClosestArtifact(candidates, documentUri, position) ?? classArtifact;

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

    handleApprovalPopupClose(params: HandleApprovalPopupCloseRequest): void {
        approvalViewManager.handlePopupClosed(params.requestId);
    }

    reopenApprovalView(params: ReopenApprovalViewRequest): void {
        approvalViewManager.reopenApprovalViewPopup(params.requestId);
    }

    navigateReviewMode(params: NavigateReviewModeRequest): void {
        approvalViewManager.navigateReviewMode(params.generationId, params.index).catch((err) =>
            console.error("[Visualizer] Failed to navigate review mode:", err));
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
