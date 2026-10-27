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

import { FormField } from "../components/Form/types";
import { buildValidate, CLIENT_VALIDATION_RULES } from "../components/Form/validationRules";

const field = {} as FormField;
const run = (rule: string, value: string) => CLIENT_VALIDATION_RULES[rule](value, {}, field, {});

describe.each(["common.validate.service.path", "vscode.validate.resource.path"])("%s", (rule) => {
    it.each(["/chat", "chat/rooms", "'function", "chat/'service"])("accepts %s", (path) => {
        expect(run(rule, path)).toBeUndefined();
    });

    it.each(["function", "chat/service", "/listener", "class", "a/foreach"])("rejects the bare reserved word in %s", (path) => {
        expect(run(rule, path)).toBeDefined();
    });
});

describe("vscode.validate.not.in", () => {
    const taken = { values: ["item", "books"] };
    const runNotIn = (value: string, args: Record<string, unknown> = taken) =>
        CLIENT_VALIDATION_RULES["vscode.validate.not.in"](value, args, field, {});

    it.each(["item", " item ", "'item", "books"])("rejects the taken name %s", (name) => {
        expect(runNotIn(name)).toBeDefined();
    });

    it.each(["items", "Item", "author", ""])("accepts %s", (name) => {
        expect(runNotIn(name)).toBeUndefined();
    });

    it("accepts anything when no names are taken", () => {
        expect(runNotIn("item", {})).toBeUndefined();
    });

    it("reports the field's own message with the name filled in", () => {
        const nameField: FormField = {
            key: "name",
            label: "Field Name",
            type: "IDENTIFIER",
            optional: false,
            editable: true,
            enabled: true,
            documentation: "",
            value: "",
            types: [{
                fieldType: "IDENTIFIER",
                selected: true,
                validations: [{ rule: "vscode.validate.not.in", args: taken, message: "A field named '{value}' already exists" }],
            }],
        };
        const [validate] = Object.values(buildValidate(nameField));
        expect(validate("item")).toBe("A field named 'item' already exists");
        expect(validate("author")).toBe(true);
    });
});
