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
    AgentManagerAPI,
    AgentManagerActionRequest,
    AgentManagerActionResponse,
    AgentManagerBindDiscardRequest,
    AgentManagerBindResult,
    AgentManagerMcpBindRequest,
    AgentManagerMcpBinding,
    AgentManagerMcpOffer,
    AgentManagerMcpProxies,
    AgentManagerModelBindRequest,
    AgentManagerModelProviders,
    AgentManagerSession,
    AgentManagerStatus,
    AgentManagerStatusRequest,
    bindAgentManagerMcpProxy,
    getAgentManagerMcpOffer,
    getAgentManagerMcpProxies,
    bindAgentManagerModelProvider,
    commitAgentManagerMcpProxy,
    commitAgentManagerModelProvider,
    discardAgentManagerBinding,
    getAgentManagerModelProviders,
    getAgentManagerSession,
    getAgentManagerStatus,
    runAgentManagerAction,
    AgentManagerCreateForm,
    AgentManagerCreateRequest,
    AgentManagerLinkRequest,
    AgentManagerRepoDetails,
    AgentManagerRepoRequest,
    AgentManagerSourceCheck,
    AgentManagerSourceCheckRequest,
    linkAgentManagerAgent,
    getAgentManagerCreateForm,
    getAgentManagerRepoDetails,
    checkAgentManagerSource,
    createAgentManagerAgent,
} from "@wso2/ballerina-core";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { Messenger } from "vscode-messenger-webview";

export class AgentManagerRpcClient implements AgentManagerAPI {
    private _messenger: Messenger;

    constructor(messenger: Messenger) {
        this._messenger = messenger;
    }

    getAgentManagerStatus(params: AgentManagerStatusRequest): Promise<AgentManagerStatus> {
        return this._messenger.sendRequest(getAgentManagerStatus, HOST_EXTENSION, params);
    }

    runAgentManagerAction(params: AgentManagerActionRequest): Promise<AgentManagerActionResponse> {
        return this._messenger.sendRequest(runAgentManagerAction, HOST_EXTENSION, params);
    }

    getAgentManagerMcpOffer(): Promise<AgentManagerMcpOffer> {
        return this._messenger.sendRequest(getAgentManagerMcpOffer, HOST_EXTENSION);
    }

    addAgentManagerMcpServers(params: AddAgentManagerMcpServersRequest): Promise<AgentManagerActionResponse> {
        return this._messenger.sendRequest(addAgentManagerMcpServers, HOST_EXTENSION, params);
    }

    getAgentManagerSession(): Promise<AgentManagerSession> {
        return this._messenger.sendRequest(getAgentManagerSession, HOST_EXTENSION);
    }

    getAgentManagerModelProviders(): Promise<AgentManagerModelProviders> {
        return this._messenger.sendRequest(getAgentManagerModelProviders, HOST_EXTENSION);
    }

    bindAgentManagerModelProvider(params: AgentManagerModelBindRequest): Promise<AgentManagerBindResult> {
        return this._messenger.sendRequest(bindAgentManagerModelProvider, HOST_EXTENSION, params);
    }

    commitAgentManagerModelProvider(params: AgentManagerModelBindRequest): Promise<AgentManagerActionResponse> {
        return this._messenger.sendRequest(commitAgentManagerModelProvider, HOST_EXTENSION, params);
    }

    getAgentManagerMcpProxies(params: AgentManagerStatusRequest): Promise<AgentManagerMcpProxies> {
        return this._messenger.sendRequest(getAgentManagerMcpProxies, HOST_EXTENSION, params);
    }

    bindAgentManagerMcpProxy(params: AgentManagerMcpBindRequest): Promise<AgentManagerMcpBinding> {
        return this._messenger.sendRequest(bindAgentManagerMcpProxy, HOST_EXTENSION, params);
    }

    commitAgentManagerMcpProxy(params: AgentManagerMcpBindRequest): Promise<AgentManagerActionResponse> {
        return this._messenger.sendRequest(commitAgentManagerMcpProxy, HOST_EXTENSION, params);
    }

    discardAgentManagerBinding(params: AgentManagerBindDiscardRequest): Promise<void> {
        return this._messenger.sendRequest(discardAgentManagerBinding, HOST_EXTENSION, params);
    }

    linkAgentManagerAgent(params: AgentManagerLinkRequest): Promise<AgentManagerActionResponse> {
        return this._messenger.sendRequest(linkAgentManagerAgent, HOST_EXTENSION, params);
    }

    getAgentManagerCreateForm(params: AgentManagerStatusRequest): Promise<AgentManagerCreateForm> {
        return this._messenger.sendRequest(getAgentManagerCreateForm, HOST_EXTENSION, params);
    }

    getAgentManagerRepoDetails(params: AgentManagerRepoRequest): Promise<AgentManagerRepoDetails> {
        return this._messenger.sendRequest(getAgentManagerRepoDetails, HOST_EXTENSION, params);
    }

    checkAgentManagerSource(params: AgentManagerSourceCheckRequest): Promise<AgentManagerSourceCheck> {
        return this._messenger.sendRequest(checkAgentManagerSource, HOST_EXTENSION, params);
    }

    createAgentManagerAgent(params: AgentManagerCreateRequest): Promise<AgentManagerActionResponse> {
        return this._messenger.sendRequest(createAgentManagerAgent, HOST_EXTENSION, params);
    }
}
