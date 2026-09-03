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
import { commands, window, workspace as vscodeWorkspace } from 'vscode';
import { BallerinaExtension, ExtendedLangClient } from '../../core';
import { activateCopilotLoginCommand, resetBIAuth } from './completions';
import { CopilotEventHandler } from './utils/events';
import { addConfigFile, getConfigFilePath } from './utils';
import {
    CONFIGURE_DEFAULT_MODEL_COMMAND,
    DEFAULT_EMBEDDING_PROVIDER_ADDED,
    DEFAULT_PROVIDER_ADDED,
    LOGIN_REQUIRED_WARNING_FOR_DEFAULT_EMBEDDING,
    LOGIN_REQUIRED_WARNING_FOR_DEFAULT_MODEL,
    SIGN_IN_BI_COPILOT
} from './constants';
import {
    TOKEN_NOT_AVAILABLE_ERROR_MESSAGE,
    NO_AUTH_CREDENTIALS_FOUND,
    TOKEN_REFRESH_ONLY_SUPPORTED_FOR_BI_INTEL
} from '../..//utils/ai/auth';
import { AIStateMachine } from '../../views/ai-panel/aiMachine';
import { AIMachineEventType, DefaultProviderKind, GenerateAgentCodeRequest, ExecutionContext, SHARED_COMMANDS } from '@wso2/ballerina-core';
import { resolveProjectPath } from '../../utils/project-utils';
import { MESSAGES } from '../project';
import { AICommandConfig } from './executors/base/AICommandExecutor';
import { AgentExecutor } from './agent/AgentExecutor';
import {
    initMcpClientManager,
    disposeMcpClientManager,
    watchMcpConfig,
    getMcpClientManager,
    isMcpToolsEnabled,
    MCP_ENABLE_SETTING_KEY,
    type EnabledOverrideStore,
    type McpClientManager
} from './agent/mcp';
import { registerAgentsMdWatcher } from './agent/agents-md';
import { resolveProjectRootPath } from './agent';
import { extension } from '../../BalExtensionContext';
import { notifyMcpServersChanged, notifyMcpLoadErrorsChanged } from '../../RPCLayer';
import { sendConfigChangeNotification } from './utils/ai-utils';
import { captureWorkspaceSnapshot, restoreWorkspaceSnapshot } from '../../views/ai-panel/checkpoint/checkpointUtils';
import { integrateCodeToWorkspace } from './agent/utils';
import { Checkpoint } from '@wso2/ballerina-core/lib/state-machine-types';
import { agentStatusManager } from './state/AgentStatusManager';

/**
 * Parameters for test-mode code generation
 */
export interface GenerateAgentForTestParams extends GenerateAgentCodeRequest {
    /** Path to the isolated test project (created by eval from template) */
    projectPath: string;
}

/**
 * Result returned from test-mode code generation
 */
export interface GenerateAgentForTestResult {
    /** Path to the temp project where code was generated (created by getTempProject) */
    tempProjectPath: string;
    /** Path to the isolated test project (source) */
    isolatedProjectPath: string;
}

export let langClient: ExtendedLangClient;

/** Tracks the active post-login auth subscription so it can be cleaned up before creating a new one. */
let lastAuthSubscription: { unsubscribe: () => void } | null = null;

/** How long (ms) to wait for the user to complete login before auto-cancelling the subscription. */
const AUTH_SUBSCRIPTION_TIMEOUT_MS = 5 * 60 * 1000;

export function activateAIFeatures(ballerinaExternalInstance: BallerinaExtension) {

    langClient = <ExtendedLangClient>ballerinaExternalInstance.langClient;
    activateCopilotLoginCommand();
    resetBIAuth();
    activateMcp();
    extension.context?.subscriptions.push(registerAgentsMdWatcher());
    if (extension.context) {
        agentStatusManager.init(extension.context);
        extension.context.subscriptions.push(
            commands.registerCommand(
                SHARED_COMMANDS.SET_COPILOT_INLINE_STATUS,
                (active: boolean) => agentStatusManager.setInlineStatusVisible(!!active)
            ),
            commands.registerCommand(
                SHARED_COMMANDS.SET_COPILOT_AMBIENT_PRESENT,
                (present: boolean) => commands.executeCommand('setContext', 'ballerina.copilotAmbientPresent', !!present)
            )
        );
    }

    // Register commands in test environment to test the AI features
    if (process.env.AI_TEST_ENV) {
        commands.registerCommand('ballerina.test.ai.generateAgentForTest', async (params: GenerateAgentForTestParams, testEventHandler: CopilotEventHandler): Promise<GenerateAgentForTestResult> => {

            try {
                // Create isolated ExecutionContext for this test
                const ctx: ExecutionContext = {
                    projectPath: params.projectPath,
                    workspacePath: params.projectPath
                };

                // Create config using new AICommandConfig pattern
                const config: AICommandConfig<GenerateAgentCodeRequest> = {
                    executionContext: ctx,
                    eventHandler: testEventHandler,
                    generationId: `test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                    abortController: new AbortController(),
                    params,
                    // No chat storage in test mode
                    chatStorage: undefined,
                    // Immediate cleanup (AI_TEST_ENV prevents actual deletion)
                    lifecycle: {
                        cleanupStrategy: 'immediate'
                    }
                };

                // Execute using new run() method
                const executor = new AgentExecutor(config);
                const result = await executor.run();

                return {
                    tempProjectPath: result.tempProjectPath,
                    isolatedProjectPath: params.projectPath
                };
            } catch (error) {
                console.error(`[Test Mode] Generation failed for project ${params.projectPath}:`, error);
                throw error;
            }
        });

        // Library integration test commands
        const {
            getAllLibraries,
            getSelectedLibraries,
            getRelevantLibrariesAndFunctions,
            GenerationType
        } = require('./utils/libs/libraries');
        const {
            selectRequiredFunctions,
            getMaximizedSelectedLibs,
            toMaximizedLibrariesFromLibJson
        } = require('./utils/libs/function-registry');

        commands.registerCommand('ballerina.test.ai.getAllLibraries', async (generationType: typeof GenerationType) => {
            return await getAllLibraries(generationType);
        });

        commands.registerCommand('ballerina.test.ai.getSelectedLibraries', async (prompt: string, generationType: typeof GenerationType) => {
            return await getSelectedLibraries(prompt, generationType);
        });

        commands.registerCommand('ballerina.test.ai.getRelevantLibrariesAndFunctions', async (params: any, generationType: typeof GenerationType) => {
            return await getRelevantLibrariesAndFunctions(params, generationType);
        });

        commands.registerCommand('ballerina.test.ai.selectRequiredFunctions', async (prompt: string, selectedLibNames: string[], generationType: typeof GenerationType) => {
            return await selectRequiredFunctions(prompt, selectedLibNames, generationType);
        });

        commands.registerCommand('ballerina.test.ai.getMaximizedSelectedLibs', async (libNames: string[], generationType: typeof GenerationType) => {
            return await getMaximizedSelectedLibs(libNames, generationType);
        });

        commands.registerCommand('ballerina.test.ai.toMaximizedLibrariesFromLibJson', async (functionResponses: any[], originalLibraries: any[]) => {
            return await toMaximizedLibrariesFromLibJson(functionResponses, originalLibraries);
        });

        // Checkpoint/revert and live-integration test commands (exercise the real, activated
        // extension instance rather than a freshly re-required, unactivated module copy).
        commands.registerCommand('ballerina.test.ai.captureCheckpoint', async (messageId: string): Promise<Checkpoint | null> => {
            return await captureWorkspaceSnapshot(messageId);
        });

        commands.registerCommand('ballerina.test.ai.restoreCheckpoint', async (checkpoint: Checkpoint, skipArtifactWait?: boolean): Promise<void> => {
            await restoreWorkspaceSnapshot(checkpoint, skipArtifactWait);
        });

        commands.registerCommand('ballerina.test.ai.integrateCodeToWorkspace', async (tempProjectPath: string, modifiedFiles: string[], ctx: ExecutionContext): Promise<void> => {
            return await integrateCodeToWorkspace(tempProjectPath, new Set(modifiedFiles), ctx);
        });
    }

    commands.registerCommand(CONFIGURE_DEFAULT_MODEL_COMMAND, async (kind: DefaultProviderKind = "model") => {
        const isEmbedding = kind === "embedding";
        const promptTitle = isEmbedding
            ? "Select an integration to configure default embedding provider"
            : "Select an integration to configure default model provider";
        const loginWarning = isEmbedding ? LOGIN_REQUIRED_WARNING_FOR_DEFAULT_EMBEDDING : LOGIN_REQUIRED_WARNING_FOR_DEFAULT_MODEL;
        const successMessage = isEmbedding ? DEFAULT_EMBEDDING_PROVIDER_ADDED : DEFAULT_PROVIDER_ADDED;
        const retryFailureLabel = isEmbedding ? "default embedding" : "default model";

        const targetPath = await resolveProjectPath(promptTitle);
        if (!targetPath) {
            window.showErrorMessage(MESSAGES.NO_PROJECT_FOUND);
            return;
        }

        const configPath = await getConfigFilePath(ballerinaExternalInstance, targetPath);
        if (configPath !== null) {
            try {
                const result = await addConfigFile(configPath, kind);
                if (result) {
                    window.showInformationMessage(successMessage);
                }
            } catch (error) {
                if ((error as Error).message === TOKEN_NOT_AVAILABLE_ERROR_MESSAGE || (error as Error).message === TOKEN_REFRESH_ONLY_SUPPORTED_FOR_BI_INTEL || (error as Error).message === NO_AUTH_CREDENTIALS_FOUND) {
                    window.showWarningMessage(loginWarning, SIGN_IN_BI_COPILOT).then(selection => {
                        if (selection === SIGN_IN_BI_COPILOT) {
                            // Dispose any previous subscription before creating a new one
                            if (lastAuthSubscription) {
                                lastAuthSubscription.unsubscribe();
                                lastAuthSubscription = null;
                            }

                            let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

                            // Subscribe to state changes to auto-retry after successful login
                            const subscription = AIStateMachine.service().subscribe((state) => {
                                if (state.value === 'Authenticated') {
                                    // Clear timeout and module-scoped reference, then unsubscribe
                                    if (timeoutHandle !== null) {
                                        clearTimeout(timeoutHandle);
                                        timeoutHandle = null;
                                    }
                                    lastAuthSubscription = null;
                                    subscription.unsubscribe();
                                    // Retry the configuration automatically
                                    addConfigFile(configPath, kind).then(result => {
                                        if (result) {
                                            window.showInformationMessage(successMessage);
                                        }
                                    }).catch(retryError => {
                                        window.showErrorMessage(`Failed to configure ${retryFailureLabel}: ${(retryError as Error).message}`);
                                    });
                                }
                            });

                            lastAuthSubscription = subscription;

                            // Guard against the user never completing login
                            timeoutHandle = setTimeout(() => {
                                if (lastAuthSubscription === subscription) {
                                    lastAuthSubscription = null;
                                }
                                subscription.unsubscribe();
                            }, AUTH_SUBSCRIPTION_TIMEOUT_MS);

                            // If stuck in Authenticating from a previous cancelled login, reset it to allow a new login attempt
                            const currentState = AIStateMachine.state();
                            if (typeof currentState === 'object' && 'Authenticating' in currentState) {
                                AIStateMachine.service().send(AIMachineEventType.CANCEL_LOGIN);
                            }

                            // Trigger the login flow
                            AIStateMachine.service().send(AIMachineEventType.LOGIN);
                        }
                    });
                } else {
                    window.showErrorMessage((error as Error).message);
                }
            }
        }
    });
}

// MCP runs when the user enabled it, or when the project carries a `.mcp.json`.
function isMcpEnabled(): boolean {
    return isMcpToolsEnabled(resolveProjectRootPath() || undefined);
}

/** Pushes the given manager's current state to the webview, unless it's since been torn down. */
function pushMcpUpdate(manager: McpClientManager): void {
    if (getMcpClientManager() !== manager) {
        return;
    }
    try {
        notifyMcpServersChanged(manager.listServers());
        notifyMcpLoadErrorsChanged(manager.getLoadErrors());
    } catch (err) {
        console.warn('[mcp] Failed to push servers-changed notification:', err);
    }
}

// Returns the manager's initial-refresh promise so callers can await first setup finishing
// before a subsequent queued transition (e.g. a rapid disable) is allowed to run.
function setupMcp(): Promise<void> {
    if (getMcpClientManager()) {
        // Already set up; nothing to do.
        return Promise.resolve();
    }
    // Override store keys are `${scope}:${name}` (e.g. `workspace:foo`).
    function readMcpOverrideMap(): Record<string, boolean> {
        const mcp = vscodeWorkspace.getConfiguration('ballerina.copilot').get<any>('mcp', {});
        const map: Record<string, boolean> = {};
        for (const k of mcp.disabledServers ?? []) { map[k] = false; }
        for (const k of mcp.enabledServers  ?? []) { map[k] = true;  }
        return map;
    }

    function mcpConfigTarget(): vscode.ConfigurationTarget {
        return vscodeWorkspace.workspaceFolders?.length
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;
    }

    const overrides: EnabledOverrideStore = {
        get(scopedKey) {
            const map = readMcpOverrideMap();
            return Object.prototype.hasOwnProperty.call(map, scopedKey) ? map[scopedKey] : undefined;
        },
        async set(scopedKey, enabled) {
            const cfg = vscodeWorkspace.getConfiguration('ballerina.copilot');
            const target = mcpConfigTarget();
            const di = cfg.inspect<any>('mcp');
            const mcp = { ...(target === vscode.ConfigurationTarget.Workspace
                ? (di?.workspaceValue ?? {}) : (di?.globalValue ?? {})) };
            mcp.disabledServers = (mcp.disabledServers ?? []).filter((k: string) => k !== scopedKey);
            mcp.enabledServers  = (mcp.enabledServers  ?? []).filter((k: string) => k !== scopedKey);
            if (enabled) { mcp.enabledServers.push(scopedKey); } else { mcp.disabledServers.push(scopedKey); }
            await cfg.update('mcp', mcp, target);
            if (target === vscode.ConfigurationTarget.Workspace) {
                const gv = { ...(di?.globalValue ?? {}) };
                gv.disabledServers = (gv.disabledServers ?? []).filter((k: string) => k !== scopedKey);
                gv.enabledServers  = (gv.enabledServers  ?? []).filter((k: string) => k !== scopedKey);
                await cfg.update('mcp', gv, vscode.ConfigurationTarget.Global);
            }
        },
        async delete(scopedKey) {
            const cfg = vscodeWorkspace.getConfiguration('ballerina.copilot');
            const target = mcpConfigTarget();
            const di = cfg.inspect<any>('mcp');
            const mcp = { ...(target === vscode.ConfigurationTarget.Workspace
                ? (di?.workspaceValue ?? {}) : (di?.globalValue ?? {})) };
            mcp.disabledServers = (mcp.disabledServers ?? []).filter((k: string) => k !== scopedKey);
            mcp.enabledServers  = (mcp.enabledServers  ?? []).filter((k: string) => k !== scopedKey);
            await cfg.update('mcp', mcp, target);
            if (target === vscode.ConfigurationTarget.Workspace) {
                const gv = { ...(di?.globalValue ?? {}) };
                gv.disabledServers = (gv.disabledServers ?? []).filter((k: string) => k !== scopedKey);
                gv.enabledServers  = (gv.enabledServers  ?? []).filter((k: string) => k !== scopedKey);
                await cfg.update('mcp', gv, vscode.ConfigurationTarget.Global);
            }
        },
        keys() { return Object.keys(readMcpOverrideMap()); },
    };
    const workspacePath = resolveProjectRootPath() || undefined;
    const workspaceTrusted = vscodeWorkspace.isTrusted;
    const manager = initMcpClientManager(overrides, workspacePath, workspaceTrusted);
    // Trust changes and file edits both flow through reevaluate()'s single reconciler
    // below, which keeps an already-running manager's trust flag and config in sync —
    // no separate trust listener needed here.
    return manager.refresh()
        .then(() => manager.pruneOrphanOverrides())
        .then(() => pushMcpUpdate(manager))
        .catch(err => console.warn('[mcp] Initial refresh failed:', err));
}

async function teardownMcp(): Promise<void> {
    await disposeMcpClientManager();
    try {
        notifyMcpServersChanged([]);
        notifyMcpLoadErrorsChanged({});
    } catch (err) {
        console.warn('[mcp] Failed to push empty servers list on teardown:', err);
    }
}

// Serialize transitions so a rapid disable→enable isn't undone by an in-flight teardown.
let mcpLifecycleTransition: Promise<void> = Promise.resolve();
function queueMcpLifecycleTransition(task: () => Promise<void> | void): void {
    mcpLifecycleTransition = mcpLifecycleTransition
        .then(() => task())
        .catch(err => console.warn('[mcp] lifecycle transition failed:', err));
}

function activateMcp(): void {
    if (isMcpEnabled()) {
        setupMcp();
    }
    // Single reconciler for every trigger: a setting change, trust being granted, or a
    // project-scope file being created/edited/deleted. Recomputes whether MCP should be
    // running and, if it already is, opportunistically refreshes it (covers edits that
    // don't flip the on/off decision — e.g. adding a server to an already-loaded file).
    const reevaluate = () => {
        const enabled = isMcpEnabled();
        queueMcpLifecycleTransition(async () => {
            const existing = getMcpClientManager();
            if (enabled) {
                if (existing) {
                    // Sync the trust flag first (a cheap no-op if it hasn't changed — see
                    // McpClientManager.setWorkspaceTrusted), then always refresh so a plain
                    // file edit still picks up, regardless of what triggered this reconcile.
                    await existing.setWorkspaceTrusted(vscodeWorkspace.isTrusted)
                        .then(() => existing.refresh())
                        .then(() => pushMcpUpdate(existing))
                        .catch(err => console.warn('[mcp] Watch-triggered refresh failed:', err));
                } else {
                    await setupMcp();
                }
            } else if (existing) {
                await teardownMcp();
            }
        });
        sendConfigChangeNotification('mcpToolsEnabled', enabled);
    };
    const subscriptions: vscode.Disposable[] = [
        vscodeWorkspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(MCP_ENABLE_SETTING_KEY)) {
                reevaluate();
            }
        }),
        // Trust unlocks the project `.mcp.json`, which may be the only opt-in signal.
        vscodeWorkspace.onDidGrantWorkspaceTrust(() => reevaluate()),
    ];
    // One watcher covers the user-global file plus every project-scope path (primary and
    // additional), whether or not MCP is currently on — a file appearing/disappearing may
    // flip the implicit opt-in, and an edit to an already-loaded file needs a refresh.
    const disposeMcpWatcher = watchMcpConfig(resolveProjectRootPath() || undefined, reevaluate);
    subscriptions.push({ dispose: disposeMcpWatcher });
    extension.context?.subscriptions.push(...subscriptions);
}
