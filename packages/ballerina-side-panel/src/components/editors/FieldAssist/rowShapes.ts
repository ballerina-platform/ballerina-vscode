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

import { ExpressionProperty, FormAssistGroup, FormFieldInputType, InputType, alignRows } from "@wso2/ballerina-core";
import type { FormField } from "../../Form/types";
import type { Parameter } from "../../ParamManager/ParamManager";
import { FieldKind, SlotValueKind, fieldOptions, kindOf, selectedType, slotType } from "./fieldKinds";

export type Row = Record<string, string>;

/** How a field that holds several values is offered as rows, and the value its editor holds for those rows. */
interface RowShape {
    item: (field: FormField, toProperty: (field: FormField) => ExpressionProperty) => FormAssistGroup["item"];
    rows: (held: unknown) => Row[];
    held: (rows: Row[], field: FormField, current: unknown) => unknown;
    // Set when the editor marks each row on its own; names one row, e.g. "Parameter".
    rowLabel?: (field: FormField) => string;
}

const typed = (property: ExpressionProperty, type: Partial<InputType>): ExpressionProperty =>
    ({ ...property, types: [{ selected: true, ...type } as InputType] });

export const text = (value: unknown) => (typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "");

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

const entryValue = (entry: unknown) => text(isObject(entry) ? entry.value : entry);

// The element type of a list or map: from its template's selected type, else from the declared type.
function elementType(field: FormField): string | undefined {
    const type = selectedType(field) as InputType & { template?: { types?: InputType[] } };
    const template = type?.template?.types?.find((option) => option.selected) ?? type?.template?.types?.[0];
    return template?.ballerinaType || type?.ballerinaType?.replace(/\[\]$/, "").replace(/^map<(.+)>$/, "$1");
}

// The list editor pads itself with empty entries, which hold no value.
const filled = (rows: Row[]) => rows.filter((row) => row.value?.trim());

// A list of values, held as text (an expression or plain text) or as entries with a `value`.
const listOf = (fieldType: "EXPRESSION" | "STRING", asEntries = false): RowShape => ({
    item: (field, toProperty) => [{ key: "value", label: "Value", property: typed(toProperty(field), { fieldType, ballerinaType: elementType(field) }) }],
    rows: (held) => filled((Array.isArray(held) ? held : []).map((entry) => ({ value: entryValue(entry) }))),
    held: (rows) => rows.map((row) => (asEntries ? { value: row.value ?? "" } : row.value ?? "")),
});

// A map, one row per entry; no entries is held as empty text.
const mapShape: RowShape = {
    item: (field, toProperty) => [
        { key: "key", label: "Key", property: typed(toProperty(field), { fieldType: "STRING" }) },
        { key: "value", label: "Value", property: typed(toProperty(field), { fieldType: "EXPRESSION", ballerinaType: elementType(field) }) },
    ],
    rows: (held) => (isObject(held) ? Object.entries(held).map(([key, entry]) => ({ key, value: entryValue(entry) })) : []),
    held: (rows) => (rows.length ? Object.fromEntries(rows.map((row) => [row.key ?? "", { value: row.value ?? "" }])) : ""),
};

// Picks from the field's options; the form holds one value until the editor writes the list.
const picksShape: RowShape = {
    item: (field, toProperty) => [{ key: "value", label: "Value", property: typed(toProperty(field), { fieldType: "SINGLE_SELECT", options: fieldOptions(field) }) }],
    rows: (held) => filled((Array.isArray(held) ? held : [held]).map((value) => ({ value: text(value) }))),
    held: (rows) => rows.map((row) => row.value ?? ""),
};

// Response headers: a name, one of the field's types, and whether the header may be absent.
const headersShape: RowShape = {
    item: (field, toProperty) => [
        { key: "name", label: "Name", property: typed(toProperty(field), { fieldType: "STRING" }) },
        { key: "type", label: "Type", property: typed(toProperty(field), { fieldType: "SINGLE_SELECT", options: fieldOptions(field) }) },
        { key: "optional", label: "Optional", property: { ...typed(toProperty(field), { fieldType: "FLAG" }), optional: true } },
    ],
    rows: (held) => (Array.isArray(held) ? held : []).map((header) => ({ name: text(header?.name), type: text(header?.type), optional: text(header?.optional ?? false) })),
    held: (rows) => rows.map((row) => ({ name: row.name ?? "", type: row.type ?? "", optional: row.optional === "true" })),
};

const VALUE_KINDS: FieldKind[] = ["STRING", "SINGLE_SELECT", "FLAG", "TYPE", "IDENTIFIER", "NUMBER"];

const paramFields = (field: FormField) =>
    (field.paramManagerProps?.formFields ?? []).filter((child) => !child.hidden && child.editable !== false);

// One parameter's fields as row items, each in the kind its editor takes.
const paramItem = (child: FormField, toProperty: (field: FormField) => ExpressionProperty): FormAssistGroup["item"][number] => {
    const kind = kindOf(child);
    const property = { ...toProperty(child), optional: child.optional };
    return { key: child.key, label: child.label, property: VALUE_KINDS.includes(kind) ? { ...property, types: [slotType(child, kind as SlotValueKind)] } : property };
};

// The parameter's name matches a row to the parameter it was read from, so an edited row keeps that parameter.
const nameKey = (field: FormField) => (paramFields(field).find((child) => kindOf(child) === "IDENTIFIER") ?? paramFields(field)[0])?.key ?? "";

const formValue = (child: FormField, row: Row) => (kindOf(child) === "FLAG" ? row[child.key] === "true" : row[child.key] ?? "");

const asParameters = (held: unknown): Parameter[] => (Array.isArray(held) ? held : []);

// Parameters as the parameter editor keeps them; each row is one parameter's form values.
const paramsShape: RowShape = {
    item: (field, toProperty) => paramFields(field).map((child) => paramItem(child, toProperty)),
    rows: (held) => asParameters(held).filter((param) => !param.hidden)
        .map((param) => Object.fromEntries(Object.entries(param.formValues ?? {}).map(([key, value]) => [key, text(value)]))),
    held: (rows, field, current) => {
        const config = field.paramManagerProps;
        const key = nameKey(field);
        const all = asParameters(current);
        const shown = all.filter((param) => !param.hidden);
        const defaults = Object.fromEntries((config?.formFields ?? []).map((child) => [child.key, child.value ?? ""]));
        // A part the row leaves out keeps the parameter's own value.
        const formValues = (row: Row) => Object.fromEntries(paramFields(field).filter((child) => row[child.key] !== undefined)
            .map((child) => [child.key, formValue(child, row)]));
        const written = alignRows(shown.map((param) => text(param.formValues?.[key])), rows.map((row) => row[key] ?? ""))
            .filter((step) => step.after !== undefined)
            .map((step) => {
                const base: Parameter = step.before !== undefined ? shown[step.before]
                    : { id: 0, formValues: defaults, key: "", value: "", icon: "", identifierEditable: true, identifierRange: undefined };
                return { ...base, formValues: { ...base.formValues, ...formValues(rows[step.after!]) } };
            });
        // A hidden parameter keeps its place.
        all.forEach((param, index) => param.hidden && written.splice(Math.min(index, written.length), 0, param));
        return written
            .map((param, id) => ({ ...param, id }))
            .map((param) => (config?.handleParameter ? config.handleParameter(param) : param));
    },
    rowLabel: (field) => field.addNewButtonLabel || "Parameter",
};

const ROW_SHAPES: Partial<Record<FormFieldInputType, RowShape>> = {
    EXPRESSION_SET: listOf("EXPRESSION"),
    TEXT_SET: listOf("STRING"),
    REPEATABLE_LIST: listOf("EXPRESSION", true),
    REPEATABLE_MAP: mapShape,
    MULTIPLE_SELECT: picksShape,
    HEADER_SET: headersShape,
    PARAM_MANAGER: paramsShape,
};

/** How the field is offered as rows; a parameter list kept as a template of properties is one too. */
export function rowShape(field: FormField): RowShape | undefined {
    const type = selectedType(field)?.fieldType as FormFieldInputType;
    if (type === "REPEATABLE_PROPERTY") {
        return field.paramManagerProps ? paramsShape : undefined;
    }
    return ROW_SHAPES[type];
}
