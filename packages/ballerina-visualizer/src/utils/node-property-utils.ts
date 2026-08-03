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

/**
 * Pure data-transformation utilities that convert between NodeProperties
 * (the language-server representation) and FormField[] (the UI form representation).
 *
 * Kept in a separate file so tests can import it without pulling in the rest of
 * bi.tsx (which brings in React components, highlight.js, etc.).
 */

import type {
    NodeProperties,
    NodePropertyKey,
    Property,
    FlowNode,
    Imports,
    DropdownType,
} from "@wso2/ballerina-core";
import { getPrimaryInputType, isTemplateType, isDropDownType } from "@wso2/ballerina-core";

import type {
    FormField,
    FormValues,
    FormImports,
    ParameterValue,
    Parameter,
} from "@wso2/ballerina-side-panel";

// ---------------------------------------------------------------------------
// Template → Form fields
// ---------------------------------------------------------------------------

export function convertNodePropertiesToFormFields(
    nodeProperties: NodeProperties,
    connections?: FlowNode[],
    clientName?: string
): FormField[] {
    const formFields: FormField[] = [];

    for (const key in nodeProperties) {
        if (nodeProperties.hasOwnProperty(key)) {
            const expression = nodeProperties[key as NodePropertyKey];
            if (expression) {
                if (getPrimaryInputType(expression.types)?.fieldType === "ADVANCE_PARAM_LIST") {
                    // Flatten sub-properties into top-level form fields with a prefixed key (parentKey__subKey)
                    const subProperties = expression.value as Record<string, Property>;
                    for (const subKey in subProperties) {
                        if (subProperties.hasOwnProperty(subKey)) {
                            const subProp = subProperties[subKey];
                            if (subProp) {
                                const subFormField = convertNodePropertyToFormField(
                                    `${key}__${subKey}`,
                                    subProp,
                                    connections,
                                    clientName
                                );
                                formFields.push(subFormField);
                            }
                        }
                    }
                } else {
                    const formField: FormField = convertNodePropertyToFormField(key, expression, connections, clientName);

                    if (getPrimaryInputType(expression.types)?.fieldType === "REPEATABLE_PROPERTY") {
                        handleRepeatableProperty(expression, formField);
                    }

                    formFields.push(formField);
                }
            }
        }
    }

    return formFields;
}

export function convertNodePropertyToFormField(
    key: string,
    property: Property,
    connections?: FlowNode[],
    clientName?: string
): FormField {
    const formField: FormField = {
        key,
        label: property.metadata?.label || "",
        type: getPrimaryInputType(property.types)?.fieldType ?? "",
        optional: property.optional,
        advanced: property.advanced,
        placeholder: property.placeholder,
        defaultValue: property.defaultValue as string,
        editable: isFieldEditable(property, connections, clientName),
        enabled: true,
        hidden: property.hidden,
        documentation: property.metadata?.description || "",
        value: getFormFieldValue(property, clientName),
        advanceProps: convertNodePropertiesToFormFields(property.advanceProperties),
        items: getFormFieldItems(property, connections),
        itemOptions: property.itemOptions,
        diagnostics: property.diagnostics?.diagnostics || [],
        types: property.types,
        lineRange: property?.codedata?.lineRange,
        metadata: property.metadata,
        codedata: property.codedata,
        dynamicFormFields: property?.dynamicFormFields
            ? Object.fromEntries(
                Object.entries(property.dynamicFormFields).map(([optKey, props]) => [
                    optKey,
                    convertNodePropertiesToFormFields(props, connections, clientName),
                ])
            )
            : undefined,
        imports: property.imports
    };
    return formField;
}

function isFieldEditable(expression: Property, connections?: FlowNode[], clientName?: string) {
    if (
        connections &&
        clientName &&
        getPrimaryInputType(expression.types)?.fieldType === "IDENTIFIER" &&
        expression.metadata.label === "Connection"
    ) {
        return false;
    }
    return expression.editable;
}

function getFormFieldValue(expression: Property, clientName?: string) {
    if (clientName && getPrimaryInputType(expression.types)?.fieldType === "IDENTIFIER" && expression.metadata.label === "Connection") {
        return clientName;
    }
    return expression.value as string;
}

function getFormFieldItems(expression: Property, connections: FlowNode[]): string[] {
    if (getPrimaryInputType(expression.types)?.fieldType === "IDENTIFIER" && expression.metadata.label === "Connection") {
        return connections.map((connection) => connection.properties?.variable?.value as string);
    } else if (expression.types?.length > 1 && (getPrimaryInputType(expression.types)?.fieldType === "MULTIPLE_SELECT" || getPrimaryInputType(expression.types)?.fieldType === "SINGLE_SELECT")) {
        return expression.types?.map(inputType => inputType.ballerinaType) as string[];
    } else if (expression.types?.length === 1 && isDropDownType(expression.types[0])) {
        return (expression.types[0] as DropdownType).options.map((option) => option.value);
    }
    return undefined;
}

function createParameterValue(index: number, paramValueKey: string, paramValue: ParameterValue): Parameter {
    const name = paramValue.value.variable.value;
    const type = paramValue.value.type.value;
    const variableLineRange = (paramValue.value.variable as any).codedata?.lineRange;
    const variableEditable = (paramValue.value.variable as any).editable;
    const parameterDescription = paramValue.value.parameterDescription?.value;

    return {
        id: index,
        icon: "",
        key: paramValueKey,
        value: `${type} ${name}`,
        identifierEditable: variableEditable,
        identifierRange: variableLineRange,
        formValues: {
            variable: name,
            type: type,
            parameterDescription: parameterDescription,
        },
    };
}

function createGenericPropertyValue(index: number, paramValueKey: string, entryValue: Record<string, any>): Parameter {
    const formValues: FormValues = {};
    for (const [key, subProp] of Object.entries(entryValue)) {
        if (subProp && typeof subProp === "object" && "value" in subProp) {
            formValues[key] = (subProp as any).value as string;
        }
    }
    const variableValue = (entryValue.variable?.value as string) || "";
    const typeValue = ((entryValue.dataType?.value || entryValue.type?.value || "") as string);
    const variableEditable = entryValue.variable?.editable ?? true;
    const variableLineRange = entryValue.variable?.codedata?.lineRange;
    const displayValue = [typeValue, variableValue].filter(Boolean).join(" ") || paramValueKey;

    return {
        id: index,
        icon: "",
        key: paramValueKey,
        value: displayValue,
        identifierEditable: variableEditable,
        identifierRange: variableLineRange,
        formValues,
    };
}

export function handleRepeatableProperty(property: Property, formField: FormField): void {
    const paramFields: FormField[] = [];

    const primaryInputType = getPrimaryInputType(property.types);
    if (isTemplateType(primaryInputType)) {
        for (const [paramKey, param] of Object.entries((primaryInputType.template).value as NodeProperties)) {
            const paramField = convertNodePropertyToFormField(paramKey, param);
            paramFields.push(paramField);
        }
    }

    const paramValues = Object.entries(property.value as NodeProperties).map(([paramValueKey, paramValue], index) => {
        const entryValue = (paramValue as any).value as Record<string, any>;
        if (entryValue?.type !== undefined) {
            return createParameterValue(index, paramValueKey, paramValue as any);
        }
        return createGenericPropertyValue(index, paramValueKey, entryValue ?? {});
    });

    formField.paramManagerProps = {
        paramValues,
        formFields: paramFields,
        handleParameter: handleParamChange,
    };

    formField.value = paramValues;

    function handleParamChange(param: Parameter): Parameter {
        const name = `${param.formValues["variable"] ?? ""}`;
        const type = `${param.formValues["type"] ?? param.formValues["dataType"] ?? ""}`;
        const defaultValue =
            Object.keys(param.formValues).indexOf("defaultable") > -1 && `${param.formValues["defaultable"]} `;
        let value = `${type} ${name}`.trim();
        if (defaultValue) {
            value += ` = ${defaultValue} `;
        }
        return { ...param, key: name, value };
    }
}

// ---------------------------------------------------------------------------
// Form fields → Template
// ---------------------------------------------------------------------------

export function updateNodeProperties(
    values: FormValues,
    nodeProperties: NodeProperties,
    formImports: FormImports,
    dirtyFields?: any
): NodeProperties {
    const updatedNodeProperties: NodeProperties = { ...nodeProperties };

    for (const key in values) {
        if (!values.hasOwnProperty(key)) {
            continue;
        }

        // Handle ADVANCE_PARAM_LIST flattened keys (parentKey__subKey)
        if (key.includes("__")) {
            const separatorIndex = key.indexOf("__");
            const parentKey = key.substring(0, separatorIndex);
            const subKey = key.substring(separatorIndex + 2);
            const parentProp = updatedNodeProperties[parentKey as NodePropertyKey];
            if (parentProp && getPrimaryInputType(parentProp.types)?.fieldType === "ADVANCE_PARAM_LIST") {
                const subProperties = parentProp.value as Record<string, Property>;
                if (subProperties && subProperties[subKey]) {
                    subProperties[subKey].value = values[key];
                    subProperties[subKey].modified = dirtyFields?.hasOwnProperty(key);
                    if (formImports?.[key]) {
                        subProperties[subKey].imports = formImports[key] as Imports;
                    }
                }
                continue;
            }
        }

        if (updatedNodeProperties.hasOwnProperty(key)) {
            const expression = updatedNodeProperties[key as NodePropertyKey];
            if (expression) {
                expression.imports = formImports?.[key] as Imports;
                expression.modified = dirtyFields?.hasOwnProperty(key);

                const dataValue = values[key];
                const primaryType = getPrimaryInputType(expression.types);
                if (primaryType?.fieldType === "REPEATABLE_PROPERTY" && isTemplateType(primaryType)) {
                    const template = primaryType?.template;
                    expression.value = {};
                    for (const [repeatKey, repeatValue] of Object.entries(dataValue)) {
                        const valueConstraint = JSON.parse(JSON.stringify(template));
                        for (const [paramKey, param] of Object.entries((valueConstraint as any).value as NodeProperties)) {
                            param.value = (repeatValue as any).formValues[paramKey] || "";
                        }
                        (expression.value as any)[(repeatValue as any).key] = valueConstraint;
                    }
                } else {
                    expression.value = dataValue;
                }

                // Reconstruct dynamicFormFields from form values
                // Reverse the mapping done in convertNodePropertyToFormField (lines 120-127)
                if (expression.dynamicFormFields) {
                    const reconstructedDynamicFormFields: Record<string, NodeProperties> = {};
                    for (const optKey in expression.dynamicFormFields) {
                        if (expression.dynamicFormFields.hasOwnProperty(optKey)) {
                            const dynamicFields = expression.dynamicFormFields[optKey];
                            const dynamicProps: NodeProperties = {};

                            // For each field in dynamicFormFields[optKey], look up its value in the form state
                            if (typeof dataValue === "object" && dataValue !== null) {
                                const dynamicFormValues = (dataValue as any)[optKey];
                                if (dynamicFormValues && typeof dynamicFormValues === "object") {
                                    // Reconstruct the nested property structure
                                    for (const fieldKey in dynamicFormValues) {
                                        if (dynamicFormValues.hasOwnProperty(fieldKey)) {
                                            // Find the original property template from nodeProperties
                                            const originalProp = nodeProperties[key as NodePropertyKey]?.dynamicFormFields?.[optKey]?.[fieldKey as NodePropertyKey];
                                            if (originalProp) {
                                                dynamicProps[fieldKey as NodePropertyKey] = {
                                                    ...originalProp,
                                                    value: dynamicFormValues[fieldKey],
                                                    modified: dirtyFields?.[key]?.[optKey]?.[fieldKey] ?? false,
                                                };
                                            }
                                        }
                                    }
                                }
                            }

                            if (Object.keys(dynamicProps).length > 0) {
                                reconstructedDynamicFormFields[optKey] = dynamicProps;
                            }
                        }
                    }
                    if (Object.keys(reconstructedDynamicFormFields).length > 0) {
                        expression.dynamicFormFields = reconstructedDynamicFormFields;
                    }
                }
            }
        }
    }

    return updatedNodeProperties;
}

/**
 * Assemble the form fields for a node's properties: one FormField per property key
 * (in sorted order unless `sortKeys` is false), excluding `skipKeys`. Moved here from
 * `utils/bi.tsx` to sit with its siblings and be unit-testable; `bi.tsx` re-exports it.
 *
 * Note: this faithfully emits a field for EVERY non-skipped key — it does not dedupe by
 * label. When two keys carry the same `metadata.label` (e.g. `rowType` + `type` both
 * "Row Type"), both fields appear; suppressing the redundant one is the caller's job via
 * `skipKeys` (see #1487).
 */
export function convertConfig(properties: NodeProperties, skipKeys: string[] = [], sortKeys: boolean = true): FormField[] {
    const formFields: FormField[] = [];
    const sortedKeys = sortKeys ? Object.keys(properties).sort() : Object.keys(properties);

    for (const key of sortedKeys) {
        if (skipKeys.includes(key)) {
            continue;
        }
        const property = properties[key as keyof NodeProperties];
        const formField = convertNodePropertyToFormField(key, property);

        if (getPrimaryInputType(property.types)?.fieldType === "REPEATABLE_PROPERTY") {
            handleRepeatableProperty(property, formField);
        }

        formFields.push(formField);
    }

    return formFields;
}