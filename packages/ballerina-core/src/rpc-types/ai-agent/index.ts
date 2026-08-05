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

import { AiModuleOrgRequest, AiModuleOrgResponse, AIGentToolsRequest, AIGentToolsResponse, AIModelsRequest, AINodesRequest, AINodesResponse, AIToolsRequest, AIToolsResponse, AIModelsResponse, MemoryManagersResponse, MemoryManagersRequest, McpToolsRequest, McpToolsResponse, AIToolResponse, AIToolRequest, AIGetPackageVersionResponse, AIGetPackageVersionRequest, GenAgentToolRequest } from "../../interfaces/extended-lang-client";
import { AIAgentRequest, AIAgentResponse, AIAgentToolsUpdateRequest, DefaultProviderKind, McpToolUpdateRequest } from "./interfaces";

export interface AIAgentAPI {
    getAiModuleOrg: (params: AiModuleOrgRequest) => Promise<AiModuleOrgResponse>;
    getAllAgents: (params: AINodesRequest) => Promise<AINodesResponse>;
    getAllModels: (params: AIModelsRequest) => Promise<AINodesResponse>;
    getAllMemoryManagers: (params: MemoryManagersRequest) => Promise<MemoryManagersResponse>;
    getModels: (params: AIModelsRequest) => Promise<AIModelsResponse>;
    getTools: (params: AIToolsRequest) => Promise<AIToolsResponse>;
    getTool: (params: AIToolRequest) => Promise<AIToolResponse>;
    getMcpTools: (params: McpToolsRequest) => Promise<McpToolsResponse>;
    genTool: (params: AIGentToolsRequest) => Promise<AIGentToolsResponse>;
    genAgentTool: (params: GenAgentToolRequest) => Promise<AIGentToolsResponse>;
    fixMissingImports: () => Promise<void>;
    getPackageVersion: (params: AIGetPackageVersionRequest) => Promise<AIGetPackageVersionResponse>;
    configureDefaultModelProvider: (kind: DefaultProviderKind) => Promise<void>;
    createAIAgent: (params: AIAgentRequest) => Promise<AIAgentResponse>;
    updateAIAgentTools: (params: AIAgentToolsUpdateRequest) => Promise<AIAgentResponse>;
    updateMCPToolKit: (params: McpToolUpdateRequest) => Promise<void>;
}
