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
import { useWatch } from "react-hook-form";

import { Codicon, Dropdown, LinkButton, LocationSelector, RadioButtonGroup, ThemeColors } from "@wso2/ui-toolkit";

import { FormField } from "../Form/types";
import { FormRow, FormButtonContainer } from "../Form";
import { capitalize, getValueForDropdown } from "./utils";
import { useFormContext } from "../../context";
import styled from "@emotion/styled";
import { getPrimaryInputType, PropertyModel, RecordTypeField } from "@wso2/ballerina-core";
import { FieldFactory } from "./FieldFactory";
import { SectionChanges } from "./FieldAssist/AssistMark";
import { propertyFormFields } from "./FieldAssist/formFields";

interface ChoiceFormProps {
    field: FormField;
    recordTypeFields?: RecordTypeField[];
}

const Form = styled.div`
    display: grid;
    gap: 24px;
    width: 100%;
`;

const ChoiceSection = styled.div`
    display: grid;
    gap: 24px;
    width: 100%;
`;

const FormSection = styled.div`
    display: grid;
    gap: 24px;
    width: 100%;
`;

/** Marks the active choice on the label as well as the radio, so which option the
 *  fields below belong to is never ambiguous. */
const ChoiceLabel = styled.span<{ selected: boolean }>`
    font-weight: ${(props: { selected: boolean }) => (props.selected ? 500 : 400)};
`;

/** A choice's own callout, shown on every option — e.g. why one is deprecated and what supersedes it. */
const ChoiceNotice = styled.span`
    display: block;
    font-size: 11px;
    opacity: 0.8;
    color: ${ThemeColors.ON_SURFACE_VARIANT};
`;

export function ChoiceForm(props: ChoiceFormProps) {
    const { field, recordTypeFields } = props;
    const { form } = useFormContext();
    const { setValue, clearErrors, control, getValues } = form;
    // A changed value is the user's or Copilot's, so neither a model refresh nor a branch's defaults overwrite it.
    const untouched = (key: string) => !form.getFieldState?.(key).isDirty;
    // The form holds the selected branch's index, which Copilot may set while this editor is not on screen.
    const held = useWatch({ control, name: field.key });
    const heldChoice = typeof held === "number" && field.choices?.[held] ? held : undefined;

    const [selectedOption, setSelectedOption] = useState<number>(() => {
        const idx = heldChoice ?? field.choices?.findIndex(choice => choice.enabled) ?? -1;
        return idx !== -1 ? idx + 1 : 1;
    });

    const [dynamicFields, setDynamicFields] = useState<FormField[]>([]);
    const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);

    const selectChoice = (index: number) => {
        setSelectedOption(index + 1);
        setValue(field.key, index);
        clearErrors();
    };

    useEffect(() => {
        if (heldChoice !== undefined && heldChoice + 1 !== selectedOption) {
            setSelectedOption(heldChoice + 1);
        }
    }, [heldChoice]);

    useEffect(() => {
        if (!untouched(field.key)) {
            return;
        }
        // Find the first enabled choice and keep the radio selection + form state in sync
        const enabledChoiceIndex = field.choices.findIndex(choice => choice.enabled);
        if (enabledChoiceIndex !== -1) {
            const newSelectedOption = enabledChoiceIndex + 1;
            if (getValues(field.key) !== enabledChoiceIndex) {
                setValue(field.key, enabledChoiceIndex);
            }
            if (newSelectedOption !== selectedOption) {
                setSelectedOption(newSelectedOption);
            }
        } else if (selectedOption > field.choices.length) {
            // Choices shrank (e.g. protocol switched to one with fewer auth options) and none are enabled;
            // clamp back to the first option so we don't index out of range.
            setSelectedOption(1);
            setValue(field.key, 0);
        }
    }, [field.choices]);

    // Add useEffect to set initial values
    useEffect(() => {
        const realValue = selectedOption - 1;
        const property = field.choices[realValue];
        if (!property) {
            // Stale selectedOption from a previous, larger choices array. The sibling effect
            // above will resync selectedOption on the next render; bail out to avoid crashing.
            return;
        }
        const choiceProperty = propertyFormFields(property);
        setDynamicFields(choiceProperty);
        if (choiceProperty.length > 0) {
            const setPropertyValues = (properties: Record<string, PropertyModel>) => {
                Object.entries(properties).forEach(([propKey, propValue]) => {
                    const fieldType = getPrimaryInputType(propValue.types)?.fieldType;
                    if (fieldType === "GROUP_SECTION" && propValue.properties) {
                        setPropertyValues(propValue.properties);
                    } else if (propValue.value !== undefined && untouched(propKey)) {
                        setValue(propKey, propValue.value);
                    }
                });
            };
            setPropertyValues(property.properties);
        }
    }, [selectedOption, field.choices]);

    return (
        <Form>
            <ChoiceSection>
                <RadioButtonGroup
                    id="choice-options"
                    label={field.documentation}
                    defaultValue={String(selectedOption)}
                    defaultChecked={true}
                    value={String(selectedOption)}
                    options={field.choices.map((choice, index) => ({
                        id: index.toString(),
                        value: index + 1,
                        content: (
                            <>
                                <ChoiceLabel selected={selectedOption === index + 1}>
                                    {choice.metadata.label}
                                </ChoiceLabel>
                                {choice.metadata.notice && (
                                    <ChoiceNotice>{choice.metadata.notice}</ChoiceNotice>
                                )}
                            </>
                        ),
                        disabled: field.editable === false || !choice.editable
                    }))}
                    onChange={(e) => {
                        if (field.editable === false) return;
                        const checkedValue = Number(e.target.value);
                        const realValue = checkedValue - 1;
                        const choice = field.choices[realValue];
                        if (choice && !choice.editable) {
                            return;
                        }
                        selectChoice(realValue);
                    }}
                />
            </ChoiceSection>

            {(() => {
                const visibleFields = dynamicFields.filter(dfield => !dfield.hidden);
                const nonAdvancedFields = visibleFields.filter(dfield => !dfield.advanced);
                const advancedFields = visibleFields.filter(dfield => dfield.advanced);

                if (nonAdvancedFields.length === 0 && advancedFields.length === 0) return null;

                return (
                    <FormSection>
                        {nonAdvancedFields.map((dfield, index) => (
                            <FieldFactory
                                key={dfield.key}
                                field={dfield}
                                autoFocus={index === 0}
                                recordTypeFields={recordTypeFields}
                            />
                        ))}
                        {advancedFields.length > 0 && (
                            <FormRow>
                                Advanced Configurations
                                <FormButtonContainer>
                                    <SectionChanges fields={advancedFields} onReveal={() => setShowAdvancedOptions(true)} />
                                    <LinkButton
                                        onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                                        sx={{ fontSize: 12, padding: 8, color: ThemeColors.PRIMARY, gap: 4 }}
                                    >
                                        <Codicon
                                            name={showAdvancedOptions ? "chevron-up" : "chevron-down"}
                                            iconSx={{ fontSize: 12 }}
                                            sx={{ height: 12 }}
                                        />
                                        {showAdvancedOptions ? "Collapse" : "Expand"}
                                    </LinkButton>
                                </FormButtonContainer>
                            </FormRow>
                        )}
                        {showAdvancedOptions && advancedFields.map((dfield) => (
                            <FieldFactory
                                key={dfield.key}
                                field={dfield}
                                recordTypeFields={recordTypeFields}
                            />
                        ))}
                    </FormSection>
                );
            })()}

        </Form>

    );
}
