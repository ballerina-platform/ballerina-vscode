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

// L1: the connection `init` form reads in `init` parameter declaration order (#2402).
// Add a captured `getNodeTemplate` payload under fixtures/connections/ to guard a connector.

// @wso2/ballerina-core is mocked as in utils/convertConfig.test.ts: its barrel re-exports an
// ESM-only WS package jest cannot load.
jest.mock("@wso2/ballerina-core", () => ({
    getPrimaryInputType: (types: any[]) => types?.[0],
    isTemplateType: (value: any) => value !== null && typeof value === "object" && "template" in value,
    isDropDownType: (value: any) =>
        value !== null &&
        "options" in value &&
        (value?.fieldType === "SINGLE_SELECT" || value?.fieldType === "MULTIPLE_SELECT"),
}));

import type { NodeProperties } from "@wso2/ballerina-core";
import { loadFixtures } from "@wso2/test-config/fixtures";
import { convertConnectionConfig } from "./connectionFormFields";

interface ConnectionFixture {
    description?: string;
    expectedFieldOrder: string[]; // the keys of `properties`, i.e. the order the LS sent them in
    properties: NodeProperties;
}

const fixtures = loadFixtures<ConnectionFixture>(__dirname, "fixtures", "connections");
const cases = fixtures.map((f) => [f.name, f.data] as [string, ConnectionFixture]);

describe("connection init form field order", () => {
    it("has fixtures to run", () => {
        expect(fixtures.length).toBeGreaterThan(0);
    });

    it("the corpus would catch alphabetised keys", () => {
        expect(
            cases.some(([, fx]) => {
                const sorted = [...fx.expectedFieldOrder].sort();
                return fx.expectedFieldOrder.some((key, index) => key !== sorted[index]);
            })
        ).toBe(true);
    });

    it.each(cases)("%s -> INVARIANT: one field per property, in the order the LS sent them", (_name, fx) => {
        const keys = convertConnectionConfig(fx.properties).map((field) => field.key);
        expect(keys).toEqual(Object.keys(fx.properties));
        expect(keys).toEqual(fx.expectedFieldOrder);
    });

    // `Form` renders !advanced first, then advanced; neither group may be re-ranked within itself.
    it.each(cases)("%s -> INVARIANT: both render passes keep declaration order", (_name, fx) => {
        const fields = convertConnectionConfig(fx.properties);
        const order = (subset: typeof fields) => subset.map((field) => field.key);
        const plain = order(fields.filter((field) => !field.advanced));
        const advanced = order(fields.filter((field) => field.advanced));
        expect(plain).toEqual(fx.expectedFieldOrder.filter((key) => plain.includes(key)));
        expect(advanced).toEqual(fx.expectedFieldOrder.filter((key) => advanced.includes(key)));
    });
});
