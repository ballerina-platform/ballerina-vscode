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
import { HistoryEntry } from "../../history";
import { ProjectStructureArtifactResponse, UpdatedArtifactsResponse } from "../../interfaces/bi";
import { ColorThemeKind, EvalSet } from "../../state-machine-types";
import { AddToUndoStackRequest, HandleApprovalPopupCloseRequest, JoinProjectPathRequest, JoinProjectPathResponse, NavigateReviewModeRequest, OpenViewRequest, ReopenApprovalViewRequest, UndoRedoStateResponse, SaveEvalThreadRequest, SaveEvalThreadResponse, GoHomeRequest } from "./interfaces";
import { NotificationType, RequestType } from "vscode-messenger-common";

const _preFix = "visualizer";
export const openView: NotificationType<OpenViewRequest> = { method: `${_preFix}/openView` };
export const getHistory: RequestType<void, HistoryEntry[]> = { method: `${_preFix}/getHistory` };
export const addToHistory: NotificationType<HistoryEntry> = { method: `${_preFix}/addToHistory` };
export const goBack: NotificationType<void> = { method: `${_preFix}/goBack` };
export const goHome: NotificationType<GoHomeRequest> = { method: `${_preFix}/goHome` };
export const goSelected: NotificationType<number> = { method: `${_preFix}/goSelected` };
export const undo: RequestType<number, string> = { method: `${_preFix}/undo` };
export const redo: RequestType<number, string> = { method: `${_preFix}/redo` };
export const addToUndoStack: NotificationType<AddToUndoStackRequest> = { method: `${_preFix}/addToUndoStack` };
export const undoRedoState: RequestType<void, UndoRedoStateResponse> = { method: `${_preFix}/undoRedoState` };
export const resetUndoRedoStack: NotificationType<void> = { method: `${_preFix}/resetUndoRedoStack` };
export const joinProjectPath: RequestType<JoinProjectPathRequest, JoinProjectPathResponse> = { method: `${_preFix}/joinProjectPath` };
export const getThemeKind: RequestType<void, ColorThemeKind> = { method: `${_preFix}/getThemeKind` };
export const updateCurrentArtifactLocation: RequestType<UpdatedArtifactsResponse, ProjectStructureArtifactResponse> = { method: `${_preFix}/updateCurrentArtifactLocation` };
export const navigateReviewIndex: NotificationType<number> = { method: `${_preFix}/navigateReviewIndex` };
export const navigateReviewMode: NotificationType<NavigateReviewModeRequest> = { method: `${_preFix}/navigateReviewMode` };
export const reviewModeOpened: NotificationType<void> = { method: `${_preFix}/reviewModeOpened` };
export const reviewModeClosed: NotificationType<void> = { method: `${_preFix}/reviewModeClosed` };
export const handleApprovalPopupClose: NotificationType<HandleApprovalPopupCloseRequest> = { method: `${_preFix}/handleApprovalPopupClose` };
export const reopenApprovalView: NotificationType<ReopenApprovalViewRequest> = { method: `${_preFix}/reopenApprovalView` };
export const saveEvalThread: RequestType<SaveEvalThreadRequest, SaveEvalThreadResponse> = { method: `${_preFix}/saveEvalThread` };
export interface WebToolToggle {
    active: boolean;
}
export const webToolToggle: NotificationType<WebToolToggle> = { method: `${_preFix}/webToolToggle` };
