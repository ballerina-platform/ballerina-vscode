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

import { ParameterModel, PropertyModel } from "@wso2/ballerina-core";
import { applyAnnotation, applyHeaders, describeAnnotation, describeHeaders } from "../../../../views/BI/ServiceDesigner/Forms/TriggerHandlerForm/annotationAssist";

const tool = {
    metadata: { label: "Tool" },
    properties: {
        structuredOutput: {
            metadata: { label: "Structured Output" }, placeholder: "Auto", optional: true, enabled: false, value: "",
            types: [{ fieldType: "SINGLE_SELECT", selected: true, options: [{ value: "true", label: "Required" }, { value: "false", label: "Off" }] }],
        },
        scopes: { metadata: { label: "Required Scopes" }, optional: true, enabled: true, value: "[\"read\"]", types: [{ fieldType: "EXPRESSION", ballerinaType: "string[]", selected: true }] },
    },
} as unknown as PropertyModel;

describe("tool annotation for the form Copilot", () => {
    it("offers a select by its options with what empty means, and a value as it is", () => {
        const [select, scopes] = describeAnnotation("toolConfig", tool, () => true);
        expect(select.path).toBe("toolConfig.structuredOutput");
        expect(select.value).toBe("");
        expect(select.description).toContain("Empty means Auto.");
        expect(scopes.value).toBe("[\"read\"]");
    });

    it("sets a value on and leaves an emptied one out", () => {
        const updated = applyAnnotation("toolConfig", tool, { "toolConfig.structuredOutput": "true", "toolConfig.scopes": "" })!;
        const fields = updated.properties as Record<string, PropertyModel>;
        expect(fields.structuredOutput).toMatchObject({ enabled: true, value: "true" });
        expect(fields.scopes.enabled).toBe(false);
    });
});

const headerTemplate = {
    metadata: { label: "HTTP Headers" }, name: { value: "" }, headerName: { value: "" }, type: { value: "string" },
} as unknown as ParameterModel;
const bound = { ...headerTemplate, name: { value: "traceId" }, headerName: { value: "\"X-Trace-Id\"" }, type: { value: "string" } } as unknown as ParameterModel;

describe("bound headers for the form Copilot", () => {
    it("offers each bound header by its name and type", () => {
        expect(describeHeaders(headerTemplate, [bound], ["string", "int"]).rows).toEqual([{ header: "X-Trace-Id", type: "string" }]);
    });

    it("keeps a bound header's parameter and adds a new one named as the header editor names it", () => {
        const [kept, added] = applyHeaders(headerTemplate, [bound], [{ header: "x-trace-id" }, { header: "Content-Type", type: "string" }]);
        expect(kept).toBe(bound);
        expect(added).toMatchObject({ name: { value: "contentType" }, headerName: { value: "\"Content-Type\"" }, type: { value: "string" }, httpParamType: "HEADER" });
    });

    it("binds a header repeated in any case once, and drops quotes Copilot added", () => {
        const headers = applyHeaders(headerTemplate, [bound], [{ header: "x-trace-id" }, { header: "X-Trace-Id" }, { header: "\"Accept\"" }]);
        expect(headers).toHaveLength(2);
        expect(headers[0]).toBe(bound);
        expect(headers[1]).toMatchObject({ headerName: { value: "\"Accept\"" }, name: { value: "accept" } });
    });
});

