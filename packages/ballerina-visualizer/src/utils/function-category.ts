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

import type { AvailableNode, Category, CodeData, FunctionKind } from "@wso2/ballerina-core";
import type { Category as PanelCategory } from "@wso2/ballerina-side-panel";

export const CURRENT_INTEGRATION_CATEGORY_TITLE = "Current Integration";

const CURRENT_INTEGRATION_CATEGORY_ALIASES = new Set([
    CURRENT_INTEGRATION_CATEGORY_TITLE,
    "Project",
    "Current Project",
    "Workflows",
    "Activities",
]);

export function normalizeFunctionSearchCategories(categories: Category[]): Category[] {
    return categories.map(normalizeFunctionSearchCategory);
}

function normalizeFunctionSearchCategory(category: Category): Category {
    if (!category || !Array.isArray(category.items)) {
        return category;
    }
    const originalLabel = category?.metadata?.label;
    const label = CURRENT_INTEGRATION_CATEGORY_ALIASES.has(originalLabel)
        ? CURRENT_INTEGRATION_CATEGORY_TITLE
        : originalLabel;
    return {
        ...category,
        metadata: {
            ...category.metadata,
            label,
        },
        items: category.items.map((item) => {
            if (!item || "codedata" in item || !("items" in item)) {
                return item;
            }
            return normalizeFunctionSearchCategory(item as Category);
        }),
    };
}

export function findCurrentIntegrationCategory(categories: PanelCategory[]): PanelCategory | undefined {
    for (const category of categories) {
        if (category.title === CURRENT_INTEGRATION_CATEGORY_TITLE
                || category.title.endsWith(`(${CURRENT_INTEGRATION_CATEGORY_TITLE})`)) {
            return category;
        }
        const childCategories = category.items.filter(
            (item): item is PanelCategory => "items" in item
        );
        const currentIntegration = findCurrentIntegrationCategory(childCategories);
        if (currentIntegration) {
            return currentIntegration;
        }
    }
    return undefined;
}

export function getItemKind(codedata: CodeData | undefined, fallback: FunctionKind): FunctionKind {
    const relation = codedata?.data?.moduleRelation;
    if (relation === "CURRENT_MODULE") {
        return "CURRENT";
    }
    if (relation === "SAME_PACKAGE_MODULE" || relation === "WORKSPACE_PACKAGE_MODULE") {
        return "IMPORTED";
    }
    return fallback;
}

export function getHelperCategoryPath(parents: string[], category: Category): string[] {
    const containsModuleItems = category.items.some((item) =>
        "codedata" in item && Boolean((item as AvailableNode).codedata?.data?.moduleKind)
    );
    return containsModuleItems ? [category.metadata.label] : [...parents, category.metadata.label];
}

export function buildHelperCategory<TItem, TSubCategory, TCategory>(
    category: Category,
    fallback: FunctionKind,
    mapItem: (item: AvailableNode, fallback: FunctionKind) => TItem,
    createSubCategory: (label: string, items: TItem[]) => TSubCategory,
    createCategory: (
        label: string,
        items: TItem[] | undefined,
        subCategories: TSubCategory[] | undefined
    ) => TCategory,
    includeCategory: (category: Category) => boolean = () => true
): TCategory {
    const items = mapHelperItems(category.items, fallback, mapItem);
    const subCategories = flattenHelperCategories(
        category, fallback, mapItem, createSubCategory, includeCategory
    );
    if (items.length && subCategories.length) {
        subCategories.unshift(createSubCategory(moduleLabel(category.items, category.metadata.label), items));
    }
    return createCategory(
        category.metadata.label,
        items.length && !subCategories.length ? items : undefined,
        subCategories.length ? subCategories : undefined
    );
}

function flattenHelperCategories<TItem, TSubCategory>(
    category: Category,
    fallback: FunctionKind,
    mapItem: (item: AvailableNode, fallback: FunctionKind) => TItem,
    createSubCategory: (label: string, items: TItem[]) => TSubCategory,
    includeCategory: (category: Category) => boolean,
    parents: string[] = []
): TSubCategory[] {
    const flattened: TSubCategory[] = [];
    for (const item of category.items) {
        if (!isCategory(item) || !includeCategory(item)) {
            continue;
        }
        const path = getHelperCategoryPath(parents, item);
        const items = mapHelperItems(item.items, fallback, mapItem);
        if (items.length) {
            flattened.push(createSubCategory(path.join(" / "), items));
        }
        flattened.push(...flattenHelperCategories(
            item, fallback, mapItem, createSubCategory, includeCategory, path
        ));
    }
    return flattened;
}

function mapHelperItems<TItem>(
    items: Category["items"],
    fallback: FunctionKind,
    mapItem: (item: AvailableNode, fallback: FunctionKind) => TItem
): TItem[] {
    return items
        .filter((item): item is AvailableNode => !isCategory(item))
        .map((item) => mapItem(item, fallback));
}

function moduleLabel(items: Category["items"], fallback: string): string {
    const currentItem = items.find((item): item is AvailableNode => !isCategory(item));
    return currentItem?.codedata?.module || fallback;
}

function isCategory(item: Category["items"][number]): item is Category {
    return !("codedata" in item);
}
