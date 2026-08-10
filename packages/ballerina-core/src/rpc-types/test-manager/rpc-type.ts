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
import { NotificationType, RequestType } from "vscode-messenger-common";
import { SourceUpdateResponse } from "../service-designer/interfaces";

const _preFix = "test-manager";
export const getTestFunction: RequestType<GetTestFunctionRequest, GetTestFunctionResponse> =
    { method: `${_preFix}/getTestFunction` };
export const addTestFunction: RequestType<AddOrUpdateTestFunctionRequest, SourceUpdateResponse> =
    { method: `${_preFix}/addTestFunction` };
export const updateTestFunction: RequestType<AddOrUpdateTestFunctionRequest, SourceUpdateResponse> =
    { method: `${_preFix}/updateTestFunction` };

export interface GetTestFunctionNamesRequest {
    projectPath: string;
}

export interface GetTestFunctionNamesResponse {
    names: string[];
}

export const getTestFunctionNames: RequestType<GetTestFunctionNamesRequest, GetTestFunctionNamesResponse> =
    { method: `${_preFix}/getTestFunctionNames` };

export interface EvalsetItem {
    id: string;
    name: string;
    filePath: string;
    threadCount: number;
    description?: string;
}

export interface GetEvalsetsRequest {
    projectPath?: string;
}

export interface GetEvalsetsResponse {
    evalsets: EvalsetItem[];
}

export const getEvalsets: RequestType<GetEvalsetsRequest, GetEvalsetsResponse> =
    { method: `${_preFix}/getEvalsets` };

// ── Evaluation History types ──────────────────────────────────────────────────

export interface EvaluationOutcomeResult {
    id: string;
    passed: boolean;
    errorMessage?: string;
}

export interface EvaluationRun {
    id: number;
    passRate: number;
    outcomes: EvaluationOutcomeResult[];
}

export interface EvaluationRunDataPoint {
    date: string; // ISO string
    passRate: number;
    targetPassRate: number;
    status: "PASSED" | "FAILURE";
    evaluationRuns: EvaluationRun[];
    jsonReportPath?: string;
    failureMessage?: string;
    gitState?: GitState;
}

export interface EvaluationTestHistory {
    testName: string;
    runs: EvaluationRunDataPoint[];
    projectName: string;
}

export interface EvaluationHistoryData {
    tests: EvaluationTestHistory[];
    totalRunFiles: number;
    projectNames: string[];
}

export interface GetEvaluationHistoryRequest {
    projectPath: string;
}

export interface GetEvaluationHistoryResponse {
    data: EvaluationHistoryData;
}

export interface OpenEvaluationReportRequest {
    reportPath: string;
}

export const getEvaluationHistory: RequestType<GetEvaluationHistoryRequest, GetEvaluationHistoryResponse> =
    { method: `${_preFix}/getEvaluationHistory` };

export const openEvaluationReport: RequestType<OpenEvaluationReportRequest, void> =
    { method: `${_preFix}/openEvaluationReport` };

// ── Individual Evaluation Report types ──────────────────────────────────────

export interface EvaluationReportTestResult {
    name: string;
    status: "PASSED" | "FAILURE" | "SKIPPED";
    failureMessage?: string;
    isEvaluation: boolean;
    evaluationSummary?: {
        evaluationRuns: EvaluationRun[];
        targetPassRate: number;
        observedPassRate: number;
    };
}

export interface EvaluationReportModuleStatus {
    name: string;
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    tests: EvaluationReportTestResult[];
}

export interface EvaluationReportData {
    projectName: string;
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    moduleStatus: EvaluationReportModuleStatus[];
    gitState?: GitState;
}

export interface GetEvaluationReportRequest {
    reportPath: string;
}

export interface GetEvaluationReportResponse {
    data: EvaluationReportData;
}

export const getEvaluationReport: RequestType<GetEvaluationReportRequest, GetEvaluationReportResponse> =
    { method: `${_preFix}/getEvaluationReport` };

// ── Git State types ──────────────────────────────────────────────────────────

export interface GitState {
    commitSha: string | null;
    isDirty: boolean;
    branch: string | null;
}

export interface GitDiffRequest {
    projectPath: string;
    fromSha: string;
    toSha: string;
}

export interface GitDiffResponse {
    diffStat: string;
    diffFull: string;
}

export const getGitDiff: RequestType<GitDiffRequest, GitDiffResponse> =
    { method: `${_preFix}/getGitDiff` };

// ── Restore Git Snapshot types ───────────────────────────────────────────────

export interface RestoreGitSnapshotRequest {
    projectPath: string;
    sha: string;
    isDirty: boolean;
}

export interface RestoreGitSnapshotResponse {
    success: boolean;
    error?: string;
    safetyStashSha?: string;
}

export const restoreGitSnapshot: RequestType<RestoreGitSnapshotRequest, RestoreGitSnapshotResponse> =
    { method: `${_preFix}/restoreGitSnapshot` };

// Broadcast when a new evaluation report has been written to disk, so open
// Evaluation History panels can re-fetch instead of requiring a reopen.
export const evaluationHistoryUpdated: NotificationType<void> =
    { method: `${_preFix}/evaluationHistoryUpdated` };
