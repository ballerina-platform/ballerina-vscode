// Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com/) All Rights Reserved.

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

import { createAnthropic } from "@ai-sdk/anthropic";
import { LanguageModel, ModelMessage, JSONValue } from "ai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropicAws } from "@ai-sdk/anthropic-aws";
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";
import { getAccessToken, getLoginMethod, getRefreshedAccessToken, getAwsBedrockCredentials, getVertexAiCredentials, getAnthropicAwsCredentials } from "../../../utils/ai/auth";
import { AIStateMachine } from "../../../views/ai-panel/aiMachine";
import { BACKEND_URL } from "../utils";
import { LLM_API_BASE_PATH } from "../constants";
import { AIMachineEventType, AnthropicKeySecrets, AnthropicAwsSecrets, LoginMethod, BIIntelSecrets } from "@wso2/ballerina-core";

export const ANTHROPIC_HAIKU = "claude-haiku-4-5-20251001";
export const ANTHROPIC_SONNET = "claude-sonnet-5";

// Contact for requesting more Copilot quota once the usage limit is reached.
export const QUOTA_REQUEST_CONTACT_EMAIL = "support@wso2.com";
export const USAGE_LIMIT_EXCEEDED_MESSAGE =
    `Usage limit exceeded. To request additional quota, contact ${QUOTA_REQUEST_CONTACT_EMAIL}.`;

type AnthropicModel =
    | typeof ANTHROPIC_HAIKU
    | typeof ANTHROPIC_SONNET;

/**
 * Maps AWS regions to their corresponding Bedrock inference profile prefixes
 * @param region - AWS region string (e.g., 'us-east-1', 'eu-west-1', 'ap-southeast-1')
 * @returns The appropriate regional prefix for Bedrock model IDs
 */
export function getBedrockRegionalPrefix(region: string): string {
    const regionPrefix = region.split('-')[0].toLowerCase();
    
    switch (regionPrefix) {
        case 'us':
            return region.startsWith('us-gov-') ? 'us-gov' : 'us';
        case 'eu':
            return 'eu';
        case 'ap':
            return 'apac';
        case 'ca':
        case 'sa':
            return 'us'; // Canada and South America regions use US prefix
        default:
            console.warn(`Unknown region prefix: ${regionPrefix}, defaulting to 'us'`);
            return 'us';
    }
}

let cachedAnthropic: ReturnType<typeof createAnthropic> | null = null;
let cachedAuthMethod: LoginMethod | null = null;

/**
 * Reusable fetch function that handles authentication with token refresh.
 * Uses tiered refresh strategy for BI_INTEL:
 * 1. Try STS token re-exchange via platform extension
 * 2. If both fail, logout the user
 *
 * @param input - The URL, Request object, or string to fetch
 * @param options - Fetch options
 * @returns Promise<Response>
 */
export async function fetchWithAuth(input: string | URL | Request, options: RequestInit = {}): Promise<Response | undefined> {
    try {
        const credentials = await getAccessToken();
        const loginMethod = credentials.loginMethod;

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            'User-Agent': 'Ballerina-VSCode-Plugin',
            'Connection': 'keep-alive',
            'x-product': 'bi',
            'x-usage-context': 'copilot',
            'x-metadata': JSON.stringify({ isCloudEditor: !!process.env.CLOUD_ENV }),
        };

        if (credentials && loginMethod === LoginMethod.BI_INTEL) {
            // For BI_INTEL, use Bearer token
            const secrets = credentials.secrets as BIIntelSecrets;
            headers["Authorization"] = `Bearer ${secrets.accessToken}`;
        }

        // Ensure headers object exists and merge with existing headers
        options.headers = {
            ...options.headers,
            ...headers,
        };

        let response = await fetch(input, options);
        console.log("Response status: ", response.status);

        // Handle token expiration for BI_INTEL method with tiered refresh
        if (response.status === 401) {
            if (loginMethod === LoginMethod.BI_INTEL) {
                console.log("Token expired. Attempting tiered refresh for BI_INTEL...");

                try {
                    // Tiered refresh: STS token re-exchange via platform extension
                    const newToken = await getRefreshedAccessToken();
                    if (newToken) {
                        console.log("Token refreshed via STS exchange");
                        options.headers = {
                            ...options.headers,
                            'Authorization': `Bearer ${newToken}`,
                        };
                        response = await fetch(input, options);

                        // If still 401 after refresh, logout
                        if (response.status === 401) {
                            console.log("Still unauthorized after token refresh. Logging out.");
                            AIStateMachine.service().send(AIMachineEventType.SILENT_LOGOUT);
                            return;
                        }
                    } else {
                        console.log("Token refresh returned null. Logging out.");
                        AIStateMachine.service().send(AIMachineEventType.SILENT_LOGOUT);
                        return;
                    }
                } catch (refreshError) {
                    console.error("Token refresh failed:", refreshError);
                    AIStateMachine.service().send(AIMachineEventType.SILENT_LOGOUT);
                    return;
                }
            }
        }

        // Handle usage limit exceeded
        if (response.status === 429) {
            console.log("Usage limit exceeded (429)");
            const error = new Error(USAGE_LIMIT_EXCEEDED_MESSAGE);
            error.name = "UsageLimitError";
            (error as any).statusCode = 429;
            throw error;
        }

        return response;
    } catch (error: any) {
        if (error?.message === "TOKEN_EXPIRED") {
            AIStateMachine.service().send(AIMachineEventType.SILENT_LOGOUT);
        } else {
            throw error;
        }
    }
}

/**
 * Returns a singleton Anthropic client instance.
 * Re-initializes the client if the login method has changed.
 */
export const getAnthropicClient = async (model: AnthropicModel): Promise<any> => {
    const loginMethod = await getLoginMethod();

    // Recreate client if login method has changed or no cached instance
    if (!cachedAnthropic || cachedAuthMethod !== loginMethod) {
        let url = BACKEND_URL + LLM_API_BASE_PATH + "/claude";
        if (loginMethod === LoginMethod.BI_INTEL) {
            cachedAnthropic = createAnthropic({
                baseURL: url,
                apiKey: "xx", // dummy value; real auth is via fetchWithAuth
                fetch: fetchWithAuth,
            });
        } else if (loginMethod === LoginMethod.ANTHROPIC_KEY) {
            const credentials = await getAccessToken();
            const secrets = credentials.secrets as AnthropicKeySecrets;
            cachedAnthropic = createAnthropic({
                baseURL: "https://api.anthropic.com/v1",
                apiKey: secrets.apiKey,
            });
        } else if (loginMethod === LoginMethod.AWS_BEDROCK) {
            const awsCredentials = await getAwsBedrockCredentials();
            if (!awsCredentials) {
                throw new Error('AWS Bedrock credentials not found');
            }
            
            const bedrock = createAmazonBedrock({
                region: awsCredentials.region,
                accessKeyId: awsCredentials.accessKeyId,
                secretAccessKey: awsCredentials.secretAccessKey,
                sessionToken: awsCredentials.sessionToken,
            });
            
            // Map Anthropic model names to AWS Bedrock model IDs (base models without region prefix)
            const baseModelMap: Record<AnthropicModel, string> = {
                [ANTHROPIC_HAIKU]: "anthropic.claude-haiku-4-5-20251001-v1:0",
                [ANTHROPIC_SONNET]: "anthropic.claude-sonnet-5",
            };
            
            const baseModelId = baseModelMap[model];
            if (!baseModelId) {
                throw new Error(`Unsupported model for AWS Bedrock: ${model}`);
            }
            
            // Get regional prefix based on AWS region
            const regionalPrefix = getBedrockRegionalPrefix(awsCredentials.region);
            const bedrockModelId = `${regionalPrefix}.${baseModelId}`;
            
            return bedrock(bedrockModelId);
        } else if (loginMethod === LoginMethod.VERTEX_AI) {
            const vertexCredentials = await getVertexAiCredentials();
            if (!vertexCredentials) {
                throw new Error('Vertex AI credentials not found');
            }

            const vertexAnthropic = createVertexAnthropic({
                project: vertexCredentials.projectId,
                location: vertexCredentials.location,
                googleAuthOptions: {
                    keyFile: vertexCredentials.keyFile,
                },
            });

            const vertexModelMap: Record<AnthropicModel, string> = {
                [ANTHROPIC_HAIKU]: "claude-haiku-4-5@20251001",
                [ANTHROPIC_SONNET]: "claude-sonnet-5",
            };

            const vertexModelId = vertexModelMap[model];
            if (!vertexModelId) {
                throw new Error(`Unsupported model for Vertex AI: ${model}`);
            }

            return vertexAnthropic(vertexModelId);
        } else if (loginMethod === LoginMethod.ANTHROPIC_AWS) {
            const awsCredentials = await getAnthropicAwsCredentials();
            if (!awsCredentials) {
                throw new Error('Claude Platform on AWS credentials not found');
            }

            const { region, workspaceId, authMode, accessKeyId, secretAccessKey, sessionToken, apiKey } = awsCredentials as AnthropicAwsSecrets;
            const effectiveMode = authMode ?? 'sigv4';
            const anthropicAws = effectiveMode === 'apikey'
                ? createAnthropicAws({ region, workspaceId, apiKey })
                : createAnthropicAws({ region, workspaceId, accessKeyId, secretAccessKey, sessionToken });

            return anthropicAws(model);
        } else {
            throw new Error(`Unsupported login method: ${loginMethod}`);
        }

        cachedAuthMethod = loginMethod;
    }

    // For AWS Bedrock, we return directly above, so this is for other methods
    return cachedAnthropic!(model);
};

/**
 * Type definition for provider-specific cache options
 */
export type ProviderCacheOptions =
    | { anthropic: { cacheControl: { type: string } } }
    | { bedrock: { cachePoint: { type: string } } };

/**
 * Returns provider-aware cache control options for prompt caching
 * @returns Cache control options based on the current login method
 */
export const getProviderCacheControl = async (): Promise<ProviderCacheOptions> => {
    const loginMethod = await getLoginMethod();
    
    switch (loginMethod) {
        case LoginMethod.AWS_BEDROCK:
            return { bedrock: { cachePoint: { type: 'default' } } };
        case LoginMethod.ANTHROPIC_AWS:
        case LoginMethod.VERTEX_AI:
        case LoginMethod.ANTHROPIC_KEY:
        case LoginMethod.BI_INTEL:
        default:
            return { anthropic: { cacheControl: { type: "ephemeral" } } };
    }
};

export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type ProviderModelOptions =
    | { anthropic: { thinking: { type: 'disabled' }; effort?: AnthropicEffort } }
    | { bedrock: { additionalModelRequestFields: { thinking: { type: 'disabled' } } } };

/**
 * Sonnet 5 enables adaptive thinking when `thinking` is omitted, and reasoning shares
 * `maxOutputTokens` with the response — omitting it truncates answers. Bedrock ignores the
 * `anthropic` namespace and reads `providerOptions.bedrock`.
 *
 * On Bedrock the field goes through `additionalModelRequestFields`, not `reasoningConfig`:
 * the provider only serializes `reasoningConfig` when reasoning is enabled or adaptive, so a
 * `disabled` value there is silently dropped. Bedrock also requires reasoning to be off
 * alongside a forced `tool_choice`, which web-tools uses.
 */
export const getProviderModelOptions = async (effort?: AnthropicEffort): Promise<ProviderModelOptions> => {
    const loginMethod = await getLoginMethod();

    if (loginMethod === LoginMethod.AWS_BEDROCK) {
        return { bedrock: { additionalModelRequestFields: { thinking: { type: 'disabled' } } } };
    }
    return { anthropic: { thinking: { type: 'disabled' }, ...(effort ? { effort } : {}) } };
};

function isAnthropicModel(model: LanguageModel): boolean {
    if (typeof model === 'string') {
        return model.includes('anthropic') || model.includes('claude');
    }
    return (
        model.provider === 'anthropic' ||
        model.provider.includes('anthropic') ||
        model.modelId.includes('anthropic') ||
        model.modelId.includes('claude')
    );
}

/**
 * Add cache control to the last message in the array.
 * This tells Anthropic to cache everything up to this point.
 * On each agent step the last message shifts forward, incrementally caching conversation history.
 */
export function addCacheControlToMessages({
    messages,
    model,
    providerOptions = {
        anthropic: { cacheControl: { type: 'ephemeral' } },
    },
}: {
    messages: ModelMessage[];
    model: LanguageModel;
    providerOptions?: Record<string, Record<string, JSONValue>>;
}): ModelMessage[] {
    if (messages.length === 0) { return messages; }
    if (!isAnthropicModel(model)) { return messages; }

    return messages.map((message, index) => {
        if (index === messages.length - 1) {
            return {
                ...message,
                providerOptions: {
                    ...message.providerOptions,
                    ...providerOptions,
                },
            };
        }
        return message;
    });
}
