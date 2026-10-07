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

import { NotificationType, RequestType } from "vscode-messenger-common";
import {
    AddAgentManagerMcpServersRequest,
    AgentManagerActionRequest,
    AgentManagerActionResponse,
    AgentManagerCreateForm,
    AgentManagerCreateRequest,
    AgentManagerLinkRequest,
    AgentManagerRepoDetails,
    AgentManagerRepoRequest,
    AgentManagerSourceCheck,
    AgentManagerSourceCheckRequest,
    AgentManagerMcpBindRequest,
    AgentManagerMcpBinding,
    AgentManagerMcpOffer,
    AgentManagerMcpProxies,
    AgentManagerModelBindRequest,
    AgentManagerModelProviders,
    AgentManagerSession,
    AgentManagerStatus,
    AgentManagerStatusRequest,
} from ".";

const _preFix = "agent-manager";
export const getAgentManagerStatus: RequestType<AgentManagerStatusRequest, AgentManagerStatus> =
    { method: `${_preFix}/getAgentManagerStatus` };
export const runAgentManagerAction: RequestType<AgentManagerActionRequest, AgentManagerActionResponse> =
    { method: `${_preFix}/runAgentManagerAction` };
export const getAgentManagerMcpOffer: RequestType<void, AgentManagerMcpOffer> =
    { method: `${_preFix}/getAgentManagerMcpOffer` };
export const addAgentManagerMcpServers: RequestType<AddAgentManagerMcpServersRequest, AgentManagerActionResponse> =
    { method: `${_preFix}/addAgentManagerMcpServers` };
export const getAgentManagerModelProviders: RequestType<void, AgentManagerModelProviders> =
    { method: `${_preFix}/getAgentManagerModelProviders` };
export const bindAgentManagerModelProvider: RequestType<AgentManagerModelBindRequest, AgentManagerActionResponse> =
    { method: `${_preFix}/bindAgentManagerModelProvider` };
export const getAgentManagerMcpProxies: RequestType<AgentManagerStatusRequest, AgentManagerMcpProxies> =
    { method: `${_preFix}/getAgentManagerMcpProxies` };
export const bindAgentManagerMcpProxy: RequestType<AgentManagerMcpBindRequest, AgentManagerMcpBinding> =
    { method: `${_preFix}/bindAgentManagerMcpProxy` };
export const getAgentManagerSession: RequestType<void, AgentManagerSession> =
    { method: `${_preFix}/getAgentManagerSession` };
export const agentManagerSessionChanged: NotificationType<AgentManagerSession> =
    { method: `${_preFix}/agentManagerSessionChanged` };
export const linkAgentManagerAgent: RequestType<AgentManagerLinkRequest, AgentManagerActionResponse> =
    { method: `${_preFix}/linkAgentManagerAgent` };
export const getAgentManagerCreateForm: RequestType<AgentManagerStatusRequest, AgentManagerCreateForm> =
    { method: `${_preFix}/getAgentManagerCreateForm` };
export const getAgentManagerRepoDetails: RequestType<AgentManagerRepoRequest, AgentManagerRepoDetails> =
    { method: `${_preFix}/getAgentManagerRepoDetails` };
export const checkAgentManagerSource: RequestType<AgentManagerSourceCheckRequest, AgentManagerSourceCheck> =
    { method: `${_preFix}/checkAgentManagerSource` };
export const createAgentManagerAgent: RequestType<AgentManagerCreateRequest, AgentManagerActionResponse> =
    { method: `${_preFix}/createAgentManagerAgent` };
