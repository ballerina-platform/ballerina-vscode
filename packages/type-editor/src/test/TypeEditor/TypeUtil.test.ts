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

// L1: writing a type the LS sent as a structure back as source. The type is the editor's state, so writing it must
// not change it: a field re-renders many times with the same type and must show the same source each time.

import { Member, Type } from "@wso2/ballerina-core";
import { typeToSource } from "../../TypeEditor/TypeUtil";

const typeOf = (node: string, members: Member[] = [], name = ""): Type => ({
    name,
    editable: true,
    metadata: { label: name, description: "" },
    codedata: { node } as Type["codedata"],
    properties: {},
    members,
});

const member = (type: string | Type): Member => ({ kind: "TYPE", refs: [], type });

// The LS sends a union's members last to first.
const CORPUS: [string, Type][] = [
    ["string|int", typeOf("UNION", [member("int"), member("string")])],
    ["string?", typeOf("UNION", [member("()"), member("string")])],
    ["A | B | C", typeOf("UNION", [member("C"), member("B"), member("A")])],
    ["(string|int)[]", typeOf("ARRAY", [member(typeOf("UNION", [member("int"), member("string")]))])],
];

describe("typeToSource", () => {
    // INVARIANT: writing a type leaves it as it was, so writing it again gives the same source.
    it.each(CORPUS)("INVARIANT: %s is written the same way every time", (_name, type) => {
        const before = JSON.stringify(type);
        const first = typeToSource(type);
        expect(JSON.stringify(type)).toBe(before);
        expect(typeToSource(type)).toBe(first);
    });

    it.each([
        [typeOf("UNION", [member("int"), member("string")]), "string | int"],
        [typeOf("UNION", [member("()"), member("string")]), "string?"],
    ])("writes a union in the order it was written", (type, expected) => {
        expect(typeToSource(type)).toBe(expected);
    });
});
