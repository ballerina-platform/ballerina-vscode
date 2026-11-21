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

// L1: which configurable / field types the Configurables pane offers a chevron for.

import { isNavigableType, isNilableArrayType, LocalTypeKinds, moduleOfFile, parseArrayType } from "../../../../../views/BI/HelperPaneNew/utils/configurableNavigation";

const LOCAL: LocalTypeKinds = new Map([
    ["Conf", "RECORD"],
    ["Level", "ENUM"],
    ["Choice", "UNION"],
    ["Ids", "ARRAY"],
    ["String", "RECORD"],
]);

describe("isNavigableType", () => {
    it.each([
        "Conf", "Conf?", "readonly & Conf", "Conf & readonly", "(Conf)?", "Conf|()",
        "Conf[]", "Conf[3]", "Conf[]?", "readonly & Conf[]",
        "record {| string a; |}", "(record {| string a; |})[]", "record {| string a; |}?", "http:ClientConfiguration",
        // A local record may share a keyword's spelling in another case.
        "String",
    ])("drills into %s", (type) => {
        expect(isNavigableType(type, LOCAL)).toBe(true);
    });

    it.each([
        "", "string", "int?", "json", "byte", "Level", "Level?", "Choice", "Ids", "Unknown",
        "int[]?", "string[][]", "Conf[][]", "Conf[0]", "map<string>?", "map<Conf>", "table<Conf> key(a)",
        "int:Unsigned8", "string:Char", "lang.int:Signed32", "Conf|Other", "int|string",
        // A top-level union is rejected even when a member is an inline record or an array.
        "record {| string host; |}|Conf", "record {| string host; |}|Conf[]", "Conf[]|Conf", "Conf & Other",
    ])("does not drill into %s", (type) => {
        expect(isNavigableType(type, LOCAL)).toBe(false);
    });

    it("keeps drill-in on an unresolved local name when the type definitions are unavailable", () => {
        expect(isNavigableType("Conf", undefined)).toBe(true);
        expect(isNavigableType("int[]", undefined)).toBe(false);
    });
});

describe("isNilableArrayType", () => {
    it.each([
        ["Conf[]?", true], ["Conf[]|()", true], ["(Conf[])?", true], ["readonly & Conf[]?", true],
        ["(Conf[]?)", true], ["((Conf[])?)", true], ["readonly & (Conf[]?)", true], ["(Conf?[])", false],
        ["Conf[]", false], ["Conf?[]", false], ["Conf[2]", false], ["Conf?", false],
    ])("%s -> %s", (type, expected) => {
        expect(isNilableArrayType(type as string)).toBe(expected);
    });
});

describe("parseArrayType", () => {
    it.each([
        ["Conf[]", { element: "Conf", length: undefined }],
        ["Conf[2]?", { element: "Conf", length: 2 }],
        ["readonly & (Conf)[]", { element: "Conf", length: undefined }],
        ["Conf", undefined],
        ["map<Conf>", undefined],
    ])("%s", (type, expected) => {
        expect(parseArrayType(type)).toEqual(expected);
    });
});

describe("moduleOfFile", () => {
    it.each([
        ["/p/main.bal", "/p", ""],
        ["/p/tests/main_test.bal", "/p/", ""],
        ["/p/modules/db/db.bal", "/p", "db"],
        ["/p/modules/db/tests/t.bal", "/p", "db"],
        ["C:\\p\\modules\\db\\db.bal", "C:\\p", "db"],
        ["/other/main.bal", "/p", undefined],
    ])("%s in %s", (file, project, expected) => {
        expect(moduleOfFile(file, project)).toBe(expected);
    });
});
