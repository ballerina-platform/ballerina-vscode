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
    | "setupExternal"
    | "fixSource"
    | "pushAndRebuild"
    | "deployLatestBuild"
    | "regenerateToken"
    | "openInConsole"
    | "openTryIt"
    | "openDeploymentSettings"
    | "openBuildLogs"
    | "openRuntimeLogs"
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

export interface AgentManagerBuild {
    name: string;
    status: string;
    percent?: number;
    steps?: { type: string; status: string; message?: string }[];
    commitId?: string;
    imageId?: string;
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
    offerAutoInstrumentation?: boolean;
}

export interface AgentManagerSource {
    repository?: string;
    branch?: string;
    remoteCommit?: string;
    isPrivate?: boolean;
    step?: AgentManagerSourceStep;
}

export interface AgentManagerStatus extends AgentManagerSession {
    /** Agents in the org that build one of this clone's remotes, offered before creating a new one. */
    candidates?: AgentManagerLinkCandidate[];
    link?: AgentManagerLink;
    source?: AgentManagerSource;
    displayName?: string;
    /** The repository and branch the agent builds, which may differ from the one this clone pushes to. */
    repository?: string;
    branch?: string;
    /** Whether a remote in this clone points at the agent's repository, so its branch tip is known. */
    tracked?: boolean;
    newCommit?: string;
    newCommitMessage?: string;
    crashed?: boolean;
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

export interface AgentManagerConfigInput {
    values: Record<string, string>;
    secrets: Record<string, boolean>;
}

export interface AgentManagerActionRequest {
    projectPath: string;
    action: AgentManagerAction;
    autoInstrumentation?: boolean;
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
    consoleUrl?: string;
    error?: string;
}

export interface AgentManagerModelBindRequest {
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

/** `created` lists the configurables a pick declared, removed again if its form closes unsaved. */
export interface AgentManagerBindResult extends AgentManagerActionResponse {
    created?: string[];
}

export interface AgentManagerBindDiscardRequest {
    projectPath: string;
    configurables: string[];
}

export interface AgentManagerMcpBinding extends AgentManagerBindResult {
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
    /** Every git secret saved for this repository starts with it. */
    secretPrefix?: string;
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
    getAgentManagerMcpOffer: () => Promise<AgentManagerMcpOffer>;
    addAgentManagerMcpServers: (params: AddAgentManagerMcpServersRequest) => Promise<AgentManagerActionResponse>;
    getAgentManagerSession: () => Promise<AgentManagerSession>;
    getAgentManagerModelProviders: () => Promise<AgentManagerModelProviders>;
    bindAgentManagerModelProvider: (params: AgentManagerModelBindRequest) => Promise<AgentManagerBindResult>;
    commitAgentManagerModelProvider: (params: AgentManagerModelBindRequest) => Promise<AgentManagerActionResponse>;
    getAgentManagerMcpProxies: (params: AgentManagerStatusRequest) => Promise<AgentManagerMcpProxies>;
    bindAgentManagerMcpProxy: (params: AgentManagerMcpBindRequest) => Promise<AgentManagerMcpBinding>;
    commitAgentManagerMcpProxy: (params: AgentManagerMcpBindRequest) => Promise<AgentManagerActionResponse>;
    discardAgentManagerBinding: (params: AgentManagerBindDiscardRequest) => Promise<void>;
    linkAgentManagerAgent: (params: AgentManagerLinkRequest) => Promise<AgentManagerActionResponse>;
    getAgentManagerCreateForm: (params: AgentManagerStatusRequest) => Promise<AgentManagerCreateForm>;
    getAgentManagerRepoDetails: (params: AgentManagerRepoRequest) => Promise<AgentManagerRepoDetails>;
    checkAgentManagerSource: (params: AgentManagerSourceCheckRequest) => Promise<AgentManagerSourceCheck>;
    createAgentManagerAgent: (params: AgentManagerCreateRequest) => Promise<AgentManagerActionResponse>;
}
