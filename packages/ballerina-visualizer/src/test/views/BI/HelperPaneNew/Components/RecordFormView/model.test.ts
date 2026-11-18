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

// L1: how the record form reads and writes the record model, over the captured record configs the
// record editor already guards (fixtures/recordConfigs) plus the literal edge cases the LS won't hand us.

import type { TypeField } from "@wso2/ballerina-core";
import { loadFixtures } from "@wso2/test-config/fixtures";
import { normalizeIntersections } from "../../../../../../views/BI/HelperPaneNew/Components/RecordConstructView/utils/intersection";
import {
    PrimitiveTypeName,
    choiceOptions,
    choiceValue,
    fieldKind,
    isNumberLiteral,
    isPrimitiveTypeName,
    literalSource,
    literalText,
    parseStringLiteral,
    resolveUnion,
    setChoiceValue,
    toStringLiteral,
} from "../../../../../../views/BI/HelperPaneNew/Components/RecordFormView/model";

interface RecordConfigFixture {
    recordConfig: TypeField;
}

const fixtures = loadFixtures<RecordConfigFixture>(
    __dirname, "..", "RecordConstructView", "utils", "fixtures", "recordConfigs");

/** Every field slot of a record, recursively, with a path naming it. */
function fieldsOf(record: TypeField, path = "root"): [string, TypeField][] {
    const out: [string, TypeField][] = [];
    for (const field of record.fields ?? []) {
        const here = `${path}.${field.name}`;
        out.push([here, field]);
        if (field.fields) {
            out.push(...fieldsOf(field, here));
        }
        for (const member of field.members ?? []) {
            if (member.fields) {
                out.push(...fieldsOf(member, `${here}<${member.name ?? member.typeName}>`));
            }
        }
    }
    return out;
}

describe("string literals", () => {
    it.each([
        ["", "\"\""],
        ["plain", "\"plain\""],
        ["say \"hi\"", "\"say \\\"hi\\\"\""],
        ["C:\\path", "\"C:\\\\path\""],
        ["two\nlines\ttab", "\"two\\nlines\\ttab\""],
        ["bell\u0007", "\"bell\\u{7}\""],
        ["unicode é ☃", "\"unicode é ☃\""],
    ])("writes %j as %s and reads it back", (text, literal) => {
        expect(toStringLiteral(text)).toBe(literal);
        expect(parseStringLiteral(literal)).toBe(text);
    });

    it.each([
        "string `templ`",
        "\"a\" + \"b\"",
        "someVar",
        "\"unterminated",
        "\"two\" \"literals\"",
    ])("treats %s as not a literal", (source) => {
        expect(parseStringLiteral(source)).toBeUndefined();
    });
});

describe("number literals", () => {
    it.each<[string, PrimitiveTypeName, boolean]>([
        ["30", "int", true],
        ["-5", "int", true],
        ["3.5", "int", false],
        ["007", "int", false],
        ["256", "byte", false],
        ["255", "byte", true],
        ["30", "decimal", true],
        ["2.5e3", "float", true],
        [".5", "decimal", true],
        ["timeout", "decimal", false],
    ])("%s is a %s literal: %s", (text, typeName, expected) => {
        expect(isNumberLiteral(text, typeName)).toBe(expected);
    });
});

describe("literal round trip", () => {
    it.each<[PrimitiveTypeName, string]>([
        ["string", "https://api.example.com"],
        ["int", "3128"],
        ["decimal", "30.5"],
        ["boolean", "true"],
    ])("a %s literal %s reads back as typed", (typeName, text) => {
        expect(literalText(literalSource(text, typeName), typeName)).toBe(text);
    });

    it("leaves an expression for the expression editor", () => {
        expect(literalText("config.url", "string")).toBeUndefined();
        expect(literalText("getTimeout()", "decimal")).toBeUndefined();
        expect(literalText("isProd", "boolean")).toBeUndefined();
    });

    it("an empty field is empty text, and empty text writes nothing", () => {
        expect(literalText(undefined, "string")).toBe("");
        expect(literalSource("", "string")).toBe("");
    });
});

describe("choices", () => {
    const union: TypeField = {
        typeName: "union",
        name: "compression",
        members: [{ typeName: "AUTO" }, { typeName: "ALWAYS" }, { typeName: "NEVER" }],
    };

    it("a union of constants is a choice of its names", () => {
        expect(fieldKind(union)).toBe("choice");
        expect(choiceOptions(union)).toEqual(["AUTO", "ALWAYS", "NEVER"]);
    });

    it("selecting a name selects one member and drops a literal that would win over it", () => {
        const field: TypeField = { ...union, value: "\"NEVER\"", members: union.members!.map((m) => ({ ...m })) };
        setChoiceValue(field, "ALWAYS");
        expect(field.members!.filter((m) => m.selected).map((m) => m.typeName)).toEqual(["ALWAYS"]);
        expect(field.value).toBe("");
        expect(choiceValue(field)).toBe("ALWAYS");
    });

    it("a union of a record and nil shows the record", () => {
        const record: TypeField = { typeName: "record", name: "Proxy", fields: [] };
        const optional: TypeField = { typeName: "union", name: "proxy", members: [record, { typeName: "()" }] };
        expect(resolveUnion(optional)).toBe(record);
        expect(fieldKind(optional)).toBe("record");
    });
});

describe("over the captured record configs", () => {
    it("has fixtures to run", () => {
        expect(fixtures.length).toBeGreaterThan(0);
    });

    describe.each(fixtures.map(({ name, data }) => [name, data] as [string, RecordConfigFixture]))(
        "%s",
        (_name, fixture) => {
            const fields = fieldsOf(normalizeIntersections(fixture.recordConfig));

            it("every simple-typed field is edited as a literal", () => {
                const misplaced = fields
                    .filter(([, field]) => isPrimitiveTypeName(field.typeName) && fieldKind(field) !== "primitive")
                    .map(([path]) => path);
                expect(misplaced).toEqual([]);
            });

            it("every choice offers at least one name, and only names the type has", () => {
                fields
                    .filter(([, field]) => fieldKind(field) === "choice")
                    .forEach(([path, field]) => {
                        const options = choiceOptions(field);
                        expect({ path, empty: options.length === 0 }).toEqual({ path, empty: false });
                        expect(options).toEqual((field.members ?? []).map((m) => m.typeName));
                    });
            });

            it("a value the form reads as a literal writes back unchanged", () => {
                fields
                    .filter(([, field]) => isPrimitiveTypeName(field.typeName) && typeof field.value === "string")
                    .forEach(([path, field]) => {
                        const typeName = field.typeName as PrimitiveTypeName;
                        const text = literalText(field.value, typeName);
                        if (text !== undefined && text !== "") {
                            expect({ path, source: literalSource(text, typeName) })
                                .toEqual({ path, source: field.value.trim() });
                        }
                    });
            });
        }
    );
});
