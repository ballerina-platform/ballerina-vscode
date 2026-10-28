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

/**
 * A GraphQL field argument, with its type in SDL notation.
 */
export interface GraphqlSdlArgument {
    name: string;
    type: string;
    defaultValue?: string;
}

/**
 * A GraphQL field, with its output type in SDL notation.
 */
export interface GraphqlSdlField {
    args?: GraphqlSdlArgument[];
    type: string;
    description?: string;
    deprecated?: boolean;
}

// A diagram row has room for about two typed arguments; anything beyond that is elided inline and
// listed in full in the row tooltip, the same split GraphiQL and Apollo Studio use between a field
// list and its detail view.
export const MAX_INLINE_GRAPHQL_ARGS = 2;

// Ballerina's nil default. It only makes the argument optional, which its nullable type already says.
const NIL_DEFAULT = "()";

// A default makes the argument optional to pass even when its type is non-null (`name: String! = ""`),
// so it is part of the argument wherever the argument is shown.
const formatArgument = (arg: GraphqlSdlArgument): string =>
    arg.defaultValue !== undefined && arg.defaultValue !== null && arg.defaultValue !== NIL_DEFAULT
        ? `${arg.name}: ${arg.type} = ${arg.defaultValue}`
        : `${arg.name}: ${arg.type}`;

/**
 * The name a GraphQL client sees for a Ballerina identifier, e.g. `'type` is exposed as `type`.
 */
export function toGraphqlName(identifier: string): string {
    return (identifier ?? "").replace(/^'/, "").replace(/\\(.)/g, "$1");
}

/**
 * The argument list shown next to a field name in a diagram, e.g. `(id: ID!, first: Int! = 10)`.
 */
export function formatInlineGraphqlArgs(args: GraphqlSdlArgument[]): string {
    if (!args?.length) {
        return "";
    }
    const shown = args.slice(0, MAX_INLINE_GRAPHQL_ARGS).map(formatArgument);
    if (args.length > MAX_INLINE_GRAPHQL_ARGS) {
        shown.push("…");
    }
    return `(${shown.join(", ")})`;
}

/**
 * The full field definition in SDL, e.g. `profile(id: ID!): Profile`, followed by its description.
 * A deprecated field carries the `@deprecated` directive, as in the schema.
 * Fields with more arguments than fit inline put one argument per line, as SDL formatters do.
 */
export function formatGraphqlFieldDefinition(name: string, field: GraphqlSdlField): string {
    const args = (field.args ?? []).map(formatArgument);
    let argList = "";
    if (args.length > MAX_INLINE_GRAPHQL_ARGS) {
        argList = `(\n${args.map((arg) => `  ${arg}`).join("\n")}\n)`;
    } else if (args.length) {
        argList = `(${args.join(", ")})`;
    }
    const lines = [`${name}${argList}: ${field.type}${field.deprecated ? " @deprecated" : ""}`];
    if (field.description) {
        lines.push("", field.description);
    }
    return lines.join("\n");
}
