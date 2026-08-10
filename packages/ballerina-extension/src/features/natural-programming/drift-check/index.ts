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

import { generateObject } from "ai";
import { getAnthropicClient, getProviderModelOptions, ANTHROPIC_SONNET } from "../../ai/utils/ai-client";
import { getCodeAndApiDocsSyncPrompt, getCodeAndDocumentationSyncPrompt } from "./prompts";
import {
    ApiDocsDriftResponseSchema,
    DocumentationDriftResponseSchema,
    ApiDocsDriftResponse,
    DocumentationDriftResponse
} from "./schemas";

export interface ApiDocsDriftCheckParams {
    ballerinaSourceFiles: string;
}

export interface DocumentationDriftCheckParams {
    ballerinaSourceFiles: string;
    requirementSpecification: string;
    readmeDocumentation: string;
    developerDocumentation: string;
    nonDefaultModules?: string;
}

/**
 * Validates drift between code and API documentation
 * @param ballerinaSources - The Ballerina source files as XML string
 * @returns The drift check result with structured output
 */
export async function validateDriftWithApiDocs(ballerinaSources: string): Promise<ApiDocsDriftResponse> {
    const prompt = getCodeAndApiDocsSyncPrompt(ballerinaSources);

    const { object } = await generateObject({
        model: await getAnthropicClient(ANTHROPIC_SONNET),
        maxOutputTokens: 8192,
        providerOptions: await getProviderModelOptions(),
        schema: ApiDocsDriftResponseSchema,
        messages: [
            {
                role: "user",
                content: prompt,
            }
        ],
    });

    return object;
}

/**
 * Validates drift between code and documentation (requirements, README, developer docs)
 * @param params - DocumentationDriftCheckParams containing all documentation sources
 * @returns The drift check result with structured output
 */
export async function validateDriftWithDocumentation(params: DocumentationDriftCheckParams): Promise<DocumentationDriftResponse> {
    const prompt = getCodeAndDocumentationSyncPrompt(
        params.ballerinaSourceFiles,
        params.requirementSpecification,
        params.readmeDocumentation,
        params.developerDocumentation
    );

    const { object } = await generateObject({
        model: await getAnthropicClient(ANTHROPIC_SONNET),
        maxOutputTokens: 8192,
        providerOptions: await getProviderModelOptions(),
        schema: DocumentationDriftResponseSchema,
        messages: [
            {
                role: "user",
                content: prompt,
            }
        ],
    });

    return object;
}

/**
 * Performs API docs drift check
 * @param params - ApiDocsDriftCheckParams containing Ballerina source files
 * @returns ApiDocsDriftResponse with structured results
 */
export async function performApiDocsDriftCheck(params: ApiDocsDriftCheckParams): Promise<ApiDocsDriftResponse> {
    return await validateDriftWithApiDocs(params.ballerinaSourceFiles);
}

/**
 * Performs documentation drift check
 * @param params - DocumentationDriftCheckParams containing all documentation sources
 * @returns DocumentationDriftResponse with structured results
 */
export async function performDocumentationDriftCheck(params: DocumentationDriftCheckParams): Promise<DocumentationDriftResponse> {
    return await validateDriftWithDocumentation(params);
}
