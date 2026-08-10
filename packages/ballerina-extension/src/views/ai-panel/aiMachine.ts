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

/* eslint-disable @typescript-eslint/naming-convention */
import { createMachine, assign, interpret } from 'xstate';
import { AIMachineStateValue, AIPanelPrompt, AIMachineEventType, AIMachineContext, AIMachineSendableEvent, LoginMethod, SHARED_COMMANDS } from '@wso2/ballerina-core';
import { AiPanelWebview } from './webview';
import { extension } from '../../BalExtensionContext';
import { getAccessToken, getLoginMethod } from '../../utils/ai/auth';
import { checkToken, initiateDevantAuth, logout, validateApiKey, validateAwsCredentials, validateVertexAiCredentials, validateAnthropicAwsCredentials } from './utils';
import {
    isDevantUserLoggedIn,
    getPlatformStsToken,
    exchangeStsToCopilotToken,
    storeAuthCredentials,
    getAuthCredentials,
    getPlatformExtensionAPI
} from '../../utils/ai/auth';
import * as vscode from 'vscode';
import { notifyAiPromptUpdated } from '../../RPCLayer';
import { closeOrphanWebviewTabs } from '../closeOrphanWebviewTabs';

export const openAIWebview = async (defaultprompt?: AIPanelPrompt) => {
    extension.aiChatDefaultPrompt = defaultprompt;
    if (!AiPanelWebview.currentPanel) {
        await closeOrphanWebviewTabs([AiPanelWebview.viewType]);
        AiPanelWebview.currentPanel = new AiPanelWebview();
    } else {
        AiPanelWebview.currentPanel!.getWebview()?.reveal();
        // Notify the webview to refetch the prompt since it's already open
        if (defaultprompt) {
            notifyAiPromptUpdated();
        }
    }
};

export const closeAIWebview = () => {
    if (AiPanelWebview.currentPanel) {
        AiPanelWebview.currentPanel.dispose();
        AiPanelWebview.currentPanel = undefined;
    }
};

/**
 * Typesafe wrapper function to open the AI Panel with an optional prompt.
 *
 * This function provides type safety when opening the AI Panel by ensuring that
 * only valid AIPanelPrompt objects are passed as parameters.
 *
 * @param prompt - Optional prompt configuration for the AI Panel. Can be:
 *   - `{ type: 'command-template', ... }` - Opens with a specific command template
 *   - `{ type: 'text', text: string, planMode: boolean }` - Opens with raw text input
 *   - `undefined` - Opens without any default prompt
 *
 * @example
 * // Open with a command template
 * openAIPanelWithPrompt({
 *   type: 'command-template',
 *   command: Command.Tests,
 *   templateId: TemplateId.TestsForService,
 * });
 *
 * @example
 * // Open with text input (agent mode is the default)
 * openAIPanelWithPrompt({
 *   type: 'text',
 *   text: 'Generate a REST API',
 *   planMode: true
 * });
 *
 * @example
 * // Open empty panel
 * openAIPanelWithPrompt();
 */
export function openAIPanelWithPrompt(prompt?: AIPanelPrompt): void {
    vscode.commands.executeCommand(SHARED_COMMANDS.OPEN_AI_PANEL, prompt);
}

const aiMachine = createMachine<AIMachineContext, AIMachineSendableEvent>({
    id: 'ballerina-ai',
    initial: 'Initialize',
    predictableActionArguments: true,
    context: {
        loginMethod: undefined,
        userToken: undefined,
        errorMessage: undefined,
    },
    on: {
        DISPOSE: {
            target: 'Initialize',
            actions: assign({
                loginMethod: (_ctx) => undefined,
                userToken: (_ctx) => undefined,
                errorMessage: (_ctx) => undefined,
            })
        }
    },
    states: {
        Initialize: {
            invoke: {
                id: 'checkToken',
                src: 'checkToken',
                onDone: [
                    {
                        cond: (_ctx, event) => !!event.data,
                        target: 'Authenticated',
                        actions: assign({
                            loginMethod: (_ctx, event) => event.data.loginMethod,
                            userToken: (_ctx, event) => ({ credentials: event.data }),
                            errorMessage: (_ctx) => undefined,
                        })
                    },
                    {
                        target: 'Unauthenticated',
                        actions: assign({
                            loginMethod: (_ctx) => undefined,
                            userToken: (_ctx) => undefined,
                            errorMessage: (_ctx) => undefined,
                        })
                    }
                ],
                onError: [
                    {
                        cond: (_ctx, event) => event.data?.message === 'TOKEN_EXPIRED',
                        target: 'Unauthenticated',
                        actions: [
                            'silentLogout',
                            assign({
                                loginMethod: (_ctx) => undefined,
                                userToken: (_ctx) => undefined,
                                errorMessage: (_ctx) => undefined,
                            })
                        ]
                    },
                    {
                        target: 'Disabled',
                        actions: assign({
                            loginMethod: (_ctx) => undefined,
                            userToken: (_ctx) => undefined,
                            errorMessage: (_ctx, event) => event.data?.message || 'Unknown error'
                        })
                    }
                ]
            }
        },
        Unauthenticated: {
            on: {
                [AIMachineEventType.LOGIN]: {
                    target: 'Authenticating',
                    actions: assign({
                        loginMethod: (_ctx) => LoginMethod.BI_INTEL
                    })
                },
                [AIMachineEventType.AUTH_WITH_API_KEY]: {
                    target: 'Authenticating',
                    actions: assign({
                        loginMethod: (_ctx) => LoginMethod.ANTHROPIC_KEY
                    })
                },
                [AIMachineEventType.AUTH_WITH_AWS_BEDROCK]: {
                    target: 'Authenticating',
                    actions: assign({
                        loginMethod: (_ctx) => LoginMethod.AWS_BEDROCK
                    })
                },
                [AIMachineEventType.AUTH_WITH_VERTEX_AI]: {
                    target: 'Authenticating',
                    actions: assign({
                        loginMethod: (_ctx) => LoginMethod.VERTEX_AI
                    })
                },
                [AIMachineEventType.AUTH_WITH_ANTHROPIC_AWS]: {
                    target: 'Authenticating',
                    actions: assign({
                        loginMethod: (_ctx) => LoginMethod.ANTHROPIC_AWS
                    })
                },
                [AIMachineEventType.AUTH_WITH_AWS]: {
                    target: 'Authenticating',
                    actions: assign({
                        loginMethod: (_ctx) => LoginMethod.AWS_UNIFIED
                    })
                }
            }
        },
        Authenticating: {
            initial: 'determineFlow',
            states: {
                determineFlow: {
                    always: [
                        {
                            cond: (context) => context.loginMethod === LoginMethod.BI_INTEL,
                            target: 'ssoFlow'
                        },
                        {
                            cond: (context) => context.loginMethod === LoginMethod.ANTHROPIC_KEY,
                            target: 'apiKeyFlow'
                        },
                        {
                            cond: (context) => context.loginMethod === LoginMethod.AWS_BEDROCK,
                            target: 'awsBedrockFlow'
                        },
                        {
                            cond: (context) => context.loginMethod === LoginMethod.VERTEX_AI,
                            target: 'vertexAiFlow'
                        },
                        {
                            cond: (context) => context.loginMethod === LoginMethod.ANTHROPIC_AWS,
                            target: 'anthropicAwsFlow'
                        },
                        {
                            cond: (context) => context.loginMethod === LoginMethod.AWS_UNIFIED,
                            target: 'awsUnifiedFlow'
                        },
                        {
                            target: 'ssoFlow' // default
                        }
                    ]
                },
                ssoFlow: {
                    invoke: {
                        id: 'openLogin',
                        src: 'openLogin',
                        onError: {
                            target: '#ballerina-ai.Unauthenticated',
                            actions: assign({
                                loginMethod: (_ctx) => undefined,
                                errorMessage: (_ctx, event) => event.data?.message || 'SSO authentication failed'
                            })
                        }
                    },
                    on: {
                        [AIMachineEventType.COMPLETE_AUTH]: {
                            target: '#ballerina-ai.Authenticated',
                            actions: assign({
                                errorMessage: (_ctx) => undefined,
                            })
                        },
                        [AIMachineEventType.CANCEL_LOGIN]: {
                            target: '#ballerina-ai.Unauthenticated',
                            actions: assign({
                                loginMethod: (_ctx) => undefined,
                                errorMessage: (_ctx) => undefined,
                            })
                        }
                    }
                },
                apiKeyFlow: {
                    on: {
                        [AIMachineEventType.SUBMIT_API_KEY]: {
                            target: 'validatingApiKey',
                            actions: assign({
                                errorMessage: (_ctx) => undefined
                            })
                        },
                        [AIMachineEventType.CANCEL_LOGIN]: {
                            target: '#ballerina-ai.Unauthenticated',
                            actions: assign({
                                loginMethod: (_ctx) => undefined,
                                errorMessage: (_ctx) => undefined,
                            })
                        }
                    }
                },
                validatingApiKey: {
                    invoke: {
                        id: 'validateApiKey',
                        src: 'validateApiKey',
                        onDone: {
                            target: '#ballerina-ai.Authenticated',
                            actions: assign({
                                errorMessage: (_ctx) => undefined,
                            })
                        },
                        onError: {
                            target: 'apiKeyFlow',
                            actions: assign({
                                errorMessage: (_ctx, event) => event.data?.message || 'API key validation failed'
                            })
                        }
                    }
                },
                awsBedrockFlow: {
                    on: {
                        [AIMachineEventType.SUBMIT_AWS_CREDENTIALS]: {
                            target: 'validatingAwsCredentials',
                            actions: assign({
                                errorMessage: (_ctx) => undefined
                            })
                        },
                        [AIMachineEventType.CANCEL_LOGIN]: {
                            target: '#ballerina-ai.Unauthenticated',
                            actions: assign({
                                loginMethod: (_ctx) => undefined,
                                errorMessage: (_ctx) => undefined,
                            })
                        }
                    }
                },
                validatingAwsCredentials: {
                    invoke: {
                        id: 'validateAwsCredentials',
                        src: 'validateAwsCredentials',
                        onDone: {
                            target: '#ballerina-ai.Authenticated',
                            actions: assign({
                                errorMessage: (_ctx) => undefined,
                            })
                        },
                        onError: {
                            target: 'awsBedrockFlow',
                            actions: assign({
                                errorMessage: (_ctx, event) => event.data?.message || 'AWS credentials validation failed'
                            })
                        }
                    }
                },
                vertexAiFlow: {
                    on: {
                        [AIMachineEventType.SUBMIT_VERTEX_AI_CREDENTIALS]: {
                            target: 'validatingVertexAiCredentials',
                            actions: assign({
                                errorMessage: (_ctx) => undefined
                            })
                        },
                        [AIMachineEventType.CANCEL_LOGIN]: {
                            target: '#ballerina-ai.Unauthenticated',
                            actions: assign({
                                loginMethod: (_ctx) => undefined,
                                errorMessage: (_ctx) => undefined,
                            })
                        }
                    }
                },
                validatingVertexAiCredentials: {
                    invoke: {
                        id: 'validateVertexAiCredentials',
                        src: 'validateVertexAiCredentials',
                        onDone: {
                            target: '#ballerina-ai.Authenticated',
                            actions: assign({
                                errorMessage: (_ctx) => undefined,
                            })
                        },
                        onError: {
                            target: 'vertexAiFlow',
                            actions: assign({
                                errorMessage: (_ctx, event) => event.data?.message || 'Vertex AI credentials validation failed'
                            })
                        }
                    }
                },
                anthropicAwsFlow: {
                    on: {
                        [AIMachineEventType.SUBMIT_ANTHROPIC_AWS_CREDENTIALS]: {
                            target: 'validatingAnthropicAwsCredentials',
                            actions: assign({
                                errorMessage: (_ctx) => undefined
                            })
                        },
                        [AIMachineEventType.CANCEL_LOGIN]: {
                            target: '#ballerina-ai.Unauthenticated',
                            actions: assign({
                                loginMethod: (_ctx) => undefined,
                                errorMessage: (_ctx) => undefined,
                            })
                        }
                    }
                },
                validatingAnthropicAwsCredentials: {
                    invoke: {
                        id: 'validateAnthropicAwsCredentials',
                        src: 'validateAnthropicAwsCredentials',
                        onDone: {
                            target: '#ballerina-ai.Authenticated',
                            actions: assign({
                                errorMessage: (_ctx) => undefined,
                            })
                        },
                        onError: {
                            target: 'anthropicAwsFlow',
                            actions: assign({
                                errorMessage: (_ctx, event) => event.data?.message || 'Claude Platform on AWS credentials validation failed'
                            })
                        }
                    }
                },
                awsUnifiedFlow: {
                    on: {
                        [AIMachineEventType.SUBMIT_AWS_CREDENTIALS]: {
                            target: 'validatingAwsCredentials',
                            actions: assign({
                                loginMethod: (_ctx) => LoginMethod.AWS_BEDROCK,
                                errorMessage: (_ctx) => undefined
                            })
                        },
                        [AIMachineEventType.SUBMIT_ANTHROPIC_AWS_CREDENTIALS]: {
                            target: 'validatingAnthropicAwsCredentials',
                            actions: assign({
                                loginMethod: (_ctx) => LoginMethod.ANTHROPIC_AWS,
                                errorMessage: (_ctx) => undefined
                            })
                        },
                        [AIMachineEventType.CANCEL_LOGIN]: {
                            target: '#ballerina-ai.Unauthenticated',
                            actions: assign({
                                loginMethod: (_ctx) => undefined,
                                errorMessage: (_ctx) => undefined,
                            })
                        }
                    }
                }
            }
        },
        Authenticated: {
            invoke: {
                id: 'getTokenAfterAuth',
                src: 'getTokenAfterAuth',
                onDone: {
                    actions: assign({
                        userToken: (_ctx, event) => ({ credentials: event.data.credentials }),
                        loginMethod: (_ctx, event) => event.data.loginMethod,
                        errorMessage: (_ctx) => undefined,
                    })
                },
                onError: {
                    target: 'Unauthenticated',
                    actions: assign({
                        userToken: (_ctx) => undefined,
                        loginMethod: (_ctx) => undefined,
                        errorMessage: (_ctx, event) => event.data?.message || 'Failed to retrieve authentication credentials',
                    })
                }
            },
            on: {
                [AIMachineEventType.LOGOUT]: {
                    target: 'Unauthenticated',
                    actions: [
                        'logout',
                        assign({
                            loginMethod: (_) => undefined,
                            userToken: (_) => undefined,
                            errorMessage: (_) => undefined,
                        })
                    ]
                },
                [AIMachineEventType.SILENT_LOGOUT]: {
                    target: 'Unauthenticated',
                    actions: [
                        'silentLogout',
                        assign({
                            loginMethod: (_) => undefined,
                            userToken: (_) => undefined,
                            errorMessage: (_) => undefined,
                        })
                    ]
                }
            }
        },
        Disabled: {
            on: {
                RETRY: {
                    target: 'Initialize',
                    actions: assign({
                        userToken: (_ctx) => undefined,
                        loginMethod: (_ctx) => undefined,
                        errorMessage: (_ctx) => undefined,
                    })
                }
            }
        },
    }
});

const completeSsoSignIn = async (): Promise<void> => {
    const stsToken = await getPlatformStsToken();
    if (!stsToken) {
        throw new Error('Failed to get STS token from platform extension');
    }
    const secrets = await exchangeStsToCopilotToken(stsToken);
    await storeAuthCredentials({ loginMethod: LoginMethod.BI_INTEL, secrets });
    aiStateService.send(AIMachineEventType.COMPLETE_AUTH);
};

const openLogin = async () => {
    return new Promise(async (resolve, reject) => {
        try {
            // Check if already logged into Devant
            const isLoggedIn = await isDevantUserLoggedIn();
            if (isLoggedIn) {
                // Already logged in, exchange token
                await completeSsoSignIn();
                resolve(true);
                return;
            }

            // Not logged in, trigger platform extension login
            const status = await initiateDevantAuth();
            if (!status) {
                aiStateService.send(AIMachineEventType.CANCEL_LOGIN);
            }
            // Auth completion will be handled by platform extension login state listener
            resolve(status);
        } catch (error) {
            reject(error);
        }
    });
};

const validateApiKeyService = async (_context: AIMachineContext, event: any) => {
    const apiKey = event.payload?.apiKey;
    if (!apiKey) {
        throw new Error('API key is required');
    }
    return await validateApiKey(apiKey, LoginMethod.ANTHROPIC_KEY);
};

const validateAwsCredentialsService = async (_context: AIMachineContext, event: any) => {
    const { accessKeyId, secretAccessKey, region, sessionToken } = event.payload || {};
    if (!accessKeyId || !secretAccessKey || !region) {
        throw new Error('AWS access key ID, secret access key, and region are required');
    }
    return await validateAwsCredentials({
        accessKeyId,
        secretAccessKey,
        region,
        sessionToken
    });
};

const validateVertexAiCredentialsService = async (_context: AIMachineContext, event: any) => {
    const { projectId, location, keyFile } = event.payload || {};
    if (!projectId || !location || !keyFile) {
        throw new Error('GCP Project ID, location, and service account JSON file are required');
    }
    return await validateVertexAiCredentials({
        projectId,
        location,
        keyFile
    });
};

const validateAnthropicAwsCredentialsService = async (_context: AIMachineContext, event: any) => {
    const { region, workspaceId, authMode, accessKeyId, secretAccessKey, sessionToken, apiKey } = event.payload || {};
    return await validateAnthropicAwsCredentials({
        region,
        workspaceId,
        authMode: authMode ?? 'sigv4',
        accessKeyId,
        secretAccessKey,
        sessionToken,
        apiKey,
    });
};

const getTokenAfterAuth = async () => {
    const result = await getAccessToken();
    const loginMethod = await getLoginMethod();
    if (!result || !loginMethod) {
        throw new Error('No authentication credentials found');
    }
    return { credentials: result.secrets, loginMethod: result.loginMethod };
};

const aiStateService = interpret(aiMachine.withConfig({
    services: {
        checkToken: checkToken,
        openLogin: openLogin,
        validateApiKey: validateApiKeyService,
        validateAwsCredentials: validateAwsCredentialsService,
        validateVertexAiCredentials: validateVertexAiCredentialsService,
        validateAnthropicAwsCredentials: validateAnthropicAwsCredentialsService,
        getTokenAfterAuth: getTokenAfterAuth,
    },
    actions: {
        logout: () => {
            logout();
        },
        silentLogout: () => {
            logout(false);
        },
    }
}));

const isExtendedEvent = <K extends AIMachineEventType>(
    arg: K | AIMachineSendableEvent
): arg is Extract<AIMachineSendableEvent, { type: K }> => {
    return typeof arg !== "string";
};

/**
 * Set up listener for platform extension login state changes.
 * When user logs in via platform extension, we exchange the token and complete auth.
 */
let platformListenerSetUp = false;
let platformListenerSetupInProgress = false;
let disposePlatformLoginListener: (() => void) | undefined;
let extensionChangeDisposable: vscode.Disposable | undefined;

const watchForPlatformExtension = () => {
    if (!extensionChangeDisposable) {
        extensionChangeDisposable = vscode.extensions.onDidChange(() => {
            if (!platformListenerSetUp && !platformListenerSetupInProgress) {
                setupPlatformExtensionListener();
            }
        });
    }
};

const setupPlatformExtensionListener = () => {
    if (platformListenerSetupInProgress) {
        return;
    }
    platformListenerSetupInProgress = true;
    getPlatformExtensionAPI().then(
        (api) => {
            if (!api || !api.subscribeIsLoggedIn) {
                platformListenerSetupInProgress = false;
                watchForPlatformExtension();
                return;
            }

            // Verify auth provider is actually ready by attempting subscription.
            // When ext.authProvider is null, subscribeIsLoggedIn returns a no-op (() => {}).
            // Confirm readiness by checking getAuthState returns a real state object.
            try {
                api.getAuthState();
            } catch {
                // Auth provider not initialized yet — keep watching
                platformListenerSetupInProgress = false;
                watchForPlatformExtension();
                return;
            }

            disposePlatformLoginListener?.();
            const dispose = api.subscribeIsLoggedIn(async (wiLoggedIn: boolean) => {
                const copilotState = aiStateService.getSnapshot().value;

                if (wiLoggedIn) {
                    // Don't override an explicit non-BI_INTEL choice (Anthropic/AWS/Vertex).
                    const copilotCreds = await getAuthCredentials();
                    if (copilotCreds && copilotCreds.loginMethod !== LoginMethod.BI_INTEL) { return; }

                    const copilotUnauthenticated = copilotState === 'Unauthenticated';
                    const copilotInSsoFlow =
                        typeof copilotState === 'object' &&
                        'Authenticating' in copilotState &&
                        (copilotState as any).Authenticating === 'ssoFlow';
                    if (!copilotUnauthenticated && !copilotInSsoFlow) { return; }

                    if (copilotUnauthenticated) {
                        // COMPLETE_AUTH is only valid in ssoFlow; drive through LOGIN instead
                        aiStateService.send(AIMachineEventType.LOGIN);
                    } else {
                        try {
                            await completeSsoSignIn();
                        } catch (error) {
                            console.error('Failed to complete SSO sign-in:', error);
                            aiStateService.send(AIMachineEventType.CANCEL_LOGIN);
                        }
                    }
                } else {
                    // Integrator signed out — only react if Copilot is using BI_INTEL.
                    const copilotCreds = await getAuthCredentials();
                    if (copilotCreds?.loginMethod === LoginMethod.BI_INTEL) {
                        aiStateService.send(AIMachineEventType.LOGOUT);
                    }
                }
            });
            disposePlatformLoginListener = dispose;
            platformListenerSetUp = true;
            platformListenerSetupInProgress = false;
            extensionChangeDisposable?.dispose();
            extensionChangeDisposable = undefined;
        },
        (error) => {
            platformListenerSetupInProgress = false;
            console.error('Failed to activate platform extension for login listener:', error);
        }
    );
};

export const AIStateMachine = {
    initialize: () => {
        setupPlatformExtensionListener();
        return aiStateService.start();
    },
    service: () => { return aiStateService; },
    context: () => { return aiStateService.getSnapshot().context; },
    state: () => { return aiStateService.getSnapshot().value as AIMachineStateValue; },
    sendEvent: <K extends AIMachineEventType>(
        event: K | Extract<AIMachineSendableEvent, { type: K }>
    ) => {
        if (isExtendedEvent(event)) {
            aiStateService.send(event as AIMachineSendableEvent);
        } else {
            aiStateService.send({ type: event } as AIMachineSendableEvent);
        }
    }
};
