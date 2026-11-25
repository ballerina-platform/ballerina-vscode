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

import * as fs from "fs";
import * as path from "path";
import { cloneDeep } from "lodash";
import type { ConfigProperties, ParameterModel } from "@wso2/ballerina-core";

jest.mock("@wso2/ballerina-core", () => jest.requireActual("@wso2/ballerina-core/lib/utils/form-property-utils"));
jest.mock("../../../utils", () => ({ HTTP_ENUM_TYPES: ["string", "int", "boolean"] }));
import { applyParameters, describeParameters, headerVariable } from "./parametersAssist";

// The templates the language server sends with every HTTP resource model.
const schemas: ConfigProperties = JSON.parse(fs.readFileSync(path.resolve(__dirname,
    "../../../../../../../../ballerina-language-server/service-model-generator/modules/service-model-generator-ls-extension/src/main/resources/functions/http_resource.json"),
    "utf8")).schema;

const param = (template: string, patch: Partial<ParameterModel>, values: Record<string, string>): ParameterModel => {
    const model = cloneDeep(schemas[template]) as ParameterModel;
    Object.entries(values).forEach(([key, value]) => { (model as Record<string, any>)[key].value = value; });
    return { ...model, enabled: true, ...patch };
};

const limit = param("query", { metadata: { label: "limit", description: "" } }, { name: "limit", type: "int" });
const payload = param("payload", {}, { name: "payload", type: "json" });

describe("HTTP parameters for the Copilot", () => {
    it("offers query parameters, headers and the payload as row groups", () => {
        const groups = describeParameters([limit, payload], schemas, true);
        expect(groups.map((group) => group.id)).toEqual(["queryParameters", "headers", "payload"]);
        expect(groups[0].rows).toEqual([{ name: "limit", type: "int", defaultValue: "" }]);
        expect(groups[0].item.map((item) => item.key)).toEqual(["name", "type", "defaultValue"]);
        expect(groups[0].item[1].property.types[0]).toMatchObject({ fieldType: "SINGLE_SELECT", options: expect.arrayContaining([{ value: "int", label: "int" }]) });
        expect(groups[2]).toMatchObject({ rows: [{ type: "json" }], max: 1 });
    });

    it("allows no payload row when the method takes no body", () => {
        expect(describeParameters([limit], schemas, false)[2]).toMatchObject({ id: "payload", rows: [], max: 0 });
    });

    it("adds a query parameter after the existing ones and removes the payload", () => {
        const next = applyParameters([limit, payload], schemas, { queryParameters: [{ name: "limit", type: "int" }, { name: "issueId", type: "string" }], payload: [] });
        expect(next).toHaveLength(2);
        expect(next[0].name.value).toBe("limit");
        expect(next[1]).toMatchObject({ httpParamType: "QUERY", enabled: true, name: { value: "issueId" }, type: { value: "string" } });
        // The template stays as the language server sent it.
        expect((schemas.query as ParameterModel).name.value).toBe("");
    });

    it("keeps an edited parameter's other settings and sets its default", () => {
        const [edited] = applyParameters([limit], schemas, { queryParameters: [{ name: "limit", type: "int", defaultValue: "10" }] });
        expect(edited.metadata.label).toBe("limit");
        expect(edited.defaultValue).toMatchObject({ value: "10", enabled: true });
    });

    it("names a new header's variable from the header name, as the header editor does", () => {
        const [header] = applyParameters([], schemas, { headers: [{ headerName: "X-Api-Key", type: "string" }] });
        expect(header).toMatchObject({ httpParamType: "HEADER", headerName: { value: "\"X-Api-Key\"" }, name: { value: "xApiKey" } });
        expect(headerVariable("Content-Type")).toBe("contentType");
    });
});
