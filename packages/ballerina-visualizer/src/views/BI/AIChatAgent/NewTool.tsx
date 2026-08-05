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

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { EVENT_TYPE, FlowNode, Property } from "@wso2/ballerina-core";
import { NodePosition } from "@wso2/syntax-tree";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { AIAgentSidePanel, ExtendedAgentToolRequest } from "./AIAgentSidePanel";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { addToolToAgentNode, findFlowNodeByModuleVarName, updateFlowNodePropertyValuesWithKeys } from "./utils";
import { FUNCTION_CALL } from "../../../constants";

const LoaderContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

export enum NewToolSelectionMode {
    CONNECTION = "connection",
    FUNCTION = "function",
    ALL = "all",
    CUSTOM_TOOL = "custom_tool",
}

interface NewToolProps {
    agentNode: FlowNode;
    mode?: NewToolSelectionMode;
    onBack?: () => void;
    onSave?: () => void;
    onSetBackOverride?: (handler: (() => void) | null) => void;
}

export function NewTool(props: NewToolProps): JSX.Element {
    const { agentNode: agentNodeProp, mode = NewToolSelectionMode.ALL, onSave, onBack, onSetBackOverride } = props;
    const { rpcClient } = useRpcContext();

    // The agent declaration node is supplied directly by the focus diagram — no call-node lookup.
    const agentNode = agentNodeProp ?? null;
    const [savingForm, setSavingForm] = useState<boolean>(false);
    const [ready, setReady] = useState<boolean>(false);

    const agentFilePath = useRef<string>("");
    const projectPath = useRef<string>("");

    useEffect(() => {
        initPanel();
    }, [agentNodeProp]);

    const initPanel = async () => {
        const visualizerContext = await rpcClient.getVisualizerLocation();
        agentFilePath.current = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: ['agents.bal'] })).filePath;
        projectPath.current = visualizerContext.projectPath;
        setReady(true);
    };

    const handleAgentToolCreated = async (functionName: string) => {
        if (!agentNode) {
            console.error("Agent node not found");
            return;
        }
        try {
            const updatedAgentNode = await addToolToAgentNode(agentNode, functionName);
            if (!updatedAgentNode) {
                console.error("Failed to add tool to agent node");
                return;
            }

            const { filePath: agentFile } = await rpcClient.getVisualizerRpcClient().joinProjectPath({
                segments: [updatedAgentNode.codedata.lineRange.fileName],
            });
            await rpcClient.getBIDiagramRpcClient().getSourceCode({ filePath: agentFile, flowNode: updatedAgentNode });

            // Fetch the newly created function to get its source position
            const agentsFileName = "agents.bal";
            const { filePath: agentsFilePath } = await rpcClient.getVisualizerRpcClient().joinProjectPath({
                segments: [agentsFileName],
            });
            const functionNodeResponse = await rpcClient.getBIDiagramRpcClient().getFunctionNode({
                functionName,
                fileName: agentsFileName,
                projectPath: projectPath.current,
            });
            const linePosition = functionNodeResponse?.functionDefinition?.codedata?.lineRange?.startLine;
            const position: NodePosition = {
                startLine: linePosition?.line ?? 0,
                startColumn: linePosition?.offset ?? 0,
            };

            // Close the panel and navigate to the function's flow diagram
            onSave?.();
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: { documentUri: agentsFilePath, position },
            });
        } catch (error) {
            console.error("Error handling custom agent tool creation", { error });
        }
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
            connection = data.selectedCodeData.parentSymbol || "";
        }

        setSavingForm(true);

        try {
            if (flowNode.codedata) {
                flowNode.codedata.isNew = true;
                flowNode.codedata.lineRange = {
                    ...agentNode.codedata.lineRange,
                    endLine: agentNode.codedata.lineRange.startLine,
                };
            }

            // Merge parameter type imports onto a flowNode property so genTool includes them
            console.log(">>> parameter imports", { parameterImports: data.parameterImports, flowNode });
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

            const toolResponse = await rpcClient.getAIAgentRpcClient().genTool({
                toolName: data.toolName,
                description: data.description,
                filePath: agentFilePath.current,
                flowNode,
                connection,
                toolParameters: data.toolParameters,
            });

            if (!toolResponse) {
                console.error("Tool generation failed");
                return;
            }

            const updatedAgentNode = await addToolToAgentNode(agentNode, data.toolName);
            if (!updatedAgentNode) {
                console.error("Failed to add tool to agent node");
                return;
            }
            // Find the updated agent node in the response artifacts and update the local state
            let agentArtifactFound = false;
            if (toolResponse.artifacts?.length > 0) {
                const updatedAgentArtifact = toolResponse.artifacts.find(artifact => artifact?.name === agentNode?.properties?.variable?.value);
                // Update line range so subsequent tool additions target the correct source location
                if (updatedAgentArtifact?.position) {
                    updatedAgentNode.codedata.lineRange.startLine.line = updatedAgentArtifact.position.startLine;
                    updatedAgentNode.codedata.lineRange.startLine.offset = updatedAgentArtifact.position.startColumn;
                    updatedAgentNode.codedata.lineRange.endLine.line = updatedAgentArtifact.position.endLine;
                    updatedAgentNode.codedata.lineRange.endLine.offset = updatedAgentArtifact.position.endColumn;
                    agentArtifactFound = true;
                }
            }

            // If artifact not found, re-fetch the agent node by its variable name to get the correct line range
            if (!agentArtifactFound) {
                const agentVarName = agentNode?.properties?.variable?.value;
                if (typeof agentVarName === "string") {
                    const refreshedAgentNode = await findFlowNodeByModuleVarName(agentVarName, rpcClient);
                    if (refreshedAgentNode?.codedata?.lineRange) {
                        updatedAgentNode.codedata.lineRange = refreshedAgentNode.codedata.lineRange;
                    }
                }
            }

            const { filePath } = await rpcClient.getVisualizerRpcClient().joinProjectPath({
                segments: [updatedAgentNode.codedata.lineRange.fileName],
            });

            // Generate the source code
            await rpcClient.getBIDiagramRpcClient().getSourceCode({ filePath, flowNode: updatedAgentNode });

            // Safety net: fix any missing imports after all edits are applied
            await rpcClient.getAIAgentRpcClient().fixMissingImports();

            onSave?.();
        } catch (error) {
            console.error("Error saving tool", { error });
        } finally {
            setSavingForm(false);
        }
    };

    return (
        <>
            {ready && !savingForm && (
                <AIAgentSidePanel
                    agentNode={agentNode}
                    projectPath={projectPath.current}
                    onSubmit={handleOnSubmit}
                    mode={mode}
                    onViewChange={(_view, navigateBack) => {
                        onSetBackOverride?.(navigateBack || null);
                    }}
                    onAgentToolCreated={handleAgentToolCreated}
                    onCancel={onBack}
                />
            )}
            {(!ready || savingForm) && (
                <LoaderContainer>
                    <RelativeLoader />
                </LoaderContainer>
            )}
        </>
    );
}
