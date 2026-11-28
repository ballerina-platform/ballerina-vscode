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

import { cloneDeep } from "lodash";
import type { Branch, DropdownType, FlowNode, FormAssistGroup, FormAssistResponse, FormAssistSlot, InputType, Property } from "@wso2/ballerina-core";
import { alignRows } from "@wso2/ballerina-core";
import { BRANCH_MARKS, MATCH_DEFAULT_PATTERN, newElseBranch, newForkWorker, newIfBranch, newMatchCase, newMatchDefault } from "./branches";

// What a form-level assist request sees of a node, and how its answer goes back in.
export interface NodeAssistSchema {
    describe(node: FlowNode): { slots: FormAssistSlot[]; groups: FormAssistGroup[] };
    apply(node: FlowNode, patch: FormAssistResponse): FlowNode;
}

type Row = Record<string, string>;

const VALUE_TYPES = new Set(["EXPRESSION", "ACTION_OR_EXPRESSION", "LV_EXPRESSION", "RECORD_MAP_EXPRESSION", "PROMPT", "IDENTIFIER", "TYPE", "TEXT", "SQL_QUERY"]);
const STRING_LITERAL = /^"(?:[^"\\]|\\.)*"$/;
// A text field's editor also holds a string template, so its interpolations show as chips there.
const STRING_TEMPLATE = /^string\s*`[\s\S]*`$/;
const NUMBER_LITERAL = /^-?\d+(\.\d+)?[dDfF]?$/;
// A select, a toggle or a number box that also takes an expression; the helper fills it through that expression.
// A list or map that also takes an expression can be set whole, e.g. matches, instead of row by row.
const EXPRESSION_BACKED = new Set(["SINGLE_SELECT", "FLAG", "NUMBER", "REPEATABLE_LIST", "REPEATABLE_MAP"]);
const CHOICE_TYPES = new Set(["SINGLE_SELECT", "FLAG"]);
const REPEATABLE_TYPES = new Set(["REPEATABLE_LIST", "REPEATABLE_MAP", "REPEATABLE_PROPERTY"]);
const ENTRY_KEY = "key";
const ENTRY_VALUE = "value";

const selectedType = (property: Property): InputType | undefined =>
    property.types?.find((type) => type.selected) ?? property.types?.[0];

const typed = (property: Property, fieldType: string, ballerinaType?: string): Property => ({
    ...property,
    types: [{ fieldType, ballerinaType, selected: true } as InputType],
});

// A toggle's value comes as a boolean from some nodes and as "true" or "false" from others.
const text = (value: unknown): string => (typeof value === "string" ? value : typeof value === "boolean" ? String(value) : "");

// Whether a value can stay in its field's own mode, e.g. a string literal in a text field.
function fitsMode(type: InputType | undefined, value: string): boolean {
    switch (type?.fieldType) {
        case "TEXT":
            return STRING_LITERAL.test(value) || STRING_TEMPLATE.test(value.trim());
        case "NUMBER":
            return NUMBER_LITERAL.test(value);
        case "FLAG":
            return value === "true" || value === "false";
        case "SINGLE_SELECT":
            return (type as DropdownType).options?.some((option) => option.value === value) ?? false;
        // The record view shows only a record literal; anything else, such as orders[0], needs the expression editor.
        case "RECORD_MAP_EXPRESSION":
            return value.trim().startsWith("{");
        // The prompt and SQL editors show a template; a variable or a call needs the expression editor.
        case "PROMPT":
            return value.trim().startsWith("`") || STRING_TEMPLATE.test(value.trim());
        case "SQL_QUERY":
            return value.trim().startsWith("`");
        // A single value for a list or map is the whole thing, which only the expression editor holds.
        case "REPEATABLE_LIST":
        case "REPEATABLE_MAP":
            return false;
        default:
            return true;
    }
}

const selectingExpression = (property: Property): Property => ({
    ...property,
    types: property.types?.map((type) => ({ ...type, selected: type.fieldType === "EXPRESSION" })),
});

const setValue = (property: Property, value: string) => {
    property.value = (typeof property.value === "boolean" ? value === "true" : value) as Property["value"];
    property.modified = true;
    // Anything the field's own mode can't show switches it to its expression mode.
    if (!fitsMode(selectedType(property), value)) {
        property.types = selectingExpression(property).types;
    }
};

// The property as a slot sees it, or undefined when the helper can't fill it.
function slotProperty(property: Property, type: InputType): Property | undefined {
    if (VALUE_TYPES.has(type.fieldType)) {
        return property;
    }
    const expressible = EXPRESSION_BACKED.has(type.fieldType) && property.types?.some((option) => option.fieldType === "EXPRESSION");
    if (expressible) {
        return selectingExpression(property);
    }
    // A select or a toggle with no expression mode takes one of its listed values.
    return CHOICE_TYPES.has(type.fieldType) ? property : undefined;
}

// Pairs each row with the existing branch that holds the same value, so a branch's steps stay with its condition when
// rows are inserted, removed or reordered; an edited row keeps its branch, and a new row gets a new one.
function matchBranches(branches: Branch[], valueOf: (branch: Branch) => string, rows: Row[], rowValue: (row: Row) => string,
    create: (index: number) => Branch): [Branch, Row][] {
    return alignRows(branches.map((branch) => valueOf(branch).trim()), rows.map((row) => rowValue(row).trim()))
        .filter((step) => step.after !== undefined)
        .map((step) => [step.before !== undefined ? branches[step.before] : create(step.after!), rows[step.after!]]);
}

// A toggle group: one empty row when the branch is on.
const toggle = (id: string, label: string, on: boolean, description?: string): FormAssistGroup =>
    ({ id, label, description, item: [], rows: on ? [{}] : [], min: 0, max: 1 });

// ---- If ----

const isElse = (branch: Branch) => branch.label === "Else";
const IF_LABEL = "Then";
// A new If node carries a placeholder Else whose only child is a draft; the form treats that as no else.
const isDraftElse = (branch: Branch) =>
    branch.children?.length === 1 && branch.children[0].codedata.node === "EMPTY" && !!branch.children[0].metadata.draft;

const conditionProperty = typed(newIfBranch(0).properties.condition, "EXPRESSION", "boolean");
const isCase = (branch: Branch) => branch.codedata.node === "CONDITIONAL";

const ifSchema: NodeAssistSchema = {
    describe: (node) => {
        const conditions = node.branches.filter(isCase);
        return {
            slots: [],
            groups: [
                {
                    id: BRANCH_MARKS.conditions, label: "Conditions", rowLabel: "Condition", min: 1, rowField: "branch",
                    description: "The if condition first, then each else-if in order; they are checked in this order, so a new condition goes at the end unless the request says where. Their steps are added in the diagram.",
                    item: [{ key: "condition", label: "Condition", property: conditionProperty }],
                    rows: conditions.map((branch) => ({ condition: text(branch.properties.condition.value) })),
                },
                toggle(BRANCH_MARKS.else, "Else", node.branches.some((branch) => isElse(branch) && !isDraftElse(branch))),
            ],
        };
    },
    apply: (node, patch) => {
        const next = cloneDeep(node);
        const conditions = next.branches.filter(isCase);
        let elseBranches = next.branches.filter(isElse);
        const others = next.branches.filter((branch) => !isCase(branch) && !isElse(branch));
        const rows = patch.groups?.conditions as Row[] | undefined;
        const updated = rows
            ? matchBranches(conditions, (branch) => text(branch.properties.condition.value), rows, (row) => row.condition ?? "", newIfBranch)
                .map(([branch, row], index) => {
                    setValue(branch.properties.condition, row.condition ?? "");
                    // The language server writes the "Then" branch as the if, wherever it sits, so the label follows position.
                    branch.label = index === 0 ? IF_LABEL : branch.label === IF_LABEL ? "" : branch.label;
                    return branch;
                })
            : conditions;
        const elseRows = patch.groups?.else;
        if (elseRows) {
            elseBranches = elseRows.length
                ? [elseBranches.find((branch) => !isDraftElse(branch)) ?? { ...(elseBranches[0] ?? newElseBranch()), children: [] }]
                : [];
        }
        next.branches = [...updated, ...elseBranches, ...others];
        return next;
    },
};

// ---- Match ----

const patternsOf = (branch: Branch) => (branch.properties?.patterns?.value as unknown as Property[] | undefined) ?? [];
// A new Match node's first case has no pattern entry yet.
const firstPattern = (branch: Branch): Property => {
    const patterns = patternsOf(branch);
    if (!patterns.length) {
        branch.properties.patterns.value = patternsOf(newMatchCase(0)) as unknown as Property["value"];
    }
    return patternsOf(branch)[0];
};
const isDefault = (branch: Branch) => patternsOf(branch)[0]?.value === MATCH_DEFAULT_PATTERN;
const isDraftDefault = (branch: Branch) => !!branch.children?.[0]?.metadata?.draft;

const matchSchema: NodeAssistSchema = {
    describe: (node) => {
        const target = node.properties?.matchTarget;
        const cases = node.branches.filter((branch) => isCase(branch) && !isDefault(branch));
        return {
            slots: target ? [{ path: `properties.${BRANCH_MARKS.target}`, label: "Target", property: target, value: text(target.value) }] : [],
            groups: [
                {
                    id: BRANCH_MARKS.cases, label: "Cases", rowLabel: "Case", min: 1, rowField: "branch",
                    description: "One pattern per case, matched against the target in order, so a new case goes at the end unless the request says where. Their steps are added in the diagram.",
                    item: [{ key: "pattern", label: "Pattern", property: typed(patternsOf(newMatchCase(0))[0], "EXPRESSION") }],
                    rows: cases.map((branch) => ({ pattern: patternsOf(branch).map((pattern) => text(pattern.value)).join("|") })),
                },
                toggle(BRANCH_MARKS.default, "Default", node.branches.some((branch) => isDefault(branch) && !isDraftDefault(branch)), "Runs when no case matches."),
            ],
        };
    },
    apply: (node, patch) => {
        const next = cloneDeep(node);
        applyValues(next, patch);
        const cases = next.branches.filter((branch) => isCase(branch) && !isDefault(branch));
        let defaults = next.branches.filter(isDefault);
        const others = next.branches.filter((branch) => !isCase(branch));
        const rows = patch.groups?.cases as Row[] | undefined;
        const updated = rows
            ? matchBranches(cases, (branch) => patternsOf(branch).map((pattern) => text(pattern.value)).join("|"), rows, (row) => row.pattern ?? "", newMatchCase)
                .map(([branch, row]) => {
                    setValue(firstPattern(branch), row.pattern ?? "");
                    return branch;
                })
            : cases;
        const defaultRows = patch.groups?.default;
        if (defaultRows) {
            const kept = defaults[0] ?? newMatchDefault();
            kept.children?.forEach((child) => {
                if (child.metadata) {
                    child.metadata.draft = false;
                }
            });
            defaults = defaultRows.length ? [kept] : [];
        }
        next.branches = [...updated, ...defaults, ...others];
        return next;
    },
};

// ---- Fork ----

const forkSchema: NodeAssistSchema = {
    describe: (node) => ({
        slots: [],
        groups: [{
            id: BRANCH_MARKS.workers, label: "Workers", rowLabel: "Worker", min: 2, rowField: "branch",
            description: "Each worker runs in parallel; its steps are added in the diagram afterwards, so only name it and give its return type.",
            item: [
                { key: "name", label: "Worker Name", property: typed(newForkWorker(0).properties.variable, "IDENTIFIER") },
                { key: "type", label: "Return Type", property: typed(newForkWorker(0).properties.type, "TYPE") },
            ],
            rows: node.branches.map((branch) => ({ name: text(branch.properties?.variable?.value), type: text(branch.properties?.type?.value) })),
        }],
    }),
    apply: (node, patch) => {
        const next = cloneDeep(node);
        const rows = patch.groups?.workers as Row[] | undefined;
        if (rows) {
            next.branches = matchBranches(next.branches, (branch) => text(branch.properties?.variable?.value), rows, (row) => row.name ?? "", newForkWorker)
                .map(([branch, row]) => {
                    setValue(branch.properties.variable, row.name ?? "");
                    setValue(branch.properties.type, row.type ?? "");
                    return branch;
                });
        }
        return next;
    },
};

// ---- Any node built from its properties: variables, foreach, calls, wait, data mapper creation ----

// Row templates arrive without the list's imports, so a row's ai:ChatMessage would not resolve.
function rowTemplate(property: Property, type: InputType): Property | undefined {
    const template = (type as { template?: Property }).template;
    return template && { ...template, imports: { ...property.imports, ...template.imports } };
}

// A row holds one element, so it takes the template's type, not the list's.
const elementType = (template: Property | undefined, type: InputType): string | undefined =>
    template?.types?.find((option) => option.fieldType === "EXPRESSION")?.ballerinaType
    ?? (template && selectedType(template)?.ballerinaType) ?? type.ballerinaType;

function propertyGroup(key: string, property: Property, type: InputType): FormAssistGroup {
    const template = rowTemplate(property, type);
    const base = {
        id: key,
        label: property.metadata?.label ?? key,
        rowLabel: template?.metadata?.label,
        description: property.metadata?.description,
        min: property.optional ? 0 : 1,
    };
    if (type.fieldType === "REPEATABLE_PROPERTY" && template) {
        const params = Object.entries((template.value ?? {}) as Record<string, Property>);
        const entries = Object.entries((property.value ?? {}) as Record<string, Property>);
        return {
            ...base,
            item: [
                { key: ENTRY_KEY, label: "Name", property: typed(template, "IDENTIFIER") },
                ...params.map(([param, value]) => ({ key: param, label: value.metadata?.label ?? param, property: value })),
            ],
            rows: entries.map(([name, entry]) => ({
                [ENTRY_KEY]: name,
                ...Object.fromEntries(params.map(([param]) => [param, text((entry.value as Record<string, Property>)?.[param]?.value)])),
            })),
        };
    }
    const element = typed(template ?? property, "EXPRESSION", elementType(template, type));
    if (type.fieldType === "REPEATABLE_MAP") {
        const entries = Object.entries((property.value && typeof property.value === "object" ? property.value : {}) as Record<string, Property>);
        return {
            ...base,
            item: [{ key: ENTRY_KEY, label: "Key", property: typed(element, "IDENTIFIER") }, { key: ENTRY_VALUE, label: "Value", property: element }],
            rows: entries.map(([name, entry]) => ({ [ENTRY_KEY]: name, [ENTRY_VALUE]: text(entry?.value) })),
        };
    }
    const items = Array.isArray(property.value) ? (property.value as Property[]) : [];
    return { ...base, item: [{ key: ENTRY_VALUE, label: "Value", property: element }], rows: items.map((item) => ({ [ENTRY_VALUE]: text(item?.value) })) };
}

function groupValue(property: Property, type: InputType, rows: Row[]): Property["value"] {
    const template = (type as { template?: Property }).template ?? property;
    const entry = (value: string): Property => ({ ...cloneDeep(template), value, modified: true });
    if (type.fieldType === "REPEATABLE_PROPERTY") {
        return Object.fromEntries(rows.map((row) => {
            const param = cloneDeep(template);
            Object.entries(param.value as Record<string, Property>).forEach(([key, value]) => setValue(value, row[key] ?? ""));
            return [row[ENTRY_KEY], param];
        })) as Property["value"];
    }
    if (type.fieldType === "REPEATABLE_MAP") {
        return Object.fromEntries(rows.map((row) => [row[ENTRY_KEY], entry(row[ENTRY_VALUE] ?? "")])) as Property["value"];
    }
    return rows.map((row) => entry(row[ENTRY_VALUE] ?? "")) as unknown as Property["value"];
}

// Repeatable properties arrive marked not editable although their own editors change them.
function visibleProperties(node: FlowNode): [string, Property, InputType][] {
    return Object.entries(node.properties ?? {})
        .map(([key, property]) => [key, property, property && selectedType(property)] as [string, Property, InputType])
        .filter(([, property, type]) => property && !property.hidden && type);
}

// Imports ride on the first filled property; the form collects every property's imports on save.
function applyValues(node: FlowNode, patch: FormAssistResponse) {
    let imports = patch.imports;
    Object.entries(patch.values ?? {}).forEach(([path, value]) => {
        const property = node.properties?.[path.replace(/^properties\./, "") as keyof typeof node.properties];
        if (property) {
            setValue(property, value);
            if (imports) {
                property.imports = { ...property.imports, ...imports };
                imports = undefined;
            }
        }
    });
}

const propertySchema: NodeAssistSchema = {
    describe: (node) => {
        const properties = visibleProperties(node);
        return {
            slots: properties
                .map(([key, property, type]) => [key, property, property.editable && slotProperty(property, type)] as const)
                .filter((entry): entry is readonly [string, Property, Property] => !!entry[2])
                .map(([key, property, asSlot]) => ({
                    path: `properties.${key}`,
                    label: property.metadata?.label ?? key,
                    description: property.metadata?.description,
                    property: asSlot,
                    value: text(property.value),
                    optional: property.optional,
                    // A variable's value takes the form's Type, as its own editor does.
                    typeFrom: node.codedata?.node === "VARIABLE" && key === "expression" ? "properties.type" : undefined,
                })),
            groups: properties.filter(([, , type]) => REPEATABLE_TYPES.has(type.fieldType))
                .map(([key, property, type]) => propertyGroup(key, property, type)),
        };
    },
    apply: (node, patch) => {
        const next = cloneDeep(node);
        applyValues(next, patch);
        for (const [key, property, type] of visibleProperties(next)) {
            const rows = patch.groups?.[key];
            if (rows && REPEATABLE_TYPES.has(type.fieldType)) {
                property.value = groupValue(property, type, rows);
                property.modified = true;
            }
        }
        return next;
    },
};

const SCHEMAS: Record<string, NodeAssistSchema> = { IF: ifSchema, MATCH: matchSchema, FORK: forkSchema };

export function nodeAssistSchema(node: FlowNode): NodeAssistSchema {
    return SCHEMAS[node.codedata.node] ?? propertySchema;
}
