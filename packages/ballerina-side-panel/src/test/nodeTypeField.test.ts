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

import { hasRequiredParameters, isNodeTypeField, isPrioritizedField } from "../components/Form/utils";
import { FormField } from "../components/Form/types";

const field = (key: string, fieldType: string, kind?: string, optional = false) =>
    ({ key, optional, codedata: kind ? { kind } : {}, types: [{ fieldType, selected: true }] } as unknown as FormField);

// The kinds the language server tags a function parameter's property with.
const PARAMETER_KINDS = ["REQUIRED", "DEFAULTABLE", "INCLUDED_FIELD", "REST_PARAMETER", "INCLUDED_RECORD_REST"];

describe("node type field", () => {
    it("is the TYPE field the node carries for its own result", () => {
        const typeField = field("type", "TYPE");
        expect(isNodeTypeField(typeField)).toBe(true);
        expect(isPrioritizedField(typeField)).toBe(true);
    });

    // A typedesc parameter is edited with the type editor, but it is an argument of the call: it must stay among
    // the parameters rather than be lifted up beside the variable as the node's type.
    it.each(PARAMETER_KINDS)("is never a typedesc parameter of kind %s", (kind) => {
        const typedescParam = field("rowType", "TYPE", kind);
        expect(isNodeTypeField(typedescParam)).toBe(false);
        expect(isPrioritizedField(typedescParam)).toBe(false);
    });

    it("counts a required typedesc parameter as a required parameter", () => {
        const fields = [field("type", "TYPE"), field("rowType", "TYPE", "REQUIRED")];
        expect(hasRequiredParameters(fields)).toBe(true);
    });
});
