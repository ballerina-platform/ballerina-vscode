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

import { Member, Type, TypeFunctionModel, TypeNodeKind } from "@wso2/ballerina-core";
import { getAttributeType } from "../utils/utils";

// A member whose type is structured, as the language server sends constraint types (stream, tuple, ...).
function memberOf(node: string, memberTypes: string[]): Member {
    return {
        kind: "FIELD",
        refs: [],
        name: "value",
        type: {
            name: "",
            editable: false,
            metadata: { label: "", description: "" },
            codedata: { node },
            properties: {},
            members: memberTypes.map((type) => ({ kind: "TYPE", refs: [], type, name: type })),
        },
    } as unknown as Member;
}

const member = (type: string | Type, name?: string): Member => ({ kind: "TYPE", refs: [], type, name });

const container = (node: TypeNodeKind, members: Member[]): Type => ({
    name: "",
    editable: false,
    metadata: { label: "", description: "" },
    codedata: { node },
    properties: {},
    members,
});

const field = (returnType: Type): TypeFunctionModel => ({
    qualifiers: ["resource"],
    accessor: "subscribe",
    kind: "RESOURCE",
    name: "names",
    parameters: [],
    returnType,
    refs: [],
});

describe("getAttributeType", () => {
    it("prints the type signature the LS sends instead of deriving it", () => {
        const stream = container("STREAM", [member("Person"), member(container("UNION", [member("error"), member("()")]))]);
        expect(getAttributeType({ ...field(stream), returnTypeName: "stream<Person, error?>" })).toBe("stream<Person, error?>");
        expect(getAttributeType({ ...member(stream, "value"), typeName: "stream<Person, error?>" })).toBe("stream<Person, error?>");
        // An optional field shows `?` on its name, so its type stays as the LS wrote it.
        expect(getAttributeType({ ...member(stream, "value"), typeName: "stream<Person, error?>", optional: true }))
            .toBe("stream<Person, error?>");
    });

    it("renders nothing for a function without a return type", () => {
        const noReturn: TypeFunctionModel = { ...field(container("STREAM", [member("string")])), returnType: undefined };
        expect(getAttributeType(noReturn)).toBe("");
    });

    // An older LS sends no `typeName`/`returnTypeName`, so the label is derived from the member types.
    describe("fallback without a type signature from the LS", () => {
        // Members come in the order the language server sends them: a stream's completion type follows its value type,
        // and a tuple's members keep their declaration order.
        test.each<[string, string[], string]>([
            ["STREAM", ["Book"], "stream<Book>"],
            ["STREAM", ["Book", "error?"], "stream<Book, error?>"],
            ["TUPLE", ["int", "string"], "[int, string]"],
        ])("formats a %s of %j as %s", (node, memberTypes, expected) => {
            expect(getAttributeType(memberOf(node, memberTypes))).toBe(expected);
        });

        test.each(["STREAM", "TUPLE", "ARRAY", "MAP", "FUTURE", "TYPEDESC"])(
            "never renders a member object as text (%s)",
            (node) => expect(getAttributeType(memberOf(node, ["Book"]))).not.toContain("[object Object]")
        );

        const cases: [string, Type, string][] = [
            ["stream", container("STREAM", [member("string")]), "stream<string>"],
            ["stream of a record", container("STREAM", [member("Person")]), "stream<Person>"],
            ["stream of a union", container("STREAM", [member(container("UNION", [member("string"), member("int")]))]),
                "stream<string|int>"],
            ["tuple", container("TUPLE", [member("string"), member("int")]), "[string, int]"],
            ["future", container("FUTURE", [member("string")]), "future<string>"],
            ["map", container("MAP", [member("int")]), "map<int>"],
            ["array", container("ARRAY", [member("string")]), "string[]"],
            ["tuple with a container member", container("TUPLE", [member("string"), member(container("MAP", [member("int")]))]),
                "[string, map<int>]"],
            ["record", container("RECORD", [member("string", "a"), member("int", "b")]), "record {string a, int b}"],
            ["stream with a completion type", container("STREAM", [member("string"), member(container("UNION", [member("error"), member("()")]))]),
                "stream<string, error?>"],
        ];

        it.each(cases)("renders a %s from its member types", (_, type, expected) => {
            expect(getAttributeType(field(type))).toBe(expected);
            expect(getAttributeType(member(type, "value"))).toBe(expected);
        });

        it("does not mark an optional container field's type as nilable", () => {
            const optionalStream: Member = { ...member(container("STREAM", [member("string")]), "value"), optional: true };
            expect(getAttributeType(optionalStream)).toBe("stream<string>");
        });

        it("marks optional record fields as optional whatever their type", () => {
            const optional = (type: string | Type, name: string): Member => ({ ...member(type, name), optional: true });
            const record = container("RECORD", [optional("string", "a"), optional(container("MAP", [member("int")]), "b")]);
            expect(getAttributeType(member(record, "value"))).toBe("record {string a?, map<int> b?}");
        });

        it("marks optional fields of nested records as optional", () => {
            const optional = (type: string | Type, name: string): Member => ({ ...member(type, name), optional: true });
            const inner = container("RECORD", [optional("string", "a")]);
            const outer = container("RECORD", [optional(inner, "b"), member("int", "c")]);
            expect(getAttributeType(member(outer, "value"))).toBe("record {record {string a?} b?, int c}");
        });
    });
});
