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
import { extension } from "../../BalExtensionContext";
import { DEVANT_TOKEN_EXCHANGE_URL } from '../../features/ai/utils';
import { AuthCredentials, BIIntelSecrets, LoginMethod, AnthropicAwsSecrets } from '@wso2/ballerina-core';
import type { TokenExchangeRequest } from '@wso2/wso2-cloud-client';
import { type CloudSessionOptions, getPlatformGate, withPlatformAPI } from '../cloud-auth';
import { jwtDecode, JwtPayload } from 'jwt-decode';
import { copilotName, WI_EXTENSION_ID } from '../config';

export const TOKEN_NOT_AVAILABLE_ERROR_MESSAGE = "Access token is not available.";
export const TOKEN_REFRESH_ONLY_SUPPORTED_FOR_BI_INTEL = "Token refresh is only supported for BI Intelligence authentication";
export const AUTH_CREDENTIALS_SECRET_KEY = 'CopilotAuthCredentials';
export const NO_AUTH_CREDENTIALS_FOUND = "No authentication credentials found.";

export const isNotLoggedInError = (error: unknown): boolean => {
    const message = (error as Error)?.message;
    return message === TOKEN_NOT_AVAILABLE_ERROR_MESSAGE
        || message === TOKEN_REFRESH_ONLY_SUPPORTED_FOR_BI_INTEL
        || message === NO_AUTH_CREDENTIALS_FOUND;
};

/**
 * Stores BI_INTEL credentials. WSO2 Cloud has one region; the deployment in use
 * picks the Copilot backend (features/ai/utils.ts), so no region is kept.
 */
export const storeBiIntelCredentials = async (secrets: BIIntelSecrets): Promise<AuthCredentials> => {
    const credentials: AuthCredentials = {
        loginMethod: LoginMethod.BI_INTEL,
        secrets,
    };
    await storeAuthCredentials(credentials);
    return credentials;
};

//TODO: What if user doesnt have github copilot.
//TODO: Where does auth git get triggered
export async function loginGithubCopilot() {
    try {
        // Request a session with the 'github' authentication provider
        const session = await vscode.authentication.getSession('github', ['user:email'], { createIfNone: true });
        if (session) {
            // Access the account information
            const { account, accessToken } = session;
            const { label, id } = account;

            // Output the account information
            console.log(`GitHub Account Label: ${label}`);
            console.log(`GitHub Account ID: ${id}`);

            try {
                const copilot_resp = await fetch('https://api.github.com/copilot_internal/v2/token', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "editor-version": "Neovim/0.6.1",
                        "editor-plugin-version": "copilot.vim/1.16.0",
                        "user-agent": "GithubCopilot/1.155.0"
                    },
                });
                const copilot_resp_body: any = await copilot_resp.json();
                //TODO: What if user doesnt have github copilot.
                const copilot_token = copilot_resp_body.token;
                await extension.context.secrets.store('GITHUB_TOKEN', accessToken);
                await extension.context.secrets.store('GITHUB_COPILOT_TOKEN', copilot_token);
                console.log('GitHub Copilot authorized successfully.');
                return true;
            } catch (error) {
                console.error('Error exchanging GitHub Copilot information:', error);
                vscode.window.showErrorMessage('An error occurred while exchanging GitHub Copilot information. Make sure you have GitHub Copilot access.');
                return false;
            }
        } else {
            console.log('No GitHub session found. User may not be signed in.');
            return false;
        }
    } catch (error) {
        console.error('Error retrieving GitHub account information:', error);
        return false;
    }
}

export async function refreshGithubCopilotToken() {
    try {
        console.log("Refreshing GitHub Copilot token...");
        const accessToken = await extension.context.secrets.get('GITHUB_TOKEN');
        const copilot_resp = await fetch('https://api.github.com/copilot_internal/v2/token', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "editor-version": "Neovim/0.6.1",
                "editor-plugin-version": "copilot.vim/1.16.0",
                "user-agent": "GithubCopilot/1.155.0"
            },
        });
        const copilot_resp_body: any = await copilot_resp.json();
        const copilot_token = copilot_resp_body.token;
        await extension.context.secrets.store('GITHUB_COPILOT_TOKEN', copilot_token);
    } catch (error) {
        console.error('Error retrieving GitHub account information:', error);
    }
}

vscode.authentication.onDidChangeSessions(async e => {
    if (e.provider.id === 'github') {
        if (await copilotTokenExists()) {
            // its a logout. remove token.
            await extension.context.secrets.delete('GITHUB_COPILOT_TOKEN');
            await extension.context.secrets.delete('GITHUB_TOKEN');
        } else {
            //it could be a login(which we havent captured) or a logout
            // vscode.window.showInformationMessage(
            //     'WSO2 Integrator: BI supports completions with GitHub Copilot.',
            //     'Login with GitHub Copilot'
            // ).then(selection => {
            //     if (selection === 'Login with GitHub Copilot') {
            //         commands.executeCommand('ballerina.login.copilot');
            //     }
            // });
        }
    }
});

async function copilotTokenExists() {
    const copilotToken = await extension.context.secrets.get('GITHUB_COPILOT_TOKEN');
    return copilotToken !== undefined && copilotToken !== '';
}

// ==================================
// Platform Extension (Devant) Auth Utils
// ==================================

/**
 * Check if the WSO2 Platform extension is installed
 */
export const isPlatformExtensionAvailable = (): boolean => {
    return !!vscode.extensions.getExtension(WI_EXTENSION_ID);
};

/**
 * Check if user is logged into Devant via platform extension
 */
export const isDevantUserLoggedIn = async (): Promise<boolean> => {
    try {
        const gate = await getPlatformGate();
        return !!gate?.isLoggedIn();
    } catch (error) {
        console.error('Error checking Devant login status:', error);
        return false;
    }
};

/** Whether this WSO2 Cloud deployment has a Copilot token exchange to sign in through. */
export const isCopilotTokenExchangeAvailable = (): boolean => !!DEVANT_TOKEN_EXCHANGE_URL;

/** Thrown where this WSO2 Cloud deployment has no Copilot token exchange to sign in through. */
export class CopilotTokenExchangeUnavailableError extends Error {
    constructor() {
        super(`Signing in to ${copilotName()} with WSO2 Cloud is not available for this WSO2 Cloud deployment.`);
        this.name = "CopilotTokenExchangeUnavailableError";
    }
}

/**
 * A Copilot token for the WSO2 Cloud session, or undefined when there is no
 * session this extension may use (see `CloudSessionOptions`). WSO2 Integrator
 * makes the exchange at the Copilot backend: the WSO2 Cloud token never
 * reaches this extension. Failures are reported to the person.
 */
export const exchangeForCopilotToken = async (options: CloudSessionOptions = {}): Promise<BIIntelSecrets | undefined> => {
    if (!DEVANT_TOKEN_EXCHANGE_URL) {
        const error = new CopilotTokenExchangeUnavailableError();
        vscode.window.showErrorMessage(error.message);
        throw error;
    }
    // This extension names its Copilot backend's endpoint; WSO2 Integrator exchanges only at one on its list.
    const request: TokenExchangeRequest = { target: "copilot", endpoint: DEVANT_TOKEN_EXCHANGE_URL };
    try {
        const token = await withPlatformAPI(async (api) => api?.exchangeToken(request), options);
        return token ? { accessToken: token.accessToken, expiresAt: token.expiresAt } : undefined;
    } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`${copilotName()} authentication failed: ${reason}`);
        throw error;
    }
};

/**
 * Refresh the Copilot token by exchanging the WSO2 Cloud session again
 */
export const refreshCopilotToken = async (): Promise<BIIntelSecrets> => {
    // A refresh runs unasked and often: without an exchange it fails quietly instead of raising the sign-in popup.
    if (!isCopilotTokenExchangeAvailable()) {
        throw new CopilotTokenExchangeUnavailableError();
    }
    const secrets = await exchangeForCopilotToken();
    if (!secrets) {
        throw new Error('Not signed in to WSO2 Cloud');
    }
    return secrets;
};

// ==================================
// Structured Auth Credentials Utils
// ==================================
export const storeAuthCredentials = async (credentials: AuthCredentials): Promise<void> => {
    const credentialsJson = JSON.stringify(credentials);
    await extension.context.secrets.store(AUTH_CREDENTIALS_SECRET_KEY, credentialsJson);
};

export const getAuthCredentials = async (): Promise<AuthCredentials | undefined> => {
    const credentialsJson = await extension.context.secrets.get(AUTH_CREDENTIALS_SECRET_KEY);
    if (!credentialsJson) {
        return undefined;
    }

    try {
        return JSON.parse(credentialsJson) as AuthCredentials;
    } catch (error) {
        console.error('Error parsing auth credentials:', error);
        return undefined;
    }
};

export const clearAuthCredentials = async (): Promise<void> => {
    await extension.context.secrets.delete(AUTH_CREDENTIALS_SECRET_KEY);
};

// ==================================
// Copilot Auth Utils
// ==================================
export const getLoginMethod = async (): Promise<LoginMethod | undefined> => {
    // Priority 1: Check Anthropic API key from environment
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim() !== "") {
        return LoginMethod.ANTHROPIC_KEY;
    }
    // Priority 2: Check stored credentials
    const credentials = await getAuthCredentials();
    if (credentials) {
        return credentials.loginMethod;
    }
    return undefined;
};

export const getAccessToken = async (): Promise<AuthCredentials | undefined> => {
    return new Promise(async (resolve, reject) => {
        try {
            // Priority 1: Check Anthropic API key from environment
            if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim() !== "") {
                resolve({ loginMethod: LoginMethod.ANTHROPIC_KEY, secrets: { apiKey: process.env.ANTHROPIC_API_KEY.trim() } });
                return;
            }
            // Priority 2: Check stored credentials
            const credentials = await getAuthCredentials();

            if (credentials) {
                switch (credentials.loginMethod) {
                    case LoginMethod.BI_INTEL:
                        try {
                            const secrets = credentials.secrets as BIIntelSecrets;
                            let finalSecrets = secrets;

                            // Check expiration with 5-minute buffer using expiresAt
                            const now = Date.now();
                            const bufferMs = 5 * 60 * 1000; // 5 minutes
                            const isExpired = secrets.expiresAt && (secrets.expiresAt - bufferMs) < now;

                            if (isExpired) {
                                await getRefreshedAccessToken();
                                // Get updated credentials after refresh
                                const updatedCreds = await getAuthCredentials();
                                if (updatedCreds && updatedCreds.loginMethod === LoginMethod.BI_INTEL) {
                                    finalSecrets = updatedCreds.secrets as BIIntelSecrets;
                                }
                            }
                            resolve({
                                loginMethod: LoginMethod.BI_INTEL,
                                secrets: finalSecrets
                            });
                            return;
                        } catch (err: any) {
                            // Any failure to refresh BI_INTEL token means user needs to re-login
                            reject(new Error("TOKEN_EXPIRED"));
                            return;
                        }

                    case LoginMethod.ANTHROPIC_KEY:
                        resolve(credentials);
                        return;

                    case LoginMethod.AWS_BEDROCK:
                        resolve(credentials);
                        return;

                    case LoginMethod.VERTEX_AI:
                        resolve(credentials);
                        return;

                    case LoginMethod.ANTHROPIC_AWS:
                        resolve(credentials);
                        return;

                    default:
                        const { loginMethod }: AuthCredentials = credentials;
                        reject(new Error(`Unsupported login method: ${loginMethod}`));
                        return;

                }
            }
            resolve(undefined);
        } catch (error: any) {
            reject(error);
        }
    });
};

export const getAwsBedrockCredentials = async (): Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    sessionToken?: string;
} | undefined> => {
    const credentials = await getAuthCredentials();
    if (!credentials || credentials.loginMethod !== LoginMethod.AWS_BEDROCK) {
        return undefined;
    }
    return credentials.secrets;
};

// ==================================
// Unique user identifier for BIIntel
// ==================================
export const getBiIntelId = async (): Promise<string | undefined> => {
    try {
        const credentials = await getAuthCredentials();
        if (!credentials || credentials.loginMethod !== LoginMethod.BI_INTEL) {
            return undefined;
        }

        const { accessToken } = credentials.secrets;
        const decoded = jwtDecode<JwtPayload>(accessToken);
        return decoded.sub;
    } catch (error) {
        console.error('Error decoding JWT token:', error);
        return undefined;
    }
};


export const getVertexAiCredentials = async (): Promise<{
    projectId: string;
    location: string;
    keyFile: string;
} | undefined> => {
    const credentials = await getAuthCredentials();
    if (!credentials || credentials.loginMethod !== LoginMethod.VERTEX_AI) {
        return undefined;
    }
    return credentials.secrets;
};

export const getAnthropicAwsCredentials = async (): Promise<AnthropicAwsSecrets | undefined> => {
    const credentials = await getAuthCredentials();
    if (!credentials || credentials.loginMethod !== LoginMethod.ANTHROPIC_AWS) {
        return undefined;
    }
    return credentials.secrets as AnthropicAwsSecrets;
};

export const getRefreshedAccessToken = async (): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        try {
            const credentials = await getAuthCredentials();
            if (!credentials || credentials.loginMethod !== LoginMethod.BI_INTEL) {
                throw new Error(TOKEN_REFRESH_ONLY_SUPPORTED_FOR_BI_INTEL);
            }

            // Try refreshing through WSO2 Integrator's token exchange
            try {
                console.log('Refreshing the Copilot token through WSO2 Integrator...');
                const newSecrets = await refreshCopilotToken();

                // Store the fresh token; the deployment in use picks the backend, so nothing else is kept
                const updatedCredentials = await storeBiIntelCredentials(newSecrets);
                resolve((updatedCredentials.secrets as BIIntelSecrets).accessToken);
                return;
            } catch (exchangeError) {
                console.error('Copilot token exchange failed:', exchangeError);
                // If the exchange fails, we can't refresh - reject
                reject(new Error('Token refresh failed. Please login again.'));
            }
        } catch (error: any) {
            reject(error);
        }
    });
};
