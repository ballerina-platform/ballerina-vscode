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

import React, { useEffect, useState, useMemo } from "react";

import { Button, Codicon, Dropdown, OptionProps, ThemeColors } from "@wso2/ui-toolkit";
import styled from "@emotion/styled";

import { FormField } from "../Form/types";
import { buildRequiredRule, getValueForDropdown } from "./utils";
import { useFormContext } from "../../context";
import { SubPanel, SubPanelView } from "@wso2/ballerina-core";
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
}

interface MultiSelectEditorProps {
    field: FormField;
    label: string;
    openSubPanel?: (subPanel: SubPanel) => void;
}

export function MultiSelectEditor(props: MultiSelectEditorProps) {
    const { field, label, openSubPanel } = props;
    const { form } = useFormContext();
    const { register, unregister, setValue, watch } = form;

    const NEW_OPTION = "Create New Tool";

    // Calculate initial number of dropdowns based on the field value
    const calculateInitialCount = () => {
        if (field.items.length === 0) {
            return 0;
        }
        if (!field.value || field.value === "" || (Array.isArray(field.value) && field.value.length === 0)) {
            return 1;
        }
        return Array.isArray(field.value) ? field.value.length : 1;
    };

    const [dropdownCount, setDropdownCount] = useState(calculateInitialCount());

    useEffect(() => {
        for (let index = 0; index < dropdownCount; index++) {
            const currentValue = watch(`${field.key}-${index}`);
            // Set default value if current value is undefined, null, or empty string
            if (currentValue === undefined || currentValue === null || currentValue === "") {
                const defaultValue = getValueForDropdown(field, index);
                if (defaultValue !== undefined && defaultValue !== null && defaultValue !== "") {
                    setValue(`${field.key}-${index}`, defaultValue);
                }
            }
        }
    }, [dropdownCount, field.key, field, watch, setValue]);

    // Watch all the individual dropdown values
    const watchedValues = useMemo(() =>
        [...Array(dropdownCount)].map((_, index) =>
            watch(`${field.key}-${index}`)
        ),
        [dropdownCount, field.key, watch]
    );

    // Calculate values array without side effects
    const values = useMemo(() => {
        return watchedValues
            .filter(value => value && value !== NEW_OPTION);
    }, [watchedValues, NEW_OPTION]);

    useEffect(() => {
        setValue(field.key, values);
    }, [values, field.key, setValue]);

    // HACK: create values for Scope field
    if (field.key === "scope") {
        field.items = ["Global", "Local"];
    }

    const getItemsList = (): OptionProps[] => {
        const items = field.items?.map((item) => ({ id: item, content: item, value: item }));
        return items;
    }

    const onAddAnother = () => {
        setDropdownCount((prev) => prev + 1);
    };

    const onDelete = (indexToDelete: number) => {
        // Unregister the deleted field
        unregister(`${field.key}-${indexToDelete}`);

        // Unregister and re-register fields after the deleted index to shift them up
        for (let i = indexToDelete + 1; i < dropdownCount; i++) {
            const value = watch(`${field.key}-${i}`);
            unregister(`${field.key}-${i}`);
            setValue(`${field.key}-${i - 1}`, value);
        }

        // Update the main field value
        const newValues = values.filter((_, i) => i !== indexToDelete);
        setValue(field.key, newValues);
        setDropdownCount(prev => prev - 1);
    };

    return (
        <S.Container>
            <S.LabelContainer>
                <S.Label>{field.label}</S.Label>
                <FieldTypeChip types={field.types} />
            </S.LabelContainer>
            <S.Description>{field.documentation}</S.Description>
            {[...Array(dropdownCount)].map((_, index) => {
                const currentValue = watch(`${field.key}-${index}`) || getValueForDropdown(field, index);
                return (
                    <S.DropdownContainer key={`${field.key}-${index}`}>
                        <Dropdown
                            id={`${field.key}-${index}`}
                            {...register(`${field.key}-${index}`, {
                                required: buildRequiredRule({
                                    isRequired: !field.optional && index === 0,
                                    label: field.label
                                }),
                                value: getValueForDropdown(field, index)
                            })}
                            value={currentValue}
                            items={getItemsList()}
                            required={!field.optional && index === 0}
                            disabled={!field.editable}
                            sx={{ width: "100%" }}
                            containerSx={{ width: "100%" }}
                            addNewBtnClick={field.addNewButton ? () => openSubPanel({ view: SubPanelView.ADD_NEW_FORM }) : undefined}
                            addNewBtnLabel={field.addNewButton ? (field.addNewButtonLabel || field.label) : undefined}
                            aria-label={field.label}
                            onChange={(e) => {
                                setValue(`${field.key}-${index}`, e.target.value);
                            }}
                        />
                        {dropdownCount > 1 &&
                            <S.DeleteButton
                                appearance="icon"
                                onClick={() => onDelete(index)}
                                disabled={!field.editable}
                                tooltip="Delete"
                            >
                                <Codicon name="trash" />
                            </S.DeleteButton>
                        }
                    </S.DropdownContainer>
                );
            })}
            {(field.addNewButton && field.items.length > dropdownCount) &&
                <S.AddNewButton
                    appearance='icon'
                    aria-label="add"
                    onClick={onAddAnother}
                >
                    <Codicon name="add" />
                    {label}
                </S.AddNewButton>
            }
            {(!field.addNewButton && field.items.length > 0) &&
                <S.AddNewButton
                    appearance='icon'
                    aria-label="add"
                    onClick={onAddAnother}
                >
                    <Codicon name="add" />
                    {label}
                </S.AddNewButton>
            }
            {field.items.length === 0 && openSubPanel && field.addNewButton &&
                <S.AddNewButton
                    appearance='icon'
                    aria-label="add"
                    onClick={() => { openSubPanel({ view: SubPanelView.ADD_NEW_FORM }); onAddAnother(); }}
                >
                    <Codicon name="add" />
                    {field.addNewButtonLabel || field.label}
                </S.AddNewButton>
            }
        </S.Container>
    );
}
