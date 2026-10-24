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

import { FlowNode, Property, ProjectStructureArtifactResponse, ToolData } from "@wso2/ballerina-core";
import { NodePosition } from "@wso2/syntax-tree";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { URI, Utils } from "vscode-uri";
import { AIAgentSidePanel, ExtendedAgentToolRequest } from "./AIAgentSidePanel";
import { addToolToCurrentAgent, addToolToReadAgent, buildAgentToolNode, resolveAgentNodePosition, withCurrentAgentTools } from "./utils";
import { FUNCTION_CALL } from "../../../constants";
import { AgentToolForm } from "./AgentToolForm";

export enum NewToolSelectionMode {
    CONNECTION = "connection",
    FUNCTION = "function",
    ALL = "all",
    CUSTOM_TOOL = "custom_tool",
    KNOWLEDGE_BASE = "knowledge_base",
}

interface NewToolProps {
    agentNode: FlowNode;
    projectPath: string;
    mode?: NewToolSelectionMode;
    onBack?: () => void;
    // Takes over a submitted tool: shows it on the agent at once and runs `save` in the background.
    onAddTool: (tool: ToolData, save: () => Promise<NodePosition | undefined>) => void;
    onSetBackOverride?: (handler: (() => void) | null) => void;
}

export function NewTool(props: NewToolProps): JSX.Element {
    const { agentNode: agentNodeProp, projectPath, mode = NewToolSelectionMode.ALL, onAddTool, onBack, onSetBackOverride } = props;
    const { rpcClient } = useRpcContext();

    const agentNode = agentNodeProp ?? null;

    const agentFilePath = Utils.joinPath(URI.file(projectPath), "agents.bal").fsPath;

    // A custom tool: the form hands over writing its function, and both edits run in the background queue.
    const handleCustomToolInBackground = (toolName: string, write: () => Promise<ProjectStructureArtifactResponse[]>) => {
        if (!agentNode) {
            console.error("Agent node not found");
            return;
        }
        onAddTool({ name: toolName }, async () => {
            const artifacts = await write();
            const updatedAgentNode = await addToolToCurrentAgent(agentNode, toolName, rpcClient, artifacts);
            if (!updatedAgentNode) {
                throw new Error("The tool was created but could not be attached to the agent.");
            }
            await rpcClient.getAIAgentRpcClient().fixMissingImports();
            return await resolveAgentNodePosition(updatedAgentNode, rpcClient);
        });
    };

    const handleOnSubmit = async (data: ExtendedAgentToolRequest) => {
        if (!agentNode) {
            console.error("Agent node not found");
            return;
        }
        if (!data.toolName) {
            console.error("Tool name is required");
            return;
        }

        // Resolve the flow node and connection based on the tool source type
        let flowNode: FlowNode;
        let connection: string;

        if (data.selectedCodeData.node === FUNCTION_CALL) {
            if (!data.functionNode) {
                console.error("Function definition not found");
                return;
            }
            flowNode = data.functionNode as FlowNode;
            connection = "";
        } else {
            if (!data.flowNode) {
                console.error("Node template not found");
                return;
            }
            flowNode = data.flowNode;
            connection = data.connectionName || data.selectedCodeData.parentSymbol || "";
        }

        // Merge parameter type imports onto a flowNode property so genTool includes them
        if (data.parameterImports && flowNode.properties) {
            const props = flowNode.properties as Record<string, Property>;
            const targetKey = props["type"] ? "type" : Object.keys(props)[0];
            if (targetKey && props[targetKey]) {
                // Strip version suffix to match the format the backend expects (e.g. "ballerina/time" not "ballerina/time:2.8.0")
                const cleanedImports: Record<string, string> = {};
                for (const [prefix, moduleId] of Object.entries(data.parameterImports)) {
                    cleanedImports[prefix] = moduleId.replace(/:[^/]+$/, "");
                }
                props[targetKey].imports = { ...props[targetKey].imports, ...cleanedImports };
            }
        }

        // Runs in the tool-edit queue, after any edits the user made before this one.
        const save = async (): Promise<NodePosition | undefined> => {
            // The tool function goes right above the agent, which earlier queued edits may have moved.
            const { node: currentAgent } = await withCurrentAgentTools(agentNode, rpcClient);
            if (flowNode.codedata) {
                flowNode.codedata.isNew = true;
                flowNode.codedata.lineRange = {
                    ...currentAgent.codedata.lineRange,
                    endLine: currentAgent.codedata.lineRange.startLine,
                };
            }
            const toolResponse = await rpcClient.getBIDiagramRpcClient().getSourceCode({
                filePath: agentFilePath,
                flowNode: buildAgentToolNode(flowNode, data.toolName, data.description, connection, data.toolParameters,
                    undefined, data.includeContext),
            });
            if (!toolResponse || toolResponse.error) {
                throw new Error(toolResponse?.error || "The tool could not be generated.");
            }
            const updatedAgentNode = await addToolToReadAgent(currentAgent, data.toolName, rpcClient, toolResponse.artifacts);
            if (!updatedAgentNode) {
                throw new Error("The tool was created but could not be attached to the agent.");
            }
            // Safety net: fix any missing imports after all edits are applied
            await rpcClient.getAIAgentRpcClient().fixMissingImports();
            return await resolveAgentNodePosition(updatedAgentNode, rpcClient);
        };
        const icon = (flowNode.metadata as { icon?: string } | undefined)?.icon;
        onAddTool({ name: data.toolName, description: data.description, path: icon }, save);
    };

    return mode === NewToolSelectionMode.CUSTOM_TOOL ? (
        <AgentToolForm
            filePath={agentFilePath}
            projectPath={projectPath}
            onCreateInBackground={handleCustomToolInBackground}
            onBack={onBack}
        />
    ) : (
        <AIAgentSidePanel
            agentNode={agentNode}
            projectPath={projectPath}
            onSubmit={handleOnSubmit}
            mode={mode}
            onViewChange={(_view, navigateBack) => {
                onSetBackOverride?.(navigateBack || null);
            }}
            onCancel={onBack}
        />
    );
}
