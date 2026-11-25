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

/** What the A2A form knows about the agent card while the user is filling it in. */
export interface GenerateAgentSkillsCard {
    name?: string;
    description?: string;
    inputModes?: string;
    outputModes?: string;
}

export interface GenerateAgentSkillsRequest {
    projectPath: string;
    /** The agent variable the card is for. */
    agentName: string;
    card?: GenerateAgentSkillsCard;
    /** The skills already written, each as "Name: description". They are kept and not repeated. */
    existingSkills: string[];
}

export interface GenerateAgentSkillsResponse {
    /** New skills, each as "Name: description", ready to add to the Skills field. */
    skills: string[];
}

export interface A2aSkillInfo {
    id: string;
    name: string;
    description: string;
    tags: string[];
    examples: string[];
}

export interface A2aSecuritySchemeInfo {
    /** The scheme's name in the card (the key under `securitySchemes`). */
    name: string;
    /** A readable kind, such as "Bearer", "Basic", "API key" or "OAuth2". */
    kind: string;
}

/** The parts of an Agent Card the "Use Remote Agent (A2A)" form shows. */
export interface A2aAgentCardInfo {
    name: string;
    description: string;
    version: string;
    provider?: string;
    documentationUrl?: string;
    endpointUrl?: string;
    protocolBinding?: string;
    protocolVersion?: string;
    /** Every protocol binding the card lists, such as `HTTP+JSON` or `JSONRPC`. */
    protocolBindings: string[];
    streaming: boolean;
    pushNotifications: boolean;
    extendedAgentCard: boolean;
    securitySchemes: A2aSecuritySchemeInfo[];
    inputModes: string[];
    outputModes: string[];
    skills: A2aSkillInfo[];
}

export interface A2aCardFetchRequest {
    /** An agent URL, an Agent Card URL, or the card's JSON text. */
    source: string;
    /** Headers to send when fetching the card, for an agent behind a gateway that protects it. Never stored. */
    headers?: Record<string, string>;
}

export interface A2aCardFetchResponse {
    card?: A2aAgentCardInfo;
    /** The agent's base URL, with any `/.well-known/agent-card.json` suffix removed. */
    agentUrl?: string;
    /** Set when the source was pasted JSON rather than a URL, so no URL is known. */
    fromJson?: boolean;
    /** A suggested name for the toolkit variable, derived from the card name. */
    toolkitName?: string;
    /** Set when the toolkit cannot call the agent, such as a card that lists no HTTP+JSON interface. */
    unsupported?: string;
    error?: string;
}

/** A configurable the remote agent's connection reads, declared with the toolkit. */
export interface A2aConfigurable {
    name: string;
    /** The Ballerina expression it defaults to, such as `"http://localhost:9092"`. Empty for a required one. */
    defaultValue?: string;
    /** The value written to Config.toml, as plain text. Never written into the code. */
    configValue?: string;
}

export interface A2aToolKitUpdateRequest {
    agentFlowNode: FlowNode;
    /** The `A2A_TOOL_KIT` node: a new one from the template, or an existing one being edited. */
    updatedNode: FlowNode;
    configurables: A2aConfigurable[];
}
