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

import { AvailableNode, Category, NodeMetadata, NodeProperties, Property, RecordTypeField, ToolParameters,
    ValueTypeConstraint, getPrimaryInputType } from "@wso2/ballerina-core";
import { FormField, FormValues, Parameter } from "@wso2/ballerina-side-panel";

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

// Categories in the FUNCTION search response that are NOT the project's own functions: standard
// library and imported/third-party modules (plus agent tools). Approval-predicate pickers offer
// only the user's own module-level functions as candidates, so these are skipped.
// Matched by label rather than a structural field because the category itself carries no org/module
// info (only the leaf AvailableNode.codedata does, one level down) — this is a wording-fragile check,
// not a considered choice. If the LS ever renames these labels, this filter silently stops working.
const NON_LOCAL_FUNCTION_CATEGORIES = ["Standard Library", "Agent Tools"];
function isLocalFunctionCategory(label: string | undefined): boolean {
    if (!label) return true;
    return !NON_LOCAL_FUNCTION_CATEGORIES.includes(label) && !label.includes("Imported");
}

// Recursively collect the names of the project's own functions from raw search-result categories,
// to offer as approval-predicate candidates. The list-level search response has no reliable return
// type to filter on (codedata.inferredReturnType is only populated in niche type-inference cases,
// not for ordinary `boolean` returns), so all local functions are offered and the compiler/LS flags
// an incompatible pick after generation — the RequiresApproval contract (params mirror the tool,
// returns boolean) is verified there, not here. Agent-tool functions are excluded.
export function collectLocalFunctionNames(items: (Category | AvailableNode)[], acc: Set<string>): void {
    for (const item of items) {
        if (item && "items" in item && Array.isArray((item as Category).items)) {
            if (isLocalFunctionCategory((item as Category).metadata?.label)) {
                collectLocalFunctionNames((item as Category).items as (Category | AvailableNode)[], acc);
            }
            continue;
        }
        const node = item as AvailableNode;
        const name = node?.codedata?.symbol;
        if (name && !(node.metadata?.data as NodeMetadata)?.isAgentTool) {
            acc.add(name);
        }
    }
}

// Prefill state for the "Requires Approval" control, parsed from an existing @ai:AgentTool
// annotation when editing a tool that already has the gate set.
export interface ExistingApprovalConfig {
    functionName?: string;
}

// The static "Requires Approval" CONDITIONAL_FIELDS field, shared by every tool-creation path
// (function, connection, custom). The annotation value is `boolean | isolated function`: checking
// the box alone emits `requiresApproval: true`; picking a function in the revealed sub-field emits
// that function reference instead, so approval becomes conditional at runtime. Modeled as
// CONDITIONAL_FIELDS (CheckBoxConditionalEditor) so the function picker is part of this field
// rather than a separate, disconnected form entry.
// `allowCreate` controls whether the picker accepts a free-typed (new) function name. Create flows
// pass true (a new name drives predicate scaffolding via AgentToolBuilder); edit flows pass false —
// those paths rewrite source directly and never reach the generator, so a new name would produce a
// dangling reference. Restricting edits to existing functions keeps the annotation always resolvable.
export function createRequiresApprovalField(
    existing?: ExistingApprovalConfig, allowCreate: boolean = true
): FormField {
    return {
        key: "requiresApproval",
        label: "Requires Approval",
        type: "CONDITIONAL_FIELDS",
        optional: true,
        editable: true,
        documentation: "Pause this tool before it runs and wait for human approval.",
        value: Boolean(existing),
        types: [{ fieldType: "CONDITIONAL_FIELDS", selected: false }],
        enabled: true,
        choices: [
            {
                metadata: { label: "On" },
                properties: {
                    approvalFunction: {
                        metadata: {
                            label: "Approval Function",
                            description: allowCreate
                                ? "Optional. Decides per call whether approval is needed. Pick one of your functions, or type a name to create one."
                                : "Optional. Decides per call whether approval is needed. Pick one of your existing functions.",
                        },
                        // AUTOCOMPLETE (not EXPRESSION): the annotation slot takes a function *reference*
                        // (a bare name), never a call expression. `items` are injected at runtime once the
                        // candidate list is fetched. When allowCreate is true, free-typed names are accepted
                        // (drive the "create a new predicate" path); when false, the picker is a strict
                        // pick-list of existing functions.
                        // The identifier rule guards the free-typed path: without it, a value like
                        // "my predicate" goes straight into both `requiresApproval: <name>` and the
                        // generated `isolated function <name>(...)`, producing invalid Ballerina source.
                        types: [{
                            fieldType: "AUTOCOMPLETE", selected: true,
                            validations: [{ rule: "common.validate.identifier", message: "Invalid identifier" }],
                        }],
                        allowItemCreate: allowCreate,
                        value: existing?.functionName || "",
                        optional: true,
                        editable: true,
                    },
                },
            },
            { metadata: { label: "Off" }, properties: {} },
        ],
    } as unknown as FormField;
}

// Rebuild the static "Requires Approval" field with the runtime-fetched picker candidates injected
// into its "On" branch. `items` populate the AUTOCOMPLETE dropdown; the label, description and
// placeholder are preserved from the static definition.
// `candidates` is `null` when the fetch itself failed (as opposed to a project with no eligible
// functions, which is `[]`) — an empty list can't be told apart from a failure by buildApprovalToolData,
// which treats any name absent from the list as new. Surfacing a picker over an empty-by-failure list
// would let a user re-pick their existing `isHighValue`, have it read as new, and silently regenerate
// a duplicate/broken predicate. So on failure the "On" branch drops the picker entirely and falls back
// to the plain unconditional-approval checkbox until the candidate list is actually known.
export function buildRequiresApprovalField(baseField: FormField, candidates: string[] | null): FormField {
    const onChoice = baseField.choices?.[0];
    const approvalProp = onChoice?.properties?.approvalFunction;
    if (!approvalProp) {
        return baseField;
    }
    if (candidates === null) {
        return {
            ...baseField,
            choices: [
                { ...onChoice, properties: {} },
                ...baseField.choices.slice(1),
            ],
        };
    }
    return {
        ...baseField,
        choices: [
            {
                ...onChoice,
                properties: {
                    ...onChoice.properties,
                    approvalFunction: {
                        ...approvalProp,
                        items: candidates,
                    },
                },
            },
            ...baseField.choices.slice(1),
        ],
    };
}

// The `codedata.data` fields that carry the human-in-the-loop gate into AgentToolBuilder's code
// generator, derived from the "Requires Approval" control's submitted state. Shared by every
// tool-creation path (function, connection, custom, agent-call) so they emit identical data.
//   - box unchecked        -> {} (no gate).
//   - checked, no function  -> { requiresApproval: "true" } (unconditional).
//   - checked, existing fn  -> { requiresApproval: <name> } (reference an already-defined predicate).
//   - checked, new fn       -> { requiresApproval: <name>, generateApprovalFunction: "true" } (the LS
//                              also scaffolds a correctly-signed predicate stub).
// `compatibleFunctions` is the picker's candidate list; a typed name absent from it is treated as new.
export function buildApprovalToolData(
    data: FormValues, compatibleFunctions: string[]
): { requiresApproval?: string; generateApprovalFunction?: string } {
    const checked = data["requiresApproval"] === true || data["requiresApproval"] === "true";
    if (!checked) {
        return {};
    }
    const approvalFn = typeof data["approvalFunction"] === "string" ? data["approvalFunction"].trim() : "";
    const result: { requiresApproval?: string; generateApprovalFunction?: string } = {
        requiresApproval: approvalFn || "true",
    };
    if (approvalFn && !compatibleFunctions.includes(approvalFn)) {
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
