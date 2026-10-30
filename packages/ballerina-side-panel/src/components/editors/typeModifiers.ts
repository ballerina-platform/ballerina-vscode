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

import type { FormField } from "../Form/types";

/**
 * The modifiers a type field can offer as toggles, so that a user picks a list, nil or error by intent instead of
 * typing `[]`, `?` or `|error`. They apply to the outermost type only: `T?[]` reads as a list of `T?` that is itself
 * not nullable, and is left for the user to write.
 */
export type TypeModifier = "list" | "nullable" | "error";

export const TYPE_MODIFIERS: readonly TypeModifier[] = ["list", "nullable", "error"];

/** The modifiers of a type that holds a value rather than producing one, which therefore cannot be an error. */
export const VALUE_TYPE_MODIFIERS: readonly TypeModifier[] = ["list", "nullable"];

/**
 * The modifiers a type field offers. A field states them itself where its form knows better; otherwise a return type
 * offers all of them, and any other type, which holds a value rather than producing one, offers all but the error.
 */
export function getTypeModifiers(field: FormField): readonly TypeModifier[] {
    if (field.typeModifiers) {
        return field.typeModifiers;
    }
    // A data mapper's "Output" is its return type, and a GraphQL field's return type is the one that carries the
    // LS's `nullableAction`.
    const isReturnType = field.key === "returnType"
        || /^(return(s| type)?|output)$/i.test(field.label?.trim() ?? "")
        || !!field.properties?.["nullableAction"];
    return isReturnType ? TYPE_MODIFIERS : VALUE_TYPE_MODIFIERS;
}

/** A type split into the type it decorates and the modifiers decorating it. */
export interface TypeShape {
    /** The type without the modifiers; empty when the type is made of modifiers alone, e.g. `error?`. */
    base: string;
    list: boolean;
    nullable: boolean;
    error: boolean;
    /**
     * Set when the type is a `stream`. Its value type is what `base`, `list` and `nullable` describe, and `error`
     * describes its completion type, as a stream reports failure by completing with an error.
     */
    stream?: { completion?: string };
}

const OPENERS: Record<string, string> = { "(": ")", "[": "]", "{": "}", "<": ">" };
const CLOSERS = new Set(Object.values(OPENERS));

/** Splits the text on a separator that is not nested in brackets or a string. */
function splitTopLevel(text: string, separator: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quote: string | undefined;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quote) {
            if (char === "\\") {
                i++;
            } else if (char === quote) {
                quote = undefined;
            }
        } else if (char === "\"" || char === "`") {
            quote = char;
        } else if (OPENERS[char]) {
            depth++;
        } else if (CLOSERS.has(char)) {
            depth--;
        } else if (depth === 0 && char === separator) {
            parts.push(text.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(text.slice(start));
    return parts.map((part) => part.trim());
}

/** The text inside the brackets, when they open at the start and close at the very end of it. */
function unwrap(text: string, open: string, close: string): string | undefined {
    if (!text.startsWith(open) || !text.endsWith(close)) {
        return undefined;
    }
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
        if (OPENERS[text[i]]) {
            depth++;
        } else if (CLOSERS.has(text[i])) {
            depth--;
            if (depth === 0 && i !== text.length - 1) {
                return undefined;
            }
        }
    }
    return text.slice(open.length, -close.length).trim();
}

/** Whether the type is a function type, whose return type takes everything written after it, `|error` included. */
function isFunctionType(type: string): boolean {
    return /^((isolated|transactional)\s+)*function\b/.test(type);
}

/**
 * Whether a suffix written after the type would bind to only a part of it: the members of a union or an
 * intersection, or the return type of a function.
 */
function isCompound(type: string): boolean {
    return splitTopLevel(type, "|").length > 1
        || splitTopLevel(type, "&").length > 1
        || isFunctionType(type);
}

function hasErrorMember(type: string): boolean {
    return splitTopLevel(type, "|").some((member) => member === "error" || member === "error?");
}

function parseValue(text: string, extractError: boolean): TypeShape {
    // An unparenthesized function type has no outer modifiers: `function () returns int|error` returns the union.
    if (isFunctionType(text)) {
        return { base: text, list: false, nullable: false, error: false };
    }
    let error = false;
    let nullable = false;
    const rest: string[] = [];
    for (const member of splitTopLevel(text, "|")) {
        if (extractError && member === "error") {
            error = true;
        } else if (extractError && member === "error?") {
            error = true;
            nullable = true;
        } else if (member === "()") {
            nullable = true;
        } else if (member) {
            rest.push(member);
        }
    }

    if (rest.length === 0) {
        return { base: "", list: false, nullable, error };
    }
    if (rest.length > 1) {
        // A nil member anywhere makes the whole union nilable, so it is lifted out as the union's own `?`.
        const members = rest.map((member) => {
            if (member.endsWith("?") && !isCompound(member)) {
                nullable = true;
                return member.slice(0, -1).trimEnd();
            }
            return member;
        });
        return { base: members.join("|"), list: false, nullable, error };
    }

    const suffixes = splitTypedSuffixes(rest[0]);
    let base = suffixes.base;
    const list = suffixes.list;
    nullable = nullable || suffixes.nullable;
    const inner = unwrap(base, "(", ")");
    if (inner) {
        base = inner;
    }
    return { base, list, nullable, error };
}

/**
 * Reads the modifiers of a type, as a user typed it. An error is read as a modifier only where the field offers the
 * Error toggle; elsewhere it stays part of the type, so that `int|error` turned into a list is `(int|error)[]`.
 */
export function parseTypeShape(type: string, modifiers: readonly TypeModifier[] = TYPE_MODIFIERS): TypeShape {
    const text = (type ?? "").trim();
    const streamParams = text.startsWith("stream") ? unwrap(text.slice("stream".length).trimStart(), "<", ">") : undefined;
    if (streamParams !== undefined) {
        const [value = "", completion] = splitTopLevel(streamParams, ",");
        const shape = parseValue(value, false);
        return { ...shape, error: !!completion && hasErrorMember(completion), stream: { completion } };
    }
    return parseValue(text, modifiers.includes("error"));
}

function printValue(shape: TypeShape, withError: boolean): string {
    let base = shape.base.trim();
    if (!base) {
        if (withError && shape.error) {
            return shape.nullable ? "error?" : "error";
        }
        return shape.nullable ? "()" : "";
    }
    if (((shape.list || shape.nullable) && isCompound(base)) || (withError && shape.error && isFunctionType(base))) {
        base = `(${base})`;
    }
    return `${base}${shape.list ? "[]" : ""}${shape.nullable ? "?" : ""}${withError && shape.error ? "|error" : ""}`;
}

/** Writes a type from its shape, in the one form the toggles produce: `T[]?|error`. */
export function printTypeShape(shape: TypeShape): string {
    if (!shape.stream) {
        return printValue(shape, true);
    }
    // The completion the user wrote is kept unless the toggle turned its meaning around.
    const written = shape.stream.completion;
    const completion = shape.error
        ? (written && hasErrorMember(written) ? written : "error?")
        : (written && !hasErrorMember(written) ? written : undefined);
    const value = printValue(shape, false);
    return completion ? `stream<${value}, ${completion}>` : `stream<${value}>`;
}

/**
 * Splits off the `[]` and `?` typed at the end of a type, where they decorate the whole of it, so that a field
 * showing its modifiers as toggles can take them over as the user types them. A suffix that binds to only a part of
 * the type, as in `int|string[]`, is left in place.
 */
export function splitTypedSuffixes(text: string): { base: string; list: boolean; nullable: boolean } {
    let base = text.trimEnd();
    let list = false;
    let nullable = false;
    if (isCompound(base)) {
        return { base: text, list, nullable };
    }
    if (base.endsWith("?")) {
        nullable = true;
        base = base.slice(0, -1).trimEnd();
    }
    if (base.endsWith("[]")) {
        list = true;
        base = base.slice(0, -2).trimEnd();
    }
    return { base, list, nullable };
}

/**
 * The type a field holds once the user has typed the text into it, while its modifiers are shown apart as toggles:
 * a `[]` or `?` typed at the end is taken over by the toggles, and the modifiers already on stay on. Modifiers have
 * nothing to decorate on an empty type, so clearing the type clears them too.
 */
export function applyTypedText(shape: TypeShape, text: string): string {
    const typed = splitTypedSuffixes(text);
    const base = typed.base.trim();
    return base ? printTypeShape({
        base,
        list: shape.list || typed.list,
        nullable: shape.nullable || typed.nullable,
        error: shape.error
    }) : "";
}

/** Whether a modifier can be toggled on the type: a list needs a type to hold, and so does anything on an empty type. */
export function canToggleModifier(shape: TypeShape, modifier: TypeModifier): boolean {
    if (shape.base) {
        return true;
    }
    return modifier !== "list" && !shape.stream && (shape.error || shape.nullable);
}

/** The type with the modifier turned on or off, on a field offering the given modifiers. */
export function toggleTypeModifier(
    type: string,
    modifier: TypeModifier,
    on: boolean,
    modifiers: readonly TypeModifier[] = TYPE_MODIFIERS
): string {
    const shape = parseTypeShape(type, modifiers);
    if (shape[modifier] === on || !canToggleModifier(shape, modifier)) {
        return type;
    }
    return printTypeShape({ ...shape, [modifier]: on });
}
