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

/** The types `@graphql:ID` can be put on, on their own or as arrays, optionals and unions of them. */
const GRAPHQL_ID_SCALAR_TYPES = new Set(['string', 'int', 'float', 'decimal', 'uuid:Uuid']);

/** Union members the GraphQL compiler skips when it checks an ID type, as in `string|()` or `string|error`. */
const IGNORED_UNION_MEMBERS = new Set(['()', 'error']);

/** Splits a type on the `|` that are not inside parentheses. */
const splitTopLevelUnion = (type: string): string[] => {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < type.length; i++) {
        const char = type[i];
        if (char === '(') {
            depth++;
        } else if (char === ')') {
            depth--;
        } else if (char === '|' && depth === 0) {
            parts.push(type.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(type.slice(start));
    return parts;
};

/** Whether the parentheses that open the type are the ones that close it, as in `(string|int)`. */
const isWrappedInParentheses = (type: string): boolean => {
    if (!type.startsWith('(') || !type.endsWith(')')) {
        return false;
    }
    let depth = 0;
    for (let i = 0; i < type.length; i++) {
        if (type[i] === '(') {
            depth++;
        } else if (type[i] === ')') {
            depth--;
            if (depth === 0) {
                return i === type.length - 1;
            }
        }
    }
    return false;
};

/** Whether a type takes the GraphQL "ID Type" flag: a scalar, an array of scalars, or a union of them. */
export const isGraphQLScalarType = (type: string): boolean => {
    const cleanType = type.trim();

    const unionParts = splitTopLevelUnion(cleanType);
    if (unionParts.length > 1) {
        const valueParts = unionParts.filter(part => !IGNORED_UNION_MEMBERS.has(part.trim()));
        return valueParts.length > 0 && valueParts.every(part => isGraphQLScalarType(part));
    }
    if (cleanType.endsWith('?')) {
        return isGraphQLScalarType(cleanType.slice(0, -1));
    }
    if (cleanType.endsWith('[]')) {
        return isGraphQLScalarType(cleanType.slice(0, -2));
    }
    if (isWrappedInParentheses(cleanType)) {
        return isGraphQLScalarType(cleanType.slice(1, -1));
    }

    return GRAPHQL_ID_SCALAR_TYPES.has(cleanType);
};
