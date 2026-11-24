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

import { ExpressionProperty, PropertyModel } from "@wso2/ballerina-core";
import { FormField } from "../../Form/types";
import { describeFields, treeFields, writeFields } from "./formFields";

const field = (key: string, fieldType: string, extra: Partial<FormField> = {}): FormField => ({
    key, label: key, type: fieldType, optional: false, editable: true, enabled: true, documentation: "", value: "",
    types: [{ fieldType, selected: true } as FormField["types"][number]], ...extra,
});
const property = (label: string, fieldType: string, value: string, extra: Partial<PropertyModel> = {}) =>
    ({ metadata: { label, description: "" }, types: [{ fieldType, ballerinaType: "int", selected: true }], value, editable: true, enabled: true, ...extra }) as PropertyModel;
const branch = (label: string, enabled: boolean, properties: Record<string, PropertyModel> = {}) =>
    ({ metadata: { label, description: "" }, enabled, types: [{ fieldType: "FORM", selected: true }], properties }) as unknown as PropertyModel;

// The HTTP listener chooser as the service init model gives it to the form.
const listener = field("configureListener", "CHOICE", {
    advanced: true, documentation: "Configure the HTTP listener for the service",
    choices: [
        branch("Shared Listener (Port 9090)", true),
        branch("Custom Listener", false, {
            port: property("Port", "NUMBER", "9090"),
            listenerVarName: property("Listener Name", "IDENTIFIER", "aiListener"),
        }),
    ],
});
const servicePath = field("basePath", "SERVICE_PATH", { value: "/ai-agent" });
const toProperty = (formField: FormField) => ({ types: formField.types, value: formField.value }) as ExpressionProperty;

const writer = (values: Record<string, unknown>) => ({
    getValues: () => values,
    setValue: jest.fn((key: string, value: unknown) => { values[key] = value; }),
});

describe("form fields for the Copilot", () => {
    it("lists the fields of a choice not selected, with the choice they need", () => {
        const tree = treeFields([servicePath, listener]);
        expect(tree.map((entry) => entry.field.key)).toEqual(["basePath", "configureListener", "port", "listenerVarName"]);
        expect(tree[2].when).toEqual([{ path: "configureListener", values: ["Custom Listener"] }]);
    });

    it("offers a choice by its labels and reads the selected one", () => {
        const slots = describeFields(treeFields([listener]), {}, toProperty);
        expect(slots[0].value).toBe("Shared Listener (Port 9090)");
        expect(slots[0].property.types[0]).toMatchObject({ fieldType: "SINGLE_SELECT", options: [{ value: "Shared Listener (Port 9090)" }, { value: "Custom Listener" }] });
        expect(describeFields(treeFields([listener]), { configureListener: 1 }, toProperty)[0].value).toBe("Custom Listener");
        expect(slots[1]).toMatchObject({ path: "port", value: "9090", property: { types: [{ fieldType: "EXPRESSION", ballerinaType: "int" }] } });
    });

    it("switches to the choice a written field needs, then writes it", () => {
        const values: Record<string, unknown> = { configureListener: 0 };
        const form = writer(values);
        expect(writeFields(treeFields([listener]), { port: "9099" }, form)).toEqual(["configureListener", "port"]);
        expect(values).toEqual({ configureListener: 1, port: "9099" });
        expect(form.setValue).toHaveBeenCalledWith("port", "9099", { shouldDirty: true, shouldValidate: true });
    });

    it("writes a choice as its index and a conditional checkbox as a boolean", () => {
        const conditional = field("useAuth", "CONDITIONAL_FIELDS", {
            choices: [branch("on", true, { token: property("Token", "EXPRESSION", "") }), branch("off", false)],
        });
        const values: Record<string, unknown> = { useAuth: false };
        writeFields(treeFields([listener, conditional]), { configureListener: "Custom Listener", token: "apiToken" }, writer(values));
        expect(values).toEqual({ configureListener: 1, useAuth: true, token: "apiToken" });
    });

    it("flattens sections and keeps one field per key, merging branches of the same choice", () => {
        const options = field("existingListener", "DROPDOWN_CHOICE", {
            dynamicFormFields: { a: [field("host", "EXPRESSION")], b: [field("host", "EXPRESSION")] },
        });
        const section = field("settings", "GROUP_SECTION", { advanceProps: [options, field("timeout", "EXPRESSION")] });
        const tree = treeFields([section]);
        expect(tree.map((entry) => entry.field.key)).toEqual(["existingListener", "host", "timeout"]);
        expect(tree[1].when).toEqual([{ path: "existingListener", values: ["a", "b"] }]);
    });

    it("leaves out hidden, disabled and read-only fields and kinds not offered yet", () => {
        const tree = treeFields([
            field("hiddenOne", "EXPRESSION", { hidden: true }),
            field("off", "EXPRESSION", { enabled: false }),
            field("readOnly", "EXPRESSION", { editable: false }),
            field("tools", "MULTIPLE_SELECT"),
            field("kept", "TEXTAREA"),
        ]);
        expect(tree.map((entry) => entry.field.key)).toEqual(["kept"]);
    });
});
