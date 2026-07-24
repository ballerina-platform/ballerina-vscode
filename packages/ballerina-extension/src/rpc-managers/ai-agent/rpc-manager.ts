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
import {
    AIAgentAPI,
    AiModuleOrgRequest,
    AiModuleOrgResponse,
    AIGentToolsResponse,
    GenAgentDefinitionRequest,
    AIModelsRequest,
    AIModelsResponse,
    AINodesRequest,
    AINodesResponse,
    AIToolRequest,
    AIToolResponse,
    AIToolsRequest,
    AIToolsResponse,
    FlowNode,
    McpToolUpdateRequest,
    McpToolsRequest,
    McpToolsResponse,
    MemoryManagersRequest,
    MemoryManagersResponse,
    NodePosition,
    AIGetPackageVersionRequest,
    AIGetPackageVersionResponse,
    DefaultProviderKind,
} from "@wso2/ballerina-core";
import { existsSync } from "fs";
import path from "path";
import vscode from "vscode";
import { URI, Utils } from "vscode-uri";
import { StateMachine } from "../../stateMachine";
import { writeBallerinaFileDidOpen } from "../../utils/modification";
import { updateSourceCode } from "../../utils/source-utils";
import { addMissingImports, checkProjectDiagnostics, removeUnusedImports } from "../ai-panel/repair-utils";
import { CONFIGURE_DEFAULT_MODEL_COMMAND } from "../../features/ai/constants";


interface EntryPosition {
    filePath: string;
    position: NodePosition;
}

export class AiAgentRpcManager implements AIAgentAPI {
    private async ensureAgentsFile(projectPath: string): Promise<string> {
        const agentsFilePath = Utils.joinPath(URI.file(projectPath), "agents.bal").fsPath;
        if (!existsSync(agentsFilePath)) {
            await writeBallerinaFileDidOpen(agentsFilePath, "");
        }
        return agentsFilePath;
    }

    async getAllAgents(params: AINodesRequest): Promise<AINodesResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const res: AINodesResponse = await context.langClient.getAllAgents(params);
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async getAllModels(params: AIModelsRequest): Promise<AINodesResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const res: AINodesResponse = await context.langClient.getAllModels(params);
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async getAllMemoryManagers(params: MemoryManagersRequest): Promise<MemoryManagersResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const res: MemoryManagersResponse = await context.langClient.getAllMemoryManagers(params);
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async getModels(params: AIModelsRequest): Promise<AIModelsResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const res: AIModelsResponse = await context.langClient.getModels(params);
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async getTools(params: AIToolsRequest): Promise<AIToolsResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const res: AIToolsResponse = await context.langClient.getTools(params);
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async getMcpTools(params: McpToolsRequest): Promise<McpToolsResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const res: McpToolsResponse = await context.langClient.getMcpTools(params);
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async genAgentDefinition(params: GenAgentDefinitionRequest): Promise<AIGentToolsResponse> {
        if (!params.description) {
            params.description = "";
        }
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                await this.ensureAgentsFile(path.dirname(params.filePath));
                const response: AIGentToolsResponse = await context.langClient.genAgentDefinition(params);
                const artifacts = await updateSourceCode({ textEdits: response.textEdits });
                resolve({ artifacts, textEdits: response.textEdits });
            } catch (error) {
                console.log(error);
            }
        });
    }

    async fixMissingImports(): Promise<void> {
        const context = StateMachine.context();
        try {
            const projectDiags = await checkProjectDiagnostics(context.langClient, context.projectPath);
            await addMissingImports(projectDiags, context.langClient);
            await removeUnusedImports(projectDiags, context.langClient);
        } catch (e) {
            console.log("fixMissingImports failed", e);
        }
    }

    async getPackageVersion(params: AIGetPackageVersionRequest): Promise<AIGetPackageVersionResponse> {
        const context = StateMachine.context();
        try {
            return await context.langClient.getPackageVersion(params);
        } catch (error) {
            console.log(error);
            return { version: "" };
        }
    }

    async getAiModuleOrg(params: AiModuleOrgRequest): Promise<AiModuleOrgResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const res: AiModuleOrgResponse = await context.langClient.getAiModuleOrg(params);
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async updateMCPToolKit(params: McpToolUpdateRequest): Promise<void> {
        const projectPath = StateMachine.context().projectPath;
        const agentsFilePath = Utils.joinPath(URI.file(projectPath), params.agentFlowNode.codedata.lineRange.fileName).fsPath;
        const connectionsFilePath = Utils.joinPath(URI.file(projectPath), "connections.bal").fsPath;
        if (!existsSync(connectionsFilePath)) {
            await writeBallerinaFileDidOpen(connectionsFilePath, "\n");
        }
        const mcpToolKitVarName = params.updatedNode.properties["variable"].value;

        // 1. Use the updatedNode from params for the MCP ToolKit edits
        let mcpEdits: { [filePath: string]: any[] } = {};
        if (params.updatedNode) {
            if (params.selectedTools.length === 0) {
                params.updatedNode.properties["permittedTools"].value = `()`;
            } else {
                if ("permittedTools" in params.updatedNode.properties) {
                    params.updatedNode.properties["permittedTools"].value = `[${params.selectedTools.map(tool => `"${tool}"`).join(", ")}]`;
                }
            }

            // Set per-tool scopes on the node for the LS to generate @ai:AgentTool annotations
            const filteredScopes: Record<string, string[]> = {};
            if (params.toolScopes && params.selectedTools.length > 0) {
                for (const tool of params.selectedTools) {
                    const scopes = params.toolScopes[tool];
                    if (scopes && scopes.length > 0) {
                        filteredScopes[tool] = scopes;
                    }
                }
            }

            if (Object.keys(filteredScopes).length > 0) {
                (params.updatedNode.properties as any)["toolScopes"] = {
                    metadata: { label: "Tool Scopes" },
                    valueType: "EXPRESSION",
                    value: JSON.stringify(filteredScopes),
                    optional: true,
                    editable: true,
                    advanced: true,
                    hidden: true,
                    codedata: {
                        kind: "INCLUDED_FIELD",
                        originalName: "toolScopes"
                    }
                };
            } else {
                // Remove stale toolScopes from the node when all scopes have been cleared
                delete (params.updatedNode.properties as any)["toolScopes"];
            }

            // Use only the template node for generating text edits
            const mcpToolKitEdits = await StateMachine.langClient().getSourceCode({
                filePath: connectionsFilePath,
                flowNode: params.updatedNode,
            });
            mcpEdits = mcpToolKitEdits.textEdits;
        }

        // Update the agent's tools array with the toolkit variable name.
        const agentFlowNode = params.agentFlowNode;
        let toolsValue = agentFlowNode.properties["tools"].value;

        // Parse existing tools and add the variable name
        if (typeof toolsValue === "string" && typeof mcpToolKitVarName === "string") {
            const toolsArray = this.parseToolsString(toolsValue);
            if (toolsArray.length > 0) {
                // Add the variable name if not exists
                if (!toolsArray.includes(mcpToolKitVarName)) {
                    toolsArray.push(mcpToolKitVarName);
                }
                // Update the tools value
                toolsValue = `[${toolsArray.join(", ")}]`;
            } else {
                toolsValue = `[${mcpToolKitVarName}]`;
            }
        } else if (Array.isArray(toolsValue) && typeof mcpToolKitVarName === "string") {
            const toolExists = toolsValue.some((tool: any) => tool.value === mcpToolKitVarName);
            if (!toolExists) {
                (toolsValue as any[]).push({
                    metadata: {
                        label: mcpToolKitVarName,
                        description: "",
                    },
                    value: mcpToolKitVarName,
                    optional: false,
                    editable: false,
                });
            }
        } else {
            toolsValue = `[${mcpToolKitVarName}]`;
        }

        // Set the updated tools value
        agentFlowNode.properties["tools"].value = toolsValue;

        // Generate source code for the updated agent
        const agentEdits = await StateMachine.langClient().getSourceCode({
            filePath: agentsFilePath,
            flowNode: agentFlowNode
        });


        // 3. Apply both edits
        await updateSourceCode({ textEdits: agentEdits.textEdits });
        await updateSourceCode({ textEdits: mcpEdits });
    }

    private parseToolsString(toolsStr: string): string[] {
        // Remove brackets and split by comma
        const trimmed = toolsStr.trim();
        if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
            return [];
        }
        const inner = trimmed.substring(1, trimmed.length - 1);
        // Handle empty array case
        if (!inner.trim()) {
            return [];
        }
        // Split by comma and trim each element
        return inner.split(",").map((tool) => tool.trim());
    }

    private toCamelCase(str: string): string {
        const words = str
            .replace(/[^a-zA-Z0-9]+/g, ' ')
            .trim()
            .split(/\s+/);
        return words
            .map((word, index) =>
                index === 0
                    ? word.toLowerCase()
                    : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            )
            .join('');
    }

    async getTool(params: AIToolRequest): Promise<AIToolResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const res: AIToolResponse = await context.langClient.getTool(params);
                resolve(res);
            } catch (error) {
                console.log(error);
            }
        });
    }

    async configureDefaultModelProvider(kind: DefaultProviderKind): Promise<void> {
        await vscode.commands.executeCommand(CONFIGURE_DEFAULT_MODEL_COMMAND, kind);
    }
}
