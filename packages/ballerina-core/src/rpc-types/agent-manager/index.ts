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
    /** Agents in the org that build one of this clone's remotes, offered before creating a new one. */
    candidates?: AgentManagerLinkCandidate[];
    canCreate?: boolean;
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
    error?: string;
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

export interface AgentManagerLinkCandidate {
    project: string;
    agent: string;
    displayName: string;
    repository: string;
    branch?: string;
}

export interface AgentManagerLinkRequest {
    projectPath: string;
    project: string;
    agent: string;
}

export interface AgentManagerRemote {
    name: string;
    repository: string;
}

export interface AgentManagerCreateForm {
    org?: string;
    projects: { name: string; displayName: string }[];
    agentName: string;
    remotes: AgentManagerRemote[];
    /** The remote to preselect: `upstream` when the clone is a fork, else the branch's own remote. */
    defaultRemote?: string;
    appPath: string;
    gitSecrets: string[];
    tracing: boolean;
    llmProviders: string[];
    mcpServers: string[];
    environment: string;
    fields: AgentManagerConfigField[];
    error?: string;
}

export interface AgentManagerRepoRequest {
    projectPath: string;
    remote: string;
}

export interface AgentManagerRepoDetails {
    branches: string[];
    defaultBranch?: string;
    isPrivate?: boolean;
    error?: string;
}

export interface AgentManagerSourceCheckRequest extends AgentManagerRepoRequest {
    branch: string;
    appPath: string;
}

export interface AgentManagerSourceCheck {
    ok: boolean;
    message: string;
}

export interface AgentManagerCreateRequest {
    projectPath: string;
    project: string;
    newProject?: string;
    agentName: string;
    remote: string;
    branch: string;
    appPath: string;
    /** An existing org git secret; otherwise `newToken` is stored as this repository's secret when it is private. */
    gitSecret?: string;
    newToken?: string;
    config: AgentManagerConfigInput;
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
    linkAgentManagerAgent: (params: AgentManagerLinkRequest) => Promise<AgentManagerActionResponse>;
    getAgentManagerCreateForm: (params: AgentManagerStatusRequest) => Promise<AgentManagerCreateForm>;
    getAgentManagerRepoDetails: (params: AgentManagerRepoRequest) => Promise<AgentManagerRepoDetails>;
    checkAgentManagerSource: (params: AgentManagerSourceCheckRequest) => Promise<AgentManagerSourceCheck>;
    createAgentManagerAgent: (params: AgentManagerCreateRequest) => Promise<AgentManagerActionResponse>;
}
