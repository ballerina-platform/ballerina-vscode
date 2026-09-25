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
import { NodeProperties } from "@wso2/ballerina-core";
import { FormField } from "@wso2/ballerina-side-panel";
import {
    clearHiddenDependentValues, dependentKeys, forgetRetype, picksWorkflow,
    retypeFieldsFromTemplate, shouldRetype,
} from "./dependentFields";

const field = (key: string, extra: Partial<FormField> = {}): FormField => ({
    key, label: key, type: "EXPRESSION", optional: false, editable: true, enabled: true, documentation: "",
    types: [{ fieldType: "EXPRESSION", ballerinaType: "anydata", selected: true }], value: "", ...extra,
});

// `NodeProperties` is a map of `Property`, whose optional members these fixtures fill in part.
const properties = (shape: Record<string, unknown>): NodeProperties => shape as NodeProperties;

describe("deciding whether a reported change is worth a template", () => {
    it("ignores the opening value every field is reported with on the first render", () => {
        // What `initForm` records: the statement declares `auditClaim`.
        const lastSeen: Record<string, unknown> = { workflow: "auditClaim", type: "string" };

        expect(shouldRetype(lastSeen, "workflow", "auditClaim")).toBe(false);
        expect(lastSeen.workflow).toBe("auditClaim");
    });

    it("retypes once a different workflow is chosen, and not again for the same one", () => {
        const lastSeen: Record<string, unknown> = { workflow: "auditClaim" };

        expect(shouldRetype(lastSeen, "workflow", "settleClaim")).toBe(true);
        expect(shouldRetype(lastSeen, "workflow", "settleClaim")).toBe(false);
    });

    it("retypes back when the first choice is picked again", () => {
        const lastSeen: Record<string, unknown> = { workflow: "auditClaim" };

        expect(shouldRetype(lastSeen, "workflow", "settleClaim")).toBe(true);
        expect(shouldRetype(lastSeen, "workflow", "auditClaim")).toBe(true);
    });

    it("ignores a cleared or non-string value", () => {
        const lastSeen: Record<string, unknown> = { workflow: "auditClaim" };

        expect(shouldRetype(lastSeen, "workflow", "")).toBe(false);
        expect(shouldRetype(lastSeen, "workflow", undefined)).toBe(false);
        expect(shouldRetype(lastSeen, "workflow", ["auditClaim"])).toBe(false);
    });
});

describe("forgetting a retype whose template never arrived", () => {
    it("lets the same workflow be picked again after a failed request", () => {
        const lastSeen: Record<string, unknown> = { workflow: "auditClaim" };
        const previous = lastSeen.workflow;

        expect(shouldRetype(lastSeen, "workflow", "settleClaim")).toBe(true);
        forgetRetype(lastSeen, "workflow", "settleClaim", previous);

        expect(lastSeen.workflow).toBe("auditClaim");
        expect(shouldRetype(lastSeen, "workflow", "settleClaim")).toBe(true);
    });

    it("drops the key when there was nothing recorded before the request", () => {
        const lastSeen: Record<string, unknown> = {};
        const previous = lastSeen.workflow;

        expect(shouldRetype(lastSeen, "workflow", "settleClaim")).toBe(true);
        forgetRetype(lastSeen, "workflow", "settleClaim", previous);

        expect("workflow" in lastSeen).toBe(false);
    });

    it("leaves a newer choice alone when a superseded answer comes back", () => {
        const lastSeen: Record<string, unknown> = { workflow: "auditClaim" };
        const firstPrevious = lastSeen.workflow;
        shouldRetype(lastSeen, "workflow", "settleClaim");
        shouldRetype(lastSeen, "workflow", "reopenClaim");

        forgetRetype(lastSeen, "workflow", "settleClaim", firstPrevious);

        expect(lastSeen.workflow).toBe("reopenClaim");
    });
});

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
        const template = properties({
            workflow: { metadata: { label: "Workflow" }, codedata: {} },
            input: { metadata: { label: "Input" }, codedata: { dependentProperty: "workflow" } },
            type: { metadata: { label: "Result Type" }, codedata: { dependentProperty: "workflow" } },
            variable: { metadata: { label: "Variable" }, codedata: {} },
        });

        expect(dependentKeys([], template, "workflow")).toEqual(["input", "type"]);
        expect(dependentKeys([], template, "input")).toEqual([]);
        expect(dependentKeys([], properties({}), "workflow")).toEqual([]);
    });

    // A workflow that declares no input has no `input` property in its template at all, so the
    // template alone can never name the field that has to be hidden.
    it("names a field the new template drops, so the old one does not stay on the form", () => {
        const template = properties({
            workflow: { metadata: { label: "Workflow" }, codedata: {} },
            variable: { metadata: { label: "Variable" }, codedata: {} },
        });

        expect(dependentKeys(fields, template, "workflow")).toEqual(["input", "type"]);

        const retyped = retypeFieldsFromTemplate(fields, dependentKeys(fields, template, "workflow"), template);
        expect(retyped[1]).toMatchObject({ key: "input", hidden: true, value: "" });
    });

    it("names each field once when the template and the form both carry the tag", () => {
        const template = properties({
            input: { metadata: { label: "Input" }, codedata: { dependentProperty: "workflow" } },
        });

        expect(dependentKeys(fields, template, "workflow")).toEqual(["input", "type"]);
    });

    it("takes type, placeholder and doc from the new template while keeping what was typed", () => {
        const inputTypes = [{ fieldType: "EXPRESSION", ballerinaType: "ClaimInput", selected: true }];
        const template = properties({
            input: {
                metadata: { label: "Input", description: "The claim to audit" },
                placeholder: "{}",
                types: inputTypes,
                value: "",
            },
            type: { metadata: { label: "Result Type" }, types: [{ fieldType: "TYPE" }], value: "string" },
        });

        const retyped = retypeFieldsFromTemplate(fields, ["input", "type"], template);

        expect(retyped[1]).toMatchObject({
            value: "claimId", placeholder: "{}", documentation: "The claim to audit",
            types: [{ ballerinaType: "ClaimInput" }],
        });
        // A fresh copy: editing the retyped field must not reach back into the template.
        expect(retyped[1].types).not.toBe(inputTypes);
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

        const bareTemplate = properties({ input: { metadata: { label: "Input" }, placeholder: "{}" } });
        expect(() => retypeFieldsFromTemplate(bare, ["input"], bareTemplate)).not.toThrow();
    });

    // `Form` reports every field as changed on its first render, so a retype that did not compare
    // against the opening value would rewrite a declared result type before anything was typed.
    it("leaves a field alone when the template repeats the value it already holds", () => {
        const template = properties({
            type: { metadata: { label: "Result Type" }, types: [{ fieldType: "TYPE" }], value: "json" },
        });
        const declared = [field("type", { codedata: { dependentProperty: "workflow" }, value: "string" })];

        // Nothing selected a new workflow, so no retype runs and the declared type stands.
        expect(dependentKeys([], properties({}), "workflow")).toEqual([]);
        // And when one does run, the template's own value is what the new choice returns.
        expect(retypeFieldsFromTemplate(declared, ["type"], template)[0].value).toBe("json");
    });

    it("hides a field the new choice has no use for", () => {
        const retyped = retypeFieldsFromTemplate(fields, ["input"], properties({}));

        expect(retyped[1]).toMatchObject({ hidden: true, value: "" });
    });
});

describe("clearing what a hidden dependent field still holds", () => {
    // Form preserves every non-empty value it holds when the fields change, and the source builders
    // write any property that is not blank — so hiding the field is not enough to stop it emitting.
    it("blanks a dependent field the retype hid", () => {
        const fields = [
            field("workflow", { value: "noInputWf" }),
            field("input", { codedata: { dependentProperty: "workflow" }, hidden: true, value: "" }),
        ];

        const cleared = clearHiddenDependentValues({ workflow: "noInputWf", input: "claimId" }, fields);

        expect(cleared).toEqual({ workflow: "noInputWf", input: "" });
    });

    it("leaves a visible dependent field and an unrelated hidden one alone", () => {
        const fields = [
            field("input", { codedata: { dependentProperty: "workflow" }, value: "" }),
            field("connection", { hidden: true }),
        ];
        const values = { input: "claimId", connection: "self" };

        expect(clearHiddenDependentValues(values, fields)).toBe(values);
    });
});
