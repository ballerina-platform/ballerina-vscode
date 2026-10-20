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

import { getAppliedRenames } from "../components/ParamManager/appliedRenames";
import { FormField } from "../components/Form/types";

const RANGE = { fileName: "main.bal", startLine: { line: 1, offset: 20 }, endLine: { line: 1, offset: 26 } };

const field = (key: string, fieldType: string, editable: boolean, lineRange?: typeof RANGE) =>
    ({ key, editable, lineRange, types: [{ fieldType, selected: true }] } as unknown as FormField);

// The parameter editor's fields: a name renamed in place, a type and a description.
const FIELDS = [
    field("variable", "IDENTIFIER", false, RANGE),
    field("type", "TYPE", true),
    field("parameterDescription", "TEXTAREA", true),
];
const SAVED = { variable: "person", type: "Person", parameterDescription: "" };

describe("getAppliedRenames", () => {
    it("keeps a name renamed in place", () => {
        expect(getAppliedRenames(FIELDS, { ...SAVED, variable: "p" }, SAVED)).toEqual({ variable: "p" });
    });

    it("drops every other unsaved edit alongside a rename", () => {
        const values = { variable: "p", type: "string", parameterDescription: "who" };
        expect(getAppliedRenames(FIELDS, values, SAVED)).toEqual({ variable: "p" });
    });

    it("returns nothing when the name was not renamed", () => {
        expect(getAppliedRenames(FIELDS, SAVED, SAVED)).toEqual({});
        expect(getAppliedRenames(FIELDS, { ...SAVED, type: "string" }, SAVED)).toEqual({});
        expect(getAppliedRenames(FIELDS, {}, SAVED)).toEqual({});
    });

    // An editable name (a new parameter) is only written by the save, so a cancel discards it.
    it("ignores an editable name", () => {
        const fields = [field("variable", "IDENTIFIER", true)];
        expect(getAppliedRenames(fields, { variable: "p" }, SAVED)).toEqual({});
    });

    it("ignores a read-only name with no source range", () => {
        const fields = [field("variable", "IDENTIFIER", false)];
        expect(getAppliedRenames(fields, { variable: "p" }, SAVED)).toEqual({});
    });

    it("ignores a cleared name", () => {
        expect(getAppliedRenames(FIELDS, { ...SAVED, variable: "" }, SAVED)).toEqual({});
    });
});
