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
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    GraphqlSdlArgument,
    GraphqlSdlField,
    MAX_INLINE_GRAPHQL_ARGS,
    formatGraphqlFieldDefinition,
    formatInlineGraphqlArgs,
    toGraphqlName,
} from "../utils/graphql-sdl";

const arg = (name: string, type: string, defaultValue?: string): GraphqlSdlArgument => ({ name, type, defaultValue });

const withDefault = (a: GraphqlSdlArgument): string =>
    a.defaultValue ? `${a.name}: ${a.type} = ${a.defaultValue}` : `${a.name}: ${a.type}`;

const ARG_CORPUS: GraphqlSdlArgument[][] = [
    [],
    [arg("id", "ID!")],
    [arg("limit", "Int!", "10"), arg("filter", "String")],
    [arg("first", "Int"), arg("after", "String"), arg("orderBy", "[Order!]", "[]"), arg("where", "Filter")],
];

describe("formatInlineGraphqlArgs", () => {
    test.each(ARG_CORPUS.map((args) => [args.length, args]))(
        "never shows more than the inline limit, and marks what it hides (%i args)",
        (_count, args: GraphqlSdlArgument[]) => {
            const inline = formatInlineGraphqlArgs(args);
            const shown = args.slice(0, MAX_INLINE_GRAPHQL_ARGS);
            shown.forEach((a) => expect(inline).toContain(withDefault(a)));
            args.slice(MAX_INLINE_GRAPHQL_ARGS).forEach((a) => expect(inline).not.toContain(a.name));
            expect(inline.endsWith("…)")).toBe(args.length > MAX_INLINE_GRAPHQL_ARGS);
        }
    );

    test("renders nothing for a field without arguments", () => {
        expect(formatInlineGraphqlArgs([])).toBe("");
    });

    test("uses SDL argument notation", () => {
        expect(formatInlineGraphqlArgs([arg("id", "ID!")])).toBe("(id: ID!)");
    });

    test("shows a default inline, since it makes a non-null argument optional", () => {
        expect(formatInlineGraphqlArgs([arg("name", "String!", '""')])).toBe('(name: String! = "")');
    });

    test("omits a nil default, which the nullable type already conveys", () => {
        expect(formatInlineGraphqlArgs([arg("suffix", "String", "()")])).toBe("(suffix: String)");
    });
});

describe("formatGraphqlFieldDefinition", () => {
    test.each(ARG_CORPUS.map((args) => [args.length, args]))(
        "lists every argument with its default value (%i args)",
        (_count, args: GraphqlSdlArgument[]) => {
            const definition = formatGraphqlFieldDefinition("field", { args, type: "Result" });
            args.forEach((a) => expect(definition).toContain(withDefault(a)));
        }
    );

    test("matches the SDL a client sees for the issue's example", () => {
        const profile: GraphqlSdlField = { args: [arg("id", "ID!")], type: "Profile" };
        const greeting: GraphqlSdlField = { args: [], type: "String!" };
        expect(formatGraphqlFieldDefinition("greeting", greeting)).toBe("greeting: String!");
        expect(formatGraphqlFieldDefinition("profile", profile)).toBe("profile(id: ID!): Profile");
    });

    test("breaks long argument lists one per line", () => {
        const field: GraphqlSdlField = { args: ARG_CORPUS[3], type: "[Book!]!" };
        expect(formatGraphqlFieldDefinition("books", field)).toBe(
            "books(\n  first: Int\n  after: String\n  orderBy: [Order!] = []\n  where: Filter\n): [Book!]!"
        );
    });

    test("appends deprecation and description", () => {
        const field: GraphqlSdlField = {
            args: [], type: "String!", deprecated: true, description: "Say hello.",
        };
        expect(formatGraphqlFieldDefinition("hello", field)).toBe("hello: String! @deprecated\n\nSay hello.");
    });
});

describe("toGraphqlName", () => {
    test.each([["greeting", "greeting"], ["'type", "type"], ["first\\-name", "first-name"]])(
        "exposes %s as %s",
        (identifier, expected) => expect(toGraphqlName(identifier)).toBe(expected)
    );
});
