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
import React, { useEffect, useState } from "react";
import { AvailableNode, MACHINE_VIEW, NodeKind, ParentPopupData, PopupMachineStateValue, PopupVisualizerLocation } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ThemeColors, Overlay } from "@wso2/ui-toolkit";
import { URI, Utils } from "vscode-uri";
import { CONNECTIONS_FILE } from "./constants";
import { FunctionForm } from "./views/BI";
import { DataMapper } from "./views/DataMapper";
import AddConnectionPopup from "./views/BI/Connection/AddConnectionPopup";
import AddAgentPopup from "./views/BI/AIChatAgent/AddAgentPopup";
import { ConnectionConfigurationPopup } from "./views/BI/Connection/ConnectionConfigurationPopup";
import EditConnectionPopup from "./views/BI/Connection/EditConnectionPopup";
import { ConfigurationCollector } from "./views/AIPanel/components/ConfigurationCollector";

const ViewContainer = styled.div<{ isFullScreen?: boolean }>`
    position: fixed;
    top: 0;
    right: 0;
    width: ${(props: { isFullScreen: boolean; }) => props.isFullScreen ? '100%' : '400px'};
    height: 100%;
    z-index: 2000;
    background-color: ${ThemeColors.SURFACE_BRIGHT};
`;

const TopBar = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 20px 16px;
`;

interface PopupPanelProps {
    formState: PopupMachineStateValue;
    onClose: (parent?: ParentPopupData) => void;
    handleNavigateToOverview: () => void;
}

const PopupPanel = (props: PopupPanelProps) => {
    const { formState, onClose, handleNavigateToOverview } = props;
    const { rpcClient } = useRpcContext();
    const [viewComponent, setViewComponent] = useState<React.ReactNode>();
    const [isFullScreen, setIsFullScreen] = useState(false);

    useEffect(() => {
        if (typeof formState === "object" && "open" in formState) {
            fetchContext();
        }
    }, [formState]);

    useEffect(() => {
        fetchContext();
    }, []);

    const handleApprovalClose = (approvalData: any | undefined) => {
        const requestId = approvalData?.requestId;

        if (requestId) {
            console.log('[PopupPanel] Approval view closed, notifying backend:', requestId);
            rpcClient.getVisualizerRpcClient().handleApprovalPopupClose({ requestId });
        }

        onClose();
    };

    const fetchContext = () => {
        rpcClient.getPopupVisualizerState().then((machineState: PopupVisualizerLocation) => {
            switch (machineState?.view) {
                case MACHINE_VIEW.AddConnectionWizard:
                    rpcClient.getVisualizerLocation().then((location) => {
                        setViewComponent(
                            <AddConnectionPopup
                                projectPath={location.projectPath}
                                fileName={location.documentUri || Utils.joinPath(URI.file(location.projectPath), CONNECTIONS_FILE).fsPath}
                                target={machineState.metadata?.target || undefined}
                                onClose={onClose}
                                onNavigateToOverview={handleNavigateToOverview}
                                isPopup={true}
                            />
                        );
                    });
                    break;
                case MACHINE_VIEW.AddAgent:
                    rpcClient.getVisualizerLocation().then((location) => {
                        setViewComponent(
                            <AddAgentPopup
                                projectPath={location.projectPath}
                                onClose={onClose}
                                onNavigateToOverview={handleNavigateToOverview}
                                isPopup={true}
                            />
                        );
                    });
                    break;
                case MACHINE_VIEW.ConnectionConfiguration:
                    const connectorMetadata = machineState.metadata ?? {};

                    // Reconstruct the connector object from metadata
                    const selectedConnector: AvailableNode = {
                        metadata: {
                            label: connectorMetadata.selectedConnectorLabel || "",
                            description: connectorMetadata.selectedConnectorDescription || "",
                            icon: connectorMetadata.selectedConnectorIcon || ""
                        },
                        codedata: {
                            id: connectorMetadata.selectedConnectorId,
                            node: connectorMetadata.selectedConnectorNode as NodeKind,
                            org: connectorMetadata.selectedConnectorOrg,
                            module: connectorMetadata.selectedConnectorModule,
                            packageName: connectorMetadata.selectedConnectorPackageName,
                            object: connectorMetadata.selectedConnectorObject,
                            symbol: connectorMetadata.selectedConnectorSymbol,
                            version: connectorMetadata.selectedConnectorVersion,
                            isGenerated: connectorMetadata.selectedConnectorIsGenerated
                        },
                        enabled: true
                    };

                    rpcClient.getVisualizerLocation().then((location) => {
                        setViewComponent(
                            <ConnectionConfigurationPopup
                                selectedConnector={selectedConnector}
                                fileName={location.documentUri || location.projectPath}
                                target={connectorMetadata.target || undefined}
                                onClose={onClose}
                                onBack={onClose}
                                filteredCategories={[]}
                            />
                        );
                    });
                    break;
                case MACHINE_VIEW.EditConnectionWizard:
                    rpcClient.getVisualizerLocation().then((location) => {
                        setViewComponent(
                            <>
                                <EditConnectionPopup
                                    connectionName={machineState?.identifier}
                                    onClose={onClose}
                                />
                            </>
                        );
                    });
                    break;
                case MACHINE_VIEW.BIFunctionForm:
                    setIsFullScreen(true);
                    rpcClient.getVisualizerLocation().then(async (location) => {
                        const defaultFunctionsFile = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: ['functions.bal'] })).filePath;
                        setViewComponent(<FunctionForm
                            projectPath={location.projectPath}
                            filePath={defaultFunctionsFile}
                            functionName={undefined}
                            isPopup={true} />
                        );
                    });
                    break;
                case MACHINE_VIEW.BIAgentToolForm:
                    setIsFullScreen(true);
                    rpcClient.getVisualizerLocation().then(async (location) => {
                        const agentsFile = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: ['agents.bal'] })).filePath;
                        setViewComponent(<FunctionForm
                            projectPath={location.projectPath}
                            filePath={agentsFile}
                            functionName={undefined}
                            isAgentTool={true}
                            isPopup={true} />
                        );
                    });
                    break;
                case MACHINE_VIEW.BIWorkflowForm:
                    setIsFullScreen(true);
                    rpcClient.getVisualizerLocation().then(async (location) => {
                        const defaultFunctionsFile = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: ['functions.bal'] })).filePath;
                        setViewComponent(
                            <FunctionForm
                                projectPath={location.projectPath}
                                filePath={defaultFunctionsFile}
                                functionName={undefined}
                                isWorkflow={true}
                                isPopup={true}
                            />
                        );
                    });
                    break;
                case MACHINE_VIEW.BIActivityForm:
                    setIsFullScreen(true);
                    rpcClient.getVisualizerLocation().then(async (location) => {
                        const defaultFunctionsFile = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: ['functions.bal'] })).filePath;
                        setViewComponent(
                            <FunctionForm
                                projectPath={location.projectPath}
                                filePath={defaultFunctionsFile}
                                functionName={undefined}
                                isActivity={true}
                                isPopup={true}
                            />
                        );
                    });
                    break;
                case MACHINE_VIEW.BIDataMapperForm:
                    setIsFullScreen(true);
                    rpcClient.getVisualizerLocation().then(async (location) => {
                        const defaultFunctionsFile = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: ['data_mappings.bal'] })).filePath;
                        setViewComponent(
                            <FunctionForm
                                projectPath={location.projectPath}
                                filePath={defaultFunctionsFile}
                                functionName={undefined}
                                isDataMapper={true}
                                isPopup={true}
                            />
                        );
                    });
                    break;
                case MACHINE_VIEW.BINPFunctionForm:
                    setIsFullScreen(true);
                    rpcClient.getVisualizerLocation().then(async (location) => {
                        const defaultFunctionsFile = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: ['functions.bal'] })).filePath;
                        setViewComponent(
                            <FunctionForm
                                projectPath={location.projectPath}
                                filePath={defaultFunctionsFile}
                                functionName={undefined}
                                isDataMapper={false}
                                isNpFunction={true}
                                isPopup={true}
                            />
                        );
                    });
                    break;
                case MACHINE_VIEW.InlineDataMapper:
                    setIsFullScreen(true);
                    setViewComponent(
                        <DataMapper
                            filePath={machineState.documentUri}
                            codedata={machineState?.dataMapperMetadata?.codeData}
                            name={machineState?.dataMapperMetadata?.name}
                            onClose={onClose}
                        />
                    );
                    break;
                case MACHINE_VIEW.ConfigurationCollector:
                    setViewComponent(
                        <ConfigurationCollector
                            data={machineState.agentMetadata?.configurationCollector}
                            onClose={() => handleApprovalClose(machineState.agentMetadata?.configurationCollector)}
                        />
                    );
                    break;
                default:
                    setViewComponent(null);
            }
        });
    };

    return <ViewContainer isFullScreen={isFullScreen}>{viewComponent}</ViewContainer>;
};

export default PopupPanel;
