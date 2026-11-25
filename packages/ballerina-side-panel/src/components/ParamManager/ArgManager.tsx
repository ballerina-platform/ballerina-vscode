/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import React, { useEffect, useState } from 'react';

import styled from '@emotion/styled';
import { ParamEditor } from './ParamEditor';
import { ParamItem } from './ParamItem';
import { ParamConfig, Parameter, useHeldParameters } from './ParamManager';
import { Codicon, ErrorBanner, LinkButton, RequiredFormInput, ThemeColors } from '@wso2/ui-toolkit';
import { FormField, FormValues } from '../Form/types';
import { Controller } from 'react-hook-form';
import { useFormContext } from '../../context';
import { Imports, NodeKind, TriggerKind } from '@wso2/ballerina-core';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { EditorFactory } from '../editors/EditorFactory';
import { getFieldKeyForAdvanceProp, getPropertyFromFormField } from '../editors/utils';

export interface ArgManagerProps {
    field: FormField;
    onChange?: (parameters: ParamConfig) => void,
    openRecordEditor?: (open: boolean) => void;
    readonly?: boolean;
    selectedNode?: NodeKind;
    setSubComponentEnabled?: (isAdding: boolean) => void;
    updateImports?: (key: string, imports: Imports) => void;
    /** The list the form holds, which the rows follow. */
    value?: Parameter[];
}

const AddButtonWrapper = styled.div`
	margin: 8px 0;
`;

const ArgContainer = styled.div`
	display: block;
    width: 100%;
`;

const HeaderContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const Description = styled.div`
    color: var(--vscode-list-deemphasizedForeground);
`;

const LabelContainer = styled.label`
    display: flex;
    align-items: center;
`;

const Label = styled.label`
    color: var(--vscode-editor-foreground);
`;

const Row = styled.div<{}>`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding-inline: 8px;
    margin-bottom: 8px;
`;

const EditorContainer = styled.div<{}>`
    padding-inline: 8px;
`

const ButtonContainer = styled.div<{}>`
    display: flex;
    flex-direction: row;
    flex-grow: 1;
    justify-content: flex-end;
`;

export interface ArgManagerEditorProps {
    field: FormField;
    handleOnFieldFocus?: (key: string) => void;
    openRecordEditor?: (open: boolean) => void;
    selectedNode?: NodeKind;
    setSubComponentEnabled?: (isAdding: boolean) => void;
    updateImports?: (key: string, imports: Imports) => void;
}

export function ArgManagerEditor(props: ArgManagerEditorProps) {
    const { field, openRecordEditor, selectedNode, setSubComponentEnabled, updateImports } = props;
    const { form } = useFormContext();
    const { control } = form;

    return (
        <ArgContainer>
            <HeaderContainer>
                <LabelContainer>
                    <Label>{field.label}</Label>
                    {!field.optional && <RequiredFormInput />}
                </LabelContainer>
                <Description>{field.documentation}</Description>
            </HeaderContainer>
            <Controller
                control={control}
                name={field.key}
                rules={{
                    required: {
                        value: !field.optional && !field.placeholder,
                        message: "Arguments are required"
                    }
                }}
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <>
                        <ArgManager
                            value={value}
                            field={field}
                            openRecordEditor={openRecordEditor}
                            onChange={async (config: ParamConfig) => {
                                onChange(config.paramValues);
                            }}
                            selectedNode={selectedNode}
                            setSubComponentEnabled={setSubComponentEnabled}
                            updateImports={updateImports}
                        />
                        {error && <ErrorBanner errorMsg={error.message.toString()} />}
                    </>
                )}
            />
        </ArgContainer>
    );

}

export function ArgManager(props: ArgManagerProps) {
    const { field, readonly, onChange, openRecordEditor, setSubComponentEnabled, updateImports, value } = props;
    const propertyKey = field.key;
    const paramConfigs = field.paramManagerProps;

    const { rpcClient } = useRpcContext();
    const { fileName, targetLineRange } = useFormContext();

    const [editingSegmentId, setEditingSegmentId] = useState<number>(-1);
    const [isNew, setIsNew] = useState(false);
    const [parameters, setParameters] = useState<Parameter[]>(paramConfigs.paramValues);
    useHeldParameters(value, parameters, setParameters);
    const [paramComponents, setParamComponents] = useState<React.ReactElement[]>([]);

    useEffect(() => {
        renderParams();
    }, [parameters, editingSegmentId, paramConfigs]);

    const getTypeFromArg = async (
        arg: string
    ) => {
        try {
            const simpleTypeResponse = await rpcClient.getBIDiagramRpcClient().getSimpleTypeOfExpression({
                filePath: fileName,
                position: targetLineRange.startLine,
                expression: arg
            });
            return simpleTypeResponse.type;
        } catch (error) {
            console.error(">>> Error getting type from FQN in ArgManager", error);
            return undefined;
        }
    };

    const onEdit = (param: Parameter) => {
        setEditingSegmentId(param.id);
        setSubComponentEnabled?.(true);
    };

    const getNewParam = (fields: FormField[], index: number): Parameter => {
        const paramInfo: FormValues = {};
        fields.forEach((field) => {
            paramInfo[field.key] = "";
        });
        return {
            id: index,
            formValues: paramInfo,
            key: "",
            value: "",
            icon: "",
            identifierEditable: true,
            identifierRange: undefined
        };
    };

    const onAddClick = () => {
        const updatedParameters = [...parameters];
        setEditingSegmentId(updatedParameters.length);
        const newParams: Parameter = getNewParam(paramConfigs.formFields, updatedParameters.length);
        updatedParameters.push(newParams);
        setParameters(updatedParameters);
        setIsNew(true);
        setSubComponentEnabled?.(true);
    };

    const onDelete = (param: Parameter) => {
        const updatedParameters = [...parameters];
        const indexToRemove = param.id;
        if (indexToRemove >= 0 && indexToRemove < updatedParameters.length) {
            updatedParameters.splice(indexToRemove, 1);
        }
        const reArrangedParameters = updatedParameters.map((item, index) => ({
            ...item,
            id: index
        }));
        setParameters(reArrangedParameters);
        onChange({ ...paramConfigs, paramValues: reArrangedParameters });
    };

    const onChangeParam = (updatedParam: Parameter) => {
        const updatedParameters = [...parameters];
        const index = updatedParameters.findIndex(param => param.id === updatedParam.id);
        if (index !== -1) {
            updatedParameters[index] = handleArgChange(updatedParam, parameters);
        }
        setParameters(updatedParameters);
        onChange({ ...paramConfigs, paramValues: updatedParameters });
    };

    const onSaveParam = async (paramConfig: Parameter) => {
        const type = await getTypeFromArg(paramConfig.formValues['variable']);
        if (type) {
            paramConfig.formValues['type'] = type.name;
            if (type.imports) {
                updateImports?.(propertyKey, type.imports);
            }
        }
        onChangeParam(paramConfig);
        setEditingSegmentId(-1);
        setIsNew(false);
        setSubComponentEnabled?.(false);
    };

    const onParamEditCancel = (param: Parameter) => {
        setEditingSegmentId(-1);
        setSubComponentEnabled?.(false);
        if (isNew) {
            onDelete(param);
        }
        setIsNew(false);
    };

    const renderParams = () => {
        const render: React.ReactElement[] = [];
        parameters
            .forEach((param, index) => {
                if (editingSegmentId === index) {
                    const newParamConfig = {
                        ...paramConfigs,
                        formFields: paramConfigs.formFields.map(field => ({ ...field }))
                    };
                    newParamConfig.formFields.forEach(field => {
                        if (param.formValues[field.key]) {
                            field.value = param.formValues[field.key];
                            if (field.key === "variable") {
                                field.editable = param.identifierEditable;
                                field.lineRange = param.identifierRange;
                            }
                        }
                    })
                    render.push(
                        <ParamEditor
                            key={param.id}
                            propertyKey={propertyKey}
                            parameter={param}
                            paramFields={newParamConfig.formFields}
                            onSave={onSaveParam}
                            onCancelEdit={onParamEditCancel}
                            openRecordEditor={openRecordEditor}
                        />
                    )
                } else if ((editingSegmentId !== index && !(param.hidden ?? false))) {
                    render.push(
                        <ParamItem
                            key={param.id}
                            param={param}
                            readonly={editingSegmentId !== -1 || readonly}
                            onDelete={onDelete}
                            onEditClick={onEdit}
                        />
                    );
                }
            });
        setParamComponents(render);
    }

    return (
        <div>
            {paramComponents}
            {(editingSegmentId === -1) && (
                <AddButtonWrapper>
                    <LinkButton sx={readonly && { color: "var(--vscode-badge-background)" }} onClick={!readonly && onAddClick} >
                        <Codicon name="add" />
                        <>{"Add Argument"}</>
                    </LinkButton>
                </AddButtonWrapper>
            )}
        </div>
    );
}

function handleArgChange(param: Parameter, allParams: Parameter[]) {
    const arg = param.formValues["variable"];
    const name = arg.split('.').pop();

    let key = name;
    let i = 1;
    while (allParams.some(p => p.key === key && p.id !== param.id)) {
        key = name + (i++);
    }

    return {
        ...param,
        key: key
    };
}
