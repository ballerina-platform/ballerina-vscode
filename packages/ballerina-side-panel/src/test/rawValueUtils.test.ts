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

// Pure-logic test for the split of the raw text of an array into its elements. The module holds no
// import of its own, so it needs no mock of the side-panel barrel.

import { stringToRawArrayElements, buildStringArray } from "../components/editors/rawValueUtils";

describe("stringToRawArrayElements", () => {
    it("splits on the separators of the array", () => {
        expect(stringToRawArrayElements("[a, b, c]")).toEqual(["a", " b", " c"]);
        expect(stringToRawArrayElements('["a", [1, 2], {k: 1}]')).toHaveLength(3);
    });

    it("returns no element for an empty array", () => {
        expect(stringToRawArrayElements("[]")).toEqual([]);
    });

    it("preserves a trailing empty element", () => {
        expect(stringToRawArrayElements("[a, ]")).toEqual(["a", " "]);
    });

    it("keeps a comma of a quoted string within its element", () => {
        expect(stringToRawArrayElements('["a, b"]')).toEqual(['"a, b"']);
    });

    it("keeps a comma of a call within its element", () => {
        expect(stringToRawArrayElements("[foo(a, b)]")).toEqual(["foo(a, b)"]);
    });

    it("keeps a comma of a template within its element", () => {
        const element =
            "string `Customer details: ID ${customerIdElement.data()}, Name ${firstNameElement.data()}`";
        expect(stringToRawArrayElements(`[${element}]`)).toEqual([element]);
    });

    it("keeps a comma of an interpolation within its element", () => {
        const element = "string `a ${f(1, 2)} b`";
        expect(stringToRawArrayElements(`[${element}]`)).toEqual([element]);
    });

    it("ends a template that holds a backtick within an interpolation", () => {
        // string `Backtick:${"`"}` holds a literal backtick, which does not end the template
        const element = 'string `Backtick:${"`"}`';
        expect(stringToRawArrayElements(`[${element}, next]`)).toEqual([element, " next"]);
    });

    it("splits after a template", () => {
        expect(stringToRawArrayElements('[string `p, q`, "r"]')).toEqual(["string `p, q`", ' "r"']);
    });
});

describe("buildStringArray", () => {
    it("lets an element of an array survive a round trip", () => {
        const element = "string `Customer details: ID ${a.data()}, Name ${b.data()}`";
        expect(stringToRawArrayElements(buildStringArray([{ value: element }] as any))).toEqual([element]);
    });
});
