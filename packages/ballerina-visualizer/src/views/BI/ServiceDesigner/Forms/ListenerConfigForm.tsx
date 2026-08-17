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

import { useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { Typography, ProgressRing } from "@wso2/ui-toolkit";
import { FormField, FormImports, FormValues, StringTemplateEditorConfig } from "@wso2/ballerina-side-panel";
import { ListenerModel, LineRange, RecordTypeField, Property, getPrimaryInputType } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import ArtifactForm from "../../Forms/ArtifactForm";
import { getImportsForProperty } from "../../../../utils/bi";
import { isValueEqual } from "../utils";

const Container = styled.div`
    /* padding: 0 20px 20px; */
    max-width: 600px;
    > div:last-child {
        /* padding: 20px 0; */
        > div:last-child {
            justify-content: flex-start;
        }
    }
`;

const FormContainer = styled.div`
    /* padding-top: 15px; */
    padding-bottom: 15px;
`;

const LoadingContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 80vh;
    flex-direction: column;
`;

interface ListenerConfigFormProps {
    listenerModel: ListenerModel;
    onSubmit?: (data: ListenerModel) => void;
    isSaving?: boolean;
    onBack?: () => void;
    formSubmitText?: string;
    onChange?: (data: ListenerModel) => void;
    onDirtyChange?: (isDirty: boolean) => void;
    onValidityChange?: (isValid: boolean) => void;
    filePath?: string;
}

export function ListenerConfigForm(props: ListenerConfigFormProps) {
    const { rpcClient } = useRpcContext();

    const [listenerFields, setListenerFields] = useState<FormField[]>([]);
    const { listenerModel, onSubmit, onBack, formSubmitText = "Next", isSaving, onChange, onDirtyChange, onValidityChange, filePath: targetFilePath } = props;
    const [filePath, setFilePath] = useState<string>('');
    const [targetLineRange, setTargetLineRange] = useState<LineRange>();
    const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);
    const initialFieldValuesRef = useRef<Record<string, any>>({});

    useEffect(() => {
        let cancelled = false;
        const recordTypeFields: RecordTypeField[] = Object.entries(listenerModel.properties)
            .filter(([_, property]) =>
                getPrimaryInputType(property.types)?.typeMembers &&
                getPrimaryInputType(property.types)?.typeMembers.some(member => member.kind === "RECORD_TYPE")
            )
            .map(([key, property]) => ({
                key,
                property: {
                    ...property,
                    metadata: {
                        label: property.metadata?.label || key,
                        description: property.metadata?.description || ''
                    },
                    types: property?.types || [{ fieldType: 'STRING' }],
                    diagnostics: {
                        hasDiagnostics: property.diagnostics && property.diagnostics.length > 0,
                        diagnostics: property.diagnostics
                    }
                } as Property,
                recordTypeMembers: getPrimaryInputType(property.types)?.typeMembers.filter(member => member.kind === "RECORD_TYPE")
            }));
        setRecordTypeFields(recordTypeFields);

        if (listenerModel) {
            const convertedFields = convertConfig(listenerModel);
            setListenerFields(convertedFields);
            initialFieldValuesRef.current = convertedFields.reduce((acc, field) => {
                acc[field.key] = field.value;
                return acc;
            }, {} as Record<string, any>);
            onDirtyChange?.(false);
        }
        if (targetFilePath) {
            setFilePath(targetFilePath);
        } else {
            rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: ['main.bal'] }).then((response) => {
                if (!cancelled && !targetFilePath) {
                    setFilePath(response.filePath);
                }
            });
        }
        return () => {
            cancelled = true;
        };
    }, [listenerModel, rpcClient, targetFilePath]);

    const handleListenerSubmit = async (data: FormValues, formImports: FormImports) => {
        listenerFields.forEach(val => {
            if (data[val.key] !== undefined) {
                val.value = data[val.key]
            }
            val.imports = getImportsForProperty(val.key, formImports);
        })
        const response = updateConfig(listenerFields, listenerModel);
        onSubmit(response);
    };

    const handleListenerChange = (_fieldKey: string, _value: any, allValues: FormValues) => {
        if (onChange && !allValues["defaultListener"]) {
            let hasChanges = false;
            listenerFields.forEach(val => {
                if (allValues[val.key] !== undefined && !isValueEqual(allValues[val.key], initialFieldValuesRef.current[val.key])) {
                    hasChanges = true;
                }
                if (allValues[val.key] !== undefined) {
                    val.value = allValues[val.key]
                }
            })
            onDirtyChange?.(hasChanges);
            if (!hasChanges) {
                return;
            }
            const response = updateConfig(listenerFields, listenerModel);
            onChange(response);
        }
    }

    const createTitle = `Provide the necessary configuration details for the ${listenerModel.name} to complete the setup.`;
    const editTitle = `Update the configuration details for the ${listenerModel.name} as needed.`

    useEffect(() => {
        if (filePath && rpcClient) {
            rpcClient
                .getBIDiagramRpcClient()
                .getEndOfFile({ filePath })
                .then((res) => {
                    setTargetLineRange({
                        startLine: res,
                        endLine: res,
                    });
                });
        }
    }, [filePath, rpcClient]);

    return (
        <Container>

            {!listenerModel &&
                <LoadingContainer>
                    <ProgressRing />
                    <Typography variant="h3" sx={{ marginTop: '16px' }}>Loading Listener Configurations...</Typography>
                </LoadingContainer>
            }

            {listenerModel &&
                <>
                    {listenerFields.length > 0 &&
                        <FormContainer>
                            {filePath && targetLineRange &&
                                <ArtifactForm
                                    fileName={filePath}
                                    targetLineRange={targetLineRange}
                                    fields={listenerFields}
                                    onSubmit={handleListenerSubmit}
                                    onBack={onBack}
                                    nestedForm={true}
                                    isSaving={isSaving}
                                    submitText={formSubmitText}
                                    recordTypeFields={recordTypeFields}
                                    onChange={handleListenerChange}
                                    hideSaveButton={onChange ? true : false}
                                    onValidityChange={onValidityChange}
                                />
                            }
                        </FormContainer>
                    }
                </>
            }
        </Container>
    );
}

export default ListenerConfigForm;

function convertConfig(listener: ListenerModel): FormField[] {
    const formFields: FormField[] = [];
    for (const key in listener.properties) {
        const expression = listener.properties[key];
        const fieldType = getPrimaryInputType(expression.types)?.fieldType;
        // For MULTIPLE_SELECT, EXPRESSION_SET, and TEXT_SET, read from values array
        const value = (fieldType === "MULTIPLE_SELECT" || fieldType === "EXPRESSION_SET" || fieldType === "TEXT_SET")
            ? (expression.values && expression.values.length > 0 ? expression.values : (expression.value ? [expression.value] : []))
            : expression.value;
        const formField: FormField = {
            key: key,
            label: expression?.metadata.label || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, str => str.toUpperCase()),
            type: fieldType,
            documentation: expression?.metadata.description || "",
            editable: expression.editable,
            enabled: expression.enabled ?? true,
            optional: expression.optional,
            value: value,
            types: expression.types,
            advanced: expression.advanced,
            diagnostics: [],
            items: expression.items,
            placeholder: expression.placeholder,
            lineRange: expression?.codedata?.lineRange,
            codedata: expression?.codedata
        }
        formFields.push(formField);
    }
    return formFields;
}

function updateConfig(formFields: FormField[], listener: ListenerModel): ListenerModel {
    formFields.forEach(field => {
        const value = field.value;
        if (field.type === "MULTIPLE_SELECT" || field.type === "EXPRESSION_SET" || field.type === "TEXT_SET") {
            listener.properties[field.key].values = value as string[];
        } else {
            listener.properties[field.key].value = value as string;
        }
        if (value && value.length > 0) {
            listener.properties[field.key].enabled = true;
        }
    })
    return listener;
}
