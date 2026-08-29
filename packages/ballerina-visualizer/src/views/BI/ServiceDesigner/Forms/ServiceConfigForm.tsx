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
import { FormField, FormImports, FormValues, StringTemplateEditorConfig } from "@wso2/ballerina-side-panel";
import { getPrimaryInputType, LineRange, Property, RecordTypeField, ServiceModel, SubPanel, SubPanelView, ValidationResult } from "@wso2/ballerina-core";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { URI, Utils } from "vscode-uri";
import { ArtifactForm } from "../../Forms/ArtifactForm";
import { FormHeader } from "../../../../components/FormHeader";
import { getImportsForProperty } from "../../../../utils/bi";
import { isValueEqual, removeForwardSlashes, sanitizedHttpPath } from "../utils";

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

const ListenerBtn = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    margin-right: 15px;
`;



interface ServiceConfigFormProps {
    serviceModel: ServiceModel;
    onSubmit: (data: ServiceModel) => void;
    openListenerForm?: () => void;
    isSaving?: boolean;
    onBack?: () => void;
    formSubmitText?: string;
    onChange?: (data: ServiceModel) => void;
    onDirtyChange?: (isDirty: boolean) => void;
    onValidityChange?: (isValid: boolean) => void;
    serverValidationErrors?: ValidationResult[];
}

export function ServiceConfigForm(props: ServiceConfigFormProps) {
    const { rpcClient } = useRpcContext();

    const [serviceFields, setServiceFields] = useState<FormField[]>([]);
    const { serviceModel, onSubmit, onBack, openListenerForm, formSubmitText = "Next", isSaving, onChange, onDirtyChange, onValidityChange, serverValidationErrors } = props;
    const [filePath, setFilePath] = useState<string>('');
    const [targetLineRange, setTargetLineRange] = useState<LineRange>();
    const [recordTypeFields, setRecordTypeFields] = useState<RecordTypeField[]>([]);
    const initialFieldValuesRef = useRef<Record<string, any>>({});

    useEffect(() => {
        // Check if the service is HTTP protocol and any properties with choices
        const hasPropertiesWithChoices = serviceModel?.listenerProtocol === "http" &&
            Object.values(serviceModel.properties).some(property => property.choices);

        if (hasPropertiesWithChoices) {
            const choiceRecordTypeFields = Object.entries(serviceModel.properties)
                .filter(([_, property]) => property.choices)
                .flatMap(([parentKey, property]) =>
                    Object.entries(property.choices).flatMap(([choiceKey, choice]) =>
                        Object.entries(choice.properties || {})
                            .filter(([_, choiceProperty]) =>
                                getPrimaryInputType(choiceProperty.types)?.typeMembers &&
                                getPrimaryInputType(choiceProperty.types)?.typeMembers.some(member => member.kind === "RECORD_TYPE")
                            )
                            .map(([choicePropertyKey, choiceProperty]) => ({
                                key: choicePropertyKey,
                                property: {
                                    ...choiceProperty,
                                    metadata: {
                                        label: choiceProperty.metadata?.label || choicePropertyKey,
                                        description: choiceProperty.metadata?.description || ''
                                    },
                                    types: choiceProperty?.types || [{ fieldType: 'STRING' }],
                                    diagnostics: {
                                        hasDiagnostics: choiceProperty.diagnostics && choiceProperty.diagnostics.length > 0,
                                        diagnostics: choiceProperty.diagnostics
                                    }
                                } as Property,
                                recordTypeMembers: getPrimaryInputType(choiceProperty.types)?.typeMembers?.filter(member => member.kind === "RECORD_TYPE")
                            }))
                    )
                );
            console.log(">>> recordTypeFields of http serviceModel", choiceRecordTypeFields);

            setRecordTypeFields(choiceRecordTypeFields);
        } else {
            const recordTypeFields: RecordTypeField[] = Object.entries(serviceModel.properties)
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
                    recordTypeMembers: getPrimaryInputType(property.types)?.typeMembers?.filter(member => member.kind === "RECORD_TYPE")
                }));
            console.log(">>> recordTypeFields of serviceModel", recordTypeFields);

            setRecordTypeFields(recordTypeFields);
        }

        if (serviceModel) {
            const convertedFields = convertConfig(serviceModel);
            setServiceFields(convertedFields);
            initialFieldValuesRef.current = convertedFields.reduce((acc, field) => {
                acc[field.key] = field.value;
                return acc;
            }, {} as Record<string, any>);
            onDirtyChange?.(false);
        }
        rpcClient.getVisualizerRpcClient().joinProjectPath({ segments: ['main.bal'] }).then((response) => {
            setFilePath(response.filePath);
        });
    }, [serviceModel]);

    const handleServiceSubmit = async (data: FormValues, formImports: FormImports) => {
        serviceFields.forEach(val => {
            if (val.type === "CHOICE") {
                val.choices.forEach((choice, index) => {
                    choice.enabled = false;
                    if (data[val.key] === index) {
                        choice.enabled = true;
                        for (const key in choice.properties) {
                            choice.properties[key].value = data[key];
                        }
                    }
                })
            } else if (data[val.key] !== undefined) {
                val.value = data[val.key];
            }
            if (val.key === "basePath") {
                val.value = sanitizedHttpPath(data[val.key] as string);
            }
            val.imports = getImportsForProperty(val.key, formImports);
        })
        const response = updateConfig(serviceFields, serviceModel);
        onSubmit(response);
    };

    const handleServiceChange = (fieldKey: string, value: any, allValues: FormValues) => {
        if (onChange) {
            // First, check if any changes exist before modifying serviceFields
            let hasChanges = false;
            for (let val of serviceFields) {
                if (allValues[val.key] !== undefined && !isValueEqual(allValues[val.key], initialFieldValuesRef.current[val.key])) {
                    hasChanges = true;
                    break;
                }
            }
            onDirtyChange?.(hasChanges);
            if (!hasChanges) {
                return;
            }
            // Now, update values
            serviceFields.forEach(val => {
                if (allValues[val.key] !== undefined) {
                    val.value = allValues[val.key];
                }
                if (val.key === "basePath") {
                    val.value = sanitizedHttpPath(allValues[val.key] as string);
                }
            });
            const response = updateConfig(serviceFields, serviceModel);
            onChange(response);
        }
    }

    const handleListenerForm = (panel: SubPanel) => {
        if (panel.view === SubPanelView.ADD_NEW_FORM) {
            openListenerForm && openListenerForm();
        }
    }

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
            {serviceModel &&
                <>
                    {serviceFields.length > 0 &&
                        <FormContainer>
                            {filePath && targetLineRange &&
                                <ArtifactForm
                                    fileName={filePath}
                                    targetLineRange={targetLineRange}
                                    nestedForm={true}
                                    fields={serviceFields}
                                    onBack={onBack}
                                    isSaving={isSaving}
                                    openSubPanel={handleListenerForm}
                                    onSubmit={handleServiceSubmit}
                                    submitText={formSubmitText}
                                    recordTypeFields={recordTypeFields}
                                    preserveFieldOrder={true}
                                    onChange={handleServiceChange}
                                    hideSaveButton={onChange ? true : false}
                                    onValidityChange={onValidityChange}
                                    serverValidationErrors={serverValidationErrors}
                                />
                            }
                        </FormContainer>
                    }
                </>
            }
        </Container>
    );
}

export default ServiceConfigForm;

function convertConfig(service: ServiceModel): FormField[] {
    const formFields: FormField[] = [];
    for (const key in service.properties) {
        const expression = service.properties[key];
        if (getPrimaryInputType(expression.types)?.fieldType === "MULTIPLE_SELECT_LISTENER" || getPrimaryInputType(expression.types)?.fieldType === "SINGLE_SELECT_LISTENER") {
            continue
        }
        // Skip readOnlyMetadata as it's a special property that doesn't have standard form fields
        if (key === "readOnlyMetadata") {
            continue;
        }
        const formField: FormField = {
            key: key,
            label: expression?.metadata.label || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, str => str.toUpperCase()),
            type: getPrimaryInputType(expression.types)?.fieldType,
            documentation: expression?.metadata.description || "",
            // Respect the language server's editable flag (as the creation form does): fields like
            // the resolved service type are locked in edit mode — changing them breaks the service.
            editable: expression.editable ?? true,
            enabled: expression.enabled ?? true,
            optional: expression.optional,
            value: (getPrimaryInputType(expression.types)?.fieldType === "MULTIPLE_SELECT" || getPrimaryInputType(expression.types)?.fieldType === "EXPRESSION_SET" || getPrimaryInputType(expression.types)?.fieldType === "TEXT_SET") ? (expression.values && expression.values.length > 0 ? expression.values : (expression.value ? [expression.value] : [expression.items?.[0]])) : expression.value,
            types: expression.types,
            advanced: expression.advanced,
            diagnostics: [],
            items: expression.items,
            choices: expression.choices,
            placeholder: expression.placeholder,
            addNewButton: expression.addNewButton,
            lineRange: expression?.codedata?.lineRange
        }

        if (key === "basePath") {
            formField.value = removeForwardSlashes(formField.value as string);
        }

        formFields.push(formField);
    }
    return formFields;
}

function updateConfig(formFields: FormField[], service: ServiceModel): ServiceModel {
    formFields.forEach(field => {
        const value = field.value;
        if (field.type === "CHOICE") {
            // Handle nested properties within choices
            field.choices?.forEach((choice, index) => {
                const serviceChoice = service.properties[field.key].choices?.[index];
                if (serviceChoice && choice.properties) {
                    Object.keys(choice.properties).forEach(propKey => {
                        const prop = choice.properties[propKey];
                        const fieldType = getPrimaryInputType(prop.types)?.fieldType;
                        const propValue = prop.value;
                        if (fieldType === "MULTIPLE_SELECT" || fieldType === "EXPRESSION_SET" || fieldType === "TEXT_SET") {
                            serviceChoice.properties[propKey].values = (Array.isArray(propValue) ? propValue : []) as string[];
                            delete serviceChoice.properties[propKey].value;
                        } else {
                            serviceChoice.properties[propKey].value = propValue as string;
                        }
                    });
                }
            });
        } else if (field.type === "MULTIPLE_SELECT" || field.type === "EXPRESSION_SET" || field.type === "TEXT_SET") {
            service.properties[field.key].values = value as string[];
        } else {
            service.properties[field.key].value = value as string;
        }
        if (value && value.length > 0) {
            service.properties[field.key].enabled = true;
        }
    })
    return service;
}
