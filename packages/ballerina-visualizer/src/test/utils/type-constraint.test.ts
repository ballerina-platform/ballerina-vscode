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

import type { AvailableNode, Category, InputType, VisibleTypeItem } from "@wso2/ballerina-core";
import {
    getTypedescConstraint, getTypedescType, getUserDefinedTypeNames, isTypedescField, restrictCurrentModuleTypes,
    takesTypedesc
} from "../../utils/type-constraint";

const typeNode = (label: string, moduleRelation?: string): AvailableNode => ({
    metadata: { label, description: "" },
    codedata: { symbol: label, ...(moduleRelation && { data: { moduleRelation } }) },
    enabled: true,
});

const category = (label: string, items: Category["items"]): Category => ({
    metadata: { label, description: "" },
    items,
} as Category);

const visibleType = (label: string, detail: string): VisibleTypeItem => ({
    label,
    insertText: label,
    kind: 22,
    labelDetails: { detail, description: "" },
});

const labels = (categories: Category[]): string[] => categories.flatMap((c) => c.items.flatMap((item) =>
    "codedata" in item ? [(item as AvailableNode).metadata.label] : labels([item as Category])));

describe("type constraint narrowing", () => {
    it("takes the allowed names from the user-defined types only", () => {
        const names = getUserDefinedTypeNames([
            visibleType("Person", "User-Defined"),
            visibleType("record", "Structural Types"),
            visibleType("Order", "Used Variable Types"),
        ]);
        expect([...names]).toEqual(["Person"]);
    });

    // Search results carry no constraint, so every current-module type must be checked against the allowed set,
    // however deep the module sits in the category tree (a workspace nests packages under the root category).
    it("keeps a current-module type only when the constraint allowed it, at any depth", () => {
        const search = [
            category("Current Integration", [typeNode("Person", "CURRENT_MODULE"), typeNode("Status", "CURRENT_MODULE")]),
            category("Current Workspace", [
                category("app (current integration)", [typeNode("Order", "CURRENT_MODULE"), typeNode("Mode", "CURRENT_MODULE")]),
            ]),
        ];
        const narrowed = restrictCurrentModuleTypes(search, new Set(["Person", "Order"]));
        expect(labels(narrowed)).toEqual(["Person", "Order"]);
    });

    // Types outside the current module cannot be checked here, so they must never be dropped.
    it("never drops a type of another module or library", () => {
        const search = [
            category("Imported Types", [
                category("sql", [typeNode("ParameterizedQuery")]),
                typeNode("Shared", "SAME_PACKAGE_MODULE"),
                typeNode("Remote", "WORKSPACE_PACKAGE_MODULE"),
            ]),
        ];
        expect(labels(restrictCurrentModuleTypes(search, new Set()))).toEqual(["ParameterizedQuery", "Shared", "Remote"]);
    });
});

describe("typedesc constraint", () => {
    // The type editor the language server marks with the typedesc, then the expression mode; the mark alone decides.
    const typedesc = (constraint?: string, withExpression = false): InputType[] => {
        const signature = `typedesc<${constraint ?? "any|error"}>`;
        return [
            { fieldType: "TYPE", ...(constraint && { ballerinaType: constraint }), typedesc: signature, selected: true },
            ...(withExpression ? [{ fieldType: "EXPRESSION", ballerinaType: signature, selected: false } as InputType] : []),
        ];
    };

    it("marks every typedesc field, with or without its expression mode", () => {
        [typedesc("anydata"), typedesc("anydata", true), typedesc(), typedesc(undefined, true)]
            .forEach((types) => expect(isTypedescField(types)).toBe(true));
    });

    it("states the typedesc the field stands for", () => {
        expect(getTypedescType(typedesc("record {|anydata...;|}"))).toBe("typedesc<record {|anydata...;|}>");
        expect(getTypedescType(typedesc())).toBe("typedesc<any|error>");
    });

    it("is the type a typedesc field's type has to belong to", () => {
        expect(getTypedescConstraint(typedesc("record {|anydata...;|}"))).toBe("record {|anydata...;|}");
    });

    it("is absent for a typedesc that takes any type", () => {
        expect(getTypedescConstraint(typedesc())).toBeUndefined();
    });

    // Other type fields state a type too, but the search was never narrowed for them: a node's own type, the data
    // mapper's json type and a type to infer must keep every type of the module.
    it.each<[string, InputType[]]>([
        ["a node's own type", [{ fieldType: "TYPE", selected: true }]],
        ["a data mapper type", [{ fieldType: "TYPE", ballerinaType: "json", selected: true }]],
        ["a type to infer", [{ fieldType: "TYPE", ballerinaType: "anydata", selected: true }]],
        ["no types", []],
        // A typedesc expression mode on its own is not the mark: only the type editor carries it.
        ["an expression of a typedesc", [{ fieldType: "EXPRESSION", ballerinaType: "typedesc<anydata>", selected: true }]],
    ])("is absent for %s", (_name, types) => {
        expect(getTypedescConstraint(types)).toBeUndefined();
        expect(isTypedescField(types)).toBe(false);
        expect(takesTypedesc(types)).toBe(false);
    });

    // A list of typedescs (a SQL call's row types) is no typedesc field itself, but each element is one.
    it("takes a typedesc, alone or as the elements of a list", () => {
        const list = [{
            fieldType: "REPEATABLE_LIST",
            ballerinaType: "typedesc<record {|anydata...;|}>[]",
            template: { types: typedesc("record {|anydata...;|}", true) },
            selected: true,
        } as InputType];
        expect(takesTypedesc(typedesc("anydata", true))).toBe(true);
        expect(takesTypedesc(list)).toBe(true);
        expect(isTypedescField(list)).toBe(false);
    });
});
