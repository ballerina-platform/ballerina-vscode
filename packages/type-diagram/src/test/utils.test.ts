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

import { Member } from "@wso2/ballerina-core";
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

describe("getAttributeType", () => {
    test("formats a stream by its member type", () => {
        expect(getAttributeType(memberOf("STREAM", ["Book"]))).toBe("stream<Book>");
    });

    test("formats a tuple's members in declaration order", () => {
        expect(getAttributeType(memberOf("TUPLE", ["int", "string"]))).toBe("[int,string]");
    });

    test.each(["STREAM", "TUPLE", "ARRAY", "MAP", "FUTURE", "TYPEDESC"])(
        "never renders a member object as text (%s)",
        (node) => expect(getAttributeType(memberOf(node, ["Book"]))).not.toContain("[object Object]")
    );
});
