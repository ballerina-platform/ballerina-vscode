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
import * as crypto from 'crypto';
import { tool } from 'ai';
import { z } from 'zod';
import { CopilotEventHandler } from '../../utils/events';
import { extension } from '../../../../BalExtensionContext';
import { RunningServicesManager, spawnProcess, killProcessGroup } from './running-service-manager';
import { DIAGNOSTICS_TOOL_NAME } from './diagnostics';
import { BALLERINA_GET_LOGS_TOOL_NAME } from './ballerina-get-logs';
import { BALLERINA_STOP_TOOL_NAME } from './ballerina-stop';
import { resolvePackageBasePath } from './path-utils';
import { getRunCommand } from '../../../project/cmds/cmd-runner';

export const BALLERINA_RUN_TOOL_NAME = "runBallerinaPackage";

const BallerinaRunInputSchema = z.object({
    runType: z.enum(["main", "service"]),
    packagePath: z.string().optional().describe("Relative path to the package directory from the project root. Leave empty for the default/root package."),
    timeout: z.number().optional().describe("Timeout in milliseconds for main programs. Default: 120000. Ignored for services."),
});

const DEFAULT_MAIN_TIMEOUT = 120000;
const DEFAULT_SERVICE_READY_TIMEOUT = 60000;

export function createBallerinaRunTool(
    tempProjectPath: string,
    runningServices: RunningServicesManager,
    eventHandler: CopilotEventHandler
) {
    return tool({
        description: `Runs a Ballerina package using \`bal run\`.

**Prerequisites:** The project must compile cleanly. Always run \`${DIAGNOSTICS_TOOL_NAME}\` first and resolve all compilation errors before invoking this tool.

**Modes:**
- \`service\`: Starts a long-running service. Returns immediately with a \`taskId\`. Use \`${BALLERINA_GET_LOGS_TOOL_NAME}\` to check output and \`${BALLERINA_STOP_TOOL_NAME}\` to stop it.
- \`main\`: Runs a main function to completion. Waits for the program to exit and returns its output.

**Timeout for main programs:** Always set a generous timeout based on the code complexity (e.g., loops, delays, data processing). The default 120s is a safe choice — do not use small timeouts unless the program is trivially simple.

**REQUIRED before calling this tool:** You MUST tell the user what you are about to run and why.
`,
        inputSchema: BallerinaRunInputSchema,
        execute: async (input, context?: { toolCallId?: string }) => {
            const toolCallId = context?.toolCallId || `fallback-${Date.now()}`;

            eventHandler({
                type: "tool_call",
                toolName: BALLERINA_RUN_TOOL_NAME,
                toolCallId,
                toolInput: { command: "bal run", runType: input.runType },
            });

            const result = await executeRun(input, tempProjectPath, runningServices);

            eventHandler({
                type: "tool_result",
                toolName: BALLERINA_RUN_TOOL_NAME,
                toolCallId,
                toolOutput: { status: result.status, command: "bal run", exitCode: result.exitCode, output: result.output },
            });

            return result;
        }
    });
}

export async function executeRun(
    input: z.infer<typeof BallerinaRunInputSchema>,
    tempProjectPath: string,
    runningServices: RunningServicesManager
): Promise<Record<string, unknown>> {
    // Validate and resolve packagePath. The helper rejects directory traversal
    // and absolute paths, and requires packagePath when running inside a
    // workspace project — without this, an agent-supplied path could escape
    // tempProjectPath and `bal run` would execute in an arbitrary directory.
    let cwd: string;
    try {
        cwd = resolvePackageBasePath(tempProjectPath, input.packagePath);
    } catch (e: any) {
        console.error("[BallerinaRun] Invalid packagePath:", e?.message);
        return {
            status: "error",
            exitCode: -1,
            output: "",
            message: e?.message ?? "Invalid packagePath",
        };
    }

    const balCmd = extension.ballerinaExtInstance.getBallerinaCmd();
    const runCmd = getRunCommand();
    const taskId = crypto.randomUUID().slice(0, 4);
    const packageName = input.packagePath || path.basename(tempProjectPath);

    const logs: string[] = [];
    const { process: proc } = spawnProcess(
        balCmd,
        [runCmd],
        cwd,
        logs
    );

    const service = {
        taskId,
        process: proc,
        logs,
        logCursor: 0,
        packagePath: cwd,
        startedAt: Date.now(),
        exited: false,
        exitCode: -1,
    };

    runningServices.register(service);

    if (input.runType === "service") {
        const readyResult = await waitForServiceReady(service, DEFAULT_SERVICE_READY_TIMEOUT);

        if (!readyResult.ready) {
            await killProcessGroup(proc, 'SIGTERM');
            runningServices.remove(taskId);
            return {
                status: "error",
                exitCode: service.exitCode,
                output: readyResult.logs,
                message: readyResult.timedOut
                    ? "Service did not become ready within the timeout. Check output for details."
                    : "Service exited before becoming ready. Check output for details.",
            };
        }

        return {
            status: "started",
            taskId,
            output: readyResult.logs,
            message: `Service is running. Use ${BALLERINA_GET_LOGS_TOOL_NAME} to check further output, ${BALLERINA_STOP_TOOL_NAME} to stop it.`,
        };
    }

    // Main mode: wait for completion
    const timeout = input.timeout ?? DEFAULT_MAIN_TIMEOUT;
    const completionResult = await waitForCompletion(service, timeout);

    if (completionResult.timedOut) {
        await killProcessGroup(proc, 'SIGTERM');
        runningServices.remove(taskId);
        return {
            status: "timeout",
            output: completionResult.logs,
            message: `Program did not complete within ${timeout}ms. It may be a long-running service — use runType "service" instead.`,
        };
    }

    runningServices.remove(taskId);
    return {
        status: service.exitCode === 0 ? "completed" : "error",
        exitCode: service.exitCode,
        output: completionResult.logs,
        message: service.exitCode === 0
            ? "Program completed successfully."
            : "Build or runtime error. Check output for details.",
    };
}

async function waitForServiceReady(
    service: { exited: boolean; exitCode: number | null; logs: string[] },
    timeout: number
): Promise<{ ready: boolean; logs: string; timedOut: boolean }> {
    const startTime = Date.now();
    const pollInterval = 200;

    return new Promise((resolve) => {
        const check = () => {
            const logs = service.logs.join('');

            if (logs.includes('Running executable')) {
                resolve({ ready: true, logs, timedOut: false });
                return;
            }

            if (service.exited) {
                resolve({ ready: false, logs, timedOut: false });
                return;
            }

            if (Date.now() - startTime >= timeout) {
                resolve({ ready: false, logs, timedOut: true });
                return;
            }

            setTimeout(check, pollInterval);
        };

        check();
    });
}

async function waitForCompletion(
    service: { exited: boolean; exitCode: number | null; logs: string[] },
    timeout: number
): Promise<{ logs: string; timedOut: boolean }> {
    return new Promise((resolve) => {
        const startTime = Date.now();
        const pollInterval = 500;

        const timer = setTimeout(() => {
            // Yield to the event loop once so a pending 'close' event can fire
            setImmediate(() => {
                const logs = service.logs.join('');
                if (service.exited) {
                    resolve({ logs, timedOut: false });
                } else {
                    resolve({ logs, timedOut: true });
                }
            });
        }, timeout);

        const check = () => {
            if (service.exited) {
                clearTimeout(timer);
                resolve({ logs: service.logs.join(''), timedOut: false });
                return;
            }
            setTimeout(check, pollInterval);
        };

        check();
    });
}
