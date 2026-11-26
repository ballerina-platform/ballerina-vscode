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

import { PropertyModel } from "@wso2/ballerina-core";
import { applyAnnotation, describeAnnotation } from "../../../../views/BI/ServiceDesigner/Forms/TriggerHandlerForm/annotationAssist";

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
