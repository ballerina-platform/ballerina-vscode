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

import * as vscode from 'vscode';
import child_process from 'child_process';
import { CommandResponse } from '@wso2/ballerina-core';

export async function runBackgroundTerminalCommand(command: string) {
    return new Promise<CommandResponse>(function (resolve) {
        child_process.exec(`${command}`, async (err, stdout, stderr) => {
            if (err) {
                resolve({
                    error: true,
                    message: stderr
                });
            } else {
                resolve({
                    error: false,
                    message: stdout
                });
            }
        });
    });
}

/**
 * Run a command with output streamed to an output channel
 * @param command Command to execute
 * @param cwd Working directory for the command
 * @param outputChannel VSCode output channel to stream output to
 * @param onProgress Optional callback to report progress (e.g., module being pulled)
 * @returns Promise that resolves with success status and exit code
 */
export function runCommandWithOutput(
    command: string,
    cwd: string,
    outputChannel: vscode.OutputChannel,
    onProgress?: (message: string) => void
): Promise<{ success: boolean; exitCode: number | null }> {
    return new Promise((resolve) => {
        console.log(`[runCommandWithOutput] Executing: ${command} in ${cwd}`);
        
        // Show the output channel
        outputChannel.show(true);
        outputChannel.appendLine(`Running: ${command}`);
        outputChannel.appendLine(`Working directory: ${cwd}`);
        outputChannel.appendLine('');

        // Spawn the process
        const proc = child_process.spawn(command, [], {
            shell: true,
            cwd: cwd,
            env: process.env as { [key: string]: string }
        });

        // Handle stdout
        proc.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            outputChannel.append(text);
            
            // Parse module names from output for progress reporting
            if (onProgress) {
                // Look for patterns like "ballerinax/redis:3.1.0 [central.ballerina.io..."
                const moduleMatch = text.match(/(\w+\/[\w-]+:\d+\.\d+\.\d+)\s+\[/);
                if (moduleMatch) {
                    const moduleName = moduleMatch[1];
                    onProgress(`Pulling ${moduleName} ...`);
                }
                
                // Also check for "pulled from central successfully" messages
                const successMatch = text.match(/(\w+\/[\w-]+:\d+\.\d+\.\d+)\s+pulled from central successfully/);
                if (successMatch) {
                    const moduleName = successMatch[1];
                    onProgress(`${moduleName} pulled successfully`);
                }
            }
        });

        // Handle stderr
        proc.stderr?.on('data', (data: Buffer) => {
            const text = data.toString();
            outputChannel.append(text);
            console.log(`[runCommandWithOutput] stderr: ${text}`);
            onProgress?.(`Something went wrong. check the output for more details.`);
        });

        // Handle process errors
        proc.on('error', (error) => {
            const errorMsg = `Process error: ${error.message}`;
            outputChannel.appendLine(errorMsg);
            console.error(`[runCommandWithOutput] ${errorMsg}`, error);
            onProgress?.(`Something went wrong. check the output for more details.`);
            resolve({ success: false, exitCode: null });
        });

        // Handle process exit
        proc.on('close', (code) => {
            const exitMsg = `\nProcess exited with code ${code}`;
            outputChannel.appendLine(exitMsg);
            console.log(`[runCommandWithOutput] ${exitMsg}`);
            
            const success = code === 0;
            if (success) {
                onProgress?.(`All dependencies pulled successfully`);
            } else {
                onProgress?.(`Something went wrong. check the output for more details.`);
            }
            resolve({ success, exitCode: code });
        });
    });
}

export function openExternalUrl(url:string){
    vscode.env.openExternal(vscode.Uri.parse(url));
}
