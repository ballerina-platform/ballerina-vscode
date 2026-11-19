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

import {
    ExpressionProperty, FormAssistGroup, FormAssistResponse, FormAssistSlot, Imports, InputType, Member, Type, alignRows,
    stringLiteral, stringLiteralText,
} from "@wso2/ballerina-core";

type Row = Record<string, string>;

const property = (fieldType: string, ballerinaType?: string, optional = false): ExpressionProperty => ({
    metadata: { label: "", description: "" },
    value: "",
    optional,
    editable: true,
    types: [{ fieldType, ballerinaType, selected: true } as InputType],
});

const NAME = property("IDENTIFIER");
const TYPE = property("TYPE");
const FLAG = property("FLAG", "boolean", true);
const DEFAULT = property("EXPRESSION", undefined, true);
const DOCS = property("TEXT", "string", true);
const SIZE = property("EXPRESSION", "int", true);
// The kinds Copilot can fill; switching between them works as the Kind dropdown does.
const KIND_LABELS: Record<string, string> = { RECORD: "Record", ENUM: "Enum", UNION: "Union", ARRAY: "Array" };
const KINDS = Object.keys(KIND_LABELS);
const KIND: ExpressionProperty = {
    ...property("SINGLE_SELECT"),
    types: [{ fieldType: "SINGLE_SELECT", selected: true, options: KINDS.map((value) => ({ label: KIND_LABELS[value], value })) } as InputType],
};
const KIND_ABOUT = "RECORD holds named fields of their own types. ENUM is a fixed set of named constants, e.g. statuses or payment methods. "
    + "UNION is a value of one of several types, e.g. string|int. ARRAY is a list of one element type.";

// The size property a new array type starts without.
const ARRAY_SIZE = { metadata: { label: "Size", description: "Array dimensions" }, valueType: "STRING", value: "", optional: true, editable: true, advanced: false };

export const canAssistType = (kind?: string) => KINDS.includes(kind);

const flag = (on?: boolean): string => (on ? "true" : "false");

// The type flags the Advanced Options set, by the property that holds each.
const TYPE_FLAGS: [key: string, label: string, description: string][] = [
    ["isReadOnly", "Is Readonly Type", "Values of this type can't be changed once created."],
    ["isPublic", "Accessible by Other Integrations", "Other integrations can use this type."],
];

const FIELDS_ABOUT = "One row per field, in order. Names are camelCase. Types are Ballerina types: string, int, "
    + "decimal for money, float, boolean, a list such as string[], or a type named below; use a project type when one "
    + "fits, e.g. Address for an address. A field that groups several values with no project type for them gets an inline "
    + "record type, e.g. record {| string city; string zip; |}. A timestamp or other point in time is time:Utc. Mark a field optional when it may be left out, and keep its type as it is "
    + "rather than also adding ?. docs is the field's description as a string literal. Give a default only when the "
    + "request asks for one; it must suit the field's type, and an optional field has none.";
const MEMBERS_ABOUT = "One row per constant the enum can hold, in UPPER_SNAKE_CASE.";

// A field's type as text; an inline record keeps the name its editor shows for it.
const typeText = (member: Member): string => (typeof member.type === "string" ? member.type : member.typeName ?? "record {}");

const fieldRow = (member: Member): Row => ({
    name: member.name ?? "",
    type: typeText(member),
    optional: flag(member.optional),
    defaultValue: member.defaultValue ?? "",
    docs: member.docs ? stringLiteral(member.docs) : "",
    readonly: flag(member.readonly),
});

const flagSlot = (path: string, label: string, description: string, on: boolean): FormAssistSlot =>
    ({ path, label, description, property: FLAG, value: flag(on), optional: true });

const recordFields = (type: Type, known: string, active: boolean): FormAssistGroup => ({
    id: "fields", label: "Fields", rowLabel: "Field", min: 0, description: `${FIELDS_ABOUT}${known} Only for a RECORD.`,
    item: [
        { key: "name", label: "Name", property: NAME },
        { key: "type", label: "Type", property: TYPE },
        { key: "optional", label: "Optional", property: FLAG },
        { key: "defaultValue", label: "Default Value", property: DEFAULT, typeFrom: "type" },
        { key: "docs", label: "Description", property: DOCS },
        { key: "readonly", label: "Readonly", property: FLAG },
    ],
    rows: active ? type.members.map(fieldRow) : [],
});

const enumMembers = (type: Type, active: boolean): FormAssistGroup => ({
    id: "members", label: "Members", rowLabel: "Member", min: 0, description: `${MEMBERS_ABOUT} Only for an ENUM.`,
    item: [{ key: "name", label: "Name", property: NAME }, { key: "value", label: "Value", property: DEFAULT }],
    rows: active ? type.members.map((member) => ({ name: member.name ?? "", value: member.defaultValue ?? "" })) : [],
});

const unionMembers = (type: Type, active: boolean): FormAssistGroup => ({
    id: "unionMembers", label: "Member Types", rowLabel: "Member Type", min: 0,
    description: "One row per type the value can be, at least two. Only for a UNION.",
    item: [{ key: "type", label: "Type", property: TYPE }],
    rows: active ? type.members.map((member) => ({ type: typeText(member) })) : [],
});

function kindSlots(type: Type, node: string): FormAssistSlot[] {
    if (node === "RECORD") {
        return [
            flagSlot("allowAdditionalFields", "Allow Additional Fields", "Values may hold fields beyond the ones listed.", !!type.allowAdditionalFields),
            ...TYPE_FLAGS.map(([key, label, description]) => flagSlot(key, label, description, type.properties?.[key]?.value === "true")),
        ];
    }
    const array = node === "ARRAY";
    return [
        { path: "elementType", label: "Element Type", description: "Only for an ARRAY.", property: TYPE, value: array && type.members[0] ? typeText(type.members[0]) : "", optional: !array },
        { path: "arraySize", label: "Size", description: "A fixed length; leave empty for any length. Only for an ARRAY.", property: SIZE, value: array ? String(type.properties?.arraySize?.value ?? "") : "", optional: true },
    ];
}

const KIND_GROUPS: Record<string, string> = { RECORD: "fields", ENUM: "members", UNION: "unionMembers" };

// What Copilot can fill in a record, enum, union or array. A saved type keeps its name and kind, which only a rename changes.
export function describeType(type: Type, knownTypes: string[] = [], isNew = true): { slots: FormAssistSlot[]; groups: FormAssistGroup[] } | undefined {
    const node = type.codedata?.node;
    if (!canAssistType(node)) {
        return undefined;
    }
    const known = knownTypes.length ? ` Types in this project: ${knownTypes.join(", ")}.` : "";
    const identity: FormAssistSlot[] = isNew ? [
        { path: "name", label: "Name", description: "The type's name, in PascalCase.", property: NAME, value: type.name ?? "" },
        { path: "kind", label: "Kind", description: KIND_ABOUT, property: KIND, value: node },
    ] : [];
    // A saved type's kind is fixed, so it gets only that kind's parts.
    const groups = [recordFields(type, known, node === "RECORD"), enumMembers(type, node === "ENUM"), unionMembers(type, node === "UNION")]
        .filter((group) => isNew || group.rows.length || group.id === KIND_GROUPS[node]);
    return {
        // Outside a record, kindSlots gives the array's slots, which a saved enum or union has no use for.
        slots: [...identity, ...(isNew || node === "ARRAY" || node === "RECORD" ? kindSlots(type, node) : [])],
        // The current kind's rows come first.
        groups: [...groups.filter((group) => group.rows.length), ...groups.filter((group) => !group.rows.length)],
    };
}

// The imports a field's type needs, out of those the reply added.
const importsFor = (typeName: string, imports: Imports = {}): Imports | undefined => {
    const used = Object.entries(imports).filter(([prefix]) => typeName.includes(`${prefix}:`));
    return used.length ? Object.fromEntries(used) : undefined;
};

function fieldFrom(base: Member, row: Row, imports?: Imports): Member {
    const type = row.type ?? typeText(base);
    const added = importsFor(type, imports);
    return {
        ...base,
        name: row.name ?? base.name,
        // An inline record the row left as it was stays a record.
        type: type === typeText(base) ? base.type : type,
        optional: row.optional === "true",
        defaultValue: row.defaultValue?.trim() || undefined,
        docs: row.docs ? stringLiteralText(row.docs) ?? row.docs : "",
        readonly: row.readonly === "true",
        ...(added ? { imports: { ...base.imports, ...added } } : {}),
    };
}

// Pairs each row with the member of the same name, so a kept field keeps what the form doesn't show, such as its refs.
function membersFrom(members: Member[], rows: Row[], toMember: (base: Member, row: Row) => Member, fresh: () => Member): Member[] {
    return alignRows(members.map((member) => member.name ?? ""), rows.map((row) => row.name ?? ""))
        .filter((step) => step.after !== undefined)
        .map((step) => toMember(step.before !== undefined ? members[step.before] : fresh(), rows[step.after!]));
}

function membersOf(kind: string, base: Type, patch: FormAssistResponse): Member[] | undefined {
    const groups = patch.groups ?? {};
    if (kind === "RECORD" && groups.fields) {
        return membersFrom(base.members, groups.fields, (member, row) => fieldFrom(member, row, patch.imports),
            () => ({ kind: "FIELD", name: "", type: "string", refs: [], docs: "" }));
    }
    if (kind === "ENUM" && groups.members) {
        return membersFrom(base.members, groups.members,
            (member, row) => ({ ...member, name: row.name ?? member.name, defaultValue: row.value?.trim() || undefined }),
            () => ({ kind: "ENUM_MEMBER", name: "", type: "string", refs: [] }));
    }
    if (kind === "UNION" && groups.unionMembers) {
        return groups.unionMembers.map((row) => ({ kind: "TYPE", type: row.type, name: row.type, refs: [] as string[], imports: importsFor(row.type, patch.imports) }));
    }
    const element = patch.values?.elementType;
    if (kind === "ARRAY" && element) {
        return [{ kind: "TYPE", type: element, name: "", refs: [], imports: importsFor(element, patch.imports) }];
    }
    return undefined;
}

export function applyToType(type: Type, patch: FormAssistResponse, isNew = true): Type {
    const values = patch.values ?? {};
    const kind = isNew && canAssistType(values.kind) ? values.kind : type.codedata?.node;
    // A new kind starts with no members, as the Kind dropdown leaves it.
    const base: Type = kind === type.codedata?.node ? type
        : { ...type, members: [], codedata: { ...type.codedata, node: kind as Type["codedata"]["node"] } };
    const next: Type = { ...base, name: isNew ? values.name ?? type.name : type.name };
    if (values.allowAdditionalFields !== undefined) {
        next.allowAdditionalFields = values.allowAdditionalFields === "true";
    }
    for (const [key] of TYPE_FLAGS.filter(([key]) => values[key] !== undefined)) {
        next.properties = { ...next.properties, [key]: { ...next.properties?.[key], value: values[key] } };
    }
    if (kind === "ARRAY" && values.arraySize !== undefined) {
        next.properties = { ...next.properties, arraySize: { ...ARRAY_SIZE, ...next.properties?.arraySize, value: values.arraySize } };
    }
    next.members = membersOf(kind, base, patch) ?? base.members;
    return next;
}
