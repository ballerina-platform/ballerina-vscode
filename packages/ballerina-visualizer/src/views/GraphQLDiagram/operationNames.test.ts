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

// L1 (contract) — the operation form rejects a name a sibling of the same kind already uses
// (wso2/product-integrator#382), following Ballerina's own rule: resource methods clash only with the
// same accessor, while remote and other methods share one namespace. A query and a mutation may share a
// name (wso2/product-integrator#355).

import { FunctionModel, InputType } from "@wso2/ballerina-core";
import { getTakenOperationNames, withTakenNamesRule } from "./operationNames";

const operation = (kind: FunctionModel["kind"], name: string, line?: number, accessor?: string): FunctionModel => ({
    kind,
    name: { value: name },
    ...(accessor ? { accessor: { value: accessor } } : {}),
    ...(line !== undefined
        ? { codedata: { lineRange: { fileName: "main.bal", startLine: { line, offset: 4 }, endLine: { line: line + 2, offset: 5 } } } }
        : {}),
} as FunctionModel);

const service = [
    operation("QUERY", "item", 5),
    operation("QUERY", "books", 8),
    operation("MUTATION", "addItem", 11),
    operation("SUBSCRIPTION", "items", 14),
];

describe("getTakenOperationNames", () => {
    it("takes the names of operations of the same kind", () => {
        expect(getTakenOperationNames(operation("QUERY", ""), service)).toEqual(["item", "books"]);
        expect(getTakenOperationNames(operation("MUTATION", ""), service)).toEqual(["addItem"]);
        expect(getTakenOperationNames(operation("SUBSCRIPTION", ""), service)).toEqual(["items"]);
    });

    it("lets a query and a mutation share a name", () => {
        expect(getTakenOperationNames(operation("MUTATION", ""), service)).not.toContain("item");
    });

    it("skips the operation being edited, whether it is the same object or a copy", () => {
        expect(getTakenOperationNames(service[0], service)).toEqual(["books"]);
        expect(getTakenOperationNames({ ...service[0] }, service)).toEqual(["books"]);
    });

    it("matches a resource by its accessor, so a query clashes with a get resource", () => {
        const fields = [operation("RESOURCE", "name", 3, "get"), operation("RESOURCE", "updates", 6, "subscribe")];
        expect(getTakenOperationNames(operation("QUERY", ""), fields)).toEqual(["name"]);
        expect(getTakenOperationNames(operation("SUBSCRIPTION", ""), fields)).toEqual(["updates"]);
    });

    it("puts remote and other methods in one namespace", () => {
        const methods = [operation("REMOTE", "send", 3), operation("DEFAULT", "helper", 6)];
        expect(getTakenOperationNames(operation("DEFAULT", ""), methods)).toEqual(["send", "helper"]);
    });

    it("takes a quoted name as its plain name", () => {
        expect(getTakenOperationNames(operation("QUERY", ""), [operation("QUERY", "'type", 3)])).toEqual(["type"]);
    });

    it("takes nothing without sibling operations", () => {
        expect(getTakenOperationNames(operation("QUERY", "item"))).toEqual([]);
    });
});

describe("withTakenNamesRule", () => {
    const identifier: InputType[] = [{ fieldType: "IDENTIFIER", selected: true }];

    it("adds the rule to the active type member", () => {
        const [type] = withTakenNamesRule(identifier, ["item"], "taken")!;
        expect(type.validations).toEqual([{ rule: "vscode.validate.not.in", args: { values: ["item"] }, message: "taken" }]);
    });

    it("keeps the member's existing rules", () => {
        const types: InputType[] = [{ fieldType: "IDENTIFIER", selected: true, validations: [{ rule: "common.validate.identifier" }] }];
        expect(withTakenNamesRule(types, ["item"], "taken")![0].validations?.map((rule) => rule.rule))
            .toEqual(["common.validate.identifier", "vscode.validate.not.in"]);
    });

    it("leaves the types untouched when no name is taken", () => {
        expect(withTakenNamesRule(identifier, [], "taken")).toBe(identifier);
    });
});
