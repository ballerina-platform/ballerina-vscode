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
import {
    Type,
    NodePosition,
    GetGraphqlTypeResponse,
    GetGraphqlTypeRequest,
    EVENT_TYPE,
    MACHINE_VIEW,
    TypeNodeKind,
    Member,
    Protocol
} from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { TypeDiagram as TypeDesignDiagram } from "@wso2/type-diagram";
import {
    Button,
    ProgressRing,
    ThemeColors,
    View,
    ViewContent,
    Typography,
    Icon,
} from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { GraphqlServiceEditor } from "./GraphqlServiceEditor";
import { PanelContainer } from "@wso2/ballerina-side-panel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TopNavigationBar } from "../../components/TopNavigationBar";
import { TitleBar } from "../../components/TitleBar";
import { GraphqlObjectViewer } from "./ObjectViewer";
import { FormTypeEditor } from "../BI/TypeEditor";
import { EditorContext, StackItem } from "@wso2/type-editor";
import DynamicModal from "../../components/Modal";
import { BreadcrumbContainer, BreadcrumbItem, BreadcrumbSeparator } from "../BI/Forms/FlowNodeForm";
import React from "react";
import { removeForwardSlashes } from "../BI/ServiceDesigner/utils";

const SpinnerContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
`;

const ActionButton = styled(Button)`
    display: flex;
    align-items: center;
    gap: 4px;
`;


const SubTitleWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
`;

const Path = styled.span`
    color: var(--vscode-foreground);
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
`;

interface GraphQLDiagramProps {
    projectPath: string;
    filePath: string;
    position: NodePosition;
    serviceIdentifier: string;
}

export function GraphQLDiagram(props: GraphQLDiagramProps) {
    const { projectPath, filePath, position, serviceIdentifier } = props;
    const { rpcClient } = useRpcContext();
    const queryClient = useQueryClient();
    const [isServiceEditorOpen, setIsServiceEditorOpen] = useState<boolean>(false);
    const [isTypeEditorOpen, setIsTypeEditorOpen] = useState(false);
    const [editingType, setEditingType] = useState<Type>();
    const [focusedNodeId, setFocusedNodeId] = useState<string | undefined>(undefined);

    const [stack, setStack] = useState<StackItem[]>([{
        isDirty: false,
        type: undefined
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

    const replaceTop = (item: StackItem) => {
        if (stack.length <= 1) return;
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

    const peekTypeStack = (): StackItem | null => {
        return stack.length > 0 ? stack[stack.length - 1] : null;
    };

    // Helper function to convert TypeNodeKind to display name
    const getTypeKindDisplayName = (typeNodeKind?: TypeNodeKind): string => {
        switch (typeNodeKind) {
            case "RECORD":
                return "Object"; // In edit mode, always show as "Object"
            case "ENUM":
                return "Enum";
            case "CLASS":
                return "Object";
            case "UNION":
                return "Union";
            case "ARRAY":
                return "Array";
            default:
                return "";
        }
    };

    const fetchGraphqlTypeModel = async () => {
        if (!filePath) return null;

        const typeModelRequest: GetGraphqlTypeRequest = {
            filePath: filePath,
            linePosition: { line: position?.startLine, offset: position?.startColumn },
        };

        const response = await rpcClient.getGraphqlDesignerRpcClient().getGraphqlTypeModel(typeModelRequest);
        console.log(">>> Graphql Type Model", response);
        if (!response) {
            throw new Error("Failed to fetch GraphQL type model");
        }
        return response;
    };

    const {
        data: graphqlTypeModel,
        isLoading,
        error,
    } = useQuery<GetGraphqlTypeResponse>({
        queryKey: ["graphqlTypeModel", filePath, position],
        queryFn: fetchGraphqlTypeModel,
        retry: 3,
        retryDelay: 2000,
        enabled: !!filePath && !!rpcClient,
    });

    useEffect(() => rpcClient?.onProjectContentUpdated((state: boolean) => {
        if (state) {
            // Instead of calling getGraphqlDesignModel directly, invalidate the query
            queryClient.invalidateQueries({ queryKey: ["graphqlTypeModel"] });
        }
    }), [rpcClient, queryClient]);

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

    const onTypeEdit = async (typeId: string, isGraphqlRoot?: boolean) => {
        if (isGraphqlRoot) {
            setIsServiceEditorOpen(true);
            return;
        }

        // find the type by checking the references of graphqlTypeModel
        const type = graphqlTypeModel?.refs.find((type) => type.name === typeId);
        if (type) {
            setEditingType(type);
            setIsTypeEditorOpen(true);
        } else {
            console.error("Type not found");
        }
    };

    const onTypeChange = async () => {
        setIsTypeEditorOpen(false);
        setEditingType(undefined);
    };

    const onTypeEditorClosed = () => {
        setIsTypeEditorOpen(false);
        setEditingType(undefined);
    };

    const handleServiceEdit = async () => {
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIServiceConfigView,
                position: {
                    startLine: position?.startLine,
                    startColumn: position?.startColumn,
                    endLine: position?.endLine,
                    endColumn: position?.endColumn,
                },
                documentUri: filePath,
            },
        });
    };

    const handleOnImplementation = async (type: Type) => {
        await rpcClient.getVisualizerRpcClient().openView({
            type: EVENT_TYPE.OPEN_VIEW,
            location: {
                view: MACHINE_VIEW.BIServiceClassDesigner,
                type: type,
                isGraphql: true,
                position: {
                    startLine: type.codedata.lineRange?.startLine?.line,
                    startColumn: type.codedata.lineRange?.startLine?.offset,
                    endLine: type.codedata.lineRange?.endLine?.line,
                    endColumn: type.codedata.lineRange?.endLine?.offset,
                },
                documentUri: type.codedata.lineRange?.fileName,
            },
        });
        setEditingType(undefined);
    };

    const handleFocusedNodeIdChange = (nodeId: string) => {
        setFocusedNodeId(nodeId);
    };

    const verifyTypeDelete = async (typeId: string): Promise<boolean> => {
        if (!graphqlTypeModel?.refs) {
            return false;
        }
        const component = graphqlTypeModel.refs.find((type) => type.name === typeId);
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
        const component = graphqlTypeModel?.refs.find((type) => type.name === typeId);
        if (!component) {
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

    const setRefetchForCurrentModal = (shouldRefetch: boolean) => {
        setRefetchStates((prev) => {
            const newStates = [...prev];
            if (newStates.length > 0) {
                newStates[newStates.length - 1] = shouldRefetch;
            }
            return newStates;
        });
    };

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
            setRefetchForCurrentModal(true);
        }
        setIsTypeEditorOpen(stack.length !== 1);
    }

    const getNewTypeCreateForm = (fieldIndex?: number, typeName?: string) => {
        pushTypeStack({
            type: createNewType(),
            isDirty: false,
            fieldIndex: fieldIndex
        });
        setIsTypeEditorOpen(true);
    }

    const handleTypeEditorStateChange = (state: boolean) => {
        if (!state) {
            if (stack.length > 1) {
                popTypeStack();
                return;
            }
        }
        setIsTypeEditorOpen(state);
    }


    return (
        <>
            <View>
                <TopNavigationBar projectPath={projectPath} />
                {!focusedNodeId && (
                    <TitleBar
                        title="GraphQL"
                        subtitleElement={
                            <SubTitleWrapper>
                                <Path>{removeForwardSlashes(graphqlTypeModel?.type.name)}</Path>
                            </SubTitleWrapper>
                        }
                        actions={
                            <ActionButton appearance="secondary" onClick={handleServiceEdit} data-testid="edit-service-btn">
                                <Icon
                                    name="bi-settings"
                                    sx={{
                                        marginRight: 5,
                                        fontSize: "16px",
                                        width: "16px",
                                    }}
                                /> Configure
                            </ActionButton>
                        }
                    />
                )}
                {focusedNodeId && (
                    <TitleBar
                        title={focusedNodeId}
                        subtitle="Type"
                        onBack={() => setFocusedNodeId(undefined)}
                    />
                )}
                <ViewContent>
                    {isLoading ? (
                        <SpinnerContainer>
                            <ProgressRing color={ThemeColors.PRIMARY} />
                        </SpinnerContainer>
                    ) : error ? (
                        <SpinnerContainer>
                            <Typography variant="body1">Error fetching GraphQL model. Retrying...</Typography>
                        </SpinnerContainer>
                    ) : graphqlTypeModel ? (
                        <TypeDesignDiagram
                            typeModel={graphqlTypeModel.refs}
                            rootService={graphqlTypeModel.type}
                            isGraphql={true}
                            goToSource={handleOnGoToSource}
                            onTypeEdit={onTypeEdit}
                            focusedNodeId={focusedNodeId}
                            updateFocusedNodeId={handleFocusedNodeIdChange}
                            onTypeDelete={onTypeDelete}
                            verifyTypeDelete={verifyTypeDelete}
                        />
                    ) : null}
                </ViewContent>
            </View>
            {isServiceEditorOpen && (
                <GraphqlServiceEditor
                    data-testid="graphql-service-editor"
                    serviceIdentifier={serviceIdentifier}
                    filePath={filePath}
                    lineRange={{
                        startLine: {
                            line: position?.startLine,
                            offset: position?.startColumn,
                        },
                        endLine: {
                            line: position?.endLine,
                            offset: position?.endColumn,
                        },
                    }}
                    onClose={() => setIsServiceEditorOpen(false)}
                />
            )}
            {isTypeEditorOpen && editingType && editingType.codedata.node !== "CLASS" && (
                <PanelContainer
                    title={`Edit Type${getTypeKindDisplayName(editingType?.codedata?.node) ?
                        ` : ${getTypeKindDisplayName(editingType?.codedata?.node)}` :
                        ''}`}
                    show={true}
                    onClose={onTypeEditorClosed}
                >
                    <FormTypeEditor
                        key={editingType.name}
                        type={editingType}
                        onTypeChange={onTypeChange}
                        newType={false}
                        isPopupTypeForm={false}
                        isGraphql={true}
                        onTypeCreate={() => { }}
                        onSaveType={onSaveType}
                        getNewTypeCreateForm={getNewTypeCreateForm}
                        refetchTypes={true} />
                </PanelContainer>
            )}
            <EditorContext.Provider value={{ stack, push: pushTypeStack, pop: popTypeStack, peek: peekTypeStack, replaceTop: replaceTop }}>
                {stack.slice(1).map((item, i) => {
                    return (
                        <DynamicModal
                            key={i}
                            width={420}
                            height={600}
                            anchorRef={undefined}
                            title="Create New Type"
                            openState={isTypeEditorOpen}
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
                                    key={editingType?.name ?? 'new-type'}
                                    type={peekTypeStack()?.type}
                                    newType={peekTypeStack() ? peekTypeStack().isDirty : false}
                                    newTypeValue={peekTypeStack()?.type?.name ?? ''}
                                    isPopupTypeForm={true}
                                    isGraphql={true}
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
            {isTypeEditorOpen && editingType && editingType.codedata.node === "CLASS" && (
                <GraphqlObjectViewer
                    serviceIdentifier={serviceIdentifier}
                    onClose={onTypeEditorClosed}
                    type={editingType}
                    onImplementation={handleOnImplementation}
                />
            )}
        </>
    );
}
