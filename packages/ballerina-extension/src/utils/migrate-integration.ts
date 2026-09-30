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

import { DownloadProgress } from "@wso2/ballerina-core";
import { exec } from "child_process";
import { extension } from "../BalExtensionContext";
import { debug } from "./logger";
import { quoteShellPath } from "./config";
import { decideMigrationToolPullOutcome } from "./migration-tool-pull-outcome";

const PROGRESS_COMPLETE = 100;
// A busy or unresponsive language server must not leave the wizard on "Finalizing...".
const LS_CHECK_TIMEOUT_MS = 10000;

/**
 * Executes `bal tool pull <tool>` without a version, so the newest version compatible with the
 * Ballerina distribution is pulled and activated, and sends progress notifications to the webview
 * client via RPC. Includes 5-minute timeout.
 *
 * Whether the wizard may continue is decided after the command exits, from the language server's
 * check of the active tool against `requiredVersion` (see `decideMigrationToolPullOutcome`).
 *
 * @param migrationToolName The alias for the Ballerina tool to pull (e.g., "migrate-tibco", "migrate-mule").
 * @param requiredVersion The minimum tool version the language server accepts (e.g., "1.2.13").
 * @param isActiveToolCompatible Asks the language server whether the active tool meets `requiredVersion`;
 *        resolves to undefined when that cannot be determined. Treated as undefined if it takes longer
 *        than `LS_CHECK_TIMEOUT_MS`.
 * @returns A promise that resolves when the operation is complete or rejects on failure.
 */
export async function pullMigrationTool(
    migrationToolName: string,
    requiredVersion: string,
    isActiveToolCompatible: () => Promise<boolean | undefined>
): Promise<void> {
    // 1. Initial validation and command mapping
    if (!migrationToolName) {
        const errorMessage = "Migration tool name is required";
        return Promise.reject(new Error(errorMessage));
    }

    if (!requiredVersion) {
        const errorMessage = "Migration tool version is required";
        return Promise.reject(new Error(errorMessage));
    }

    const toolCommandSet = new Set(["migrate-tibco", "migrate-mule"]);

    if (!toolCommandSet.has(migrationToolName)) {
        const errorMessage = `Unsupported migration tool: ${migrationToolName}`;
        return Promise.reject(new Error(errorMessage));
    }

    const ballerinaCmd = extension.ballerinaExtInstance.getBallerinaCmd();
    const command = `${quoteShellPath(ballerinaCmd)} tool pull ${migrationToolName}`;
    debug(`Executing migration tool pull command: ${command}`);

    // 2. This function now returns a promise that wraps the exec lifecycle
    return new Promise<void>((resolve, reject) => {
        // Helper to send notifications to the webview and fire the VSCode-style event
        const sendProgress = (progress: DownloadProgress) => {
            extension.ballerinaExtInstance.notifyDownloadProgress(progress);
        };

        // The outcome is reported once: either the process could not run, or it exited.
        let settled = false;
        const fail = (message: string, error: Error = new Error(message)) => {
            if (settled) {
                return;
            }
            settled = true;
            sendProgress({
                message,
                success: false,
                step: -1,
            });
            reject(error);
        };

        // Send initial progress update
        sendProgress({
            message: "Initializing tool download...",
            percentage: 0,
            success: false,
            step: 1,
        });

        const childProcess = exec(command, {
            maxBuffer: 1024 * 1024,
            timeout: 300000 // 5 minutes timeout
        });

        let accumulatedStdout = "";
        let lastStderrLine = "";
        let progressReported = 0;

        // 3. Process the command's standard output with carriage return handling
        childProcess.stdout?.on("data", (data: Buffer) => {
            const output = data.toString();
            accumulatedStdout += output;
            debug(`Tool pull stdout chunk: ${output.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}`);

            // Handle carriage return progress updates - split by \r and take the last meaningful line
            const lines = output.split('\r');
            const lastLine = lines[lines.length - 1] || lines[lines.length - 2] || '';

            // Case A: Tool is already downloaded. The CLI may still be activating it, so success
            // is reported only after the process exits.
            if (accumulatedStdout.includes("is already available locally")) {
                if (progressReported < PROGRESS_COMPLETE) {
                    progressReported = PROGRESS_COMPLETE;
                    sendProgress({
                        message: "Tool is already downloaded. Finalizing...",
                        percentage: PROGRESS_COMPLETE,
                        success: false,
                        step: 2,
                    });
                }
            }
            // Case B: Download is complete (check for success message)
            else if (accumulatedStdout.includes("pulled from central successfully")) {
                if (progressReported < PROGRESS_COMPLETE) {
                    progressReported = PROGRESS_COMPLETE;
                    sendProgress({
                        message: "Download complete. Finalizing...",
                        percentage: PROGRESS_COMPLETE,
                        success: false, // Not fully successful until the process closes with code 0
                        step: 2,
                    });
                }
            }
            // Case C: Parse the percentage from the progress bar output
            else {
                // Look for percentage in the current line (handles carriage return updates)
                const percentageMatch = lastLine.match(/\s+(\d{1,3})\s*%/);

                if (percentageMatch) {
                    const currentPercentage = parseInt(percentageMatch[1], 10);

                    // Update progress if it's a valid number and moving forward
                    if (!isNaN(currentPercentage) && currentPercentage > progressReported && currentPercentage <= PROGRESS_COMPLETE) {
                        progressReported = currentPercentage;

                        // Extract download info from progress line if available
                        const sizeMatch = lastLine.match(/(\d+)\/(\d+)\s+KB/);
                        let message = `Downloading...`;

                        if (sizeMatch) {
                            const downloaded = parseInt(sizeMatch[1], 10);
                            const total = parseInt(sizeMatch[2], 10);
                            message = `Downloading... ${currentPercentage}% (${Math.round(downloaded / 1024)}/${Math.round(total / 1024)} MB)`;
                        }

                        sendProgress({
                            message,
                            percentage: currentPercentage,
                            success: false,
                            step: 2,
                        });
                    }
                }
                // Also check for any percentage in the accumulated output as fallback
                else {
                    const allPercentageMatches = output.match(/(\d{1,3})\s*%/g);
                    if (allPercentageMatches) {
                        const lastMatch = allPercentageMatches[allPercentageMatches.length - 1];
                        const currentPercentage = parseInt(lastMatch, 10);

                        if (!isNaN(currentPercentage) && currentPercentage > progressReported && currentPercentage <= PROGRESS_COMPLETE) {
                            progressReported = currentPercentage;
                            sendProgress({
                                message: `Downloading... ${currentPercentage}%`,
                                percentage: currentPercentage,
                                success: false,
                                step: 2,
                            });
                        }
                    }
                }
            }
        });

        // 4. Keep standard error for the final message. A failed pull is not fatal on its own:
        // an already installed compatible tool still lets the migration run.
        childProcess.stderr?.on("data", (data: Buffer) => {
            const errorOutput = data.toString().trim();
            debug(`Tool pull stderr: ${errorOutput}`);
            if (errorOutput.length > 0) {
                lastStderrLine = errorOutput.split(/\r?\n/).pop() ?? errorOutput;
            }
        });

        // 5. Handle the definitive end of the process (also reached when the timeout kills it)
        childProcess.on("close", async (code, signal) => {
            debug(`Tool pull command exited with code ${code}${signal ? ` (signal ${signal})` : ""}`);
            if (settled) {
                return;
            }

            const isAlreadyInstalled = accumulatedStdout.includes("is already available locally");
            const pullSucceeded = code === 0 || (code === 1 && isAlreadyInstalled);
            const pullError = signal === "SIGTERM" ? "Download timed out after 5 minutes." : lastStderrLine;

            let timer: ReturnType<typeof setTimeout> | undefined;
            const activeToolCompatible = await Promise.race([
                isActiveToolCompatible().catch((error) => {
                    debug(`Could not check the installed '${migrationToolName}' version: ${error}`);
                    return undefined;
                }),
                new Promise<undefined>((resolveTimeout) => {
                    timer = setTimeout(() => {
                        debug(`Checking the installed '${migrationToolName}' version timed out after ${LS_CHECK_TIMEOUT_MS} ms`);
                        resolveTimeout(undefined);
                    }, LS_CHECK_TIMEOUT_MS);
                }),
            ]);
            clearTimeout(timer);

            const outcome = decideMigrationToolPullOutcome({
                toolName: migrationToolName,
                requiredVersion,
                pullSucceeded,
                activeToolCompatible,
                pullError,
            });
            debug(`Migration tool pull outcome: ${outcome.message}`);

            if (!outcome.success) {
                fail(outcome.message);
                return;
            }
            settled = true;
            sendProgress({
                message: outcome.message,
                percentage: PROGRESS_COMPLETE,
                success: true,
                step: 3,
            });
            resolve();
        });

        // Handle process execution errors (e.g., command not found)
        childProcess.on("error", (error) => {
            debug(`Tool pull process error: ${error.message}`);
            fail(`Failed to execute command: ${error.message}`);
        });
    });
}
