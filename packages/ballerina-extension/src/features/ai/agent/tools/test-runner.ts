// Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import * as path from 'path';
import { tool } from 'ai';
import { z } from 'zod';
import { CopilotEventHandler } from '../../utils/events';
import { extension } from '../../../../BalExtensionContext';
import { spawnProcess, killProcessGroup } from './running-service-manager';
import { BALLERINA_COMMANDS } from '../../../project/cmds/cmd-runner';
import { DIAGNOSTICS_TOOL_NAME } from './diagnostics';
import { getWorkspaceTomlValues } from '../../../../utils';
import { refreshDefaultProviderToken } from '../../utils';

export const TEST_RUNNER_TOOL_NAME = "runTests";

export interface TestRunResult {
    output: string;
    exitCode: number;
}

const TestRunnerInputSchema = z.object({
    tests: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)).optional()
        .describe("Test function names to run. Omit to run every test in the project."),
});

type TestRunnerInput = z.infer<typeof TestRunnerInputSchema>;

// Evaluations call the model for every row and run, so one can take minutes.
const DEFAULT_TEST_TIMEOUT = 300000;

export function createTestRunnerTool(
    tempProjectPath: string,
    eventHandler: CopilotEventHandler
) {
    return tool({
        description: `Runs \`bal test\` in the current Ballerina project and returns the raw output.

**Prerequisites:** The project must compile cleanly. Always run \`${DIAGNOSTICS_TOOL_NAME}\` first and resolve all compilation errors before invoking this tool — tests cannot run on code that does not compile.

**REQUIRED before calling this tool:** You MUST tell the user what is being tested (e.g. which functions or scenarios the test cases cover). Do NOT invoke this tool without first informing the user.

**When to use:**
- After compilation is clean and the project contains test cases
- After modifying existing code, to confirm tests still pass
- After writing new test cases, to validate them

**Evaluations:** Tests in the \`evaluations\` group call an LLM for every row and run. Pass \`tests\` with only the evaluations you changed.

**Output:** Returns the full raw \`bal test\` output. Read the output carefully to identify which tests passed or failed, then fix any failures before marking the task as complete.
`,
        inputSchema: TestRunnerInputSchema,
        execute: async (input: TestRunnerInput, context?: { toolCallId?: string }): Promise<TestRunResult> => {
            const toolCallId = context?.toolCallId || `fallback-${Date.now()}`;
            const args = input.tests?.length ? [BALLERINA_COMMANDS.TEST, "--tests", input.tests.join(",")] : [BALLERINA_COMMANDS.TEST];
            const command = `bal ${args.join(" ")}`;

            eventHandler({
                type: "tool_call",
                toolName: TEST_RUNNER_TOOL_NAME,
                toolCallId,
                toolInput: { command },
            });

            const result = await runBallerinaTests(tempProjectPath, args);
            const status = result.exitCode === 0 ? "completed" : "error";

            eventHandler({
                type: "tool_result",
                toolName: TEST_RUNNER_TOOL_NAME,
                toolCallId,
                toolOutput: { status, summary: parseTestSummary(result.output), command, exitCode: result.exitCode, output: result.output },
            });

            return result;
        }
    });
}

function parseTestSummary(output: string): string {
    const passingMatch = output.match(/(\d+)\s+passing/);
    const failingMatch = output.match(/(\d+)\s+failing/);
    if (passingMatch) {
        const passing = parseInt(passingMatch[1]);
        const failing = failingMatch ? parseInt(failingMatch[1]) : 0;
        const total = passing + failing;
        return `Tests completed: ${passing}/${total} passing`;
    }
    return "Tests completed";
}

async function packagePaths(projectPath: string): Promise<string[]> {
    const packages = (await getWorkspaceTomlValues(projectPath))?.workspace?.packages ?? [];
    return packages.length > 0 ? packages.map((pkg) => path.join(projectPath, pkg)) : [projectPath];
}

// Same token refresh as a run from the Testing view.
async function refreshProviderTokens(packages: string[]): Promise<boolean> {
    for (const packagePath of packages) {
        if (!(await refreshDefaultProviderToken(packagePath))) {
            return false;
        }
    }
    return true;
}

// From a workspace root, `bal test` resolves the tests' relative paths against the workspace, not the package.
async function runBallerinaTests(projectPath: string, args: string[]): Promise<TestRunResult> {
    const packages = await packagePaths(projectPath);
    if (!(await refreshProviderTokens(packages))) {
        return {
            output: 'The tests did not run: the project uses the WSO2 default model provider, which is not configured. '
                + 'Ask the user to configure it, then run the tests again.',
            exitCode: -1,
        };
    }
    const results: TestRunResult[] = [];
    for (const packagePath of packages) {
        const result = await runInPackage(packagePath, args);
        const heading = packages.length > 1 ? `### Package ${path.relative(projectPath, packagePath)}\n` : '';
        results.push({ ...result, output: heading + result.output });
    }
    return {
        output: results.map((result) => result.output).join('\n'),
        exitCode: results.find((result) => result.exitCode !== 0)?.exitCode ?? 0,
    };
}

async function runInPackage(cwd: string, args: string[]): Promise<TestRunResult> {
    const balCmd = extension.ballerinaExtInstance.getBallerinaCmd();

    const logs: string[] = [];
    const { process: proc } = spawnProcess(
        balCmd,
        args,
        cwd,
        logs
    );

    let exited = false;
    let exitCode = -1;
    proc.on('close', (code) => {
        exitCode = code ?? -1;
        exited = true;
    });
    proc.on('error', (err) => {
        logs.push(`\nFailed to start process: ${err.message}\n`);
        exited = true;
    });

    // Wait for completion
    const startTime = Date.now();
    const pollInterval = 500;

    while (!exited && (Date.now() - startTime) < DEFAULT_TEST_TIMEOUT) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    const output = logs.join('');

    if (!exited) {
        await killProcessGroup(proc, 'SIGTERM');
        return {
            output: output + `\n\nTest execution timed out after ${DEFAULT_TEST_TIMEOUT}ms.`,
            exitCode: -1,
        };
    }

    return { output, exitCode };
}
