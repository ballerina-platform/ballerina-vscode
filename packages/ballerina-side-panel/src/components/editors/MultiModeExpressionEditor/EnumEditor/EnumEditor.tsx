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

import { Dropdown, OptionProps } from "@wso2/ui-toolkit";
import React, { ChangeEvent, useMemo } from "react"
import { FormField } from "../../../Form/types";

interface EnumEditorProps {
    value: string;
    field: FormField;
    onChange: (value: string, cursorPosition: number) => void;
    items: OptionProps[];
}

const DEFAULT_NONE_SELECTED_VALUE = "__none__";

export const EnumEditor = (props: EnumEditorProps) => {
    // Ensure value is in items, otherwise use first item's value
    const itemsList = useMemo(() => {
        const baseItems = props.items.length > 0 ? props.items : (props.field.itemOptions ?? []);
        return [
            ...baseItems,
            {
                id: "default-option",
                // A field-provided placeholder (e.g. "(default)") describes what an empty
                // selection means; fall back to the generic label otherwise.
                content: props.field.placeholder?.toString() || "No Selection",
                value: DEFAULT_NONE_SELECTED_VALUE
            }
        ];
    }, [props.items, props.field.itemOptions]);

    const selectedValue = useMemo(() => {
        if (props.value === undefined || props.value === null || props.value === "") {
            return DEFAULT_NONE_SELECTED_VALUE;
        }
        if (props.value && itemsList.some(item => item.value === props.value)) {
            return props.value;
        }
        return itemsList[0].value;
    }, [props.value, itemsList]);

    const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (value === DEFAULT_NONE_SELECTED_VALUE) {
            props.onChange("", 0);
        } else {
            props.onChange(value, value.length);
        }
    }


    return (
        <Dropdown
            id={props.field.key}
            aria-label={props.field.label}
            value={selectedValue.trim()}
            items={itemsList}
            onChange={handleChange}
            sx={{ width: "100%" }}
            containerSx={{ width: "100%" }}
        />
    )
}
