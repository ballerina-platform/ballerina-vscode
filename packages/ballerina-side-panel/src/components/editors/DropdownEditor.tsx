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

import React, { useEffect } from "react";

import { Dropdown } from "@wso2/ui-toolkit";

import { FormField } from "../Form/types";
import { buildRequiredRule, capitalize, getValueForDropdown } from "./utils";
import { buildValidate } from "../Form/validationRules";
import { useFormContext } from "../../context";
import { SubPanel, SubPanelView } from "@wso2/ballerina-core";

interface DropdownEditorProps {
    field: FormField;
    openSubPanel?: (subPanel: SubPanel) => void;
}

export function DropdownEditor(props: DropdownEditorProps) {
    const { field, openSubPanel } = props;
    const { form } = useFormContext();
    const { register, setValue } = form;

    useEffect(() => {
        // if field.key is "modelType" and value is not set and default value set. then setValue to default value initially
        if (field.key === "modelType" && field.value === undefined && (field.defaultValue || field.placeholder)) {
            setValue(field.key, field.defaultValue || field.placeholder);
        }
    }, [field.defaultValue, field.placeholder]);

    // HACK: create values for Scope field
    if (field.key === "scope") {
        field.items = ["Global", "Local"];
    }

    // Handle items: string[] or { label, value }[]
    let dropdownItems;
    if (field.itemOptions) {
        dropdownItems = field.itemOptions;
    } else if (Array.isArray(field.items) && field.items.length > 0) {
        if (typeof field.items[0] === "string") {
            dropdownItems = field.items.map((item) => ({ id: item, content: item, value: item }));
        } else if (typeof field.items[0] === "object" && field.items[0] !== null && "label" in field.items[0] && "value" in field.items[0]) {
            dropdownItems = field.items.map((item: any) => ({ id: item.value, content: item.label, value: item.value }));
        } else {
            dropdownItems = [];
        }
    } else {
        dropdownItems = [];
    }

    return (
        <Dropdown
            id={field.key}
            description={field.documentation}
            {...register(field.key, {
                required: buildRequiredRule({ isRequired: !field.optional, label: field.label }),
                value: getValueForDropdown(field),
                validate: buildValidate(field)
            })}
            label={capitalize(field.label)}
            items={dropdownItems}
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
