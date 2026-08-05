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

import { useEffect, useState } from 'react';
import { FunctionModel, LineRange, RecordTypeField, Property, PropertyTypeMemberInfo, NodePosition, getPrimaryInputType } from '@wso2/ballerina-core';
import { useRpcContext } from '@wso2/ballerina-rpc-client';
import { FormField, FormImports, FormValues } from '@wso2/ballerina-side-panel';
import { ArtifactForm } from '../Forms/ArtifactForm';
import { TopNavigationBar } from '../../../components/TopNavigationBar';
import { TitleBar } from '../../../components/TitleBar';
import { ViewContent, View } from '@wso2/ui-toolkit';
import styled from '@emotion/styled';
import {
    logError,
    handleParamChange,
    convertSchemaToFormFields,
    convertParameterToParamValue,
    handleFunctionCreate
} from './utils';
import { LoaderContainer } from '../../../components/RelativeLoader/styles';
import { RelativeLoader } from '../../../components/RelativeLoader';

const FormContainer = styled.div`
    display: flex;
    flex-direction: column;
    max-width: 600px;
    gap: 20px;
`;

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;
export interface ServiceFunctionFormProps {
    position: NodePosition;
    currentFilePath?: string;
    projectPath?: string;
    isAgentDefinitionConstructor?: boolean;
}

export function ServiceFunctionForm(props: ServiceFunctionFormProps) {
    const { position, currentFilePath, projectPath, isAgentDefinitionConstructor } = props;
    const { rpcClient } = useRpcContext();
    const [model, setFunctionModel] = useState<FunctionModel | null>(null);
    const [fields, setFields] = useState<FormField[]>([]);
    const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    const loadFunctionData = async () => {
        try {
            if (position && currentFilePath) {
                const functionModel = await rpcClient.getServiceDesignerRpcClient().getFunctionFromSource({
                    filePath: currentFilePath,
                    codedata: {
                        lineRange: {
                            fileName: currentFilePath,
                            startLine: {
                                line: position.startLine,
                                offset: position.startColumn
                            },
                            endLine: {
                                line: position.endLine,
                                offset: position.endColumn
                            }
                        }
                    }
                });
                setFunctionModel(functionModel.function);
            }
        } catch (error) {
            logError({
                type: 'LOAD_ERROR',
                message: 'Failed to load function data from source',
                originalError: error
            });
        }
    };

    useEffect(() => {
        if (rpcClient && position && currentFilePath) {
            loadFunctionData();
        } else {
            logError({
                type: 'VALIDATION_ERROR',
                message: 'Missing required props or rpcClient',
                originalError: { rpcClient: !!rpcClient, position: !!position, currentFilePath: !!currentFilePath }
            });
        }
    }, [rpcClient, position, currentFilePath, projectPath]);

    const initializeRecordTypeFields = () => {
        if (model?.properties) {
            const recordFields: RecordTypeField[] = Object.entries(model.properties)
                .filter(([_, property]) =>
                    getPrimaryInputType(property.types)?.typeMembers &&
                    getPrimaryInputType(property.types)?.typeMembers.some((member: PropertyTypeMemberInfo) => member.kind === "RECORD_TYPE")
                )
                .map(([key, property]) => ({
                    key,
                    property: {
                        ...property,
                        metadata: {
                            label: property.metadata?.label || key,
                            description: property.metadata?.description || ''
                        },
                        types: [{ fieldType: "STRING", selected: false }],
                        diagnostics: {
                            hasDiagnostics: property.diagnostics && property.diagnostics.length > 0,
                            diagnostics: property.diagnostics
                        }
                    } as Property,
                    recordTypeMembers: getPrimaryInputType(property.types)?.typeMembers?.filter((member: PropertyTypeMemberInfo) => member.kind === "RECORD_TYPE")
                }));
            setRecordTypeFields(recordFields);
        }
    };
    
    const initializeFormFields = () => {
        if (!model) return;

        const initialFields: FormField[] = [
            {
                key: 'name',
                label: model.name.metadata?.label || 'Operation Name',
                type: 'IDENTIFIER',
                optional: model.name.optional,
                editable: model.name.editable,
                advanced: model.name.advanced,
                enabled: model.name.enabled,
                documentation: model.name.metadata?.description || '',
                value: model.name.value,
                types:  model.name.types,
                lineRange: model?.name?.codedata?.lineRange,
            },
            {
                key: 'parameters',
                label: 'Parameters',
                type: 'PARAM_MANAGER',
                optional: true,
                editable: true,
                enabled: true,
                documentation: '',
                value: model.parameters.map((param, index) => convertParameterToParamValue(param, index)),
                paramManagerProps: {
                    paramValues: model.parameters.map((param, index) => convertParameterToParamValue(param, index)),
                    formFields: convertSchemaToFormFields(model.schema),
                    handleParameter: handleParamChange
                },
                types: [{ fieldType: "PARAM_MANAGER", selected: false }],
            },
            {
                key: 'returnType',
                label: model.returnType.metadata?.label || 'Return Type',
                type: 'TYPE',
                optional: model.returnType.optional,
                enabled: model.returnType.enabled,
                editable: model.returnType.editable,
                advanced: model.returnType.advanced,
                documentation: model.returnType.metadata?.description || '',
                value: model.returnType.value,
                types: model.returnType.types
            }
        ];
        const enabledFields = initialFields.filter(field => field.enabled);
        setFields(enabledFields);
    };

    useEffect(() => {
        initializeFormFields();
        initializeRecordTypeFields();
    }, [model]);

    const onFunctionCreate = (data: FormValues, formImports: FormImports) => {
        if (model) {
            handleFunctionCreate(data, formImports, model, rpcClient, setIsSaving, currentFilePath, position);
        }
    };

    return (
        <View>
            <TopNavigationBar projectPath={projectPath} />
            <TitleBar
                title={isAgentDefinitionConstructor ? "Agent Definition Constructor" : "Service Function"}
                subtitle={isAgentDefinitionConstructor ? "Configure the inputs used to create this agent" : "Build reusable custom flows"}
            />
            <ViewContent padding>
                <Container>
                    {!model ? (
                        <LoaderContainer>
                            <RelativeLoader />
                        </LoaderContainer>
                    ) : (
                        <FormContainer>
                            {fields.length > 0 && (
                                <ArtifactForm
                                    fileName={currentFilePath || ''}
                                    targetLineRange={model.codedata?.lineRange as LineRange}
                                    fields={fields}
                                    onSubmit={onFunctionCreate}
                                    submitText="Save"
                                    helperPaneSide="left"
                                    isSaving={isSaving}
                                    preserveFieldOrder={true}
                                    recordTypeFields={recordTypeFields}
                                />
                            )}
                        </FormContainer>
                    )}
                </Container>
            </ViewContent>
        </View>
    );
}
