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
import { useDefaultUntilEmptied } from "../useDefaultUntilEmptied";

interface EnumEditorProps {
    value: string;
    field: FormField;
    onChange: (value: string, cursorPosition: number) => void;
    items: OptionProps[];
}

const DEFAULT_NONE_SELECTED_VALUE = "__none__";

export const EnumEditor = (props: EnumEditorProps) => {
    const options = useMemo(
        () => (props.items.length > 0 ? props.items : (props.field.itemOptions ?? [])),
        [props.items, props.field.itemOptions]
    );

    // The member the parameter defaults to, which the placeholder holds as the value of that option. An
    // optional enum defaults to nil, which refers to no member, hence there is not always one.
    const defaultOption = useMemo(
        () => options.find(item => item.value === props.field.placeholder),
        [options, props.field.placeholder]
    );

    const isSetToAnOption = props.value !== undefined && props.value !== null && props.value !== ""
        && options.some(item => item.value === props.value);

    // The empty selection is always offered, whether or not the parameter declares a default: leaving the
    // field empty is a valid state of every enum, and the list has to be able to express it. It is also the
    // selection a value that none of the members stands for falls back to.
    const itemsList = useMemo(
        () => [
            ...options,
            {
                id: "default-option",
                content: "No Selection",
                value: DEFAULT_NONE_SELECTED_VALUE
            }
        ],
        [options]
    );

    const [emptiedByUser, reportEmptied] = useDefaultUntilEmptied(isSetToAnOption);

    const selectedValue = useMemo(() => {
        if (isSetToAnOption) {
            return props.value;
        }
        // An empty field applies the default of the parameter, hence the member it applies is shown as the
        // selected one until the field is emptied on purpose. A value that none of the members stands for
        // (e.g. pro code written by hand) is not a selection of any of them, and showing one would misreport
        // what the source holds.
        if (!props.value && defaultOption && !emptiedByUser) {
            return defaultOption.value;
        }
        return DEFAULT_NONE_SELECTED_VALUE;
    }, [props.value, isSetToAnOption, defaultOption, emptiedByUser]);

    const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (value === DEFAULT_NONE_SELECTED_VALUE) {
            reportEmptied();
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
