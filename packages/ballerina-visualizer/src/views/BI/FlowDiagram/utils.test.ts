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

import type { Category as PanelCategory, Item as PanelItem, Node as PanelNode } from "@wso2/ballerina-side-panel";
import { buildMasterSearchCategories, filterCategoriesLocally, getPanelItemKey, mergePanelCategories } from "./utils";

describe("filterCategoriesLocally", () => {
    const categories: any[] = [
        {
            title: "Model Providers",
            items: [
                { title: "OpenAI GPT-4", items: undefined },
                { title: "Anthropic Claude", items: undefined },
                {
                    title: "Azure OpenAI",
                    items: [
                        { title: "gpt-35-instance-1", items: undefined },
                        { title: "gpt-35-instance-2", items: undefined },
                    ],
                },
            ],
        },
        {
            title: "Vector Stores",
            items: [{ title: "Pinecone Store", items: undefined }],
        },
    ];

    it("returns the categories unchanged for an empty query", () => {
        expect(filterCategoriesLocally(categories, "")).toEqual(categories);
    });

    it("returns the categories unchanged for a whitespace-only query", () => {
        expect(filterCategoriesLocally(categories, "   ")).toEqual(categories);
    });

    it("matches case-insensitively on a top-level item's title", () => {
        const result = filterCategoriesLocally(categories, "anthropic");
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe("Model Providers");
        expect(result[0].items.map((i: any) => i.title)).toEqual(["Anthropic Claude"]);
    });

    it("keeps a nested match's parent group with only the matching child", () => {
        const result = filterCategoriesLocally(categories, "gpt-35-instance-1");
        expect(result).toHaveLength(1);
        const azure = result[0].items.find((i: any) => i.title === "Azure OpenAI");
        expect(azure.items.map((i: any) => i.title)).toEqual(["gpt-35-instance-1"]);
    });

    it("drops a category with no matches anywhere in its subtree", () => {
        const result = filterCategoriesLocally(categories, "pinecone");
        expect(result.map((c: any) => c.title)).toEqual(["Vector Stores"]);
    });

    it("returns no categories for a query that matches nothing", () => {
        expect(filterCategoriesLocally(categories, "does-not-exist")).toEqual([]);
    });

    it("re-filters correctly on a repeated (unchanged) query against the same input", () => {
        const first = filterCategoriesLocally(categories, "azure");
        const second = filterCategoriesLocally(categories, "azure");
        expect(second).toEqual(first);
    });

    it("does not mutate the input categories", () => {
        const before = JSON.parse(JSON.stringify(categories));
        filterCategoriesLocally(categories, "gpt-35-instance-1");
        expect(categories).toEqual(before);
    });
});

const functionNode = (symbol: string, module = "lang.array"): PanelNode => ({
    id: "FUNCTION_CALL",
    label: symbol,
    description: "",
    metadata: { codedata: { org: "ballerina", module, symbol } },
});
const staticNode = (id: string, label: string): PanelNode => ({ id, label, description: "" });
const category = (title: string, items: PanelItem[]): PanelCategory => ({ title, description: "", items });
const labels = (items: PanelItem[]): string[] => items.map((item) => ("id" in item ? item.label : item.title));

describe("mergePanelCategories", () => {
    it("keeps distinct functions that share a node kind", () => {
        const result = mergePanelCategories([], [
            category("Standard Library", [functionNode("push")]),
            category("Standard Library", [functionNode("pop")]),
        ]);
        expect(result).toHaveLength(1);
        expect(labels(result[0].items)).toEqual(["push", "pop"]);
    });

    it("drops an item already present under the same title", () => {
        const result = mergePanelCategories([], [
            category("Standard Library", [functionNode("push")]),
            category("Standard Library", [functionNode("push"), functionNode("pop")]),
        ]);
        expect(labels(result[0].items)).toEqual(["push", "pop"]);
    });

    it("keeps same-named functions from different modules", () => {
        const result = mergePanelCategories([], [
            category("Extended Library", [functionNode("parse", "edifact.d03a.finance")]),
            category("Extended Library", [functionNode("parse", "edifact.d03a.supplychain")]),
        ]);
        expect(result[0].items).toHaveLength(2);
    });

    it("keeps categories in first-seen order", () => {
        const result = mergePanelCategories([], [
            category("Control", []),
            category("Connectors", []),
            category("Control", []),
        ]);
        expect(result.map((c) => c.title)).toEqual(["Control", "Connectors"]);
    });

    it("adds a next page's functions to a module already shown", () => {
        const shown = [category("Standard Library", [category("lang.array", [functionNode("push")])])];
        const nextPage = [category("Standard Library", [category("lang.array", [functionNode("pop")])])];

        const result = mergePanelCategories(shown, nextPage);

        expect(result[0].items).toHaveLength(1);
        expect(labels((result[0].items[0] as PanelCategory).items)).toEqual(["push", "pop"]);
    });

    it("does not mutate the categories already shown", () => {
        const shown = [category("Standard Library", [functionNode("push")])];
        mergePanelCategories(shown, [category("Standard Library", [functionNode("pop")])]);
        expect(labels(shown[0].items)).toEqual(["push"]);
    });
});

describe("buildMasterSearchCategories", () => {
    const staticCategories = [category("Flow", [staticNode("IF", "If"), staticNode("MATCH", "Match")])];
    const leafKeys = (items: PanelItem[]): string[] =>
        items.flatMap((item) => ("id" in item ? [getPanelItemKey(item)] : leafKeys(item.items)));

    // The LS matches on name, description and package, so none of these labels contains its query.
    // The queries follow the master search fixtures in the LS tests (search/config/all).
    it.each([
        {
            name: "a connector matched on its package",
            query: "azure.storage",
            search: [category("Connectors", [
                { ...functionNode("FileClient", "storage.files"), id: "NEW_CONNECTION", label: "Files File" },
            ])],
        },
        {
            name: "extended library functions grouped by module",
            query: "parse",
            search: [category("Extended Library", [
                category("edifact.d03a.finance", [functionNode("fromEdiString", "edifact.d03a.finance")]),
                category("edifact.d03a.supplychain", [functionNode("fromEdiString", "edifact.d03a.supplychain")]),
            ])],
        },
        {
            name: "imported functions matched on their description",
            query: "utc",
            search: [category("Imported Functions", [
                functionNode("now", "time"),
                functionNode("civilFromString", "time"),
            ])],
        },
        {
            name: "results in several categories",
            query: "log",
            search: [
                category("Standard Library", [functionNode("printInfo", "log")]),
                category("Connectors", [
                    { ...functionNode("Client", "elastic.elasticcloud"), id: "NEW_CONNECTION", label: "Elastic Cloud" },
                ]),
            ],
        },
        {
            name: "a query of special characters",
            query: "@#$%",
            search: [category("Standard Library", [functionNode("encode", "url")])],
        },
    ])("keeps every search result for $name", ({ query, search }) => {
        const result = buildMasterSearchCategories(staticCategories, search, query);
        expect(leafKeys(result)).toEqual(leafKeys(search));
    });

    it("filters the static panel nodes by label", () => {
        const result = buildMasterSearchCategories(staticCategories, [], "if");
        expect(labels(result[0].items)).toEqual(["If"]);
    });

    it("drops empty search categories", () => {
        const result = buildMasterSearchCategories(staticCategories, [category("Imported Functions", [])], "if");
        expect(result.map((c) => c.title)).toEqual(["Flow"]);
    });
});

describe("getPanelItemKey", () => {
    it("keys a subcategory by its title", () => {
        expect(getPanelItemKey(category("Azure", []))).toBe("category:Azure");
    });

    it("keys a node without codedata by its kind and label", () => {
        expect(getPanelItemKey(staticNode("IF", "If"))).toBe("node:IF:If");
    });
});
