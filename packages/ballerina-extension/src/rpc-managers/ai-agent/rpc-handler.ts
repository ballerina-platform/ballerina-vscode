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
    AiModuleOrgRequest,
    AIAgentRequest,
    AIAgentToolsUpdateRequest,
    AIGentToolsRequest,
    AIModelsRequest,
    AINodesRequest,
    AIToolRequest,
    AIToolsRequest,
    configureDefaultModelProvider,
    createAIAgent,
    DefaultProviderKind,
    genTool,
    genAgentTool,
    GenAgentToolRequest,
    getAiModuleOrg,
    getAllAgents,
    getAllMemoryManagers,
    getAllModels,
    getMcpTools,
    getModels,
    getTool,
    getTools,
    McpToolsRequest,
    McpToolUpdateRequest,
    MemoryManagersRequest,
    updateAIAgentTools,
    updateMCPToolKit,
    AIGetPackageVersionRequest,
    getPackageVersion,
    fixMissingImports
} from "@wso2/ballerina-core";
import { Messenger } from "vscode-messenger";
import { AiAgentRpcManager } from "./rpc-manager";

export function registerAiAgentRpcHandlers(messenger: Messenger) {
    const rpcManger = new AiAgentRpcManager();
    messenger.onRequest(getAiModuleOrg, (args: AiModuleOrgRequest) => rpcManger.getAiModuleOrg(args));
    messenger.onRequest(getAllAgents, (args: AINodesRequest) => rpcManger.getAllAgents(args));
    messenger.onRequest(getAllModels, (args: AIModelsRequest) => rpcManger.getAllModels(args));
    messenger.onRequest(getAllMemoryManagers, (args: MemoryManagersRequest) => rpcManger.getAllMemoryManagers(args));
    messenger.onRequest(getModels, (args: AIModelsRequest) => rpcManger.getModels(args));
    messenger.onRequest(getTools, (args: AIToolsRequest) => rpcManger.getTools(args));
    messenger.onRequest(getTool, (args: AIToolRequest) => rpcManger.getTool(args));
    messenger.onRequest(getMcpTools, (args: McpToolsRequest) => rpcManger.getMcpTools(args));
    messenger.onRequest(genTool, (args: AIGentToolsRequest) => rpcManger.genTool(args));
    messenger.onRequest(genAgentTool, (args: GenAgentToolRequest) => rpcManger.genAgentTool(args));
    messenger.onRequest(fixMissingImports, () => rpcManger.fixMissingImports());
    messenger.onRequest(getPackageVersion, (args: AIGetPackageVersionRequest) => rpcManger.getPackageVersion(args));
    messenger.onNotification(configureDefaultModelProvider, (kind: DefaultProviderKind) => rpcManger.configureDefaultModelProvider(kind));
    messenger.onRequest(createAIAgent, (args: AIAgentRequest) => rpcManger.createAIAgent(args));
    messenger.onRequest(updateAIAgentTools, (args: AIAgentToolsUpdateRequest) => rpcManger.updateAIAgentTools(args));
    messenger.onNotification(updateMCPToolKit, (args: McpToolUpdateRequest) => rpcManger.updateMCPToolKit(args));
}
