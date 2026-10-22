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

/**
 * Service mode edits the language server's HTTP service init model. It is read from the language
 * server's own resource file, so a change to its shape fails here.
 */

import * as fs from "fs";
import * as path from "path";
import {
    blockingValidationMessages,
    implementsServiceContract,
    selectOpenApiDesign,
    toServiceTypeName,
} from "../features/ai/agent/tools/openapi-service-model";

const HTTP_INIT_MODEL = path.resolve(__dirname, "../../../ballerina-language-server/service-model-generator/modules/"
    + "service-model-generator-ls-extension/src/main/resources/services/http_new.json");

const loadModel = () => JSON.parse(fs.readFileSync(HTTP_INIT_MODEL, "utf-8"));

describe("selectOpenApiDesign", () => {
    it("selects the OpenAPI design approach and points it at the spec", () => {
        const model = loadModel();
        const result = selectOpenApiDesign(model, "/tmp/project/resources/specs/orders.yaml", "OrdersService");

        const choices = result.properties.designApproach.choices;
        const enabled = choices.filter(choice => choice.enabled);
        expect(enabled).toHaveLength(1);
        expect(enabled[0].properties.spec.value).toBe("/tmp/project/resources/specs/orders.yaml");
        expect(enabled[0].properties.serviceTypeName.value).toBe("OrdersService");
    });

    it("leaves the model it was given untouched", () => {
        const model = loadModel();
        const before = JSON.stringify(model);
        selectOpenApiDesign(model, "/tmp/spec.yaml", "OrdersService");
        expect(JSON.stringify(model)).toBe(before);
    });

    it("fails when the model has no OpenAPI design approach", () => {
        const model = loadModel();
        model.properties.designApproach.choices = model.properties.designApproach.choices
            .filter((choice: any) => !choice.properties?.spec);
        expect(() => selectOpenApiDesign(model, "/tmp/spec.yaml", "OrdersService")).toThrow("OpenAPI");
    });
});

describe("toServiceTypeName", () => {
    it.each([
        ["Order Management API", "OrderManagementAPIService"],
        ["customer-management api", "CustomerManagementApiService"],
        ["Payments Service", "PaymentsService"],
        ["3D Printing", "Api3DPrintingService"],
        ["", "ApiService"],
        [undefined, "ApiService"],
    ])("turns %p into the identifier %p", (title, expected) => {
        expect(toServiceTypeName(title)).toBe(expected);
    });

    it("always produces a valid Ballerina identifier", () => {
        for (const title of ["Ünïcödé — API!", "  spaces  ", "a.b/c", "9", "___"]) {
            expect(toServiceTypeName(title)).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
        }
    });
});

describe("implementsServiceContract", () => {
    it("finds the service that implements the contract", () => {
        const source = "listener http:Listener l = http:getDefaultListener();\n\nservice OrdersService on l {\n}\n";
        expect(implementsServiceContract(source, "OrdersService")).toBe(true);
    });

    it.each([
        ["no service", "type OrdersService service object {};"],
        ["a service for another contract", "service OrdersServiceV2 on l {}"],
        ["a base-path service", "service /orders on l {}"],
    ])("does not match %s", (_label, source) => {
        expect(implementsServiceContract(source, "OrdersService")).toBe(false);
    });

    it("matches the type name literally", () => {
        expect(implementsServiceContract("service OrdersXService on l {}", "Orders.Service")).toBe(false);
    });
});

describe("blockingValidationMessages", () => {
    it("keeps only the errors that stop generation", () => {
        expect(blockingValidationMessages([
            { propertyPath: "serviceTypeName", rule: "ls.collision", message: "Name clashes", severity: "ERROR" },
            { propertyPath: "basePath", rule: "ls.style", message: "Prefer kebab-case", severity: "WARNING" },
        ] as any)).toEqual(["Name clashes"]);
        expect(blockingValidationMessages(undefined)).toEqual([]);
    });
});
