/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
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

import { Category, AvailableNode, BallerinaProjectComponents } from "@wso2/ballerina-core";
import type { Category as PanelCategory, Item as PanelItem } from "@wso2/ballerina-side-panel";
import { URI, Utils } from "vscode-uri";

// Filter out connections where name starts with _ and module is "ai" or "ai.agent"
export const filterConnections = (categories: Category[]): Category[] => {
    return categories.map((category) => {
        if (category.metadata.label === "Connections") {
            const filteredItems = category.items.filter((item) => {
                if ("metadata" in item && "items" in item && item.items.length > 0 && "codedata" in item.items.at(0)) {
                    const name = item.metadata.label || "";
                    const module = (item.items.at(0) as AvailableNode)?.codedata.module || "";

                    // Filter out items where name starts with _ and module is "ai" or "ai.agent"
                    return !(name.startsWith("_") && (module === "ai" || module === "ai.agent"));
                }
                return true;
            });

            return {
                ...category,
                items: filteredItems,
            };
        }
        return category;
    });
};

export const transformCategories = (categories: Category[]): Category[] => {
    // First filter connections
    let filteredCategories = filterConnections(categories);

    // filter out some categories that are not supported in the diagram
    // TODO: these categories should be supported in the future
    const notSupportedCategories = [
        "PARALLEL_FLOW",
        "START",
        "TRANSACTION",
        "COMMIT",
        "ROLLBACK",
        "RETRY"
    ];

    filteredCategories = filteredCategories.map((category) => ({
        ...category,
        items: category?.items?.filter(
            (item) => !("codedata" in item) || !notSupportedCategories.includes((item as AvailableNode).codedata?.node)
        ),
    })) as Category[];

    // remove agents from categories
    filteredCategories = filteredCategories.filter((category) => category.metadata.label !== "Agents");

    return filteredCategories;
};

// Filters cached categories client-side, recursing into nested items so a matching child keeps its parent group.
export const filterCategoriesLocally = (categories: any[], searchText: string): any[] => {
    if (!searchText.trim()) return categories;

    const lowerSearchText = searchText.toLowerCase();

    // A node is found by its label, the method it stands for, or a search-only keyword such as
    // the name it used to have. Descriptions stay out: nearly every one contains "workflow".
    const itemMatchesSearch = (item: any): boolean => {
        const terms: string[] = [item.title || item.label, item.method, ...(item.keywords ?? [])];
        return terms.some((term) => typeof term === "string" && term.toLowerCase().includes(lowerSearchText));
    };

    const filterItemsRecursively = (items: any[]): any[] => {
        if (!items) return [];

        return items.map((item: any) => {
            if (itemMatchesSearch(item)) {
                return item;
            }
            // If this item has nested items (subcategory), recursively filter them
            if (item.items && Array.isArray(item.items)) {
                const filteredSubItems = filterItemsRecursively(item.items);

                // Include this subcategory if it matches OR has matching nested items
                if (filteredSubItems.length > 0) {
                    return {
                        ...item,
                        items: filteredSubItems
                    };
                }
                return null; // Filter out this subcategory
            }
            return null;
        }).filter(item => item !== null);
    };

    return categories.map(category => ({
        ...category,
        items: filterItemsRecursively(category.items || [])
    })).filter(category => category.items && category.items.length > 0);
};

// Identifies a panel item when merging categories. A node's id is its node kind, which every function or connector
// shares, so nodes are told apart by their codedata.
export const getPanelItemKey = (item: PanelItem): string => {
    if (!("id" in item)) {
        return `category:${item.title}`;
    }
    const codedata = item.metadata?.codedata;
    return codedata
        ? `node:${item.id}:${codedata.org}:${codedata.module}:${codedata.object}:${codedata.symbol}`
        : `node:${item.id}:${item.label}`;
};

// Merges panel items: subcategories that share a title are merged recursively, and nodes already present are dropped.
const mergePanelItems = (prev: PanelItem[], next: PanelItem[]): PanelItem[] => {
    const merged = [...prev];
    const nodeKeys = new Set(prev.filter((item) => "id" in item).map(getPanelItemKey));
    for (const item of next) {
        if ("id" in item) {
            const key = getPanelItemKey(item);
            if (!nodeKeys.has(key)) {
                nodeKeys.add(key);
                merged.push(item);
            }
            continue;
        }
        const index = merged.findIndex((existing) => !("id" in existing) && existing.title === item.title);
        if (index < 0) {
            merged.push(item);
            continue;
        }
        const existing = merged[index] as PanelCategory;
        merged[index] = { ...existing, items: mergePanelItems(existing.items ?? [], item.items ?? []) };
    }
    return merged;
};

// Merges categories into the given ones, keeping each category at its first position. Used both to combine the
// master search results and to add a "Show more" page to the categories already shown.
export const mergePanelCategories = (prev: PanelCategory[], next: PanelCategory[]): PanelCategory[] =>
    mergePanelItems(prev, next) as PanelCategory[];

// Builds the master search panel. Only the static panel nodes are filtered by label: the language server has already
// matched its results on name, description and package, the same way the function and connection searches do, so
// filtering them again by label would drop valid results.
export const buildMasterSearchCategories = (
    staticCategories: PanelCategory[],
    searchCategories: PanelCategory[],
    searchText: string
): PanelCategory[] =>
    mergePanelCategories([], [
        ...filterCategoriesLocally(staticCategories, searchText),
        ...searchCategories.filter((category) => category.items?.length > 0),
    ]);

export const findFunctionByName = (components: BallerinaProjectComponents, functionName: string) => {
    for (const pkg of components.packages) {
        for (const module of pkg.modules) {
            const foundFunction = module.functions.find((func: any) => func.name === functionName);
            if (foundFunction) {
                const pkgUri = URI.parse(pkg.filePath);
                const joinedUri = Utils.joinPath(pkgUri, foundFunction.filePath);
                foundFunction.filePath = joinedUri.fsPath;
                return foundFunction;
            }
        }
    }
    return null;
};

export const getNodeTemplateForConnection = async (
    nodeId: string,
    metadata: any,
    targetRef: any,
    modelFileName: string | undefined,
    rpcClient: any
) => {
    const { node } = metadata as { node: AvailableNode };

    const response = await rpcClient
        .getBIDiagramRpcClient()
        .getNodeTemplate({
            position: targetRef?.startLine || { line: 0, offset: 0 },
            filePath: modelFileName,
            id: node.codedata,
        });

    const flowNode = response.flowNode;
    flowNode.metadata = {
        ...node.metadata,
        description: flowNode?.metadata?.description || node?.metadata?.description,
    };

    let connectionKind: string;
    switch (nodeId) {
        case "MODEL_PROVIDER":
        case "CLASS_INIT":
            connectionKind = 'MODEL_PROVIDER';
            break;
        default:
            connectionKind = nodeId;
    }

    return { flowNode, connectionKind };
};
