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
import { InputMode } from "../MultiModeExpressionEditor/ChipExpressionEditor/types";

// How the form Copilot fills a value: STRING is plain text kept as typed, VALUE keeps the field's own property.
export type SlotKind = "STRING" | "SINGLE_SELECT" | "FLAG" | "TYPE" | "IDENTIFIER" | "NUMBER" | "VALUE";
export type SlotValueKind = Exclude<SlotKind, "VALUE">;

// CHOICE, OPTIONS and TOGGLE decide which other fields apply; ROWS is offered as a row group; LATER is not offered yet.
export type FieldKind = SlotKind | "CHOICE" | "OPTIONS" | "TOGGLE" | "ROWS" | "SECTION" | "LATER" | "NONE";

// Every input type, so a new one does not compile until it is decided how the Copilot treats it.
const FIELD_KINDS: Record<FormFieldInputType, FieldKind> = {
    TEXT: "VALUE",
    BOOLEAN: "STRING",
    IDENTIFIER: "IDENTIFIER",
    AUTOCOMPLETE: "SINGLE_SELECT",
    AGENT_TOOL_APPROVAL: "FLAG",
    SINGLE_SELECT: "SINGLE_SELECT",
    MULTIPLE_SELECT: "ROWS",
    TEXTAREA: "STRING",
    TEMPLATE: "STRING",
    TYPE: "TYPE",
    EXPRESSION: "VALUE",
    REPEATABLE_PROPERTY: "ROWS",
    PARAM_MANAGER: "ROWS",
    STRING: "STRING",
    FILE_SELECT: "STRING",
    PROJECT_FILE_SELECT: "STRING",
    ACTION_OR_EXPRESSION: "VALUE",
    MULTIPLE_SELECT_LISTENER: "NONE",
    SINGLE_SELECT_LISTENER: "NONE",
    EXPRESSION_SET: "ROWS",
    TEXT_SET: "ROWS",
    FLAG: "FLAG",
    CHOICE: "CHOICE",
    LV_EXPRESSION: "VALUE",
    RAW_TEMPLATE: "VALUE",
    "ai:Prompt": "VALUE",
    FIXED_PROPERTY: "NONE",
    ENUM: "SINGLE_SELECT",
    DM_JOIN_CLAUSE_RHS_EXPRESSION: "VALUE",
    RECORD_MAP_EXPRESSION: "VALUE",
    REPEATABLE_MAP: "ROWS",
    PROMPT: "VALUE",
    RECORD_FIELD_SELECTOR: "LATER",
    SQL_QUERY: "VALUE",
    CLAUSE_EXPRESSION: "VALUE",
    SLIDER: "NUMBER",
    HEADER_SET: "ROWS",
    DROPDOWN_CHOICE: "OPTIONS",
    CUSTOM_DROPDOWN: "SINGLE_SELECT",
    ACTION_TYPE: "TYPE",
    ACTION_EXPRESSION: "VALUE",
    VIEW: "NONE",
    SERVICE_PATH: "STRING",
    STRING_LITERAL: "VALUE",
    ACTION_PATH: "STRING",
    RESOURCE_PATH: "STRING",
    NUMBER: "NUMBER",
    REPEATABLE_LIST: "ROWS",
    CONDITIONAL_FIELDS: "TOGGLE",
    DOC_TEXT: "STRING",
    ADVANCE_PARAM_LIST: "NONE",
    GROUP_SECTION: "SECTION",
    CONNECTION: "LATER",
};

export const selectedType = (field: { types?: InputType[] }): InputType | undefined =>
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

// The text of a string literal or of a string template, as Text mode shows it (interpolations become chips); undefined otherwise.
const stringLiteralText = (expression: string): string | undefined => {
    const trimmed = expression.trim();
    const template = trimmed.match(/^string\s*`([^`]*)`$/);
    if (template) {
        return template[1];
    }
    return stringLiteral(trimmed);
};

/** The text inside a string template, with or without `string` before it; undefined for any other expression. */
export const templateBody = (expression: string): string | undefined => /^(?:string\s*)?`([\s\S]*)`$/.exec(expression.trim())?.[1];

/** The text of a double-quoted string literal; undefined for any other expression. */
export function stringLiteral(expression: string): string | undefined {
    try {
        const text = JSON.parse(expression);
        return typeof text === "string" ? text : undefined;
    } catch {
        return undefined;
    }
}

/** What a text or number field shows for a value it can hold as it is; undefined when the value needs Expression mode. */
export const literalText = (mode: InputMode, expression: string): string | undefined => {
    if (mode === InputMode.TEXT) {
        return stringLiteralText(expression);
    }
    if (mode === InputMode.NUMBER) {
        return /^-?\d+(\.\d+)?$/.test(expression.trim()) ? expression.trim() : undefined;
    }
    return undefined;
};

const LITERAL_MODES: Partial<Record<string, InputMode>> = { TEXT: InputMode.TEXT, NUMBER: InputMode.NUMBER };

// The mode switcher offers a field's first and last types; the last is the expression mode when it takes an expression.
const expressionMode = (field: FormField): InputType | undefined => {
    const last = field.types?.length > 1 ? field.types[field.types.length - 1] : undefined;
    return last?.fieldType === "EXPRESSION" ? last : undefined;
};

const literalMode = (field: FormField) => (expressionMode(field) ? LITERAL_MODES[selectedType(field)?.fieldType ?? ""] : undefined);

/** A field in a text or number mode takes any value of its expression mode's type, e.g. a list where the text holds one name; the mode stays, so its value still reads as text. */
export const assistTypes = (field: FormField): InputType[] =>
    literalMode(field) ? field.types.map((type) => (type.selected ? { ...type, ballerinaType: expressionMode(field)!.ballerinaType } : type)) : field.types;

/** Selects the field's expression mode for a value its text or number mode can't show, as its editor does when the value lands there. */
export function selectModeFor(field: FormField, value: string): void {
    const mode = literalMode(field);
    if (mode && value.trim() && literalText(mode, value) === undefined) {
        const expression = expressionMode(field);
        field.types.forEach((type) => { type.selected = type === expression; });
    }
}

export function slotType(field: FormField, kind: SlotValueKind): InputType {
    if (kind === "SINGLE_SELECT") {
        return { fieldType: kind, selected: true, options: fieldOptions(field) } as InputType;
    }
    if (kind === "NUMBER") {
        return { fieldType: "EXPRESSION", ballerinaType: selectedType(field)?.ballerinaType || "int", selected: true };
    }
    return { fieldType: kind, ballerinaType: selectedType(field)?.ballerinaType, selected: true } as InputType;
}
