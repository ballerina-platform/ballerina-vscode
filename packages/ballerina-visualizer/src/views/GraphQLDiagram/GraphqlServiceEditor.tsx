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

import {
    DIRECTORY_MAP,
    EVENT_TYPE,
    FunctionModel,
    LineRange,
    MACHINE_VIEW,
    ProjectStructureArtifactResponse,
    PropertyModel,
    ServiceModel,
    FunctionModelResponse,
    STModification,
    removeStatement,
    isSamePath,
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import {
    Button,
    Codicon,
    Divider,
    Dropdown,
    Icon,
    LinkButton,
    ProgressRing,
    ThemeColors,
    Typography,
    ViewHeader,
} from "@wso2/ui-toolkit";
import React, { useEffect, useState } from "react";
import { LoadingContainer } from "../styles";
import styled from "@emotion/styled";
import { OperationAccordion } from "./OperationAccordian";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { PanelContainer } from "@wso2/ballerina-side-panel";
import { OperationForm } from "./OperationForm";
import { NodePosition } from "../BI/ServiceDesigner/components/TypeBrowser/TypeBrowser";
import { applyModifications } from "../../utils/utils";

const InfoContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 0 15px 15px 15px;
`;

const InfoSection = styled.div`
    display: flex;
    align-items: center;
`;

const ServiceContainer = styled.div`
    padding: 10px;
    flex: 1;
    overflow-y: auto;
    max-height: calc(100vh - 80px);
`;

const OperationContainer = styled.div`
    max-height: 300px;
    overflow-y: scroll;
`;

const GraphqlContainer = styled.div`
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;
    height: 100%;
    background-color: ${ThemeColors.SURFACE_BRIGHT};
    box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
`;

const TopBar = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const Title = styled.div`
    font-size: 14px;
    font-family: GilmerBold;
    text-wrap: nowrap;
    &:first {
        margin-top: 0;
    }
`;

const OperationHeader = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 10px;
`;
const StyledButton = styled(Button)`
    border-radius: 5px;
`;

const SidePanelTitleContainer = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--vscode-panel-border);
    font-size: 16px;
    padding: 20px 10px;
    font-family: GilmerBold;
    color: var(--vscode-editor-foreground);
    background-color: ${ThemeColors.SURFACE_BRIGHT};
`;

const OperationCard = styled.div`
    border: 1px solid ${ThemeColors.OUTLINE_VARIANT};
    border-radius: 6px;
    margin: 8px 0;
    padding: 8px;
`;

const OperationSection = styled.div`
    margin: 16px 0;
`;

const EmptyStateText = styled(Typography)`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    font-family: GilmerRegular;
    font-size: 12px;
    margin: 0px;
    text-align: center;
`;

const EmptyStateContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px;
`;

const EmptyStateSubText = styled(Typography)`
    font-size: 10px;
    margin: 4px;
    font-family: GilmerRegular;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;


type FunctionTemapltes = {
    query: FunctionModel;
    mutation: FunctionModel;
    subscription: FunctionModel;
};

interface GraphqlServiceEditorProps {
    filePath: string;
    lineRange: LineRange;
    onClose: () => void;
    serviceIdentifier: string;
}

export function GraphqlServiceEditor(props: GraphqlServiceEditorProps) {
    console.log("===GraphqlServiceEditor Props: ", props);
    const { filePath, lineRange, onClose, serviceIdentifier } = props;
    const { rpcClient } = useRpcContext();

    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [serviceModel, setServiceModel] = useState<ServiceModel>(undefined);
    const [projectListeners, setProjectListeners] = useState<ProjectStructureArtifactResponse[]>([]);
    const [functionModel, setFunctionModel] = useState<FunctionModel>(undefined);
    // const [showForm, setShowForm] = useState<boolean>(false);
    const [isNewForm, setIsNewForm] = useState<boolean>(false);
    const [isEdit, setIsEdit] = useState<boolean>(false);
    const [functionTemplates, setFunctionTemplates] = useState<FunctionTemapltes>({
        query: undefined,
        mutation: undefined,
        subscription: undefined,
    });

    // Depend on the range's values, not the object: the parent builds `lineRange` inline, so a new
    // object arrives on every one of its renders and would refetch the model each time.
    useEffect(() => {
        fetchServiceModel();
    }, [
        filePath,
        lineRange?.startLine?.line,
        lineRange?.startLine?.offset,
        lineRange?.endLine?.line,
        lineRange?.endLine?.offset,
    ]);

    useEffect(() => {
        // Fetch all templates on mount
        const fetchTemplates = async () => {
            const [queryModel, mutationModel, subscriptionModel] = await Promise.all([
                getFunctionModel("query"),
                getFunctionModel("mutation"),
                getFunctionModel("subscription"),
            ]);

            setFunctionTemplates({
                query: queryModel,
                mutation: mutationModel,
                subscription: subscriptionModel,
            });
        };

        fetchTemplates();
    }, []);

    const getFunctionModel = async (type: string) => {
        const response: FunctionModelResponse = await rpcClient.getServiceDesignerRpcClient().getFunctionModel({
            type: "graphql",
            functionName: type,
        });

        return response?.function;
    };

    const fetchServiceModel = async (newFilePath?: string, linePosition?: NodePosition) => {
        const reqLineRange: LineRange = linePosition
            ? {
                startLine: {
                    line: linePosition.startLine,
                    offset: linePosition.startColumn,
                },
                endLine: {
                    line: linePosition.endLine,
                    offset: linePosition.endColumn,
                },
            }
            : lineRange;

        const reqFilePath = newFilePath ? newFilePath : filePath;

        try {
            const res = await rpcClient.getServiceDesignerRpcClient().getServiceModelFromCode({
                filePath: reqFilePath,
                codedata: {
                    lineRange: reqLineRange,
                    // Name the service being refreshed, so the server's stale-range recovery cannot
                    // answer with a different service that has come to enclose this range. Sent back
                    // exactly as the server reported it; absent on the first fetch, whose range is
                    // the one the panel was opened with and so is not stale.
                    originalName: serviceModel?.properties?.basePath?.value,
                },
            });
            console.log("Service Model: ", res.service);
            // No service means the one this panel was opened on is gone. Clear rather than keep
            // operations whose ranges point at nothing - onDeleteFunction edits at
            // `model.codedata.lineRange`, and a stale one would delete the wrong text.
            setServiceModel(res.service);
        } catch (error) {
            // The request itself failed, which says nothing about whether the service is still
            // there. Keep the model we have rather than rejecting into nothing: nothing awaits
            // this call, so a rejection escaping here would take down the webview.
            console.error("Error fetching the service model:", error);
        }
        await getProjectListeners();
    };

    const getProjectListeners = async () => {
        try {
            const location = await rpcClient.getVisualizerLocation();
            const res = await rpcClient.getBIDiagramRpcClient().getProjectStructure();
            const project = res.projects.find(project => isSamePath(project.projectPath, location.projectPath));
            const listeners = project?.directoryMap[DIRECTORY_MAP.LISTENER];
            if (listeners?.length > 0) {
                setProjectListeners(listeners);
            }
        } catch (error) {
            console.error("Error fetching the project listeners:", error);
        }
    };


    const handleServiceEdit = async () => {
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIServiceConfigView,
                position: {
                    startLine: lineRange?.startLine?.line,
                    startColumn: lineRange?.startLine?.offset,
                    endLine: lineRange?.endLine?.line,
                    endColumn: lineRange?.endLine?.offset,
                },
                documentUri: filePath,
            },
        });
    };

    const findIcon = (label: string) => {
        label = label.toLowerCase();
        switch (true) {
            case label.includes("listener"):
                return "bell";
            case label.includes("path"):
                return "link";
            default:
                return "info";
        }
    };

    const handleOpenListener = (value: string) => {
        const listenerValue = projectListeners.find((listener) => listener.name === value);
        if (listenerValue) {
            rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    view: MACHINE_VIEW.BIListenerConfigView,
                    position: listenerValue.position,
                    documentUri: listenerValue.path,
                },
            });
        }
    };

    const getAttributeComponent = (component: PropertyModel) => {
        const label = component.metadata.label.toLowerCase();
        switch (true) {
            case label.includes("listener"):
                return component.values?.length > 0 ? (
                    component.values.map((item, index) => (
                        <LinkButton
                            sx={{ fontSize: 12, padding: 8, gap: 4 }}
                            key={`${index}-btn`}
                            onClick={() => handleOpenListener(item)}
                        >
                            {item}
                        </LinkButton>
                    ))
                ) : (
                    <LinkButton
                        sx={{ fontSize: 12, padding: 8, gap: 4 }}
                        onClick={() => handleOpenListener(component.value)}
                    >
                        {component.value}
                    </LinkButton>
                );
            case label.includes("path"):
                return component.value;
            default:
                return component.value;
        }
    };

    const goToSource = (resource: FunctionModel) => {
        // rpcClient.getCommonRpcClient().goToSource({ position: position });
    };

    const onEditOperation = (currentFun: FunctionModel) => {
        // Create a copy of the resource to avoid modifying the original
        const currentFuncModel = {
            ...currentFun,
            parameters: currentFun.parameters.map((param) => ({
                ...param,
                type: {
                    ...param.type,
                    value: param.type.value || "",
                    types: param.type.types || [{fieldType: "TYPE", selected: false}],
                    isType: param.type.isType !== undefined ? param.type.isType : true,
                },
                name: {
                    ...param.name,
                    value: param.name.value || "",
                    types: param.name.types || [{fieldType: "IDENTIFIER", selected: false}],
                    isType: param.name.isType !== undefined ? param.name.isType : false,
                },
                defaultValue: {
                    ...(param.defaultValue as PropertyModel),
                    value: (param.defaultValue as PropertyModel)?.value || "",
                    types: (param.defaultValue as PropertyModel)?.types || [{fieldType: "EXPRESSION", selected: false}],
                    isType: (param.defaultValue as PropertyModel)?.isType !== undefined ? (param.defaultValue as PropertyModel).isType : false,
                },
            })),
        };
        setFunctionModel(currentFuncModel);
        setIsEdit(true);
        // setShowForm(true);
    };

    const onDeleteFunction = async (model: FunctionModel) => {
        const targetPosition: NodePosition = {
            startLine: model?.codedata?.lineRange?.startLine.line,
            startColumn: model?.codedata.lineRange?.startLine?.offset,
            endLine: model?.codedata?.lineRange?.endLine?.line,
            endColumn: model?.codedata?.lineRange?.endLine?.offset,
        };
        const deleteAction: STModification = removeStatement(targetPosition);
        try {
            await applyModifications(rpcClient, [deleteAction], filePath);
            // The deletion shortened the service, so the range this panel holds now ends past where
            // the service does. The language server resolves that back to the service that starts on
            // the same line, so refreshing with it is safe.
            await fetchServiceModel();
        } catch (error) {
            // Nothing awaits this handler: the confirmation popup calls it and moves on, so an
            // error escaping here surfaces as an unhandled rejection instead of a message.
            console.error("Error deleting the operation:", error);
        }
    };

    const onFunctionImplement = async (func: FunctionModel) => {
        const lineRange: LineRange = func.codedata.lineRange;
        const nodePosition: NodePosition = {
            startLine: lineRange.startLine.line,
            startColumn: lineRange.startLine.offset,
            endLine: lineRange.endLine.line,
            endColumn: lineRange.endLine.offset,
        };
        await rpcClient
            .getVisualizerRpcClient()
            .openView({ type: EVENT_TYPE.OPEN_VIEW, location: { position: nodePosition, documentUri: filePath } });
    };

    const handleNewQueryOperation = () => {
        const queryModel = JSON.parse(JSON.stringify(functionTemplates.query));
        queryModel.kind = "QUERY";
        setFunctionModel(queryModel);
        setIsNewForm(true);
    };

    const handleNewMutationOperation = () => {
        const mutationModel = JSON.parse(JSON.stringify(functionTemplates.mutation));
        mutationModel.kind = "MUTATION";
        setFunctionModel(mutationModel);
        setIsNewForm(true);
    };

    const handleNewSubscriptionOperation = () => {
        const subscriptionModel = JSON.parse(JSON.stringify(functionTemplates.subscription));
        subscriptionModel.kind = "SUBSCRIPTION";
        setFunctionModel(subscriptionModel);
        setIsNewForm(true);
    };

    const renderOperations = () => {
        const categories: { query: FunctionModel[]; mutation: FunctionModel[]; subscription: FunctionModel[] } = {
            query: [],
            mutation: [],
            subscription: [],
        };

        serviceModel?.functions.forEach((operation) => {
            switch (operation.kind) {
                case "QUERY":
                    categories.query.push(operation);
                    break;
                case "MUTATION":
                    categories.mutation.push(operation);
                    break;
                case "SUBSCRIPTION":
                    categories.subscription.push(operation);
                    break;
                default:
                    break;
            }
        });

        return (
            <>
                <OperationSection>
                    <OperationCard>
                        <OperationHeader>
                            <Title>Query</Title>
                            <Button appearance="icon" tooltip={"Add Field"} onClick={handleNewQueryOperation} data-testid="graphql-add-query-btn">
                                <Codicon name="add" />
                            </Button>
                        </OperationHeader>
                        <OperationContainer>
                            {categories.query?.map((operation, index) => (
                                <OperationAccordion
                                    key={index}
                                    functionModel={operation}
                                    goToSource={goToSource}
                                    onEditFunction={onEditOperation}
                                    onDeleteFunction={onDeleteFunction}
                                    onFunctionImplement={onFunctionImplement}
                                />
                            ))}
                        </OperationContainer>
                        {categories.query?.length === 0 && (
                            <EmptyStateContainer>
                                <EmptyStateText>No Query fields defined</EmptyStateText>
                            </EmptyStateContainer>
                        )}
                    </OperationCard>
                </OperationSection>

                <OperationSection>
                    <OperationCard>
                        <OperationHeader>
                            <Title>Mutation</Title>
                            <Button
                                appearance="icon"
                                tooltip={"Add Field"}
                                onClick={handleNewMutationOperation}
                                data-testid="graphql-add-mutation-btn"
                            >
                                <Codicon name="add" />
                            </Button>
                        </OperationHeader>
                        <OperationContainer>
                            {categories.mutation?.map((operation, index) => (
                                <OperationAccordion
                                    key={index}
                                    functionModel={operation}
                                    goToSource={goToSource}
                                    onEditFunction={onEditOperation}
                                    onDeleteFunction={onDeleteFunction}
                                    onFunctionImplement={onFunctionImplement}
                                />
                            ))}
                        </OperationContainer>
                        {categories.mutation?.length === 0 && (
                            <EmptyStateContainer>
                                <EmptyStateText>No Mutation fields defined</EmptyStateText>
                            </EmptyStateContainer>
                        )}
                    </OperationCard>
                </OperationSection>

                <OperationSection>
                    <OperationCard>
                        <OperationHeader>
                            <Title>Subscription</Title>
                            <Button
                                appearance="icon"
                                tooltip={"Add Field"}
                                onClick={handleNewSubscriptionOperation}
                                data-testid="graphql-add-subscription-btn"
                            >
                                <Codicon name="add" />
                            </Button>
                        </OperationHeader>
                        <OperationContainer>
                            {categories.subscription?.map((operation, index) => (
                                <OperationAccordion
                                    key={index}
                                    functionModel={operation}
                                    goToSource={goToSource}
                                    onEditFunction={onEditOperation}
                                    onDeleteFunction={onDeleteFunction}
                                    onFunctionImplement={onFunctionImplement}
                                />
                            ))}
                        </OperationContainer>
                        {categories.subscription?.length === 0 && (
                            <EmptyStateContainer>
                                <EmptyStateText>No Subscription fields defined</EmptyStateText>
                            </EmptyStateContainer>
                        )}
                    </OperationCard>
                </OperationSection>
            </>
        );
    };

    const handleNewFunctionClose = () => {
        setIsNewForm(false);
        setFunctionModel(undefined);
    };

    const handleEditFunctionClose = () => {
        setIsEdit(false);
        setFunctionModel(undefined);
    };

    const handleFunctionSubmit = async (updatedModel: FunctionModel) => {
        setIsSaving(true);
        try {
            let artifacts;
            if (isEdit) {
                artifacts = await rpcClient.getServiceDesignerRpcClient().updateResourceSourceCode({
                    filePath,
                    codedata: {
                        lineRange: lineRange,
                    },
                    function: updatedModel,
                    artifactType: DIRECTORY_MAP.SERVICE
                });
            } else {
                artifacts = await rpcClient.getServiceDesignerRpcClient().addFunctionSourceCode({
                    filePath,
                    codedata: {
                        lineRange: lineRange,
                    },
                    function: updatedModel,
                    artifactType: DIRECTORY_MAP.SERVICE
                });
            }

            const serviceArtifact = artifacts.artifacts.find(artifact => artifact.name === serviceIdentifier);
            // Refresh the service model
            fetchServiceModel(serviceArtifact?.path, serviceArtifact?.position);

            if (isEdit) {
                setIsEdit(false);
            } else {
                setIsNewForm(false);
            }
            setFunctionModel(undefined);
        } catch (error) {
            console.error("Error handling submit:", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            {!isNewForm && !isEdit && (
                <PanelContainer title={"GraphQL Operations"} show={true} onClose={onClose} onBack={onClose} width={400}>
                    <ServiceContainer>
                        {!serviceModel && (
                            <LoadingContainer>
                                <ProgressRing />
                            </LoadingContainer>
                        )}
                        {serviceModel && renderOperations()}
                    </ServiceContainer>
                </PanelContainer>
            )}
            {functionModel && (isNewForm || isEdit) && (
                <PanelContainer
                    title={isNewForm ? "Add Field" : "Edit Field"}
                    show={true}
                    onBack={isNewForm ? handleNewFunctionClose : handleEditFunctionClose}
                    onClose={isNewForm ? handleNewFunctionClose : handleEditFunctionClose}
                    width={400}
                >
                    <OperationForm
                        model={functionModel}
                        filePath={filePath}
                        lineRange={lineRange}
                        isGraphqlView={true}
                        isSaving={isSaving}
                        onSave={handleFunctionSubmit}
                        onClose={isNewForm ? handleNewFunctionClose : handleEditFunctionClose}
                    />
                </PanelContainer>
            )}
        </>
    );
}
