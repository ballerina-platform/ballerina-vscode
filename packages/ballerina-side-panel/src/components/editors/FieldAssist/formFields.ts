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

import { ExpressionProperty, FormAssistCondition, FormAssistGroup, FormAssistSlot, InputType, PropertyModel, getPrimaryInputType } from "@wso2/ballerina-core";
import { FormField } from "../../Form/types";
import { FieldKind, SlotKind, fieldOptions, kindOf, slotType } from "./fieldKinds";
import { Row, rowShape } from "./rowShapes";

type SlotValueKind = Exclude<SlotKind, "VALUE">;

// A field the form Copilot can read and fill, found in the form's field tree whether or not its editor is on screen.
export interface TreeField {
    field: FormField;
    kind: FieldKind;
    // The values other fields must hold for this one to apply.
    when?: FormAssistCondition[];
    // A choice's branch labels, by index.
    labels?: string[];
}

type Values = Record<string, unknown>;

export interface FormWriter {
    getValues: () => Values;
    setValue: (key: string, value: unknown, options: { shouldDirty: boolean; shouldValidate: boolean }) => void;
}

const CONDITIONS: FieldKind[] = ["CHOICE", "OPTIONS", "TOGGLE"];
const NOT_OFFERED: FieldKind[] = ["SECTION", "LATER", "NONE"];

// A parameter list says whether its rows can change; its own `editable` only says it is not typed into.
const readOnly = (field: FormField, kind: FieldKind) =>
    kind === "ROWS" ? !rowShape(field) || field.readonlyParameters === true || (!field.paramManagerProps && field.editable === false)
        : field.editable === false;

const labelOf = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (first) => first.toUpperCase());

/** A model's nested properties as form fields, as the choice editor renders a branch. */
export function propertyFormFields(model?: PropertyModel): FormField[] {
    return Object.entries(model?.properties ?? {}).map(([key, property]) => {
        const fieldType = getPrimaryInputType(property.types)?.fieldType;
        const options = fieldType === "SINGLE_SELECT" && property.properties && property.items
            ? Object.fromEntries(Object.entries(property.properties).map(([option, nested]) => [option, propertyFormFields(nested)]))
            : undefined;
        const listed = property.values?.length ? property.values : property.value ? [property.value] : [];
        return {
            key,
            label: property.metadata?.label || labelOf(key),
            type: fieldType,
            documentation: property.metadata?.description || "",
            types: property.types,
            editable: property.editable,
            enabled: property.enabled ?? true,
            hidden: property.hidden,
            optional: property.optional,
            value: fieldType === "TEXT_SET" ? listed : property.value,
            advanced: property.advanced,
            diagnostics: [],
            items: fieldType === "MULTIPLE_SELECT" || fieldType === "SINGLE_SELECT" ? property.items : undefined,
            choices: property.choices,
            placeholder: property.placeholder,
            defaultValue: property.defaultValue as string,
            advanceProps: fieldType === "GROUP_SECTION" ? propertyFormFields(property) : undefined,
            dynamicFormFields: options,
        } as FormField;
    });
}

// The fields each value of a condition reveals.
function branches(field: FormField, kind: FieldKind, labels: string[]): [string, FormField[]][] {
    if (kind === "CHOICE") {
        return (field.choices ?? []).map((choice, index) => [labels[index], propertyFormFields(choice)]);
    }
    if (field.dynamicFormFields) {
        return Object.entries(field.dynamicFormFields);
    }
    // A conditional checkbox keeps its checked fields in the first choice and its unchecked ones in the second.
    return [["true", propertyFormFields(field.choices?.[0])], ["false", propertyFormFields(field.choices?.[1])]];
}

// A key in several branches is one field; it keeps a condition only where the branches agree on what it depends on.
function mergeWhen(first?: FormAssistCondition[], second?: FormAssistCondition[]): FormAssistCondition[] | undefined {
    if (!first || !second || first.length !== second.length || first.some((condition, index) => condition.path !== second[index].path)) {
        return undefined;
    }
    return first.map((condition, index) => ({ path: condition.path, values: [...new Set([...condition.values, ...second[index].values])] }));
}

/** Every field the Copilot can fill, with the conditions that reveal it; containers are flattened. */
export function treeFields(fields: FormField[]): TreeField[] {
    const found = new Map<string, TreeField>();
    const walk = (list: FormField[], when?: FormAssistCondition[]) => list.forEach((field) => {
        if (field.enabled === false || field.hidden) {
            return;
        }
        const kind = kindOf(field);
        if (kind === "SECTION") {
            walk(field.advanceProps ?? [], when);
            return;
        }
        if (NOT_OFFERED.includes(kind) || readOnly(field, kind)) {
            return;
        }
        const labels = kind === "CHOICE" ? (field.choices ?? []).map((choice, index) => choice.metadata?.label || `Option ${index + 1}`) : undefined;
        const known = found.get(field.key);
        found.set(field.key, known ? { ...known, when: mergeWhen(known.when, when) } : { field, kind, when, labels });
        if (CONDITIONS.includes(kind)) {
            branches(field, kind, labels ?? []).forEach(([value, children]) =>
                walk(children, [...(when ?? []), { path: field.key, values: [value] }]));
        }
    });
    walk(fields);
    return [...found.values()];
}

/** The fields' own keys and every key nested in them, e.g. for the section that holds them. */
export const keysWithin = (fields: FormField[]): string[] =>
    [...new Set([...fields.map((field) => field.key), ...treeFields(fields).map((entry) => entry.field.key)])];

// A choice is held as its branch index, a checkbox as a boolean; the Copilot reads and writes both as text.
function valueText(entry: TreeField, values: Values): string {
    const held = values[entry.field.key] ?? entry.field.value;
    if (entry.kind === "CHOICE") {
        const index = typeof held === "number" || /^\d+$/.test(String(held ?? "")) ? Number(held)
            : (entry.field.choices ?? []).findIndex((choice) => choice.enabled);
        return entry.labels?.[index] ?? "";
    }
    return typeof held === "string" || typeof held === "boolean" || typeof held === "number" ? String(held) : "";
}

function slotProperty(entry: TreeField, toProperty: (field: FormField) => ExpressionProperty): ExpressionProperty {
    const property = toProperty(entry.field);
    const { field, kind } = entry;
    if (kind === "VALUE") {
        return property;
    }
    if (kind === "CHOICE") {
        const options = (entry.labels ?? []).map((label) => ({ label, value: label }));
        return { ...property, types: [{ fieldType: "SINGLE_SELECT", selected: true, options } as InputType] };
    }
    if (kind === "OPTIONS") {
        const listed = fieldOptions(field);
        const options = listed.length ? listed : Object.keys(field.dynamicFormFields ?? {}).map((value) => ({ label: value, value }));
        return { ...property, types: [{ fieldType: "SINGLE_SELECT", selected: true, options } as InputType] };
    }
    return { ...property, types: [slotType(field, kind === "TOGGLE" ? "FLAG" : kind as SlotValueKind)] };
}

/** The fields as slots for the form Copilot, read from the form's current values. */
export function describeFields(tree: TreeField[], values: Values, toProperty: (field: FormField) => ExpressionProperty): FormAssistSlot[] {
    return tree.filter((entry) => entry.kind !== "ROWS").map((entry) => ({
        path: entry.field.key,
        label: entry.field.label,
        description: entry.field.documentation || undefined,
        property: slotProperty(entry, toProperty),
        value: valueText(entry, values),
        optional: entry.field.optional,
        when: entry.when,
    }));
}

/** The fields that hold several values (lists, maps, picks) as row groups, read from the form's current values. */
export function describeRows(tree: TreeField[], values: Values, toProperty: (field: FormField) => ExpressionProperty): FormAssistGroup[] {
    return tree.filter((entry) => entry.kind === "ROWS").map(({ field, when }) => {
        const shape = rowShape(field)!;
        return {
            id: field.key,
            label: field.label,
            description: field.documentation || undefined,
            item: shape.item(field, toProperty),
            rows: shape.rows(values[field.key] ?? field.value),
            min: 0,
            when,
        };
    });
}

function encode(entry: TreeField, value: string | Row[], values: Values): unknown {
    if (Array.isArray(value)) {
        return rowShape(entry.field)!.held(value, entry.field, values[entry.field.key] ?? entry.field.value);
    }
    if (entry.kind === "CHOICE") {
        const index = entry.labels?.indexOf(value) ?? -1;
        return index >= 0 ? index : Number(value);
    }
    return entry.kind === "FLAG" || entry.kind === "TOGGLE" ? value === "true" : value;
}

/**
 * Writes the Copilot's values and rows by form key in the shape each editor holds. A value whose field applies only
 * under a condition first sets the fields it depends on, so the editor that shows it opens. Returns the keys written.
 */
export function writeFields(tree: TreeField[], changes: Record<string, string | Row[]>, form: FormWriter): string[] {
    const byKey = new Map(tree.map((entry) => [entry.field.key, entry]));
    const written: string[] = [];
    const write = (entry: TreeField, value: string | Row[]) => {
        const encoded = encode(entry, value, form.getValues());
        form.setValue(entry.field.key, encoded, { shouldDirty: true, shouldValidate: true });
        if (entry.kind !== "CHOICE" && entry.kind !== "ROWS") {
            entry.field.onValueChange?.(encoded as string | boolean);
        }
        written.push(entry.field.key);
    };
    const reveal = (entry: TreeField, seen: Set<string>) => (entry.when ?? []).forEach(({ path, values }) => {
        const controller = byKey.get(path);
        if (!controller || seen.has(path)) {
            return;
        }
        seen.add(path);
        reveal(controller, seen);
        if (!values.includes(valueText(controller, form.getValues()))) {
            write(controller, values[0]);
        }
    });
    // Conditions first, so a value given for a field and for the choice that shows it ends on the field's branch.
    const ordered = Object.entries(changes).sort(([a], [b]) =>
        Number(CONDITIONS.includes(byKey.get(b)?.kind as FieldKind)) - Number(CONDITIONS.includes(byKey.get(a)?.kind as FieldKind)));
    for (const [key, value] of ordered) {
        const entry = byKey.get(key);
        if (entry) {
            reveal(entry, new Set());
            write(entry, value);
        }
    }
    return written;
}
