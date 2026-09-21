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

import { Suspense, lazy, useContext } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { formatMethodName } from "@wso2/ballerina-side-panel";
import { CodeData, FlowNode, ProjectStructureArtifactResponse, isAgentDeclarationNode, LineRange } from "@wso2/ballerina-core";
import { PanelOverlayContext } from "../../views/BI/FlowDiagram/context/PanelOverlayContext";
import { getNodeTemplateForConnection } from "../../views/BI/FlowDiagram/utils";
import { useModalStack } from "../../Context";
import { WSO2_CLOUD_KNOWLEDGE_BASE_PACKAGE } from "../../constants";

const CreateMemoryForm = lazy(() => import("../../views/BI/AIChatAgent/AddAgentPopup/CreateMemoryForm"));
const CreateAgentForm = lazy(() => import("../../views/BI/AIChatAgent/AddAgentPopup/CreateAgentForm"));
import { ConnectionSelectionList } from "./ConnectionSelectionList";
import { ConnectionCreator } from "./ConnectionCreator";
import { CloudKnowledgeBaseCreator } from "./CloudKnowledgeBaseCreator";
import { getConnectionKindDisplayName } from "./config";
import { ConnectionKind } from "./types";
import { RelativeLoader } from "../RelativeLoader";
import { LoaderContainer } from "../RelativeLoader/styles";

const MODAL_WIDTH = 680;
const NODE_MODAL_HEIGHT = 780;
const PICKER_HEIGHT = 500;

const dummyNode = { codedata: {}, properties: {} } as unknown as FlowNode;

const readCreatedVariable = (node: FlowNode): string | undefined => {
    const props = node.properties as Record<string, { value?: string }> | undefined;
    return props?.model?.value || props?.modelProvider?.value;
};

export function useCreateNode(
    fileName?: string,
    targetLineRange?: LineRange,
    onNodeCreated?: () => void,
    options?: { preferModal?: boolean }
) {
    const { rpcClient } = useRpcContext();
    const panelOverlayContext = useContext(PanelOverlayContext);
    const panelOverlay = options?.preferModal ? undefined : panelOverlayContext;
    const { modalStack, addModal, updateModal, closeModal, popToModal, clearModals } = useModalStack();

    // Capture before the flow pushes: finishing returns to the level that started it.
    const returnToCallingLevel = () => {
        const callingLevelId = modalStack[modalStack.length - 1]?.id;
        return () => (callingLevelId ? popToModal(callingLevelId) : clearModals());
    };

    const handleCreated = (variableName: string, onCreated: (variableName: string) => void) => {
        onNodeCreated?.();
        onCreated(variableName);
    };

    const buildOnSave = (close: () => void, onCreated: (variableName: string) => void) =>
        (node: FlowNode, artifacts?: ProjectStructureArtifactResponse[]) => {
            const variableName = readCreatedVariable(node) || artifacts?.find((artifact) => artifact.isNew)?.name;
            if (variableName) {
                handleCreated(variableName, onCreated);
            }
            close();
        };

    // The WSO2 Cloud Knowledge Base type routes through the same "manually config or pick an
    // existing Devant service" step the flow diagram's own Add Knowledge Base panel shows, instead
    // of a blank form.
    const createCloudKnowledgeBaseConnection = (connectorCodeData: CodeData, onCreated: (variableName: string) => void) => {
        const title = "WSO2 Cloud Knowledge Bases";
        const formTitle = connectorCodeData.object
            ? `Create ${formatMethodName(connectorCodeData.object)}`
            : "Create Knowledge Base";
        const done = returnToCallingLevel();
        const renderForm = (flowNode: FlowNode, close: () => void) => (
            <ConnectionCreator
                connectionKind={(connectorCodeData.node || "NEW_CONNECTION") as ConnectionKind}
                selectedNode={dummyNode}
                nodeFormTemplate={flowNode}
                onSave={buildOnSave(close, onCreated)}
            />
        );
        const renderPicker = (onNodeReady: (flowNode: FlowNode) => void) => (
            <CloudKnowledgeBaseCreator
                connectorCodeData={connectorCodeData}
                fileName={fileName}
                targetLineRange={targetLineRange}
                onNodeReady={onNodeReady}
            />
        );

        if (panelOverlay) {
            panelOverlay.openOverlay({
                title,
                content: renderPicker((flowNode) =>
                    panelOverlay.openOverlay({
                        title: formTitle,
                        content: renderForm(flowNode, panelOverlay.clearAllOverlays),
                        onBack: panelOverlay.closeTopOverlay,
                    })
                ),
                onBack: panelOverlay.closeTopOverlay,
            });
            return;
        }

        const modalId = `create-cloud-kb-${connectorCodeData.org}-${connectorCodeData.object}`;
        addModal(
            renderPicker((flowNode) =>
                addModal(renderForm(flowNode, done), `${modalId}-form`, formTitle, NODE_MODAL_HEIGHT, MODAL_WIDTH, undefined, true)
            ),
            modalId,
            title,
            PICKER_HEIGHT,
            MODAL_WIDTH,
            undefined,
            true
        );
    };

    const createGenericConnection = async (connectorCodeData: CodeData, onCreated: (variableName: string) => void) => {
        if (connectorCodeData.packageName === WSO2_CLOUD_KNOWLEDGE_BASE_PACKAGE) {
            createCloudKnowledgeBaseConnection(connectorCodeData, onCreated);
            return;
        }
        const title = connectorCodeData.object
            ? `Create ${formatMethodName(connectorCodeData.object)}`
            : "Create Connection";
        const done = returnToCallingLevel();
        const renderCreator = (flowNode: FlowNode, close: () => void) => (
            <ConnectionCreator
                connectionKind={(connectorCodeData.node || "NEW_CONNECTION") as ConnectionKind}
                selectedNode={dummyNode}
                nodeFormTemplate={flowNode}
                onSave={buildOnSave(close, onCreated)}
            />
        );
        const fetchTemplate = async (): Promise<FlowNode> => {
            const response = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                position: targetLineRange?.startLine || { line: 0, offset: 0 },
                filePath: fileName,
                id: connectorCodeData,
            });
            return response.flowNode;
        };

        if (panelOverlay) {
            const createId = panelOverlay.openOverlay({
                title,
                content: (
                    <LoaderContainer>
                        <RelativeLoader />
                    </LoaderContainer>
                ),
                onBack: panelOverlay.closeTopOverlay,
            });
            try {
                const flowNode = await fetchTemplate();
                panelOverlay.updateOverlay(createId, {
                    content: renderCreator(flowNode, panelOverlay.clearAllOverlays),
                });
            } catch {
                panelOverlay.closeTopOverlay();
            }
            return;
        }

        const modalId = `create-connection-${connectorCodeData.org}-${connectorCodeData.object}`;
        try {
            const flowNode = await fetchTemplate();
            addModal(renderCreator(flowNode, done), modalId, title, NODE_MODAL_HEIGHT, MODAL_WIDTH, undefined, true);
        } catch (error) {
            console.error("Error fetching connector template", error);
            await rpcClient.getCommonRpcClient().showErrorMessage({
                message: "Could not load the connector. Please try again.",
            });
        }
    };

    return (kind: string, onCreated: (variableName: string) => void, nodeCodeData?: CodeData) => {
        if (isAgentDeclarationNode(nodeCodeData?.node)) {
            const modalId = "create-agent";
            const done = returnToCallingLevel();
            const handleAgentCreated = (variableName: string) => {
                handleCreated(variableName, onCreated);
                done();
            };
            addModal(
                <Suspense fallback={<LoaderContainer><RelativeLoader /></LoaderContainer>}>
                    <CreateAgentForm agentCodeData={nodeCodeData} onCreated={handleAgentCreated} />
                </Suspense>,
                modalId,
                `Create ${nodeCodeData.object ?? "Agent"}`,
                NODE_MODAL_HEIGHT,
                MODAL_WIDTH,
                undefined,
                true
            );
            return;
        }
        if (nodeCodeData) {
            createGenericConnection(nodeCodeData, onCreated);
            return;
        }
        if (kind === "MEMORY") {
            const modalId = "create-memory";
            const done = returnToCallingLevel();
            const handleMemoryCreated = (variableName: string) => {
                handleCreated(variableName, onCreated);
                done();
            };
            addModal(
                <Suspense fallback={<LoaderContainer><RelativeLoader /></LoaderContainer>}>
                    <CreateMemoryForm onCreated={handleMemoryCreated} />
                </Suspense>,
                modalId,
                "Create Memory",
                NODE_MODAL_HEIGHT,
                MODAL_WIDTH,
                undefined,
                true
            );
            return;
        }
        const connectionKind = kind as ConnectionKind;
        const displayName = getConnectionKindDisplayName(connectionKind);

        if (panelOverlay) {
            let createId: string | null = null;
            const handleSelect = async (nodeId: string, metadata?: any) => {
                if (createId) {
                    return;
                }
                createId = panelOverlay.openOverlay({
                    title: `Create ${displayName}`,
                    content: (
                        <LoaderContainer>
                            <RelativeLoader />
                        </LoaderContainer>
                    ),
                    onBack: () => {
                        createId = null;
                        panelOverlay.closeTopOverlay();
                    },
                });
                try {
                    const { flowNode } = await getNodeTemplateForConnection(
                        nodeId,
                        metadata,
                        { startLine: targetLineRange?.startLine },
                        fileName,
                        rpcClient
                    );
                    panelOverlay.updateOverlay(createId, {
                        content: (
                            <ConnectionCreator
                                connectionKind={connectionKind}
                                selectedNode={{ properties: { model: { value: "" } } } as unknown as FlowNode}
                                nodeFormTemplate={flowNode}
                                onSave={(node, artifacts) => {
                                    const varName = readCreatedVariable(node) || artifacts?.find(
                                        (artifact) => artifact.isNew
                                    )?.name;
                                    if (varName) {
                                        handleCreated(varName, onCreated);
                                    }
                                    panelOverlay.clearAllOverlays();
                                }}
                            />
                        ),
                    });
                } catch {
                    panelOverlay.closeTopOverlay();
                    createId = null;
                }
            };
            panelOverlay.openOverlay({
                title: `Select ${displayName}`,
                content: <ConnectionSelectionList connectionKind={connectionKind} onSelect={handleSelect} />,
                onBack: panelOverlay.closeTopOverlay,
            });
            return;
        }

        const selectId = `select-connection-${kind}`;
        const createId = `create-connection-${kind}`;
        const done = returnToCallingLevel();

        const handleSelect = async (nodeId: string, metadata?: any) => {
            addModal(
                <LoaderContainer><RelativeLoader /></LoaderContainer>,
                createId,
                `Create ${displayName}`,
                NODE_MODAL_HEIGHT,
                MODAL_WIDTH,
                undefined,
                true
            );
            try {
                const { flowNode } = await getNodeTemplateForConnection(
                    nodeId,
                    metadata,
                    { startLine: targetLineRange?.startLine },
                    fileName,
                    rpcClient
                );
                const typeLabel = flowNode?.metadata?.label;
                updateModal(createId, {
                    title: typeLabel ? `Create ${typeLabel}` : `Create ${displayName}`,
                    modal: (
                        <ConnectionCreator
                            connectionKind={connectionKind}
                            selectedNode={{ properties: { model: { value: "" } } } as unknown as FlowNode}
                            nodeFormTemplate={flowNode}
                            onSave={buildOnSave(done, onCreated)}
                        />
                    ),
                });
            } catch (error) {
                console.error("Error fetching connector template", error);
                closeModal(createId);
            }
        };

        addModal(
            <ConnectionSelectionList connectionKind={connectionKind} onSelect={handleSelect} fillContainerHeight />,
            selectId,
            `Select ${displayName}`,
            NODE_MODAL_HEIGHT,
            MODAL_WIDTH,
            undefined,
            true
        );
    };
}
