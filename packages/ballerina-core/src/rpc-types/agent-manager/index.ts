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
    | "setupExternal"
    | "fixSource"
    | "pushAndRebuild"
    | "deployLatestBuild"
    | "regenerateToken"
    | "openInConsole"
    | "openTryIt"
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
    agentName?: string;
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

export interface AgentManagerAPI {
    getAgentManagerStatus: (params: AgentManagerStatusRequest) => Promise<AgentManagerStatus>;
    runAgentManagerAction: (params: AgentManagerActionRequest) => Promise<AgentManagerActionResponse>;
    getAgentManagerConfigForm: (params: AgentManagerStatusRequest) => Promise<AgentManagerConfigForm>;
    getAgentManagerMcpOffer: () => Promise<AgentManagerMcpOffer>;
    addAgentManagerMcpServers: (params: AddAgentManagerMcpServersRequest) => Promise<AgentManagerActionResponse>;
}
