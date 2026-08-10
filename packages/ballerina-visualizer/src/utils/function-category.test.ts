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

import type { AvailableNode, Category, CodeData } from "@wso2/ballerina-core";
import type {
    Category as PanelCategory,
    HelperPaneCompletionItem,
    HelperPaneFunctionCategory,
} from "@wso2/ballerina-side-panel";
import {
    buildHelperCategory,
    CURRENT_INTEGRATION_CATEGORY_TITLE,
    findCurrentIntegrationCategory,
    getHelperCategoryPath,
    getItemKind,
    normalizeFunctionSearchCategories,
} from "./function-category";

const category = (label: string, items: Category["items"] = [], description = ""): Category => ({
    metadata: { label, description },
    items,
});

const availableNode = (label: string, codedata: CodeData = {}): AvailableNode => ({
    metadata: { label, description: "" },
    codedata,
    enabled: true,
});

const panelCategory = (title: string, items: PanelCategory["items"] = []): PanelCategory => ({
    title,
    description: "",
    items,
});

const buildTestHelperCategory = (input: Category): HelperPaneFunctionCategory => buildHelperCategory<
    HelperPaneCompletionItem,
    HelperPaneFunctionCategory,
    HelperPaneFunctionCategory
>(
    input,
    "AVAILABLE",
    (item) => ({ label: item.metadata.label, insertText: item.metadata.label }),
    (label, items) => ({ label, items }),
    (label, items, subCategory) => ({ label, items, subCategory }),
    (item) => item.metadata.label !== "Agent Tools"
);

describe("normalizeFunctionSearchCategories", () => {
    it("maps integration-specific and legacy labels to the current-integration category", () => {
        const categories = normalizeFunctionSearchCategories([
            category("Workflows", [], "Workflows defined within the current integration"),
        ]);

        expect(categories[0].metadata.label).toBe(CURRENT_INTEGRATION_CATEGORY_TITLE);
        expect(categories[0].metadata.description).toBe("Workflows defined within the current integration");
    });

    it("normalizes aliases recursively without folding workspace categories into the current integration", () => {
        const categories = normalizeFunctionSearchCategories([
            category("Within Project", [category("orders (Current Integration)")]),
        ]);

        expect(categories[0].metadata.label).toBe("Within Project");
        const currentIntegration = categories[0].items[0];
        expect("items" in currentIntegration && currentIntegration.metadata.label)
            .toBe(`orders (${CURRENT_INTEGRATION_CATEGORY_TITLE})`);
    });

    it("leaves unrelated categories unchanged", () => {
        const categories = normalizeFunctionSearchCategories([
            category("Imported Modules"),
        ]);

        expect(categories[0].metadata.label).toBe("Imported Modules");
    });

    it("preserves missing and non-category entries while normalizing valid categories", () => {
        const categoryWithoutItems = { metadata: { label: "Project", description: "" } };
        const nonCategoryItem = { metadata: { label: "Project", description: "" } };
        const malformedCategories = [
            null,
            categoryWithoutItems,
            {
                metadata: { label: "Project", description: "" },
                items: [
                    undefined,
                    nonCategoryItem,
                    category("Activities"),
                ],
            },
        ] as unknown as Category[];
        const categories = normalizeFunctionSearchCategories(malformedCategories);

        expect(categories[0]).toBeNull();
        expect(categories[1]).toBe(categoryWithoutItems);
        expect(categories[2].metadata.label).toBe(CURRENT_INTEGRATION_CATEGORY_TITLE);
        expect(categories[2].items[0]).toBeUndefined();
        expect(categories[2].items[1]).toBe(nonCategoryItem);
        const nestedCategory = categories[2].items[2];
        expect("items" in nestedCategory && nestedCategory.metadata.label)
            .toBe(CURRENT_INTEGRATION_CATEGORY_TITLE);
    });
});

describe("getItemKind", () => {
    it("keeps current-module items unqualified", () => {
        expect(getItemKind({ data: { moduleRelation: "CURRENT_MODULE" } }, "AVAILABLE"))
            .toBe("CURRENT");
    });

    it.each(["SAME_PACKAGE_MODULE", "WORKSPACE_PACKAGE_MODULE"] as const)(
        "uses import semantics for %s items in workspace-local categories",
        (moduleRelation) => {
            expect(getItemKind({ data: { moduleRelation } }, "CURRENT"))
                .toBe("IMPORTED");
        }
    );

    it("preserves category fallback for external items", () => {
        expect(getItemKind(undefined, "AVAILABLE")).toBe("AVAILABLE");
    });

    it("preserves category fallback for an unrecognized module relation", () => {
        expect(getItemKind({ data: { moduleRelation: "FUTURE_MODULE_RELATION" } }, "AVAILABLE"))
            .toBe("AVAILABLE");
    });
});

describe("findCurrentIntegrationCategory", () => {
    it("finds the current integration inside the workspace hierarchy", () => {
        const category = findCurrentIntegrationCategory([
            panelCategory("Imported Modules"),
            panelCategory("Within Project", [
                panelCategory(`orders (${CURRENT_INTEGRATION_CATEGORY_TITLE})`),
            ]),
        ]);

        expect(category?.title).toBe(`orders (${CURRENT_INTEGRATION_CATEGORY_TITLE})`);
    });
});

describe("getHelperCategoryPath", () => {
    it.each([
        ["DEFAULT_MODULE", "edi_parser"],
        ["SUBMODULE", "edi_parser.mINVOIC"],
    ])("collapses the package path for a %s category", (moduleKind, moduleName) => {
        const path = getHelperCategoryPath(["edi_parser"], category(moduleName, [
            availableNode("function", { data: { moduleKind } }),
        ]));

        expect(path).toEqual([moduleName]);
    });

    it("retains parent labels for non-module categories", () => {
        const path = getHelperCategoryPath(["parent"], category("child"));

        expect(path).toEqual(["parent", "child"]);
    });
});

describe("buildHelperCategory", () => {
    it("maps direct and nested items through the shared category traversal", () => {
        const helperCategory = buildTestHelperCategory(category("Within Project", [
            availableNode("directFunction", { module: "orders" }),
            category("orders.helpers", [
                availableNode("helperFunction", { module: "orders.helpers" }),
            ]),
        ]));

        expect(helperCategory).toEqual({
            label: "Within Project",
            items: undefined,
            subCategory: [
                {
                    label: "orders",
                    items: [{ label: "directFunction", insertText: "directFunction" }],
                },
                {
                    label: "orders.helpers",
                    items: [{ label: "helperFunction", insertText: "helperFunction" }],
                },
            ],
        });
    });

    it("omits empty results and filtered Agent Tools categories", () => {
        const helperCategory = buildTestHelperCategory(category("Current Integration", [
            category("Agent Tools", [
                availableNode("toolFunction", { module: "orders" }),
            ]),
        ]));

        expect(helperCategory).toEqual({
            label: "Current Integration",
            items: undefined,
            subCategory: undefined,
        });
    });
});
