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

// L1 (pure logic): which argument types offer the GraphQL "ID Type" checkbox.

import { isGraphQLScalarType } from "../components/editors/graphqlScalarType";

describe("isGraphQLScalarType", () => {
    it.each([
        "string",
        "int",
        "float",
        "decimal",
        "string?",
        "int[]",
        "int[]?",
        "string?[]",
        "string|int",
        "string|int?",
        "(string|int)",
        "(string|int)?",
        "(string|int)[]",
        "(string|int)[]?",
        "(string|int)?[]",
        "((string|int)|float)",
        "(string)|(int)",
        " string ",
    ])("takes the flag on a scalar, an array of scalars or a union of them (%s)", (type) => {
        expect(isGraphQLScalarType(type)).toBe(true);
    });

    it.each([
        "",
        "Foo",
        "boolean",
        "map<string>",
        "string|Foo",
        "(string|Foo)?",
        "(string|int",
        "string|int)",
        "(string)(int)",
        "Foo[]",
    ])("does not take the flag on anything else (%s)", (type) => {
        expect(isGraphQLScalarType(type)).toBe(false);
    });
});
