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
import { CLIENT_VALIDATION_RULES } from "../components/Form/validationRules";

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

    it.each(["rooms/[id]", "rooms/[string id", "rooms/[a b c]"])("rejects %s", (path) => {
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
