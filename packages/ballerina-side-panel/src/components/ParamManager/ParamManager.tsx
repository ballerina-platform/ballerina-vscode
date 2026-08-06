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

import React, { useEffect, useState } from 'react';

import styled from '@emotion/styled';
import { ParamEditor } from './ParamEditor';
import { ParamItem } from './ParamItem';
import { Codicon, ErrorBanner, LinkButton, RequiredFormInput, ThemeColors } from '@wso2/ui-toolkit';
import { FormField, FormValues } from '../Form/types';
import { Controller } from 'react-hook-form';
import { useFormContext } from '../../context';
import { Imports, NodeKind, getPrimaryInputType } from '@wso2/ballerina-core';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { FieldFactory } from '../editors/FieldFactory';
import { buildRequiredRule, getFieldKeyForAdvanceProp } from '../editors/utils';

export interface Parameter {
    id: number;
    formValues: FormValues;
    key: string;
    value: string;
    icon: string;
    identifierEditable: boolean;
    identifierRange: any;
    hidden?: boolean;
    imports?: Imports;
}


export interface ParamConfig {
    paramValues: Parameter[];
    formFields: FormField[];
    handleParameter: (parameter: Parameter) => Parameter;
}

export interface ParamManagerProps {
    propertyKey: string;
    paramConfigs: ParamConfig;
    onChange?: (parameters: ParamConfig) => void,
    openRecordEditor?: (open: boolean) => void;
    readonly?: boolean;
    selectedNode?: NodeKind;
    setSubComponentEnabled?: (isAdding: boolean) => void;
    /** Overrides the "+ Add X" button text (defaults to the selectedNode-derived label below). */
    addButtonLabel?: string;
}

const AddButtonWrapper = styled.div`
	margin: 8px 0;
`;

const ParamContainer = styled.div`
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

export interface ParamManagerEditorProps {
    field: FormField;
    handleOnFieldFocus?: (key: string) => void;
    openRecordEditor?: (open: boolean) => void;
    selectedNode?: NodeKind;
    setSubComponentEnabled?: (isAdding: boolean) => void;
}

export function ParamManagerEditor(props: ParamManagerEditorProps) {
    const { field, openRecordEditor, selectedNode, setSubComponentEnabled } = props;
    const { form } = useFormContext();
    const { control, setValue, getValues } = form;

    const hasAdvancedFields = field.advanceProps?.length > 0;
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

    const handleOnShowAdvancedOptions = () => {
        setShowAdvancedOptions(true);
    }

    const handleOnHideAdvancedOptions = () => {
        setShowAdvancedOptions(false);
    }

    return (
        <ParamContainer>
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
                    required: buildRequiredRule({
                        isRequired: !field.optional,
                        label: field.label,
                        message: `${selectedNode === "DATA_MAPPER_DEFINITION" ? 'Input type' : field.label} is required`
                    })
                }}
                render={({ field: { onChange }, fieldState: { error } }) => (
                    <>
                        <ParamManager
                            propertyKey={field.key}
                            paramConfigs={field.paramManagerProps}
                            openRecordEditor={openRecordEditor}
                            onChange={async (config: ParamConfig) => {
                                onChange(config.paramValues);
                            }}
                            selectedNode={selectedNode}
                            setSubComponentEnabled={setSubComponentEnabled}
                            addButtonLabel={field.addNewButtonLabel}
                        />
                        {error && <ErrorBanner errorMsg={error.message.toString()} />}
                    </>
                )}
            />
            {hasAdvancedFields && (
                <Row>
                    Optional Configurations
                    <ButtonContainer>
                        {!showAdvancedOptions && (
                            <LinkButton
                                onClick={handleOnShowAdvancedOptions}
                                sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}
                            >
                                <Codicon name={"chevron-down"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                                Expand
                            </LinkButton>
                        )}
                        {showAdvancedOptions && (
                            <LinkButton
                                onClick={handleOnHideAdvancedOptions}
                                sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}
                            >
                                <Codicon name={"chevron-up"} iconSx={{ fontSize: 12 }} sx={{ height: 12 }} />
                                Collapse
                            </LinkButton>
                        )}
                    </ButtonContainer>
                </Row>
            )}
            {hasAdvancedFields && showAdvancedOptions && (
                <EditorContainer>
                    {field.advanceProps.map((advanceProp) => {
                        advanceProp.key = getFieldKeyForAdvanceProp(field.key, advanceProp.key);
                        if (getValues(advanceProp.key) === undefined) {
                            setValue(advanceProp.key, advanceProp.value);
                        }
                        return <FieldFactory field={advanceProp} />
                    })}
                </EditorContainer>
            )}
        </ParamContainer>
    );

}

export function ParamManager(props: ParamManagerProps) {
    const { propertyKey, paramConfigs, readonly, onChange, openRecordEditor, selectedNode, setSubComponentEnabled } = props;
    const { rpcClient } = useRpcContext();

    const [editingSegmentId, setEditingSegmentId] = useState<number>(-1);
    const [isNew, setIsNew] = useState(false);
    const [parameters, setParameters] = useState<Parameter[]>(paramConfigs.paramValues);
    const [paramComponents, setParamComponents] = useState<React.ReactElement[]>([]);
    const [isGraphql, setIsGraphql] = useState<boolean>(false);
    const [autoOpenedWaitDataEditor, setAutoOpenedWaitDataEditor] = useState<boolean>(false);
    const addButtonLabel = props.addButtonLabel ?? (selectedNode === "DATA_MAPPER_DEFINITION"
        ? "Input"
        : selectedNode === "WAIT_DATA"
            ? "Data Waits"
            : isGraphql
                ? "Argument"
                : "Parameter");

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

    const onChangeParam = (updatedParams: Parameter) => {
        const updatedParameters = [...parameters];
        const index = updatedParameters.findIndex(param => param.id === updatedParams.id);
        if (index !== -1) {
            updatedParameters[index] = paramConfigs.handleParameter(updatedParams);
        }
        setParameters(updatedParameters);
        onChange({ ...paramConfigs, paramValues: updatedParameters });
    };

    const onSaveParam = (paramConfig: Parameter) => {
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

    useEffect(() => {
        rpcClient.getVisualizerLocation().then(context => {
            if (context.view === "GraphQL Diagram") {
                setIsGraphql(true);
            }
        });
        renderParams();
    }, [parameters, editingSegmentId, paramConfigs]);

    useEffect(() => {
        if (
            selectedNode === "WAIT_DATA" &&
            !readonly &&
            !autoOpenedWaitDataEditor &&
            parameters.length === 0 &&
            editingSegmentId === -1
        ) {
            onAddClick();
            setAutoOpenedWaitDataEditor(true);
        }
    }, [selectedNode, readonly, autoOpenedWaitDataEditor, parameters.length, editingSegmentId]);

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
                            if (getPrimaryInputType(field.types)?.fieldType === "TYPE" && field.type === "ACTION_TYPE" && param.formValues['isGraphqlId'] !== undefined) {
                                field.isGraphqlId = param.formValues['isGraphqlId'];
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
                        <>{`Add ${addButtonLabel}`}</>
                    </LinkButton>
                </AddButtonWrapper>
            )}
        </div>
    );
}
