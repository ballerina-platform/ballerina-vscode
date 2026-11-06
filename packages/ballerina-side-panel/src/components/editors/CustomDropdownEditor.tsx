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

// TODO: this component should be refactored to be more generic and reusable for other forms. 
// so, created new custom dropdown editor for this purpose and keep previous one for other forms.
// update the editor factory to use this component for enum and single select fields.

import React from "react";
import styled from "@emotion/styled";

import { Dropdown } from "@wso2/ui-toolkit";

import { FormField } from "../Form/types";
import { buildRequiredRule, capitalize, getValueForDropdown } from "./utils";
import { useFormContext } from "../../context";
import { SubPanel, SubPanelView } from "@wso2/ballerina-core";
import { FieldTypeChip } from "./FieldTypeChip";

interface CustomDropdownEditorProps {
    field: FormField;
    openSubPanel?: (subPanel: SubPanel) => void;
}

const DropdownStack = styled.div`
    display: flex;
    flex-direction: column;
    width: 100%;
`;

const DropdownSpacer = styled.div`
    height: 5px;
`;

export function CustomDropdownEditor(props: CustomDropdownEditorProps) {
    const { field, openSubPanel } = props;
    const { form } = useFormContext();
    const { register, setValue } = form;

    const showScopeControls = field.key === "toolsToInclude";

    // HACK: create values for Scope field
    if (field.key === "scope") {
        field.items = ["Global", "Local"];
    }

    if (showScopeControls) {
        return (
            <DropdownStack>
                <Dropdown
                    id={field.key}
                    description={field.documentation}
                    {...register(field.key, {
                        required: buildRequiredRule({ isRequired: !field.optional, label: field.label }),
                        value: getValueForDropdown(field)
                    })}
                    label={capitalize(field.label)}
                    labelAdornment={<FieldTypeChip types={field.types} />}
                    items={field.itemOptions ? field.itemOptions : field.items?.map((item) => ({ id: item, content: item, value: item }))}
                    required={!field.optional}
                    disabled={!field.editable}
                    onChange={(e) => {
                        setValue(field.key, e.target.value);
                        field.onValueChange?.(e.target.value);
                    }}
                    sx={{ width: "100%" }}
                    containerSx={{ width: "100%" }}
                    addNewBtnClick={field.addNewButton ? () => openSubPanel({ view: SubPanelView.ADD_NEW_FORM }) : undefined}
                />
                <DropdownSpacer />
            </DropdownStack>
        );
    }

    return (
        <Dropdown
            id={field.key}
            description={field.documentation}
            {...register(field.key, {
                required: buildRequiredRule({ isRequired: !field.optional, label: field.label }),
                value: getValueForDropdown(field)
            })}
            label={capitalize(field.label)}
            labelAdornment={<FieldTypeChip types={field.types} />}
            items={field.itemOptions ? field.itemOptions : field.items?.map((item) => ({ id: item, content: item, value: item }))}
            required={!field.optional}
            disabled={!field.editable}
            onChange={(e) => {
                setValue(field.key, e.target.value);
                field.onValueChange?.(e.target.value);
            }}
            sx={{ width: "100%" }}
            containerSx={{ width: "100%" }}
            addNewBtnClick={field.addNewButton ? () => openSubPanel({ view: SubPanelView.ADD_NEW_FORM }) : undefined}
        />
    );
}
