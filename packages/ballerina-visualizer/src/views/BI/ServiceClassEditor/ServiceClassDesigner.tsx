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

import { Type, ServiceClassModel, ModelFromCodeRequest, FieldType, FunctionModel, NodePosition, STModification, removeStatement, LineRange, EVENT_TYPE, MACHINE_VIEW, DIRECTORY_MAP } from "@wso2/ballerina-core";
import { Codicon, Typography, ProgressRing, Menu, MenuItem, Popover, Item, ThemeColors, View } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import React, { useEffect, useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { LoadingContainer } from "../../styles";
import { FunctionCard } from "./FunctionCard";
import { VariableCard } from "./VariableCard";
import { OperationForm } from "../../GraphQLDiagram/OperationForm";
import { VariableForm } from "./VariableForm";
import { URI, Utils } from "vscode-uri";
import { PanelContainer } from "@wso2/ballerina-side-panel";
import { applyModifications } from "../../../utils/utils";
import { Icon } from "@wso2/ui-toolkit";
import { TopNavigationBar } from "../../../components/TopNavigationBar";
import { TitleBar } from "../../../components/TitleBar";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

const ServiceContainer = styled.div`
    padding-right: 10px;
    padding-left: 10px;
`;

const ScrollableSection = styled.div`
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
    height: 80vh;
    padding: 15px;
`;

const Section = styled.div`
    display: flex;
    flex-direction: column;
    min-height: 75px;
`;

const ScrollableContent = styled.div`
    overflow-y: auto;
    min-height: 55px;
`;

const SectionTitle = styled.div`
    font-size: 14px;
    font-family: GilmerRegular;
    margin-bottom: 10px;
    padding: 8px 0;
`;

const SectionHeader = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
`;

const EmptyStateText = styled(Typography)`
    color: ${ThemeColors.ON_SURFACE_VARIANT};
    padding: 12px;
    text-align: center;
`;

interface ServiceClassDesignerProps {
    projectPath: string;
    isGraphql?: boolean;
    fileName: string;
    position: NodePosition;
    type: Type;
}

export function ServiceClassDesigner(props: ServiceClassDesignerProps) {
    const { projectPath, isGraphql, fileName, position, type } = props;
    const { rpcClient } = useRpcContext();
    const [serviceClassModel, setServiceClassModel] = useState<ServiceClassModel>();
    const [editingFunction, setEditingFunction] = useState<FunctionModel>(undefined);
    const [editingVariable, setEditingVariable] = useState<FieldType>(undefined);
    const [isNew, setIsNew] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | SVGSVGElement | null>(null);
    const [serviceClassFilePath, setServiceClassFilePath] = useState<string>("");

    useEffect(() => {
        getServiceClassModel();
    }, [position]);

    useEffect(() => {
        rpcClient.onProjectContentUpdated((state: boolean) => {
            console.log(">>> ServiceClassDesigner: project content updated", state);
            getServiceClassModel();
        });
    }, [rpcClient]);

    useEffect(() => {
        if (isNew) {
            return;
        }
        if (serviceClassModel) {
            if (editingVariable && editingVariable.codedata?.lineRange) {
                const variable = serviceClassModel.fields.find(field =>
                    field.codedata.lineRange.startLine.line === editingVariable.codedata.lineRange.startLine.line &&
                    field.codedata.lineRange.startLine.offset === editingVariable.codedata.lineRange.startLine.offset
                );
                if (variable) {
                    setEditingVariable(variable);
                }
            }

            if (editingFunction && editingFunction.codedata?.lineRange) {
                const func = serviceClassModel.functions.find(f =>
                    f.codedata.lineRange.startLine.line === editingFunction.codedata.lineRange.startLine.line &&
                    f.codedata.lineRange.startLine.offset === editingFunction.codedata.lineRange.startLine.offset
                );
                if (func) {
                    setEditingFunction(func);
                }
            }
        }
    }, [serviceClassModel]);

    const getServiceClassModel = async () => {
        if (!position || !fileName) return;

        const currentFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] })).filePath;
        const serviceClassModelRequest: ModelFromCodeRequest = {
            filePath: currentFilePath,
            codedata: {
                lineRange: {
                    startLine: { line: position.startLine, offset: position.startColumn },
                    endLine: { line: position.endLine, offset: position.endColumn }
                }
            },
            context: "TYPE_DIAGRAM"
        }

        const serviceClassModelResponse = await rpcClient.getBIDiagramRpcClient().getServiceClassModel(serviceClassModelRequest);
        if (serviceClassModelResponse.model) {
            const serviceClassFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [serviceClassModelResponse.model.codedata.lineRange.fileName] })).filePath;
            console.log("Service Class Model: ", serviceClassModelResponse.model);
            setServiceClassModel(serviceClassModelResponse.model);
            setServiceClassFilePath(serviceClassFilePath);
        }
    }

    const handleEditFunction = (func: FunctionModel) => {
        setIsNew(false);
        setEditingFunction(func);
    };

    const handleDeleteFunction = async (func: FunctionModel) => {
        const targetPosition: NodePosition = {
            startLine: func?.codedata?.lineRange?.startLine.line,
            startColumn: func?.codedata.lineRange?.startLine?.offset,
            endLine: func?.codedata?.lineRange?.endLine?.line,
            endColumn: func?.codedata?.lineRange?.endLine?.offset
        }
        const deleteAction: STModification = removeStatement(targetPosition);
        const currentFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] })).filePath;
        await applyModifications(rpcClient, [deleteAction], currentFilePath);
        getServiceClassModel();
    }

    const onFunctionImplement = async (func: FunctionModel) => {
        const lineRange: LineRange = func.codedata.lineRange;
        const currentFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] })).filePath;
        const nodePosition: NodePosition = { startLine: lineRange.startLine.line, startColumn: lineRange.startLine.offset, endLine: lineRange.endLine.line, endColumn: lineRange.endLine.offset }
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: { position: nodePosition, documentUri: currentFilePath, type: type, identifier: func.name.value }
        });
    }

    const handleFunctionSave = async (updatedFunction: FunctionModel) => {
        setIsSaving(true);
        try {
            let lsResponse;
            const currentFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [serviceClassModel.codedata.lineRange.fileName] })).filePath;
            if (isNew) {
                lsResponse = await rpcClient.getServiceDesignerRpcClient().addFunctionSourceCode({
                    filePath: currentFilePath,
                    codedata: {
                        lineRange: {
                            startLine: { line: serviceClassModel.codedata.lineRange.startLine.line, offset: serviceClassModel.codedata.lineRange.startLine.offset },
                            endLine: { line: serviceClassModel.codedata.lineRange.endLine.line, offset: serviceClassModel.codedata.lineRange.endLine.offset }
                        }
                    },
                    function: updatedFunction,
                    artifactType: DIRECTORY_MAP.TYPE
                });
            } else {
                lsResponse = await rpcClient.getServiceDesignerRpcClient().updateResourceSourceCode({
                    filePath: currentFilePath,
                    codedata: {
                        lineRange: {
                            startLine: { line: serviceClassModel.codedata.lineRange.startLine.line, offset: serviceClassModel.codedata.lineRange.startLine.offset },
                            endLine: { line: serviceClassModel.codedata.lineRange.endLine.line, offset: serviceClassModel.codedata.lineRange.endLine.offset }
                        }
                    },
                    function: updatedFunction,
                    artifactType: DIRECTORY_MAP.TYPE
                });
            }

            if (isNew) {
                setIsNew(false);
            }
            setEditingFunction(null);
            getServiceClassModel(); // Refresh the model
        } catch (error) {
            console.error('Error updating function:', error);
        }
        setIsSaving(false);
    };

    const handleEditVariable = (variable: FieldType) => {
        setEditingVariable(variable);
    };

    const handleVariableSave = async (updatedVariable: FieldType) => {
        setIsSaving(true);
        try {
            const currentFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [serviceClassModel.codedata.lineRange.fileName] })).filePath;
            if (isNew) {
                const lsResponse = await rpcClient.getBIDiagramRpcClient().addClassField({
                    filePath: currentFilePath,
                    field: updatedVariable,
                    codedata: {
                        lineRange: {
                            fileName: serviceClassModel.codedata.lineRange.fileName,
                            startLine: { line: serviceClassModel.codedata.lineRange.startLine.line, offset: serviceClassModel.codedata.lineRange.startLine.offset },
                            endLine: { line: serviceClassModel.codedata.lineRange.endLine.line, offset: serviceClassModel.codedata.lineRange.endLine.offset }
                        }
                    }
                });

            } else {
                const lsResponse = await rpcClient.getBIDiagramRpcClient().updateClassField({
                    filePath: currentFilePath,
                    field: updatedVariable
                });
            }
            if (isNew) {
                setIsNew(false);
            }
            setEditingVariable(undefined);
            getServiceClassModel();
        } catch (error) {
            console.error('Error updating variable:', error);
        }
        setIsSaving(false);
    };

    const handleAddFunction = async (type: 'init' | 'resource' | 'remote') => {
        const lsResponse = await rpcClient.getServiceDesignerRpcClient().getFunctionModel({
            type: 'object',
            functionName: type
        });
        if (lsResponse.function) {
            // if resouce we need to update the models accessor value to get and valueType to Identifier
            if (type === 'resource' && lsResponse.function.accessor && lsResponse.function.accessor.types.length > 0) {
                lsResponse.function.accessor.value = 'get';
                lsResponse.function.accessor.types[0].fieldType = 'IDENTIFIER';
            }

            setIsNew(true);
            setEditingFunction(lsResponse.function);
            console.log(`Adding ${type} function`, lsResponse.function);

        }
    };

    const handleCloseFunctionForm = () => {
        setEditingFunction(undefined);
        setIsNew(false);
    };

    const handleCloseVariableForm = () => {
        setEditingVariable(undefined);
        setIsNew(false);
    }

    const handleAddVariable = () => {
        // TODO: Add the LS call when its ready
        const newVariable: FieldType = {
            isPrivate: true,
            isFinal: false,
            codedata: {
                lineRange: {
                    fileName: serviceClassModel.codedata.lineRange.fileName,
                    startLine: {
                        line: serviceClassModel.codedata.lineRange.startLine.line,
                        offset: serviceClassModel.codedata.lineRange.startLine.offset
                    },
                    endLine: {
                        line: serviceClassModel.codedata.lineRange.endLine.line,
                        offset: serviceClassModel.codedata.lineRange.endLine.offset
                    }
                }
            },
            type: {
                metadata: {
                    label: "Variable Type",
                    description: "The type of the variable"
                },
                enabled: true,
                editable: true,
                value: "",
                types: [{ fieldType: "TYPE", selected: false }],
                isType: true,
                optional: false,
                advanced: false,
                addNewButton: false
            },
            name: {
                metadata: {
                    label: "Variable Name",
                    description: "The name of the variable"
                },
                enabled: true,
                editable: true,
                value: "",
                types: [{ fieldType: "IDENTIFIER", selected: false }],
                isType: false,
                optional: false,
                advanced: false,
                addNewButton: false
            },
            defaultValue: {
                metadata: {
                    label: "Initial Value",
                    description: "The initial value of the variable"
                },
                value: "",
                enabled: true,
                editable: true,
                isType: false,
                optional: false,
                advanced: false,
                types: [{ fieldType: "EXPRESSION", selected: true }],
                addNewButton: false
            },
            enabled: true,
            editable: true,
            optional: false,
            advanced: false
        };
        setIsNew(true);
        setEditingVariable(newVariable);
    };

    const handleDeleteVariable = async (variable: FieldType) => {
        const targetPosition: NodePosition = {
            startLine: variable?.codedata?.lineRange?.startLine.line,
            startColumn: variable?.codedata.lineRange?.startLine?.offset,
            endLine: variable?.codedata.lineRange?.endLine?.line,
            endColumn: variable?.codedata.lineRange?.endLine?.offset
        }
        const deleteAction: STModification = removeStatement(targetPosition);
        const currentFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] })).filePath;
        await applyModifications(rpcClient, [deleteAction], currentFilePath);
        getServiceClassModel();
    }

    const hasInitFunction = serviceClassModel?.functions?.some(func => func.kind === 'INIT');
    const initFunction = serviceClassModel?.functions?.find(func => func.kind === 'INIT' && func.enabled);

    // `init` is configured through ServiceFunctionForm rather than the inline OperationForm: only its
    // `getFunctionFromSource` model carries the init guards (non-editable name, disabled return type).
    const handleConfigureInitFunction = async (func: FunctionModel) => {
        const lineRange: LineRange = func.codedata.lineRange;
        const currentFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] })).filePath;
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.ServiceFunctionForm,
                position: {
                    startLine: lineRange.startLine.line,
                    startColumn: lineRange.startLine.offset,
                    endLine: lineRange.endLine.line,
                    endColumn: lineRange.endLine.offset,
                },
                documentUri: currentFilePath,
                artifactType: DIRECTORY_MAP.TYPE
            }
        });
    };

    const menuItems: Item[] = [
        {
            id: "init",
            label: "Init",
            onClick: () => {
                handleAddFunction('init');
                setAnchorEl(null);
            }
        },
        {
            id: "resource",
            label: "Resource",
            onClick: () => {
                handleAddFunction('resource');
                setAnchorEl(null);
            }
        },
        {
            id: "remote",
            label: "Remote",
            onClick: () => {
                handleAddFunction('remote');
                setAnchorEl(null);
            }
        }
    ];

    const handleOpenDiagram = async (resource: FunctionModel) => {
        const lineRange: LineRange = resource.codedata.lineRange;
        const nodePosition: NodePosition = {
            startLine: lineRange.startLine.line,
            startColumn: lineRange.startLine.offset,
            endLine: lineRange.endLine.line,
            endColumn: lineRange.endLine.offset,
        };
        const currentFilePath = (await rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: [fileName] })).filePath;
        await rpcClient
            .getVisualizerRpcClient()
            .openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    position: nodePosition,
                    type: type,
                    identifier: resource.name.value,
                    documentUri: currentFilePath
                }
            });
    };

    const handleServiceEdit = async () => {
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIServiceClassConfigView,
                type: type,
                position: {
                    startLine: serviceClassModel.codedata.lineRange.startLine.line,
                    startColumn: serviceClassModel.codedata.lineRange.startLine.offset,
                    endLine: serviceClassModel.codedata.lineRange.endLine.line,
                    endColumn: serviceClassModel.codedata.lineRange.endLine.offset
                },
                documentUri: serviceClassModel.codedata.lineRange.fileName,
            },
        });
    };

    return (
        <View>
            <TopNavigationBar projectPath={projectPath} />
            <TitleBar
                title="Service Class Designer"
                subtitle="Implement and configure your service class"
                actions={

                    <VSCodeButton appearance="secondary" title="Edit Service Class" onClick={handleServiceEdit}>
                        <Icon name="bi-edit" sx={{ marginRight: 8, fontSize: 16 }} /> Edit
                    </VSCodeButton>
                }
            />
            <ServiceContainer>

                {!serviceClassModel && (
                    <LoadingContainer>
                        <ProgressRing />
                        <Typography variant="h3" sx={{ marginTop: '16px' }}>Loading Service Class Designer...</Typography>
                    </LoadingContainer>
                )}
                {serviceClassModel && (
                    <>
                        <ScrollableSection>
                            {initFunction && (
                                <Section>
                                    <SectionHeader>
                                        <SectionTitle>Constructor</SectionTitle>
                                    </SectionHeader>

                                    <ScrollableContent>
                                        <FunctionCard
                                            functionModel={initFunction}
                                            goToSource={() => { }}
                                            onEditFunction={() => handleConfigureInitFunction(initFunction)}
                                            onDeleteFunction={() => handleDeleteFunction(initFunction)}
                                            onFunctionImplement={() => handleOpenDiagram(initFunction)}
                                        />
                                    </ScrollableContent>
                                </Section>
                            )}
                            <Section style={{ maxHeight: '40%' }}>
                                <SectionHeader>
                                    <SectionTitle>Class Variables</SectionTitle>
                                    <VSCodeButton data-testid="add-variable-button" appearance="primary" title="Add Variable" onClick={() => handleAddVariable()}>
                                        <Codicon name="add" sx={{ marginRight: 8 }} /> Variable
                                    </VSCodeButton>
                                </SectionHeader>

                                <ScrollableContent>
                                    {serviceClassModel.fields?.map((field: FieldType, index: number) => (
                                        <VariableCard
                                            key={index}
                                            fieldModel={field}
                                            onEditVariable={() => handleEditVariable(field)}
                                            onDeleteVariable={() => handleDeleteVariable(field)}
                                        />
                                    ))}
                                    {(!serviceClassModel.fields || serviceClassModel.fields.length === 0) && (
                                        <EmptyStateText variant="body2">
                                            No variables found
                                        </EmptyStateText>
                                    )}
                                </ScrollableContent>
                            </Section>

                            <Section>
                                <SectionHeader>
                                    <SectionTitle>Methods</SectionTitle>
                                    <div style={{ position: 'relative' }}>
                                        <VSCodeButton appearance="primary" title="Add Method" onClick={(e: any) => {
                                            if (hasInitFunction && isGraphql) {
                                                handleAddFunction('resource');
                                            } else {
                                                setAnchorEl(e.currentTarget);
                                            }
                                        }}>
                                            <Codicon name="add" sx={{ marginRight: 8 }} /> Method
                                        </VSCodeButton>
                                        <Popover
                                            open={Boolean(anchorEl)}
                                            anchorEl={anchorEl}
                                            handleClose={() => setAnchorEl(null)}
                                            sx={{
                                                padding: 0,
                                                borderRadius: 0,
                                                zIndex: 3000

                                            }}
                                            anchorOrigin={{
                                                vertical: 'top',
                                                horizontal: 'right'
                                            }}
                                            transformOrigin={{
                                                vertical: 'top',
                                                horizontal: 'right'
                                            }}
                                        >
                                            <Menu>
                                                {menuItems
                                                    .filter(item => !(item.id === 'init' && hasInitFunction))
                                                    .map((item) => (
                                                        <MenuItem key={item.id} item={item} />
                                                    ))}
                                            </Menu>
                                        </Popover>
                                    </div>
                                </SectionHeader>

                                <ScrollableContent>
                                    {serviceClassModel.functions?.filter((func: FunctionModel) => func.kind !== 'INIT')
                                        .map((func: FunctionModel, index: number) => (
                                            <FunctionCard
                                                key={index}
                                                functionModel={func}
                                                goToSource={() => { }}
                                                onEditFunction={() => handleEditFunction(func)}
                                                onDeleteFunction={() => handleDeleteFunction(func)}
                                                onFunctionImplement={() => onFunctionImplement(func)}
                                            />
                                        ))}
                                    {(!serviceClassModel.functions || serviceClassModel.functions.length === 0) && (
                                        <EmptyStateText variant="body2">
                                            No functions found
                                        </EmptyStateText>
                                    )}
                                </ScrollableContent>
                            </Section>
                        </ScrollableSection>
                    </>
                )}
                {editingFunction && serviceClassModel && (
                    <PanelContainer
                        title={isNew ? "Add Method" : "Edit Method"}
                        show={true}
                        onClose={handleCloseFunctionForm}
                        onBack={handleCloseFunctionForm}
                        width={400}
                    >
                        <OperationForm
                            model={editingFunction}
                            filePath={serviceClassFilePath}
                            lineRange={serviceClassModel.codedata.lineRange}
                            isSaving={isSaving}
                            isServiceClass={true}
                            onClose={handleCloseFunctionForm}
                            onSave={handleFunctionSave}
                        />
                    </PanelContainer>
                )}
                {editingVariable && serviceClassModel && (
                    <PanelContainer
                        title={isNew ? "Add Variable" : "Edit Variable"}
                        show={true}
                        onClose={handleCloseVariableForm}
                        onBack={handleCloseVariableForm}
                        width={400}
                    >
                        <VariableForm
                            model={editingVariable}
                            filePath={serviceClassFilePath}
                            lineRange={editingVariable.codedata.lineRange}
                            onClose={handleCloseVariableForm}
                            isSaving={isSaving}
                            onSave={handleVariableSave}
                        />
                    </PanelContainer>
                )}
            </ServiceContainer>
        </View>
    );
}
