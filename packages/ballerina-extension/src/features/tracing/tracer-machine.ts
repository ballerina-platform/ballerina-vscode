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

import { createMachine, assign, interpret } from 'xstate';
import type { Interpreter } from 'xstate';
import { TraceServer } from './trace-server';
import * as path from 'path';
import * as fs from 'fs';
import { createTraceServerTask } from './trace-server-task';
import * as vscode from 'vscode';
import { setTracingConfig, removeTracingConfig, getActiveTracingProvider, removeAmpConfig } from './utils';
import { OTLP_PORT } from './constants';
import { TracingProvider } from '@wso2/ballerina-core';



/**
 * State machine flow 
 * 
 * If the tracing is enabled in the project, the state machine will transition to the enabled state.
 * If the tracing is not enabled in the project, the state machine will transition to the disabled state.
 * 
 * User can manually enable/disable tracing via UI
 *  Then trace machine will update all the projects with relevent imports
 * 
 * When user runs the program when state machine is enabled 
 *  it will start the tracing server and it will be on for rest of the program execution.
 * 
 * If user disable tracing via UI
 *  it will stop the tracing server and it will be off for rest of the program execution.
 * 
 * We will only capture trace logs if the window is opened
 *  
 */

/**
 * Context for the tracing server state machine
 */
export interface TracerMachineContext {
    serverPort?: number;
    serverPid?: number;
    error?: string;
    startFailureReason?: string;
    currentProjectPath?: string;
    childProjectPaths?: string[];
    isDisabling?: boolean;
    traceServer?: TraceServer;
    taskExecution?: vscode.TaskExecution;
    taskTerminationListener?: vscode.Disposable;
    provider?: TracingProvider;
}

/**
 * Check if tracing is enabled in the current project
 */
function isTraceEnabledInProject(context: TracerMachineContext): Promise<{ isTraceEnabledInProject: boolean }> {
    return new Promise((resolve) => {
        // Check if a file called trace_enabled.bal exists in the current project path
        if (context.currentProjectPath) {
            const traceEnabled = fs.existsSync(path.join(context.currentProjectPath, 'trace_enabled.bal'));
            if (traceEnabled) {
                resolve({ isTraceEnabledInProject: true });
                return;
            }
        }
        // For workspace projects, check if any child project has tracing enabled
        if (context.childProjectPaths?.length) {
            const anyChildEnabled = context.childProjectPaths.some(
                childPath => fs.existsSync(path.join(childPath, 'trace_enabled.bal'))
            );
            resolve({ isTraceEnabledInProject: anyChildEnabled });
            return;
        }
        resolve({ isTraceEnabledInProject: false });
    });
}

function resolveProvider(event?: any): TracingProvider {
    return event?.useAmpProvider === true ? 'amp' : 'idetraceprovider';
}

function enableTracingInProject(context: TracerMachineContext, event?: any): void {
    if (!event?.projectPath) {
        return;
    }

    const provider = resolveProvider(event);
    // Read from disk (not context.provider) so this is correct even after an extension restart.
    const previousProvider = getActiveTracingProvider(event.projectPath);
    try {
        const traceFilePath = path.join(event.projectPath, 'trace_enabled.bal');
        fs.writeFileSync(traceFilePath, `import ballerinax/${provider} as _;`);
        setTracingConfig(event.projectPath, provider);
        // Switching away from Agent Manager: drop its Config.toml entries, matching disableTracingInProject.
        if (previousProvider === 'amp' && provider !== 'amp') {
            removeAmpConfig(event.projectPath);
        }
    } catch (error) {
        console.error(`Failed to write trace_enabled.bal to ${event.projectPath}:`, error);
    }
}

function disableTracingInProject(context: TracerMachineContext, event?: any): void {
    if (!event?.projectPath) {
        return;
    }

    try {
        const traceFilePath = path.join(event.projectPath, 'trace_enabled.bal');
        if (fs.existsSync(traceFilePath)) {
            fs.unlinkSync(traceFilePath);
        }
        removeTracingConfig(event.projectPath);
    } catch (error) {
        console.error(`Failed to disable tracing in ${event.projectPath}:`, error);
    }
}

// True when a known project other than the one being disabled still has trace_enabled.bal.
function hasOtherEnabledProjects(context: TracerMachineContext, event?: any): boolean {
    const targetPath = event?.projectPath;
    if (!targetPath) {
        return false;
    }
    const candidates = new Set<string>();
    if (context.currentProjectPath) {
        candidates.add(context.currentProjectPath);
    }
    context.childProjectPaths?.forEach(p => candidates.add(p));
    candidates.delete(targetPath);
    for (const projectPath of candidates) {
        if (fs.existsSync(path.join(projectPath, 'trace_enabled.bal'))) {
            return true;
        }
    }
    return false;
}

function startServer(context: TracerMachineContext, event?: any): Thenable<vscode.TaskExecution> {
    const task = createTraceServerTask();
    return vscode.tasks.executeTask(task);
}

function stopServer(context: TracerMachineContext, event?: any): Promise<void> {
    const taskExecution = context.taskExecution;
    if (!taskExecution || !vscode.tasks.taskExecutions.includes(taskExecution)) {
        return TraceServer.stop();
    }
    return new Promise<void>((resolve, reject) => {
        const subscription = vscode.tasks.onDidEndTask((endEvent) => {
            if (endEvent.execution === taskExecution) {
                subscription.dispose();
                TraceServer.stop().then(resolve, reject);
            }
        });
        taskExecution.terminate();
    });
}


/**
 * Creates a state machine for managing the tracing server lifecycle
 */
function createTracerMachine(projectPath?: string, childProjectPaths?: string[]) {
    return createMachine<TracerMachineContext>(
        {
            /** @xstate-layout N4IgpgJg5mDOIC5QBcBOBDAxmVBZLAFgJYB2YAxAIIAi1A+gOoDyASgNIDKACpQMICiHANoAGALqJQABwD2sIsiIySkkAA9EARgBM2gMwA6TQBYRANgCsAdgAcFm2e0mANCACeWkVYMBOC3s1NHxsREWMLYzM9AF9o1zQsHHxMYjJyFn5cJgA1fkZWTh4BYXFVWXlFZVUNBB0vAz1g4z0RPWMrYzszVw9a7Vj4jGw8QlIwA1IFcghlcdIANxkAa3GE4eTUuZIFBAWZTHRKklExE7K5BSUVJHVEC00bIwe-MzNNKzM7HsROiwMOqx6SzaGwfXRAgYgNZJUZkCbbZDTWbwxYrAzQkYpMbwnZ7A5HE5CTQSG7lS5VG41d7GAxOczWETaaz+XTfBBmYw+AzWHyaBkWMJ8qyQjEbbGTRE4VAyVAGKQAG0OADMZQBbdFDGFYuES3YkRb4q6E0qki5HapaHyGUG6bQ+XT+EQCvRskIiXyRNpeKyhEQ+MwizWYzYGMAkdAAI3lkHI1AAkhxKAAhAAy-DOpoqVwtCCsugMZh9Zh8rXMVl5xjZmg5ZiMIk0jT8rRemkDiWD2LDkejEHS-AAYhkOAAJDPSM3ZymIWzeHxWyyhPS2dqV9yIRruvkmJdBV5LtvrWHjLtRyAGWA4eY4DjIGRSKQxjgAFUoLCfdA4-BYuRYY5AZPNKdcwsbQCyZUsHEZECbCrRlNAMYxdBsFc-TncIDy1EMTx7c9L2vZB0FQRQSCgJEdX1ZZViDMU4Wws8L1QK9UBvQjiKgPUDUOI1xD-ADJ1AKk-VAwFjFE6xAm0esXTXWpWm8d4QR9RDATMJ0MI7Wjw1PCBcMY-DWNIUipRlOVFWQFVUHVUUj1DLScIYpiWKIwyOP2LjlGNElxyzCkBM8e1-jaMSrAkqTXRCgt-QCRpNHrGd1Jo487PovDUH7dAiB7J8ZCcxEMifFgAE1eInXzblqKJDHLT5nV5VoHDZEt5LzBwrFsBslxsBKbLonSHJwdLMsgbLcr7AriuJc4fOuPyKr0Kr-TsZtYr0BqZK6AsWs5f1PidHxuu1JLuxSvTmIIojHyfJguA-L8fxK6ac0k7RawsecojeyxAhgmT7W8RCQTeCwgbUuIoWonrkr61KbzvKRDLIrZUSo9tEts47odO2H7xcvF3OOHiTW88kZvK57XvevRPvuB42UBf6kPaOSWneA6sKh3THNvHGSPIYzZQVZU1Q1VHIYxzn8Lh3GKMNDzCa8-9StJmpntnJdlOUgVbFdNoEOLDpC0ZODWzB6zDoMCAiFgDHyH4AA5ZM0wekmc2sKs2tAmw7X0HRAjeTo2exS3re0vtB0EUcicVx6gIbeCQrCN4Pdeawft6BsSwMGwSy9v1OmQ4xYjBkgZAgOBVDNzYppdoCAFpNDZFpQK+4xqxBCxgb+wPyIUavANm9o2Vb0CFJsea5zebQPm7o7tL7-jyv8bx-B0K1fSCPk2Q7917RBPwfDa4J+lNiHzd6iWzrhyB57Kmp7D+Fe7RaUIN4sRqve5cxdwCUwQv2k-RZnw5v1M6BkSI32Voge0jxCwbytNWSwwRGrBAQkhJ0QQC5WAsDPdG2kL6DSyjlc6yAIE5m3H8dqLQsHZycFPV0xZfBITHlTSSXscHnxAbla+mYa6zQeI4MCApORMlWiFNOiBQTwVHn4NoNhYp2nYcAmG3N4bgJ4f3MmQIuQcidP4FkIkdZ-G-sCcI5YAg4ODhjUhQFn4GFaHUVuC5VrIXdkELO2d5FWnuH4Iu0QgA */
            id: 'tracerMachine',
            initial: 'init',
            context: {
                serverPort: OTLP_PORT,
                serverPid: undefined,
                error: undefined,
                startFailureReason: undefined,
                currentProjectPath: projectPath,
                childProjectPaths: childProjectPaths,
                isDisabling: false,
                taskExecution: undefined,
                taskTerminationListener: undefined
            },
            states: {
                /**
                 * Initial state when the tracer machine is first created
                 */
                init: {
                    entry: () => {
                        console.log('Tracer state: init');
                    },

                    invoke: {
                        src: 'initializeTracer',
                        onDone: [
                            {
                                target: 'enabled',
                                cond: (context, event) => {
                                    const traceEnabled = (event as any).data?.isTraceEnabledInProject;
                                    return traceEnabled === true;
                                }
                            },
                            {
                                target: 'disabled'
                            }
                        ],
                        onError: {
                            target: 'disabled',
                            actions: assign({
                                startFailureReason: (context, event) => (event as any).data?.error || context.error,
                                error: (context, event) => (event as any).data?.error || context.error,
                            }),
                        },
                    }
                },

                /**
                 * Tracer is enabled and ready to start the server
                 * Contains nested states for server lifecycle management
                 */
                enabled: {
                    initial: 'serverStopped',
                    entry: [
                        () => {
                            console.log('Tracer state: enabled');
                        },
                        assign({
                            error: undefined,
                        }),
                        () => {
                            // TODO: Implement enable logic (register handlers, etc.)
                        },
                    ],
                    on: {
                        // ENABLE while already enabled: write trace_enabled.bal for the new project, stay in enabled.
                        ENABLE: {
                            actions: [
                                enableTracingInProject,
                                assign({
                                    provider: (context, event) => resolveProvider(event),
                                }),
                            ],
                        },
                        DISABLE: [
                            // Other projects still have trace_enabled.bal — remove this project's file and stay in enabled.
                            {
                                cond: hasOtherEnabledProjects,
                                actions: [disableTracingInProject],
                            },
                            {
                                target: 'enabled.serverStopping',
                                cond: () => {
                                    // If server is running, stop it first before disabling
                                    return TraceServer.isRunning();
                                },
                                actions: [
                                    // Remove the file here while event.projectPath is still available;
                                    // serverStopping.onDone receives a different event and would lose it.
                                    disableTracingInProject,
                                    assign({
                                        isDisabling: true,
                                    }),
                                ],
                            },
                            {
                                target: 'disabled',
                                actions: [
                                    disableTracingInProject,
                                    assign({
                                        currentProjectPath: undefined,
                                    }),
                                ],
                            },
                        ],

                        REFRESH: {
                            target: 'init',
                            actions: assign({
                                error: undefined,
                                startFailureReason: undefined,
                                serverPort: undefined,
                                serverPid: undefined,
                                isDisabling: false,
                            }),
                        }
                    },
                    states: {
                        /**
                         * Server is stopped (initial state when enabled)
                         */
                        serverStopped: {
                            entry: () => {
                                console.log('Tracer state: enabled.serverStopped');
                            },

                            on: {
                                START_SERVER: {
                                    target: "serverStarting"
                                }
                            }
                        },

                        serverStarting: {
                            invoke: {
                                src: startServer,
                                onDone: {
                                    target: "serverStarted",
                                    actions: assign({
                                        error: undefined,
                                        taskExecution: (context, event) => (event as any).data,
                                    }),
                                },
                                onError: {
                                    target: "serverFailedToStart",
                                    actions: assign({
                                        error: (context, event) => {
                                            const err = (event as any).data;
                                            return err instanceof Error ? err.message : String(err);
                                        }
                                    })
                                }
                            }
                        },
                        /**
                         * Server start failed
                         */
                        serverFailedToStart: {
                            entry: () => {
                                console.log('Tracer state: enabled.serverFailedToStart');
                            },

                            on: {
                                RETRY: [{
                                    target: "serverStarted",
                                    cond: "New guard"
                                }, "serverStarted"]
                            }
                        },

                        /**
                         * Server is started and running
                         */
                        serverStarted: {
                            entry: [
                                () => {
                                    console.log('Tracer state: enabled.serverStarted');
                                },
                                assign({
                                    error: undefined,
                                }),
                            ],
                            invoke: {
                                id: 'taskTerminationListener',
                                src: (context, event) => (callback, onReceive) => {
                                    // Capture taskExecution reference at setup time
                                    const taskExecution = context.taskExecution;
                                    
                                    // Set up task termination listener
                                    const disposable = vscode.tasks.onDidEndTask((taskEvent) => {
                                        // Check if the ended task matches our task execution
                                        if (taskExecution && taskEvent.execution === taskExecution) {
                                            console.log('Trace server task terminated');
                                            callback({ type: 'TASK_TERMINATED' });
                                        }
                                    });
                                    
                                    // Return cleanup function
                                    return () => {
                                        disposable.dispose();
                                    };
                                },
                            },
                            on: {
                                STOP_SERVER: {
                                    target: "serverStopping"
                                },
                                TASK_TERMINATED: {
                                    target: "serverStopped",
                                    actions: [
                                        assign({
                                            taskExecution: undefined,
                                        }),
                                    ],
                                }
                            }
                        },

                        serverStopping: {
                            invoke: {
                                src: stopServer,
                                onDone: [
                                    {
                                        // File was already removed when DISABLE was received in `enabled`.
                                        target: "#tracerMachine.disabled",
                                        cond: (context) => context.isDisabling === true,
                                        actions: [
                                            assign({
                                                isDisabling: false,
                                            }),
                                        ],
                                    },
                                    {
                                        target: "serverStopped",
                                    },
                                ],
                                onError: {
                                    target: "serverStarted",
                                    actions: [
                                        assign({
                                            error: (context, event) => {
                                                const err = (event as any).data;
                                                return err instanceof Error ? err.message : String(err);
                                            },
                                            isDisabling: false,
                                        }),
                                    ],
                                }
                            },
                            on: {
                                DISABLE: {
                                    actions: [
                                        assign({
                                            isDisabling: true,
                                        }),
                                    ],
                                },
                            },
                        }
                    },
                },

                /**
                 * Tracer is disabled (server cannot be started)
                 */
                disabled: {
                    entry: [
                        () => {
                            console.log('Tracer state: disabled');
                        },
                        assign({
                            isDisabling: false,
                        }),
                    ],
                    on: {
                        ENABLE: {
                            target: 'enabled',
                            actions: [
                                enableTracingInProject,
                                assign({
                                    currentProjectPath: (context, event) => (event as any).projectPath,
                                    provider: (context, event) => resolveProvider(event),
                                })
                            ]
                        },
                        // DISABLE while already disabled: another project still has trace_enabled.bal — remove that file. Stay in disabled.
                        DISABLE: {
                            actions: [disableTracingInProject],
                        },
                        REFRESH: {
                            target: 'init',
                            actions: assign({
                                error: undefined,
                                startFailureReason: undefined,
                                serverPort: undefined,
                                serverPid: undefined,
                                isDisabling: false,
                            }),
                        }
                    },
                }
            },
        },
        {
            services: {
                // Initialize the tracer
                initializeTracer: isTraceEnabledInProject
            },
        });
}

// Service instance (created on initialization)
let tracerService: ReturnType<typeof interpret> | undefined;
// Persistent subscribers that survive refresh
const persistentSubscribers: Array<(state: any) => void> = [];

/**
 * Ensures the tracer service is initialized and returns it
 * @throws {Error} If the tracer service is not initialized
 */
function ensureInitialized(): ReturnType<typeof interpret> {
    if (!tracerService) {
        throw new Error('TracerMachine not initialized. Call initialize() first.');
    }
    return tracerService;
}

/**
 * Singleton object providing access to the tracer state machine
 */
export const TracerMachine = {
    /**
     * Create and start the tracer machine with workspace directories
     */
    initialize: (projectPath?: string, childProjectPaths?: string[]) => {
        const machine = createTracerMachine(projectPath, childProjectPaths);
        tracerService = interpret(machine) as ReturnType<typeof interpret>;
        tracerService.start();
    },

    isEnabled: () => {
        const value = ensureInitialized().getSnapshot().value;
        if (typeof value === 'string') {
            return value === 'enabled';
        }
        if (typeof value === 'object' && value !== null) {
            return value.hasOwnProperty('enabled');
        }
        return false;
    },

    isServerStarted: () => {
        const snapshot = ensureInitialized().getSnapshot();
        const value = snapshot.value;
        if (typeof value === 'string') {
            return value === 'enabled.serverStarted';
        }
        if (typeof value === 'object' && value !== null) {
            const obj = value as Record<string, string>;
            return obj.enabled === 'serverStarted';
        }
        return false;
    },

    /**
     * Get the current state value (for testing)
     */
    getState: () => {
        return ensureInitialized().getSnapshot().value;
    },

    startServer: () => {
        ensureInitialized().send({ type: 'START_SERVER' });
    },

    stopServer: () => {
        ensureInitialized().send({ type: 'STOP_SERVER' });
    },

    enable: (projectPath: string, useAmpProvider?: boolean) => {
        ensureInitialized().send({ type: 'ENABLE', projectPath, useAmpProvider } as any);
    },

    disable: (projectPath: string) => {
        ensureInitialized().send({ type: 'DISABLE', projectPath } as any);
    },

    getProvider: (): TracingProvider => {
        const context = ensureInitialized().getSnapshot().context as TracerMachineContext;
        return context.provider ?? 'idetraceprovider';
    },

    refresh: (projectPath?: string, childProjectPaths?: string[]) => {
        const snapshot = ensureInitialized().getSnapshot();
        const context = snapshot.context as TracerMachineContext;
        const currentProjectPath = context.currentProjectPath;
        const updatedProjectPath = projectPath || currentProjectPath;
        const updatedChildPaths = childProjectPaths || context.childProjectPaths;
        const machine = createTracerMachine(updatedProjectPath, updatedChildPaths);
        tracerService.stop();
        tracerService = interpret(machine) as ReturnType<typeof interpret>;
        // Re-subscribe persistent callbacks to the new service
        for (const callback of persistentSubscribers) {
            tracerService.subscribe((state) => {
                callback(state.value);
            });
        }
        tracerService.start();
    },

    onUpdate: (callback: (state: any) => void) => {
        persistentSubscribers.push(callback);
        ensureInitialized().subscribe((state) => {
            callback(state.value);
        });
    },

    getTraceServer: () => {
        return TraceServer;
    },
};

