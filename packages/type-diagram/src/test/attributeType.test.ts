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

// L1 (contract) — `getAttributeType` renders the type label shown on a diagram field, such as a
// GraphQL subscription's `stream<string>` (wso2/product-integrator#1811). The LS sends container
// types (TypeTransformer) as a node kind plus member types in source order; the label must be
// built from those member types, never from the member objects themselves.

import { Member, Type, TypeFunctionModel, TypeNodeKind } from "@wso2/ballerina-core";
import { getAttributeType } from "../utils/utils";

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
    ];

    it.each(cases)("renders a %s from its member types", (_, type, expected) => {
        expect(getAttributeType(field(type))).toBe(expected);
        expect(getAttributeType(member(type, "value"))).toBe(expected);
    });

    it("marks an optional container field as nilable", () => {
        const optionalStream: Member = { ...member(container("STREAM", [member("string")]), "value"), optional: true };
        expect(getAttributeType(optionalStream)).toBe("stream<string>|()");
    });
});
