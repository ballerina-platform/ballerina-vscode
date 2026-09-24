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
    addTestFunction, getTestFunction, GetTestFunctionRequest,
    getTestFunctionNames, GetTestFunctionNamesRequest,
    getEvaluations, EvaluationsRequest, getEvaluationFile,
    runEvaluations, RunEvaluationsRequest,
    stopEvaluations, StopEvaluationsRequest, getEvaluationRunState,
    runEvaluationAction, EvaluationActionRequest,
    runEvalsetAction, EvalsetActionRequest,
    AddOrUpdateTestFunctionRequest, updateTestFunction, getEvalsets, GetEvalsetsRequest,
    getEvaluationHistory, GetEvaluationHistoryRequest,
    openEvaluationReport, OpenEvaluationReportRequest,
    getEvaluationReport, GetEvaluationReportRequest,
    getGitDiff, GitDiffRequest,
    restoreGitSnapshot, RestoreGitSnapshotRequest
} from "@wso2/ballerina-core";
import { Messenger } from "vscode-messenger";
import { TestServiceManagerRpcManager } from "./rpc-manager";

export function registerTestManagerRpcHandlers(messenger: Messenger) {
    const rpcManger = new TestServiceManagerRpcManager();
    messenger.onRequest(getTestFunction, (args: GetTestFunctionRequest) => rpcManger.getTestFunction(args));
    messenger.onRequest(addTestFunction, (args: AddOrUpdateTestFunctionRequest) => rpcManger.addTestFunction(args));
    messenger.onRequest(updateTestFunction, (args: AddOrUpdateTestFunctionRequest) => rpcManger.updateTestFunction(args));
    messenger.onRequest(getTestFunctionNames, (args: GetTestFunctionNamesRequest) => rpcManger.getTestFunctionNames(args));
    messenger.onRequest(getEvaluations, (args: EvaluationsRequest) => rpcManger.getEvaluations(args));
    messenger.onRequest(getEvaluationFile, (args: EvaluationsRequest) => rpcManger.getEvaluationFile(args));
    messenger.onRequest(runEvaluations, (args: RunEvaluationsRequest) => rpcManger.runEvaluations(args));
    messenger.onRequest(stopEvaluations, (args: StopEvaluationsRequest) => rpcManger.stopEvaluations(args));
    messenger.onRequest(getEvaluationRunState, (args: EvaluationsRequest) => rpcManger.getEvaluationRunState(args));
    messenger.onRequest(runEvaluationAction, (args: EvaluationActionRequest) => rpcManger.runEvaluationAction(args));
    messenger.onRequest(runEvalsetAction, (args: EvalsetActionRequest) => rpcManger.runEvalsetAction(args));
    messenger.onRequest(getEvalsets, (args: GetEvalsetsRequest) => rpcManger.getEvalsets(args));
    messenger.onRequest(getEvaluationHistory, (args: GetEvaluationHistoryRequest) => rpcManger.getEvaluationHistory(args));
    messenger.onRequest(openEvaluationReport, (args: OpenEvaluationReportRequest) => rpcManger.openEvaluationReport(args));
    messenger.onRequest(getEvaluationReport, (args: GetEvaluationReportRequest) => rpcManger.getEvaluationReport(args));
    messenger.onRequest(getGitDiff, (args: GitDiffRequest) => rpcManger.getGitDiff(args));
    messenger.onRequest(restoreGitSnapshot, (args: RestoreGitSnapshotRequest) => rpcManger.restoreGitSnapshot(args));
}

