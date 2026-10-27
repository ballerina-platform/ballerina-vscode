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

// L1 (pure logic): the GraphQL "ID Type" flag on a parameter survives reopening and re-saving
// the parameter editor (wso2/product-integrator#1816).

import type { FormField, FormValues } from "../components/Form/types";
import { getGraphqlIdForField, withPreservedGraphqlId } from "../components/ParamManager/graphqlId";

const field = (fieldType: string, key: string): FormField =>
    ({ key, type: fieldType, types: [{ fieldType, selected: true }] } as unknown as FormField);

// The argument fields of a GraphQL operation, as the service model's parameter schema yields them.
const argumentFields = [field("ACTION_TYPE", "type"), field("IDENTIFIER", "variable"), field("EXPRESSION", "defaultable")];

describe("getGraphqlIdForField", () => {
    it.each([true, false])("hands a saved flag (%s) to the type field only", (saved) => {
        const formValues: FormValues = { type: "string", variable: "id", isGraphqlId: saved };
        const flags = argumentFields.map((f) => getGraphqlIdForField(f, formValues));
        expect(flags).toEqual([saved, undefined, undefined]);
    });

    it.each([undefined, "true"])("leaves the type field alone when no boolean flag was saved (%s)", (saved) => {
        expect(getGraphqlIdForField(argumentFields[0], { type: "string", variable: "id", isGraphqlId: saved })).toBeUndefined();
    });
});

describe("withPreservedGraphqlId", () => {
    it("keeps the opened flag when the checkbox was left untouched", () => {
        const saved = withPreservedGraphqlId({ type: "string", variable: "id" }, { type: "string", variable: "id", isGraphqlId: true });
        expect(saved.isGraphqlId).toBe(true);
    });

    it.each(["int", "string?", "string[]"])("keeps the opened flag when the type changed to another scalar (%s)", (type) => {
        const saved = withPreservedGraphqlId({ type, variable: "id" }, { type: "string", variable: "id", isGraphqlId: true });
        expect(saved.isGraphqlId).toBe(true);
    });

    it.each(["Foo", "map<string>", ""])("drops the opened flag when the type is no longer a scalar (%s)", (type) => {
        const saved = withPreservedGraphqlId({ type, variable: "id" }, { type: "string", variable: "id", isGraphqlId: true });
        expect(saved).not.toHaveProperty("isGraphqlId");
    });

    it.each([true, false])("prefers the submitted flag (%s) over the opened one", (submitted) => {
        const saved = withPreservedGraphqlId({ type: "string", isGraphqlId: submitted }, { type: "string", isGraphqlId: !submitted });
        expect(saved.isGraphqlId).toBe(submitted);
    });

    it("adds no flag to a parameter that never had one", () => {
        const saved = withPreservedGraphqlId({ type: "string" }, { type: "string" });
        expect(saved).not.toHaveProperty("isGraphqlId");
    });

    it("does not mutate the submitted values", () => {
        const data: FormValues = { type: "string" };
        withPreservedGraphqlId(data, { type: "string", isGraphqlId: true });
        expect(data).not.toHaveProperty("isGraphqlId");
    });
});
