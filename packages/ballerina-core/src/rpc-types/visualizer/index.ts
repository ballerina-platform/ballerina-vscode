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

import { HistoryEntry } from "../../history";
import { ProjectStructureArtifactResponse, UpdatedArtifactsResponse } from "../../interfaces/bi";
import { ColorThemeKind } from "../../state-machine-types";
import { AddToUndoStackRequest, HandleApprovalPopupCloseRequest, JoinProjectPathRequest, JoinProjectPathResponse, NavigateReviewModeRequest, OpenViewRequest, ReopenApprovalViewRequest, UndoRedoStateResponse, SaveEvalThreadRequest, SaveEvalThreadResponse, GoBackRequest, GoHomeRequest } from "./interfaces";

export interface VisualizerAPI {
    openView: (params: OpenViewRequest) => void;
    getHistory: () => Promise<HistoryEntry[]>;
    addToHistory: (entry: HistoryEntry) => void;
    goBack: (params: GoBackRequest) => void;
    goHome: (params: GoHomeRequest) => void;
    goSelected: (index: number) => void;
    undo: (count: number) => Promise<string>;
    redo: (count: number) => Promise<string>;
    addToUndoStack: (params: AddToUndoStackRequest) => void;
    undoRedoState: () => Promise<UndoRedoStateResponse>;
    resetUndoRedoStack: () => void;
    joinProjectPath: (params: JoinProjectPathRequest) => Promise<JoinProjectPathResponse>;
    getThemeKind: () => Promise<ColorThemeKind>;
    updateCurrentArtifactLocation: (params: UpdatedArtifactsResponse) => Promise<ProjectStructureArtifactResponse>;
    handleApprovalPopupClose: (params: HandleApprovalPopupCloseRequest) => void;
    reopenApprovalView: (params: ReopenApprovalViewRequest) => void;
    saveEvalThread: (params: SaveEvalThreadRequest) => Promise<SaveEvalThreadResponse>;
    navigateReviewMode: (params: NavigateReviewModeRequest) => void;
}
