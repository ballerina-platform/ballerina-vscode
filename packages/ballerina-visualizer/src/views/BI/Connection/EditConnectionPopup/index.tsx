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

import React, { useEffect, useState, useMemo } from "react";
import styled from "@emotion/styled";
import { FlowNode, LinePosition, ParentPopupData, EVENT_TYPE, MACHINE_VIEW } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Codicon, ThemeColors, Typography, ProgressRing } from "@wso2/ui-toolkit";
import ConnectionConfigView from "../ConnectionConfigView";
import { ConnectorConfigView } from "./ConnectorConfigView";
import { EditConnectorForm } from "./EditConnectorForm";
import { getFormProperties } from "../../../../utils/bi";
import { ExpressionFormField } from "@wso2/ballerina-side-panel";
import { cloneDeep } from "lodash";
import { PopupOverlay, PopupContainer, PopupHeader as ConfigHeader, BackButton, HeaderTitleContainer as ConfigTitleContainer, PopupTitle, PopupSubtitle as ConfigSubtitle, CloseButton } from "../styles";
import { ConnectionKind, ConnectionSelectionList, ConnectionCreator } from "../../../../components/ConnectionSelector";
import { SidePanelView } from "../../FlowDiagram/PanelManager";
import { getNodeTemplateForConnection } from "../../FlowDiagram/utils";
import type { IntrospectCredentialsResponse } from "@wso2/ballerina-core";

const PersistContentLayout = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
`;

const ConnectionDetailsWrapper = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
`;

const ConnectionDetailsSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const ConnectionDetailsTitle = styled(Typography)`
    font-size: 16px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

const ConnectionDetailsSubtitle = styled(Typography)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin: 0;
`;

const Separator = styled.div`
    width: 100%;
    height: 1px;
    background-color: ${ThemeColors.OUTLINE_VARIANT};
    margin: 12px 0;
`;

const ConnectorConfigWrapper = styled.div`
    display: flex;
    flex-direction: column;
`;

const ContentContainer = styled.div<{ hasFooterButton?: boolean }>`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: ${(props: { hasFooterButton?: boolean }) => props.hasFooterButton ? "hidden" : "auto"};
    padding: 24px;
    padding-bottom: ${(props: { hasFooterButton?: boolean }) => props.hasFooterButton ? "0" : "24px"};
    min-height: 0;
`;

const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    padding: 40px;
`;

// Navigation views for the popup
enum PopupView {
    CONNECTION_CONFIG = "CONNECTION_CONFIG",
    CONNECTION_SELECT = "CONNECTION_SELECT",
    CONNECTION_CREATE = "CONNECTION_CREATE",
    EDIT_CONNECTOR = "EDIT_CONNECTOR"
}
interface EditConnectionPopupProps {
    connectionName: string;
    fileName?: string;
    target?: LinePosition;
    onClose?: (data?: ParentPopupData) => void;
}

export function EditConnectionPopup(props: EditConnectionPopupProps) {
    const { connectionName, fileName, target, onClose } = props;
    const { rpcClient } = useRpcContext();

    const [connection, setConnection] = useState<FlowNode>();
    const [filePath, setFilePath] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [updatedExpressionField, setUpdatedExpressionField] = useState<ExpressionFormField>(undefined);

    // Navigation state
    const [currentView, setCurrentView] = useState<PopupView>(PopupView.CONNECTION_CONFIG);
    const [selectedConnectionKind, setSelectedConnectionKind] = useState<ConnectionKind>();
    const [nodeFormTemplate, setNodeFormTemplate] = useState<FlowNode>();

    // Connector credentials from introspectCredentials API (for persist connections)
    const [connectorCredentials, setConnectorCredentials] = useState<IntrospectCredentialsResponse["data"] | null>(null);

    useEffect(() => {
        const fetchConnection = async () => {
            setIsLoading(true);
            try {
                const res = await rpcClient.getBIDiagramRpcClient().getModuleNodes();
                console.log(">>> moduleNodes", { moduleNodes: res });

                if (!res.flowModel.connections || res.flowModel.connections.length === 0) {
                    console.error(">>> No connections found");
                    if (onClose) {
                        onClose();
                    } else {
                        rpcClient.getVisualizerRpcClient()?.goHome({ isPackageOverview: true });
                    }
                    return;
                }

                const connector = res.flowModel.connections.find(
                    (node) => node.properties.variable.value === connectionName
                );

                if (!connector) {
                    console.error(">>> Error finding connector", { connectionName });
                    if (onClose) {
                        onClose();
                    } else {
                        rpcClient.getVisualizerRpcClient()?.goHome({ isPackageOverview: true });
                    }
                    return;
                }

                const connectionFile = connector.codedata.lineRange.fileName;
                const connectionFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({
                    segments: [connectionFile]
                })).filePath;

                setFilePath(connectionFilePath);
                setConnection(connector);

                // Check if this is a persist connection and store connection info
                const metadataData = connector.metadata?.data as any;
                const isPersist = metadataData?.connectorType === "persist";

                // Fetch connector credentials for persist connections
                if (isPersist) {
                    try {
                        const visualizerLocation = await rpcClient.getVisualizerLocation();
                        const connectorWizard = rpcClient.getConnectorWizardRpcClient() as unknown as { introspectCredentials: (p: { connection?: string; projectPath: string }) => Promise<IntrospectCredentialsResponse> };
                        const response = await connectorWizard.introspectCredentials({
                            connection: connectionName,
                            projectPath: visualizerLocation.projectPath
                        });
                    
                        if (response?.data) {
                            setConnectorCredentials(response.data);
                        }
                    } catch (err) {
                        console.error(">>> Error fetching connector credentials", err);
                    }
                }

                const formProperties = getFormProperties(connector);
                console.log(">>> Connector form properties", formProperties);
            } catch (error) {
                console.error(">>> Error fetching connection", error);
                if (onClose) {
                    onClose();
                } else {
                    rpcClient.getVisualizerRpcClient()?.goHome({ isPackageOverview: true });
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchConnection();
    }, [connectionName, rpcClient]);

    const handleClosePopup = () => {
        if (onClose) {
            onClose();
        } else {
            rpcClient.getVisualizerRpcClient()?.goHome({ isPackageOverview: true });
        }
    };

    const handleOnFormSubmit = async (node: FlowNode) => {
        console.log(">>> on form submit", node);
        if (connection) {
            setIsSaving(true);
            try {
                if (filePath === "") {
                    console.error(">>> Error updating source code. No source file found");
                    setIsSaving(false);
                    return;
                }

                const response = await rpcClient.getBIDiagramRpcClient().getSourceCode({
                    filePath: filePath,
                    flowNode: node,
                    isConnector: true,
                });

                console.log(">>> Updated source code", response);
                if (response.artifacts.length > 0) {
                    handleClosePopup();
                } else {
                    console.error(">>> Error updating source code", response);
                }
            } catch (error) {
                console.error(">>> Error saving connection", error);
            } finally {
                setIsSaving(false);
            }
        }
    };


    const handleResetUpdatedExpressionField = () => {
        setUpdatedExpressionField(undefined);
    };

    // Navigation handlers
    const handleNavigateToPanel = async (targetPanel: SidePanelView, connectionKind?: ConnectionKind) => {
        if (connectionKind) {
            setSelectedConnectionKind(connectionKind);
        }
        switch (targetPanel) {
            case SidePanelView.CONNECTION_SELECT:
                setCurrentView(PopupView.CONNECTION_SELECT);
                break;
            case SidePanelView.CONNECTION_CREATE:
                setCurrentView(PopupView.CONNECTION_CREATE);
                break;
            default:
                setCurrentView(PopupView.CONNECTION_CONFIG);
        }
    };

    const handleSelectNewConnection = async (nodeId: string, metadata?: any) => {
        try {
            const { flowNode, connectionKind } = await getNodeTemplateForConnection(
                nodeId,
                metadata,
                connection?.codedata?.lineRange,
                filePath,
                rpcClient
            );
            setNodeFormTemplate(flowNode);
            setSelectedConnectionKind(connectionKind as ConnectionKind);
            setCurrentView(PopupView.CONNECTION_CREATE);
        } catch (error) {
            console.error('Error getting node template for connection:', error);
        }
    };

    const handleConnectionCreated = (connectionNode: FlowNode) => {
        // Update the connection state with the modified node to trigger re-render
        // and update the memoized selectedNode
        setConnection(cloneDeep(connectionNode));
        setCurrentView(PopupView.CONNECTION_CONFIG);
    };

    const handleBack = () => {
        switch (currentView) {
            case PopupView.CONNECTION_SELECT:
                setCurrentView(PopupView.CONNECTION_CONFIG);
                break;
            case PopupView.CONNECTION_CREATE:
                setCurrentView(PopupView.CONNECTION_SELECT);
                break;
            case PopupView.EDIT_CONNECTOR:
                setCurrentView(PopupView.CONNECTION_CONFIG);
                break;
            default:
                handleClosePopup();
        }
    };

    const handleEditConnector = () => {
        setCurrentView(PopupView.EDIT_CONNECTOR);
    };

    const handleOpenERDiagram = async () => {
        if(!connectorCredentials?.modelFilePath) {
            return;
        }
        
        const visualizerLocation = await rpcClient.getVisualizerLocation();
        const modelDocumentUri = (await rpcClient.getVisualizerRpcClient().joinProjectPath({
            segments: [connectorCredentials.modelFilePath]
        })).filePath;

        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.ERDiagram,
                projectPath: visualizerLocation.projectPath,
                documentUri: modelDocumentUri
            }
        });
    };

    // This popup is reused for custom AgentType agents (routed here from the Agents sidebar). When the
    // edited node is an agent, use agent wording instead of "connection"; connections keep their labels.
    const isAgent = connection?.codedata?.node === "AGENT_TYPE";

    const getViewTitle = () => {
        switch (currentView) {
            case PopupView.CONNECTION_SELECT:
                return `Select ${connection?.codedata?.module || ''} Connection`;
            case PopupView.CONNECTION_CREATE:
                return `Create ${connection?.codedata?.module || ''} Connection`;
            case PopupView.EDIT_CONNECTOR:
                return "Edit Database Connector";
            default:
                return isAgent ? "Edit Agent" : "Edit Connection";
        }
    };

    const getViewSubtitle = () => {
        switch (currentView) {
            case PopupView.CONNECTION_SELECT:
                return "Choose a connection type";
            case PopupView.CONNECTION_CREATE:
                return "Configure new connection";
            case PopupView.EDIT_CONNECTOR:
                return "Update your database connector credentials and selected tables";
            default:
                return isAgent ? "Update agent details" : "Update connection details";
        }
    };

    const renderCurrentView = () => {
        switch (currentView) {
            case PopupView.CONNECTION_SELECT:
                return (
                    <ConnectionSelectionList
                        connectionKind={selectedConnectionKind}
                        selectedNode={connection}
                        onSelect={handleSelectNewConnection}
                    />
                );
            case PopupView.CONNECTION_CREATE:
                return (
                    <ConnectionCreator
                        connectionKind={selectedConnectionKind}
                        selectedNode={connection}
                        nodeFormTemplate={nodeFormTemplate}
                        onSave={handleConnectionCreated}
                    />
                );
            case PopupView.EDIT_CONNECTOR:
                return connectorCredentials ? (
                    <EditConnectorForm
                        properties={connectorCredentials.properties}
                        metadata={connectorCredentials.metadata}
                        connectionName={connectionName}
                        targetModule={connectorCredentials.targetModule}
                        modelFilePath={connectorCredentials.modelFilePath}
                        handleClosePopup={handleClosePopup}
                    />
                ) : null;
            default:
                return connectorCredentials ? (
                    <PersistContentLayout>
                        <ConnectorConfigWrapper>
                            <ConnectorConfigView
                                connectorLabel={connectorCredentials.metadata?.label || connectionName}
                                connectorDescription={connectorCredentials.metadata?.description}
                                connectorIcon={connectorCredentials.metadata?.icon}
                                properties={connectorCredentials.properties}
                                onEditConnector={handleEditConnector}
                                onViewERD={handleOpenERDiagram}
                            />
                        </ConnectorConfigWrapper>
                        <Separator />
                        <ConnectionDetailsWrapper>
                            <ConnectionDetailsSection>
                                <ConnectionDetailsTitle variant="h3">Connection Details</ConnectionDetailsTitle>
                                <ConnectionDetailsSubtitle variant="body2">
                                    Configure your connection settings
                                </ConnectionDetailsSubtitle>
                            </ConnectionDetailsSection>
                            {selectedNode && (
                                <ConnectionConfigView
                                    submitText={isSaving ? "Updating..." : "Update Connection"}
                                    fileName={filePath}
                                    selectedNode={selectedNode}
                                    onSubmit={handleOnFormSubmit}
                                    updatedExpressionField={updatedExpressionField}
                                    resetUpdatedExpressionField={handleResetUpdatedExpressionField}
                                    isSaving={isSaving}
                                    footerActionButton={true}
                                    navigateToPanel={handleNavigateToPanel}
                                />
                            )}
                        </ConnectionDetailsWrapper>
                    </PersistContentLayout>
                ) : (
                    <>
                        <ConnectionDetailsSection>
                            <ConnectionDetailsTitle variant="h3">{isAgent ? "Agent Details" : "Connection Details"}</ConnectionDetailsTitle>
                            <ConnectionDetailsSubtitle variant="body2">
                                {isAgent ? "Configure your agent settings" : "Configure your connection settings"}
                            </ConnectionDetailsSubtitle>
                        </ConnectionDetailsSection>
                        {selectedNode && (
                            <ConnectionConfigView
                                submitText={isSaving ? "Updating..." : (isAgent ? "Update Agent" : "Update Connection")}
                                fileName={filePath}
                                selectedNode={selectedNode}
                                onSubmit={handleOnFormSubmit}
                                updatedExpressionField={updatedExpressionField}
                                resetUpdatedExpressionField={handleResetUpdatedExpressionField}
                                isSaving={isSaving}
                                footerActionButton={true}
                                navigateToPanel={handleNavigateToPanel}
                            />
                        )}
                    </>
                );
        }
    };

    const selectedNode = useMemo(() => {
        if (!connection) return undefined;

        // Remove description property from node before passing to form
        // since it's already shown in the connector info card
        const nodeWithoutDescription = cloneDeep(connection);
        if (nodeWithoutDescription?.metadata?.description) {
            delete nodeWithoutDescription.metadata.description;
        }
        return nodeWithoutDescription;
    }, [connection]);

    if (isLoading) {
        return (
            <>
                <PopupOverlay sx={{ background: `${ThemeColors.SURFACE_CONTAINER}`, opacity: `0.5` }} />
                <PopupContainer>
                    <LoadingContainer>
                        <ProgressRing />
                    </LoadingContainer>
                </PopupContainer>
            </>
        );
    }

    if (!connection) {
        return null;
    }

    return (
        <>
            <PopupOverlay sx={{ background: `${ThemeColors.SURFACE_CONTAINER}`, opacity: `0.5` }} />
            <PopupContainer>
                <ConfigHeader>
                    <BackButton appearance="icon" onClick={handleBack}>
                        <Codicon name="chevron-left" />
                    </BackButton>
                    <ConfigTitleContainer>
                        <PopupTitle variant="h2">{getViewTitle()}</PopupTitle>
                        <ConfigSubtitle variant="body2">
                            {getViewSubtitle()}
                        </ConfigSubtitle>
                    </ConfigTitleContainer>
                    <CloseButton appearance="icon" onClick={handleClosePopup}>
                        <Codicon name="close" />
                    </CloseButton>
                </ConfigHeader>
                {currentView === PopupView.EDIT_CONNECTOR ? (
                    renderCurrentView()
                ) : (
                    <ContentContainer hasFooterButton={currentView === PopupView.CONNECTION_CONFIG}>
                        {renderCurrentView()}
                    </ContentContainer>
                )}
            </PopupContainer>
        </>
    );
}

export default EditConnectionPopup;

