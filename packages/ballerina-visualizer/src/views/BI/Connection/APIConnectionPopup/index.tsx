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

import React, { useMemo, useState } from "react";
import styled from "@emotion/styled";
import { Button, Codicon, Dropdown, Stepper, TextField, ThemeColors, Typography, Icon } from "@wso2/ui-toolkit";
import { AvailableNode, Category, EditorConfig, DIRECTORY_MAP, FlowNode, LinePosition, ParentPopupData } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { ExpressionFormField } from "@wso2/ballerina-side-panel";
import ConnectionConfigView from "../ConnectionConfigView";
import { FormSubmitOptions } from "../../FlowDiagram";
import { PopupOverlay, PopupContainer, PopupHeader, BackButton, HeaderTitleContainer, PopupTitle, PopupSubtitle, CloseButton } from "../styles";

const StepperContainer = styled.div`
    padding: 20px 32px 18px 32px;
    border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
`;

const ContentContainer = styled.div<{ hasFooterButton?: boolean }>`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: ${(props: { hasFooterButton?: boolean }) => props.hasFooterButton ? "hidden" : "auto"};
    padding: 24px 32px;
    padding-bottom: ${(props: { hasFooterButton?: boolean }) => props.hasFooterButton ? "0" : "24px"};
    min-height: 0;
`;

// The form owns its scrolling: the fields scroll inside FormBody and the action button sits below
// them as a sibling. A sticky footer inside the scrolling parent floats over the fields whenever
// the popup is shorter than the form (e.g. with the IDE's bottom panel open).
const FormLayout = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
`;

const FormBody = styled.div`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
`;

const FooterContainer = styled.div`
    flex-shrink: 0;
    padding-top: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
`;

const StepContent = styled.div<{ fillHeight?: boolean }>`
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 20px;
    ${(props: { fillHeight?: boolean }) => props.fillHeight && `
        flex: 1;
        min-height: 0;
        height: 100%;
    `}
`;

const SectionTitle = styled(Typography)`
    font-size: 16px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

const SectionSubtitle = styled(Typography)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin: 0;
`;

const FormSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 30px;
    background: transparent;
    border: none;
    padding: 0;
`;

const FormField = styled.div`
    display: flex;
    flex-direction: column;
`;

const UploadCard = styled.div<{ hasFile?: boolean; disabled?: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 18px;
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 14px;
    background: ${ThemeColors.SURFACE_DIM};
    cursor: ${(props: { hasFile?: boolean; disabled?: boolean }) => props.disabled ? "not-allowed" : "pointer"};
    transition: all 0.2s ease;

    ${(props: { hasFile?: boolean; disabled?: boolean }) => !props.disabled && `
        &:hover {
            border-color: ${ThemeColors.PRIMARY};
            background: ${ThemeColors.SURFACE_CONTAINER};
        }
    `}

    ${(props: { hasFile?: boolean; disabled?: boolean }) =>
        props.hasFile
            ? `
        border-color: ${ThemeColors.PRIMARY};
        background: ${ThemeColors.PRIMARY_CONTAINER};
    `
            : ""}
`;

const UploadIcon = styled.div`
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: ${ThemeColors.SURFACE_BRIGHT};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${ThemeColors.ON_SURFACE};
`;

const UploadText = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;

const UploadTitle = styled(Typography)`
    font-size: 14px;
    font-weight: 600;
    color: ${ThemeColors.ON_SURFACE};
    margin: 0;
`;

const UploadSubtitle = styled(Typography)`
    font-size: 12px;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    margin: 0;
`;

const ActionButton = styled(Button)`
    width: 100% !important;
    min-width: 0 !important;
    display: flex !important;
    justify-content: center;
    align-items: center;
`;

const StepHeader = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const ErrorContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    border-radius: 8px;
    background-color: ${ThemeColors.SURFACE_DIM};
    border: 1px solid ${ThemeColors.ERROR};
    margin-top: 16px;
`;

const ErrorHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const ErrorTitle = styled(Typography)`
    font-size: 16px;
    font-weight: 600;
    color: ${ThemeColors.ERROR};
    margin: 0;
`;

interface APIConnectionPopupProps {
    projectPath: string;
    fileName: string;
    target?: LinePosition;
    onClose?: (parent?: ParentPopupData) => void;
    onBack?: () => void;
}

export function APIConnectionPopup(props: APIConnectionPopupProps) {
    const { fileName, target, onBack, onClose, projectPath } = props;
    const { rpcClient } = useRpcContext();
    
    const [currentStep, setCurrentStep] = useState(0);

    const [isSavingConnection, setIsSavingConnection] = useState<boolean>(false);
    const [updatedExpressionField, setUpdatedExpressionField] = useState<ExpressionFormField>(undefined);
    const [selectedFlowNode, setSelectedFlowNode] = useState<FlowNode | undefined>(undefined);

    const steps = useMemo(() => ["Import API Specification", "Create Connection"], []);

    const handleOnFormSubmit = async (node: FlowNode, _editorConfig?: EditorConfig, options?: FormSubmitOptions) => {
        console.log(">>> on form submit", node);
        if (selectedFlowNode) {
            setIsSavingConnection(true);
            const visualizerLocation = await rpcClient.getVisualizerLocation();
            let connectionsFilePath = visualizerLocation.documentUri || visualizerLocation.projectPath;

            if (node.codedata.isGenerated && !connectionsFilePath.endsWith(".bal")) {
                connectionsFilePath += "/main.bal";
            }

            if (connectionsFilePath === "") {
                console.error(">>> Error updating source code. No source file found");
                setIsSavingConnection(false);
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
                    if (response.artifacts.length > 0) {
                        setIsSavingConnection(false);
                        const newConnection = response.artifacts.find((artifact) => artifact.isNew);
                        onClose?.({ recentIdentifier: newConnection?.name, artifactType: DIRECTORY_MAP.CONNECTION });
                    } else {
                        console.error(">>> Error updating source code", response);
                        setIsSavingConnection(false);
                    }
                })
                .catch((error) => {
                    console.error(">>> Error saving connection", error);
                }).finally(() => {
                    setIsSavingConnection(false);
                });
        }
    };

    const renderStepper = () => {
        return (
            <>
                <StepperContainer>
                    <Stepper steps={steps} currentStep={currentStep} alignment="center" />
                </StepperContainer>
            </>
        );
    };

    const renderConnectionStep = () => {
        if (selectedFlowNode) {
            return (
                <StepContent fillHeight={true}>
                    <div>
                        <SectionTitle variant="h3">Connection Details</SectionTitle>
                        <SectionSubtitle variant="body2">
                            Configure connection settings
                        </SectionSubtitle>
                    </div>
                    <ConnectionConfigView
                        fileName={fileName}
                        submitText={isSavingConnection ? "Creating..." : "Save Connection"}
                        isSaving={isSavingConnection}
                        selectedNode={selectedFlowNode}
                        onSubmit={handleOnFormSubmit}
                        updatedExpressionField={updatedExpressionField}
                        resetUpdatedExpressionField={() => setUpdatedExpressionField(undefined)}
                        isPullingConnector={isSavingConnection}
                        footerActionButton={true}
                    />
                </StepContent>
            );
        }
        return (
            <StepContent>
                <FormSection>
                    <Typography variant="body2" sx={{ color: ThemeColors.ON_SURFACE_VARIANT }}>
                        Loading connector configuration...
                    </Typography>
                </FormSection>
            </StepContent>
        );
    };

    const renderStepContent = () => {
        if (currentStep === 0) {
            return (
                <APIConnectionForm
                    fileName={fileName}
                    target={target}
                    projectPath={projectPath}
                    onSave={(_, flowNode) => {
                        setSelectedFlowNode(flowNode);
                        setCurrentStep(1);
                    }}
                />
            );
        }
        return renderConnectionStep();
    };

    return (
        <>
            <PopupOverlay sx={{ background: `${ThemeColors.SURFACE_CONTAINER}`, opacity: `0.5` }} />
            <PopupContainer>
                <PopupHeader>
                    <BackButton appearance="icon" onClick={onBack}>
                        <Codicon name="chevron-left" />
                    </BackButton>
                    <HeaderTitleContainer>
                        <PopupTitle variant="h2">Connect via API Specification</PopupTitle>
                        <PopupSubtitle variant="body2">Import an API specification file to create a connection</PopupSubtitle>
                    </HeaderTitleContainer>
                    <CloseButton appearance="icon" onClick={() => onClose?.()}>
                        <Codicon name="close" />
                    </CloseButton>
                </PopupHeader>
                {renderStepper()}
                <ContentContainer hasFooterButton={currentStep === 1}>{renderStepContent()}</ContentContainer>
            </PopupContainer>
        </>
    );
}

interface APIConnectionFormProps {
    onSave: (availableNode: AvailableNode, selectedFlowNode: FlowNode, type: string, name: string, filePath: string) => void;
    projectPath: string;
    fileName: string;
    target?: LinePosition;
    apiSpecOptions?: { id: string; value: string; content: string; }[];
    disabled?: boolean;
    initialName?: string;
    initialFilePath?: string;
    actionButtonText?: string;
    availableNode?: AvailableNode;
}

const defaultOptions = [
    { id: "openapi", value: "OpenAPI", content: "OpenAPI" },
    { id: "wsdl", value: "WSDL", content: "WSDL" },
]

export function APIConnectionForm(props: APIConnectionFormProps) {
    const { onSave, fileName, target, projectPath, apiSpecOptions = defaultOptions, disabled, initialName = "", initialFilePath = "", actionButtonText = "Save Connector", availableNode } = props;
    const { rpcClient } = useRpcContext();

    const [specType, setSpecType] = useState<string>("OpenAPI");
    const [selectedFilePath, setSelectedFilePath] = useState<string>(initialFilePath);
    const [connectorName, setConnectorName] = useState<string>(initialName);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [isSavingConnector, setIsSavingConnector] = useState<boolean>(false);

    const supportedFileFormats = useMemo(() => {
        const isOpenApi = specType.toLowerCase() === "openapi";
        return isOpenApi ? ".yaml, .yml, .json" : ".wsdl";
    }, [specType]);

    const handleFileSelect = async () => {
        if (!rpcClient) {
            return;
        }
        const projectDirectory = await rpcClient.getCommonRpcClient().selectFileOrDirPath({ isFile: true });
        if (projectDirectory.path) {
            setSelectedFilePath(projectDirectory.path);
            setConnectionError(null);
        }
    };

    const handleOnGenerateSubmit = async (specFilePath: string, module: string, specType: string) => {
        if (!rpcClient) {
            return { success: false, errorMessage: "RPC client not available" };
        }

        const isOpenApi = specType.toLowerCase() === "openapi";

        if (isOpenApi) {
            const response = await rpcClient.getBIDiagramRpcClient().generateOpenApiClient({
                openApiContractPath: specFilePath,
                projectPath: projectPath,
                module: module,
            });
            return {
                success: !response.errorMessage,
                errorMessage: response.errorMessage,
            };
        } else {
            // WSDL generation
            const response = await rpcClient.getConnectorWizardRpcClient().generateWSDLApiClient({
                wsdlFilePath: specFilePath,
                projectPath: projectPath,
                module: module,
            });
            return {
                success: !response.errorMsg,
                errorMessage: response.errorMsg,
            };
        }
    };

    const findConnectorByModule = (categories: Category[], moduleName: string): AvailableNode | null => {
        for (const category of categories) {
            if (category.items) {
                for (const item of category.items) {
                    if ("codedata" in item) {
                        const availableNode = item as AvailableNode;
                        if (availableNode.codedata?.module === moduleName) {
                            return availableNode;
                        }
                    }
                }
            }
        }
        return null;
    };

    const handleSaveConnector = async () => {
        if (!selectedFilePath || !connectorName || !rpcClient) {
            return;
        }
        setIsSavingConnector(true);
        setConnectionError(null);
        const generateResponse = await handleOnGenerateSubmit(selectedFilePath, connectorName, specType);

        // Only proceed if there's no error message
        if (generateResponse?.success) {
            try {
                // Small delay to ensure the connector is available
                await new Promise(resolve => setTimeout(resolve, 1000));

                const defaultPosition = target || { line: 0, offset: 0 };

                // Helper function to search for connectors
                const searchForConnector = async () => {
                    const searchResponse = await rpcClient.getBIDiagramRpcClient().search({
                        position: {
                            startLine: defaultPosition,
                            endLine: defaultPosition,
                        },
                        filePath: fileName,
                        queryMap: {
                            limit: 60,
                            filterByCurrentOrg: false,
                        },
                        searchKind: "CONNECTOR",
                    });
                    return findConnectorByModule(searchResponse.categories, connectorName);
                };

                // Find the connector we just created
                let createdConnector = await searchForConnector();

                // If connector not found, retry after 2 second
                if (!createdConnector) {
                    console.warn(">>> Connector not found on first attempt, retrying after 2 second...");
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    createdConnector = await searchForConnector();
                }

                if (createdConnector && createdConnector.codedata) {
                    // Get the flowNode template
                    const nodeTemplateResponse = await rpcClient.getBIDiagramRpcClient().getNodeTemplate({
                        position: target || null,
                        filePath: fileName,
                        id: createdConnector.codedata,
                    });
                    onSave(createdConnector, nodeTemplateResponse.flowNode, specType, connectorName, selectedFilePath);
                } else {
                    console.warn(">>> Created connector not found in search results");
                }
            } catch (error) {
                console.error(">>> Error finding created connector", error);
            }
        } else {
            console.error(">>> Error generating connector:", generateResponse?.errorMessage);
            const errorMessage = generateResponse?.errorMessage || "";
            if (errorMessage.toLowerCase().includes("module already exists")) {
                setConnectionError("A connector with this name already exists. Please use a different connector name.");
            } else {
                setConnectionError("Failed to create the connector. Please check your specification file and connector name.");
            }
        }
        setIsSavingConnector(false);
    };

    const renderErrorDisplay = () => {
        if (!connectionError) return null;

        return (
            <ErrorContainer>
                <ErrorHeader>
                    <Icon name="bi-error" sx={{ color: ThemeColors.ERROR, fontSize: '20px', width: '20px', height: '20px' }} />
                    <ErrorTitle variant="h4">Connector Creation Failed</ErrorTitle>
                </ErrorHeader>
                <Typography variant="body2">
                    {connectionError}
                </Typography>
            </ErrorContainer>
        );
    };

    return (
        <FormLayout>
            <FormBody data-testid="api-connection-form-body">
                <StepContent>
                    <StepHeader>
                        <Typography variant="h3" sx={{ color: ThemeColors.ON_SURFACE, marginBottom: "5px" }}>
                            Connector Configuration
                        </Typography>
                        <Typography variant="body2" sx={{ color: ThemeColors.ON_SURFACE_VARIANT }}>
                            Import API specification for the connector
                        </Typography>
                    </StepHeader>
                    {renderErrorDisplay()}
                    <FormSection>
                        <FormField>
                            <Dropdown
                                id="api-spec-type"
                                label="Specification Type"
                                items={apiSpecOptions}
                                value={specType}
                                disabled={disabled}
                                onValueChange={(value) => {
                                    setSpecType(value);
                                    setConnectionError(null);
                                }}
                            />
                        </FormField>
                        <FormField>
                            <Typography variant="body2" sx={{ color: ThemeColors.ON_SURFACE, marginBottom: "0px", fontSize: "13px", fontWeight: 500 }}>
                                Connector Name
                            </Typography>
                            <Typography variant="body2" sx={{ color: ThemeColors.ON_SURFACE_VARIANT, marginBottom: "8px", fontSize: "12px" }}>
                                Name of the connector module to be generated
                            </Typography>
                            <TextField
                                id="connector-name"
                                value={connectorName}
                                onTextChange={(value) => {
                                    setConnectorName(value);
                                    setConnectionError(null);
                                }}
                                placeholder="Enter connector name"
                                disabled={disabled}
                            />
                        </FormField>
                        <FormField>
                            <Typography variant="body2" sx={{ color: ThemeColors.ON_SURFACE, marginBottom: "8px", fontSize: "13px", fontWeight: 500 }}>
                                Import Specification File
                            </Typography>
                            <UploadCard
                                hasFile={!!selectedFilePath}
                                onClick={disabled ? undefined : handleFileSelect}
                                data-testid="api-spec-upload"
                                disabled={disabled}
                            >
                                <UploadIcon>
                                    <Codicon name="files" />
                                </UploadIcon>
                                <UploadText>
                                    <UploadTitle variant="body2">
                                        {selectedFilePath ? selectedFilePath : "Choose file to import"}
                                    </UploadTitle>
                                    <UploadSubtitle variant="body2">Supports {supportedFileFormats} files</UploadSubtitle>
                                </UploadText>
                            </UploadCard>
                        </FormField>
                    </FormSection>
                </StepContent>
            </FormBody>
            <FooterContainer>
                <ActionButton
                    appearance="primary"
                    disabled={!selectedFilePath || !connectorName || isSavingConnector || !!connectionError}
                    onClick={handleSaveConnector}
                    buttonSx={{ width: "100%", height: "35px" }}
                >
                    {isSavingConnector ? "Saving..." : actionButtonText}
                </ActionButton>
            </FooterContainer>
        </FormLayout>
    );

}

export default APIConnectionPopup;

