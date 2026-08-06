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

import { Codicon, Dropdown, LinkButton, LocationSelector, RadioButtonGroup, ThemeColors } from "@wso2/ui-toolkit";
import { FormRow, FormButtonContainer } from "../Form";

import { FormField } from "../Form/types";
import { buildRequiredRule, capitalize, getValueForDropdown } from "./utils";
import { useFormContext } from "../../context";
import styled from "@emotion/styled";
import { FieldFactory } from "./FieldFactory";

interface DropdownChoiceFormProps {
    field: FormField;
}

const FormContainer = styled.div`
    display: grid;
    gap: 20px;
    width: 100%;
`;

const ChoiceSection = styled.div`
    display: grid;
    gap: 20px;
    width: 100%;
`;

const FormSection = styled.div`
    display: grid;
    gap: 20px;
    width: 100%;
`;

export function DropdownChoiceForm(props: DropdownChoiceFormProps) {
    const { field } = props;
    const { form } = useFormContext();
    const { setValue, register } = form;

    const initialOption = (field.value as string) || "";
    const [selectedOption, setSelectedOption] = useState<string>(initialOption);

    const [dynamicFields, setDynamicFields] = useState<FormField[]>([]);
    const [showGroupSections, setShowGroupSections] = useState<{ [key: string]: boolean }>({});

    // Update dynamic fields when selection changes
    useEffect(() => {
        if (field.dynamicFormFields?.[selectedOption]) {
            setDynamicFields(field.dynamicFormFields[selectedOption]);
        } else {
            setDynamicFields([]);
        }
        setValue(field.key, selectedOption);
        setShowGroupSections({});
    }, [selectedOption]);

    return (
        <FormContainer>
            <ChoiceSection>
                <Dropdown
                    id={field.key}
                    {...register(field.key, {
                        required: buildRequiredRule({ isRequired: !field.optional, label: field.label }),
                        value: getValueForDropdown(field)
                    })}
                    label={capitalize(field.label)}
                    description={field.documentation}
                    items={field.itemOptions ? field.itemOptions : field.items?.map((item) => ({ id: item, content: item, value: item }))}
                    required={!field.optional}
                    disabled={!field.editable}
                    sx={{ width: "100%" }}
                    containerSx={{ width: "100%" }}
                    onChange={(e) => {
                        setSelectedOption(e.target.value);
                        setValue(field.key, e.target.value);
                    }}
                />
            </ChoiceSection>
            <FormSection>
                {dynamicFields
                    .filter(dfield => dfield.type !== "GROUP_SECTION" && !dfield.advanced && !dfield.optional
                        && !dfield.hidden)
                    .map((dfield, index) => (
                        <FieldFactory
                            key={dfield.key}
                            field={dfield}
                            autoFocus={index === 0}
                        />
                    ))
                }
                {dynamicFields
                    .filter(dfield => dfield.type === "GROUP_SECTION")
                    .map(groupField => {
                        const collapsedFields = groupField.advanceProps || [];
                        if (collapsedFields.length === 0) return null;
                        const isExpanded = showGroupSections[groupField.key] || false;
                        return (
                            <React.Fragment key={groupField.key}>
                                <FormRow>
                                    {groupField.label}
                                    <FormButtonContainer>
                                        <LinkButton
                                            onClick={() => setShowGroupSections(prev => ({
                                                ...prev,
                                                [groupField.key]: !isExpanded
                                            }))}
                                            sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}
                                        >
                                            <Codicon
                                                name={isExpanded ? "chevron-up" : "chevron-down"}
                                                iconSx={{ fontSize: 12 }}
                                                sx={{ height: 12 }}
                                            />
                                            {isExpanded ? "Collapse" : "Expand"}
                                        </LinkButton>
                                    </FormButtonContainer>
                                </FormRow>
                                {isExpanded && collapsedFields.map(childField => (
                                    <FieldFactory key={childField.key} field={childField} />
                                ))}
                            </React.Fragment>
                        );
                    })
                }
            </FormSection>
        </FormContainer>
    );
}
