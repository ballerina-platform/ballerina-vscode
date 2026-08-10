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

import { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { EVENT_TYPE, FlowNode, MACHINE_VIEW, SubPanel, SubPanelView } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import ConnectionConfigView from "../ConnectionConfigView";
import { getFormProperties } from "../../../../utils/bi";
import { ExpressionFormField, PanelContainer } from "@wso2/ballerina-side-panel";
import { ProgressRing, ThemeColors } from "@wso2/ui-toolkit";
import { HelperView } from "../../HelperView";
import { ConnectionKind, ConnectionSelectionList, ConnectionCreator } from "../../../../components/ConnectionSelector";
import { SidePanelView } from "../../FlowDiagram/PanelManager";
import { getNodeTemplateForConnection } from "../../FlowDiagram/utils";

const Container = styled.div`
    width: 100%;
    height: 100%;
`;

const SpinnerContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

// Navigation views for the wizard
export enum WizardView {
    CONNECTION_CONFIG = "CONNECTION_CONFIG",
    CONNECTION_SELECT = "CONNECTION_SELECT",
    CONNECTION_CREATE = "CONNECTION_CREATE"
}

interface EditConnectionWizardProps {
    connectionName: string;
    onClose?: () => void;
}

export function EditConnectionWizard(props: EditConnectionWizardProps) {
    const { connectionName, onClose } = props;
    const { rpcClient } = useRpcContext();

    const [connection, setConnection] = useState<FlowNode>();
    const [subPanel, setSubPanel] = useState<SubPanel>({ view: SubPanelView.UNDEFINED });
    const [updatingContent, setUpdatingContent] = useState(false);
    const [filePath, setFilePath] = useState("");
    const [updatedExpressionField, setUpdatedExpressionField] = useState<ExpressionFormField>(undefined);

    // Navigation state
    const [currentView, setCurrentView] = useState<WizardView>(WizardView.CONNECTION_CONFIG);
    const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
    const [selectedConnectionKind, setSelectedConnectionKind] = useState<ConnectionKind>();
    const [nodeFormTemplate, setNodeFormTemplate] = useState<FlowNode>();

    useEffect(() => {
        rpcClient
            .getBIDiagramRpcClient()
            .getModuleNodes()
            .then(async (res) => {
                console.log(">>> moduleNodes", { moduleNodes: res });
                if (!res.flowModel.connections || res.flowModel.connections.length === 0) {
                    return;
                }
                const connector = res.flowModel.connections.find(
                    (node) => node.properties.variable.value === connectionName
                );
                if (!connector) {
                    console.error(">>> Error finding connector", { connectionName });
                    onClose?.();
                    return;
                }
                const connectionFile = connector.codedata.lineRange.fileName;
                let connectionFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [connectionFile] })).filePath;
                setFilePath(connectionFilePath);

                setConnection(connector);
                const formProperties = getFormProperties(connector);
                console.log(">>> Connector form properties", formProperties);
            });
    }, [connectionName]);

    const handleOnFormSubmit = async (node: FlowNode) => {
        console.log(">>> on form submit", node);
        if (connection) {
            setUpdatingContent(true);

            if (filePath === "") {
                console.error(">>> Error updating source code. No source file found");
                setUpdatingContent(false);
                return;
            }

            rpcClient
                .getBIDiagramRpcClient()
                .getSourceCode({
                    filePath: filePath,
                    flowNode: node,
                    isConnector: true,
                })
                .then((response) => {
                    console.log(">>> Updated source code", response);
                    if (response.artifacts.length > 0) {
                        // clear memory
                        if (onClose) {
                            onClose();
                        } else {
                            gotoHome();
                        }
                    } else {
                        console.error(">>> Error updating source code", response);
                        // handle error
                    }
                })
                .finally(() => {
                    setUpdatingContent(false);
                });
        }
    };

    const gotoHome = () => {
        rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.PackageOverview,
            },
        });
    };

    const handleSubPanel = (subPanel: SubPanel) => {
        setSubPanel(subPanel);
    };

    const updateExpressionField = (data: ExpressionFormField) => {
        setUpdatedExpressionField(data);
    };

    const findSubPanelComponent = (subPanel: SubPanel) => {
        switch (subPanel.view) {
            case SubPanelView.HELPER_PANEL:
                return (
                    <HelperView
                        filePath={subPanel.props.sidePanelData.filePath}
                        position={subPanel.props.sidePanelData.range}
                        updateFormField={updateExpressionField}
                        editorKey={subPanel.props.sidePanelData.editorKey}
                        onClosePanel={handleSubPanel}
                        configurePanelData={subPanel.props.sidePanelData?.configurePanelData}
                    />
                );
            default:
                return null;
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
                setCurrentView(WizardView.CONNECTION_SELECT);
                break;
            case SidePanelView.CONNECTION_CREATE:
                setCurrentView(WizardView.CONNECTION_CREATE);
                break;
            default:
                setCurrentView(WizardView.CONNECTION_CONFIG);
                break;
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
            setCurrentView(WizardView.CONNECTION_CREATE);
        } catch (error) {
            console.error('Error getting node template for connection:', error);
        }
    };

    const handleConnectionCreated = (connectionNode: FlowNode) => {
        setCurrentView(WizardView.CONNECTION_CONFIG);
    };

    const handleBack = () => {
        switch (currentView) {
            case WizardView.CONNECTION_SELECT:
                setCurrentView(WizardView.CONNECTION_CONFIG);
                break;
            case WizardView.CONNECTION_CREATE:
                setCurrentView(WizardView.CONNECTION_SELECT);
                break;
            default:
                onClose ? onClose() : gotoHome();
                break;
        }
    };

    const getViewTitle = () => {
        switch (currentView) {
            case WizardView.CONNECTION_SELECT:
                return `Select ${connection?.codedata?.module || ''} Connection`;
            case WizardView.CONNECTION_CREATE:
                return `Create ${connection?.codedata?.module || ''} Connection`;
            default:
                return `Configure ${connection?.codedata?.module || ''} Connector`;
        }
    };

    const renderCurrentView = () => {
        switch (currentView) {
            case WizardView.CONNECTION_SELECT:
                return (
                    <ConnectionSelectionList
                        connectionKind={selectedConnectionKind}
                        selectedNode={connection}
                        onSelect={handleSelectNewConnection}
                        expandedGroupId={expandedGroupId}
                        onExpandedGroupChange={setExpandedGroupId}
                    />
                );

            case WizardView.CONNECTION_CREATE:
                return (
                    <ConnectionCreator
                        connectionKind={selectedConnectionKind}
                        selectedNode={connection}
                        nodeFormTemplate={nodeFormTemplate}
                        onSave={handleConnectionCreated}
                    />
                );

            default:
                return (
                    <ConnectionConfigView
                        submitText={updatingContent ? "Saving..." : "Save"}
                        fileName={filePath}
                        selectedNode={connection}
                        onSubmit={handleOnFormSubmit}
                        updatedExpressionField={updatedExpressionField}
                        resetUpdatedExpressionField={handleResetUpdatedExpressionField}
                        openSubPanel={handleSubPanel}
                        isSaving={updatingContent}
                        navigateToPanel={handleNavigateToPanel}
                    />
                );
        }
    };

    return (
        <Container>
            {!connection && (
                <SpinnerContainer>
                    <ProgressRing color={ThemeColors.PRIMARY} />
                </SpinnerContainer>
            )}
            {connection && (
                <PanelContainer
                    show={true}
                    title={getViewTitle()}
                    onClose={onClose ? onClose : gotoHome}
                    width={400}
                    onBack={handleBack}
                    subPanelWidth={400}
                    subPanel={findSubPanelComponent(subPanel)}
                >
                    {renderCurrentView()}
                </PanelContainer>
            )}
        </Container>
    );
}

export default EditConnectionWizard;
