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

import { ValueTypeConstraint, ToolParameters, getPrimaryInputType } from "@wso2/ballerina-core";
import { FormField, Parameter } from "@wso2/ballerina-side-panel";

const SQL_PARAMETERIZED_TYPES = ["sql:ParameterizedQuery", "sql:ParameterizedCallQuery"];
const isSqlParameterizedField = (field: FormField): boolean =>
    field.types?.some(t => t.ballerinaType && SQL_PARAMETERIZED_TYPES.includes(t.ballerinaType)) ?? false;

export function createToolInputFields(filteredNodeParameterFields: FormField[]): FormField[] {
    const paramManagerValues = filteredNodeParameterFields
        .filter(field => !(field.optional && field.advanced) && field.key !== "targetType"
            && !isSqlParameterizedField(field))
        .map((field, idx) => {
            const cleanKey = field.key.replace(/^\$/, '');
            let inputType = getPrimaryInputType(field.types);
            if (inputType?.fieldType === "SINGLE_SELECT" && !inputType.ballerinaType) {
                inputType = field.types?.find(t => t.ballerinaType) || inputType;
            }
            return {
                id: idx,
                icon: "",
                key: field.key,
                value: `${inputType?.ballerinaType || inputType?.fieldType} ${cleanKey}`,
                identifierEditable: true,
                identifierRange: {
                    fileName: "functions.bal",
                    startLine: { line: 0, offset: 0 },
                    endLine: { line: 0, offset: 0 }
                },
                formValues: {
                    variable: cleanKey,
                    type: inputType?.ballerinaType,
                    parameterDescription: field.documentation || ""
                }
            }
        });

    const paramManagerFormFields: FormField[] = [
        {
            key: "type",
            label: "Type",
            type: "TYPE",
            optional: false,
            advanced: false,
            editable: true,
            enabled: true,
            hidden: false,
            documentation: "Type of the parameter",
            value: "",
            advanceProps: [],
            diagnostics: [],
            metadata: { label: "Type", description: "Type of the parameter" },
            types: [{ fieldType: "TYPE", selected: false }],
        },
        {
            key: "variable",
            label: "Name",
            type: "IDENTIFIER",
            optional: false,
            advanced: false,
            editable: true,
            enabled: true,
            hidden: false,
            documentation: "Name of the parameter",
            value: "",
            advanceProps: [],
            diagnostics: [],
            metadata: { label: "Name", description: "Name of the parameter" },
            types: [{ fieldType: "IDENTIFIER", selected: false }],
        },
        {
            key: "parameterDescription",
            label: "Description",
            type: "STRING",
            optional: true,
            advanced: false,
            editable: true,
            enabled: true,
            hidden: false,
            documentation: "Description of the parameter",
            value: "",
            advanceProps: [],
            diagnostics: [],
            metadata: { label: "Description", description: "Description of the parameter" },
            types: [{ fieldType: "STRING", selected: false }]
        }
    ];

    return [
        {
            key: "parameters",
            label: "Tool Inputs",
            type: "PARAM_MANAGER",
            optional: true,
            advanced: false,
            editable: false,
            enabled: true,
            hidden: false,
            documentation: "Define the inputs the agent must provide when invoking this tool.",
            value: paramManagerValues,
            advanceProps: [],
            diagnostics: [],
            types: [{ fieldType: "PARAM_MANAGER", selected: false }],
            paramManagerProps: {
                paramValues: paramManagerValues,
                formFields: paramManagerFormFields,
                handleParameter: function (parameter: Parameter): Parameter {
                    return parameter;
                }
            }
        }
    ];
}


export function createDefaultParameterValue({ value, parameterDescription, type }: { value: string, parameterDescription?: string, type?: string }): ValueTypeConstraint {
    const defaultMetadata = {
        label: "",
        description: "",
    };
    return {
        metadata: defaultMetadata,
        valueType: "",
        value: {
            variable: {
                value,
                metadata: defaultMetadata,
                valueType: "",
                optional: false,
                editable: false,
                advanced: false
            },
            parameterDescription: {
                value: parameterDescription || "",
                metadata: defaultMetadata,
                valueType: "",
                optional: false,
                editable: false,
                advanced: false
            },
            type: {
                value: type || "",
                metadata: defaultMetadata,
                valueType: "",
                optional: false,
                editable: false,
                advanced: false
            }
        },
        optional: false,
        editable: false,
        advanced: false
    };
}

export function createToolParameters(): ToolParameters {
    return {
        metadata: {
            label: "Tool Inputs",
            description: "Define the inputs the agent must provide when invoking this tool."
        },
        types: [
            {
                fieldType: "REPEATABLE_PROPERTY",
                selected: false,
                template: {
                    metadata: {
                        label: "Parameter",
                        description: "Function parameter"
                    },
                    types: [{ fieldType: "FIXED_PROPERTY", selected: false }],
                    value: {
                        type: {
                            metadata: {
                                label: "Type",
                                description: "Type of the parameter"
                            },
                            types: [{ fieldType: "TYPE", selected: false }],
                            value: "",
                            optional: false,
                            editable: true,
                            advanced: false,
                            hidden: false
                        },
                        variable: {
                            metadata: {
                                label: "Name",
                                description: "Name of the parameter"
                            },
                            types: [{ fieldType: "IDENTIFIER", selected: false }],
                            value: "",
                            optional: false,
                            editable: true,
                            advanced: false,
                            hidden: false
                        },
                        parameterDescription: {
                            metadata: {
                                label: "Description",
                                description: "Description of the parameter"
                            },
                            valueType: "STRING",
                            value: "",
                            optional: true,
                            editable: true,
                            advanced: false,
                            hidden: false
                        }
                    },
                    optional: false,
                    editable: false,
                    advanced: false,
                    hidden: false
                }
            }],
        value: {},
        optional: true,
        editable: false,
        advanced: false,
        hidden: false
    };
}

export const cleanServerUrl = (url: string): string | null => {
    if (url === null || url === undefined) return null;
    return url.replace(/^"|"$/g, '').trim();
};

export const HIDDEN_TOOL_NODE_PROPERTY_KEYS = ["variable", "checkError", "connection", "resourcePath"];

export function prepareToolInputFields(fields: FormField[]): FormField[] {
    const includedKeys: string[] = [];
    fields.forEach((field, idx) => {
        if (HIDDEN_TOOL_NODE_PROPERTY_KEYS.includes(field.key)) {
            field.hidden = true;
            return;
        }
        if (isSqlParameterizedField(field)) {
            field.value = "";
        }
        if (field.codedata?.kind === "PARAM_FOR_TYPE_INFER" || field.key === "targetType" || field.key === "rowType") {
            if (field.types?.[0]?.fieldType === "RECORD_FIELD_SELECTOR") {
                field.optional = false;
                field.advanced = false;
            } else {
                field.optional = true;
                field.advanced = true;
                field.value = field?.defaultValue || "";
                return;
            }
        }
        if (getPrimaryInputType(field.types)?.fieldType === "TYPE") {
            fields[idx].documentation = "The data type this tool will return to the agent.";
            return;
        }
        if (field.optional == false && field.key != "type" && !isSqlParameterizedField(field)) {
            const rawValue = field.key.startsWith('$') ? "'" + field.key.substring(1) : field.key;
            field.value = rawValue;
        }
        field.label = `${field.label} Mapping`;
        if (field.type === "SQL_QUERY" && field.types
            && !field.types.some(t => t.ballerinaType === "sql:ParameterizedQuery")) {
            field.type = "EXPRESSION";
            field.types = field.types.map(t => ({ ...t, selected: t.fieldType === "EXPRESSION" }));
        }
        includedKeys.push(field.key);
    });
    return fields.filter(field => includedKeys.includes(field.key));
}

const CODE_FENCE_REGEX = /```[\s\S]*?```/g;

// LS descriptions can embed fenced code samples that are noise in a form field.
export const stripCodeFences = (text: string): string => text.replace(CODE_FENCE_REGEX, "").trim();

// Same, for fields that must stay on a single line (tool descriptions are written into source).
export const stripCodeFencesInline = (text: string): string =>
    text.replace(CODE_FENCE_REGEX, "").replace(/\n/g, " ").trim();

export function buildAgentToolFields(nameValue: string, descriptionValue: string): FormField[] {
    return [
        {
            key: "name",
            label: "Tool Name",
            type: "IDENTIFIER",
            optional: false,
            editable: true,
            documentation: "Enter a unique name for the tool.",
            value: nameValue,
            types: [{ fieldType: "IDENTIFIER", scope: "Global", selected: false }],
            enabled: true,
        },
        {
            key: "description",
            label: "Description",
            type: "TEXTAREA",
            optional: true,
            editable: true,
            documentation: "Describe what this tool does. The agent uses this to decide when to invoke the tool.",
            value: descriptionValue,
            types: [{ fieldType: "STRING", selected: false }],
            enabled: true,
        },
    ];
}
