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

// Pure helpers deciding whether the Configurables pane can drill into a value by `.` access.
// The configurable list carries only a type string, so local type names are resolved against
// the module's type definitions (getTypes); anything not provably a record gets no chevron.

import type { TypeNodeKind } from "@wso2/ballerina-core";
import { isPrimitiveType } from "./types";
import { isOptionalType } from "../hooks/fieldAccess";

// Type name -> definition kind for the types of the module being edited.
export type LocalTypeKinds = ReadonlyMap<string, TypeNodeKind>;

// Lang-library prefixes whose qualified names are built-in subtypes, e.g. `int:Unsigned8`.
const LANG_PREFIXES = new Set(["int", "string", "float", "decimal", "boolean", "byte", "xml", "regexp"]);
const NON_NAVIGABLE_BUILTINS = new Set(["byte", "readonly", "handle", "function", "object", "typedesc"]);

// True when the opening paren at 0 closes at the last character, i.e. `(A)` but not `(A)|(B)`.
const parensWrapWhole = (t: string): boolean => {
    let depth = 0;
    for (let i = 0; i < t.length - 1; i++) {
        if (t[i] === "(") {
            depth++;
        } else if (t[i] === ")") {
            depth--;
        }
        if (depth === 0) {
            return false;
        }
    }
    return true;
};

const READONLY = "readonly";

const OPENERS = "{(<[";
const CLOSERS = "})>]";

// Whether `ch` occurs outside any {}, (), <> or [] — e.g. the `|` of a union, but not the `{|` of a record.
const hasTopLevel = (t: string, ch: string): boolean => {
    let depth = 0;
    for (const c of t) {
        if (OPENERS.includes(c)) {
            depth++;
        } else if (CLOSERS.includes(c)) {
            depth--;
        } else if (c === ch && depth === 0) {
            return true;
        }
    }
    return false;
};

// One `readonly &` / `& readonly` layer removed, or the input unchanged.
const stripReadonlyOnce = (t: string): string => {
    if (t.startsWith(READONLY) && t.slice(READONLY.length).trimStart().startsWith("&")) {
        return t.slice(READONLY.length).trimStart().slice(1).trim();
    }
    if (t.endsWith(READONLY) && t.slice(0, -READONLY.length).trimEnd().endsWith("&")) {
        return t.slice(0, -READONLY.length).trimEnd().slice(0, -1).trim();
    }
    return t;
};

const stripReadonly = (type: string): string => {
    let t = type.trim();
    for (let next = stripReadonlyOnce(t); next !== t; next = stripReadonlyOnce(t)) {
        t = next;
    }
    return t;
};

// One layer of what doesn't change the shape being accessed, or the input unchanged.
const stripOnce = (t: string): string => {
    const withoutReadonly = stripReadonlyOnce(t);
    if (withoutReadonly !== t) {
        return withoutReadonly;
    }
    if (t.endsWith("?")) {
        return t.slice(0, -1).trim();
    }
    if (t.replace(/\s/g, "").endsWith("|()")) {
        return t.slice(0, t.lastIndexOf("|")).trim();
    }
    if (t.startsWith("(") && t.endsWith(")") && parensWrapWhole(t)) {
        return t.slice(1, -1).trim();
    }
    return t;
};

// Drops `readonly &`, optionality (`?`, `|()`) and outer parens.
export const normalizeType = (type?: string): string => {
    let t = (type ?? "").trim();
    for (let next = stripOnce(t); next !== t; next = stripOnce(t)) {
        t = next;
    }
    return t;
};

// `T[]` or `T[n]`; `length` is set only for a fixed-length array.
export const parseArrayType = (type?: string): { element: string; length?: number } | undefined => {
    const t = normalizeType(type);
    const open = t.lastIndexOf("[");
    if (!t.endsWith("]") || open <= 0) {
        return undefined;
    }
    const size = t.slice(open + 1, -1).trim();
    if (!/^\d*$/.test(size)) {
        return undefined;
    }
    return {
        element: normalizeType(t.slice(0, open)),
        length: size ? Number(size) : undefined,
    };
};

const isRecordLike = (t: string, localKinds?: LocalTypeKinds): boolean => {
    // A union (or a non-readonly intersection) has no single field set, even if one member is a record.
    if (hasTopLevel(t, "|") || hasTopLevel(t, "&")) {
        return false;
    }
    if (/^record\s*\{/.test(t)) {
        return true;
    }
    // An exact local name wins over the keyword check, which ignores case (a record may be named `String`).
    if (localKinds?.has(t)) {
        return localKinds.get(t) === "RECORD";
    }
    // Unions, parameterised types (map<..>, table<..>, stream<..>) and inline shapes have no single field set.
    if (/[|<{(&[]/.test(t) || isPrimitiveType(t) || NON_NAVIGABLE_BUILTINS.has(t)) {
        return false;
    }
    const colon = t.indexOf(":");
    if (colon > 0) {
        const prefix = t.slice(0, colon);
        // Imported types can't be resolved here; the field completions decide what is below them.
        return !(LANG_PREFIXES.has(prefix) || prefix.startsWith("lang."));
    }
    if (!localKinds) {
        // Type definitions unavailable: keep drill-in rather than hide it for every record.
        return true;
    }
    return localKinds.get(t) === "RECORD";
};

// Whether `.` (or one `[i]` then `.`) on a value of this type reaches record fields.
export const isNavigableType = (type: string | undefined, localKinds?: LocalTypeKinds): boolean => {
    const t = normalizeType(type);
    if (!t || hasTopLevel(t, "|")) {
        return false;
    }
    const array = parseArrayType(t);
    if (array) {
        // The pane steps a single index; `T[][]` would need two.
        return array.length !== 0 && !parseArrayType(array.element) && isRecordLike(array.element, localKinds);
    }
    return isRecordLike(t, localKinds);
};

// Whether the array value itself may be nil (`T[]?`), as opposed to its elements (`T?[]`).
// Ballerina has no nil-lifting member access on lists, so such a value can't be indexed directly.
export const isNilableArrayType = (type?: string): boolean => {
    if (!parseArrayType(type)) {
        return false;
    }
    // The `?` may sit inside whole-type parentheses: `(T[]?)`, `((T[])?)`.
    let t = stripReadonly(type ?? "");
    while (!isOptionalType(t)) {
        if (!(t.startsWith("(") && t.endsWith(")") && parensWrapWhole(t))) {
            return false;
        }
        t = stripReadonly(t.slice(1, -1));
    }
    return true;
};

// The configurables list groups the default module under "" and a submodule under its short name
// (`modules/<name>/`). Returns undefined when the file isn't inside the project.
export const moduleOfFile = (filePath: string, projectPath: string): string | undefined => {
    const toPosix = (p: string) => {
        let posix = p.replaceAll("\\", "/");
        while (posix.endsWith("/")) {
            posix = posix.slice(0, -1);
        }
        return posix;
    };
    const file = toPosix(filePath);
    const root = toPosix(projectPath);
    if (!root || !file.startsWith(root + "/")) {
        return undefined;
    }
    const segments = file.slice(root.length + 1).split("/");
    return segments[0] === "modules" && segments.length > 2 ? segments[1] : "";
};
