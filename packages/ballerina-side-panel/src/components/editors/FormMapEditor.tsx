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

import { Button, Codicon, TextField, ThemeColors } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";

import { FormField } from "../Form/types";
import { useFormContext } from "../../context";
import { buildRequiredRule } from "./utils";
import { FieldTypeChip } from "./FieldTypeChip";

namespace S {
    export const Container = styled.div({
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
    });

    export const LabelContainer = styled.div({
        display: "flex",
        alignItems: "center",
    });

    export const Label = styled.label({
        color: "var(--vscode-editor-foreground)",
        textTransform: "capitalize",
    });

    export const Description = styled.div({
        color: "var(--vscode-list-deemphasizedForeground)",
    });

    export const EditorContainer = styled.div({
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        width: "100%",
        border: "1px solid var(--vscode-input-border)",
        borderRadius: "4px",
        padding: "12px",
        marginBottom: "8px",
    });

    export const FieldGroup = styled.div({
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        width: "100%",
    });

    export const FieldContainer = styled.div({
        display: "flex",
        gap: "8px",
        alignItems: "center",
        width: "100%",
    });

    export const HeaderContainer = styled.div({
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        marginBottom: "8px",
    });

    export const AddNewButton = styled(Button)`
        & > vscode-button {
            color: var(--vscode-textLink-activeForeground);
            border-radius: 0px;
            padding: 3px 5px;
            margin-top: 4px;
        }
        & > vscode-button > * {
            margin-right: 6px;
        }
    `;

    export const DeleteButton = styled(Button)`
        & > vscode-button {
            color: ${ThemeColors.ERROR};
        }
    `;

    export const FieldLabel = styled.label({
        color: "var(--vscode-editor-foreground)",
        fontSize: "12px",
        marginBottom: "4px",
    });
}

interface FormMapEditorProps {
    field: FormField;
    label: string;
}

interface NestedFormField {
    metadata: {
        label: string;
        description: string;
    };
    valueType: string;
    value: string;
    optional: boolean;
    editable: boolean;
    advanced: boolean;
}

interface FixedPropertyValue {
    variable: NestedFormField;
    expression: NestedFormField;
}

export function FormMapEditor(props: FormMapEditorProps) {
    const { field, label } = props;
    const { form } = useFormContext();
    const { register, unregister, setValue, watch } = form;

    // Initialize with object values or empty object
    const initialValues = field.value || {};
    const [editorCount, setEditorCount] = useState(Object.keys(initialValues).length || 0);

    // Watch all the individual field values
    const values = [...Array(editorCount)].reduce((acc, _, index) => {
        const variableValue = watch(`${field.key}-${index}-variable`);
        const expressionValue = watch(`${field.key}-${index}-expression`);


        // TODO: need to make this dynamic
        // TODO: need to LS change to achieve dynamic forms
        
        if (variableValue || expressionValue) {
            acc[`future${index + 1}`] = {
                metadata: {
                    label: "Future",
                    description: "The worker/async function to wait for",
                },
                valueType: "FIXED_PROPERTY",
                value: {
                    expression: {
                        metadata: {
                            label: "Expression",
                            description: "Expression",
                        },
                        types: [{fieldType: "EXPRESSION", selected: false}],
                        value: expressionValue || "",
                        optional: false,
                        editable: true,
                        advanced: false,
                    },
                    variable: {
                        metadata: {
                            label: "Variable Name",
                            description: "Name of the variable",
                        },
                        types: [{fieldType: "IDENTIFIER", selected: false}],
                        value: variableValue || "",
                        optional: true,
                        editable: true,
                        advanced: false,
                    },
                },
                optional: false,
                editable: true,
                advanced: false,
            };
        }
        return acc;
    }, {} as Record<string, any>);

    // Update the main field.value object whenever individual fields change
    useEffect(() => {
        setValue(field.key, values);
    }, [values, field.key, setValue]);

    const onAddAnother = () => {
        setEditorCount((prev) => prev + 1);
    };

    const onDelete = (indexToDelete: number) => {
        // Unregister the deleted fields
        unregister(`${field.key}-${indexToDelete}-variable`);
        unregister(`${field.key}-${indexToDelete}-expression`);

        // Shift up remaining fields
        for (let i = indexToDelete + 1; i < editorCount; i++) {
            const variableValue = watch(`${field.key}-${i}-variable`);
            const expressionValue = watch(`${field.key}-${i}-expression`);

            unregister(`${field.key}-${i}-variable`);
            unregister(`${field.key}-${i}-expression`);

            setValue(`${field.key}-${i - 1}-variable`, variableValue);
            setValue(`${field.key}-${i - 1}-expression`, expressionValue);
        }

        setEditorCount((prev) => prev - 1);
    };

    return (
        <S.Container>
            <S.LabelContainer>
                <S.Label>{field.label}</S.Label>
                <FieldTypeChip types={field.types} />
            </S.LabelContainer>
            <S.Description>{field.documentation}</S.Description>
            {[...Array(editorCount)].map((_, index) => {
                const futureKey = `future${index + 1}`;
                const initialValue = field.value?.[futureKey]?.value || {};

                return (
                    <S.EditorContainer key={`${field.key}-${index}`}>
                        <S.HeaderContainer>
                            <S.Label>Future {index + 1}</S.Label>
                            <S.DeleteButton
                                appearance="icon"
                                onClick={() => onDelete(index)}
                                disabled={false}
                                tooltip="Delete"
                            >
                                <Codicon name="trash" />
                            </S.DeleteButton>
                        </S.HeaderContainer>
                        <S.FieldGroup>
                            <S.FieldContainer>
                                <div style={{ width: "100%" }}>
                                    <S.FieldLabel>Expression</S.FieldLabel>
                                        <TextField
                                            id={`${field.key}-${index}-expression`}
                                            {...register(`${field.key}-${index}-expression`, {
                                            required: buildRequiredRule({ isRequired: !field.optional, label: field.label }),
                                            value: initialValue.expression?.value || "",
                                        })}
                                        required={!field.optional}
                                        disabled={false}
                                        sx={{ width: "100%" }}
                                    />
                                </div>
                            </S.FieldContainer>
                            <S.FieldContainer>
                                <div style={{ width: "100%" }}>
                                    <S.FieldLabel>Variable Name</S.FieldLabel>
                                    <TextField
                                        id={`${field.key}-${index}-variable`}
                                        {...register(`${field.key}-${index}-variable`, {
                                            required: false,
                                            value: initialValue.variable?.value || "",
                                        })}
                                        required={false}
                                        disabled={false}
                                        sx={{ width: "100%" }}
                                    />
                                </div>
                            </S.FieldContainer>
                        </S.FieldGroup>
                    </S.EditorContainer>
                );
            })}
            <S.AddNewButton appearance="icon" aria-label="add" onClick={onAddAnother}>
                <Codicon name="add" />
                {label}
            </S.AddNewButton>
        </S.Container>
    );
}
