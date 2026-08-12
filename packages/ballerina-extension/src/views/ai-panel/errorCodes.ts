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

import { ErrorCode } from "@wso2/ballerina-core";

export const NOT_LOGGED_IN: ErrorCode = {
    code: 1,
    message: "You need to be logged in to use WSO2 Integrator Copilot Features. Please login and try again."
};

export const TIMEOUT: ErrorCode = {
    code: 2,
    message: "Request timeout exceeded. Please try again."
};

export const PARSING_ERROR: ErrorCode = {
    code: 3,
    message: "There was an issue with your request. Please check the input and try again."
};

export const UNKNOWN_ERROR: ErrorCode = {
    code: 4,
    message: "An unknown error occurred while generating code. Try login again to copilot"
};

export const MODIFIYING_ERROR: ErrorCode = {
    code: 5,
    message: "Code generation failed due to insufficient mapping data. Please review the fields and try again."
};

export const USER_ABORTED: ErrorCode = {
    code: 6,
    message: "The user has aborted the process."
};

export const ENDPOINT_REMOVED: ErrorCode = {
    code: 7,
    message: "Ballerina plugin is outdated. Please update the Ballerina VSCode Plugin."
};

export const INVALID_PARAMETER_TYPE: ErrorCode = {
    code: 8,
    message: "AI data mapper supports records as inputs and outputs."
};

export const INVALID_PARAMETER_TYPE_MULTIPLE_ARRAY: ErrorCode = {
    code: 9,
    message: "AI data mapper supports mappings between single input and output arrays."
};

export const SERVER_ERROR: ErrorCode = {
    code: 10,
    message: "An error occurred on the server. Please try again later."
};

export const TOO_MANY_REQUESTS: ErrorCode = {
    code: 11,
    message: "Too many requests in a short period. Please review the fields and try again."
};

export const INVALID_RECORD_UNION_TYPE: ErrorCode = {
    code: 14,
    message: "AI data mapper does not support input or output as a union of records."
};

export const INVALID_RECORD_REFERENCE: ErrorCode = {
    code: 15,
    message: "Invalid record reference. Follow <org-name>/<package-name>:<record-name> format when referencing to record in another package."
};
