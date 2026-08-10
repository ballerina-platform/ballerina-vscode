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
    AddOrUpdateTestFunctionRequest,
    GetTestFunctionRequest,
    GetTestFunctionResponse,
    GetTestFunctionNamesRequest,
    GetTestFunctionNamesResponse,
    STModification,
    SourceUpdateResponse,
    SyntaxTree,
    TestManagerServiceAPI,
    TestSourceEditResponse,
    GetEvalsetsRequest,
    GetEvalsetsResponse,
    EvalsetItem,
    GetEvaluationHistoryRequest,
    GetEvaluationHistoryResponse,
    OpenEvaluationReportRequest,
    EvaluationHistoryData,
    EvaluationTestHistory,
    EvaluationRun,
    EvaluationRunDataPoint,
    GetEvaluationReportRequest,
    GetEvaluationReportResponse,
    EvaluationReportData,
    GitDiffRequest,
    GitDiffResponse,
    RestoreGitSnapshotRequest,
    RestoreGitSnapshotResponse,
} from "@wso2/ballerina-core";
import { ModulePart, NodePosition, STKindChecker } from "@wso2/syntax-tree";
import * as fs from 'fs';
import { existsSync, writeFileSync } from "fs";
import { StateMachine } from "../../stateMachine";
import { updateSourceCode } from "../../utils/source-utils";
import * as vscode from 'vscode';
import * as path from 'path';
import { EvaluationReportWebview } from "../../views/evaluation-report/webview";
import { getDiffStat, getDiffFull, objectExists, restoreToCheckpoint } from "../../utils/git-utils";
import { getTestFunctionNames } from "../../utils/test-discovery";

export class TestServiceManagerRpcManager implements TestManagerServiceAPI {

    async updateTestFunction(params: AddOrUpdateTestFunctionRequest): Promise<SourceUpdateResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const targetFile = params.filePath;
                params.filePath = targetFile;
                const targetPosition: NodePosition = {
                    startLine: params.function.codedata.lineRange.startLine.line,
                    startColumn: params.function.codedata.lineRange.startLine.offset
                };
                const res: TestSourceEditResponse = await context.langClient.updateTestFunction(params);
                const artifacts = await updateSourceCode({ textEdits: res.textEdits, description: 'Test Function Update' });
                const result: SourceUpdateResponse = {
                    artifacts: artifacts
                };
                resolve(result);
            } catch (error) {
                console.log(error);
            }
        });

    }

    async addTestFunction(params: AddOrUpdateTestFunctionRequest): Promise<SourceUpdateResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const targetFile = params.filePath;
                params.filePath = targetFile;
                const res: TestSourceEditResponse = await context.langClient.addTestFunction(params);
                const artifacts = await updateSourceCode({ textEdits: res.textEdits, description: 'Test Function Creation' });
                const result: SourceUpdateResponse = {
                    artifacts: artifacts
                };
                resolve(result);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async getTestFunction(params: GetTestFunctionRequest): Promise<GetTestFunctionResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const res: GetTestFunctionResponse = await context.langClient.getTestFunction(params);
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async getTestFunctionNames(params: GetTestFunctionNamesRequest): Promise<GetTestFunctionNamesResponse> {
        try {
            const res = await StateMachine.context().langClient
                .getProjectTestFunctions({ projectPath: params.projectPath });
            return { names: res && 'result' in res ? getTestFunctionNames(res) : [] };
        } catch (error) {
            console.error('Failed to discover test function names:', error);
            return { names: [] };
        }
    }

    async getEvalsets(params: GetEvalsetsRequest): Promise<GetEvalsetsResponse> {
        return new Promise(async (resolve) => {
            try {
                const pattern = params.projectPath
                    ? new vscode.RelativePattern(vscode.Uri.file(params.projectPath), '**/tests/resources/evalsets/**/*.evalset.json')
                    : '**/tests/resources/evalsets/**/*.evalset.json';
                const evalsetFiles = await vscode.workspace.findFiles(pattern);
                const evalsets: EvalsetItem[] = [];

                for (const uri of evalsetFiles) {
                    try {
                        const content = await fs.promises.readFile(uri.fsPath, 'utf-8');
                        const evalsetData = JSON.parse(content);

                        // Validate the evalset structure
                        if (!evalsetData.threads || !Array.isArray(evalsetData.threads)) {
                            continue;
                        }

                        const threadCount = evalsetData.threads.length;
                        const name = evalsetData.name || path.basename(uri.fsPath, '.evalset.json');
                        const description = evalsetData.description || '';
                        const filePath = params.projectPath
                            ? path.relative(params.projectPath, uri.fsPath)
                            : uri.fsPath;

                        evalsets.push({
                            id: evalsetData.id || uri.fsPath,
                            name: name,
                            filePath: filePath,
                            threadCount: threadCount,
                            description: description
                        });
                    } catch (error) {
                        console.error(`Failed to parse evalset file ${uri.fsPath}:`, error);
                    }
                }

                resolve({ evalsets });
            } catch (error) {
                console.error('Failed to get evalsets:', error);
                resolve({ evalsets: [] });
            }
        });
    }

    async getEvaluationHistory(params: GetEvaluationHistoryRequest): Promise<GetEvaluationHistoryResponse> {
        return new Promise(async (resolve) => {
            try {
                const reportsDir = path.join(params.projectPath, "tests", "evaluation-reports");
                const data = this.loadReportData(reportsDir);
                resolve({ data });
            } catch (error) {
                console.error('Failed to get evaluation history:', error);
                resolve({ data: { tests: [], totalRunFiles: 0, projectNames: [] } });
            }
        });
    }

    async openEvaluationReport(params: OpenEvaluationReportRequest): Promise<void> {
        try {
            await EvaluationReportWebview.createOrShow(params.reportPath);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open evaluation report: ${error}`);
        }
    }

    async getEvaluationReport(params: GetEvaluationReportRequest): Promise<GetEvaluationReportResponse> {
        try {
            const reportPath = params.reportPath;
            if (!fs.existsSync(reportPath)) {
                return { data: { projectName: "Unknown", totalTests: 0, passed: 0, failed: 0, skipped: 0, moduleStatus: [] } };
            }
            const rawData = fs.readFileSync(reportPath, 'utf-8');
            const jsonData = JSON.parse(rawData);

            // Handle both single-project and workspace formats
            // Workspace format nests data under packages[]
            const resolvedData = jsonData.packages
                ? this.resolveWorkspaceReport(jsonData)
                : jsonData;

            const moduleStatus = (resolvedData.moduleStatus ?? []).map((mod: any) => ({
                name: mod.name,
                totalTests: mod.totalTests ?? 0,
                passed: mod.passed ?? 0,
                failed: mod.failed ?? 0,
                skipped: mod.skipped ?? 0,
                tests: (mod.tests ?? []).map((test: any) => ({
                    name: test.name,
                    status: test.status,
                    failureMessage: test.failureMessage,
                    isEvaluation: test.isEvaluation ?? true,
                    evaluationSummary: test.evaluationSummary ? {
                        evaluationRuns: (test.evaluationSummary.evaluationRuns ?? []).map((r: any) => ({
                            id: r.id,
                            passRate: r.passRate ?? 0,
                            outcomes: (r.outcomes ?? []).map((o: any) => ({
                                id: o.id,
                                passed: !o.errorMessage,
                                errorMessage: o.errorMessage,
                            })),
                        })),
                        targetPassRate: test.evaluationSummary.targetPassRate ?? 0.8,
                        observedPassRate: test.evaluationSummary.observedPassRate ?? 0,
                    } : undefined,
                })),
            }));

            const data: EvaluationReportData = {
                projectName: resolvedData.projectName ?? "Unknown",
                totalTests: resolvedData.totalTests ?? 0,
                passed: resolvedData.passed ?? 0,
                failed: resolvedData.failed ?? 0,
                skipped: resolvedData.skipped ?? 0,
                moduleStatus,
                gitState: jsonData.gitState,
            };

            return { data };
        } catch (error) {
            console.error('Failed to load evaluation report:', error);
            return { data: { projectName: "Unknown", totalTests: 0, passed: 0, failed: 0, skipped: 0, moduleStatus: [] } };
        }
    }

    async getGitDiff(params: GitDiffRequest): Promise<GitDiffResponse> {
        const [diffStat, diffFull] = await Promise.all([
            getDiffStat(params.projectPath, params.fromSha, params.toSha),
            getDiffFull(params.projectPath, params.fromSha, params.toSha),
        ]);
        return { diffStat, diffFull };
    }

    async restoreGitSnapshot(params: RestoreGitSnapshotRequest): Promise<RestoreGitSnapshotResponse> {
        try {
            const exists = await objectExists(params.projectPath, params.sha);
            if (!exists) {
                return {
                    success: false,
                    error: "Snapshot no longer available — it may have been garbage collected.",
                };
            }

            const result = await restoreToCheckpoint(params.projectPath, params.sha, params.isDirty);
            return { success: true, safetyStashSha: result.safetyStashSha };
        } catch (error: any) {
            return {
                success: false,
                error: error?.message ?? "Failed to restore checkpoint",
            };
        }
    }

    /**
     * Flatten a workspace-format report (with packages[]) into a single-project shape.
     * Merges moduleStatus from all packages so the rest of the code can treat it uniformly.
     */
    private resolveWorkspaceReport(jsonData: any): any {
        const packages: any[] = jsonData.packages ?? [];
        const moduleStatus = packages.flatMap((pkg: any) => pkg.moduleStatus ?? []);
        const projectName = packages[0]?.projectName ?? jsonData.workspaceName ?? "Unknown";
        return {
            projectName,
            totalTests: jsonData.totalTests ?? 0,
            passed: jsonData.passed ?? 0,
            failed: jsonData.failed ?? 0,
            skipped: jsonData.skipped ?? 0,
            moduleStatus,
        };
    }

    private parseDateFromFilename(filename: string): Date | undefined {
        const match = filename.match(
            /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d{3})/
        );
        if (!match) {
            return undefined;
        }
        const [, year, month, day, hour, minute, second, ms] = match;
        return new Date(
            Date.UTC(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hour),
                parseInt(minute),
                parseInt(second),
                parseInt(ms)
            )
        );
    }

    private loadReportData(reportsDir: string): EvaluationHistoryData {
        const testMap = new Map<string, EvaluationTestHistory>();
        const projectNames = new Set<string>();
        let totalRunFiles = 0;

        if (!fs.existsSync(reportsDir)) {
            return { tests: [], totalRunFiles: 0, projectNames: [] };
        }

        const files = fs.readdirSync(reportsDir);
        const jsonFiles = files
            .filter((f) => f.endsWith("_test_results.json"))
            .sort();

        for (const jsonFile of jsonFiles) {
            const date = this.parseDateFromFilename(jsonFile);
            if (!date) {
                continue;
            }

            let jsonData: any;
            try {
                jsonData = JSON.parse(
                    fs.readFileSync(path.join(reportsDir, jsonFile), "utf-8")
                );
            } catch {
                continue;
            }

            totalRunFiles++;

            const jsonReportPath = path.join(reportsDir, jsonFile);

            // Handle both single-project and workspace formats
            const resolvedData = jsonData.packages
                ? this.resolveWorkspaceReport(jsonData)
                : jsonData;

            const projectName: string = resolvedData.projectName ?? "Unknown";
            projectNames.add(projectName);

            const moduleStatus: any[] = resolvedData.moduleStatus ?? [];
            for (const mod of moduleStatus) {
                const tests: any[] = mod.tests ?? [];
                for (const test of tests) {
                    const testName: string = test.name;
                    const status: "PASSED" | "FAILURE" =
                        test.status === "PASSED" ? "PASSED" : "FAILURE";

                    const evalSummary = test.evaluationSummary ?? {};
                    const observedPassRate: number =
                        typeof evalSummary.observedPassRate === "number"
                            ? evalSummary.observedPassRate
                            : 0;
                    const targetPassRate: number =
                        typeof evalSummary.targetPassRate === "number"
                            ? evalSummary.targetPassRate
                            : 0.8;

                    const evaluationRuns: EvaluationRun[] = (
                        evalSummary.evaluationRuns ?? []
                    ).map((r: any) => ({
                        id: r.id,
                        passRate: r.passRate ?? 0,
                        outcomes: (r.outcomes ?? []).map((o: any) => ({
                            id: o.id,
                            passed: !o.errorMessage,
                            errorMessage: o.errorMessage,
                        })),
                    }));

                    const run: EvaluationRunDataPoint = {
                        date: date.toISOString(),
                        passRate: observedPassRate,
                        targetPassRate,
                        status,
                        evaluationRuns,
                        jsonReportPath,
                        failureMessage: test.failureMessage,
                        gitState: jsonData.gitState,
                    };

                    if (!testMap.has(testName)) {
                        testMap.set(testName, {
                            testName,
                            runs: [],
                            projectName,
                        });
                    }
                    testMap.get(testName)!.runs.push(run);
                }
            }
        }

        const tests = Array.from(testMap.values());
        for (const t of tests) {
            t.runs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        }

        return {
            tests,
            totalRunFiles,
            projectNames: Array.from(projectNames),
        };
    }
}
