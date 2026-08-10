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
 * 
 * THIS FILE INCLUDES AUTO GENERATED CODE
 */
import {
    AddToUndoStackRequest,
    ColorThemeKind,
    HandleApprovalPopupCloseRequest,
    HistoryEntry,
    JoinProjectPathRequest,
    JoinProjectPathResponse,
    OpenViewRequest,
    NavigateReviewModeRequest,
    ReopenApprovalViewRequest,
    ProjectStructureArtifactResponse,
    SaveEvalThreadRequest,
    SaveEvalThreadResponse,
    UndoRedoStateResponse,
    UpdatedArtifactsResponse,
    VisualizerAPI,
    addToHistory,
    addToUndoStack,
    getHistory,
    getThemeKind,
    goBack,
    goHome,
    goSelected,
    handleApprovalPopupClose,
    joinProjectPath,
    openView,
    redo,
    reopenApprovalView,
    resetUndoRedoStack,
    saveEvalThread,
    undo,
    undoRedoState,
    updateCurrentArtifactLocation,
    navigateReviewMode,
    GoBackRequest,
    GoHomeRequest
} from "@wso2/ballerina-core";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { Messenger } from "vscode-messenger-webview";

export class VisualizerRpcClient implements VisualizerAPI {
    private _messenger: Messenger;

    constructor(messenger: Messenger) {
        this._messenger = messenger;
    }

    openView(params: OpenViewRequest): void {
        return this._messenger.sendNotification(openView, HOST_EXTENSION, params);
    }

    async getHistory(): Promise<HistoryEntry[]> {
        return this._messenger.sendRequest(getHistory, HOST_EXTENSION);
    }

    addToHistory(entry: HistoryEntry): void {
        return this._messenger.sendNotification(addToHistory, HOST_EXTENSION, entry);
    }

    goBack(params?: GoBackRequest): void {
        return this._messenger.sendNotification(goBack, HOST_EXTENSION, params);
    }

    goHome(params?: GoHomeRequest): void {
        return this._messenger.sendNotification(goHome, HOST_EXTENSION, params);
    }

    goSelected(index: number): void {
        return this._messenger.sendNotification(goSelected, HOST_EXTENSION, index);
    }

    undo(count: number): Promise<string> {
        return this._messenger.sendRequest(undo, HOST_EXTENSION, count);
    }

    redo(count: number): Promise<string> {
        return this._messenger.sendRequest(redo, HOST_EXTENSION, count);
    }

    addToUndoStack(params: AddToUndoStackRequest): void {
        return this._messenger.sendNotification(addToUndoStack, HOST_EXTENSION, params);
    }

    undoRedoState(): Promise<UndoRedoStateResponse> {
        return this._messenger.sendRequest(undoRedoState, HOST_EXTENSION);
    }

    resetUndoRedoStack(): void {
        return this._messenger.sendNotification(resetUndoRedoStack, HOST_EXTENSION);
    }

    joinProjectPath(params: JoinProjectPathRequest): Promise<JoinProjectPathResponse> {
        return this._messenger.sendRequest(joinProjectPath, HOST_EXTENSION, params);
    }

    getThemeKind(): Promise<ColorThemeKind> {
        return this._messenger.sendRequest(getThemeKind, HOST_EXTENSION);
    }

    updateCurrentArtifactLocation(params: UpdatedArtifactsResponse): Promise<ProjectStructureArtifactResponse> {
        return this._messenger.sendRequest(updateCurrentArtifactLocation, HOST_EXTENSION, params);
    }

    navigateReviewMode(params: NavigateReviewModeRequest): void {
        return this._messenger.sendNotification(navigateReviewMode, HOST_EXTENSION, params);
    }

    handleApprovalPopupClose(params: HandleApprovalPopupCloseRequest): void {
        return this._messenger.sendNotification(handleApprovalPopupClose, HOST_EXTENSION, params);
    }

    reopenApprovalView(params: ReopenApprovalViewRequest): void {
        return this._messenger.sendNotification(reopenApprovalView, HOST_EXTENSION, params);
    }
    saveEvalThread(params: SaveEvalThreadRequest): Promise<SaveEvalThreadResponse> {
        return this._messenger.sendRequest(saveEvalThread, HOST_EXTENSION, params);
    }
}
