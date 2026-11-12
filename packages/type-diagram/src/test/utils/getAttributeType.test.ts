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

// L1: how the type diagram writes a member's type. It must read as the source the user would write: `T?` for a
// union with nil, grouped where the `?` would bind to only a part of it, and an optional field marked on its name.

import { Member, Type } from "@wso2/ballerina-core";
import { getAttributeType } from "../../utils/utils";

const typeOf = (node: string, members: Member[] = [], name = ""): Type => ({
    name,
    editable: false,
    metadata: { label: name, description: "" },
    codedata: { node } as Type["codedata"],
    properties: {},
    members,
});

const member = (type: string | Type, name = "", optional = false): Member => ({
    kind: "TYPE",
    refs: [],
    type,
    name,
    optional,
});

const nil = member("()");

describe("getAttributeType", () => {
    it.each([
        ["a union with nil", typeOf("UNION", [member("string"), nil]), "string?"],
        ["a union with nil written first", typeOf("UNION", [nil, member("string")]), "string?"],
        ["a union of several types with nil", typeOf("UNION", [member("A"), member("B"), nil]), "(A|B)?"],
        ["a union without nil", typeOf("UNION", [member("A"), member("B")]), "A|B"],
        [
            "an intersection with nil",
            typeOf("UNION", [member(typeOf("INTERSECTION", [], "int[] & readonly")), nil]),
            "(int[] & readonly)?",
        ],
        [
            "a function with nil",
            typeOf("UNION", [member(typeOf("FUNCTION", [], "function () returns int")), nil]),
            "(function () returns int)?",
        ],
        ["a list of a nilable type", typeOf("ARRAY", [member(typeOf("UNION", [member("string"), nil]))]), "string?[]"],
        [
            "a list of a union",
            typeOf("ARRAY", [member(typeOf("UNION", [member("A"), member("B")]))]),
            "(A|B)[]",
        ],
        [
            "a list of a nilable union",
            typeOf("ARRAY", [member(typeOf("UNION", [member("A"), member("B"), nil]))]),
            "(A|B)?[]",
        ],
        [
            "a nilable list",
            typeOf("UNION", [member(typeOf("ARRAY", [member("string")])), nil]),
            "string[]?",
        ],
        // The LS sends a stream's and a tuple's members last to first.
        ["a stream", typeOf("STREAM", [member("error?"), member(typeOf("ARRAY", [member("Review")]))]), "stream<Review[], error?>"],
        ["a tuple", typeOf("TUPLE", [member(typeOf("MAP", [member("int")])), member("string")]), "[string, map<int>]"],
        [
            "an anonymous record with an optional field",
            typeOf("RECORD", [member(typeOf("ARRAY", [member("string")]), "tags", true), member("int", "id")]),
            "record {int id, string[] tags?}",
        ],
    ])("writes %s", (_case, type, expected) => {
        expect(getAttributeType(member(type, "field"))).toBe(expected);
    });

    it("leaves an optional field's type as it is, as its name shows that it can be left out", () => {
        expect(getAttributeType(member(typeOf("ARRAY", [member("string")]), "tags", true))).toBe("string[]");
        expect(getAttributeType(member("string", "name", true))).toBe("string");
    });
});
