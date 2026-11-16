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

import React, { useState } from "react";

import { Button, Codicon, ThemeColors } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";

import { FormField, FormValues } from "../Form/types";
import { useFormContext } from "../../context";
import Form from "../Form";
import { DeleteIconWrapper, EditIconWrapper, HeaderLabel } from "../ParamManager/styles";
import { FieldTypeChip } from "./FieldTypeChip";

namespace S {
    export const Container = styled.div({
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
    });

    export const LabelContainer = styled.div({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
    });

    export const Label = styled.label({
        color: 'var(--vscode-editor-foreground)',
        textTransform: 'capitalize',
    });

    export const Description = styled.div({
        color: 'var(--vscode-list-deemphasizedForeground)',
    });

    export const DropdownContainer = styled.div({
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        width: '100%',
    });

    export const AddNewButton = styled(Button)`
        & > vscode-button {
            color: var(--vscode-textLink-activeForeground);
            border-radius: 0px;
            padding: 3px 5px;
            margin-top: 4px;
        };
        & > vscode-button > * {
            margin-right: 6px;
        };
    `;

    export const AddNewButtonOption = styled.div({
        width: '100%',
        display: 'flex',
        padding: '5px',
        gap: '8px',
    });

    export const DeleteButton = styled(Button)`
        & > vscode-button {
            color: ${ThemeColors.ERROR};
        }
    `;

    export const FormSection = styled.div({
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        borderRadius: '5px',
        padding: '10px',
        border: '1px solid var(--vscode-dropdown-border)'
    });

    export const ContentSection = styled.div({
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'space-between',
    });
}

const HeaderSetLabelContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: var(--vscode-font-family);
`;

const HeaderSetName = styled.span`
    color: var(--vscode-editor-foreground, #222);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--vscode-font-family);
`;

const HeaderSetType = styled.span`
    font-size: 13px;
    color: var(--vscode-descriptionForeground, #888);
    background: var(--vscode-editorWidget-background, #f5f5f5);
    border-radius: 4px;
    padding: 2px 8px;
    letter-spacing: 0.1px;
`;

const HeaderSetOptional = styled.span`
    font-size: 13px;
    color: var(--vscode-editorHint-foreground, #b0b0b0);
    margin-left: 8px;
    font-style: italic;
`;

const HeaderSetLabelWrapper = styled.div<{ readonly?: boolean }>`
    display: flex;
    align-items: center;
    ${(props) => !props.readonly && `
        cursor: pointer;
    `}
    margin-left: 12px;
    line-height: 14px;
`;

const HeaderSetActionIconWrapper = styled.div`
    display: flex;
    align-items: center;
    cursor: pointer;
    height: 14px;
    width: 14px;
    margin-right: 44px;
`;


interface HeaderSetEditorProps {
    field: FormField;
}

interface HeaderSet {
    name: string;
    type: string;
    optional: boolean;
}

export function HeaderSetEditor(props: HeaderSetEditorProps) {
    const { field } = props;
    const { form } = useFormContext();
    const { setValue } = form;

    const [headerSets, setHeaderSets] = useState<HeaderSet[]>(Array.isArray(field.value) ? field.value : []);
    const [formOpen, setFormOpen] = useState<boolean>(false);

    const [headerSetToEdit, setHeaderSetToEdit] = useState<HeaderSet | null>(null);
    const [headerSetIndexToEdit, setHeaderSetIndexToEdit] = useState<number | null>(null);

    const onAddAnother = () => {
        setFormOpen(true);
    };

    const onDelete = (indexToDelete: number) => {
        const updatedHeaderSets = headerSets.filter((_, index) => index !== indexToDelete);
        setHeaderSets(updatedHeaderSets);
        setValue(field.key, updatedHeaderSets);
    };

    const onSubmit = (data: FormValues) => {
        console.log(data);
        const newHeaderSet: HeaderSet = {
            name: data.name,
            type: data.type,
            optional: Boolean(data.optional)
        };
        const updatedHeaderSets = [...headerSets];
        if (headerSetIndexToEdit !== null) {
            updatedHeaderSets[headerSetIndexToEdit] = newHeaderSet;
        } else {
            updatedHeaderSets.push(newHeaderSet);
        }
        setHeaderSets(updatedHeaderSets);
        setValue(field.key, updatedHeaderSets);
        setFormOpen(false);
    };


    const onEditClick = (headerSet: HeaderSet, index: number) => {
        setFormOpen(true);
        setHeaderSetToEdit(headerSet);
        setHeaderSetIndexToEdit(index);
    };

    const onCancelForm = () => {
        setFormOpen(false);
        setHeaderSetToEdit(null);
        setHeaderSetIndexToEdit(null);
    };


    const fields: FormField[] = [
        {
            key: "name",
            enabled: true,
            optional: false,
            editable: true,
            documentation: "Name of the header",
            value: headerSetToEdit?.name || "",
            types: [{ fieldType: "IDENTIFIER", selected: false }],
            label: "Name",
            type: "text"
        },
        {
            key: "type",
            enabled: true,
            optional: false,
            editable: true,
            documentation: "Type of the header",
            value: headerSetToEdit?.type || field.items?.[0] || "",
            types: [{ fieldType: "SINGLE_SELECT", ballerinaType: "string", selected: false }],
            label: "Type",
            type: "SINGLE_SELECT",
            items: field.items,
        },
        {
            key: "optional",
            enabled: true,
            optional: true,
            editable: true,
            documentation: "Required or Optional",
            value: headerSetToEdit?.optional ?? false as any,
            types: [{ fieldType: "FLAG", selected: true }],
            label: "Optional",
            type: "FLAG",
        }
    ];

    return (
        <S.Container>
            <S.LabelContainer>
                <S.Label>{field.label}</S.Label>
                <FieldTypeChip types={field.types} />
            </S.LabelContainer>
            <S.Description>{field.documentation}</S.Description>
            {headerSets.map((headerSet, index) => (
                <S.DropdownContainer key={`${field.key}-${index}`}>
                    <HeaderSetItem headerSet={headerSet} readonly={!field.editable} index={index} onDelete={onDelete} onEditClick={onEditClick} />
                </S.DropdownContainer>
            ))}
            {!formOpen &&
                <S.AddNewButton
                    appearance='icon'
                    aria-label="add"
                    onClick={onAddAnother}
                    disabled={!field.editable}
                >
                    <Codicon name="add" />
                    Add
                </S.AddNewButton>
            }
            {formOpen &&
                <S.FormSection>
                    <Form
                        formFields={fields}
                        onSubmit={onSubmit}
                        onCancelForm={onCancelForm}
                        nestedForm={true}
                        submitText="Save Header"
                        cancelText="Cancel"
                    />
                </S.FormSection>
            }
        </S.Container>
    );
}

interface HeaderSetItemProps {
    headerSet: HeaderSet;
    readonly: boolean;
    index: number;
    onDelete: (index: number) => void;
    onEditClick: (headerSet: HeaderSet, index: number) => void;
}

function HeaderSetItem(props: HeaderSetItemProps) {
    const { headerSet, readonly, index, onDelete, onEditClick } = props;

    const handleDelete = () => {
        onDelete(index);
    };
    const handleEdit = () => {
        if (!readonly) {
            onEditClick(headerSet, index);
        }
    };

    const label = (
        <HeaderSetLabelContainer>
            {headerSet.type && (
                <>
                    <HeaderSetType>
                        {headerSet.type}
                    </HeaderSetType>
                    {headerSet.name && (
                        <HeaderSetName>{headerSet.name}</HeaderSetName>
                    )}
                    {headerSet.optional && (
                        <HeaderSetOptional>
                            (optional)
                        </HeaderSetOptional>
                    )}
                </>
            )}
            {!headerSet.type && headerSet.name && (
                <HeaderSetName>
                    {headerSet.name}
                </HeaderSetName>
            )}
        </HeaderSetLabelContainer>
    );

    return (
        <HeaderLabel data-testid={`${headerSet.name}-item`}>
            <S.ContentSection>
                <HeaderSetLabelWrapper
                    data-test-id={`${headerSet.name}-header-set`}
                    readonly={readonly}
                    onClick={!readonly ? handleEdit : undefined}
                >
                    {label}
                </HeaderSetLabelWrapper>
                {!readonly && (
                    <HeaderSetActionIconWrapper>
                        <EditIconWrapper>
                            <Codicon name="edit" onClick={handleEdit} />
                        </EditIconWrapper>
                        <DeleteIconWrapper>
                            <Codicon name="trash" onClick={handleDelete} />
                        </DeleteIconWrapper>
                    </HeaderSetActionIconWrapper>
                )}
            </S.ContentSection>
        </HeaderLabel>
    );
} 
