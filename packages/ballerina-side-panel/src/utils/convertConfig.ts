/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { NodeProperties, Property, getPrimaryInputType, isDropDownType, DropdownType } from "@wso2/ballerina-core";
import { FormField } from "../components/Form/types";

/**
 * Minimal NodeProperties -> FormField[] converter used by the inline
 * connection-create overlay. Intentionally narrower than the visualizer's
 * full convertConfig — supports the property shapes a connector `init` form
 * typically produces (primitive expressions, enums, identifier, type) but
 * not REPEATABLE_PROPERTY, ADVANCE_PARAM_LIST, dynamicFormFields, etc.
 */
export function convertConfig(properties: NodeProperties, skipKeys: string[] = []): FormField[] {
    const formFields: FormField[] = [];
    for (const key of Object.keys(properties)) {
        if (skipKeys.includes(key)) {
            continue;
        }
        const property = properties[key as keyof NodeProperties] as Property;
        if (!property) {
            continue;
        }
        formFields.push(toFormField(key, property));
    }
    return formFields;
}

function toFormField(key: string, property: Property): FormField {
    return {
        key,
        label: property.metadata?.label || "",
        type: getPrimaryInputType(property.types)?.fieldType ?? "",
        optional: property.optional,
        advanced: property.advanced,
        placeholder: property.placeholder,
        defaultValue: property.defaultValue as string,
        editable: property.editable,
        enabled: true,
        hidden: property.hidden,
        documentation: property.metadata?.description || "",
        value: property.value as string,
        items: getItems(property),
        itemOptions: property.itemOptions,
        diagnostics: property.diagnostics?.diagnostics || [],
        types: property.types,
        lineRange: property?.codedata?.lineRange,
        metadata: property.metadata,
        codedata: property.codedata,
        imports: property.imports,
    };
}

function getItems(property: Property): string[] | undefined {
    if (property.types?.length === 1 && isDropDownType(property.types[0])) {
        return (property.types[0] as DropdownType).options.map((option) => option.value);
    }
    return undefined;
}
