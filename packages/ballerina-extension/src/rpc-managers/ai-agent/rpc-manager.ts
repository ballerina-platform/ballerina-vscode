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
    AIAgentRequest,
    AIAgentResponse,
    AIAgentToolsUpdateRequest,
    AIGentToolsResponse,
    CreateLibraryAgentDefinitionRequest,
    CreateLibraryAgentDefinitionResponse,
    GenAgentDefinitionRequest,
    buildAgentToolNode,
    AIModelsRequest,
    AIModelsResponse,
    AINodesRequest,
    AINodesResponse,
    AIToolRequest,
    AIToolResponse,
    AIToolsRequest,
    AIToolsResponse,
    AgentTool,
    AgentToolRequest,
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
    DIRECTORY_MAP,
    EVENT_TYPE,
    MACHINE_VIEW,
    isPathInside,
    isSamePath,
    PROJECT_KIND
} from "@wso2/ballerina-core";
import { existsSync } from "fs";
import path from "path";
import vscode from "vscode";
import { URI, Utils } from "vscode-uri";
import { openView, StateMachine } from "../../stateMachine";
import { writeBallerinaFileDidOpen } from "../../utils/modification";
import { updateSourceCode } from "../../utils/source-utils";
import { isLibraryProject } from "../../utils/config";
import { addProjectToExistingWorkspace, validateProjectPath } from "../../utils/bi";
import { buildProjectsStructure } from "../../utils/project-artifacts";
import { addMissingImports, checkProjectDiagnostics, removeUnusedImports } from "../ai-panel/repair-utils";
import { CONFIGURE_DEFAULT_MODEL_COMMAND } from "../../features/ai/constants";


interface EntryPosition {
    filePath: string;
    position: NodePosition;
}

export class AiAgentRpcManager implements AIAgentAPI {
    /**
     * Agent declarations and generated tools are written to agents.bal. The language server
     * resolves that file while producing edits, so it must exist before a generation request.
     */
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

    async createLibraryAgentDefinition(
        params: CreateLibraryAgentDefinitionRequest
    ): Promise<CreateLibraryAgentDefinitionResponse> {
        const context = StateMachine.context();
        const workspacePath = context.workspacePath;

        if (context.projectInfo?.projectKind !== PROJECT_KIND.WORKSPACE_PROJECT || !workspacePath) {
            throw this.agentDefinitionError("Agent definitions can only be created in a library from a Ballerina workspace");
        }

        const workspaceInfo = await context.langClient.getProjectInfo({ projectPath: workspacePath });
        const activePackage = workspaceInfo.children?.find((child) =>
            isSamePath(child.projectPath, params.sourceProjectPath) || isPathInside(child.projectPath, params.sourceProjectPath)
        );
        if (!activePackage?.projectPath) {
            throw this.agentDefinitionError("The active package is not part of this Ballerina workspace");
        }

        if (await isLibraryProject(activePackage.projectPath)) {
            throw this.agentDefinitionError("The active package is already a library");
        }

        const pathValidation = validateProjectPath(workspacePath, params.packageName, true);
        if (!pathValidation.isValid) {
            throw this.agentDefinitionError(pathValidation.errorMessage ?? "Invalid library package path");
        }

        const projectPath = await addProjectToExistingWorkspace({
            projectName: params.libraryName,
            packageName: params.packageName,
            path: workspacePath,
            orgName: params.orgName,
            orgHandle: params.orgHandle,
            version: params.version,
            isLibrary: true,
        });

        const projectInfo = await this.waitForWorkspacePackage(workspacePath, projectPath);
        StateMachine.updateProjectInfo(projectInfo, { silent: true });
        await this.ensureAgentsFile(projectPath);

        const response = await context.langClient.genAgentDefinition({
            filePath: path.join(projectPath, "Ballerina.toml"),
            name: params.name,
            description: params.description ?? "",
        });
        await updateSourceCode({
            textEdits: response.textEdits,
            description: "Create library agent definition",
            waitForArtifactNotifications: false,
        });

        const { projectInfo: refreshedProjectInfo, artifact } = await this.waitForAgentDefinitionArtifact(
            workspacePath,
            projectPath,
            params.name
        );
        StateMachine.updateProjectInfo(refreshedProjectInfo, { silent: true });

        StateMachine.setReadyMode();
        openView(EVENT_TYPE.OPEN_VIEW, {
            view: MACHINE_VIEW.AgentDefinitionDesigner,
            documentUri: artifact.path,
            position: artifact.position,
            identifier: params.name,
            projectPath,
            artifactType: DIRECTORY_MAP.AGENT_DEFINITION,
        });

        return { artifacts: [artifact], textEdits: response.textEdits, projectPath };
    }

    private async waitForWorkspacePackage(workspacePath: string, projectPath: string) {
        const context = StateMachine.context();
        for (let attempt = 0; attempt < 10; attempt++) {
            const projectInfo = await context.langClient.getProjectInfo({ projectPath: workspacePath });
            if (projectInfo.children?.some((child) => isSamePath(child.projectPath, projectPath))) {
                return projectInfo;
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        throw this.agentDefinitionError("Library package was created but is not ready yet. Try creating the agent definition again.");
    }

    private async waitForAgentDefinitionArtifact(workspacePath: string, projectPath: string, name: string) {
        const context = StateMachine.context();
        for (let attempt = 0; attempt < 10; attempt++) {
            const projectInfo = await this.waitForWorkspacePackage(workspacePath, projectPath);
            const structure = await buildProjectsStructure(projectInfo, context.langClient, true);
            const artifact = structure.projects
                .find((project) => isSamePath(project.projectPath, projectPath))
                ?.directoryMap[DIRECTORY_MAP.AGENT_DEFINITIONS]
                ?.find((item) => item.name === name);

            if (artifact) {
                return { projectInfo, artifact };
            }

            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        throw this.agentDefinitionError(`Agent definition ${name} was created but could not be loaded from workspace artifacts`);
    }

    private agentDefinitionError(message: string): Error {
        vscode.window.showErrorMessage(message);
        return new Error(message);
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

    async createAIAgent(params: AIAgentRequest): Promise<AIAgentResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {

                const projectPath = context.projectPath;
                const filePath = await this.ensureAgentsFile(projectPath);
                let selectedModel = "";
                // Create the tools first
                if (params.newTools.length > 0) {
                    for (const tool of params.newTools) { // create tools one by one
                        await this.createAgentTool(tool);
                    }
                }

                // Create the model Second
                const aiModuleOrg = await StateMachine.langClient().getAiModuleOrg({ projectPath: projectPath });
                const allAgents = (await StateMachine.langClient().getAllAgents({ filePath, orgName: aiModuleOrg.orgName }));
                console.log("All Agents: ", allAgents);

                const fixedAgentCodeData = allAgents.agents.at(0);

                if (params.modelState === 1) {
                    const allModels = await StateMachine.langClient().getAllModels({ agent: fixedAgentCodeData.object, filePath, orgName: aiModuleOrg.orgName });
                    const modelCodeData = allModels.models.find(val => val.object === params.selectedModel);
                    const modelFlowNode = (await StateMachine.langClient().getNodeTemplate({ filePath, id: modelCodeData, position: { line: 0, offset: 0 }, isLibrary: await isLibraryProject(StateMachine.context().projectPath ?? '') })).flowNode;

                    // Go through the modelFields and assign each value to the flow node
                    params.modelFields.forEach(field => {
                        const excludedKeys = ["type", "checkError"];
                        if (!excludedKeys.includes(field.key)) {
                            modelFlowNode.properties[field.key].value = field.value;
                        }
                        if (field.key === "variable") {
                            selectedModel = field.value;
                        }
                    });

                    // Create a new model with given flow node
                    const codeEdits = await StateMachine.langClient()
                        .getSourceCode({
                            filePath: filePath,
                            flowNode: modelFlowNode
                        });
                    await updateSourceCode({ textEdits: codeEdits.textEdits });
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    selectedModel = params.modelFields.at(0).value;
                }


                // Get the agent flow node
                const agentFlowNode = (await StateMachine.langClient().getNodeTemplate({ filePath, id: fixedAgentCodeData, position: { line: 0, offset: 0 }, isLibrary: await isLibraryProject(StateMachine.context().projectPath ?? '') })).flowNode;

                // Go through the agentFields and assign each value to the flow node
                params.agentFields.forEach(field => {
                    const excludedKeys = ["type", "checkError"];
                    if (!excludedKeys.includes(field.key)) {
                        agentFlowNode.properties[field.key].value = field.value;
                    }
                });

                // set agent model name and tools
                agentFlowNode.properties["model"].value = selectedModel;
                agentFlowNode.properties["tools"].value = params.toolsFields.at(0).value;

                // Create a new model with given flow node
                const codeEdits = await StateMachine.langClient()
                    .getSourceCode({
                        filePath: filePath,
                        flowNode: agentFlowNode
                    });
                await updateSourceCode({ textEdits: codeEdits.textEdits });
                await new Promise(resolve => setTimeout(resolve, 2000));
                resolve({ response: true, filePath, position: undefined });
            } catch (error) {
                console.log(error);
            }
        });
    }

    async updateAIAgentTools(params: AIAgentToolsUpdateRequest): Promise<AIAgentResponse> {
        return new Promise(async (resolve) => {
            const context = StateMachine.context();
            try {
                const projectPath = context.projectPath;
                const filePath = await this.ensureAgentsFile(projectPath);
                // Create the tools if there are any
                if (params.newTools.length > 0) {
                    for (const tool of params.newTools) {
                        await this.createAgentTool(tool);
                    }
                }
                // Get the agent flow node
                const agentFlowNode = params.agentFlowNode;
                // set agent tools
                agentFlowNode.properties["tools"].value = params.toolsFields.at(0).value;

                // Update the agent node with given flow node
                const codeEdits = await StateMachine.langClient()
                    .getSourceCode({
                        filePath: filePath,
                        flowNode: agentFlowNode
                    });
                await updateSourceCode({ textEdits: codeEdits.textEdits });
                await new Promise(resolve => setTimeout(resolve, 2000));
                resolve({ response: true, filePath, position: undefined });
            } catch (error) {
                console.log(error);
            }
        });
    }

    // Update the flow node properties with the given key. This is for LS code generation
    private updateFlowNodeProperties(flowNode: FlowNode, excludedKeys: string[] = ["variable", "type", "checkError", "targetType"]) {
        for (const key in flowNode.properties) {
            if (!excludedKeys.includes(key)) {
                flowNode.properties[key].value = key;
            }
        }
    }

    async createTool(tool: AgentTool): Promise<void> {
        try {
            const projectPath = StateMachine.context().projectPath;
            const toolName = tool.toolName;
            const connectionName = tool.connectionName;
            const toolsPath = await this.ensureAgentsFile(projectPath);
            let flowNode: FlowNode; // REMOTE_ACTION_CALL| FUNCTION_DEFINITION

            if (tool.toolType === "Connector") {
                const filePath = Utils.joinPath(URI.file(projectPath), "connections.bal").fsPath;
                const connectorFlowNode = tool.connectorFlowNode;
                const connectorActionCodeData = tool.connectorActionCodeData;

                if (tool.connectorState === 1) { // 1 = Create the connection first
                    // Create a new connection with given flow node
                    const codeEdits = await StateMachine.langClient()
                        .getSourceCode({
                            filePath: filePath,
                            flowNode: connectorFlowNode,
                            isConnector: true
                        });
                    await updateSourceCode({ textEdits: codeEdits.textEdits });
                }
                // Get the flowNode for connector action
                const connectorActionFlowNode = await StateMachine.langClient()
                    .getNodeTemplate({
                        position: { line: 0, offset: 0 },
                        filePath: filePath,
                        id: connectorActionCodeData,
                        isLibrary: await isLibraryProject(StateMachine.context().projectPath ?? ''),
                    });
                flowNode = connectorActionFlowNode.flowNode;
                this.updateFlowNodeProperties(flowNode);
            }
            if (tool.toolType === "Function") {
                const filePath = Utils.joinPath(URI.file(projectPath), "functions.bal").fsPath;

                if (tool.functionState === 1) { // 1 = Create the function first
                    // Get new function flow node 
                    const newFunctionFlowNode = await StateMachine.langClient().getNodeTemplate({
                        position: { line: 0, offset: 0 },
                        filePath: filePath,
                        id: { node: 'FUNCTION_DEFINITION' },
                        isLibrary: await isLibraryProject(StateMachine.context().projectPath),
                    });

                    flowNode = newFunctionFlowNode.flowNode;
                    // Update the flow node with function name
                    flowNode.properties["functionName"].value = tool.functionName;

                    // Create a new function with update flow node
                    const codeEdits = await StateMachine.langClient()
                        .getSourceCode({
                            filePath: filePath,
                            flowNode: flowNode
                        });
                    await updateSourceCode({ textEdits: codeEdits.textEdits });
                } else {
                    // Get the flowNode for existing function action
                    const existingFunctionFlowNode = await StateMachine.langClient()
                        .getFunctionNode({
                            functionName: tool.functionName,
                            fileName: "functions.bal",
                            projectPath
                        });
                    flowNode = existingFunctionFlowNode.functionDefinition as FlowNode;
                }
            }

            const codeEdits = await StateMachine.langClient().getSourceCode({
                filePath: toolsPath,
                flowNode: buildAgentToolNode(flowNode, toolName, "", connectionName),
            });
            await updateSourceCode({ textEdits: codeEdits.textEdits });
        } catch (error) {
            console.error(`Failed to create tool: ${error}`);
        }
    }

    async createAgentTool(tool: AgentToolRequest): Promise<void> {
        try {
            const projectPath = StateMachine.context().projectPath;
            const toolName = tool.toolName;
            const toolsPath = await this.ensureAgentsFile(projectPath);
            let flowNode: FlowNode; // REMOTE_ACTION_CALL| FUNCTION_DEFINITION
            const selectedCodeData = tool.selectedCodeData;

            if (selectedCodeData.node === "REMOTE_ACTION_CALL") {
                const filePath = Utils.joinPath(URI.file(projectPath), "connections.bal").fsPath;
                // Get the flowNode for connector action
                const connectorActionFlowNode = await StateMachine.langClient()
                    .getNodeTemplate({
                        position: { line: 0, offset: 0 },
                        filePath: filePath,
                        id: selectedCodeData,
                        isLibrary: await isLibraryProject(StateMachine.context().projectPath ?? ''),
                    });
                flowNode = connectorActionFlowNode.flowNode;
                this.updateFlowNodeProperties(flowNode);
            }
            if (selectedCodeData.node === "FUNCTION_CALL") {
                const filePath = Utils.joinPath(URI.file(projectPath), "functions.bal").fsPath;
                // Get the flowNode for existing function action
                const existingFunctionFlowNode = await StateMachine.langClient()
                    .getNodeTemplate({
                        position: { line: 0, offset: 0 },
                        filePath: filePath,
                        id: selectedCodeData,
                        isLibrary: await isLibraryProject(StateMachine.context().projectPath ?? ''),
                    });
                flowNode = existingFunctionFlowNode.flowNode;
            }

            const codeEdits = await StateMachine.langClient().getSourceCode({
                filePath: toolsPath,
                flowNode: buildAgentToolNode(flowNode, toolName, tool.description,
                    tool.selectedCodeData.parentSymbol || ""),
            });
            await updateSourceCode({ textEdits: codeEdits.textEdits });
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error(`Failed to create tool: ${error}`);
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

        // 2. Update the agent's tools array to include the variable name (following updateAIAgentTools pattern)
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
