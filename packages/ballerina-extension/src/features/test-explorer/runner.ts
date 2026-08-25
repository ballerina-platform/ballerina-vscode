'use strict';
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

import { spawn } from 'child_process';
import { CancellationToken, TestRunRequest, TestMessage, TestRun, TestItem, debug, Uri, WorkspaceFolder, DebugConfiguration, workspace, TestRunProfileKind, commands, window } from 'vscode';
import { EVALUATION_GROUP, testController } from './activator';
import { StateMachine } from "../../stateMachine";
import { isTestFunctionItem, isTestGroupItem, isProjectGroupItem } from './discover';
import { extension } from '../../BalExtensionContext';
import { constructDebugConfig } from "../debugger";
const fs = require('fs');
import path from 'path';
import { EvaluationReportWebview } from '../../views/evaluation-report/webview';
import { notifyEvaluationHistoryUpdated } from '../../RPCLayer';
import { captureGitState, createSnapshot, pinSnapshot, ensureEvalReportsGitignored } from '../../utils/git-utils';
import { quoteShellPath } from '../../utils/config';
import { cleanAndValidateProject } from '../config-generator/configGenerator';
import { refreshDefaultProviderToken } from '../ai/utils';

/**
 * Extract project path from a test item
 * Test IDs have the format: test:${projectPath}:${fileName}:${functionName}
 */
function getProjectPathFromTestItem(test: TestItem): string | undefined {
    if (isTestFunctionItem(test)) {
        // ID: test:${projectPath}:${fileName}:${functionName} — projectPath may contain ':' on Windows
        const parts = test.id.split(':');
        if (parts.length >= 4 && parts[0] === 'test') {
            return parts.slice(1, -2).join(':');
        }
    } else if (isProjectGroupItem(test)) {
        // For project groups, we need to get a child test to extract the path
        let projectPath: string | undefined;
        test.children.forEach((child) => {
            if (!projectPath) {
                projectPath = getProjectPathFromTestItem(child);
            }
        });
        return projectPath;
    } else if (isTestGroupItem(test)) {
        // Extract from children (test functions) to avoid infinite recursion with parent project group
        let projectPath: string | undefined;
        test.children.forEach((child) => {
            if (!projectPath) {
                projectPath = getProjectPathFromTestItem(child);
            }
        });
        return projectPath;
    }
    return StateMachine.context().projectPath;
}

function isAiEvaluations(test: TestItem): boolean {
    // Check if the test item itself is the evaluations group
    if (isTestGroupItem(test) && test.label === EVALUATION_GROUP) {
        return true;
    }

    // Check if the test function's parent is the evaluations group
    if (isTestFunctionItem(test) && test.parent && test.parent.label === EVALUATION_GROUP) {
        return true;
    }

    // Check if the project group contains only evaluations groups
    if (isProjectGroupItem(test)) {
        // Return true only if all children are evaluation groups
        let allChildrenAreEvaluations = true;
        let hasChildren = false;

        test.children.forEach((child) => {
            hasChildren = true;
            if (!isTestGroupItem(child) || child.label !== EVALUATION_GROUP) {
                allChildrenAreEvaluations = false;
            }
        });

        return hasChildren && allChildrenAreEvaluations;
    }

    return false;
}

// Always invoked with the package dir as CWD — workaround for workspace `bal test` CWD bug.
function buildTestCommand(test: TestItem, executor: string, testCaseNames?: string[]): string {
    if (isAiEvaluations(test)) {
        const projectPath = getProjectPathFromTestItem(test);
        if (projectPath) { ensureEvalReportsGitignored(projectPath); }
        const testsPart = testCaseNames && testCaseNames.length > 0 ? ` --tests ${testCaseNames.join(',')}` : '';
        return `${quoteShellPath(executor)} test --groups ${EVALUATION_GROUP} --test-report --test-report-dir=${quoteShellPath('tests/evaluation-reports')}${testsPart}`;
    } else {
        const testsPart = testCaseNames && testCaseNames.length > 0 ? ` --tests ${testCaseNames.join(',')}` : '';
        return `${quoteShellPath(executor)} test --code-coverage${testsPart}`;
    }
}

async function handleEvalReport(run: TestRun, testItems: TestItem[], timeElapsed: number, projectPath: string, individualTest: boolean = false): Promise<boolean> {
    const reportPath = await findLatestEvaluationReport(projectPath);

    if (!reportPath) {
        testItems.forEach(item => run.failed(item, new TestMessage('No evaluation report found'), timeElapsed));
        return false;
    }

    // Read evaluation report for individual test results
    const reportJson = await readTestJson(reportPath);

    // moduleStatus can be at top level or nested under packages[]
    let moduleStatus;
    if (reportJson && reportJson["packages"]) {
        const packages = reportJson["packages"];
        moduleStatus = packages.flatMap((pkg: any) => pkg["moduleStatus"] ?? []);
    } else if (reportJson) {
        moduleStatus = reportJson["moduleStatus"];
    }

    let allPassed = true;

    if (moduleStatus) {
        for (const test of testItems) {
            const matches: { status: string; failureMessage?: string }[] = [];
            for (const status of moduleStatus) {
                const testResults = status["tests"] || [];
                for (const testResult of testResults) {
                    if (testResult.name === test.label || testResult.name.startsWith(`${test.label}#`)) {
                        matches.push(testResult);
                    }
                }
            }
            if (matches.length > 0) {
                const hasFailed = matches.some(m => m.status === TEST_STATUS.FAILED);
                const hasSkipped = matches.some(m => m.status === TEST_STATUS.SKIPPED);
                if (hasFailed) {
                    const failureMessages = matches
                        .filter(m => m.status === TEST_STATUS.FAILED)
                        .map(m => m.failureMessage || 'Evaluation failed');
                    run.failed(test, new TestMessage(failureMessages.join('\n')), timeElapsed);
                    allPassed = false;
                } else if (hasSkipped) {
                    run.skipped(test);
                } else {
                    run.passed(test, timeElapsed);
                }
            } else if (!individualTest) {
                run.failed(test, new TestMessage('Test not found in evaluation results'), timeElapsed);
                allPassed = false;
            }
        }
    } else {
        testItems.forEach(item => run.failed(item, new TestMessage('Could not read evaluation results'), timeElapsed));
        allPassed = false;
    }

    // Post-process and open the report
    try {
        await postProcessEvaluationReport(reportPath, projectPath);
    } catch (error) {
        console.error('Error processing evaluation report:', error);
    }

    notifyEvaluationHistoryUpdated();

    try {
        await openEvaluationReport(reportPath);
    } catch (error) {
        console.error('Error opening evaluation report:', error);
    }

    return allPassed;
}

async function postProcessEvaluationReport(reportPath: string, workingDirectory: string): Promise<void> {
    const gitState = await captureGitState(workingDirectory);

    if (gitState.commitSha !== null && gitState.isDirty) {
        const snapshotSha = await createSnapshot(workingDirectory);
        if (snapshotSha) {
            await pinSnapshot(workingDirectory, snapshotSha);
            gitState.commitSha = snapshotSha;
        }
    }

    if (gitState.commitSha !== null) {
        const rawData = fs.readFileSync(reportPath, 'utf-8');
        const jsonData = JSON.parse(rawData);
        jsonData.gitState = { commitSha: gitState.commitSha, isDirty: gitState.isDirty, branch: gitState.branch };
        fs.writeFileSync(reportPath, JSON.stringify(jsonData, null, 2), 'utf-8');
    }
}

export async function runHandler(request: TestRunRequest, token: CancellationToken) {
    // When request.include is undefined, it means "run all tests" (e.g. top bar Run Tests button)
    let include = request.include;
    if (!include) {
        const allItems: TestItem[] = [];
        testController.items.forEach((item) => allItems.push(item));
        if (allItems.length === 0) {
            return;
        }
        include = allItems;
    }
    const run = testController.createTestRun(request);

    if (request.profile?.kind == TestRunProfileKind.Debug) {
        const testFuncs: string[] = [];
        include.forEach((test) => {
            if (isTestFunctionItem(test)) {
                testFuncs.push(test.label);
            } else if (isTestGroupItem(test)) {
                test.children.forEach((child) => {
                    testFuncs.push(child.label);
                });
            }
        });
        startDebugging(true, testFuncs);
        return;
    }

    // Match the run/debug flow: clean up unused imports before invoking `bal test`.
    const projectPaths = new Set<string>();
    include.forEach((test) => {
        const projectPath = getProjectPathFromTestItem(test);
        if (projectPath) {
            projectPaths.add(projectPath);
        }
    });
    const langClient = extension.ballerinaExtInstance.langClient;
    for (const projectPath of projectPaths) {
        if (token.isCancellationRequested) {
            break;
        }
        await refreshDefaultProviderToken(projectPath);
        try {
            await cleanAndValidateProject(langClient, projectPath);
        } catch (err) {
            console.error(`Failed to clean project before test run: ${projectPath}`, err);
        }
    }

    // Handle Test Run
    include.forEach((test) => {
        if (token.isCancellationRequested) {
            run.skipped(test);
            return;
        }

        run.started(test);

        // Get the project path for this test
        const projectPath = getProjectPathFromTestItem(test);
        if (!projectPath) {
            run.failed(test, new TestMessage('Could not determine project path for test'));
            run.end();
            return;
        }

        let command: string;
        const executor = extension.ballerinaExtInstance.getBallerinaCmd();

        // Handle running all tests in a project group
        if (isProjectGroupItem(test)) {
            let testCaseNames: string[] = [];
            let testItems: TestItem[] = [];

            // Collect all test functions from the project
            // Children can be either test groups or test functions directly (when DEFAULT_GROUP is skipped)
            test.children.forEach((child) => {
                if (isTestFunctionItem(child)) {
                    // Test added directly to project (DEFAULT_GROUP was skipped)
                    testCaseNames.push(child.label);
                    testItems.push(child);
                    run.started(child);
                } else if (isTestGroupItem(child)) {
                    // Test group - iterate through its children
                    child.children.forEach((testFunc) => {
                        if (isTestFunctionItem(testFunc)) {
                            testCaseNames.push(testFunc.label);
                            testItems.push(testFunc);
                            run.started(testFunc);
                        }
                    });
                }
            });

            const isEval = isAiEvaluations(test);
            command = buildTestCommand(test, executor, testCaseNames.length > 0 ? testCaseNames : undefined);

            const startTime = Date.now();
            runCommand(command, projectPath, run).then(async ({ stdout }) => {
                const endTime = Date.now();
                const timeElapsed = calculateTimeElapsed(startTime, endTime, testItems);
                const reportPathOverride = extractTestReportPath(stdout);

                if (isEval) {
                    handleEvalReport(run, testItems, timeElapsed, projectPath).then((allPassed) => {
                        endGroup(test, allPassed, run);
                    }).catch(() => {
                        endGroup(test, false, run);
                    });
                } else {
                    reportTestResults(run, testItems, timeElapsed, projectPath, false, reportPathOverride).then(() => {
                        endGroup(test, true, run);
                    }).catch(() => {
                        endGroup(test, false, run);
                    });
                }
            }).catch((err) => {
                testItems.forEach((item) => run.failed(item, new TestMessage(`Failed to run bal test: ${err.message}`)));
                endGroup(test, false, run);
            });
        } else if (isTestGroupItem(test)) {
            let testCaseNames: string[] = [];
            let testItems: TestItem[] = [];
            test.children.forEach((child) => {
                const functionName = child.label;
                testCaseNames.push(functionName);
                testItems.push(child);
                run.started(child);
            });

            const isEval = isAiEvaluations(test);
            command = buildTestCommand(test, executor, testCaseNames);

            const startTime = Date.now();
            runCommand(command, projectPath, run).then(async ({ stdout }) => {
                const endTime = Date.now();
                const timeElapsed = calculateTimeElapsed(startTime, endTime, testItems);
                const reportPathOverride = extractTestReportPath(stdout);

                if (isEval) {
                    handleEvalReport(run, testItems, timeElapsed, projectPath).then((allPassed) => {
                        endGroup(test, allPassed, run);
                    }).catch(() => {
                        endGroup(test, false, run);
                    });
                } else {
                    reportTestResults(run, testItems, timeElapsed, projectPath, false, reportPathOverride).then(() => {
                        endGroup(test, true, run);
                    }).catch(() => {
                        endGroup(test, false, run);
                    });
                }
            }).catch((err) => {
                testItems.forEach((item) => run.failed(item, new TestMessage(`Failed to run bal test: ${err.message}`)));
                endGroup(test, false, run);
            });
        } else if (isTestFunctionItem(test)) {
            command = buildTestCommand(test, executor, [test.label]);
            const isEval = isAiEvaluations(test);

            const parentGroup = test.parent;
            let testItems: TestItem[] = [];
            if (parentGroup) {
                parentGroup.children.forEach((child) => {
                    if (isTestFunctionItem(child)) {
                        testItems.push(child);
                    }
                });
            }

            const startTime = Date.now();
            runCommand(command, projectPath, run).then(async ({ stdout }) => {
                const endTime = Date.now();
                const timeElapsed = calculateTimeElapsed(startTime, endTime, testItems);
                const reportPathOverride = extractTestReportPath(stdout);

                if (isEval) {
                    handleEvalReport(run, testItems, timeElapsed, projectPath, true).then((allPassed) => {
                        endGroup(test, allPassed, run);
                    }).catch(() => {
                        endGroup(test, false, run);
                    });
                } else {
                    reportTestResults(run, testItems, timeElapsed, projectPath, true, reportPathOverride).then(() => {
                        endGroup(test, true, run);
                    }).catch(() => {
                        endGroup(test, false, run);
                    });
                }
            }).catch((err) => {
                run.failed(test, new TestMessage(`Failed to run bal test: ${err.message}`));
                endGroup(test, false, run);
            });
        }
    });
}
/**
 * Calculate time elapsed per test item
 * @param startTime - Start time in milliseconds
 * @param endTime - End time in milliseconds
 * @param testItems - Array of test items
 * @returns Time elapsed per test item in milliseconds
 */
function calculateTimeElapsed(startTime: number, endTime: number, testItems: TestItem[]): number {
    return testItems.length > 0 ? (endTime - startTime) / testItems.length : (endTime - startTime);
}

const TEST_RESULTS_PATH = path.join("target", "report", "test_results.json").toString();

enum TEST_STATUS {
    PASSED = 'PASSED',
    FAILED = 'FAILURE',
    SKIPPED = 'SKIPPED',
}

async function reportTestResults(run: TestRun, testItems: TestItem[], timeElapsed: number, projectPath: string, individualTest: boolean = false, reportPathOverride?: string) {
    let testResultsPath: string;
    if (reportPathOverride) {
        testResultsPath = reportPathOverride;
    } else {
        const projectInfo = StateMachine.context().projectInfo;
        const workspacePath = StateMachine.context().workspacePath;
        testResultsPath = projectInfo?.children?.length > 0 && workspacePath
            ? path.join(workspacePath, TEST_RESULTS_PATH)
            : path.join(projectPath, TEST_RESULTS_PATH);
    }

    let testsJson: JSON | undefined = undefined;
    testsJson = await readTestJson(testResultsPath);
    if (!testsJson) {
        for (const test of testItems) {
            const testMessage: TestMessage = new TestMessage("Command failed");
            run.failed(test, testMessage, timeElapsed);
        }
        return;
    }

    // For workspace projects, test results are nested under packages[].moduleStatus
    // For single projects, they're directly at moduleStatus
    let moduleStatus;
    if (testsJson["packages"]) {
        // Workspace structure - find the matching package
        const projectName = path.basename(projectPath);
        const packages = testsJson["packages"];
        const matchingPackage = packages.find(pkg => pkg["projectName"] === projectName);

        if (matchingPackage) {
            moduleStatus = matchingPackage["moduleStatus"];
        } else {
            // If we can't find the specific package, try the first one
            moduleStatus = packages[0]?.["moduleStatus"];
        }
    } else {
        // Single project structure
        moduleStatus = testsJson["moduleStatus"];
    }

    if (!moduleStatus) {
        for (const test of testItems) {
            const testMessage: TestMessage = new TestMessage("No test results found");
            run.failed(test, testMessage, timeElapsed);
        }
        return;
    }

    for (const test of testItems) {
        let found = false;
        for (const status of moduleStatus) {
            const testResults = status["tests"];
            for (const testResult of testResults) {
                if (testResult.name !== test.label && !testResult.name.startsWith(`${test.label}#`)) {
                    continue;
                }

                if (testResult.status === TEST_STATUS.PASSED) {
                    run.passed(test, timeElapsed);
                    found = true;
                } else if (testResult.status === TEST_STATUS.FAILED) {
                    // test failed
                    const testMessage: TestMessage = new TestMessage(testResult.failureMessage);
                    run.failed(test, testMessage, timeElapsed);
                    found = true;
                } else if (testResult.status === TEST_STATUS.SKIPPED) {
                    // test skipped
                    run.skipped(test);
                    found = true;
                }
            }
            if (found) {
                break;
            }
        }
        if (found || individualTest) {
            continue;
        }
        // test failed
        const testMessage: TestMessage = new TestMessage("");
        run.failed(test, testMessage, timeElapsed);
    }
}

/** 
 * Read test json output.
 * @param file File path of the json.
 */
export async function readTestJson(file): Promise<JSON | undefined> {
    try {
        let rawdata = fs.readFileSync(file);
        return JSON.parse(rawdata);
    } catch {
        return undefined;
    }
}

async function findLatestEvaluationReport(workingDirectory: string): Promise<string | undefined> {
    const reportsDir = path.join(workingDirectory, 'tests', 'evaluation-reports');

    if (!fs.existsSync(reportsDir)) {
        return undefined;
    }

    try {
        const files = fs.readdirSync(reportsDir);
        const jsonFiles = files
            .filter((file: string) => file.endsWith('_test_results.json'))
            .map((file: string) => ({
                name: file,
                path: path.join(reportsDir, file),
                mtime: fs.statSync(path.join(reportsDir, file)).mtime
            }))
            .sort((a: { mtime: Date }, b: { mtime: Date }) => b.mtime.getTime() - a.mtime.getTime());

        if (jsonFiles.length > 0) {
            return jsonFiles[0].path;
        }
    } catch (error) {
        console.error('Error finding evaluation report:', error);
    }

    return undefined;
}

async function openEvaluationReport(reportPath: string): Promise<void> {
    try {
        window.showInformationMessage('Evaluation report generated');
        await EvaluationReportWebview.createOrShow(reportPath);
    } catch (error) {
        console.error('Failed to open evaluation report:', error);
        window.showErrorMessage('Failed to open evaluation report');
    }
}

function endGroup(test: TestItem, allPassed: boolean, run: TestRun) {
    if (allPassed) {
        run.passed(test);
    } else {
        run.failed(test, new TestMessage('Some tests failed!'));
    }
    run.end();
}

async function runCommand(command: string, projectPath: string, run?: TestRun): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        const proc = spawn(command, { shell: true, cwd: projectPath });

        proc.stdout.on('data', (data: Buffer) => {
            const str = data.toString();
            stdout += str;
            if (run) {
                run.appendOutput(str.replace(/\r?\n/g, '\r\n'));
            }
        });

        proc.stderr.on('data', (data: Buffer) => {
            const str = data.toString();
            stderr += str;
            if (run) {
                run.appendOutput(str.replace(/\r?\n/g, '\r\n'));
            }
        });

        proc.on('error', (err) => {
            reject(err);
        });

        // Always resolve — `bal test` exits non-zero on test failures but still emits a report.
        // We need stdout in both cases so the caller can locate the report file.
        proc.on('close', (code) => {
            resolve({ stdout, stderr, exitCode: code });
        });
    });
}

// Parses `bal test`'s "Generating Test Report\n\t<path>" line. Returns undefined if absent.
function extractTestReportPath(stdout: string): string | undefined {
    const match = stdout.match(/Generating Test Report\s+(\S.*?test_results\.json)/);
    return match ? match[1].trim() : undefined;
}

/**
 * Start debugging
 */
export async function startDebugging(testDebug: boolean, args: any[])
    : Promise<void> {
    const uri: Uri = Uri.parse(StateMachine.context().projectPath);
    const workspaceFolder: WorkspaceFolder | undefined = workspace.getWorkspaceFolder(uri);
    const debugConfig: DebugConfiguration = await constructDebugConfig(uri, testDebug, args);

    return debug.startDebugging(workspaceFolder, debugConfig).then(
        // Wait for debug session to be complete.
        () => {
            return new Promise<void>((resolve) => {
                debug.onDidTerminateDebugSession(() => {
                    resolve();
                });
            });
        },
        (ex) => console.log('Failed to start debugging tests' + ex),
    );
}
