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

import styled from "@emotion/styled";
import { CodeData, FlowNode, NodeMetadata, NodePosition, ProjectStructureArtifactResponse } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Codicon, Dropdown } from "@wso2/ui-toolkit";
import { cloneDeep } from "lodash";
import { useEffect, useRef, useState } from "react";
import { RelativeLoader } from "../../../components/RelativeLoader";
import { FlowNodeForm } from "../Forms/FlowNodeForm";
import { getAiModuleOrg, getNodeTemplate, refreshNodeLineRangeFromArtifacts } from "./utils";
import { usePanelOverlay } from "../FlowDiagram/hooks/usePanelOverlay";
import { ConnectionSelectionList } from "../../../components/ConnectionSelector/ConnectionSelectionList";
import { ConnectionCreator } from "../../../components/ConnectionSelector/ConnectionCreator";
import { getNodeTemplateForConnection } from "../FlowDiagram/utils";

const ScrollWrapper = styled.div`
    height: 100%;
    overflow-y: auto;
`;

const Container = styled.div`
    padding: 24px 16px 0;
`;

const LoaderContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const Row = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
`;

const WarningMessage = styled.div`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px;
    margin-top: 12px;
    background-color: var(--vscode-inputValidation-warningBackground);
    border: 1px solid var(--vscode-inputValidation-warningBorder);
    border-radius: 4px;
    color: var(--vscode-inputValidation-warningForeground);
    font-size: 13px;
    line-height: 1.4;
`;

interface MemoryConfigProps {
    memoryNode: FlowNode;
    agentNode: FlowNode;
    // The agent property key that holds the memory value. The built-in ai:Agent uses "memory" (default); a custom
    // AGENT_TYPE agent passes its LS-detected wired init param key here.
    memoryPropertyKey?: string;
    // Receives the agent's post-save position so the caller can refetch the (shifted) node instead of relying on its
    // stale stored position.
    onSave?: (agentPosition?: NodePosition) => void;
}

export function MemoryManagerConfig(props: MemoryConfigProps): JSX.Element {
    const { agentNode, memoryNode: existingMemoryVariable, memoryPropertyKey = "memory", onSave } = props;

    const { rpcClient } = useRpcContext();
    const { openOverlay, closeTopOverlay, updateOverlay } = usePanelOverlay();

    const [availableMemory, setAvailableMemory] = useState<CodeData[]>([]);
    const [memoryNodeTemplate, setMemoryNodeTemplate] = useState<FlowNode>();
    const [memoryNode, setMemoryNode] = useState<FlowNode>();
    const [selectedMemoryType, setSelectedMemoryType] = useState<string>("");

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [formKey, setFormKey] = useState<number>(0);

    const agentFilePath = useRef<string>("");
    const aiModuleOrg = useRef<string>("");
    const agentNodeRef = useRef<FlowNode>();
    const targetLineRange = useRef<any>();
    const selectionOverlayIdRef = useRef<string | null>(null);
    const createOverlayIdRef = useRef<string | null>(null);

    useEffect(() => {
        initPanel();
    }, []);

    const initPanel = async () => {
        setIsLoading(true);

        try {
            // Fetch initial configuration data
            agentFilePath.current = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [agentNode?.codedata?.lineRange?.fileName] })).filePath;
            aiModuleOrg.current = await getAiModuleOrg(rpcClient);

            // Load available memory
            const memoryTypes = await fetchAvailableMemory();
            if (memoryTypes.length > 0) {
                await loadSelectedMemory(memoryTypes);
            }
        } catch (error) {
            console.error("Error initializing memory config panel", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAvailableMemory = async (): Promise<CodeData[]> => {
        try {
            const searchResponse = await rpcClient.getBIDiagramRpcClient().search({
                filePath: agentFilePath.current,
                queryMap: { orgName: aiModuleOrg.current },
                searchKind: "MEMORY"
            });

            if (!searchResponse?.categories?.[0]?.items) {
                console.error("No memory found in search response");
                return [];
            }

            const memoryTypes = searchResponse.categories[0].items.map((item: any) => item.codedata);
            setAvailableMemory(memoryTypes);
            return memoryTypes;
        } catch (error) {
            console.error("Error fetching memory", error);
            return [];
        }
    };

    const loadSelectedMemory = async (memoryTypes: CodeData[]): Promise<void> => {
        if (!agentNode) {
            console.error("Agent node reference not found");
            return;
        }

        // Get the memory type from agent metadata
        let currentMemoryType = (agentNode.metadata?.data as NodeMetadata)?.memory?.type as string;

        // Remove "ai:" prefix if present
        if (currentMemoryType?.startsWith("ai:")) {
            currentMemoryType = currentMemoryType.substring(3);
        }

        // Find the corresponding memory code data
        let memoryCodeData: CodeData;
        if (currentMemoryType) {
            memoryCodeData = memoryTypes.find(
                (memory) => memory.object === currentMemoryType
            );

            if (!memoryCodeData) {
                console.error("Current memory not found in available memory");
                memoryCodeData = memoryTypes[0];
            }
        } else {
            console.log("No memory associated with this agent, using first available");
            memoryCodeData = memoryTypes[0];
        }

        await loadMemoryTemplate(memoryCodeData);
    };

    const extractMemorySizeFromAgent = (): string | null => {
        if (!agentNode) {
            return null;
        }
        const memoryValue = (agentNode.properties as any)?.[memoryPropertyKey]?.value?.toString();
        if (memoryValue) {
            // Match patterns like "new ai:MessageWindowChatMemory(10)" or "MessageWindowChatMemory(10)"
            const sizeMatch = memoryValue.match(/\((\d+)\)/);
            if (sizeMatch && sizeMatch[1]) {
                return sizeMatch[1];
            }
        }
        return null;
    };

    const loadMemoryTemplate = async (memoryCodeData: CodeData): Promise<void> => {
        setIsLoading(true);
        try {
            // Fetch the node template for the selected memory
            const nodeTemplate = await getNodeTemplate(
                rpcClient,
                memoryCodeData,
                agentFilePath.current
            );

            if (!nodeTemplate) {
                console.error("Failed to get node template for memory");
                return;
            }

            // Extract size from agent's memory configuration if available
            const memorySizeFromAgent = extractMemorySizeFromAgent();
            if (memorySizeFromAgent !== null && nodeTemplate.properties?.['size']) {
                nodeTemplate.properties['size'].value = memorySizeFromAgent;
            }

            if (existingMemoryVariable) {
                // Existing memory variable found - use its line range for editing/replacing
                const existingType = existingMemoryVariable.properties.type.value.toString();
                const isSameType = existingType.includes(memoryCodeData.object);

                targetLineRange.current = existingMemoryVariable.codedata?.lineRange;
                setMemoryNode(isSameType ? existingMemoryVariable : undefined);

                nodeTemplate.codedata.lineRange = targetLineRange.current;
                nodeTemplate.codedata.isNew = false;
                setMemoryNodeTemplate(nodeTemplate);
            } else {
                // No existing memory - insert new one at end of file
                const endOfFilePosition = await rpcClient
                    .getBIDiagramRpcClient()
                    .getEndOfFile({ filePath: agentFilePath.current });

                targetLineRange.current = {
                    fileName: agentNode?.codedata?.lineRange?.fileName,
                    startLine: endOfFilePosition,
                    endLine: endOfFilePosition
                };

                nodeTemplate.codedata.lineRange = targetLineRange.current;
                setMemoryNode(undefined);
                setMemoryNodeTemplate(nodeTemplate);
            }

            // Update the selected memory type and remove "ai:" prefix if present
            let memoryType = memoryCodeData.object;
            if (memoryType?.startsWith("ai:")) {
                memoryType = memoryType.substring(3);
            }
            setSelectedMemoryType(memoryType);
        } catch (error) {
            console.error("Error loading memory template", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleMemoryChange = async (memoryType: string): Promise<void> => {
        const memoryCodeData = availableMemory.find(
            (memory) => memory.object === memoryType
        );

        if (!memoryCodeData) {
            console.error(`Memory not found: ${memoryType}`);
            return;
        }

        await loadMemoryTemplate(memoryCodeData);
    };

    const resolveFilePath = async (fileName: string | undefined, fallback: string): Promise<string> => {
        if (!fileName) return fallback;
        // `fileName` may be relative (e.g. "agents.bal") or already absolute
        // (ConnectionSelector's updateNodeLineRange writes the artifact's absolute path).
        // Skip joinProjectPath when already absolute to avoid doubling the project prefix.
        if (fileName.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(fileName)) {
            return fileName;
        }
        return (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] })).filePath;
    };

    const handleOnSave = async (updatedNode?: FlowNode): Promise<void> => {
        if (!agentNode) {
            console.error("Agent node not found", { agentNode, agentNodeRef });
            return;
        }

        setIsSaving(true);

        try {
            const memoryFileName = updatedNode?.codedata?.lineRange?.fileName;
            const memoryFilePath = await resolveFilePath(memoryFileName, agentFilePath.current);

            const agentVarName = agentNode?.properties?.variable?.value as string;

            const memoryResponse = await rpcClient.getBIDiagramRpcClient().getSourceCode({
                filePath: memoryFilePath,
                flowNode: updatedNode,
            });

            const updatedAgentNode = cloneDeep(agentNode);

            // Creating the memory variable shifts file lines; refresh the agent's line range from the returned
            // artifacts before re-writing it, so the edit replaces the agent instead of duplicating it.
            if (memoryFilePath === agentFilePath.current) {
                refreshNodeLineRangeFromArtifacts(
                    updatedAgentNode,
                    memoryResponse?.artifacts,
                    agentVarName
                );
            }

            const agentNodeFilePath = await resolveFilePath(
                updatedAgentNode?.codedata?.lineRange?.fileName,
                agentFilePath.current
            );
            (updatedAgentNode.properties as any)[memoryPropertyKey].value = updatedNode?.properties.variable.value || "";

            const agentResponse = await rpcClient.getBIDiagramRpcClient().getSourceCode({
                filePath: agentNodeFilePath,
                flowNode: updatedAgentNode,
            });

            // The focus diagram's auto-reload refetches over the stored visualizer position, which is now stale (the
            // new memory/store vars shifted the agent). Hand the agent's post-save position to onSave so the caller
            // can refetch the correct node.
            const savedAgentPosition = agentResponse?.artifacts?.find((a) => a.name === agentVarName)?.position;
            onSave?.(savedAgentPosition);
        } catch (error) {
            console.error("Error saving memory configuration", error);
        } finally {
            setIsSaving(false);
        }
    };


    const closeStoreOverlays = () => {
        if (createOverlayIdRef.current) {
            closeTopOverlay();
            createOverlayIdRef.current = null;
        }
        if (selectionOverlayIdRef.current) {
            closeTopOverlay();
            selectionOverlayIdRef.current = null;
        }
    };

    const handleStoreCreated = (createdNode: FlowNode, artifacts?: ProjectStructureArtifactResponse[]) => {
        const storeProperty = createdNode.properties?.store;
        if (!storeProperty?.value) {
            console.error("No store reference found in created node");
            closeStoreOverlays();
            return;
        }

        const memoryVariableName = (memoryNode || memoryNodeTemplate)?.properties?.variable?.value;
        const memoryArtifact = artifacts?.find(a => a.name === memoryVariableName);

        if (artifacts?.length > 0) {
            const agentArtifact = artifacts.find(a => a.name === agentNode?.properties?.variable?.value);
            if (agentArtifact?.position) {
                agentNode.codedata.lineRange.startLine.line = agentArtifact.position.startLine;
                agentNode.codedata.lineRange.startLine.offset = agentArtifact.position.startColumn;
                agentNode.codedata.lineRange.endLine.line = agentArtifact.position.endLine;
                agentNode.codedata.lineRange.endLine.offset = agentArtifact.position.endColumn;
            }
        }

        if (memoryArtifact?.position) {
            targetLineRange.current = {
                ...targetLineRange.current,
                startLine: { line: memoryArtifact.position.startLine, offset: memoryArtifact.position.startColumn },
                endLine: { line: memoryArtifact.position.endLine, offset: memoryArtifact.position.endColumn }
            };
        }

        const applyMemoryUpdates = (node: FlowNode): FlowNode => {
            const updated = cloneDeep(node);
            (updated.properties as any)['store'] = cloneDeep(storeProperty);
            if (memoryArtifact?.position) {
                updated.codedata.lineRange = {
                    ...updated.codedata.lineRange,
                    startLine: { line: memoryArtifact.position.startLine, offset: memoryArtifact.position.startColumn },
                    endLine: { line: memoryArtifact.position.endLine, offset: memoryArtifact.position.endColumn }
                };
            }
            return updated;
        };

        setMemoryNodeTemplate(prev => (prev ? applyMemoryUpdates(prev) : prev));
        setMemoryNode(prev => (prev ? applyMemoryUpdates(prev) : prev));

        setFormKey(prev => prev + 1);
        closeStoreOverlays();
    };

    const handleSelectStore = async (nodeId: string, metadata?: any) => {
        if (!selectionOverlayIdRef.current || createOverlayIdRef.current) {
            return;
        }

        // Push create on top of selection so back navigation just pops it
        // and reveals the already-mounted selection panel (no slide-in).
        const createId = openOverlay({
            title: "Create Memory Store",
            content: (
                <LoaderContainer>
                    <RelativeLoader />
                </LoaderContainer>
            ),
            onBack: closeTopOverlay,
            // Fires from closeTopOverlay, backdrop click, and X button — catches every close path
            onClose: () => {
                createOverlayIdRef.current = null;
            },
        });
        createOverlayIdRef.current = createId;

        try {
            const { flowNode } = await getNodeTemplateForConnection(
                nodeId,
                metadata,
                targetLineRange.current,
                agentFilePath.current,
                rpcClient
            );

            if (createOverlayIdRef.current !== createId) {
                return;
            }

            updateOverlay(createId, {
                content: (
                    <ConnectionCreator
                        connectionKind="SHORT_TERM_MEMORY_STORE"
                        selectedNode={memoryNode || memoryNodeTemplate}
                        nodeFormTemplate={flowNode}
                        onSave={handleStoreCreated}
                    />
                ),
            });
        } catch (error) {
            console.error("Error selecting memory store:", error);
            if (createOverlayIdRef.current === createId) {
                closeTopOverlay();
                createOverlayIdRef.current = null;
            }
        }
    };

    const handleOpenStoreSelection = () => {
        const id = openOverlay({
            title: "Select Memory Store",
            content: (
                <ConnectionSelectionList
                    connectionKind="SHORT_TERM_MEMORY_STORE"
                    onSelect={handleSelectStore}
                />
            ),
            onBack: closeTopOverlay,
            onClose: () => {
                selectionOverlayIdRef.current = null;
            },
        });
        selectionOverlayIdRef.current = id;
    };

    return (
        <ScrollWrapper>
            {availableMemory.length > 0 && (
                <Container>
                    <Row>
                        <Dropdown
                            isRequired
                            errorMsg=""
                            id="agent-memory-dropdown"
                            items={availableMemory.map((memory) => ({
                                value: memory.object,
                                content: memory.object.replace(/([A-Z])/g, ' $1').trim(), // Convert camel case to words
                            }))}
                            label="Select Memory"
                            description="Available Memory"
                            onValueChange={handleMemoryChange}
                            value={selectedMemoryType}
                            containerSx={{ width: "100%" }}
                        />
                    </Row>
                    {selectedMemoryType === "MessageWindowChatMemory" && availableMemory.length > 1 && (
                        <WarningMessage>
                            <Codicon name="warning" />
                            <div>
                                <strong>Note:</strong> Message Window Chat Memory is deprecated and may
                                not be supported in future versions. Please use <strong>Short Term Memory</strong> instead.
                            </div>
                        </WarningMessage>
                    )}
                </Container>
            )}
            {isLoading && (
                <LoaderContainer>
                    <RelativeLoader />
                </LoaderContainer>
            )}
            {!isLoading && memoryNodeTemplate && targetLineRange.current && (
                <FlowNodeForm
                    key={formKey}
                    fileName={agentFilePath.current}
                    node={memoryNode || memoryNodeTemplate}
                    nodeFormTemplate={memoryNodeTemplate}
                    targetLineRange={targetLineRange.current}
                    onSubmit={handleOnSave}
                    disableSaveButton={isSaving}
                    submitText={isSaving ? "Saving..." : "Save"}
                    showProgressIndicator={isSaving}
                    defaultExpandAdvanced={formKey > 0}
                    fieldOverrides={{
                        store: {
                            type: "ACTION_EXPRESSION",
                            types: [{ fieldType: "ACTION_EXPRESSION", selected: true }, { fieldType: "EXPRESSION", selected: false }],
                            codedata: { searchNodesKind: "SHORT_TERM_MEMORY_STORE" },
                            actionCallback: handleOpenStoreSelection,
                            defaultValue: "In-Memory Short Term Memory Store",
                            actionLabel: (
                                <>
                                    <Codicon name="add" />
                                    Create New Memory Store
                                </>
                            ),
                        },
                        overflowConfiguration: {
                            defaultValue: "Overflow Trim Configuration"
                        },
                        type: {
                            hidden: true
                        }
                    }}
                />
            )}
        </ScrollWrapper>
    );
}
