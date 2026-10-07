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

import {
    AddAgentManagerMcpServersRequest,
    addAgentManagerMcpServers,
    AgentManagerActionRequest,
    AgentManagerMcpBindRequest,
    AgentManagerModelKeyRequest,
    AgentManagerStatusRequest,
    bindAgentManagerMcpProxy,
    createAgentManagerModelKey,
    getAgentManagerConfigForm,
    getAgentManagerModelProviders,
    getAgentManagerSession,
    getAgentManagerMcpOffer,
    getAgentManagerMcpProxies,
    getAgentManagerStatus,
    runAgentManagerAction,
    AgentManagerCreateRequest,
    AgentManagerLinkRequest,
    AgentManagerRepoRequest,
    AgentManagerSourceCheckRequest,
    linkAgentManagerAgent,
    getAgentManagerCreateForm,
    getAgentManagerRepoDetails,
    checkAgentManagerSource,
    createAgentManagerAgent,
} from "@wso2/ballerina-core";
import { Messenger } from "vscode-messenger";
import { addMcpServers, getMcpOffer } from "../../features/agent-manager/copilot";
import { getSessionSummary, onDidChangeSession } from "../../features/agent-manager/auth";
import { getConfigForm, getStatus, runAction } from "../../features/agent-manager/flows";
import { notifyAgentManagerSessionChanged } from "../../RPCLayer";
import { createModelKey, listModelProviders } from "../../features/agent-manager/models";
import { bindMcpProxy, listMcpProxies } from "../../features/agent-manager/mcp";
import { checkSource, createAgent, getCreateForm, getRepoDetails, linkAgent } from "../../features/agent-manager/create";

export function registerAgentManagerRpcHandlers(messenger: Messenger) {
    messenger.onRequest(getAgentManagerStatus, (args: AgentManagerStatusRequest) => getStatus(args.projectPath));
    messenger.onRequest(runAgentManagerAction, (args: AgentManagerActionRequest) => runAction(args.projectPath, args.action, args.config, args.autoInstrumentation));
    messenger.onRequest(getAgentManagerConfigForm, (args: AgentManagerStatusRequest) => getConfigForm(args.projectPath));
    messenger.onRequest(getAgentManagerMcpOffer, () => getMcpOffer());
    messenger.onRequest(addAgentManagerMcpServers, (args: AddAgentManagerMcpServersRequest) => addMcpServers(args.ids));
    messenger.onRequest(getAgentManagerSession, () => getSessionSummary());
    messenger.onRequest(getAgentManagerModelProviders, () => listModelProviders());
    onDidChangeSession(() => notifyAgentManagerSessionChanged());
    messenger.onRequest(createAgentManagerModelKey, (args: AgentManagerModelKeyRequest) => createModelKey(args));
    messenger.onRequest(getAgentManagerMcpProxies, (args: AgentManagerStatusRequest) => listMcpProxies(args.projectPath));
    messenger.onRequest(bindAgentManagerMcpProxy, (args: AgentManagerMcpBindRequest) => bindMcpProxy(args));
    messenger.onRequest(linkAgentManagerAgent, (args: AgentManagerLinkRequest) => linkAgent(args));
    messenger.onRequest(getAgentManagerCreateForm, (args: AgentManagerStatusRequest) => getCreateForm(args.projectPath));
    messenger.onRequest(getAgentManagerRepoDetails, (args: AgentManagerRepoRequest) => getRepoDetails(args));
    messenger.onRequest(checkAgentManagerSource, (args: AgentManagerSourceCheckRequest) => checkSource(args));
    messenger.onRequest(createAgentManagerAgent, (args: AgentManagerCreateRequest) => createAgent(args));
}
