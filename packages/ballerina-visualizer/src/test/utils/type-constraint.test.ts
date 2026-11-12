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

import type { AvailableNode, Category, VisibleTypeItem } from "@wso2/ballerina-core";
import { getUserDefinedTypeNames, restrictCurrentModuleTypes } from "../../utils/type-constraint";

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
