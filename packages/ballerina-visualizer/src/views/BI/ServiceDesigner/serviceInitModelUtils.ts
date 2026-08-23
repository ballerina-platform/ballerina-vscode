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

import { FormField, FormImports, FormValues } from "@wso2/ballerina-side-panel";
import { getPrimaryInputType, Property, PropertyModel, RecordTypeField, ServiceInitModel } from "@wso2/ballerina-core";
import { getImportsForProperty } from "../../../utils/bi";
import { sanitizedHttpPath, normalizeValueToArray } from "./utils";

/** Maps `properties` to FormField objects. */
export function mapPropertiesToFormFields(properties: { [key: string]: PropertyModel; }): FormField[] {
    if (!properties) return [];

    return Object.entries(properties).map(([key, property]) => {

        // Determine value for MULTIPLE_SELECT, EXPRESSION_SET, and TEXT_SET
        let value: any = property.value;
        const fieldType = getPrimaryInputType(property.types)?.fieldType;
        if (fieldType === "MULTIPLE_SELECT" || fieldType === "EXPRESSION_SET" || fieldType === "TEXT_SET") {
            if (property.values && property.values.length > 0) {
                value = property.values;
            } else if (property.value) {
                value = [property.value];
            } else if (property.items && property.items.length > 0) {
                value = [property.items[0]];
            } else {
                value = [];
            }
        }

        let items = undefined;
        if (fieldType === "MULTIPLE_SELECT" || fieldType === "SINGLE_SELECT") {
            items = property.items;
        }

        // For SINGLE_SELECT with nested per-option properties, build dynamicFormFields
        // Each key in properties maps to a dropdown option whose inner properties become FormField[]
        let dynamicFormFields: { [key: string]: FormField[] } | undefined = undefined;
        if (fieldType === "SINGLE_SELECT" && property.properties && property.items) {
            dynamicFormFields = {};
            for (const optionKey in property.properties) {
                const optionValue = property.properties[optionKey];
                if (optionValue.properties) {
                    dynamicFormFields[optionKey] = mapPropertiesToFormFields(optionValue.properties);
                } else {
                    dynamicFormFields[optionKey] = [];
                }
            }
        }

        return {
            key,
            label: property?.metadata?.label,
            type: fieldType,
            documentation: property?.metadata?.description || "",
            valueType: getPrimaryInputType(property.types)?.ballerinaType,
            editable: property.editable ?? true,
            enabled: property.enabled ?? true,
            optional: property.optional,
            value,
            types: property.types,
            advanced: property.advanced,
            hidden: property.hidden,
            diagnostics: [],
            items,
            choices: property.choices,
            placeholder: property.placeholder,
            addNewButton: property.addNewButton,
            lineRange: property?.codedata?.lineRange,
            codedata: property?.codedata,
            advanceProps: !dynamicFormFields ? mapPropertiesToFormFields(property.properties) : undefined,
            dynamicFormFields,
            groupName: property?.metadata?.groupName,
            groupNo: property?.metadata?.groupNo,
        } as FormField;
    });
}

/** Writes the form field values back into the ServiceInitModel. */
export function populateServiceInitModelFromFormFields(formFields: FormField[], model: ServiceInitModel): ServiceInitModel {
    if (!model || !model.properties || !formFields) return model;

    formFields.forEach(field => {
        const property = model.properties[field.key];
        if (!property) return;

        const value = field.value;

        // Handle MULTIPLE_SELECT, EXPRESSION_SET, and TEXT_SET types
        if (field.type === "MULTIPLE_SELECT" || field.type === "EXPRESSION_SET" || field.type === "TEXT_SET") {
            property.values = normalizeValueToArray(value);
        } else {
            property.value = value as string;
        }
    });
    return model;
}

/** Recursively collects record-type fields from properties and nested choices. */
export function collectRecordTypeFields(properties: { [key: string]: PropertyModel }): RecordTypeField[] {
    const recordTypeFields: RecordTypeField[] = [];

    const collect = (properties: any) => {
        if (!properties) return;

        Object.entries(properties).forEach(([key, property]: [string, any]) => {
            const primaryType = getPrimaryInputType(property.types);
            if (primaryType?.typeMembers && primaryType.typeMembers.some((member: any) => member.kind === "RECORD_TYPE")) {
                recordTypeFields.push({
                    key,
                    property: {
                        ...property,
                        metadata: {
                            label: property.metadata?.label || key,
                            description: property.metadata?.description || ''
                        },
                        types: property.types,
                        diagnostics: {
                            hasDiagnostics: property.diagnostics && property.diagnostics.length > 0,
                            diagnostics: property.diagnostics
                        }
                    } as Property,
                    recordTypeMembers: primaryType.typeMembers.filter((member: any) => member.kind === "RECORD_TYPE")
                });
            }

            if (property.choices && property.choices.length > 0) {
                property.choices.forEach((choice: any) => {
                    if (choice.properties) {
                        collect(choice.properties);
                    }
                });
            }

            if (primaryType?.fieldType === "GROUP_SECTION" && property.properties) {
                collect(property.properties);
            }
        });
    };

    collect(properties);
    return recordTypeFields;
}

/** Recursively processes a property and its nested CHOICE fields. */
export function processPropertyRecursively(property: PropertyModel, data: FormValues, propertyKey?: string): void {
    if (getPrimaryInputType(property.types)?.fieldType === "CHOICE" && property.choices) {
        const selectedIndex = propertyKey && data[propertyKey] !== undefined
            ? Number(data[propertyKey])
            : (property.value !== undefined ? Number(property.value) : 0);

        if (propertyKey && data[propertyKey] !== undefined) {
            property.value = data[propertyKey] as string;
        }

        property.choices.forEach((choice, index) => {
            choice.enabled = false;

            if (selectedIndex === index) {
                choice.enabled = true;

                if (choice.properties) {
                    for (const nestedKey in choice.properties) {
                        const nestedProperty = choice.properties[nestedKey];

                        if (data[nestedKey] !== undefined) {
                            // Handle MULTIPLE_SELECT, EXPRESSION_SET, and TEXT_SET types
                            if (getPrimaryInputType(nestedProperty.types)?.fieldType === "MULTIPLE_SELECT" || getPrimaryInputType(nestedProperty.types)?.fieldType === "EXPRESSION_SET" || getPrimaryInputType(nestedProperty.types)?.fieldType === "TEXT_SET") {
                                const value = data[nestedKey];
                                nestedProperty.values = normalizeValueToArray(value);
                            } else {
                                nestedProperty.value = data[nestedKey] as string;
                            }
                        }

                        processPropertyRecursively(nestedProperty, data, nestedKey);
                    }
                }
            }
        });
    }
    else if (property.properties) {
        for (const nestedKey in property.properties) {
            const nestedProperty = property.properties[nestedKey];

            if (data[nestedKey] !== undefined) {
                if (getPrimaryInputType(nestedProperty.types)?.fieldType === "MULTIPLE_SELECT" || getPrimaryInputType(nestedProperty.types)?.fieldType === "EXPRESSION_SET" || getPrimaryInputType(nestedProperty.types)?.fieldType === "TEXT_SET") {
                    const value = data[nestedKey];
                    nestedProperty.values = normalizeValueToArray(value);
                } else {
                    nestedProperty.value = data[nestedKey] as string;
                }
            }

            processPropertyRecursively(nestedProperty, data, nestedKey);
        }
    }
}

/** Recursively updates a CHOICE field selection in the model; true when found. */
export function updateChoiceInModel(properties: { [key: string]: PropertyModel }, fieldKey: string, value: any): boolean {
    if (properties[fieldKey]) {
        const property = properties[fieldKey];
        if (getPrimaryInputType(property.types)?.fieldType === "CHOICE" && property.choices) {
            property.value = value as string;
            property.choices.forEach((choice, index) => {
                choice.enabled = (Number(value) === index);
            });
            return true;
        }
    }

    // Search in nested choice properties - ONLY search through enabled choices
    for (const key in properties) {
        const property = properties[key];
        if (property.choices) {
            const enabledChoice = property.choices.find(choice => choice.enabled);
            if (enabledChoice?.properties && updateChoiceInModel(enabledChoice.properties, fieldKey, value)) {
                return true;
            }
        }
        if (property.properties && updateChoiceInModel(property.properties, fieldKey, value)) {
            return true;
        }
    }

    return false;
}

/**
 * Applies submitted form values (including CHOICE/CONDITIONAL_FIELDS selections and
 * per-field imports) onto the form fields, then populates the ServiceInitModel from them.
 *
 * Mutates both `formFields` and `model` in place, mirroring the original submit flow.
 *
 * @param formFields The form fields backing the form.
 * @param model The ServiceInitModel to populate.
 * @param data The submitted form values.
 * @param formImports The imports collected by the form.
 * @returns The populated ServiceInitModel.
 */
export function applyFormValuesToModel(formFields: FormField[], model: ServiceInitModel, data: FormValues, formImports: FormImports): ServiceInitModel {
    formFields.forEach(val => {
        if (val.type === "CHOICE") {
            val.choices.forEach((choice, index) => {
                choice.enabled = false;
                if (data[val.key] === index) {
                    choice.enabled = true;
                    if (choice.properties) {
                        for (const key in choice.properties) {
                            const property = choice.properties[key];
                            if (data[key] !== undefined) {
                                const fieldType = getPrimaryInputType(property.types)?.fieldType;
                                // Handle array types (TEXT_SET, EXPRESSION_SET, MULTIPLE_SELECT)
                                if (fieldType === "MULTIPLE_SELECT" || fieldType === "EXPRESSION_SET" || fieldType === "TEXT_SET") {
                                    property.values = normalizeValueToArray(data[key]);
                                } else {
                                    if (key === "basePath") {
                                        property.value = sanitizedHttpPath(data[key]);
                                    } else {
                                        property.value = data[key];
                                    }
                                }
                            }
                            processPropertyRecursively(property, data, key);
                        }
                    }
                }
            })
        } else if (data[val.key] !== undefined) {
            val.value = data[val.key];
        }

        if (val.type === "CONDITIONAL_FIELDS" || val.type === "GROUP_SECTION") {
            val.advanceProps?.forEach(subField => {
                const subProperty = model.properties[val.key]?.properties?.[subField.key];
                if (subProperty) {
                    if (data[subField.key] !== undefined) {
                        const fieldType = getPrimaryInputType(subProperty.types)?.fieldType;
                        if (fieldType === "MULTIPLE_SELECT" || fieldType === "EXPRESSION_SET" || fieldType === "TEXT_SET") {
                            subProperty.values = normalizeValueToArray(data[subField.key]);
                        } else {
                            subProperty.value = data[subField.key];
                        }
                    }
                    processPropertyRecursively(subProperty, data, subField.key);
                }
            });
        }

        val.imports = getImportsForProperty(val.key, formImports);
    })
    return populateServiceInitModelFromFormFields(formFields, model);
}
