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

import path from "path";
import {
    ComponentInfo,
    FlowNode,
    ProjectStructureArtifactResponse
} from "@wso2/ballerina-core";
import { BiDiagramRpcManager } from "../rpc-managers/bi-diagram/rpc-manager";
import { StateMachine } from "../stateMachine";

const findAgentCallNodes = (nodes: FlowNode[]): FlowNode[] => {
    const result: FlowNode[] = [];
    for (const node of nodes) {
        if (node.codedata?.node === "AGENT_CALL") {
            result.push(node);
        }
        if (node.branches) {
            for (const branch of node.branches) {
                if (branch.children) {
                    result.push(...findAgentCallNodes(branch.children));
                }
            }
        }
    }
    return result;
};

const removeAgentNodesForServiceArtifact = async (
    component: ProjectStructureArtifactResponse,
    rpcClient: BiDiagramRpcManager
) => {
    if (!component.position || !component.path) { return; }
    try {
        const response = await rpcClient.getFlowModel({
            filePath: component.path,
            startLine: { line: component.position.startLine, offset: component.position.startColumn },
            endLine: { line: component.position.endLine, offset: component.position.endColumn },
        });
        if (response.flowModel?.nodes) {
            const agentCallNodes = findAgentCallNodes(response.flowModel.nodes);
            for (const agentCallNode of agentCallNodes) {
                const agentName = agentCallNode.properties?.connection?.value;
                if (typeof agentName !== "string") { continue; }

                const lineRange = agentCallNode.codedata?.lineRange;
                if (!lineRange?.fileName || !lineRange.startLine) { continue; }

                const searchResult = await rpcClient.searchNodes({
                    filePath: component.path,
                    position: lineRange.startLine,
                    query: { kind: "AGENT", exactMatch: agentName },
                });

                if (searchResult?.output?.length > 0) {
                    for (const agentNode of searchResult.output) {
                        const agentFileName = agentNode.codedata?.lineRange?.fileName;
                        const agentFilePath = agentFileName
                            ? path.join(StateMachine.context().projectPath, agentFileName)
                            : component.path;
                        await rpcClient.deleteFlowNode({
                            filePath: agentFilePath,
                            flowNode: agentNode,
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error(">>> Error removing agent nodes for AI service", component.name, error);
    }
};

export const handleAIAgentServiceDeletion = async (
    component: ProjectStructureArtifactResponse,
    rpcClient: BiDiagramRpcManager,
    filePath: string,
    deleteComponent: (component: ComponentInfo, rpcClient: BiDiagramRpcManager, filePath: string) => Promise<void>
) => {
    const designModel = await rpcClient.getDesignModel({});
    const service = designModel?.designModel?.services?.find((s) => {
        if (s.type !== "ai:Service" || !component.position) { return false; }
        return s.location.startLine.line <= component.position.startLine &&
            s.location.endLine.line >= component.position.endLine;
    });

    if (!service) {
        console.error(">>> Could not find service in design model for AI Agent Service", component.name);
        return;
    }

    // Remove agent definitions first
    // Skip for test chat services (_agent_chat.bal) — they wrap existing agents that shouldn't be deleted
    const isTestChatService = component.path?.endsWith('_agent_chat.bal');
    if (!isTestChatService) {
        await removeAgentNodesForServiceArtifact(component, rpcClient);
    }

    // Delete the service using the correct service-level position
    const componentInfo: ComponentInfo = {
        name: component.name,
        filePath: service.location.filePath,
        startLine: service.location.startLine.line,
        startColumn: service.location.startLine.offset,
        endLine: service.location.endLine.line,
        endColumn: service.location.endLine.offset,
    };
    await deleteComponent(componentInfo, rpcClient, filePath);
};
