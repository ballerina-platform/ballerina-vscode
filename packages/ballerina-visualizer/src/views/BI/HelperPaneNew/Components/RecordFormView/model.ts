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

// How the record form reads the record model the language server hands the record editor.
//
// A field's `value` is Ballerina source, which `typesManager/generateValue` (RecordValueGenerator)
// emits as is: a string field holds `"text"`, not `text`. So every literal the form writes must be
// source a configurable can be made from (ConnectionConfigurables takes only a basic literal, not a
// `string \`...\`` template), and anything the form cannot show as a literal stays an expression.

import type { TypeField } from "@wso2/ballerina-core";

/** Simple types the form edits as a literal. */
export const PRIMITIVE_TYPE_NAMES = ["string", "int", "float", "decimal", "byte", "boolean"] as const;
export type PrimitiveTypeName = typeof PRIMITIVE_TYPE_NAMES[number];

const NUMERIC_TYPE_NAMES = new Set<string>(["int", "float", "decimal", "byte"]);

/** What a field of the record is shown as. */
export type FieldKind =
    /** A string, number or boolean, typed as a literal or written as an expression. */
    | "primitive"
    /** One of a fixed set of names (`enum`, or a union of constants): a dropdown. */
    | "choice"
    /** A record, or a union whose chosen member is a record: a section of its own fields. */
    | "record"
    /** An array: a list of items. */
    | "array"
    /** Anything else: written as an expression. */
    | "expression";

/** The input a primitive field's literal mode uses; each pairs with Expression in the mode switch. */
export type LiteralMode = "Text" | "Number" | "Boolean";

export function isPrimitiveTypeName(typeName: string | undefined): typeName is PrimitiveTypeName {
    return !!typeName && (PRIMITIVE_TYPE_NAMES as readonly string[]).includes(typeName);
}

export function literalModeOf(typeName: PrimitiveTypeName): LiteralMode {
    if (typeName === "boolean") {
        return "Boolean";
    }
    return NUMERIC_TYPE_NAMES.has(typeName) ? "Number" : "Text";
}

/** A union member that names a constant (`"AUTO"`), not a type: it has no fields and no type of its own. */
function isConstantMember(member: TypeField): boolean {
    return !member.fields && !member.members && !member.memberType && !member.typeInfo
        && !!member.typeName && !isPrimitiveTypeName(member.typeName)
        && !["record", "union", "enum", "array", "map", "intersection", "readonly", "anydata", "any", "json",
            "object", "error", "xml", "table", "stream", "nil", "()"].includes(member.typeName);
}

/** The member a union's value comes from: the selected one, else the one the editor would show first. */
export function selectedUnionMember(union: TypeField): TypeField | undefined {
    const members = union.members ?? [];
    return members.find((member) => member.selected) ?? members[0];
}

/**
 * The field that stands for a union in the form: the union itself when it is a set of constants, else its
 * chosen member, so a union of records shows that record's fields and a union of `string|()` shows a string.
 */
export function resolveUnion(union: TypeField): TypeField {
    const members = union.members ?? [];
    if (members.length > 0 && members.every(isConstantMember)) {
        return union;
    }
    return selectedUnionMember(union) ?? union;
}

export function fieldKind(field: TypeField): FieldKind {
    switch (field.typeName) {
        case "record":
            return "record";
        case "enum":
            return "choice";
        case "array":
            return "array";
        case "union": {
            const resolved = resolveUnion(field);
            if (resolved === field) {
                return "choice";
            }
            const memberKind = fieldKind(resolved);
            // A union's own value carries an expression or a literal (RecordValueGenerator writes it when
            // the union is selected); a nested choice or array under a union is left to the tree.
            return memberKind === "record" || memberKind === "primitive" ? memberKind : "expression";
        }
        default:
            return isPrimitiveTypeName(field.typeName) ? "primitive" : "expression";
    }
}

/** Fields of a record that the form shows: the ones checked in the tree. */
export function shownFields(record: TypeField): TypeField[] {
    return (record.fields ?? []).filter((field) => field.selected);
}

/** The record whose fields a "record" field's section lists: the field itself, or a union's chosen member. */
export function sectionRecord(field: TypeField): TypeField {
    return field.typeName === "union" ? resolveUnion(field) : field;
}

/** The names a choice offers, in order. */
export function choiceOptions(field: TypeField): string[] {
    return (field.members ?? []).map((member) => member.typeName);
}

/** The name a choice currently holds, read from the selected member or, for a union, its literal value. */
export function choiceValue(field: TypeField): string | undefined {
    const selected = (field.members ?? []).find((member) => member.selected);
    if (selected) {
        return selected.typeName;
    }
    const literal = typeof field.value === "string" ? parseStringLiteral(field.value) : undefined;
    return literal ?? undefined;
}

/** Selects one name of a choice. RecordValueGenerator reads an enum, and a union of constants, from its selected member. */
export function setChoiceValue(field: TypeField, name: string): void {
    for (const member of field.members ?? []) {
        member.selected = member.typeName === name;
    }
    if (field.typeName === "union") {
        // A literal left from an expression would win over the member (generateUnionValue reads `value` first).
        field.value = "";
    }
}

/** The type a field's chip shows: `string`, `ProxyConfig`, `string[]`, `HttpVersion`. */
export function typeLabel(field: TypeField | undefined): string {
    if (!field) {
        return "";
    }
    switch (field.typeName) {
        case "array":
            return `${typeLabel(field.memberType)}[]`;
        case "record":
        case "enum":
            return field.typeInfo?.name ?? field.typeName;
        case "union":
            return field.typeInfo?.name
                ?? (field.members ?? []).map((member) => member.typeInfo?.name ?? member.typeName).join("|");
        default:
            return field.typeInfo?.name ?? field.typeName;
    }
}

/** Whether a field must be given: neither optional (`field?`) nor defaultable (`field = default`). */
export function isRequiredField(field: TypeField): boolean {
    return !(field.optional || field.defaultable);
}

/** The dotted path of a field below the record, with an array item's index: `auth.token`, `rules[0].path`. */
export function childPath(parent: string, name: string | undefined): string {
    const key = name ?? "";
    return parent ? `${parent}.${key}` : key;
}

export function itemPath(parent: string, index: number): string {
    return `${parent}[${index}]`;
}

// ---- Literals -------------------------------------------------------------------------------------------------

/** Text as a Ballerina string literal. */
export function toStringLiteral(text: string): string {
    let out = "";
    for (const ch of text) {
        const code = ch.codePointAt(0) ?? 0;
        switch (ch) {
            case "\\": out += "\\\\"; break;
            case "\"": out += "\\\""; break;
            case "\n": out += "\\n"; break;
            case "\r": out += "\\r"; break;
            case "\t": out += "\\t"; break;
            default:
                out += code < 0x20 || code === 0x7f ? `\\u{${code.toString(16).toUpperCase()}}` : ch;
        }
    }
    return `"${out}"`;
}

/** The text of a single Ballerina string literal, or `undefined` for any other source, such as a template or a reference. */
export function parseStringLiteral(source: string): string | undefined {
    const trimmed = source.trim();
    if (!/^"(?:[^"\\\n]|\\.)*"$/.test(trimmed)) {
        return undefined;
    }
    let out = "";
    const body = trimmed.slice(1, -1);
    for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        if (ch !== "\\") {
            out += ch;
            continue;
        }
        const next = body[++i];
        switch (next) {
            case "n": out += "\n"; break;
            case "r": out += "\r"; break;
            case "t": out += "\t"; break;
            case "u": {
                const match = /^\{([0-9a-fA-F]{1,6})\}/.exec(body.slice(i + 1));
                if (!match) {
                    return undefined;
                }
                out += String.fromCodePoint(parseInt(match[1], 16));
                i += match[0].length;
                break;
            }
            default:
                // `\\`, `\"` and any other escaped character stand for themselves.
                out += next;
        }
    }
    return out;
}

const INT_LITERAL = /^-?(?:0|[1-9][0-9]*)$/;
const DECIMAL_LITERAL = /^-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;

/** Whether text is a number literal of the type; a `float` or `decimal` takes an integer too. */
export function isNumberLiteral(text: string, typeName: PrimitiveTypeName): boolean {
    const trimmed = text.trim();
    if (typeName === "int" || typeName === "byte") {
        if (!INT_LITERAL.test(trimmed)) {
            return false;
        }
        return typeName === "int" || (Number(trimmed) >= 0 && Number(trimmed) <= 255);
    }
    return DECIMAL_LITERAL.test(trimmed);
}

/**
 * What a primitive field's literal input shows for its source value, or `undefined` when the source is not a
 * literal of the type (a reference, a call, a template), which the form then shows as an expression.
 */
export function literalText(source: string | undefined, typeName: PrimitiveTypeName): string | undefined {
    if (source === undefined || source === null || source.trim() === "") {
        return "";
    }
    const trimmed = source.trim();
    switch (literalModeOf(typeName)) {
        case "Text":
            return parseStringLiteral(trimmed);
        case "Boolean":
            return trimmed === "true" || trimmed === "false" ? trimmed : undefined;
        default:
            return isNumberLiteral(trimmed, typeName) ? trimmed : undefined;
    }
}

/** The source a literal input's text stands for: a string is quoted, a number or boolean is written as typed. */
export function literalSource(text: string, typeName: PrimitiveTypeName): string {
    if (text === "") {
        return "";
    }
    return literalModeOf(typeName) === "Text" ? toStringLiteral(text) : text.trim();
}
