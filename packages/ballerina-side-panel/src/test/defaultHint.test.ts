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

// L1: the "(Default: …)" hint of a field. A dropdown names its default by the entry it presents as selected, the
// option whose value the placeholder holds (EnumEditor), so the hint has to read as that entry does.

import type { InputType } from "@wso2/ballerina-core";
import type { FormField } from "../components/Form/types";
import { getDefaultHint } from "../components/editors/defaultHint";

const field = (partial: Partial<FormField>): FormField => partial as FormField;

const select = (options: { label: string; value: string }[]): InputType =>
    ({ fieldType: "SINGLE_SELECT", selected: false, options } as InputType);
const expression: InputType = { fieldType: "EXPRESSION", selected: false } as InputType;
const number: InputType = { fieldType: "NUMBER", selected: false } as InputType;

// `http:HttpVersion`, an enum labelled by member name and valued by what the member holds.
const httpVersion = select([
    { label: "HTTP_1_0", value: "\"1.0\"" },
    { label: "HTTP_1_1", value: "\"1.1\"" },
    { label: "HTTP_2_0", value: "\"2.0\"" },
]);
// `kafka:SecurityProtocol`, a union of constants, which carries no names and is labelled by value.
const securityProtocol = select([
    { label: "PLAINTEXT", value: "\"PLAINTEXT\"" },
    { label: "SSL", value: "\"SSL\"" },
]);

const DROPDOWN_FIELDS: Record<string, FormField> = {
    "enum default resolved to the value": field({
        types: [httpVersion, expression], placeholder: "\"2.0\"", defaultValue: "\"2.0\"",
    }),
    "enum default left as the member name": field({
        types: [httpVersion, expression], placeholder: "\"2.0\"", defaultValue: "http:HTTP_2_0",
    }),
    "constant union default": field({
        types: [securityProtocol, expression], placeholder: "\"PLAINTEXT\"", defaultValue: "PLAINTEXT",
    }),
    "select that is not the first input type": field({
        types: [number, select([{ label: "INFER_TOOL_COUNT", value: "\"INFER_TOOL_COUNT\"" }]), expression],
        placeholder: "\"INFER_TOOL_COUNT\"", defaultValue: "INFER_TOOL_COUNT",
    }),
};

describe("getDefaultHint", () => {
    // Invariant: whenever the dropdown presents an entry as the default, the hint is that entry's label.
    it.each(Object.entries(DROPDOWN_FIELDS))("names the selected entry: %s", (_, formField) => {
        const presented = formField.types.flatMap(type => ("options" in type ? type.options : []))
            .find(option => option.value === formField.placeholder);
        expect(presented).toBeDefined();
        expect(getDefaultHint(formField)).toBe(presented!.label);
    });

    it("states no default for a field that declares none", () => {
        expect(getDefaultHint(field({ types: [httpVersion, expression], placeholder: "", defaultValue: "" })))
            .toBeUndefined();
    });

    it("falls back to the declared default when it names no option", () => {
        // A union of constants whose default could not be resolved keeps the constant's name.
        expect(getDefaultHint(field({
            types: [securityProtocol, expression], placeholder: "", defaultValue: "PROTOCOL_PLAINTEXT",
        }))).toBe("PROTOCOL_PLAINTEXT");
    });

    it("states the declared default of a field without a dropdown", () => {
        expect(getDefaultHint(field({ types: [number, expression], placeholder: "0", defaultValue: "512" })))
            .toBe("512");
    });

    it.each(["()", "object {}", " () "])("states no default for %p", defaultValue => {
        expect(getDefaultHint(field({ types: [expression], defaultValue }))).toBeUndefined();
    });
});
