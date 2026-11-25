/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

jest.mock("@wso2/ballerina-side-panel", () => ({
    InsertTargetContext: {},
    isSecretField: (field: { key: string; label?: string }) => /secret|api key/i.test(`${field.key} ${field.label ?? ""}`),
}));
jest.mock("@wso2/ballerina-rpc-client", () => ({}));
jest.mock("@wso2/ui-toolkit", () => ({}));
jest.mock("./DataBrowser", () => ({}));
jest.mock("./ValuePicker", () => ({}));
jest.mock("./useDataTree", () => ({}));
jest.mock("./useCreateData", () => ({}));
jest.mock("../Forms/form-utils", () => ({}));
jest.mock("./styles", () => ({}));

import { takesExpressions } from "./DataBrowserScope";

const expression = { types: [{ fieldType: "EXPRESSION", selected: true }] } as any;
const text = { types: [{ fieldType: "TEXT", selected: true }] } as any;

describe("takesExpressions", () => {
    it("is false when no field takes an expression", () => {
        expect(takesExpressions([text])).toBe(false);
    });

    it("finds an expression inside a listener choice", () => {
        expect(takesExpressions([{ ...text, choices: [{ properties: { port: expression } }] }])).toBe(true);
    });

    it("finds an expression in a select's per-option fields, listed or keyed", () => {
        expect(takesExpressions([{ ...text, dynamicFormFields: { issues: [expression] } }])).toBe(true);
        expect(takesExpressions([{ ...text, dynamicFormFields: { issues: { secret: expression } } }])).toBe(true);
    });

    it("finds an expression in a listener choice's config record", () => {
        const listenerConfig = { properties: { port: expression } };
        expect(takesExpressions([{ ...text, choices: [{ properties: { listenerConfig } }] }])).toBe(true);
    });

    it("finds an expression in advanced properties", () => {
        expect(takesExpressions([{ ...text, advanceProps: [text, expression] }])).toBe(true);
    });

    it("counts a secret text field, which picks or creates a configurable", () => {
        const secretType = [{ fieldType: "TEXT", ballerinaType: "string", selected: true }];
        expect(takesExpressions([{ key: "webhookSecret", types: secretType } as any])).toBe(true);
        expect(takesExpressions([{ metadata: { label: "API Key" }, types: secretType } as any])).toBe(true);
        expect(takesExpressions([{ key: "listenerName", types: secretType } as any])).toBe(false);
    });
});
