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
import { Type, TypeNodeKind, Member, PayloadContext, Imports } from "@wso2/ballerina-core";
import { ThemeColors } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import DynamicModal, { MODAL_BACKDROP } from "../../components/Modal";

import { EditorContext, StackItem } from "@wso2/type-editor";
import { BreadcrumbContainer, BreadcrumbItem, BreadcrumbSeparator } from "../../views/BI/Forms/FlowNodeForm";
import { FormTypeEditor } from "../../views/BI/TypeEditor";

export const Title = styled.div`
    color: ${ThemeColors.ON_SURFACE};
`;

// const BreadcrumbContainer = styled.div`
//     display: flex;
//     align-items: center;
//     gap: 8px;
//     padding: 8px 20px;
//     background: ${ThemeColors.SURFACE_CONTAINER};
//     border-bottom: 1px solid ${ThemeColors.OUTLINE_VARIANT};
// `;

// const BreadcrumbItem = styled.span`
//     color: ${ThemeColors.ON_SURFACE_VARIANT};
//     font-size: var(--vscode-font-size);
    
//     &:last-child {
//         color: ${ThemeColors.ON_SURFACE};
//         font-weight: 500;
//     }
// `;

// const BreadcrumbSeparator = styled.span`
//     color: ${ThemeColors.ON_SURFACE_VARIANT};
//     font-size: var(--vscode-font-size);
// `;

interface EntryPointTypeCreatorProps {
    isOpen: boolean;
    onClose: () => void;
    onTypeCreate: (type: Type | string, imports?: Imports) => void;
    initialTypeName?: string;
    modalTitle?: string;
    modalWidth?: number;
    modalHeight?: number;
    payloadContext?: PayloadContext;
    defaultTab?: 'import' | 'create-from-scratch' | 'browse-exisiting-types';
    note?: string;
}

interface TypeEditorState {
    isTypeCreatorOpen: boolean;
    editingTypeId: string | undefined;
    newTypeName: string | undefined;
    editingType: Type;
}

export function EntryPointTypeCreator(props: EntryPointTypeCreatorProps) {
    const { modalTitle, initialTypeName, modalWidth, modalHeight, payloadContext, isOpen, onClose, onTypeCreate, defaultTab, note } = props;

    const [typeEditorState, setTypeEditorState] = React.useState<TypeEditorState>({
        isTypeCreatorOpen: false,
        editingTypeId: undefined,
        newTypeName: undefined,
        editingType: undefined,
    });

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

    const peekTypeStack = (): StackItem | null => {
        return stack.length > 0 ? stack[stack.length - 1] : null;
    };

    const replaceTop = (item: StackItem) => {
        if (stack.length <= 1) return;
        setStack((prev) => {
            const newStack = [...prev];
            newStack[newStack.length - 1] = item;
            return newStack;
        });
    }

    useEffect(() => {
        if (isOpen) {
            setTypeEditorState((prevState) => ({
                ...prevState,
                isTypeCreatorOpen: true,
            }));
        }
    }, [isOpen]);

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
    };

    const onSaveType = (type: Type | string, imports?: Imports) => {
        // here on saveType if its the rootTypeEditor which is the rootFormTypeEditor we should trrigger onTypeCreate
        if (stack.length === 1) {
            // This is the root type editor, trigger onTypeCreate
            onTypeCreate(type, imports);
            // Close the modal by updating the state
            setTypeEditorState({
                editingTypeId: undefined,
                editingType: undefined,
                isTypeCreatorOpen: false,
                newTypeName: undefined,
            });
            setStack([{
                isDirty: false,
                type: undefined
            }]);
            onClose();
            return;
        }

        if (stack.length > 0) {
            setRefetchForCurrentModal(true);
            popTypeStack();
        }
        setTypeEditorState({
            ...typeEditorState,
            isTypeCreatorOpen: stack.length !== 1,
        });
    }

    const createNewType = (): Type => ({
        name: "NewType",
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

    const getNewTypeCreateForm = () => {
        pushTypeStack({
            type: createNewType(),
            isDirty: false
        });
        setTypeEditorState({
            ...typeEditorState,
            isTypeCreatorOpen: true,
        })
    }


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
        onClose();
    };

    const newTypeModel = (): Type => {
        return {
            name: initialTypeName || "MyType",
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


    return (
        <>
            <DynamicModal
                width={modalWidth}
                height={modalHeight}
                anchorRef={undefined}
                title={modalTitle}
                openState={typeEditorState.isTypeCreatorOpen}
                setOpenState={onTypeEditorClosed}
                sx={{ backgroundColor: MODAL_BACKDROP }}
            >
                <div style={{ height: '525px', overflow: 'auto' }}>
                    <FormTypeEditor
                        key={typeEditorState.editingTypeId ?? typeEditorState.newTypeName ?? 'new-type'}
                        type={newTypeModel()}
                        newType={typeEditorState.editingTypeId ? false : true}
                        onTypeChange={onTypeChange}
                        onTypeCreate={() => { }}
                        isPopupTypeForm={true}
                        onSaveType={onSaveType}
                        getNewTypeCreateForm={getNewTypeCreateForm}
                        refetchTypes={false}
                        isContextTypeForm={true}
                        payloadContext={payloadContext}
                        defaultTab={defaultTab}
                        note={note}
                    />
                </div>
            </DynamicModal>
            <EditorContext.Provider value={{ stack, push: pushTypeStack, pop: popTypeStack, peek: peekTypeStack, replaceTop: replaceTop }}>

                {stack.slice(1).map((item, i) => {
                    return (
                        <DynamicModal
                            key={i}
                            width={584}
                            height={564}
                            anchorRef={undefined}
                            title="Create New Type"
                            openState={typeEditorState.isTypeCreatorOpen}
                            sx={i === 0 ? { background: 'rgba(0, 0, 0, 0.1)' } : undefined}
                            setOpenState={handleTypeEditorStateChange}>
                            <>
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
                                <div style={{ height: '500px', overflow: 'auto' }}>
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
                                        defaultTab={defaultTab}
                                    />
                                </div>
                            </>
                        </DynamicModal>
                    )
                })}
            </EditorContext.Provider>
        </>
    );
}
