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

import { FieldType, LineRange, PropertyModel } from "@wso2/ballerina-core";
import { createClassField } from "../../../../views/BI/ServiceClassEditor/classField";

jest.mock("@wso2/ballerina-core", () => ({}));

// A field's default value may be a bare string in other payloads; this template always gives it a property.
const initialValue = (field: FieldType): PropertyModel => {
    if (typeof field.defaultValue !== "object") {
        throw new Error("The initial value is expected to be a property");
    }
    return field.defaultValue;
};

// L1: the blank variable both the class designer and a TCP service's Connection State start from. It targets the
// class it is added to, starts empty, and requires an initial value, since a class without an init cannot set it.
describe("createClassField", () => {
    const classRange: LineRange = {
        fileName: "handlers.bal",
        startLine: { line: 10, offset: 0 },
        endLine: { line: 30, offset: 1 },
    };

    it("targets the class it is added to", () => {
        expect(createClassField(classRange).codedata.lineRange).toEqual(classRange);
    });

    it("starts with an empty name, type and initial value", () => {
        const field = createClassField(classRange);

        expect([field.name.value, field.type.value, initialValue(field).value]).toEqual(["", "", ""]);
    });

    it("requires a name, a type and an initial value", () => {
        const field = createClassField(classRange);

        expect([field.name.optional, field.type.optional, initialValue(field).optional]).toEqual([false, false, false]);
    });

    it("hands out a fresh object each time", () => {
        const first = createClassField(classRange);
        first.name.value = "buffer";

        expect(createClassField(classRange).name.value).toBe("");
    });
});
