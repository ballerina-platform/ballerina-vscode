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

import { filterCategoriesLocally } from "./utils";

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
