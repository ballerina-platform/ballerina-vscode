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

import React, { ChangeEvent } from "react";
import { Dropdown } from "@wso2/ui-toolkit";
import { FormField } from "../../../Form/types";
import { OptionProps } from "@wso2/ballerina-core";
import { useDefaultUntilEmptied } from "../useDefaultUntilEmptied";

interface BooleanEditorProps {
    value: string;
    field: FormField;
    onChange: (value: string | undefined, cursorPosition: number) => void;
}

const DEFAULT_NONE_SELECTED_VALUE = "__none__";

const dropdownItems: OptionProps[] = [
    {
        id: "1",
        content: "True",
        value: "true"
    },
    {
        id: "2",
        content: "False",
        value: "false"
    },
    {
        id: "default-option",
        content: "No Selection",
        value: DEFAULT_NONE_SELECTED_VALUE
    }
]

/**
 * The boolean the given value stands for, as the value of the entry standing for it, or undefined when it
 * stands for neither. Something which is not a boolean at all is not reported as one, so that a value the
 * dropdown cannot express is told apart from one it can.
 */
const toBooleanValue = (value: unknown): string | undefined => {
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (v === 'true' || v === 'false') return v;
    }
    return undefined;
};

export const BooleanEditor: React.FC<BooleanEditorProps> = ({ value, onChange, field }) => {

    // Picking either entry ends the emptied state, `false` among them, hence the entry the value stands for
    // is what is asked about rather than the value being taken as truthy.
    const [emptiedByUser, reportEmptied] = useDefaultUntilEmptied(toBooleanValue(value) !== undefined);

    const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (value === DEFAULT_NONE_SELECTED_VALUE) {
            reportEmptied();
            onChange("", 0);
            return;
        }
        // The entries are the only source of what can be picked, and the one standing for the empty
        // selection is answered above, hence what is left is the boolean an entry stands for.
        onChange(value, value.length);
    }

    const getValidatedValue = (): string => {
        const selected = toBooleanValue(value);
        if (selected !== undefined) {
            return selected;
        }
        // An empty field applies the declared default of the parameter, which the documentation of the field
        // states, hence the entry standing for that default is the one presented as the current selection,
        // until the field is emptied on purpose. A default is not always declared, and one written as an
        // expression rather than a boolean literal stands for neither entry, which both leave the empty
        // selection presented.
        if (value === undefined || value === null || value === "") {
            return emptiedByUser ? DEFAULT_NONE_SELECTED_VALUE
                : toBooleanValue(field.defaultValue) ?? DEFAULT_NONE_SELECTED_VALUE;
        }
        // A value that is neither boolean (e.g. pro code written by hand) is not a selection of either entry
        return DEFAULT_NONE_SELECTED_VALUE;
    }


    return (
        <Dropdown
            id={field.key}
            value={getValidatedValue()}
            items={dropdownItems}
            onChange={handleChange}
            sx={{ width: "100%" }}
            containerSx={{ width: "100%" }}
        />
    );
};

export default BooleanEditor;
