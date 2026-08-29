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
    addToHistory,
    addToUndoStack,
    AddToUndoStackRequest,
    getHistory,
    getThemeKind,
    goBack,
    goHome,
    goSelected,
    handleApprovalPopupClose,
    HandleApprovalPopupCloseRequest,
    HistoryEntry,
    joinProjectPath,
    JoinProjectPathRequest,
    openView,
    OpenViewRequest,
    redo,
    reopenApprovalView,
    NavigateReviewModeRequest,
    ReopenApprovalViewRequest,
    resetUndoRedoStack,
    saveEvalThread,
    SaveEvalThreadRequest,
    undo,
    undoRedoState,
    updateCurrentArtifactLocation,
    UpdatedArtifactsResponse,
    navigateReviewMode,
    GoBackRequest,
    GoHomeRequest
} from "@wso2/ballerina-core";
import { Messenger } from "vscode-messenger";
import { VisualizerRpcManager } from "./rpc-manager";

export function registerVisualizerRpcHandlers(messenger: Messenger) {
    const rpcManger = new VisualizerRpcManager();
    messenger.onNotification(openView, (args: OpenViewRequest) => rpcManger.openView(args));
    messenger.onRequest(getHistory, () => rpcManger.getHistory());
    messenger.onNotification(addToHistory, (args: HistoryEntry) => rpcManger.addToHistory(args));
    messenger.onNotification(goBack, (args: GoBackRequest) => rpcManger.goBack(args));
    messenger.onNotification(goHome, (args: GoHomeRequest) => rpcManger.goHome(args));
    messenger.onNotification(goSelected, (args: number) => rpcManger.goSelected(args));
    messenger.onRequest(undo, (count: number) => rpcManger.undo(count));
    messenger.onRequest(redo, (count: number) => rpcManger.redo(count));
    messenger.onNotification(addToUndoStack, (args: AddToUndoStackRequest) => rpcManger.addToUndoStack(args));
    messenger.onRequest(undoRedoState, () => rpcManger.undoRedoState());
    messenger.onNotification(resetUndoRedoStack, () => rpcManger.resetUndoRedoStack());
    messenger.onRequest(joinProjectPath, (args: JoinProjectPathRequest) => rpcManger.joinProjectPath(args));
    messenger.onRequest(getThemeKind, () => rpcManger.getThemeKind());
    messenger.onRequest(updateCurrentArtifactLocation, (args: UpdatedArtifactsResponse) => rpcManger.updateCurrentArtifactLocation(args));
    messenger.onNotification(handleApprovalPopupClose, (args: HandleApprovalPopupCloseRequest) => rpcManger.handleApprovalPopupClose(args));
    messenger.onNotification(reopenApprovalView, (args: ReopenApprovalViewRequest) => rpcManger.reopenApprovalView(args));
    messenger.onRequest(saveEvalThread, (args: SaveEvalThreadRequest) => rpcManger.saveEvalThread(args));
    messenger.onNotification(navigateReviewMode, (args: NavigateReviewModeRequest) => rpcManger.navigateReviewMode(args));
}
