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

import React, { useCallback, useEffect, useState } from "react";
import { debounce } from "lodash";
import { DIAGRAM_REFRESH_DEBOUNCE_MS } from "../BI/diagramRefreshDebounce";
import { VisualizerLocation, NodePosition, Type, EVENT_TYPE, MACHINE_VIEW, TypeNodeKind, Member } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { TypeDiagram as TypeDesignDiagram } from "@wso2/type-diagram";
import { Button, Codicon, ProgressRing, ThemeColors, View, ViewContent } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { PanelContainer } from "@wso2/ballerina-side-panel";
import { TopNavigationBar } from "../../components/TopNavigationBar";
import { TitleBar } from "../../components/TitleBar";
import { FormTypeEditor } from "../BI/TypeEditor";
import { NodeSelector } from "./NodeSelectorView/NodeSelector";
import DynamicModal from "../../components/Modal";
import { BreadcrumbContainer, BreadcrumbItem, BreadcrumbSeparator } from "../BI/Forms/FlowNodeForm";
import { EditorContext, StackItem } from "@wso2/type-editor";

export const Title: React.FC<any> = styled.div`
    color: ${ThemeColors.ON_SURFACE};
`;

interface TypeDiagramProps {
    selectedTypeId?: string;
    addType?: boolean;
    projectPath?: string;
}

interface TypeEditorState {
    isTypeCreatorOpen: boolean;
    editingTypeId: string | undefined;
    newTypeName: string | undefined;
    editingType: Type;
}

const MAX_TYPES_FOR_FULL_VIEW = 80;

export function TypeDiagram(props: TypeDiagramProps) {
    const { selectedTypeId, addType, projectPath } = props;
    const { rpcClient } = useRpcContext();
    const commonRpcClient = rpcClient.getCommonRpcClient();
    const [visualizerLocation, setVisualizerLocation] = React.useState<VisualizerLocation>();
    const [typesModel, setTypesModel] = React.useState<Type[]>(undefined);
    const [focusedNodeId, setFocusedNodeId] = React.useState<string | undefined>(undefined);
    const [highlightedNodeId, setHighlightedNodeId] = React.useState<string | undefined>(selectedTypeId);
    const [isModelLoaded, setIsModelLoaded] = React.useState<boolean>(false);
    const [typeEditorState, setTypeEditorState] = React.useState<TypeEditorState>({
        isTypeCreatorOpen: false,
        editingTypeId: undefined,
        newTypeName: undefined,
        editingType: undefined,
    });

    const createNewType = (): Type => ({
        name: "",
        members: [] as Member[],
        editable: true,
        metadata: {
            description: "",
            label: ""
        },
        properties: {},
        codedata: {
            node: "RECORD" as TypeNodeKind
        },
        includes: [] as string[],
        allowAdditionalFields: false
    });

    const [stack, setStack] = useState<StackItem[]>([{
        isDirty: false,
        type: createNewType()
    }]);

    const [refetchStates, setRefetchStates] = useState<boolean[]>([false]);

    const pushTypeStack = (item: StackItem) => {
        setStack((prev) => [...prev, item]);
        setRefetchStates((prev) => {
            const newStates = [...prev];
            if (newStates.length > 0) {
                newStates[newStates.length - 1] = false;
            }
            return [...newStates, false];
        });
    };

    const popTypeStack = () => {
        setStack((prev) => {
            const newStack = prev.slice(0, -1);
            // If stack becomes empty, reset to initial state
            if (newStack.length === 0) {
                return [{
                    isDirty: false,
                    type: undefined
                }];
            }
            return newStack;
        });
        setRefetchStates((prev) => {
            const newStates = [...prev];
            const currentState = newStates.pop();
            if (currentState && newStates.length > 0) {
                newStates[newStates.length - 1] = true;
            }
            // If no states left, add initial state
            if (newStates.length === 0) {
                newStates.push(false);
            }
            return newStates;
        });
    };

    const peekTypeStack = (): StackItem | null => {
        return stack.length > 0 ? stack[stack.length - 1] : null;
    };

    const replaceTop = (item: StackItem) => {
        if (stack.length === 0) return;
        setStack((prev) => {
            const newStack = [...prev];
            //preserve fieldIndex if exists
            if (newStack[newStack.length - 1].fieldIndex) {
                item.fieldIndex = newStack[newStack.length - 1].fieldIndex;
            }
            newStack[newStack.length - 1] = item;
            return newStack;
        });
    }

    useEffect(() => {
        if (!typesModel) {
            return;
        }

        if (typesModel.length > MAX_TYPES_FOR_FULL_VIEW) {
            if (selectedTypeId) {
                setFocusedNodeId(selectedTypeId);
            } else {
                setFocusedNodeId(undefined);
            }

        } else {
            if (selectedTypeId) {
                setHighlightedNodeId(selectedTypeId);
            }
            setFocusedNodeId(undefined);
        }
    }, [selectedTypeId, typesModel]);

    useEffect(() => {
        if (addType) {
            setTypeEditorState((prevState) => ({
                ...prevState,
                isTypeCreatorOpen: true,
            }));
        }
    }, [addType]);

    useEffect(() => {
        if (rpcClient) {
            rpcClient.getVisualizerLocation().then((value) => {
                setVisualizerLocation(value);
            });
        }
    }, [rpcClient, projectPath]);

    useEffect(() => {
        setIsModelLoaded(false);
        getComponentModel();
    }, [visualizerLocation]);

    const debouncedGetComponentModel = useCallback(
        debounce(() => {
            setIsModelLoaded(false);
            getComponentModel();
        }, DIAGRAM_REFRESH_DEBOUNCE_MS),
        []
    );

    useEffect(() => {
        const disposable = rpcClient?.onProjectContentUpdated((state: boolean) => {
            if (state) {
                console.log("Project content updated, refreshing type model");
                debouncedGetComponentModel();
            }
        });
        return () => {
            debouncedGetComponentModel.cancel();
            disposable?.();
        };
    }, [rpcClient]);



    const setRefetchForCurrentModal = (shouldRefetch: boolean) => {
        setRefetchStates((prev) => {
            const newStates = [...prev];
            if (newStates.length > 0) {
                newStates[newStates.length - 1] = shouldRefetch;
            }
            return newStates;
        });
    };

    const handleTypeEditorStateChange = (state: boolean) => {
        if (!state) {
            if (stack.length > 1) {
                popTypeStack();
                return;
            }
        }
        setTypeEditorState((prevState) => ({
            ...prevState,
            isTypeCreatorOpen: state,
        }));
    }

    const onSaveType = () => {
        if (stack.length > 0) {
            if (stack.length > 1) {
                const newStack = [...stack]
                const currentTop = newStack[newStack.length - 1];
                const newTop = newStack[newStack.length - 2];
                newTop.type.members[newTop.fieldIndex!].type = currentTop!.type.name;
                newStack[newStack.length - 2] = newTop;
                newStack.pop();
                setStack(newStack);
            }
            else {
                popTypeStack();
            }
            setRefetchForCurrentModal(true);
        }
        setTypeEditorState({
            ...typeEditorState,
            isTypeCreatorOpen: stack.length !== 1,
        });
    }


    const getNewTypeCreateForm = (fieldIndex?: number, typeName?: string) => {
        const currentTop = peekTypeStack();
        if (currentTop) {
            currentTop.fieldIndex = fieldIndex;
            replaceTop(currentTop);
        }
        pushTypeStack({
            type: createNewType(),
            isDirty: false,
            fieldIndex: fieldIndex
        });
        setTypeEditorState({
            ...typeEditorState,
            isTypeCreatorOpen: true,
        })
    }

    const getComponentModel = async () => {
        if (!rpcClient || !visualizerLocation?.metadata?.recordFilePath) {
            return;
        }
        const response = await rpcClient
            .getBIDiagramRpcClient()
            .getTypes({ filePath: visualizerLocation?.metadata?.recordFilePath });
        if (response?.types) {
            setTypesModel(response.types);

            // Set focused node immediately if we have selectedTypeId and more than 80 types
            if (response.types.length > MAX_TYPES_FOR_FULL_VIEW && selectedTypeId) {
                setFocusedNodeId(selectedTypeId);
            }
        }

        setIsModelLoaded(true);
        console.log(response);
    };

    const showProblemPanel = async () => {
        if (!rpcClient) {
            return;
        }
        await commonRpcClient.executeCommand({ commands: ["workbench.action.problems.focus"] });
    };

    const addNewType = async () => {
        setTypeEditorState((prevState) => ({
            ...prevState,
            editingTypeId: undefined,
            editingType: undefined,
            isTypeCreatorOpen: true,
        }));
    };

    const handleOnGoToSource = (node: Type) => {
        if (!rpcClient || !node.codedata.lineRange) {
            return;
        }
        const targetPosition: NodePosition = {
            startLine: node.codedata.lineRange?.startLine?.line,
            startColumn: node.codedata.lineRange?.startLine?.offset,
            endLine: node.codedata.lineRange?.endLine?.line,
            endColumn: node.codedata.lineRange?.endLine?.offset,
        };

        rpcClient.getCommonRpcClient().goToSource({ position: targetPosition, fileName: node.codedata.lineRange?.fileName });
    };

    const onTypeEdit = async (typeId: string) => {
        const type = typesModel?.find((type) => type.name === typeId);
        if (!type) {
            return;
        }
        if (type?.codedata?.node === "CLASS") {
            await rpcClient.getVisualizerRpcClient().openView({
                type: EVENT_TYPE.OPEN_VIEW,
                location: {
                    view: MACHINE_VIEW.BIServiceClassDesigner,
                    type: type,
                    isGraphql: false,
                    position: {
                        startLine: type.codedata.lineRange?.startLine?.line,
                        startColumn: type.codedata.lineRange?.startLine?.offset,
                        endLine: type.codedata.lineRange?.endLine?.line,
                        endColumn: type.codedata.lineRange?.endLine?.offset,
                    },
                    documentUri: type.codedata.lineRange?.fileName
                },
            });
            return;
        }
        setTypeEditorState((prevState) => ({
            ...prevState,
            isTypeCreatorOpen: true,
            editingType: type,
            editingTypeId: typeId,
        }));
        setHighlightedNodeId(typeId);
    };

    const verifyTypeDelete = async (typeId: string) => {
        if (!visualizerLocation || !visualizerLocation.metadata?.recordFilePath) {
            return false;
        }
        const component = typesModel?.find((type) => type.name === typeId);
        if (!component) {
            return false;
        }

        try {
            const response = await rpcClient.getBIDiagramRpcClient().verifyTypeDelete({
                filePath: component.codedata?.lineRange?.fileName,
                startPosition: component.codedata?.lineRange?.startLine,
            });

            if (response.errorMsg) {
                rpcClient.getCommonRpcClient().showErrorMessage({
                    message: response.errorMsg || "Failed to find usages.",
                });
                throw new Error(response.errorMsg);
            }
            return !!response.canDelete;
        } catch (error: any) {
            rpcClient.getCommonRpcClient().showErrorMessage({
                message: error?.message || "Failed to find usages.",
            });
            throw error;
        }
    };

    // After user confirms in the diagram, delete without re-verifying.
    const onTypeDelete = async (typeId: string) => {
        const component = typesModel?.find((type) => type.name === typeId);
        if (!component || !visualizerLocation?.metadata?.recordFilePath) {
            return;
        }
        await rpcClient.getBIDiagramRpcClient().deleteType({
            filePath: component.codedata?.lineRange?.fileName,
            lineRange: {
                startLine: component.codedata?.lineRange?.startLine,
                endLine: component.codedata?.lineRange?.endLine,
            }
        }).then((response) => {
            if (response.errorMsg) {
                rpcClient.getCommonRpcClient().showErrorMessage({
                    message: response.errorMsg || "Failed to delete type. Please check the console for more details.",
                });
                throw new Error(response.errorMsg || "Failed to delete type. Please check the console for more details.");
            }
        }).catch((error) => {
            rpcClient.getCommonRpcClient().showErrorMessage({
                message: error.message || "Failed to delete type. Please check the console for more details.",
            });
        });
    };

    const onTypeEditorClosed = () => {
        setTypeEditorState({
            editingTypeId: undefined,
            editingType: undefined,
            isTypeCreatorOpen: false,
            newTypeName: undefined,
        });
        setStack([{
            isDirty: false,
            type: undefined
        }])
    };

    const findSelectedType = (typeId: string): Type => {
        if (!typeId) {
            return {
                name: typeEditorState.newTypeName ?? "MyType",
                editable: true,
                metadata: {
                    label: "",
                    description: "",
                },
                codedata: {
                    node: "RECORD",
                },
                properties: {},
                members: [],
                includes: [] as string[],
                allowAdditionalFields: false
            };
        }
        return typesModel.find((type: Type) => type.name === typeId);
    };

    const onFocusedNodeIdChange = (typeId: string) => {
        setFocusedNodeId(typeId);
        onTypeEditorClosed();
        setHighlightedNodeId(undefined);
    };


    const onTypeChange = async (type: Type, rename?: boolean) => {
        if (rename) {
            setTypeEditorState({
                editingTypeId: type.name,
                editingType: type,
                isTypeCreatorOpen: false,
                newTypeName: undefined,
            });
            return;
        }
        setTypeEditorState({
            ...typeEditorState,
            isTypeCreatorOpen: true,
        });
    };

    // Helper function to convert TypeNodeKind to display name
    const getTypeKindDisplayName = (typeNodeKind?: TypeNodeKind): string => {
        switch (typeNodeKind) {
            case "RECORD":
                return "Record";
            case "ENUM":
                return "Enum";
            case "CLASS":
                return "Service Class";
            case "UNION":
                return "Union";
            case "ARRAY":
                return "Array";
            default:
                return "";
        }
    };

    const handleNodeSelect = (nodeId: string) => {
        setFocusedNodeId(nodeId);
    };

    const renderView = () => {
        if (typesModel && typesModel.length > MAX_TYPES_FOR_FULL_VIEW && focusedNodeId === undefined) {
            return (
                <NodeSelector
                    nodes={typesModel || []}
                    onNodeSelect={handleNodeSelect}
                />
            );
        } else {
            return (
                <TypeDesignDiagram
                    typeModel={typesModel}
                    selectedNodeId={highlightedNodeId}
                    focusedNodeId={focusedNodeId}
                    updateFocusedNodeId={onFocusedNodeIdChange}
                    showProblemPanel={showProblemPanel}
                    goToSource={handleOnGoToSource}
                    onTypeEdit={onTypeEdit}
                    onTypeDelete={onTypeDelete}
                    verifyTypeDelete={verifyTypeDelete}
                />
            );
        }
    }

    return (
        <>
            <View>
                <TopNavigationBar projectPath={projectPath} />
                {!focusedNodeId && (
                    <TitleBar
                        title="Types"
                        subtitle={focusedNodeId || "View and edit types in the project"}
                        actions={
                            <Button appearance="primary" onClick={addNewType} tooltip="Add New Type">
                                <Codicon name="add" sx={{ marginRight: 5 }} /> Add Type
                            </Button>
                        }
                    />
                )}
                {focusedNodeId && (
                    <TitleBar
                        title={focusedNodeId}
                        subtitle="Type"
                        onBack={() => {
                            setFocusedNodeId(undefined);
                        }}
                    />
                )}
                <ViewContent>
                    <>
                        {!isModelLoaded ? (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                <ProgressRing color={ThemeColors.PRIMARY} />
                            </div>
                        ) : renderView()}
                    </>
                </ViewContent>
            </View>
            <EditorContext.Provider value={{ stack, push: pushTypeStack, pop: popTypeStack, peek: peekTypeStack, replaceTop: replaceTop }}>
                {/* Panel for editing and creating types */}
                <PanelContainer
                    title={typeEditorState.editingTypeId ?
                        `Edit Type${getTypeKindDisplayName(typeEditorState.editingType?.codedata?.node) ?
                            ` : ${getTypeKindDisplayName(typeEditorState.editingType?.codedata?.node)}` :
                            ''}` :
                        "New Type"
                    }
                    show={typeEditorState.isTypeCreatorOpen}
                    onClose={onTypeEditorClosed}
                >
                    <FormTypeEditor
                        key={typeEditorState.editingTypeId ?? typeEditorState.newTypeName ?? 'new-type'}
                        type={findSelectedType(typeEditorState.editingTypeId)}
                        newType={typeEditorState.editingTypeId ? false : true}
                        onTypeChange={onTypeChange}
                        onTypeCreate={() => { }}
                        isPopupTypeForm={false}
                        onSaveType={onSaveType}
                        getNewTypeCreateForm={getNewTypeCreateForm}
                        refetchTypes={true}
                    />
                </PanelContainer>

                {stack.slice(1).map((item, i) => {
                    return (
                        <DynamicModal
                            key={i}
                            width={420}
                            height={600}
                            anchorRef={undefined}
                            title="Create New Type"
                            openState={typeEditorState.isTypeCreatorOpen}
                            setOpenState={handleTypeEditorStateChange}>
                            <BreadcrumbContainer>
                                {stack.slice(1, i + 2).map((stackItem, index) => (
                                    <React.Fragment key={index}>
                                        {index > 0 && <BreadcrumbSeparator>/</BreadcrumbSeparator>}
                                        <BreadcrumbItem>
                                            {stackItem?.type?.name || "NewType"}
                                        </BreadcrumbItem>
                                    </React.Fragment>
                                ))}
                            </BreadcrumbContainer>
                            <div style={{ height: '560px', overflow: 'auto' }}>
                                <FormTypeEditor
                                    key={typeEditorState.editingTypeId ?? typeEditorState.newTypeName ?? 'new-type'}
                                    type={peekTypeStack()?.type}
                                    newType={peekTypeStack()?.isDirty}
                                    isPopupTypeForm={true}
                                    onTypeChange={onTypeChange}
                                    onTypeCreate={() => { }}
                                    onSaveType={onSaveType}
                                    getNewTypeCreateForm={getNewTypeCreateForm}
                                    refetchTypes={refetchStates[i + 1]}
                                />
                            </div>
                        </DynamicModal>
                    )
                })}
            </EditorContext.Provider>

        </>
    );
}
