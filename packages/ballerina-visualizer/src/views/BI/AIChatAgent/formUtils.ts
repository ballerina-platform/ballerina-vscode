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

import { ELineRange, NodeProperties, Property, RecordTypeField, ToolParameters,
    ValueTypeConstraint, getPrimaryInputType } from "@wso2/ballerina-core";
import { ApprovalFunctionParam, FormField, FormValues, Parameter } from "@wso2/ballerina-side-panel";

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

// Form keys of the "Requires Approval" control. The checkbox is the field itself; these two are
// registered by the side-panel ApprovalEditor.
export const APPROVAL_FUNCTION_KEY = "approvalFunction";
export const GENERATE_APPROVAL_FUNCTION_KEY = "generateApprovalFunction";

// Prefill state for the "Requires Approval" control when editing a tool that already has the gate set.
export interface ExistingApprovalConfig {
    functionName?: string;
}

// The prefill from what the language server reports about a tool's @ai:AgentTool annotation: no gate when it
// doesn't require approval; otherwise the gate, with the local function it names, if any. A qualified or inline
// function isn't reported, so it reads as a gate without an attached function.
export function existingApprovalConfig(
    requiresApproval?: boolean, approvalFunction?: string
): ExistingApprovalConfig | undefined {
    if (!requiresApproval) {
        return undefined;
    }
    return approvalFunction ? { functionName: approvalFunction } : {};
}

export interface RequiresApprovalOptions {
    // "view" for the add-tool side panel (the add form opens over it); "inline" for full-page forms.
    presentation?: "view" | "inline";
    // Name the default approval-function name is derived from (the wrapped function or the tool);
    // a function reads it from the current form values, e.g. a tool name the user is still typing.
    baseName?: string | ((values: FormValues) => string);
    toolName?: string | ((values: FormValues) => string);
    getToolParameters?: (values: FormValues) => ApprovalFunctionParam[];
    onOpenFunction?: (name: string) => void;
    getFunctionInfo?: (name: string) => Promise<{
        params: ApprovalFunctionParam[];
        usedBy: string[];
        referencedElsewhere?: boolean;
        nameLineRange?: ELineRange;
    } | null>;
}

const isAiContextType = (type: string): boolean => type.replace(/\s/g, "") === "ai:Context";

// The tool's parameters as the approval function must mirror them: every tool form keeps its
// parameters as items carrying `formValues.type` / `formValues.variable` (REPEATABLE_PROPERTY,
// PARAM_MANAGER and the side panel's Tool Inputs alike). A leading `ai:Context` is dropped, since
// the ai module binds only the tool's own parameters to an approval function.
export function readToolParameters(values: FormValues, key: string = "parameters"): ApprovalFunctionParam[] {
    const raw = values?.[key];
    const items: any[] = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [];
    const params = items
        .map((item) => ({
            type: String(item?.formValues?.type ?? "").trim(),
            name: String(item?.formValues?.variable ?? "").trim(),
        }))
        .filter((param) => param.type && param.name);
    return params.length > 0 && isAiContextType(params[0].type) ? params.slice(1) : params;
}

// `sendEmail` -> `sendEmailApproval`; a trailing `Tool` is dropped so `sendEmailTool` reads the same.
export function defaultApprovalFunctionName(baseName?: string): string {
    let base = (baseName ?? "").replace(/^'/, "").replace(/[^A-Za-z0-9_]/g, "");
    if (base.length > 4 && base.endsWith("Tool")) {
        base = base.slice(0, -4);
    }
    if (!base || !/^[A-Za-z_]/.test(base)) {
        return "toolApproval";
    }
    return `${base.charAt(0).toLowerCase()}${base.slice(1)}Approval`;
}

// The "Requires Approval" field shared by every tool form. Rendered by the side-panel
// ApprovalEditor: a checkbox, then either "+ Add Approval Function" or the attached function with
// Open / Remove. A new function is generated by the language server when the tool is saved.
export function createRequiresApprovalField(
    existing?: ExistingApprovalConfig, options: RequiresApprovalOptions = {}
): FormField {
    return {
        key: "requiresApproval",
        label: "Requires Approval",
        type: "AGENT_TOOL_APPROVAL",
        optional: true,
        editable: true,
        documentation: "Pause this tool before it runs and wait for human approval.",
        value: Boolean(existing),
        types: [{ fieldType: "AGENT_TOOL_APPROVAL", selected: false }],
        enabled: true,
        approvalConfig: {
            functionKey: APPROVAL_FUNCTION_KEY,
            generateKey: GENERATE_APPROVAL_FUNCTION_KEY,
            initialFunction: existing?.functionName ?? "",
            presentation: options.presentation ?? "view",
            defaultFunctionName: (values: FormValues) => {
                const base = options.baseName ?? options.toolName;
                return defaultApprovalFunctionName(typeof base === "function" ? base(values) : base);
            },
            toolName: options.toolName,
            getToolParameters: options.getToolParameters ?? ((values) => readToolParameters(values)),
            onOpenFunction: options.onOpenFunction,
            getFunctionInfo: options.getFunctionInfo,
        },
    } as FormField;
}

// The `codedata.data` fields that carry the human-in-the-loop gate to the language server,
// derived from the "Requires Approval" control's submitted state. Shared by every tool form.
//   - box unchecked         -> {} (no gate).
//   - checked, no function  -> { requiresApproval: "true" } (unconditional).
//   - checked, existing fn  -> { requiresApproval: <name> }.
//   - checked, added fn     -> { requiresApproval: <name>, generateApprovalFunction: "true" } (the LS
//                              generates the function with the tool's parameters on save).
export function buildApprovalToolData(
    data: FormValues
): { requiresApproval?: string; generateApprovalFunction?: string } {
    const isOn = (value: unknown) => value === true || value === "true";
    if (!isOn(data["requiresApproval"])) {
        return {};
    }
    const approvalFn = typeof data[APPROVAL_FUNCTION_KEY] === "string" ? data[APPROVAL_FUNCTION_KEY].trim() : "";
    const result: { requiresApproval?: string; generateApprovalFunction?: string } = {
        requiresApproval: approvalFn || "true",
    };
    if (approvalFn && isOn(data[GENERATE_APPROVAL_FUNCTION_KEY])) {
        result.generateApprovalFunction = "true";
    }
    return result;
}

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
            growRange: { start: 3, offset: 12 },
            optional: true,
            editable: true,
            documentation: "Describe what this tool does. The agent uses this to decide when to invoke the tool.",
            value: descriptionValue,
            types: [{ fieldType: "STRING", selected: false }],
            enabled: true,
        },
    ];
}

export type PropertyEntry = { key: string; property: Property };


export function extractRecordTypeFieldsFromEntries(entries: PropertyEntry[]): RecordTypeField[] {
    return entries
        .filter(({ property }) => getPrimaryInputType(property?.types)?.typeMembers
            ?.some(member => member.kind === "RECORD_TYPE"))
        .map(({ key, property }) => ({
            key,
            property,
            recordTypeMembers: getPrimaryInputType(property?.types)?.typeMembers
                .filter(member => member.kind === "RECORD_TYPE"),
        }));
}

export function extractRecordTypeFields(properties: NodeProperties): RecordTypeField[] {
    return extractRecordTypeFieldsFromEntries(
        Object.entries(properties).map(([key, property]) => ({ key, property }))
    );
}
