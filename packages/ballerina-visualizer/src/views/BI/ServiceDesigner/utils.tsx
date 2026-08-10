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

import { FunctionModel, VisibleTypeItem, VisibleTypesResponse } from '@wso2/ballerina-core';
import { StringTemplateEditorConfig } from '@wso2/ballerina-side-panel';

export enum HTTP_METHOD {
    "GET" = "GET",
    "PUT" = "PUT",
    "POST" = "POST",
    "DELETE" = "DELETE",
    "PATCH" = "PATCH"
}

export const HTTP_ENUM_TYPES = [
    "string",
    "int",
    "boolean",
    "float",
    "decimal",
    "string[]",
    "int[]",
    "boolean[]",
    "float[]",
    "decimal[]"
];

export function getDefaultResponse(httpMethod: HTTP_METHOD): string {
    switch (httpMethod.toUpperCase()) {
        case HTTP_METHOD.GET:
            return "200";
        case HTTP_METHOD.PUT:
            return "200";
        case HTTP_METHOD.POST:
            return "201";
        case HTTP_METHOD.DELETE:
            return "200";
        case HTTP_METHOD.PATCH:
            return "200";
        default:
            return "200";
    }
}

export function getTitleFromStatusCodeAndType(responseCodes: VisibleTypesResponse, statusCode: string, type: string): string {
    let responseCode: VisibleTypeItem | undefined;

    if (statusCode && type) {
        // If both statusCode and type are provided, find by both
        responseCode = responseCodes.find(res => res.labelDetails.detail === statusCode && res.detail === type);
        // If not found with both, fallback to statusCode only
        if (!responseCode) {
            responseCode = responseCodes.find(res => res.labelDetails.detail === statusCode);
        }
    } else if (statusCode) {
        // If only statusCode is provided, find by statusCode only
        responseCode = responseCodes.find(res => res.labelDetails.detail === statusCode);
    } else if (type) {
        // If only type is provided, find by type only
        responseCode = responseCodes.find(res => res.detail === type);
    }

    return responseCode ? `${responseCode.labelDetails.detail} - ${responseCode.label}` : "";
}


export function sanitizedHttpPath(value: string): string {
    return removeForwardSlashes(value).replace(/-/g, '\\-').replace(/\./g, '\\.');
}

export function removeForwardSlashes(value: string): string {
    return value?.replace(/\\/g, '');
}

export function canDataBind(functionModel: FunctionModel): boolean {
    return functionModel.properties?.canDataBind?.value === "true";
}

export function getDefaultTab(functionModel: FunctionModel) {
    return functionModel.properties?.defaultTypeTab?.value as "import" | "create-from-scratch" | "browse-exisiting-types";
}

export function getReadableListenerName(name: string) {
    // Examples names: new http:Listener(8090);, new mcp:Listener("mcp://localhost:8090")
    // Convert the name to human readable name like "HTTP Listener" or "MCP Listener" etc..
    const match = name.match(/new\s+([a-zA-Z0-9_]+):Listener/i);
    const listenerType = match ? match[1] : "Unknown";
    return `${listenerType.charAt(0).toUpperCase() + listenerType.slice(1)} Listener`;
}

export function hasEditableParameters(parameters: FunctionModel['parameters']): boolean {
    if (!parameters || parameters.length === 0) {
        return false;
    }
    return parameters.some((param) => param.editable !== false);
}

/**
 * Normalizes a value to an array for MULTIPLE_SELECT and EXPRESSION_SET types.
 *
 * @param value The value to normalize
 * @returns An array containing the value(s), or an empty array if value is falsy
 */
export function normalizeValueToArray(value: any): any[] {
    if (Array.isArray(value)) {
        return value;
    }
    return value ? [value] : [];
}

export function isValueEqual(currentValue: any, initialValue: any): boolean {
    const serializeValue = new StringTemplateEditorConfig();

    const normalizeForComparison = (value: any): any => {
        if (value === null || value === undefined) return value;
        if (Array.isArray(value) || (typeof value === "object" && value.constructor === Object)) {
            return value;
        }
        if (typeof value === "string") {
            const trimmed = value.trim();
            if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
                try {
                    return JSON.parse(trimmed);
                } catch {
                    // Not valid JSON, treat as plain string
                }
            }
            const serialized = serializeValue.serializeValue(value).trim().replace(/^"|"$/g, "");
            return serialized.replace(/\s+/g, " ").trim();
        }
        return value;
    };

    const stableStringify = (obj: any): string => {
        if (obj === null || obj === undefined) return JSON.stringify(obj);
        if (Array.isArray(obj)) {
            return "[" + obj.map(stableStringify).join(",") + "]";
        }
        if (typeof obj === "object") {
            const keys = Object.keys(obj).sort();
            return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
        }
        return JSON.stringify(obj);
    };

    const normalizedCurrent = normalizeForComparison(currentValue);
    const normalizedInitial = normalizeForComparison(initialValue);

    const currentIsObj = typeof normalizedCurrent === "object" && normalizedCurrent !== null;
    const initialIsObj = typeof normalizedInitial === "object" && normalizedInitial !== null;

    if (currentIsObj && initialIsObj) {
        return stableStringify(normalizedCurrent) === stableStringify(normalizedInitial);
    }
    if (currentIsObj !== initialIsObj) return false;

    const strCurrent = String(normalizedCurrent).replace(/\s+/g, " ").trim();
    const strInitial = String(normalizedInitial).replace(/\s+/g, " ").trim();
    return strCurrent === strInitial;
};
