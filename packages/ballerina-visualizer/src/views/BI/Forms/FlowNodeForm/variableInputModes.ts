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

import type { InputType, Property } from "@wso2/ballerina-core";

// The input modes the language server's Property.Builder#typeWithExpression gives a function argument,
// re-derived from the type name: the variable node's expression gets none from the server, so the form
// works them out from the type the user selects. Records are not covered here; the form recognises them
// from the resolved type, as their mode needs the record's package details.

const NAMED_TYPE_MODES: Record<string, InputType["fieldType"]> = {
    "int": "NUMBER",
    "int:Signed8": "NUMBER",
    "int:Unsigned8": "NUMBER",
    "int:Signed16": "NUMBER",
    "int:Unsigned16": "NUMBER",
    "int:Signed32": "NUMBER",
    "int:Unsigned32": "NUMBER",
    "byte": "NUMBER",
    "float": "NUMBER",
    "decimal": "NUMBER",
    // string:Char is left to the expression mode: the text mode writes a string template, which is a
    // string and not a string:Char, so the variable would report a type error.
    "string": "TEXT",
    "boolean": "FLAG",
    "sql:ParameterizedQuery": "SQL_QUERY",
    "sql:ParameterizedCallQuery": "SQL_QUERY",
};

const ARRAY_SUFFIX = "[]";
const MAP_PATTERN = /^map\s*<(.+)>$/;

const OPENERS = "([{<";
const CLOSERS = ")]}>";
const NIL_TYPES = new Set(["()", "nil"]);

/**
 * Splits a type at its top-level `|`, leaving the ones inside brackets or string literals alone:
 * `int|map<string|int>|"a|b"` is three members.
 */
const splitUnion = (type: string): string[] => {
    const members: string[] = [];
    let depth = 0;
    let inString = false;
    let start = 0;
    for (let i = 0; i < type.length; i++) {
        const char = type[i];
        if (inString) {
            if (char === "\\") {
                i++;
            } else if (char === "\"") {
                inString = false;
            }
        } else if (char === "\"") {
            inString = true;
        } else if (OPENERS.includes(char)) {
            depth++;
        } else if (CLOSERS.includes(char)) {
            depth--;
        } else if (char === "|" && depth === 0) {
            members.push(type.slice(start, i).trim());
            start = i + 1;
        }
    }
    members.push(type.slice(start).trim());
    return members;
};

/** Whether the parentheses the type opens with are the ones it closes with: `(int|string)`, not `(int)|(string)`. */
const isWrapped = (type: string): boolean => {
    if (!type.startsWith("(") || !type.endsWith(")")) {
        return false;
    }
    let depth = 0;
    let inString = false;
    for (let i = 0; i < type.length; i++) {
        const char = type[i];
        // A bracket inside a string literal (`(int|")")`) is part of the literal, as splitUnion reads it
        if (inString) {
            if (char === "\\") {
                i++;
            } else if (char === "\"") {
                inString = false;
            }
            continue;
        }
        if (char === "\"") {
            inString = true;
        } else if (OPENERS.includes(char)) {
            depth++;
        } else if (CLOSERS.includes(char)) {
            depth--;
        }
        if (depth === 0 && i < type.length - 1) {
            return false;
        }
    }
    return true;
};

/**
 * Strips optional markers and enclosing parentheses until neither is left: `int?` keeps its primitive's
 * mode, as the server leaves the nil member to the expression mode, an element `(int|string)` is
 * `int|string`, and `(int?)` is `int`.
 */
const normalize = (typeName: string): string => {
    let type = typeName.trim();
    for (;;) {
        if (type.endsWith("?")) {
            type = type.slice(0, -1).trim();
        } else if (isWrapped(type)) {
            type = type.slice(1, -1).trim();
        } else {
            return type;
        }
    }
};

/**
 * The modes of a union, in the order the language server builds them (Property.Builder#typeWithExpression):
 * every member keeps its own modes, nil is left to the expression mode, and members landing on the same
 * mode share it. The switcher then offers the first of these against the expression. Singleton members
 * ("GET"|"POST"), which the server offers as a dropdown, are left to the expression mode for now.
 */
const getUnionModes = (members: string[]): InputType[] => {
    const modes: InputType[] = [];
    for (const member of members) {
        if (!NIL_TYPES.has(member)) {
            modes.push(...getTypeInputModes(member));
        }
    }
    return mergeSameModes(modes);
};

/**
 * Collapses the members that land on one mode into a single entry typed as their union (int|float is one
 * Number mode), as the server does. A list or map keeps its own entry.
 */
const mergeSameModes = (modes: InputType[]): InputType[] => {
    const merged: InputType[] = [];
    for (const mode of modes) {
        const unmergeable = mode.fieldType === "REPEATABLE_LIST" || mode.fieldType === "REPEATABLE_MAP";
        const existing = unmergeable ? undefined : merged.find(m => m.fieldType === mode.fieldType);
        if (!existing) {
            merged.push(mode);
        } else if (mode.ballerinaType && !existing.ballerinaType?.split("|").includes(mode.ballerinaType)) {
            existing.ballerinaType = `${existing.ballerinaType}|${mode.ballerinaType}`;
        }
    }
    return merged;
};

/**
 * The element template a repeatable list or map editor builds each entry from — the shape of the
 * server's buildRepeatableTemplates, of which the editors read only the types.
 */
const toTemplate = (elementType: string): Property => ({
    metadata: { label: "", description: "" },
    value: "",
    optional: false,
    editable: true,
    types: getExpressionFieldTypes(elementType),
});

/**
 * Returns the input modes a variable of the given type offers before the expression mode, or an empty
 * list when the type has none beyond the expression.
 */
export const getTypeInputModes = (typeName?: string): InputType[] => {
    if (!typeName?.trim()) {
        return [];
    }
    const type = normalize(typeName);

    const members = splitUnion(type);
    if (members.length > 1) {
        return getUnionModes(members);
    }
    if (Object.prototype.hasOwnProperty.call(NAMED_TYPE_MODES, type)) {
        return [{ fieldType: NAMED_TYPE_MODES[type], ballerinaType: type, selected: false }];
    }
    if (type.endsWith(ARRAY_SUFFIX)) {
        const elementType = type.slice(0, -ARRAY_SUFFIX.length).trim();
        if (!elementType) {
            return [];
        }
        return [{ fieldType: "REPEATABLE_LIST", ballerinaType: type, selected: false, template: toTemplate(elementType) }];
    }
    const mapMatch = MAP_PATTERN.exec(type);
    if (mapMatch) {
        return [{ fieldType: "REPEATABLE_MAP", ballerinaType: type, selected: false, template: toTemplate(mapMatch[1]) }];
    }
    return [];
};

/**
 * Returns every input mode of a list or map element of the given type: its own modes, then the
 * expression mode that every type falls back to, typed as the server types an element's.
 */
export const getExpressionFieldTypes = (typeName?: string): InputType[] => {
    const expression: InputType = { fieldType: "EXPRESSION", selected: false };
    if (typeName?.trim()) {
        expression.ballerinaType = typeName.trim();
    }
    return [...getTypeInputModes(typeName), expression];
};

/**
 * The input modes of the variable's expression field: the given modes of its type (a record's, an int's, none),
 * then the expression mode. The expression mode keeps the language server's own field type for the field: the
 * variable's expression is ACTION_OR_EXPRESSION, and diagnostics parse an EXPRESSION as an expression alone, which
 * reports a saved `check client->get(...)` as a syntax error.
 */
export const getVariableExpressionTypes = (typeModes: InputType[], serverExpressionType?: InputType["fieldType"]): InputType[] => {
    return [...typeModes, { fieldType: serverExpressionType ?? "EXPRESSION", selected: false }];
};

// The expression mode has no type of its own, so its check would compile `any|error x = <expr>;` instead of the variable's statement.
export const withVariableType = (types: InputType[], variableType?: string): InputType[] =>
    types.map((type) => (variableType?.trim() && !type.ballerinaType ? { ...type, ballerinaType: variableType.trim() } : { ...type }));
