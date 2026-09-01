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

import { FormField } from "@wso2/ballerina-core";
import { getOptionalityLabel } from "./optionality";

const field = (overrides: Partial<FormField>): FormField =>
    ({ typeName: "string", optional: false, defaultable: false, selected: false, ...overrides } as FormField);

describe("getOptionalityLabel", () => {
    it("labels required fields with nothing", () => {
        expect(getOptionalityLabel(field({ name: "database" }))).toBe("");
    });

    it("labels optional fields as optional", () => {
        expect(getOptionalityLabel(field({ name: "password", optional: true }))).toBe(" (Optional)");
    });

    it("leaves defaultable fields unlabelled rather than calling them optional", () => {
        expect(getOptionalityLabel(field({ name: "host", defaultable: true }))).toBe("");
    });

    it("labels a field that is both optional and defaultable as optional", () => {
        expect(getOptionalityLabel(field({ name: "port", optional: true, defaultable: true }))).toBe(" (Optional)");
    });
});
