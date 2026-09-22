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
import { dependentKeysFromTemplate, picksWorkflow, retypeFieldsFromTemplate } from "./dependentFields";

const field = (key: string, extra: Record<string, any> = {}) => ({
    key, label: key, type: "EXPRESSION", optional: false, editable: true, documentation: "",
    types: [{ fieldType: "EXPRESSION", ballerinaType: "anydata", selected: true }], value: "", ...extra,
}) as any;

describe("fields that follow a workflow dropdown", () => {
    const fields = [
        field("workflow"),
        field("input", { codedata: { dependentProperty: "workflow" }, value: "claimId" }),
        field("type", { codedata: { dependentProperty: "workflow" }, value: "json" }),
        field("variable"),
    ];

    // A statement re-read from source does not carry the tag on its variable-type property, so the
    // template is what the retype asks — it always does.
    it("reads the links off a template, including one the re-read node is missing", () => {
        const template = {
            workflow: { codedata: {} },
            input: { codedata: { dependentProperty: "workflow" } },
            type: { codedata: { dependentProperty: "workflow" } },
            variable: { codedata: {} },
        } as any;

        expect(dependentKeysFromTemplate(template, "workflow")).toEqual(["input", "type"]);
        expect(dependentKeysFromTemplate(template, "input")).toEqual([]);
        expect(dependentKeysFromTemplate(undefined as any, "workflow")).toEqual([]);
    });

    it("takes type, placeholder and doc from the new template while keeping what was typed", () => {
        const template = {
            input: {
                metadata: { description: "The claim to audit" },
                placeholder: "{}",
                types: [{ fieldType: "EXPRESSION", ballerinaType: "ClaimInput", selected: true }],
                value: "",
            },
            type: { types: [{ fieldType: "TYPE" }], value: "string" },
        } as any;

        const retyped = retypeFieldsFromTemplate(fields, ["input", "type"], template);

        expect(retyped[1]).toMatchObject({
            value: "claimId", placeholder: "{}", documentation: "The claim to audit",
            types: [{ ballerinaType: "ClaimInput" }],
        });
        // A fresh copy: editing the retyped field must not reach back into the template.
        expect(retyped[1].types).not.toBe((template as any).input.types);
        // A default the template carries is the new choice's own and replaces the old.
        expect(retyped[2].value).toBe("string");
        expect(retyped[0]).toBe(fields[0]);
    });

    it("asks for a template only where a dropdown holds a workflow", () => {
        expect(["WORKFLOW_RUN", "CHILD_WORKFLOW_RUN", "CHILD_WORKFLOW_CALL"].every(picksWorkflow)).toBe(true);
        // A model provider's dropdown holds a model name, not a symbol to fetch a template for.
        expect(picksWorkflow("AGENT_CALL")).toBe(false);
        expect(picksWorkflow("CHILD_WORKFLOW_WAIT")).toBe(false);
        expect(picksWorkflow(undefined)).toBe(false);
    });

    it("survives a template property that carries no types", () => {
        const bare = [field("workflow"), field("input", { codedata: { dependentProperty: "workflow" } })];

        expect(() => retypeFieldsFromTemplate(bare, ["input"], { input: { placeholder: "{}" } } as any)).not.toThrow();
    });

    it("hides a field the new choice has no use for", () => {
        const retyped = retypeFieldsFromTemplate(fields, ["input"], {} as any);

        expect(retyped[1]).toMatchObject({ hidden: true, value: "" });
    });
});
