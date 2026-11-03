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

export interface SpecFetcherInput {
    serviceName: string;
    serviceDescription?: string;
    /** Name of a file the user attached to the current message that holds the spec. */
    attachmentFileName?: string;
    /** URL of the spec, when the user gave one. */
    specUrl?: string;
    /** The spec text, when the user pasted it into the chat rather than attaching it. */
    specContent?: string;
    /** client (default): a connector for calling the API. service: a service implementing it. */
    mode?: "client" | "service";
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface ParsedEndpoint {
    path: string;
    method: HttpMethod;
    operationId?: string;
    summary?: string;
    parameters?: string[];
    requestContentTypes?: string[];
    responseContentTypes?: string[];
    responseType?: string;
}

export interface ParsedService {
    name: string;
    description?: string;
    endpoints: ParsedEndpoint[];
}

export interface ParsedSchema {
    name: string;
    type: string;
    properties?: string[];
}

export interface ParsedSpec {
    version: string;
    title: string;
    description?: string;
    baseUrl?: string;
    endpointCount: number;
    methods: HttpMethod[];
    services: ParsedService[];
    schemas?: ParsedSchema[];
    securitySchemes?: string[];
}

export interface SpecFetcherSuccess {
    success: true;
    message?: string;
    spec?: ParsedSpec;
    connector?: {
        moduleName: string;
        importStatement: string;
        generatedFiles: Array<{
            path: string;
            content: string;
        }>;
    };
    service?: {
        serviceTypeName: string;
        generatedFiles: Array<{
            path: string;
            content: string;
        }>;
    };
}

export type SpecFetcherErrorCode =
    | "USER_SKIPPED"
    | "INVALID_SPEC"
    | "PARSE_ERROR"
    | "UNSUPPORTED_VERSION"
    | "INVALID_INPUT"
    /** The spec was accepted; generating code from it failed. */
    | "GENERATION_FAILED";

export interface SpecFetcherError {
    success: false;
    message?: string;
    error: string;
    errorCode: SpecFetcherErrorCode;
    details?: string;
}

export type SpecFetcherResult = SpecFetcherSuccess | SpecFetcherError;
