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

import React, { useEffect, useState } from "react";
import { AvailableNode, Category, LinePosition, MACHINE_VIEW, ParentPopupData } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Codicon, Icon, SearchBox, ThemeColors, Typography, ProgressRing } from "@wso2/ui-toolkit";
import { cloneDeep, debounce } from "lodash";
import ButtonCard from "../../../../components/ButtonCard";
import { ConnectorIcon } from "@wso2/bi-diagram";
import APIConnectionPopup from "../APIConnectionPopup";
import ConnectionConfigurationPopup from "../ConnectionConfigurationPopup";
import DatabaseConnectionPopup from "../DatabaseConnectionPopup";
import { PopupOverlay, PopupContainer, PopupHeader, PopupTitle, CloseButton } from "../styles";
import { usePlatformExtContext } from "../../../../providers/platform-ext-ctx-provider";
import { hasCloudProject } from "../../../../providers/cloud-project";
import { DevantConnectorPopup } from "../DevantConnections/DevantConnectorPopup";
import { PopupContent } from "./styles";
import { AddConnectionPopupContent } from "./AddConnectionPopupContent";

export interface AddConnectionPopupProps {
    projectPath: string;
    fileName: string;
    target?: LinePosition;
    onClose?: (parent?: ParentPopupData) => void;
    onNavigateToOverview: () => void;
    isPopup?: boolean;
}

/** The Add Connection popup; with a WSO2 Cloud project, the one that also creates and imports cloud connections. */
export function AddConnectionPopup(props: AddConnectionPopupProps) {
    const { onClose, onNavigateToOverview, isPopup, target, fileName, projectPath } = props;
    const { platformExtState } = usePlatformExtContext();

    if (hasCloudProject(platformExtState)) {
        return (
            <DevantConnectorPopup
                onNavigateToOverview={onNavigateToOverview}
                isPopup={isPopup}
                onClose={onClose}
                fileName={fileName}
                target={target}
                projectPath={projectPath}
            />
        );
    }
   
    return <AddBIConnectionPopup {...props} />
}

function AddBIConnectionPopup(props: AddConnectionPopupProps) {
    const { projectPath, fileName, target, onClose, onNavigateToOverview, isPopup } = props;
    const { rpcClient } = useRpcContext();
    const [wizardStep, setWizardStep] = useState<"database" | "api" | "connector" | null>(null);
    const [selectedConnector, setSelectedConnector] = useState<AvailableNode | null>(null);
    const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);

    const handleDatabaseConnection = () => {
        // Navigate to database connection wizard
        setWizardStep("database");
    };

    const handleApiSpecConnection = () => {
        // Navigate to API spec connection wizard (OpenAPI/WSDL)
        setWizardStep("api");
    };

    const handleSelectConnector = (connector: AvailableNode) => {
        if (!connector.codedata) {
            console.error(">>> Error selecting connector. No codedata found");
            return;
        }
        setSelectedConnector(connector);
        setWizardStep("connector");
    };

    const handleBackToConnectorList = () => {
        setWizardStep(null);
        setSelectedConnector(null);
    };

    const handleCloseWizard = (parent?: ParentPopupData) => {
        // If a parent payload is provided, we are done with the entire flow.
        // Close this popup (and navigate back) without resetting internal state first,
        if (parent) {
            if (isPopup) {
                rpcClient.getVisualizerLocation().then((location) => {
                    if (location.view === MACHINE_VIEW.BIComponentView) {
                        onNavigateToOverview();
                    } else {
                        onClose?.(parent);
                    }
                }).catch((err) => {
                    console.error(">>> error getting visualizer location", err);
                    onClose?.(parent);
                });
            } else {
                onNavigateToOverview();
            }
        } else {
            // Otherwise, just close the inner wizard and go back to the connector list.
            setWizardStep(null);
            setSelectedConnector(null);
        }   
    };


    // Show configuration form when connector is selected
    if (wizardStep === "connector" && selectedConnector) {
        return (
            <ConnectionConfigurationPopup
                selectedConnector={selectedConnector}
                fileName={fileName}
                target={target}
                onClose={handleCloseWizard}
                onBack={handleBackToConnectorList}
                filteredCategories={filteredCategories}
            />
        );
    }

    if (wizardStep === "api") {
        return (
            <>
                <PopupOverlay sx={{ background: `${ThemeColors.SURFACE_CONTAINER}`, opacity: `0.5` }} />
                <APIConnectionPopup
                    projectPath={projectPath}
                    fileName={fileName}
                    target={target}
                    onClose={handleCloseWizard}
                    onBack={handleBackToConnectorList}
                />
            </>
        );
    }

    if (wizardStep === "database") {
        return (
            <DatabaseConnectionPopup
                fileName={fileName}
                target={target}
                onClose={handleCloseWizard}
                onBack={handleBackToConnectorList}
                onBrowseConnectors={handleBackToConnectorList}
            />
        );
    }

    const handleClosePopup = () => {
        if (isPopup) {
            onClose?.();
        } else {
            onNavigateToOverview();
        }
    };

    return (
        <>
            <PopupOverlay sx={{ background: `${ThemeColors.SURFACE_CONTAINER}`, opacity: `0.5` }} />
            <PopupContainer>
                <PopupHeader>
                    <PopupTitle variant="h2">Add Connection</PopupTitle>
                    <CloseButton appearance="icon" onClick={() => handleClosePopup()}>
                        <Codicon name="close" />
                    </CloseButton>
                </PopupHeader>
                <PopupContent>
                    <AddConnectionPopupContent 
                        {...props}
                        handleApiSpecConnection={handleApiSpecConnection}
                        handleDatabaseConnection={handleDatabaseConnection}
                        handleSelectConnector={(connector, filteredCategories) => {
                            handleSelectConnector(connector);
                            setFilteredCategories(filteredCategories);
                        }}
                    />
                </PopupContent>
            </PopupContainer>
        </>
    );
}

export default AddConnectionPopup;

