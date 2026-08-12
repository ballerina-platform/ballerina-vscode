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
import axios from 'axios';
import { AuthCredentials, BIIntelSecrets, LoginMethod, AnthropicAwsSecrets } from '@wso2/ballerina-core';
import { IWso2PlatformExtensionAPI } from '@wso2/wso2-platform-core';
import { jwtDecode, JwtPayload } from 'jwt-decode';
import { WI_EXTENSION_ID } from '../config';

export const TOKEN_NOT_AVAILABLE_ERROR_MESSAGE = "Access token is not available.";
export const TOKEN_REFRESH_ONLY_SUPPORTED_FOR_BI_INTEL = "Token refresh is only supported for BI Intelligence authentication";
export const AUTH_CREDENTIALS_SECRET_KEY = 'CopilotAuthCredentials';
export const NO_AUTH_CREDENTIALS_FOUND = "No authentication credentials found.";

/**
 * Get the WSO2 Platform extension API, activating it if needed.
 * Returns undefined if the extension is not installed.
 */
export const getPlatformExtensionAPI = async (): Promise<IWso2PlatformExtensionAPI | undefined> => {
    const platformExt = vscode.extensions.getExtension(WI_EXTENSION_ID);
    if (!platformExt) {
        return undefined;
    }
    if (!platformExt.isActive) {
        await platformExt.activate();
    }
    return platformExt.exports?.cloudAPIs as IWso2PlatformExtensionAPI;
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
 * Get STS token from the platform extension
 */
export const getPlatformStsToken = async (): Promise<string | undefined> => {
    try {
        const api = await getPlatformExtensionAPI();
        if (!api) {
            return undefined;
        }
        return await api.getStsToken();
    } catch (error) {
        console.error('Error getting STS token from platform extension:', error);
        return undefined;
    }
};

/**
 * Check if user is logged into Devant via platform extension
 */
export const isDevantUserLoggedIn = async (): Promise<boolean> => {
    try {
        const api = await getPlatformExtensionAPI();
        if (!api) {
            return false;
        }
        return api.isLoggedIn();
    } catch (error) {
        console.error('Error checking Devant login status:', error);
        return false;
    }
};

/**
 * Exchange STS token for Copilot token via the token exchange endpoint
 */
export const exchangeStsToCopilotToken = async (stsToken: string): Promise<BIIntelSecrets> => {
    try {
        const response = await axios.post(DEVANT_TOKEN_EXCHANGE_URL, {
            subjectToken: stsToken
        }, {
            headers: { 'Content-Type': 'application/json' },
            validateStatus: () => true
        });

        if (response.status === 201 || response.status === 200) {
            const { access_token, expires_in } = response.data;
            return {
                accessToken: access_token,
                expiresAt: Date.now() + (expires_in * 1000)
            };
        }

        throw new Error(response.data?.message || response.data?.reason || `Status ${response.status}`);
    } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`WSO2 Integrator Copilot authentication failed: ${reason}`);
        throw error;
    }
};

/**
 * Refresh the Copilot token using the STS token from platform extension
 */
export const refreshTokenViaStsExchange = async (): Promise<BIIntelSecrets> => {
    const stsToken = await getPlatformStsToken();
    if (!stsToken) {
        throw new Error('Failed to get STS token from platform extension');
    }
    return await exchangeStsToCopilotToken(stsToken);
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
// WSO2 Integrator Copilot Auth Utils
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

            // Try refreshing via STS token exchange from platform extension
            try {
                console.log('Refreshing token via STS exchange...');
                const newSecrets = await refreshTokenViaStsExchange();

                // Update stored credentials
                const updatedCredentials: AuthCredentials = {
                    loginMethod: LoginMethod.BI_INTEL,
                    secrets: newSecrets
                };
                await storeAuthCredentials(updatedCredentials);

                resolve(newSecrets.accessToken);
                return;
            } catch (stsError) {
                console.error('STS token exchange failed:', stsError);
                // If STS exchange fails, we can't refresh - reject
                reject(new Error('Token refresh failed. Please login again.'));
            }
        } catch (error: any) {
            reject(error);
        }
    });
};
