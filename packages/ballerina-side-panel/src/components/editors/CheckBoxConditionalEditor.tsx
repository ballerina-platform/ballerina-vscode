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
import { FormField } from "../Form/types";
import { CheckBoxGroup, FormCheckBox } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";
import { FieldFactory } from "./FieldFactory";
import { useFormContext } from "../../context";
import { getPrimaryInputType, PropertyModel } from "@wso2/ballerina-core";

// align-items: start is deliberate. Grid's default (stretch) combined with height:100% controls
// (e.g. the AutoComplete editor's container) inflates a revealed sub-field to the full row height,
// so its input/chevron stretches down over the following section. Self-sizing the items keeps each
// sub-field at its natural height, matching how fields render inside the normal flex form rows.
const Form = styled.div`
    display: grid;
    gap: 20px;
    width: 100%;
    align-items: start;
`;

const FormSection = styled.div`
    display: grid;
    gap: 20px;
    width: 100%;
    align-items: start;
`;

const Label = styled.div`
    font-family: var(--font-family);
    color: var(--vscode-editor-foreground);
    text-align: left;
    text-transform: capitalize;
`;
const Description = styled.div`
    font-family: var(--font-family);
    color: var(--vscode-list-deemphasizedForeground);
    text-align: left;
`;
const LabelGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2px;
`;
const BoxGroup = styled.div`
    display: flex;
    flex-direction: row;
    width: 100%;
    align-items: flex-start;
`;

interface CheckBoxConditionalEditorProps {
    field: FormField;
}

export function CheckBoxConditionalEditor(props: CheckBoxConditionalEditorProps) {
    const { field } = props;
    const { form } = useFormContext();
    const { register, control, watch } = form;
    const [checkedStateFields, setCheckedStateFields] = useState<FormField[]>([]);
    const [uncheckedStateFields, setUncheckedStateFields] = useState<FormField[]>([]);

    const { setValue } = form;

    const checked = watch(field.key, true);

    useEffect(() => {
        if (field.choices && field.choices.length > 1) {
            // first choice is for checked state, second is for unchecked state
            const mappedCheckedStateFields = mapPropertiesToFormFields(field.choices[0].properties || {});
            setCheckedStateFields(mappedCheckedStateFields);

            const mappedUncheckedStateFields = mapPropertiesToFormFields(field.choices[1].properties || {});
            setUncheckedStateFields(mappedUncheckedStateFields);
        }
    }, [field]);

    // Add useEffect to set initial values
    useEffect(() => {
        if (checkedStateFields.length > 0) {
            Object.entries(checkedStateFields).forEach(([_, propValue]) => {
                if (propValue.value !== undefined) {
                    setValue(propValue.key, propValue.value);
                }
            });
        }
    }, [checkedStateFields]);

    // Add useEffect to set initial values
    useEffect(() => {
        if (uncheckedStateFields.length > 0) {
            Object.entries(uncheckedStateFields).forEach(([_, propValue]) => {
                if (propValue.value !== undefined) {
                    setValue(propValue.key, propValue.value);
                }
            }
            );
        }
    }, [uncheckedStateFields]);

    return (
        <Form>
            <CheckBoxGroup containerSx={{ width: "100%" }}>
                <BoxGroup>
                    <FormCheckBox
                        name={field.key}
                        {...register(field.key, { value: getBooleanValue(field, field.value) })}
                        control={control as any}
                    />
                    <LabelGroup>
                        <Label>{field.label}</Label>
                        <Description>{field.documentation}</Description>
                    </LabelGroup>
                </BoxGroup>
            </CheckBoxGroup>
            <FormSection>
                {checked && checkedStateFields.length > 0 && (
                    <>
                        {checkedStateFields.map((dfield, index) => (
                            <FieldFactory
                                key={dfield.key}
                                field={dfield}
                                autoFocus={index === 0 ? true : false}
                            />
                        ))}
                    </>
                )}
                {!checked && uncheckedStateFields.length > 0 && (
                    <>
                        {uncheckedStateFields.map((dfield, index) => (
                            <FieldFactory
                                key={dfield.key}
                                field={dfield}
                                autoFocus={index === 0 ? true : false}
                            />
                        ))}
                    </>
                )}
            </FormSection>
        </Form>

    );

}

function getBooleanValue(field: FormField, value: any) {
    if (field.type === "FLAG") {
        return value === "true" || value === true;
    }
    return value;
}


/**
 * Maps the properties to an array of FormField objects.
 * 
 * @param properties The properties to map.
 * @returns An array of FormField objects.
 */
function mapPropertiesToFormFields(properties: { [key: string]: PropertyModel; }): FormField[] {
    if (!properties) return [];

    return Object.entries(properties).map(([key, property]) => {

        // Determine value for MULTIPLE_SELECT
        let value: any = property.value;
        if (getPrimaryInputType(property.types).fieldType === "MULTIPLE_SELECT") {
            if (property.values && property.values.length > 0) {
                value = property.values;
            } else if (property.value) {
                value = [property.value];
            } else if (property.items && property.items.length > 0) {
                value = [property.items[0]];
            } else {
                value = [];
            }
        }

        let items = undefined;
        const primaryFieldType = getPrimaryInputType(property.types)?.fieldType;
        if (primaryFieldType === "MULTIPLE_SELECT" || primaryFieldType === "SINGLE_SELECT" || primaryFieldType === "AUTOCOMPLETE") {
            items = property.items;
        }

        return {
            key,
            label: property?.metadata?.label,
            type: getPrimaryInputType(property.types)?.fieldType,
            documentation: property?.metadata?.description || "",
            editable: true,
            enabled: property.enabled ?? true,
            optional: property.optional,
            value,
            types: property.types,
            advanced: property.advanced,
            diagnostics: [],
            items,
            allowItemCreate: property.allowItemCreate,
            choices: property.choices,
            placeholder: property.placeholder,
            addNewButton: property.addNewButton,
            lineRange: property?.codedata?.lineRange,
            advanceProps: mapPropertiesToFormFields(property.properties)
        } as FormField;
    });
}
