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

// `buildClientSchema` discards the server's own introspection types (`__Type`, `__Field`, ...)
// and substitutes graphql-js's built-in ones, which carry every field from the latest spec
// (`specifiedByURL`, `isOneOf`, `__InputValue.isDeprecated`, `__Directive.isRepeatable`). The
// Ballerina GraphQL runtime does not serve all of them, so GraphiQL would auto-fill and accept
// fields the server then rejects. The server does list its meta types in the introspection
// result, so we read the fields it actually declares and hold the client to those.

import {
    GraphQLError,
    GraphQLType,
    IntrospectionQuery,
    isLeafType,
    isNamedType,
    ValidationRule,
} from "graphql";

/** Field names of each introspection meta type, exactly as the server declares them. */
export type ServedMetaFields = ReadonlyMap<string, ReadonlySet<string>>;

const isMetaTypeName = (name: string): boolean => name.startsWith("__");

export function getServedMetaFields(introspection: IntrospectionQuery): ServedMetaFields {
    const served = new Map<string, Set<string>>();
    for (const type of introspection.__schema.types) {
        if (isMetaTypeName(type.name) && "fields" in type && type.fields) {
            served.set(type.name, new Set(type.fields.map((field) => field.name)));
        }
    }
    return served;
}

// Mirrors the default in @graphiql/toolkit's `fillLeafs`, which is not exported. Copied from
// @graphiql/toolkit 0.11.3, the version graphiql 3.7.0 uses: recheck it when graphiql is bumped.
function toolkitDefaultFieldNames(type: GraphQLType): string[] {
    if (!("getFields" in type)) {
        return [];
    }
    const fields = type.getFields();
    if (fields.id) {
        return ["id"];
    }
    if (fields.edges) {
        return ["edges"];
    }
    if (fields.node) {
        return ["node"];
    }
    return Object.keys(fields).filter((name) => isLeafType(fields[name].type));
}

/**
 * GraphiQL's `getDefaultFieldNames`: the fields it inserts when a query leaves a selection out.
 * On a meta type the server declared, only fields the server serves are inserted. Types the
 * server did not list are left to the default, so an unusual server never loses auto-fill.
 */
export function createGetDefaultFieldNames(served: ServedMetaFields) {
    return (type: GraphQLType): string[] => {
        const names = toolkitDefaultFieldNames(type);
        const allowed = isNamedType(type) ? served.get(type.name) : undefined;
        return allowed ? names.filter((name) => allowed.has(name)) : names;
    };
}

/**
 * Editor validation rule that flags a field on a meta type the server does not serve, so the
 * user sees the error the server would return before sending the query.
 */
export function createServedMetaFieldsRule(served: ServedMetaFields): ValidationRule {
    return (context) => ({
        Field(node) {
            const parentType = context.getParentType();
            const allowed = parentType ? served.get(parentType.name) : undefined;
            const fieldName = node.name.value;
            if (!parentType || !allowed || fieldName === "__typename" || allowed.has(fieldName)) {
                return;
            }
            context.reportError(
                new GraphQLError(
                    `Cannot query field "${fieldName}" on type "${parentType.name}". ` +
                        "This GraphQL service does not support it.",
                    { nodes: node }
                )
            );
        },
    });
}
