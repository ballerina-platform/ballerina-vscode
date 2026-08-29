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

import { GetTestFunctionRequest, GetTestFunctionResponse, AddOrUpdateTestFunctionRequest } from "../../interfaces/extended-lang-client";
import { SourceUpdateResponse } from "../service-designer/interfaces";
import {
    GetTestFunctionNamesRequest, GetTestFunctionNamesResponse,
    GetEvalsetsRequest, GetEvalsetsResponse,
    GetEvaluationHistoryRequest, GetEvaluationHistoryResponse,
    OpenEvaluationReportRequest,
    GetEvaluationReportRequest, GetEvaluationReportResponse,
    GitDiffRequest, GitDiffResponse,
    RestoreGitSnapshotRequest, RestoreGitSnapshotResponse
} from "./rpc-type";

export interface TestManagerServiceAPI {
    updateTestFunction: (params: AddOrUpdateTestFunctionRequest) => Promise<SourceUpdateResponse>;
    addTestFunction: (params: AddOrUpdateTestFunctionRequest) => Promise<SourceUpdateResponse>;
    getTestFunction: (params: GetTestFunctionRequest) => Promise<GetTestFunctionResponse>;
    getTestFunctionNames: (params: GetTestFunctionNamesRequest) => Promise<GetTestFunctionNamesResponse>;
    getEvalsets: (params: GetEvalsetsRequest) => Promise<GetEvalsetsResponse>;
    getEvaluationHistory: (params: GetEvaluationHistoryRequest) => Promise<GetEvaluationHistoryResponse>;
    openEvaluationReport: (params: OpenEvaluationReportRequest) => Promise<void>;
    getEvaluationReport: (params: GetEvaluationReportRequest) => Promise<GetEvaluationReportResponse>;
    getGitDiff: (params: GitDiffRequest) => Promise<GitDiffResponse>;
    restoreGitSnapshot: (params: RestoreGitSnapshotRequest) => Promise<RestoreGitSnapshotResponse>;
}
