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

// Which fields of a new connection's record the form offers to make configurable, and what it sends the language
// server about them (`codedata.data.configurables` of the argument's property).
//
// The language server (ConnectionConfigurables) turns every simple literal of a new connection into a configurable,
// walking records field by field but never into a list. So the form offers the same fields, keyed by the same dotted
// path, and, since an optional field starts unchecked, says `keep` for each one the user hasn't checked.

import type {
    ConnectionConfigurableChoice,
    ConnectionConfigurableChoices,
    ConnectionConfigurablePreview,
    TypeField
} from "@wso2/ballerina-core";
import { childPath, fieldKind, isRequiredField, sectionRecord, shownFields } from "./model";

/** Where a configurable is declared, as the language server reports it: an absolute file path and the name's start. */
export interface ConfigurableDeclaration {
    filePath: string;
    line: number;
    offset: number;
}

/**
 * What the form knows about one field's configurable: what is sent to the language server and, for a configurable
 * the connection already uses, where it is declared, so that renaming it can rename it across the project.
 */
export interface FieldConfigurable extends ConnectionConfigurableChoice {
    declaration?: ConfigurableDeclaration;
}

/** A configurable the connection already uses, to rename across the project. */
export interface ConfigurableRenameRequest {
    from: string;
    to: string;
    declaration: ConfigurableDeclaration;
}

/** Renames a configurable across the project, every reference included; resolves whether the source changed. */
export type RenameConfigurable = (request: ConfigurableRenameRequest) => Promise<boolean>;

export type FieldConfigurables = Record<string, FieldConfigurable>;

/** The fields a configurable can stand for: the checked simple fields, through records but not into lists. */
export function configurableFields(record: TypeField, path = ""): { path: string; field: TypeField }[] {
    const found: { path: string; field: TypeField }[] = [];
    for (const field of shownFields(record)) {
        const here = childPath(path, field.name);
        const kind = fieldKind(field);
        if (kind === "primitive") {
            found.push({ path: here, field });
        } else if (kind === "record") {
            found.push(...configurableFields(sectionRecord(field), here));
        }
    }
    return found;
}

/**
 * Whether a value is made configurable: as the user chose, else by default when it is required (`required` is false
 * for an existing connection, whose literals stay unless the user makes them configurable). A choice that only names
 * the configurable (one the user renamed, or one the connection already uses) is one.
 */
export function isConfigurableValue(required: boolean, choice: ConnectionConfigurableChoice | undefined): boolean {
    return choice ? !choice.keep : required;
}

/**
 * Whether a record field's value is made configurable (see isConfigurableValue). A new connection's required fields
 * are by default; an existing connection's fields only when the user chose so.
 */
export function isConfigurable(
    field: TypeField, choice: ConnectionConfigurableChoice | undefined, newConnection = true
): boolean {
    return isConfigurableValue(newConnection && isRequiredField(field), choice);
}

/**
 * What to tell the language server about one value: `keep` for one that stays a literal, the name for one the user
 * named, and an empty choice for one made configurable under its generated name (which an edited connection's
 * literals need, as they otherwise stay).
 */
export function choiceToSend(on: boolean, choice: FieldConfigurable | undefined): ConnectionConfigurableChoice {
    if (!on) {
        return { keep: true };
    }
    if (choice?.name) {
        return choice.existing ? { name: choice.name, existing: true } : { name: choice.name };
    }
    return {};
}

/** What to tell the language server for each of the record's fields (see choiceToSend). */
export function choicesToSend(
    record: TypeField, choices: FieldConfigurables, newConnection = true
): ConnectionConfigurableChoices {
    const send: ConnectionConfigurableChoices = {};
    for (const { path, field } of configurableFields(record)) {
        send[path] = choiceToSend(isConfigurable(field, choices[path], newConnection), choices[path]);
    }
    return send;
}

/** The field of a record at a dotted path, through records and the chosen member of a union. */
export function fieldAtPath(record: TypeField, path: string): TypeField | undefined {
    let current: TypeField | undefined = record;
    for (const key of path.split(".")) {
        current = (sectionRecord(current).fields ?? []).find((field) => field.name === key);
        if (!current) {
            return undefined;
        }
    }
    return current;
}

/**
 * Source with identifiers swapped, leaving string literals, templates and record keys as they are: turns the
 * configurables' names the code view shows back into the values they stand for, and back again.
 */
export function replaceIdentifiers(source: string, replacements: Record<string, string>): string {
    if (Object.keys(replacements).length === 0) {
        return source;
    }
    // A name followed by `:` is a record's key, and one after `.` a member, not a value; the lookarounds next to the
    // name keep a part of a longer name from matching.
    return source.replace(
        /"(?:[^"\\\n]|\\.)*"|`[^`]*`|(?<![A-Za-z0-9_.])[A-Za-z_][A-Za-z0-9_]*(?![A-Za-z0-9_])(?!\s*:)/g,
        (token) => token.startsWith("\"") || token.startsWith("`") || !Object.hasOwn(replacements, token)
            ? token : replacements[token]);
}

/** Whether a configurable's name is an identifier the language server accepts. */
export function isValidConfigurableName(name: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

/** The name a value's configurable shows: the user's, or the language server's. */
export function shownName(choice: FieldConfigurable | undefined, preview: ConnectionConfigurablePreview | undefined) {
    return choice?.name ?? preview?.name;
}

/**
 * What committing a typed name does:
 * - `invalid`: the name is not an identifier, so it stays in the box to be fixed;
 * - `unchanged`: a configurable the connection already uses keeps its name;
 * - `name`: a configurable saving will create takes the name (or its generated one back) — nothing refers to it yet;
 * - `project`: a configurable the connection already uses is renamed across the project, once the user agrees;
 * - `unavailable`: the language server didn't say where that configurable is declared, so it can't be renamed.
 */
export type RenamePlan =
    | { kind: "invalid" }
    | { kind: "unchanged" }
    | { kind: "name"; choice: Partial<FieldConfigurable> }
    | { kind: "project"; request: ConfigurableRenameRequest }
    | { kind: "unavailable" };

/**
 * What committing `draft` as a configurable's name does (see RenamePlan).
 *
 * @param choice    what the form holds for the value
 * @param draft     the name typed
 * @param generated the name the language server gives the value, if the user doesn't name it
 */
export function planRename(
    choice: FieldConfigurable | undefined,
    draft: string,
    generated: string | undefined
): RenamePlan {
    const name = draft.trim();
    if (!isValidConfigurableName(name)) {
        return { kind: "invalid" };
    }
    if (choice?.existing) {
        if (name === choice.name) {
            return { kind: "unchanged" };
        }
        return choice.name && choice.declaration
            ? { kind: "project", request: { from: choice.name, to: name, declaration: choice.declaration } }
            : { kind: "unavailable" };
    }
    // Renaming a value back to its generated name is the same as not renaming it.
    return { kind: "name", choice: { name: !choice?.name && generated === name ? undefined : name } };
}

/**
 * The choices once a configurable the connection already uses is renamed across the project: every value that uses
 * it now uses the new name. The same object comes back when no value uses it.
 */
export function renameConfigurableInChoices<T extends ConnectionConfigurableChoice>(
    choices: Record<string, T>,
    from: string,
    to: string
): Record<string, T> {
    let changed = false;
    const renamed: Record<string, T> = {};
    for (const [key, choice] of Object.entries(choices)) {
        if (choice?.existing && choice.name === from) {
            changed = true;
            renamed[key] = { ...choice, name: to };
        } else {
            renamed[key] = choice;
        }
    }
    return changed ? renamed : choices;
}

/**
 * The form field key of the init parameter a preview is for, as the language server gives it: a parameter named as a
 * flow node's own property is keyed apart from it (`connection` is `$connection`).
 */
export function parameterKey(preview: ConnectionConfigurablePreview): string {
    return preview.key;
}
