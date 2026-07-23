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
 * 
 * THIS FILE INCLUDES AUTO GENERATED CODE
 */
import {
    AIAgentAPI,
    AiModuleOrgRequest,
    AiModuleOrgResponse,
    AIGentToolsResponse,
    CreateLibraryAgentDefinitionRequest,
    CreateLibraryAgentDefinitionResponse,
    AIModelsRequest,
    AIModelsResponse,
    AINodesRequest,
    AINodesResponse,
    AIToolRequest,
    AIToolResponse,
    AIToolsRequest,
    AIToolsResponse,
    configureDefaultModelProvider,
    createLibraryAgentDefinition,
    DefaultProviderKind,
    genAgentDefinition,
    GenAgentDefinitionRequest,
    getAiModuleOrg,
    getAllAgents,
    getAllMemoryManagers,
    getAllModels,
    getMcpTools,
    getModels,
    getTool,
    getTools,
    McpToolsRequest,
    McpToolsResponse,
    McpToolUpdateRequest,
    MemoryManagersRequest,
    MemoryManagersResponse,
    updateMCPToolKit,
    getPackageVersion,
    fixMissingImports,
    AIGetPackageVersionResponse,
    AIGetPackageVersionRequest
} from "@wso2/ballerina-core";
import { HOST_EXTENSION } from "vscode-messenger-common";
import { Messenger } from "vscode-messenger-webview";

export class AiAgentRpcClient implements AIAgentAPI {
    private _messenger: Messenger;

    constructor(messenger: Messenger) {
        this._messenger = messenger;
    }

    getAiModuleOrg(params: AiModuleOrgRequest): Promise<AiModuleOrgResponse> {
        return this._messenger.sendRequest(getAiModuleOrg, HOST_EXTENSION, params);
    }

    getAllAgents(params: AINodesRequest): Promise<AINodesResponse> {
        return this._messenger.sendRequest(getAllAgents, HOST_EXTENSION, params);
    }

    getAllModels(params: AIModelsRequest): Promise<AINodesResponse> {
        return this._messenger.sendRequest(getAllModels, HOST_EXTENSION, params);
    }

    getAllMemoryManagers(params: MemoryManagersRequest): Promise<MemoryManagersResponse> {
        return this._messenger.sendRequest(getAllMemoryManagers, HOST_EXTENSION, params);
    }

    getModels(params: AIModelsRequest): Promise<AIModelsResponse> {
        return this._messenger.sendRequest(getModels, HOST_EXTENSION, params);
    }

    getTools(params: AIToolsRequest): Promise<AIToolsResponse> {
        return this._messenger.sendRequest(getTools, HOST_EXTENSION, params);
    }

    getTool(params: AIToolRequest): Promise<AIToolResponse> {
        return this._messenger.sendRequest(getTool, HOST_EXTENSION, params);
    }

    getMcpTools(params: McpToolsRequest): Promise<McpToolsResponse> {
        return this._messenger.sendRequest(getMcpTools, HOST_EXTENSION, params);
    }

    genAgentDefinition(params: GenAgentDefinitionRequest): Promise<AIGentToolsResponse> {
        return this._messenger.sendRequest(genAgentDefinition, HOST_EXTENSION, params);
    }

    createLibraryAgentDefinition(params: CreateLibraryAgentDefinitionRequest): Promise<CreateLibraryAgentDefinitionResponse> {
        return this._messenger.sendRequest(createLibraryAgentDefinition, HOST_EXTENSION, params);
    }


    fixMissingImports(): Promise<void> {
        return this._messenger.sendRequest(fixMissingImports, HOST_EXTENSION);
    }

    getPackageVersion(params: AIGetPackageVersionRequest): Promise<AIGetPackageVersionResponse> {
        return this._messenger.sendRequest(getPackageVersion, HOST_EXTENSION, params);
    }

    configureDefaultModelProvider(kind: DefaultProviderKind): Promise<void> {
        this._messenger.sendNotification(configureDefaultModelProvider, HOST_EXTENSION, kind);
        return Promise.resolve();
    }

    updateMCPToolKit(params: McpToolUpdateRequest): Promise<void> {
        return this._messenger.sendRequest(updateMCPToolKit, HOST_EXTENSION, params);
    }
}
