/* eslint-disable @typescript-eslint/no-explicit-any */
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

import { FlowNode, InputType, Metadata } from "../../interfaces/bi";

export type DefaultProviderKind = "model" | "embedding";

export interface ToolParameterFormValues {
    variable: string;
    type: string;
    parameterDescription: string;
}

export interface ToolParameterItem {
    id: number;
    icon: string;
    key: string;
    value: string;
    identifierEditable: boolean;
    identifierRange?: {
        fileName: string;
        startLine: {
            line: number;
            offset: number;
        };
        endLine: {
            line: number;
            offset: number;
        };
    };
    formValues: ToolParameterFormValues;
}

export interface McpToolUpdateRequest {
    agentFlowNode: FlowNode;
    selectedTools: string[];
    updatedNode?: FlowNode;
    toolScopes?: Record<string, string[]>;
}

export interface ToolParameters {
    metadata: Metadata;
    types: InputType[];
    value: ToolParametersValue;
    optional: boolean;
    editable: boolean;
    advanced: boolean;
    hidden?: boolean;
}

export interface ToolParametersValue {
    [key: string]: ValueTypeConstraint;
}

export interface ValueTypeConstraint {
    metadata: Metadata;
    valueType: string;
    value: ValueTypeConstraintValue;
    optional: boolean;
    editable: boolean;
    advanced: boolean;
    hidden?: boolean;
}

export interface ValueTypeConstraintValue {
    type: ValueType;
    variable: ValueType;
    parameterDescription: ValueType;
}

export interface ValueType {
    metadata: Metadata;
    valueType: string;
    valueTypeConstraint?: string;
    value: string;
    optional: boolean;
    editable: boolean;
    advanced: boolean;
    hidden?: boolean;
}
