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

import type { PropertyModel } from "@wso2/ballerina-core";
import type { FormField } from "../components/Form/types";
import { collectFieldKeys, resolveValidationFieldKey } from "../components/Form/utils";

const field = (partial: Partial<FormField>): FormField => partial as FormField;
const property = (partial: Partial<PropertyModel>): PropertyModel => partial as PropertyModel;

const designApproach = field({
    key: "designApproach",
    type: "CHOICE",
    choices: [
        property({ enabled: true, properties: { basePath: property({}) } }),
        property({
            enabled: false,
            properties: {
                spec: property({}),
                serviceTypeName: property({}),
                auth: property({
                    choices: [property({ properties: { privateKey: property({}) } })],
                }),
            },
        }),
    ],
});

describe("collectFieldKeys", () => {
    it("includes every CHOICE option's properties, recursively", () => {
        const keys = collectFieldKeys([designApproach]);
        expect([...keys]).toEqual(
            expect.arrayContaining(["designApproach", "basePath", "spec", "serviceTypeName", "auth", "privateKey"])
        );
    });
});

describe("resolveValidationFieldKey", () => {
    it("resolves a choice-nested path onto the leaf field", () => {
        const keys = collectFieldKeys([designApproach]);
        expect(resolveValidationFieldKey("designApproach.choices.1.serviceTypeName", keys)).toBe("serviceTypeName");
    });

    it("leaves an unknown path unresolved so it falls back to the banner", () => {
        const keys = collectFieldKeys([designApproach]);
        expect(resolveValidationFieldKey("designApproach.choices.1.missing", keys)).toBeUndefined();
    });
});
