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

import { FormFieldInputType, InputType } from "@wso2/ballerina-core";
import { FormField } from "../../Form/types";

// How the form Copilot fills a value: STRING is plain text kept as typed, VALUE keeps the field's own property.
export type SlotKind = "STRING" | "SINGLE_SELECT" | "FLAG" | "TYPE" | "IDENTIFIER" | "NUMBER" | "VALUE";

// A field whose value decides which other fields apply: a choice of branches, a select whose options carry fields,
// or a checkbox with fields per state. SECTION only groups fields; LATER is not offered yet; NONE holds no value.
export type FieldKind = SlotKind | "CHOICE" | "OPTIONS" | "TOGGLE" | "SECTION" | "LATER" | "NONE";

// Every input type, so a new one does not compile until it is decided how the Copilot treats it.
const FIELD_KINDS: Record<FormFieldInputType, FieldKind> = {
    TEXT: "VALUE",
    BOOLEAN: "STRING",
    IDENTIFIER: "IDENTIFIER",
    AUTOCOMPLETE: "SINGLE_SELECT",
    AGENT_TOOL_APPROVAL: "LATER",
    SINGLE_SELECT: "SINGLE_SELECT",
    MULTIPLE_SELECT: "LATER",
    TEXTAREA: "STRING",
    TEMPLATE: "STRING",
    TYPE: "TYPE",
    EXPRESSION: "VALUE",
    REPEATABLE_PROPERTY: "LATER",
    PARAM_MANAGER: "LATER",
    STRING: "STRING",
    FILE_SELECT: "STRING",
    PROJECT_FILE_SELECT: "STRING",
    ACTION_OR_EXPRESSION: "VALUE",
    MULTIPLE_SELECT_LISTENER: "NONE",
    SINGLE_SELECT_LISTENER: "NONE",
    EXPRESSION_SET: "LATER",
    TEXT_SET: "LATER",
    FLAG: "FLAG",
    CHOICE: "CHOICE",
    LV_EXPRESSION: "VALUE",
    RAW_TEMPLATE: "VALUE",
    "ai:Prompt": "VALUE",
    FIXED_PROPERTY: "NONE",
    ENUM: "SINGLE_SELECT",
    DM_JOIN_CLAUSE_RHS_EXPRESSION: "VALUE",
    RECORD_MAP_EXPRESSION: "VALUE",
    REPEATABLE_MAP: "LATER",
    PROMPT: "VALUE",
    RECORD_FIELD_SELECTOR: "LATER",
    SQL_QUERY: "VALUE",
    CLAUSE_EXPRESSION: "VALUE",
    SLIDER: "NUMBER",
    HEADER_SET: "LATER",
    DROPDOWN_CHOICE: "OPTIONS",
    CUSTOM_DROPDOWN: "SINGLE_SELECT",
    ACTION_TYPE: "LATER",
    ACTION_EXPRESSION: "VALUE",
    VIEW: "NONE",
    SERVICE_PATH: "STRING",
    STRING_LITERAL: "VALUE",
    ACTION_PATH: "STRING",
    RESOURCE_PATH: "STRING",
    NUMBER: "NUMBER",
    REPEATABLE_LIST: "LATER",
    CONDITIONAL_FIELDS: "TOGGLE",
    DOC_TEXT: "STRING",
    ADVANCE_PARAM_LIST: "NONE",
    GROUP_SECTION: "SECTION",
    CONNECTION: "LATER",
};

export const selectedType = (field: FormField): InputType | undefined =>
    field.types?.find((type) => type.selected) ?? field.types?.[0];

const takesExpression = (field: FormField) => field.types?.some((type) => type.fieldType === "EXPRESSION");

export function kindOf(field: FormField): FieldKind {
    const kind = FIELD_KINDS[selectedType(field)?.fieldType as FormFieldInputType] ?? "LATER";
    if ((kind === "SINGLE_SELECT" || kind === "FLAG") && field.dynamicFormFields) {
        return kind === "FLAG" ? "TOGGLE" : "OPTIONS";
    }
    // A select or toggle that also takes an expression is filled through that expression.
    return (kind === "SINGLE_SELECT" || kind === "FLAG") && takesExpression(field) ? "VALUE" : kind;
}

const option = (value: unknown, label?: unknown) => ({ value: String(value), label: String(label ?? value) });

// Each choice with the label the dropdown shows, so a change reads as the user picked it.
export function fieldOptions(field: FormField): { label: string; value: string }[] {
    const listed = (selectedType(field) as { options?: { value: unknown; label?: unknown }[] } | undefined)?.options;
    return field.itemOptions?.map(({ value, content }) => option(value, content))
        ?? field.items?.map((item: unknown) => {
            const { value, label } = (typeof item === "object" && item ? item : { value: item }) as { value: unknown; label?: unknown };
            return option(value, label);
        })
        ?? listed?.map(({ value, label }) => option(value, label))
        ?? [];
}

export function slotType(field: FormField, kind: Exclude<SlotKind, "VALUE">): InputType {
    if (kind === "SINGLE_SELECT") {
        return { fieldType: kind, selected: true, options: fieldOptions(field) } as InputType;
    }
    if (kind === "NUMBER") {
        return { fieldType: "EXPRESSION", ballerinaType: selectedType(field)?.ballerinaType || "int", selected: true };
    }
    return { fieldType: kind, ballerinaType: selectedType(field)?.ballerinaType, selected: true } as InputType;
}
