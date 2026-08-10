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

// L2 (P0): convertConfig edit-form assembly invariants (docs/TEST_BACKLOG.md L2-19).
// convertConfig turns a node's properties into the form's FormField[]. It underlies
// the #1487 "duplicated Row Type in edit mode" bug: the LS returns identical
// properties for create & edit, so the dup is introduced on the frontend when the
// edit path emits a field for a key the create path suppresses. These invariants pin
// the contract convertConfig actually guarantees — including that it does NOT dedupe
// by label, so suppressing a redundant key is the caller's job via skipKeys.
//
// Mock @wso2/ballerina-core exactly as utils/bi.test.ts does: its barrel re-exports
// an ESM-only WS package jest can't load. getPrimaryInputType returns types[0] so a
// property's fieldType is types[0].fieldType.
jest.mock("@wso2/ballerina-core", () => ({
    getPrimaryInputType: (types: any[]) => types?.[0],
    isTemplateType: (value: any) => value !== null && typeof value === "object" && "template" in value,
    isDropDownType: (value: any) =>
        value !== null &&
        "options" in value &&
        (value?.fieldType === "SINGLE_SELECT" || value?.fieldType === "MULTIPLE_SELECT"),
}));

import type { NodeProperties, Property } from "@wso2/ballerina-core";
import { convertConfig } from "./node-property-utils";

function prop(label: string, fieldType = "EXPRESSION", overrides: Partial<Property> = {}): Property {
    return {
        metadata: { label, description: "" },
        types: [{ fieldType, selected: true } as any],
        value: "",
        optional: false,
        editable: true,
        advanced: false,
        hidden: false,
        ...overrides,
    } as Property;
}

describe("convertConfig", () => {
    it("INVARIANT: emits exactly one FormField per non-skipped key, keyed by the property key", () => {
        const properties = { b: prop("Bee"), a: prop("Ay"), c: prop("Cee") } as unknown as NodeProperties;
        const fields = convertConfig(properties);
        expect(fields).toHaveLength(3);
        // one field per key, and each field carries its source key + label
        expect(fields.map((f) => f.key).sort()).toEqual(["a", "b", "c"]);
        for (const f of fields) {
            expect(f.key).toBeTruthy();
            expect(f.label).toBe({ a: "Ay", b: "Bee", c: "Cee" }[f.key]);
        }
    });

    it("sorts keys alphabetically by default, preserves insertion order when sortKeys=false", () => {
        const properties = { b: prop("B"), a: prop("A"), c: prop("C") } as unknown as NodeProperties;
        expect(convertConfig(properties).map((f) => f.key)).toEqual(["a", "b", "c"]);
        expect(convertConfig(properties, [], false).map((f) => f.key)).toEqual(["b", "a", "c"]);
    });

    it("INVARIANT: skipKeys never appear in the output", () => {
        const properties = { a: prop("A"), b: prop("B"), c: prop("C") } as unknown as NodeProperties;
        const fields = convertConfig(properties, ["b"]);
        expect(fields.map((f) => f.key)).toEqual(["a", "c"]);
        expect(fields.some((f) => f.key === "b")).toBe(false);
    });

    it("empty properties → empty output", () => {
        expect(convertConfig({} as NodeProperties)).toEqual([]);
    });

    // The #1487 mechanism, stated as an invariant rather than a targeted repro:
    it("does NOT dedupe by label — two keys sharing a label both render (skipKeys is the fix)", () => {
        // create & edit both receive rowType + type, both labelled "Row Type" (the LS shape)
        const properties = {
            rowType: prop("Row Type"),
            type: prop("Row Type"),
            sqlQuery: prop("SQL Query"),
        } as unknown as NodeProperties;

        const editFields = convertConfig(properties);
        const rowTypeLabels = editFields.filter((f) => f.label === "Row Type");
        // faithfully emits BOTH → this is exactly what surfaces the duplicate in edit mode
        expect(rowTypeLabels).toHaveLength(2);

        // the create path suppresses the redundant key; passing it via skipKeys collapses the dup
        const createFields = convertConfig(properties, ["rowType"]);
        expect(createFields.filter((f) => f.label === "Row Type")).toHaveLength(1);
    });

    it("REPEATABLE_PROPERTY fields get paramManagerProps; ordinary fields do not", () => {
        const properties = {
            plain: prop("Plain"),
            params: prop("Params", "REPEATABLE_PROPERTY", { value: {} as any }),
        } as unknown as NodeProperties;
        const fields = convertConfig(properties);
        const plain = fields.find((f) => f.key === "plain")!;
        const params = fields.find((f) => f.key === "params")!;
        expect(plain.paramManagerProps).toBeUndefined();
        expect(params.paramManagerProps).toBeDefined();
    });
});
