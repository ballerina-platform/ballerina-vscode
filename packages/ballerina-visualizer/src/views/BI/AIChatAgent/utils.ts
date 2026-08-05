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

import { AvailableNode, CodeData, ConfigVariable, EVENT_TYPE, FlowNode, LinePosition, LineRange, NodeKind, NodePosition, ProjectStructureArtifactResponse, Property, SearchNodesQueryParams } from "@wso2/ballerina-core";
import { BallerinaRpcClient } from "@wso2/ballerina-rpc-client";
import { cloneDeep } from "lodash";
import { URI, Utils } from "vscode-uri";
import { BALLERINA, GET_DEFAULT_MODEL_PROVIDER } from "../../../constants";

// Shared variable name for the default WSO2 model provider, reused across agents.
export const AI_WSO2_MODEL_PROVIDER = "wso2ModelProvider";
const KNOWN_AGENT_NAME_SUFFIXES = ["agent", "model"];

const WSO2_MODEL_PROVIDER_CODEDATA: CodeData = {
    node: "MODEL_PROVIDER",
    org: "ballerina",
    module: "ai",
    packageName: "ai",
    symbol: "getDefaultModelProvider",
};

const OPENAI_PROVIDER_CODEDATA: CodeData = {
    node: "CLASS_INIT",
    org: "ballerinax",
    module: "ai",
    packageName: "ai",
    object: "OpenAiProvider",
    symbol: "init",
};

/**
 * Refreshes a flow node's line range in place from the matching artifact in a getSourceCode/deleteFlowNode response.
 * A preceding edit/delete can shift file lines; re-writing the node on its now-stale range would duplicate it instead
 * of replacing it. Call this with the response artifacts before the follow-up getSourceCode. No-op if not found.
 */
export function refreshNodeLineRangeFromArtifacts(
    node: FlowNode,
    artifacts: ProjectStructureArtifactResponse[] | undefined,
    name: string
): void {
    const artifact = artifacts?.find((a) => a.name === name);
    if (!artifact?.position) {
        return;
    }
    node.codedata.lineRange.startLine.line = artifact.position.startLine;
    node.codedata.lineRange.startLine.offset = artifact.position.startColumn;
    node.codedata.lineRange.endLine.line = artifact.position.endLine;
    node.codedata.lineRange.endLine.offset = artifact.position.endColumn;
}

export function toCamelCase(name: string): string {
    const words = name.trim().split(/[\s_]+/).filter(Boolean);
    if (words.length === 0) return "";
    const firstWord = words[0];
    // Lowercase leading acronyms: "HR" -> "hr", "HTMLParser" -> "htmlParser"
    const leadingUpper = firstWord.match(/^[A-Z]+/);
    let lowerFirst: string;
    if (leadingUpper && leadingUpper[0].length === firstWord.length) {
        lowerFirst = firstWord.toLowerCase();
    } else if (leadingUpper && leadingUpper[0].length > 1) {
        lowerFirst = leadingUpper[0].slice(0, -1).toLowerCase() + firstWord.slice(leadingUpper[0].length - 1);
    } else {
        lowerFirst = firstWord.charAt(0).toLowerCase() + firstWord.slice(1);
    }
    return lowerFirst + words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
}

export function toBaseName(name: string): string {
    const camel = toCamelCase(name);
    // Strip known suffixes to avoid e.g. "salesAgentAgent"
    const lower = camel.toLowerCase();
    for (const suffix of KNOWN_AGENT_NAME_SUFFIXES) {
        if (lower.endsWith(suffix) && lower.length > suffix.length) {
            return camel.slice(0, -suffix.length);
        }
    }
    return camel;
}

export interface CreatedBuiltInAgent {
    agentVarName: string;
    modelVarName: string;
    baseName: string;
    // True when the shared WSO2 default model provider was used. The caller is responsible for
    // invoking configureDefaultModelProvider() at the point that fits its flow.
    usedDefaultModelProvider: boolean;
}

/**
 * Ensures a model provider exists for an agent, reusing the shared `wso2ModelProvider` when the AI
 * module org is `ballerina`. Creates the provider source if it does not already exist. Returns the
 * model variable name to reference and whether the shared WSO2 default provider was used.
 */
export const ensureModelProvider = async (
    rpcClient: BallerinaRpcClient,
    projectPath: string,
    baseName: string
): Promise<{ modelVarName: string; usedDefaultModelProvider: boolean }> => {
    const aiModuleOrg = await getAiModuleOrg(rpcClient);
    const modelProviderCodedata = aiModuleOrg === BALLERINA ? WSO2_MODEL_PROVIDER_CODEDATA : OPENAI_PROVIDER_CODEDATA;
    let modelVarName: string;

    if (aiModuleOrg === BALLERINA) {
        // Reuse the shared WSO2 model provider if it already exists.
        modelVarName = AI_WSO2_MODEL_PROVIDER;
        const existingModelProviders = await rpcClient.getBIDiagramRpcClient().searchNodes({
            filePath: projectPath,
            queryMap: { kind: "MODEL_PROVIDER" as NodeKind },
        });
        const existingProvider = existingModelProviders?.output?.find(
            (node) => String(node.properties?.variable?.value) === AI_WSO2_MODEL_PROVIDER
        );
        if (!existingProvider) {
            const modelNodeTemplate = await getNodeTemplate(rpcClient, modelProviderCodedata, projectPath);
            modelNodeTemplate.properties.variable.value = modelVarName;
            await rpcClient.getBIDiagramRpcClient().getSourceCode({ filePath: projectPath, flowNode: modelNodeTemplate });
        }
    } else {
        modelVarName = `${baseName}Model`;
        const modelNodeTemplate = await getNodeTemplate(rpcClient, modelProviderCodedata, projectPath);
        modelNodeTemplate.properties.variable.value = modelVarName;
        await rpcClient.getBIDiagramRpcClient().getSourceCode({ filePath: projectPath, flowNode: modelNodeTemplate });
    }

    return { modelVarName, usedDefaultModelProvider: modelProviderCodedata.symbol === GET_DEFAULT_MODEL_PROVIDER };
};

/**
 * Fetches the AGENT node template for the project's AI module. The template exposes the friendly
 * `role`/`instructions` fields (the raw `systemPrompt` record is hidden and reconstructed by the LS).
 */
export const fetchAgentNodeTemplate = async (
    rpcClient: BallerinaRpcClient,
    projectPath: string
): Promise<FlowNode> => {
    const aiModuleOrg = await getAiModuleOrg(rpcClient);
    const agentSearchResponse = await rpcClient.getBIDiagramRpcClient().search({
        filePath: projectPath,
        queryMap: { orgName: aiModuleOrg },
        searchKind: "AGENT",
    });
    const agentNode = agentSearchResponse?.categories?.[0]?.items?.[0] as AvailableNode | undefined;
    if (!agentNode) {
        throw new Error("No agent node found in search response");
    }
    return getNodeTemplate(rpcClient, agentNode.codedata, projectPath);
};

/**
 * Creates a built-in `ai:Agent` declaration plus its model provider (reusing the shared
 * `wso2ModelProvider` when the AI module org is `ballerina`). Does not create a listener or
 * service — callers that need a chat service wire that up separately.
 */
export const createBuiltInAgent = async (
    rpcClient: BallerinaRpcClient,
    projectPath: string,
    agentName: string
): Promise<CreatedBuiltInAgent> => {
    const baseName = toBaseName(agentName);
    const { modelVarName, usedDefaultModelProvider } = await ensureModelProvider(rpcClient, projectPath, baseName);

    const agentNodeTemplate = await fetchAgentNodeTemplate(rpcClient, projectPath);
    const agentVarName = `${baseName}Agent`;
    // The friendly role/instructions fields back the (hidden) systemPrompt record; PROMPT-typed values
    // are wrapped into string templates by the LS during source generation.
    agentNodeTemplate.properties.role.value = agentName;
    agentNodeTemplate.properties.instructions.value = "";
    agentNodeTemplate.properties.model.value = modelVarName;
    agentNodeTemplate.properties.tools.value = "[]";
    agentNodeTemplate.properties.variable.value = agentVarName;
    await rpcClient.getBIDiagramRpcClient().getSourceCode({ filePath: projectPath, flowNode: agentNodeTemplate });

    return { agentVarName, modelVarName, baseName, usedDefaultModelProvider };
};

export const AGENT_ID_AUTH_CONFIG_ID: CodeData = {
    node: "AGENT_ID_AUTH_CONFIG" as any,
    org: "ballerina",
    module: "ai",
    packageName: "ai",
    symbol: "AgentIdAuthConfig",
};

export const fetchOAuthConfigProperties = async (
    rpcClient: BallerinaRpcClient,
    filePath: string,
    position: LinePosition = { line: 0, offset: 0 }
): Promise<{ key: string; property: Property }[]> => {
    try {
        const response = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
            position,
            filePath,
            id: AGENT_ID_AUTH_CONFIG_ID,
        });
        if (!response?.flowNode?.properties) return [];
        return Object.entries(response.flowNode.properties).map(([key, property]) => ({
            key,
            property: { ...property, optional: true, advanced: true } as Property,
        }));
    } catch (error) {
        console.error("Error fetching OAuth config properties:", error);
        return [];
    }
};

export const getNodeTemplate = async (
    rpcClient: BallerinaRpcClient,
    codeData: CodeData,
    filePath: string,
    position: LinePosition = { line: 0, offset: 0 }
) => {
    const response = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
        position: position,
        filePath: filePath,
        id: codeData,
    });
    console.log(">>> get node template response", response);
    return response?.flowNode;
};

export const checkAiPackageVersionSupport = async (
    rpcClient: BallerinaRpcClient,
    projectPath: string,
    minVersion: string = "1.11.0"
): Promise<boolean> => {
    try {
        const response = await rpcClient.getAIAgentRpcClient().getPackageVersion({
            projectPath,
            org: "ballerina",
            packageName: "ai",
        });
        if (!response?.version) return false;
        const parts = response.version.split(".").map(Number);
        const minParts = minVersion.split(".").map(Number);
        for (let i = 0; i < Math.max(parts.length, minParts.length); i++) {
            if ((parts[i] || 0) > (minParts[i] || 0)) return true;
            if ((parts[i] || 0) < (minParts[i] || 0)) return false;
        }
        return true;
    } catch {
        return false;
    }
};

export const getAiModuleOrg = async (rpcClient: BallerinaRpcClient, nodeKind?: NodeKind) => {
    if (nodeKind && (nodeKind === "NP_FUNCTION" || nodeKind === "NP_FUNCTION_DEFINITION")) return BALLERINA;
    const visualizerContext = await rpcClient.getVisualizerLocation();
    const aiModuleOrgResponse = await rpcClient
        .getAIAgentRpcClient()
        .getAiModuleOrg({ projectPath: visualizerContext.projectPath });
    console.log(">>> agent org", aiModuleOrgResponse.orgName);
    return aiModuleOrgResponse.orgName;
}

export const getNPFilePath = async (rpcClient: BallerinaRpcClient) => {
    const visualizerContext = await rpcClient.getVisualizerLocation();
    // Create the NP file path
    const agentFilePath = Utils.joinPath(URI.file(visualizerContext.projectPath), "functions.bal").fsPath;
    return agentFilePath;
};

export const getMainFilePath = async (rpcClient: BallerinaRpcClient) => {
    // Get the main file path and update the node
    const visualizerContext = await rpcClient.getVisualizerLocation();
    // Create the main file path
    const mainFilePath = Utils.joinPath(URI.file(visualizerContext.projectPath), "main.bal").fsPath;
    return mainFilePath;
};

export const findFlowNodeByModuleVarName = async (variableName: string, rpcClient: BallerinaRpcClient) => {
    try {
        const sanitizedVarName = variableName.trim().replace(/\n/g, "");

        // Get connections either from parameter or by fetching module nodes
        const nodeList = (await rpcClient.getBIDiagramRpcClient().getModuleNodes()).flowModel;

        // Find the node with matching variable name
        let flowNode = nodeList?.connections.find((node) => {
            const value = node.properties?.variable?.value;
            return typeof value === "string" && value === sanitizedVarName;
        });

        // If not found in connections, search in variables
        if (!flowNode) {
            flowNode = nodeList?.variables.find((node) => {
                const value = node.properties?.variable?.value;
                return typeof value === "string" && value === sanitizedVarName;
            });
        }
        if (!flowNode) {
            console.error(`Flow node with variable name '${variableName}' not found`);
            return null;
        }

        return flowNode;
    } catch (error) {
        console.error("Error finding flow node by variable name:", error);
        return null;
    }
};

export const findFlowNode = async (
    rpcClient: BallerinaRpcClient,
    filePath: string,
    position?: LinePosition,
    queryMap?: SearchNodesQueryParams
) => {
    try {
        const searchResult = await rpcClient.getBIDiagramRpcClient().searchNodes({
            filePath,
            position,
            queryMap
        });

        if (!searchResult?.output?.length) {
            console.error("Flow node not found");
            return null;
        }

        return searchResult.output;
    } catch (error) {
        console.error("Error finding flow node:", error);
        return null;
    }
};

export const findAgentNodeFromAgentCallNode = async (agentCallNode: FlowNode, rpcClient: BallerinaRpcClient) => {
    if (!agentCallNode || agentCallNode.codedata?.node !== "AGENT_CALL") {
        return null;
    }

    // Extract and validate agent name from connection property
    let agentName = agentCallNode.properties?.connection?.value;
    if (typeof agentName !== "string") {
        console.error("Agent connection value is not a string");
        return null;
    }

    // Resolve file path from agent call node location
    const fileName = agentCallNode.codedata?.lineRange?.fileName;
    if (!fileName) {
        console.error("File name not found in agent call node");
        return null;
    }

    const filePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] })).filePath;

    // Extract line position for search context
    const startLine = agentCallNode.codedata?.lineRange?.startLine;
    const linePosition: LinePosition | undefined = startLine
        ? {
            line: startLine.line,
            offset: startLine.offset
        }
        : undefined;

    // Search for the agent node by name
    const queryMap: SearchNodesQueryParams = {
        kind: "AGENT",
        exactMatch: agentName
    };

    const nodes = await findFlowNode(rpcClient, filePath, linePosition, queryMap);
    console.log(">>> agent nodes found", { nodes });
    if (nodes && nodes.length > 0) {
        return nodes[0];
    }

    return;
};

// Opens the focus diagram of the agent variable an AGENT_RUN node calls.
export const resolveAgentLocation = async (
    agentRunNode: FlowNode,
    rpcClient: BallerinaRpcClient
): Promise<{ filePath: string; position: NodePosition; agentName: string } | null> => {
    const agentName = agentRunNode.properties?.connection?.value;
    const callSiteFile = agentRunNode.codedata?.lineRange?.fileName;
    if (typeof agentName !== "string" || !callSiteFile) return null;
    const visualizerRpc = rpcClient.getVisualizerRpcClient();
    const { filePath: callSitePath } = await visualizerRpc.joinProjectPath({ segments: [callSiteFile] });
    const nodes = await findFlowNode(rpcClient, callSitePath, agentRunNode.codedata?.lineRange?.startLine, {
        kind: "AGENT_TYPE",
        exactMatch: agentName,
    });
    const declRange = nodes?.[0]?.codedata?.lineRange;
    if (!declRange) return null;
    const { filePath: declPath } = await visualizerRpc.joinProjectPath({ segments: [declRange.fileName] });
    return {
        filePath: declPath,
        agentName,
        position: {
            startLine: declRange.startLine.line,
            startColumn: declRange.startLine.offset,
            endLine: declRange.endLine.line,
            endColumn: declRange.endLine.offset,
        },
    };
};

export const goToAgentFromRunNode = async (agentRunNode: FlowNode, rpcClient: BallerinaRpcClient) => {
    const agentName = agentRunNode.properties?.connection?.value;
    const callSiteFile = agentRunNode.codedata?.lineRange?.fileName;
    if (typeof agentName !== "string" || !callSiteFile) {
        return;
    }
    const visualizerRpc = rpcClient.getVisualizerRpcClient();
    const { filePath: callSitePath } = await visualizerRpc.joinProjectPath({ segments: [callSiteFile] });
    const nodes = await findFlowNode(rpcClient, callSitePath, agentRunNode.codedata?.lineRange?.startLine, {
        kind: "AGENT_TYPE",
        exactMatch: agentName,
    });
    const declRange = nodes?.[0]?.codedata?.lineRange;
    if (!declRange) {
        return;
    }
    const { filePath: declPath } = await visualizerRpc.joinProjectPath({ segments: [declRange.fileName] });
    await visualizerRpc.openView({
        type: EVENT_TYPE.OPEN_VIEW,
        location: {
            documentUri: declPath,
            position: {
                startLine: declRange.startLine.line,
                startColumn: declRange.startLine.offset,
                endLine: declRange.endLine.line,
                endColumn: declRange.endLine.offset,
            },
        },
    });
};

export const removeToolFromAgentNode = async (agentNode: FlowNode, toolName: string) => {
    if (!agentNode || agentNode.codedata?.node !== "AGENT") return null;
    // clone the node to avoid modifying the original
    const updatedAgentNode = cloneDeep(agentNode);
    let toolsValue = updatedAgentNode.properties.tools.value;
    // remove new lines from the tools value
    if (typeof toolsValue === "string") {
        toolsValue = toolsValue.replace(/\n/g, "");
    }
    // Remove the tools from the tools array
    if (typeof toolsValue === "string") {
        const toolsArray = parseToolsString(toolsValue);
        if (toolsArray.length > 0) {
            // Remove the tool
            const existingTools = toolsArray.filter((t) => t !== toolName);
            // Update the tools value
            toolsValue = existingTools.length === 1 ? `[${existingTools[0]}]` : `[${existingTools.join(", ")}]`;
        } else {
            toolsValue = `[]`;
        }
    } else if (Array.isArray(toolsValue)) {
        toolsValue = (toolsValue as Property[]).filter((tool: any) => tool.value !== toolName);
    } else {
        console.error("Tools value is not a string or array", toolsValue);
        return agentNode;
    }
    // update the node
    updatedAgentNode.properties.tools.value = toolsValue;
    updatedAgentNode.codedata.isNew = false;
    return updatedAgentNode;
};

export const addToolToAgentNode = async (agentNode: FlowNode, toolName: string) => {
    if (!agentNode || agentNode.codedata?.node !== "AGENT") return null;
    // clone the node to avoid modifying the original
    const updatedAgentNode = cloneDeep(agentNode);
    let toolsValue = updatedAgentNode.properties.tools.value;
    if (toolsValue == undefined) {
        toolsValue = [];
    }
    if (typeof toolsValue === "string") {
        const toolsArray = parseToolsString(toolsValue);
        if (toolsArray.length > 0) {
            // Add the tool if not exists
            if (!toolsArray.includes(toolName)) {
                toolsArray.push(toolName);
            }
            // Update the tools value
            toolsValue = toolsArray.length === 1 ? `[${toolsArray[0]}]` : `[${toolsArray.join(", ")}]`;
        } else {
            toolsValue = `[${toolName}]`;
        }
    } else if (Array.isArray(toolsValue)) {
        // Check if the tool already exists in the array
        const toolExists = toolsValue.some((tool: any) => tool.value === toolName);
        if (!toolExists) {
            (toolsValue as Property[]).push({
                metadata: {
                    label: toolName,
                    description: "",
                },
                value: toolName,
                optional: false,
                editable: false
            });
        }
    } else {
        console.error("Tools value is not a string or array", toolsValue);
        return agentNode;
    }
    updatedAgentNode.properties.tools.value = toolsValue;
    updatedAgentNode.codedata.isNew = false;
    return updatedAgentNode;
};

export interface McpServerConfig {
    name: string;
    serviceUrl: string;
    configs: Record<string, string>;
    toolSelection: string;
    selectedTools: string[];
};

export const updateMcpServerToAgentNode = async (
    agentNode: FlowNode,
    toolConfig: McpServerConfig,
    originalToolName: string
) => {
    if (!agentNode || agentNode.codedata?.node !== "AGENT") return null;

    const updatedAgentNode = cloneDeep(agentNode);
    let toolsValue = updatedAgentNode.properties.tools.value;

    // Prepare the new tool string based on tool selection
    let newToolString;
    if (toolConfig.toolSelection.includes("Selected")) {
        const toolsString = toolConfig.selectedTools.map(tool => `"${tool}"`).join(", ");
        newToolString = `check new ai:McpToolKit("${toolConfig.serviceUrl}", permittedTools = [${toolsString}], info = {name: "${toolConfig.name}", version: ""})`;
    } else {
        newToolString = `check new ai:McpToolKit("${toolConfig.serviceUrl}", permittedTools = (), info = {name: "${toolConfig.name}", version: ""})`;
    }

    if (typeof toolsValue === "string") {
        // Fixed regex pattern that matches only the specific McpToolKit with the target name
        const pattern = new RegExp(
            `check new ai:McpToolKit\\([^}]*name:\\s*"${originalToolName}"[^}]*\\}\\)`,
            'g'
        );

        if (pattern.test(toolsValue)) {
            // Reset lastIndex before replace
            pattern.lastIndex = 0;
            toolsValue = toolsValue.replace(pattern, newToolString);
        } else {
            const trimmedValue = toolsValue.trim();
            const isWrappedInBrackets = trimmedValue.startsWith('[') && trimmedValue.endsWith(']');
            const innerContent = isWrappedInBrackets
                ? trimmedValue.slice(1, -1).trim()
                : trimmedValue;
            toolsValue = innerContent
                ? `[${innerContent}, ${newToolString}]`
                : `[${newToolString}]`;
        }
    } else if (Array.isArray(toolsValue)) {
        const pattern = new RegExp(`name:\\s*"${originalToolName}"`);
        const index = (toolsValue as Property[]).findIndex((tool: any) => pattern.test(tool.value));
        if (index !== -1) {
            (toolsValue as Property[])[index] = {
                ...(toolsValue as Property[])[index],
                value: newToolString,
            };
        } else {
            (toolsValue as Property[]).push({
                metadata: {
                    label: toolConfig.name,
                    description: "",
                },
                value: newToolString,
                optional: false,
                editable: false,
            });
        }
    } else {
        console.error("Tools value is not a string or array", toolsValue);
        return agentNode;
    }

    updatedAgentNode.properties.tools.value = toolsValue;
    updatedAgentNode.codedata.isNew = false;

    console.log(">>> Final updated tools value", toolsValue);
    return updatedAgentNode;
};

export const addMcpServerToAgentNode = async (agentNode: FlowNode, toolConfig: McpServerConfig) => {
    if (!agentNode || agentNode.codedata?.node !== "AGENT") return null;
    // clone the node to avoid modifying the original
    const updatedAgentNode = cloneDeep(agentNode);
    let toolsValue = updatedAgentNode.properties.tools.value;
    // remove new lines and normalize whitespace from the tools value

    console.log(">>> add tools", toolConfig);
    const toolsString = toolConfig.selectedTools.map(tool => `"${tool}"`).join(", ");
    let toolString = `check new ai:McpToolKit("${toolConfig.serviceUrl}", permittedTools = (), info = {name: "${toolConfig.name}", version: ""})`;
    if (toolConfig.toolSelection.includes("Selected")) {
        toolString = `check new ai:McpToolKit("${toolConfig.serviceUrl}", permittedTools = [${toolsString}], info = {name: "${toolConfig.name}", version: ""})`;
    }
    if (typeof toolsValue === "string") {
        const toolsArray = parseToolsString(toolsValue);
        if (toolsArray.length > 0) {
            // Add the tool if not exists
            if (!toolsArray.includes(toolString)) {
                toolsArray.push(toolString);
            }
            // Update the tools value
            toolsValue = toolsArray.length === 1 ? `[${toolsArray[0]}]` : `[${toolsArray.join(", ")}]`;
        } else {
            toolsValue = `[${toolString}]`;
        }
    } else if (Array.isArray(toolsValue)) {
        const toolExists = (toolsValue as Property[]).some((tool: any) => tool.value === toolString);
        if (!toolExists) {
            (toolsValue as Property[]).push({
                metadata: {
                    label: toolConfig.name,
                    description: "",
                },
                value: toolString,
                optional: false,
                editable: false,
            });
        }
    } else {
        console.error("Tools value is not a string or array", toolsValue);
        return agentNode;
    }
    // update the node
    updatedAgentNode.properties.tools.value = toolsValue;
    updatedAgentNode.codedata.isNew = false;
    return updatedAgentNode;
};

// remove agent node, model node when removing ag
export const removeAgentNode = async (agentCallNode: FlowNode, rpcClient: BallerinaRpcClient): Promise<boolean> => {
    if (!agentCallNode || agentCallNode.codedata?.node !== "AGENT_CALL") return false;
    try {
        // get agent node
        const agentNode = await findAgentNodeFromAgentCallNode(agentCallNode, rpcClient);
        if (!agentNode) {
            console.error("Agent node not found", agentCallNode);
            return false;
        }

        // get file path
        const agentFileName = agentNode.codedata.lineRange.fileName;
        const agentFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [agentFileName] })).filePath;

        // delete the agent node
        await rpcClient.getBIDiagramRpcClient().deleteFlowNode({
            filePath: agentFilePath,
            flowNode: agentNode,
        });

        return true;
    } catch (error) {
        console.error("Failed to remove agent node", error);
        return false;
    }
};

export const updateFlowNodePropertyValuesWithKeys = (flowNode: FlowNode) => {
    const excludedKeys = ["variable", "type", "checkError", "targetType"];
    for (const key in flowNode.properties) {
        if (!excludedKeys.includes(key)) {
            (flowNode.properties as Record<string, { value: string }>)[key].value = key;
        }
    }
};

export const parseToolsString = (toolsStr: string, removeQuotes: boolean = false): string[] => {
    // Remove brackets and split by comma
    const trimmed = toolsStr.trim();
    if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
        return [];
    }
    const inner = trimmed.substring(1, trimmed.length - 1).trim();
    // Handle empty array case
    if (!inner) {
        return [];
    }
    // Split by comma and process each element
    return inner.split(",").map((tool) => {
        const trimmedTool = tool.trim();
        // Remove surrounding single or double quotes if requested
        if (
            removeQuotes &&
            ((trimmedTool.startsWith('"') && trimmedTool.endsWith('"')) ||
                (trimmedTool.startsWith("'") && trimmedTool.endsWith("'")))
        ) {
            return trimmedTool.substring(1, trimmedTool.length - 1);
        }
        return trimmedTool;
    });
};

/**
 * Extracts access token from auth value string.
 * Expected format: {token: "..."}
 */
export const extractAccessToken = (authValue: string): string | null => {
    if (authValue === null) return null;

    try {
        const tokenMatch = authValue.match(/token:\s*"([^"]*)"/);
        return tokenMatch?.[1] ?? null;
    } catch (error) {
        console.error("Failed to parse auth token:", error);
        return "";
    }
};

/**
 * Gets the end of file line range for a given file.
 * Returns a LineRange object pointing to the end of the file.
 */
export const getEndOfFileLineRange = async (
    fileName: string,
    rpcClient: BallerinaRpcClient
): Promise<LineRange> => {
    // Resolve the absolute path first so it's available even if the file doesn't exist yet (the end-of-file
    // lookup throws for a missing file, but callers still need the absolute path to create/write it).
    const filePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] })).filePath;
    try {
        // Get the end of file position using the BIDiagram RPC client
        const endPosition = await rpcClient.getBIDiagramRpcClient().getEndOfFile({
            filePath: filePath
        });

        // Return a LineRange object with both start and end at the file's end position
        return {
            fileName: filePath,
            startLine: endPosition,
            endLine: endPosition
        };
    } catch (error) {
        console.error(`Error getting end of file line range for ${fileName}:`, error);
        // File likely doesn't exist yet — return the absolute path at position 0,0 so it can be created.
        return {
            fileName: filePath,
            startLine: { line: 0, offset: 0 },
            endLine: { line: 0, offset: 0 }
        };
    }
};

/**
 * Checks if a value is a string literal (enclosed in double quotes).
 */
export const isStringLiteral = (value: string): boolean => {
    const trimmed = value.trim();
    return (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("string `") && trimmed.endsWith("`"));
};

/**
 * Removes enclosing double quotes from a string literal.
 */
export const removeQuotes = (value: string): string => {
    const trimmed = value.trim();
    if (isStringLiteral(trimmed)) {
        if (trimmed.startsWith("string `") && trimmed.endsWith("`")) {
            return trimmed.substring(8, trimmed.length - 1);
        }
        return trimmed.substring(1, trimmed.length - 1);
    }
    return trimmed;
};

/**
 * Finds a variable value in module variables.
 */
export const findValueInModuleVariables = async (
    variableName: string,
    rpcClient: BallerinaRpcClient,
    filePath: string
): Promise<string | null> => {
    const queryMap: SearchNodesQueryParams = {
        kind: "VARIABLE",
        exactMatch: variableName
    };

    const variables = await findFlowNode(rpcClient, filePath, undefined, queryMap);

    if (!variables || variables.length === 0) {
        return null;
    }

    const variable = variables[0];

    if (variable?.properties?.expression?.value && !variable?.codedata?.sourceCode?.includes("configurable")) {
        return variable.properties.expression.value as string;
    }

    return null;
};

type ConfigVariablesState = {
    [category: string]: {
        [module: string]: ConfigVariable[];
    };
};

/**
 * Finds a variable value in configurable variables using the API.
 */
export const findValueInConfigVariables = async (
    variableName: string,
    rpcClient: BallerinaRpcClient,
    projectPathUri: string
): Promise<string | null> => {
    try {
        const response = await rpcClient
            .getBIDiagramRpcClient()
            .getConfigVariablesV2({
                includeLibraries: false,
                projectPath: projectPathUri
            });

        if (!response?.configVariables) {
            return null;
        }

        const configVars = (response as any).configVariables as ConfigVariablesState;

        for (const category in configVars) {
            for (const module in configVars[category]) {
                const variable = configVars[category][module].find(
                    (v: ConfigVariable) => v.properties?.variable?.value === variableName
                );
                if (variable) {
                    // Return the value from configValue or defaultValue
                    const configValue = variable.properties?.configValue?.value as string | null;
                    if (configValue === "" || configValue === null) return null;
                    return configValue;
                }
            }
        }

        return null;
    } catch (error) {
        console.error(`Error fetching config variables for ${variableName}:`, error);
        return null;
    }
};

export const isUrl = (value: string): boolean => {
    const trimmed = value.trim();
    try {
        // Handle localhost without protocol
        if (trimmed.startsWith('localhost:')) {
            new URL('http://' + trimmed);
            return true;
        }
        new URL(trimmed);
        return true;
    } catch {
        return false;
    }
};

export const resolveVariableValue = async (
    value: string,
    rpcClient: BallerinaRpcClient,
    projectPathUri: string,
    filePath: string
): Promise<string | null> => {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();

    // String literal - remove quotes and check for interpolation
    if (isStringLiteral(trimmed)) {
        const content = removeQuotes(trimmed);
        const interpolationMatch = content.match(/^\s*\$\{([^}]+)\}\s*$/);
        if (interpolationMatch) {
            const variableName = interpolationMatch[1];
            return resolveVariableValue(variableName, rpcClient, projectPathUri, filePath);
        }
        return content;
    }

    // URL - return as-is to skip variable lookups
    if (isUrl(trimmed)) {
        return trimmed;
    }

    // Check module variables
    const moduleValue = await findValueInModuleVariables(trimmed, rpcClient, filePath);
    if (moduleValue) {
        return removeQuotes(moduleValue);
    }

    // Check config variables
    const configValue = await findValueInConfigVariables(trimmed, rpcClient, projectPathUri);
    if (configValue) {
        return removeQuotes(configValue);
    }

    return null;
};

/**
 * Extracts variable names from an auth config string and resolves them.
 * Expected format: {token: "value"} or {token: variableName}
 */
export const resolveAuthConfig = async (
    authValue: string,
    rpcClient: BallerinaRpcClient,
    projectPathUri: string,
    filePath: string
): Promise<string | null> => {
    if (!authValue) {
        return "";
    }

    let resolvedAuth = authValue;

    // Find all variable references in the auth config
    // Matches patterns like: token: variableName (without quotes)
    const variablePattern = /(\w+):\s*([^",}\s]+)/g;
    const matches = [...authValue.matchAll(variablePattern)];

    for (const match of matches) {
        const [fullMatch, key, variableOrValue] = match;

        // Skip if it's already a quoted string
        if (variableOrValue.startsWith('"') || variableOrValue.startsWith("'")) {
            continue;
        }

        // Resolve the variable
        const resolvedValue = await resolveVariableValue(
            variableOrValue,
            rpcClient,
            projectPathUri,
            filePath
        );

        // Return null if the variable cannot be resolved
        if (resolvedValue === null) {
            return null;
        }

        // Replace in the auth string with quoted value
        resolvedAuth = resolvedAuth.replace(
            fullMatch,
            `${key}: "${resolvedValue}"`
        );
    }

    return resolvedAuth;
};
