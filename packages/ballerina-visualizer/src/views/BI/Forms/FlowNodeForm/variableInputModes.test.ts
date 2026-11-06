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

import type { InputType, TemplateType } from "@wso2/ballerina-core";
import { getExpressionFieldTypes, getTypeInputModes } from "./variableInputModes";

const NAMED_TYPES: [string, InputType["fieldType"]][] = [
    ["int", "NUMBER"], ["int:Signed8", "NUMBER"], ["int:Unsigned8", "NUMBER"], ["int:Signed16", "NUMBER"],
    ["int:Unsigned16", "NUMBER"], ["int:Signed32", "NUMBER"], ["int:Unsigned32", "NUMBER"], ["byte", "NUMBER"],
    ["float", "NUMBER"], ["decimal", "NUMBER"],
    ["string", "TEXT"], ["string:Char", "TEXT"],
    ["boolean", "FLAG"],
    ["sql:ParameterizedQuery", "SQL_QUERY"], ["sql:ParameterizedCallQuery", "SQL_QUERY"],
];

const NO_MODE_TYPES = ["json", "anydata", "xml", "Person", "int[3]", "constructor", "toString",
    "ParameterizedQuery", "json|xml", "Person|()", "()"];

const templateTypes = (mode: InputType): InputType[] =>
    ((mode as TemplateType).template as { types: InputType[] }).types;

describe("getTypeInputModes", () => {
    it.each(NAMED_TYPES)("a %s variable offers the %s mode", (type, fieldType) => {
        expect(getTypeInputModes(type)).toEqual([{ fieldType, ballerinaType: type, selected: false }]);
    });

    it.each(NAMED_TYPES)("an optional %s keeps its type's mode", (type) => {
        expect(getTypeInputModes(`${type}?`)).toEqual(getTypeInputModes(type));
    });

    it.each(NAMED_TYPES)("a %s[] offers an array whose elements offer the element's modes", (type) => {
        const [mode, ...rest] = getTypeInputModes(`${type}[]`);
        expect(rest).toEqual([]);
        expect(mode.fieldType).toBe("REPEATABLE_LIST");
        expect(templateTypes(mode)).toEqual(getExpressionFieldTypes(type));
    });

    it.each(NAMED_TYPES)("a map<%s> offers a map whose values offer the value type's modes", (type) => {
        const [mode, ...rest] = getTypeInputModes(`map<${type}>`);
        expect(rest).toEqual([]);
        expect(mode.fieldType).toBe("REPEATABLE_MAP");
        expect(templateTypes(mode)).toEqual(getExpressionFieldTypes(type));
    });

    it("every array or map element template ends in the expression mode", () => {
        for (const type of ["Person[]", "json[]", "map<anydata>", "int[][]", "map<string[]>"]) {
            const [mode] = getTypeInputModes(type);
            expect(templateTypes(mode).at(-1)).toMatchObject({ fieldType: "EXPRESSION" });
        }
    });

    it("a nested array builds a template for each level", () => {
        const [outer] = getTypeInputModes("int[][]");
        const [inner] = templateTypes(outer);
        expect(inner.fieldType).toBe("REPEATABLE_LIST");
        expect(templateTypes(inner)).toEqual(getExpressionFieldTypes("int"));
    });

    it("an optional array is still an array", () => {
        expect(getTypeInputModes("string[]?")[0].fieldType).toBe("REPEATABLE_LIST");
    });

    it.each([...NO_MODE_TYPES, "", "   ", undefined])("a %s variable offers no mode beyond the expression", (type) => {
        expect(getTypeInputModes(type)).toEqual([]);
    });
});

describe("getTypeInputModes on a union", () => {
    const fieldTypes = (type: string) => getTypeInputModes(type).map(mode => mode.fieldType);

    it.each(NAMED_TYPES)("a union leading with %s offers that member's mode first", (type, fieldType) => {
        expect(fieldTypes(`${type}|json`)[0]).toBe(fieldType);
        expect(fieldTypes(`json|${type}`)[0]).toBe(fieldType);
    });

    it("keeps every member's mode in declaration order", () => {
        expect(fieldTypes("int|string|boolean")).toEqual(["NUMBER", "TEXT", "FLAG"]);
        expect(fieldTypes("boolean|int")).toEqual(["FLAG", "NUMBER"]);
    });

    it("members landing on one mode share it, typed as their union", () => {
        expect(getTypeInputModes("int|float|string")).toEqual([
            { fieldType: "NUMBER", ballerinaType: "int|float", selected: false },
            { fieldType: "TEXT", ballerinaType: "string", selected: false },
        ]);
    });

    it("leaves nil to the expression mode", () => {
        expect(getTypeInputModes("int|()")).toEqual(getTypeInputModes("int"));
        expect(getTypeInputModes("()|string")).toEqual(getTypeInputModes("string"));
    });

    it.each(["\"GET\"|\"POST\"", "1|2|3", "true|false", "\"a|b\"|\"c\""])(
        "a union of singletons (%s) offers no mode beyond the expression",
        (type) => {
            expect(getTypeInputModes(type)).toEqual([]);
        }
    );

    it("leaves singleton members to the expression mode and keeps the others' modes", () => {
        expect(fieldTypes("\"GET\"|\"POST\"|int|string")).toEqual(["NUMBER", "TEXT"]);
        expect(fieldTypes("int|\"GET\"")).toEqual(["NUMBER"]);
    });

    it("does not split inside brackets", () => {
        expect(fieldTypes("map<int|string>")).toEqual(["REPEATABLE_MAP"]);
        expect(fieldTypes("(int|string)[]")).toEqual(["REPEATABLE_LIST"]);
    });

    it("gives a list of a union an element template offering the union's modes", () => {
        const [list] = getTypeInputModes("(int|string)[]");
        expect(templateTypes(list).map(mode => mode.fieldType)).toEqual(["NUMBER", "TEXT", "EXPRESSION"]);
    });

    it("unwraps parentheses only when they enclose the whole type", () => {
        expect(fieldTypes("(int|string)")).toEqual(["NUMBER", "TEXT"]);
        expect(fieldTypes("(int)|(string)")).toEqual(["NUMBER", "TEXT"]);
        expect(fieldTypes("(int|string)?")).toEqual(["NUMBER", "TEXT"]);
    });
});

describe("getExpressionFieldTypes", () => {
    it.each([...NAMED_TYPES.map(([type]) => type), ...NO_MODE_TYPES, "int[]", "map<string>"])(
        "%s always ends in an expression mode typed as the value",
        (type) => {
            expect(getExpressionFieldTypes(type).at(-1)).toEqual({
                fieldType: "EXPRESSION", ballerinaType: type, selected: false
            });
        }
    );
});
