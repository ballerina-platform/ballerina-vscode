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
import { CodeData, FlowNode, LineRange } from "@wso2/ballerina-core";
import { PanelOverlayContext } from "../../views/BI/FlowDiagram/context/PanelOverlayContext";
import { getNodeTemplateForConnection } from "../../views/BI/FlowDiagram/utils";
import { useModalStack } from "../../Context";

const CreateMemoryForm = lazy(() => import("../../views/BI/AIChatAgent/AddAgentPopup/CreateMemoryForm"));
const CreateAgentForm = lazy(() => import("../../views/BI/AIChatAgent/AddAgentPopup/CreateAgentForm"));
import { ConnectionSelectionList } from "./ConnectionSelectionList";
import { ConnectionCreator } from "./ConnectionCreator";
import { ConnectionCreateWizard, getConnectionKindDisplayName } from "./ConnectionCreateWizard";
import { ConnectionKind } from "./types";
import { RelativeLoader } from "../RelativeLoader";
import { LoaderContainer } from "../RelativeLoader/styles";

const readCreatedVariable = (node: FlowNode): string | undefined => {
    const props = node?.properties as Record<string, { value?: string }> | undefined;
    return props?.model?.value ?? props?.modelProvider?.value;
};

export function useCreateConnection(
    fileName?: string,
    targetLineRange?: LineRange,
    onConnectionCreated?: () => void
) {
    const { rpcClient } = useRpcContext();
    const panelOverlay = useContext(PanelOverlayContext);
    const { addModal, closeModal } = useModalStack();

    const handleCreated = (variableName: string, onCreated: (variableName: string) => void) => {
        onConnectionCreated?.();
        onCreated(variableName);
    };

    const createGenericConnection = async (connectorCodeData: CodeData, onCreated: (variableName: string) => void) => {
        const title = "Create Connection";
        const dummyNode = { codedata: {}, properties: {} } as unknown as FlowNode;
        const renderCreator = (flowNode: FlowNode, close: () => void) => (
            <ConnectionCreator
                connectionKind={(connectorCodeData.node || "NEW_CONNECTION") as ConnectionKind}
                selectedNode={dummyNode}
                nodeFormTemplate={flowNode}
                onSave={(_node, artifacts) => {
                    const created = artifacts?.find((artifact) => artifact.isNew);
                    if (created?.name) {
                        handleCreated(created.name, onCreated);
                    }
                    close();
                }}
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
            } catch (error) {
                console.error("Error preparing connection creation:", error);
                panelOverlay.closeTopOverlay();
            }
            return;
        }

        const modalId = `create-connection-${connectorCodeData.org}-${connectorCodeData.object}`;
        try {
            const flowNode = await fetchTemplate();
            addModal(renderCreator(flowNode, () => closeModal(modalId)), modalId, title, 600, 520);
        } catch (error) {
            console.error("Error preparing connection creation:", error);
        }
    };

    return (kind: string, onCreated: (variableName: string) => void, connectorCodeData?: CodeData) => {
        if (connectorCodeData?.node === "AGENT" || connectorCodeData?.node === "AGENT_TYPE") {
            const modalId = "create-agent";
            const handleAgentCreated = (variableName: string) => {
                handleCreated(variableName, onCreated);
                closeModal(modalId);
            };
            addModal(
                <Suspense fallback={<LoaderContainer><RelativeLoader /></LoaderContainer>}>
                    <CreateAgentForm agentCodeData={connectorCodeData} onCreated={handleAgentCreated} />
                </Suspense>,
                modalId,
                `Create ${connectorCodeData.object ?? "Agent"}`,
                600,
                600
            );
            return;
        }
        if (connectorCodeData) {
            createGenericConnection(connectorCodeData, onCreated);
            return;
        }
        if (kind === "MEMORY") {
            const modalId = "create-memory";
            const handleMemoryCreated = (variableName: string) => {
                handleCreated(variableName, onCreated);
                closeModal(modalId);
            };
            addModal(
                <Suspense fallback={<LoaderContainer><RelativeLoader /></LoaderContainer>}>
                    <CreateMemoryForm onCreated={handleMemoryCreated} />
                </Suspense>,
                modalId,
                "Create Memory",
                600,
                600
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
                    onBack: panelOverlay.closeTopOverlay,
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
                                onSave={(node) => {
                                    const varName = readCreatedVariable(node);
                                    if (varName) {
                                        handleCreated(varName, onCreated);
                                    }
                                    panelOverlay.clearAllOverlays();
                                }}
                            />
                        ),
                    });
                } catch (error) {
                    console.error("Error preparing connection creation:", error);
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

        const modalId = `create-connection-${kind}`;
        addModal(
            <ConnectionCreateWizard
                connectionKind={connectionKind}
                fileName={fileName}
                targetLineRange={targetLineRange}
                onCreated={(variableName) => {
                    handleCreated(variableName, onCreated);
                    closeModal(modalId);
                }}
            />,
            modalId,
            `Create ${displayName}`,
            600,
            520
        );
    };
}
