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

import { tool } from 'ai';
import { z } from 'zod';
import { CopilotEventHandler } from '../../utils/events';
import { extension } from '../../../../BalExtensionContext';
import { spawnProcess, killProcessGroup } from './running-service-manager';
import { BALLERINA_COMMANDS } from '../../../project/cmds/cmd-runner';
import { DIAGNOSTICS_TOOL_NAME } from './diagnostics';

export const TEST_RUNNER_TOOL_NAME = "runTests";

export interface TestRunResult {
    output: string;
    exitCode: number;
}

const TestRunnerInputSchema = z.object({});

const DEFAULT_TEST_TIMEOUT = 120000;

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

**Output:** Returns the full raw \`bal test\` output. Read the output carefully to identify which tests passed or failed, then fix any failures before marking the task as complete.
`,
        inputSchema: TestRunnerInputSchema,
        execute: async (_input: Record<string, never>, context?: { toolCallId?: string }): Promise<TestRunResult> => {
            const toolCallId = context?.toolCallId || `fallback-${Date.now()}`;

            eventHandler({
                type: "tool_call",
                toolName: TEST_RUNNER_TOOL_NAME,
                toolCallId,
                toolInput: { command: "bal test" },
            });

            const result = await runBallerinaTests(tempProjectPath);
            const status = result.exitCode === 0 ? "completed" : "error";

            eventHandler({
                type: "tool_result",
                toolName: TEST_RUNNER_TOOL_NAME,
                toolCallId,
                toolOutput: { status, summary: parseTestSummary(result.output), command: "bal test", exitCode: result.exitCode, output: result.output },
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

async function runBallerinaTests(cwd: string): Promise<TestRunResult> {
    const balCmd = extension.ballerinaExtInstance.getBallerinaCmd();

    const logs: string[] = [];
    const { process: proc } = spawnProcess(
        balCmd,
        [BALLERINA_COMMANDS.TEST],
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
