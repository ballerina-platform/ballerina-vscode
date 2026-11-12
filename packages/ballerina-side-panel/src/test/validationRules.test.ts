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

    // Keywords are quoted and special characters escaped by the language server when it writes the source
    it.each(["function", "chat/service", "/listener", "/issues-memox", "/issues\\-memox", "v1.0/a@b"])(
        "accepts %s, which the language server escapes",
        (path) => {
            expect(run(rule, path)).toBeUndefined();
        }
    );

    // A segment of only escapes is empty once written, and a quoted path cannot hold another quote
    it.each(["/chat rooms", "chat//rooms", "chat/", "chat/\\", "\"/foo\"bar\"", "/foo\"bar"])("rejects %s", (path) => {
        expect(run(rule, path)).toBeDefined();
    });
});

describe("vscode.validate.resource.path path params", () => {
    it.each([
        "rooms/[string id]", "files/[string... rest]", "files/[string ... rest]", "orders/[int id]/line-items",
        "items/[int|string id]", "\"/quoted\"",
    ])("accepts %s", (path) => {
        expect(run("vscode.validate.resource.path", path)).toBeUndefined();
    });

    it.each(["rooms/[id]", "rooms/[string id", "rooms/[a b c]", "rooms/[int[ id]", "rooms/[int i[d]"])("rejects %s", (path) => {
        expect(run("vscode.validate.resource.path", path)).toBeDefined();
    });
});

describe("graphql.validate.name", () => {
    it.each(["name", "_id", "type"])("accepts %s", (name) => {
        expect(run("graphql.validate.name", name)).toBeUndefined();
    });

    it.each(["issue-number", "1st", "a.b"])("rejects %s", (name) => {
        expect(run("graphql.validate.name", name)).toBeDefined();
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

    it.each(["type", "'type"])("rejects %s when the taken name is quoted", (name) => {
        expect(runNotIn(name, { values: [" 'type "] })).toBeDefined();
    });

    // The model has the name in source form; the field shows and takes it plain
    it.each(["issue-number", "issue\\-number"])("rejects %s when the taken name is escaped", (name) => {
        expect(runNotIn(name, { values: ["issue\\-number"] })).toBeDefined();
    });

    it.each(["a/issue-memox", "a/issue\\-memox/[string id]"])("rejects the path %s over its escaped form", (path) => {
        expect(runNotIn(path, { values: ["a/issue\\-memox", "a/issue\\-memox/[int key]"] })).toBeDefined();
    });

    // Ballerina tells resource path params apart by position, not by name or type (#992).
    it.each(["a/[string email]", "a/[int key]", "a/[string id]"])("rejects the path %s over a taken path param", (path) => {
        expect(runNotIn(path, { values: ["a/[string id]"] })).toBeDefined();
    });

    it.each(["a/[string... rest]", "a/b", "a/[string id]/b"])("accepts the path %s next to a single path param", (path) => {
        expect(runNotIn(path, { values: ["a/[string id]"] })).toBeUndefined();
    });

    it("rejects a rest param over a taken rest param", () => {
        expect(runNotIn("a/[int... ids]", { values: ["a/[string... rest]"] })).toBeDefined();
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
