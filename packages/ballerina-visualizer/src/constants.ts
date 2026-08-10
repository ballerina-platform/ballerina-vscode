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

import { TRIGGER_CHARACTERS } from '@wso2/ballerina-core';

const completionTriggers = `${TRIGGER_CHARACTERS.map((c) => `\\${c}`).join("")}\(\[`;

export const EXPRESSION_EXTRACTION_REGEX = new RegExp(
    `(?<parentContent>(?:[a-zA-Z0-9_']+[${completionTriggers}])*(?:[a-zA-Z0-9_']+(?<lastCompletionTrigger>[${completionTriggers}])))?(?<currentContent>[a-zA-Z0-9_']*)$`
);

export const BALLERINA = "ballerina";
export const BALLERINAX = "ballerinax";

export const AI = "ai";

export enum TypeHelperContext {
    GRAPHQL_FIELD_TYPE = 'GRAPHQL_FIELD_TYPE',
    GRAPHQL_INPUT_TYPE = 'GRAPHQL_INPUT_TYPE',
    HTTP_STATUS_CODE = 'HTTP_STATUS_CODE',
}

export const WSO2_MODEL_PROVIDER = "Default Model Provider (WSO2)";

export const PROVIDER_NAME_MAP: Record<string, string> = {
    "ai.anthropic": "Anthropic Model Provider",
    "ai.openai": "OpenAI Model Provider",
    "ai.azure": "Azure Model Provider",
    "ai.mistral": "Mistral Model Provider",
    "ai.deepseek": "Deepseek Model Provider",
    "ai.ollama": "Ollama Model Provider",
    "ai.openrouter": "OpenRouter Model Provider",
};

export const RESOURCE_ACTION_CALL = "RESOURCE_ACTION_CALL";
export const REMOTE_ACTION_CALL = "REMOTE_ACTION_CALL";
export const FUNCTION_CALL = "FUNCTION_CALL";
export const METHOD_CALL = "METHOD_CALL";

export const LOADING_MESSAGE = "Loading...";
export const FORM_LOADING_MESSAGE = "Loading form...";
export const AI_COMPONENT_PROGRESS_MESSAGE_TIMEOUT = 3000; // Timeout (ms) before showing the 'fetching from Central' progress message
export const AI_COMPONENT_PROGRESS_MESSAGE = "Fetching resources from Ballerina Central. This may take a few moments...";

export const CONNECTIONS_FILE = "connections.bal";
