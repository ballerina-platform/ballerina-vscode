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
import * as fs from 'fs';
import { AIUserToken, LoginMethod, AuthCredentials } from '@wso2/ballerina-core';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropicAws } from '@ai-sdk/anthropic-aws';
import { createVertexAnthropic } from '@ai-sdk/google-vertex/anthropic';
import { generateText } from 'ai';
import { extension } from '../../BalExtensionContext';
import {
    getAccessToken,
    getLoginMethod,
    clearAuthCredentials,
    storeAuthCredentials,
    isPlatformExtensionAvailable,
    isDevantUserLoggedIn,
    getPlatformStsToken,
    exchangeStsToCopilotToken
} from '../../utils/ai/auth';
import { getBedrockRegionalPrefix } from '../../features/ai/utils/ai-client';
import { WICommandIds } from '@wso2/wso2-platform-core';

const LEGACY_ACCESS_TOKEN_SECRET_KEY = 'BallerinaAIUser';
const LEGACY_REFRESH_TOKEN_SECRET_KEY = 'BallerinaAIRefreshToken';

export const checkToken = async (): Promise<AuthCredentials | undefined> => {
    return new Promise(async (resolve, reject) => {
        try {
            // Clean up any legacy tokens on initialization
            await cleanupLegacyTokens();

            // First check if we have stored credentials
            const credentials = await getAccessToken();
            if (credentials) {
                resolve(credentials);
                return;
            }

            // No stored credentials - check if user is logged into Devant
            if (isPlatformExtensionAvailable()) {
                const isLoggedIn = await isDevantUserLoggedIn();
                if (isLoggedIn) {
                    // User is logged into Devant but no stored credentials
                    // Exchange STS token and store credentials
                    try {
                        const stsToken = await getPlatformStsToken();
                        if (stsToken) {
                            const secrets = await exchangeStsToCopilotToken(stsToken);
                            const newCredentials: AuthCredentials = {
                                loginMethod: LoginMethod.BI_INTEL,
                                secrets
                            };
                            await storeAuthCredentials(newCredentials);
                            resolve(newCredentials);
                            return;
                        }
                    } catch (exchangeError) {
                        console.error('Failed to exchange STS token during checkToken:', exchangeError);
                    }
                }
            }

            resolve(undefined);
        } catch (error) {
            reject(error);
        }
    });
};

const cleanupLegacyTokens = async (): Promise<void> => {
    try {
        const legacyToken = await extension.context.secrets.get(LEGACY_ACCESS_TOKEN_SECRET_KEY);
        const legacyRefreshToken = await extension.context.secrets.get(LEGACY_REFRESH_TOKEN_SECRET_KEY);

        if (legacyToken || legacyRefreshToken) {
            await extension.context.secrets.delete(LEGACY_ACCESS_TOKEN_SECRET_KEY);
            await extension.context.secrets.delete(LEGACY_REFRESH_TOKEN_SECRET_KEY);
        }
    } catch (error) {
        console.error('Error cleaning up legacy tokens:', error);
    }
};

export const logout = async (_isUserLogout: boolean = true) => {
    // Sign out from the WSO2 Platform extension if logged in via BI_INTEL
    const loginMethod = await getLoginMethod();
    if (loginMethod === LoginMethod.BI_INTEL && isPlatformExtensionAvailable()) {
        try {
            await vscode.commands.executeCommand(WICommandIds.SignOut);
        } catch (error) {
            console.error('Error signing out from WSO2 Platform extension:', error);
        }
    }

    // Always clear stored credentials
    await clearAuthCredentials();
};

/**
 * Initiate Devant authentication via the platform extension.
 * Returns true if login was triggered, false if platform extension is not available.
 */
export async function initiateDevantAuth(): Promise<boolean> {
    if (!isPlatformExtensionAvailable()) {
        throw new Error('WSO2 Platform extension is not installed. Please install it to use WSO2 Integrator Copilot.');
    }

    // Trigger platform extension login command
    await vscode.commands.executeCommand(WICommandIds.SignIn);
    return true;
}

export const validateApiKey = async (apiKey: string, loginMethod: LoginMethod): Promise<AIUserToken> => {
    if (loginMethod !== LoginMethod.ANTHROPIC_KEY) {
        throw new Error('This login method is not supported. Please use SSO login instead.');
    }

    if (!apiKey || !apiKey.startsWith('sk-') || apiKey.length < 20) {
        throw new Error('Please enter a valid Anthropic API key.');
    }

    try {
        const directAnthropic = createAnthropic({
            apiKey: apiKey,
            baseURL: 'https://api.anthropic.com/v1'
        });

        await generateText({
            model: directAnthropic('claude-haiku-4-5-20251001'),
            maxOutputTokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
        });

        // Store credentials
        const credentials: AuthCredentials = {
            loginMethod: LoginMethod.ANTHROPIC_KEY,
            secrets: {
                apiKey: apiKey
            }
        };
        await storeAuthCredentials(credentials);

        return { credentials: credentials };

    } catch (error) {
        console.error('API key validation failed:', error);
        if (error instanceof Error) {
            if (error.message.includes('401') || error.message.includes('authentication')) {
                throw new Error('Invalid API key. Please check your key and try again.');
            } else if (error.message.includes('403')) {
                throw new Error('Your API key does not have access to Claude. Please check your Anthropic account.');
            } else if (error.message.includes('rate_limit')) {
                throw new Error('Too many requests. Please wait a moment and try again.');
            }
            throw new Error('Connection failed. Please check your internet connection and ensure your API key is valid.');
        }
        throw new Error('Validation failed. Please try again.');
    }
};

export const validateAwsCredentials = async (credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    sessionToken?: string;
}): Promise<AIUserToken> => {
    const { accessKeyId, secretAccessKey, region, sessionToken } = credentials;

    if (!accessKeyId || !secretAccessKey || !region) {
        throw new Error('AWS access key ID, secret access key, and region are required.');
    }

    if (!accessKeyId.startsWith('AKIA') && !accessKeyId.startsWith('ASIA')) {
        throw new Error('Please enter a valid AWS access key ID.');
    }

    if (secretAccessKey.length < 20) {
        throw new Error('Please enter a valid AWS secret access key.');
    }

    // List of valid AWS regions
    const validRegions = [
        'us-east-1', 'us-west-2', 'us-west-1', 'eu-west-1', 'eu-central-1',
        'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
        'ap-south-1', 'ca-central-1', 'sa-east-1', 'eu-west-2', 'eu-west-3',
        'eu-north-1', 'ap-east-1', 'me-south-1', 'af-south-1', 'ap-southeast-3'
    ];

    if (!validRegions.includes(region)) {
        throw new Error(`Invalid AWS region. Please select a valid region like us-east-1, us-west-2, etc.`);
    }

    try {
        const bedrock = createAmazonBedrock({
            region: region,
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
            sessionToken: sessionToken,
        });

        // Get regional prefix based on AWS region and construct model ID
        const regionalPrefix = getBedrockRegionalPrefix(region);
        const modelId = `${regionalPrefix}.anthropic.claude-haiku-4-5-20251001-v1:0`;
        const bedrockClient = bedrock(modelId);

        // Make a minimal test call to validate credentials
        await generateText({
            model: bedrockClient,
            maxOutputTokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
        });

        // Store credentials
        const authCredentials: AuthCredentials = {
            loginMethod: LoginMethod.AWS_BEDROCK,
            secrets: {
                accessKeyId,
                secretAccessKey,
                region,
                sessionToken
            }
        };
        await storeAuthCredentials(authCredentials);

        return { credentials: authCredentials };

    } catch (error) {
        console.error('AWS Bedrock validation failed:', error);
        throw new Error('Validation failed. Please check the log for more details.');
    }
};

export const validateVertexAiCredentials = async (credentials: {
    projectId: string;
    location: string;
    keyFile: string;
}): Promise<AIUserToken> => {
    const { projectId, location, keyFile } = credentials;

    if (!projectId || !location || !keyFile) {
        throw new Error('GCP Project ID, location, and service account JSON file are required.');
    }

    if (!fs.existsSync(keyFile)) {
        throw new Error(`Service account JSON file not found: ${keyFile}`);
    }

    try {
        JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error('Credentials file is not valid JSON.');
        }
        throw error;
    }

    try {
        const vertexAnthropic = createVertexAnthropic({
            project: projectId,
            location: location,
            googleAuthOptions: {
                keyFile: keyFile,
            },
        });

        await generateText({
            model: vertexAnthropic('claude-haiku-4-5@20251001'),
            maxOutputTokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
        });

        const authCredentials: AuthCredentials = {
            loginMethod: LoginMethod.VERTEX_AI,
            secrets: {
                projectId,
                location,
                keyFile
            }
        };
        await storeAuthCredentials(authCredentials);

        return { credentials: authCredentials };

    } catch (error) {
        console.error('Vertex AI validation failed:', error);
        const detail = error instanceof Error ? error.message : String(error);
        if (detail.includes('401') || detail.includes('authentication') || detail.includes('UNAUTHENTICATED')) {
            throw new Error(`Invalid credentials. Please check your service account JSON file. (${detail})`);
        } else if (detail.includes('403') || detail.includes('PERMISSION_DENIED')) {
            throw new Error(`Permission denied. Please ensure your service account has access to Vertex AI. (${detail})`);
        } else if (detail.includes('404') || detail.includes('NOT_FOUND')) {
            throw new Error(`Project or location not found, or the model is not available in this region. (${detail})`);
        } else if (detail.includes('429') || detail.includes('Too Many Requests') || detail.includes('RESOURCE_EXHAUSTED')) {
            throw new Error(`Quota exceeded. Your GCP project may have 0 quota for this Anthropic model — request a quota increase in GCP Console → IAM & Admin → Quotas. (${detail})`);
        }
        throw new Error(`Validation failed: ${detail}`);
    }
};

export const validateAnthropicAwsCredentials = async (credentials: {
    region: string;
    workspaceId: string;
    authMode: 'sigv4' | 'apikey';
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    apiKey?: string;
}): Promise<AIUserToken> => {
    const { region, workspaceId, authMode, accessKeyId, secretAccessKey, sessionToken, apiKey } = credentials;

    if (!region || !workspaceId) {
        throw new Error('Region and workspace ID are required.');
    }

    if (!workspaceId.startsWith('wrkspc_')) {
        throw new Error('Please enter a valid workspace ID (format: wrkspc_...).');
    }

    let anthropicAws: ReturnType<typeof createAnthropicAws>;

    if (authMode === 'apikey') {
        if (!apiKey) {
            throw new Error('API key is required.');
        }
        if (!apiKey.startsWith('aws-external-anthropic-api-key-') || apiKey.length < 20) {
            throw new Error('Please enter a valid API key (format: aws-external-anthropic-api-key-...).');
        }
        anthropicAws = createAnthropicAws({ region, workspaceId, apiKey });
    } else {
        if (!accessKeyId || !secretAccessKey) {
            throw new Error('Access key ID and secret access key are required.');
        }
        if (!accessKeyId.startsWith('AKIA') && !accessKeyId.startsWith('ASIA')) {
            throw new Error('Please enter a valid AWS access key ID.');
        }
        if (secretAccessKey.length < 20) {
            throw new Error('Please enter a valid AWS secret access key.');
        }
        anthropicAws = createAnthropicAws({ region, workspaceId, accessKeyId, secretAccessKey, sessionToken });
    }

    try {
        await generateText({
            model: anthropicAws('claude-haiku-4-5-20251001'),
            maxOutputTokens: 1,
            messages: [{ role: 'user', content: 'Hi' }]
        });

        const authCredentials: AuthCredentials = {
            loginMethod: LoginMethod.ANTHROPIC_AWS,
            secrets: { region, workspaceId, authMode, accessKeyId, secretAccessKey, sessionToken, apiKey }
        };
        await storeAuthCredentials(authCredentials);

        return { credentials: authCredentials };

    } catch (error) {
        console.error('Claude Platform on AWS validation failed:', error);
        const detail = error instanceof Error ? error.message : String(error);
        if (detail.includes('401') || detail.includes('UnauthorizedException') || detail.includes('InvalidSignatureException') || detail.includes('authentication_error')) {
            if (authMode === 'apikey') {
                throw new Error('Invalid API key. Please check your key and try again.');
            }
            throw new Error('Invalid AWS credentials. Please check your access key ID and secret access key.');
        } else if (detail.includes('403') || detail.includes('AccessDeniedException')) {
            if (authMode === 'apikey') {
                throw new Error('Access denied. Ensure your workspace ID is correct and your API key has access.');
            }
            throw new Error('Access denied. Ensure your IAM user has AnthropicInferenceAccess policy and the workspace ID is correct.');
        } else if (detail.includes('404') || detail.includes('ResourceNotFoundException')) {
            throw new Error('Workspace not found. Please verify your workspace ID from the Claude Console.');
        } else if (detail.includes('429') || detail.includes('ThrottlingException')) {
            throw new Error('Too many requests. Please wait a moment and try again.');
        }
        throw new Error(`Validation failed. Please check your credentials and try again. (${detail})`);
    }
};
