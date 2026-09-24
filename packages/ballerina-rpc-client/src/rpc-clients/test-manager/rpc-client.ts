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
    TestManagerServiceAPI, GetTestFunctionRequest, AddOrUpdateTestFunctionRequest,
    TestSourceEditResponse, GetTestFunctionResponse,
    getTestFunction, addTestFunction, updateTestFunction,
    GetTestFunctionNamesRequest, GetTestFunctionNamesResponse, getTestFunctionNames,
    EvaluationsRequest, GetEvaluationsResponse, getEvaluations, EvaluationFileResponse, getEvaluationFile,
    RunEvaluationsRequest, runEvaluations, StopEvaluationsRequest, stopEvaluations,
    EvaluationRunState, getEvaluationRunState, EvaluationActionRequest, runEvaluationAction,
    EvalsetActionRequest, runEvalsetAction,
    SourceUpdateResponse, GetEvalsetsRequest, GetEvalsetsResponse, getEvalsets,
    GetEvaluationHistoryRequest, GetEvaluationHistoryResponse, getEvaluationHistory,
    OpenEvaluationReportRequest, openEvaluationReport,
    GetEvaluationReportRequest, GetEvaluationReportResponse, getEvaluationReport,
    GitDiffRequest, GitDiffResponse, getGitDiff,
    RestoreGitSnapshotRequest, RestoreGitSnapshotResponse, restoreGitSnapshot
} from "@wso2/ballerina-core";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { Messenger } from "vscode-messenger-webview";

export class TestManagerServiceRpcClient implements TestManagerServiceAPI {
    private _messenger: Messenger;

    constructor(messenger: Messenger) {
        this._messenger = messenger;
    }

    getTestFunction(params: GetTestFunctionRequest): Promise<GetTestFunctionResponse> {
        return this._messenger.sendRequest(getTestFunction, HOST_EXTENSION, params);
    }

    addTestFunction(params: AddOrUpdateTestFunctionRequest): Promise<SourceUpdateResponse> {
        return this._messenger.sendRequest(addTestFunction, HOST_EXTENSION, params);
    }

    updateTestFunction(params: AddOrUpdateTestFunctionRequest): Promise<SourceUpdateResponse> {
        return this._messenger.sendRequest(updateTestFunction, HOST_EXTENSION, params);
    }

    getTestFunctionNames(params: GetTestFunctionNamesRequest): Promise<GetTestFunctionNamesResponse> {
        return this._messenger.sendRequest(getTestFunctionNames, HOST_EXTENSION, params);
    }

    getEvaluations(params: EvaluationsRequest): Promise<GetEvaluationsResponse> {
        return this._messenger.sendRequest(getEvaluations, HOST_EXTENSION, params);
    }

    getEvaluationFile(params: EvaluationsRequest): Promise<EvaluationFileResponse> {
        return this._messenger.sendRequest(getEvaluationFile, HOST_EXTENSION, params);
    }

    runEvaluations(params: RunEvaluationsRequest): Promise<void> {
        return this._messenger.sendRequest(runEvaluations, HOST_EXTENSION, params);
    }

    stopEvaluations(params: StopEvaluationsRequest): Promise<void> {
        return this._messenger.sendRequest(stopEvaluations, HOST_EXTENSION, params);
    }

    getEvaluationRunState(params: EvaluationsRequest): Promise<EvaluationRunState> {
        return this._messenger.sendRequest(getEvaluationRunState, HOST_EXTENSION, params);
    }

    runEvaluationAction(params: EvaluationActionRequest): Promise<void> {
        return this._messenger.sendRequest(runEvaluationAction, HOST_EXTENSION, params);
    }

    runEvalsetAction(params: EvalsetActionRequest): Promise<void> {
        return this._messenger.sendRequest(runEvalsetAction, HOST_EXTENSION, params);
    }

    getEvalsets(params: GetEvalsetsRequest): Promise<GetEvalsetsResponse> {
        return this._messenger.sendRequest(getEvalsets, HOST_EXTENSION, params);
    }

    getEvaluationHistory(params: GetEvaluationHistoryRequest): Promise<GetEvaluationHistoryResponse> {
        return this._messenger.sendRequest(getEvaluationHistory, HOST_EXTENSION, params);
    }

    openEvaluationReport(params: OpenEvaluationReportRequest): Promise<void> {
        return this._messenger.sendRequest(openEvaluationReport, HOST_EXTENSION, params);
    }

    getEvaluationReport(params: GetEvaluationReportRequest): Promise<GetEvaluationReportResponse> {
        return this._messenger.sendRequest(getEvaluationReport, HOST_EXTENSION, params);
    }

    getGitDiff(params: GitDiffRequest): Promise<GitDiffResponse> {
        return this._messenger.sendRequest(getGitDiff, HOST_EXTENSION, params);
    }

    restoreGitSnapshot(params: RestoreGitSnapshotRequest): Promise<RestoreGitSnapshotResponse> {
        return this._messenger.sendRequest(restoreGitSnapshot, HOST_EXTENSION, params);
    }

}

