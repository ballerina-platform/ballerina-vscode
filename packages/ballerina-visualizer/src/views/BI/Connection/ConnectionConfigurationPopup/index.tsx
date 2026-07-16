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

import React, { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import {
    AvailableNode,
    Category,
    EditorConfig,
    DIRECTORY_MAP,
    FlowNode,
    LinePosition,
    ParentPopupData,
    SubPanel,
    SubPanelView,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Codicon, Icon, ThemeColors, Typography } from "@wso2/ui-toolkit";
import { ConnectorIcon } from "@wso2/bi-diagram";
import ConnectionConfigView from "../ConnectionConfigView";
import { getFormProperties } from "../../../../utils/bi";
import { ExpressionEditorDevantProps, ExpressionFormField, FormValues, MarkdownDescription } from "@wso2/ballerina-side-panel";
import { RelativeLoader } from "../../../../components/RelativeLoader";
import { HelperView } from "../../HelperView";
import { DownloadIcon } from "../../../../components/DownloadIcon";
import { FormSubmitOptions } from "../../FlowDiagram";
import { cloneDeep } from "lodash";
import { URI, Utils } from "vscode-uri";
import { PopupOverlay, PopupContainer, PopupHeader as ConfigHeader, BackButton, HeaderTitleContainer as ConfigTitleContainer, PopupTitle, PopupSubtitle as ConfigSubtitle, CloseButton } from "../styles";

const ConnectorInfoCard = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    margin: 16px 20px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
    position: relative;
`;

const ConnectorInfoIcon = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    flex-shrink: 0;

    & > img {
        width: 32px;
        height: 32px;
        object-fit: contain;
    }

    & > svg {
        width: 32px;
        height: 32px;
    }
`;

const StyledCodicon = styled(Codicon)`
    font-size: 32px;
    width: 32px;
    height: 32px;
`;

const StyledConnectorIcon = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;

    & > img {
        width: 32px;
        height: 32px;
        object-fit: contain;
    }

    & > svg {
        width: 32px;
        height: 32px;
    }
`;

const ConnectorInfoContent = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const ConnectorInfoName = styled(Typography)`
    font-size: 16px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

const ConnectorInfoDescription = styled(MarkdownDescription)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin: 0;
    overflow: hidden;
    max-height: 3em;

    p {
        font-size: 12px;
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    li {
        font-size: 12px;
    }
`;

const ConnectorTag = styled.div`
    position: absolute;
    top: 12px;
    right: 12px;
    padding: 4px 12px;
    border-radius: 6px;
    background-color: ${ThemeColors.SURFACE_CONTAINER};
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const TagText = styled(Typography)`
    font-size: 11px;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

const ConfigContent = styled.div<{ hasFooterButton?: boolean }>`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: ${(props: { hasFooterButton?: boolean }) => props.hasFooterButton ? "hidden" : "auto"};
    padding: 0 16px ${(props: { hasFooterButton?: boolean }) => props.hasFooterButton ? "0" : "24px"} 16px;
    min-height: 0;
`;

const FormContainer = styled.div<{}>`
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
`;

const StatusContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    padding: 40px;
`;

const StatusCard = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;

    & > svg {
        font-size: 32px;
        width: 32px;
        height: 32px;
        color: ${ThemeColors.ON_SURFACE};
    }
`;

const StatusText = styled(Typography)`
    margin-top: 16px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-size: 14px;
    text-align: center;
`;

enum PullingStatus {
    FETCHING = "fetching",
    PULLING = "pulling",
    SUCCESS = "success",
    ERROR = "error",
}

enum SavingFormStatus {
    SAVING = "saving",
    SUCCESS = "success",
    ERROR = "error",
}

export interface ConnectionConfigurationPopupProps {
    selectedConnector: AvailableNode;
    fileName: string;
    target?: LinePosition;
    onClose: (parent?: ParentPopupData) => void;
    onBack: () => void;
    filteredCategories?: Category[];
    customValidator?: (fieldKey: string, value: any, allValues: FormValues) => string | undefined;
    overrideFlowNode?: (node: FlowNode) => FlowNode;
}

export function ConnectionConfigurationPopup(props: ConnectionConfigurationPopupProps) {
    const { selectedConnector, onClose, onBack } = props;

    return (
        <>
            <PopupOverlay sx={{ background: `${ThemeColors.SURFACE_CONTAINER}`, opacity: `0.5` }} />
            <PopupContainer>
                <ConfigHeader>
                    <BackButton appearance="icon" onClick={onBack}>
                        <Codicon name="chevron-left" />
                    </BackButton>
                    <ConfigTitleContainer>
                        <PopupTitle variant="h2">Configure {selectedConnector.metadata.label}</PopupTitle>
                        <ConfigSubtitle variant="body2">
                            Configure connection settings for this connector
                        </ConfigSubtitle>
                    </ConfigTitleContainer>
                    <CloseButton appearance="icon" onClick={() => onClose()}>
                        <Codicon name="close" />
                    </CloseButton>
                </ConfigHeader>

                <ConnectionConfigurationForm {...props} />
            </PopupContainer>
        </>
    );
}

export interface ConnectionConfigurationFormProps extends Omit<ConnectionConfigurationPopupProps, 'onBack'> {
    loading?: boolean;
    devantExpressionEditor?: ExpressionEditorDevantProps;
    onSaveConfiguredConnection?: (node: FlowNode) => Promise<void>;
    footerActionButton?: boolean;
}

export function ConnectionConfigurationForm(props: ConnectionConfigurationFormProps) {
    const {
        selectedConnector,
        fileName,
        target,
        onClose,
        filteredCategories = [],
        loading,
        devantExpressionEditor,
        customValidator,
        overrideFlowNode,
        onSaveConfiguredConnection,
        footerActionButton,
    } = props;
    const { rpcClient } = useRpcContext();

    const [pullingStatus, setPullingStatus] = useState<PullingStatus | undefined>(undefined);
    const [savingFormStatus, setSavingFormStatus] = useState<SavingFormStatus | undefined>(undefined);
    const selectedNodeRef = useRef<FlowNode>();
    const [updatedExpressionField, setUpdatedExpressionField] = useState<ExpressionFormField>(undefined);

    useEffect(() => {
        // Fetch node template when component mounts

        let clearPullingStatusTimer: ReturnType<typeof setTimeout> | null = null;

        const fetchNodeTemplate = async () => {
            if (!selectedConnector.codedata) {
                console.error(">>> Error selecting connector. No codedata found");
                return;
            }

            let shouldClearPullingStatus = true;
            try {
                let timer: ReturnType<typeof setTimeout> | null = null;
                let didTimeout = false;

                // Set status to FETCHING before starting
                setPullingStatus(PullingStatus.FETCHING);
                selectedNodeRef.current = undefined;

                // Start a timer for 3 seconds
                const timeoutPromise = new Promise<void>((resolve) => {
                    timer = setTimeout(() => {
                        didTimeout = true;
                        setPullingStatus(PullingStatus.PULLING);
                        resolve();
                    }, 3000);
                });

                // Start the request
                const nodeTemplatePromise = rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                    position: target || null,
                    filePath: fileName,
                    id: selectedConnector.codedata,
                });

                // Wait for either the timer or the request to finish
                let response = await Promise.race([
                    nodeTemplatePromise.then((res) => {
                        if (timer) {
                            clearTimeout(timer);
                            timer = null;
                        }
                        return res;
                    }),
                    timeoutPromise.then(() => nodeTemplatePromise),
                ]);

                if (didTimeout) {
                    // If it timed out, set status to SUCCESS
                    setPullingStatus(PullingStatus.SUCCESS);
                }

                console.log(">>> FlowNode template", response);
                if (overrideFlowNode) {
                    response.flowNode = overrideFlowNode(response.flowNode);
                }
                selectedNodeRef.current = response.flowNode;
                const formProperties = getFormProperties(response.flowNode);
                console.log(">>> Form properties", formProperties);

                if (Object.keys(formProperties).length === 0) {
                    // add node to source code
                    handleOnFormSubmit(response.flowNode);
                    return;
                }
            } catch (error) {
                console.error(">>> Error selecting connector", error);
                shouldClearPullingStatus = false;
                setPullingStatus(PullingStatus.ERROR);
            } finally {
                // After few seconds, set status to undefined
                if (shouldClearPullingStatus) {
                    clearPullingStatusTimer = setTimeout(() => {
                        setPullingStatus(undefined);
                    }, 2000);
                }
            }
        };

        fetchNodeTemplate();

        return () => {
            if (clearPullingStatusTimer) {
                clearTimeout(clearPullingStatusTimer);
            }
        }
    }, [selectedConnector, fileName, target, rpcClient]);

    const handleOnFormSubmit = async (node: FlowNode, _editorConfig?: EditorConfig, options?: FormSubmitOptions) => {
        console.log(">>> on form submit", node);
        if (selectedNodeRef.current) {
            setSavingFormStatus(SavingFormStatus.SAVING);
            if (onSaveConfiguredConnection) {
                try {
                    await onSaveConfiguredConnection(node);
                } catch (error) {
                    console.error(">>> Error updating agent definition connection", error);
                    setSavingFormStatus(SavingFormStatus.ERROR);
                }
                return;
            }
            const visualizerLocation = await rpcClient.getVisualizerLocation();
            let connectionsFilePath = visualizerLocation.documentUri || visualizerLocation.projectPath;

            if (node.codedata.isGenerated && !connectionsFilePath.endsWith(".bal")) {
                connectionsFilePath = Utils.joinPath(URI.file(connectionsFilePath), "main.bal").fsPath;
            }

            if (connectionsFilePath === "") {
                console.error(">>> Error updating source code. No source file found");
                setSavingFormStatus(SavingFormStatus.ERROR);
                return;
            }

            // node property scope is local. then use local file path and line position
            if ((node.properties?.scope?.value as string)?.toLowerCase() === "local") {
                node.codedata.lineRange = {
                    fileName: visualizerLocation.documentUri,
                    startLine: target,
                    endLine: target,
                };
            }

            // Check if the node is a connector
            const isConnector = node.codedata.node === "NEW_CONNECTION";

            rpcClient
                .getBIDiagramRpcClient()
                .getSourceCode({
                    filePath: connectionsFilePath,
                    flowNode: node,
                    isConnector: isConnector,
                })
                .then((response) => {
                    console.log(">>> Updated source code", response);
                    if (!isConnector) {
                        if (options?.postUpdateCallBack) {
                            options.postUpdateCallBack();
                        }
                        return;
                    }
                    if (response.artifacts.length > 0) {
                        const newConnection = response.artifacts.find((artifact) => artifact.isNew);
                        onClose({ recentIdentifier: newConnection.name, artifactType: DIRECTORY_MAP.CONNECTION });
                    } else {
                        console.error(">>> Error updating source code", response);
                        setSavingFormStatus(SavingFormStatus.ERROR);
                    }
                })
                .catch((error) => {
                    console.error(">>> Error updating source code", error);
                    setSavingFormStatus(SavingFormStatus.ERROR);
                });
        }
    };

    const handleResetUpdatedExpressionField = () => {
        setUpdatedExpressionField(undefined);
    };

    // Remove description property from node before passing to form
    // since it's already shown in the connector info card
    const getNodeForForm = (node: FlowNode) => {
        const nodeWithoutDescription = cloneDeep(node);
        if (nodeWithoutDescription?.metadata?.description) {
            delete nodeWithoutDescription.metadata.description;
        }
        return nodeWithoutDescription;
    };

    const getConnectorTag = () => {
        if (selectedConnector.codedata?.org === "ballerinax") {
            return "Standard";
        }
        const isStandard = filteredCategories.some(
            (cat) =>
                cat.metadata.label !== "CurrentOrg" &&
                cat.items?.some((item) => (item as AvailableNode).codedata?.id === selectedConnector.codedata?.id)
        );
        return isStandard ? "Standard" : "Organization";
    };

    return (
        <>
            <ConnectorInfoCard>
                <ConnectorInfoIcon>
                    {selectedConnector.metadata.icon ? (
                        <StyledConnectorIcon>
                            <ConnectorIcon url={selectedConnector.metadata.icon} />
                        </StyledConnectorIcon>
                    ) : (
                        <StyledCodicon name="package" />
                    )}
                </ConnectorInfoIcon>
                <ConnectorInfoContent>
                    <ConnectorInfoName>{selectedConnector.metadata.label}</ConnectorInfoName>
                    <ConnectorInfoDescription description={selectedConnector.metadata.description || ""} />
                </ConnectorInfoContent>
                <ConnectorTag>
                    <TagText variant="caption">{getConnectorTag()}</TagText>
                </ConnectorTag>
            </ConnectorInfoCard>

            <ConfigContent hasFooterButton={!pullingStatus && !!selectedNodeRef.current}>
                {pullingStatus && (
                    <StatusContainer>
                        {pullingStatus === PullingStatus.FETCHING && (
                            <RelativeLoader message="Loading connector package..." />
                        )}
                        {pullingStatus === PullingStatus.PULLING && (
                            <StatusCard>
                                <DownloadIcon color="var(--vscode-progressBar-background)" />
                                <StatusText variant="body2">
                                    Please wait while the connector is being pulled.
                                </StatusText>
                            </StatusCard>
                        )}
                        {pullingStatus === PullingStatus.SUCCESS && (
                            <StatusCard>
                                <Icon
                                    name="bi-success"
                                    sx={{
                                        color: ThemeColors.PRIMARY,
                                        fontSize: "28px",
                                        width: "28px",
                                        height: "28px",
                                    }}
                                />
                                <StatusText variant="body2">Connector pulled successfully.</StatusText>
                            </StatusCard>
                        )}
                        {pullingStatus === PullingStatus.ERROR && (
                            <StatusCard>
                                <Icon
                                    name="bi-error"
                                    sx={{
                                        color: ThemeColors.ERROR,
                                        fontSize: "28px",
                                        width: "28px",
                                        height: "28px",
                                    }}
                                />
                                <StatusText variant="body2">
                                    Failed to pull the connector. Please try again.
                                </StatusText>
                            </StatusCard>
                        )}
                    </StatusContainer>
                )}
                {!pullingStatus && selectedNodeRef.current && (
                    <>
                        <FormContainer>
                            <ConnectionConfigView
                                fileName={fileName}
                                submitText={loading || savingFormStatus === SavingFormStatus.SAVING ? "Saving..." : "Save Connection"}
                                isSaving={loading || savingFormStatus === SavingFormStatus.SAVING}
                                selectedNode={getNodeForForm(selectedNodeRef.current)}
                                onSubmit={handleOnFormSubmit}
                                updatedExpressionField={updatedExpressionField}
                                resetUpdatedExpressionField={handleResetUpdatedExpressionField}
                                isPullingConnector={savingFormStatus === SavingFormStatus.SAVING}
                                footerActionButton={footerActionButton ?? true}
                                devantExpressionEditor={devantExpressionEditor}
                                customValidator={customValidator}
                            />
                        </FormContainer>
                    </>
                )}
            </ConfigContent>
        </>
    );
}

export default ConnectionConfigurationPopup;
