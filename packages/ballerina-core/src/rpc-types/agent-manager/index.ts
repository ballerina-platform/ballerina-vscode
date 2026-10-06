/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

export type AgentManagerHostingMode = "internal" | "external";

export type AgentManagerAction =
    | "signIn"
    | "signOut"
    | "chooseDeployTarget"
    | "hostOnPlatform"
    | "enableAmpTracing"
    | "setupExternal"
    | "fixSource"
    | "pushAndRebuild"
    | "deployLatestBuild"
    | "regenerateToken"
    | "openInConsole"
    | "openTryIt"
    | "openTraces"
    | "openDeploymentSettings"
    | "saveConfig"
    | "openBuildLogs"
    | "openRuntimeLogs"
    | "setRepoAccess"
    | "unlink";

export interface AgentManagerLink {
    instanceUrl: string;
    org: string;
    project: string;
    agent: string;
    mode: AgentManagerHostingMode;
    environment: string;
    tokenExpiresAt?: number;
}

export interface AgentManagerBuildStep {
    type: string;
    status: string;
    message?: string;
}

export interface AgentManagerBuild {
    name: string;
    status: string;
    percent?: number;
    steps?: AgentManagerBuildStep[];
    commitId?: string;
    imageId?: string;
    startedAt?: string;
}

export interface AgentManagerDeployment {
    environment: string;
    status: string;
    imageId?: string;
    endpointUrl?: string;
    lastDeployed?: string;
}

export interface AgentManagerSourceStep {
    id: string;
    message: string;
    actionLabel?: string;
    blocking: boolean;
}

export interface AgentManagerSource {
    repository?: string;
    branch?: string;
    remoteCommit?: string;
    isPrivate?: boolean;
    step?: AgentManagerSourceStep;
}

export interface AgentManagerStatus {
    signedIn: boolean;
    instanceUrl?: string;
    org?: string;
    ampTracing?: boolean;
    link?: AgentManagerLink;
    source?: AgentManagerSource;
    displayName?: string;
    branch?: string;
    newCommit?: string;
    crash?: { reason: string; config: boolean; defaultModelProvider: boolean };
    missingConfig?: string[];
    build?: AgentManagerBuild;
    deployment?: AgentManagerDeployment;
    unavailable?: boolean;
    error?: string;
}

export interface AgentManagerStatusRequest {
    projectPath: string;
}

export interface AgentManagerConfigField {
    id: string;
    label: string;
    group: string;
    type: string;
    required: boolean;
    secret: boolean;
    target: "env" | "file";
    localValue?: string;
    saved: boolean;
    unsupported?: string;
}

export interface AgentManagerConfigForm {
    fields: AgentManagerConfigField[];
    fileSaved: boolean;
    target?: AgentManagerDeployTarget;
    error?: string;
}

export interface AgentManagerDeployTarget {
    agentName: string;
    project: string;
    repository: string;
    branch: string;
    existing: boolean;
    tracing: boolean;
    /** Agent Manager LLM providers and MCP servers from .wso2/agent-manager.yaml, attached on deploy. */
    llmProviders: string[];
    mcpServers: string[];
}

export interface AgentManagerConfigInput {
    values: Record<string, string>;
    secrets: Record<string, boolean>;
}

export interface AgentManagerActionRequest {
    projectPath: string;
    action: AgentManagerAction;
    config?: AgentManagerConfigInput;
}

export interface AgentManagerActionResponse {
    success: boolean;
    message?: string;
}

export interface AgentManagerMcpServerOption {
    id: string;
    label: string;
    description: string;
    added: boolean;
}

export interface AgentManagerMcpOffer {
    signedIn: boolean;
    instance?: string;
    servers: AgentManagerMcpServerOption[];
}

export interface AddAgentManagerMcpServersRequest {
    ids: string[];
}

export interface AgentManagerModelProvider {
    id: string;
    name: string;
    template: string;
    /** The Ballerina module whose ModelProvider talks to this template, e.g. "ai.anthropic". */
    module?: string;
    url: string;
    /** Appended to the URL configurable in code, because injected URLs can't carry it. */
    pathSuffix?: string;
    unsupportedReason?: string;
}

export interface AgentManagerModelProviders {
    signedIn: boolean;
    providers: AgentManagerModelProvider[];
    /** The console page where an admin adds LLM service providers. */
    consoleUrl?: string;
    error?: string;
}

export interface AgentManagerModelKeyRequest {
    projectPath: string;
    providerId: string;
    urlVariable: string;
    keyVariable: string;
}

export interface AgentManagerMcpProxy {
    id: string;
    name: string;
    description?: string;
    toolCount?: number;
    unsupportedReason?: string;
}

export interface AgentManagerMcpProxies {
    signedIn: boolean;
    proxies: AgentManagerMcpProxy[];
    consoleUrl?: string;
    error?: string;
}

export interface AgentManagerMcpBindRequest {
    projectPath: string;
    proxyId: string;
}

export interface AgentManagerMcpBinding extends AgentManagerActionResponse {
    /** Ballerina expressions for the MCP form's Server Url and auth fields. */
    serverUrl?: string;
    auth?: string;
}

export interface AgentManagerSession {
    signedIn: boolean;
    instanceUrl?: string;
    org?: string;
}

export interface AgentManagerAPI {
    getAgentManagerStatus: (params: AgentManagerStatusRequest) => Promise<AgentManagerStatus>;
    runAgentManagerAction: (params: AgentManagerActionRequest) => Promise<AgentManagerActionResponse>;
    getAgentManagerConfigForm: (params: AgentManagerStatusRequest) => Promise<AgentManagerConfigForm>;
    getAgentManagerMcpOffer: () => Promise<AgentManagerMcpOffer>;
    addAgentManagerMcpServers: (params: AddAgentManagerMcpServersRequest) => Promise<AgentManagerActionResponse>;
    getAgentManagerSession: () => Promise<AgentManagerSession>;
    getAgentManagerModelProviders: () => Promise<AgentManagerModelProviders>;
    createAgentManagerModelKey: (params: AgentManagerModelKeyRequest) => Promise<AgentManagerActionResponse>;
    getAgentManagerMcpProxies: (params: AgentManagerStatusRequest) => Promise<AgentManagerMcpProxies>;
    bindAgentManagerMcpProxy: (params: AgentManagerMcpBindRequest) => Promise<AgentManagerMcpBinding>;
}
