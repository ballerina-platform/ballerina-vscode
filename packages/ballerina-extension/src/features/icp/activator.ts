/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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
import * as cp from 'child_process';
import { BallerinaExtension } from '../../core';
import { resolveICPPath } from './detect';
import { provisionICPSecret } from './setup';
import { getICPUrl } from './index';

const ICP_START_COMMAND = 'ballerina.icp.start';
const ICP_STOP_COMMAND = 'ballerina.icp.stop';
const ICP_FOCUS_COMMAND = 'ballerina.icp.focus';
const ICP_TASK_NAME = 'ICP Server';
const ICP_TASK_SOURCE = 'ballerina-icp';

function getICPCredentials(): { username: string; password: string } {
    const config = vscode.workspace.getConfiguration('ballerina');
    return {
        username: config.get<string>('icpUsername') || 'admin',
        password: config.get<string>('icpPassword') || 'admin',
    };
}

let icpTaskExecution: vscode.TaskExecution | undefined;
let icpProcess: cp.ChildProcess | undefined;
let isRunning = false;
let statusBarItem: vscode.StatusBarItem;

function killICPProcess(): void {
    if (icpProcess && !icpProcess.killed && icpProcess.pid) {
        try {
            if (process.platform === 'win32') {
                cp.execSync(`taskkill /pid ${icpProcess.pid} /t /f`, { stdio: 'ignore' });
            } else {
                process.kill(-icpProcess.pid, 'SIGTERM');
            }
        } catch {
            icpProcess.kill();
        }
    }
    icpProcess = undefined;
}

/**
 * Returns whether the ICP server is currently running.
 */
export function isICPServerRunning(): boolean {
    return isRunning;
}

/**
 * Ensures the ICP server is running and the project secret is provisioned.
 * - If secret exists in keychain, writes it to Config.toml silently.
 * - If no secret, prompts user to start ICP server and provision one.
 * Returns true if the run should proceed, false if cancelled.
 */
export async function ensureICPServerRunning(projectPath?: string): Promise<boolean> {
    if (isRunning && !projectPath) {
        return true;
    }

    // Server is running — validate and provision secret if needed
    if (isRunning && projectPath) {
        const secret = await provisionICPSecret(projectPath);
        if (!secret) {
            vscode.window.showErrorMessage('Failed to provision ICP secret. The project may not connect to ICP at runtime.');
            return false;
        }
        return true;
    }

    const action = await vscode.window.showWarningMessage(
        'ICP is enabled but the ICP server is not running.',
        'Start & Setup',
        'Run Anyway'
    );

    if (action === 'Start & Setup') {
        await vscode.commands.executeCommand(ICP_START_COMMAND);
        if (!isRunning) {
            return false;
        }

        if (projectPath) {
            const secret = await provisionICPSecret(projectPath);
            if (!secret) {
                vscode.window.showErrorMessage('Failed to provision ICP secret. The project may not connect to ICP at runtime.');
                return false;
            }
        }

        const icpUrl = getICPUrl();
        const { username, password } = getICPCredentials();
        const credentialsHint = (username === 'admin' && password === 'admin')
            ? ' (default credentials: admin/admin)'
            : '';

        vscode.window.showInformationMessage(
            `ICP server started and configured. Access it at ${icpUrl}${credentialsHint}`,
            'Open in Browser'
        ).then((selection) => {
            if (selection === 'Open in Browser') {
                vscode.env.openExternal(vscode.Uri.parse(icpUrl));
            }
        });

        return isRunning;
    }

    return action === 'Run Anyway';
}

function updateStatusBar(): void {
    if (isRunning) {
        statusBarItem.text = '$(server-process) ICP: Running';
        statusBarItem.tooltip = 'Integration Control Plane is running. Click to view output.';
    } else {
        statusBarItem.text = '$(server-environment) ICP: Stopped';
        statusBarItem.tooltip = 'Integration Control Plane is stopped. Click to start.';
    }
    statusBarItem.command = ICP_FOCUS_COMMAND;
}

function setICPState(running: boolean): void {
    isRunning = running;
    vscode.commands.executeCommand('setContext', 'ballerina.icpRunning', running);
    updateStatusBar();
}

const ICP_STARTED_PATTERN = 'ICP Console started at';
const ICP_START_TIMEOUT_MS = 30000;

let icpServerReadyPromise: Promise<boolean> | undefined;
let startupTimeout: ReturnType<typeof setTimeout> | undefined;

function createICPTask(icpPath: string): vscode.Task {
    const taskDefinition: vscode.TaskDefinition = {
        type: 'shell',
        task: 'start-icp-server',
    };

    let resolveReady: (value: boolean) => void;
    let resolved = false;
    icpServerReadyPromise = new Promise<boolean>((resolve) => {
        resolveReady = (value: boolean) => {
            if (resolved) { return; }
            resolved = true;
            resolve(value);
        };
    });

    startupTimeout = setTimeout(() => {
        resolveReady(false);
        killICPProcess();
        if (icpTaskExecution) {
            icpTaskExecution.terminate();
            icpTaskExecution = undefined;
        }
        icpServerReadyPromise = undefined;
    }, ICP_START_TIMEOUT_MS);

    const customExecution = new vscode.CustomExecution(async () => {
        const writeEmitter = new vscode.EventEmitter<string>();
        const closeEmitter = new vscode.EventEmitter<number | void>();

        let outputBuffer = '';

        function checkStartupPattern(text: string): void {
            outputBuffer += text;
            if (outputBuffer.includes(ICP_STARTED_PATTERN)) {
                if (startupTimeout) {
                    clearTimeout(startupTimeout);
                    startupTimeout = undefined;
                }
                resolveReady(true);
            }
        }

        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            onDidClose: closeEmitter.event,
            open: () => {
                icpProcess = process.platform === 'win32'
                    ? cp.spawn(icpPath, [], {
                        shell: true,
                        windowsHide: true,
                        env: { ...process.env },
                    })
                    : cp.spawn('bash', [icpPath], {
                        detached: true,
                        env: { ...process.env },
                    });

                icpProcess.on('error', (err) => {
                    writeEmitter.fire(`Failed to start ICP: ${err.message}\r\n`);
                    if (startupTimeout) {
                        clearTimeout(startupTimeout);
                        startupTimeout = undefined;
                    }
                    resolveReady(false);
                    closeEmitter.fire(1);
                });

                icpProcess.stdout?.on('data', (data: Buffer) => {
                    const text = data.toString();
                    writeEmitter.fire(text.replace(/\n/g, '\r\n'));
                    checkStartupPattern(text);
                });

                icpProcess.stderr?.on('data', (data: Buffer) => {
                    const text = data.toString();
                    writeEmitter.fire(text.replace(/\n/g, '\r\n'));
                    checkStartupPattern(text);
                });

                icpProcess.on('close', (code) => {
                    if (startupTimeout) {
                        clearTimeout(startupTimeout);
                        startupTimeout = undefined;
                    }
                    resolveReady(false);
                    closeEmitter.fire(code ?? undefined);
                });
            },
            close: () => {
                killICPProcess();
            },
        };

        return pty;
    });

    const task = new vscode.Task(
        taskDefinition,
        vscode.TaskScope.Workspace,
        ICP_TASK_NAME,
        ICP_TASK_SOURCE,
        customExecution
    );

    task.isBackground = true;
    task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        panel: vscode.TaskPanelKind.Dedicated,
        clear: true,
    };

    return task;
}

export function activateICP(ballerinaExtInstance: BallerinaExtension) {
    // Only set when ICP is available — the ICP commands are gated on this key in package.json,
    // and an unset key evaluates as false for the standalone Ballerina extension.
    vscode.commands.executeCommand('setContext', 'ballerina.icpSupported', true);

    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    setICPState(false);
    statusBarItem.show();

    const startCommand = vscode.commands.registerCommand(ICP_START_COMMAND, async () => {
        if (isRunning) {
            vscode.window.showWarningMessage('ICP server is already running.');
            return;
        }

        if (icpServerReadyPromise) {
            // A start is already in progress — wait for it
            await icpServerReadyPromise;
            return;
        }

        const icpPath = await resolveICPPath();
        if (!icpPath) {
            return;
        }

        const task = createICPTask(icpPath);
        icpTaskExecution = await vscode.tasks.executeTask(task);

        const started = await icpServerReadyPromise;
        icpServerReadyPromise = undefined;
        if (started) {
            setICPState(true);
        } else {
            vscode.window.showErrorMessage('ICP server failed to start within the expected time.');
        }
    });

    const stopCommand = vscode.commands.registerCommand(ICP_STOP_COMMAND, () => {
        if (!isRunning || !icpTaskExecution) {
            vscode.window.showWarningMessage('ICP server is not running.');
            return;
        }

        killICPProcess();
        icpTaskExecution.terminate();
        icpTaskExecution = undefined;
        setICPState(false);
    });

    const focusCommand = vscode.commands.registerCommand(ICP_FOCUS_COMMAND, async () => {
        if (!isRunning) {
            // Start the server if not running
            await vscode.commands.executeCommand(ICP_START_COMMAND);
        }
        // Focus the task terminal
        if (icpTaskExecution) {
            // Reveal the task's terminal in the panel
            vscode.commands.executeCommand('workbench.action.terminal.focus');
        }
    });

    const taskEndListener = vscode.tasks.onDidEndTask((e) => {
        if (e.execution === icpTaskExecution) {
            killICPProcess();
            icpTaskExecution = undefined;
            setICPState(false);
        }
    });

    ballerinaExtInstance.context.subscriptions.push(
        statusBarItem,
        startCommand,
        stopCommand,
        focusCommand,
        taskEndListener
    );
}
