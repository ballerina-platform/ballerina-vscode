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

// L1 (pure logic): the GraphQL "ID Type" flag saved on a parameter is handed back to its type
// field when the parameter editor reopens (wso2/product-integrator#1816).

import type { FormField, FormValues } from "../components/Form/types";
import { getGraphqlIdForField } from "../components/ParamManager/graphqlId";

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
