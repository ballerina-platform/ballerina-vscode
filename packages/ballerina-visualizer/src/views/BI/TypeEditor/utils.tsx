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

import { Category, VisibleTypeItem, GeneralPayloadContext, Protocol, FunctionKind } from '@wso2/ballerina-core';
import type { TypeHelperCategory, TypeHelperItem, TypeHelperOperator } from '@wso2/type-editor';
import { COMPLETION_ITEM_KIND, convertCompletionItemKind } from '@wso2/ui-toolkit';
import { getFunctionItemKind, isDMSupportedType } from '../../../utils/bi';
import { buildHelperCategory, getItemKind } from '../../../utils/function-category';

// TODO: Remove this order onces the LS is fixed
const TYPE_CATEGORY_ORDER = [
    { label: "User-Defined", sortText: "0" },
    { label: "Primitive Types", sortText: "1" },
    { label: "Data Types", sortText: "2" },
    { label: "Structural Types", sortText: "3" },
    { label: "Error Types", sortText: "4" },
    { label: "Behaviour Types", sortText: "5" },
    { label: "Other Types", sortText: "6" },
    { label: "Used Variable Types", sortText: "7" },

    // GraphQL Specific
    { label: "Scalar Types", sortText: "1" },
    { label: "Enum Types", sortText: "2" },
] as const;

/**
 * Get the categories for the type editor
 *
 * @param types - The types to get the categories for
 * @param filterDMTypes - Whether to filter the types for the data mapper
 * @returns The categories for the type editor
 */
export const getTypes = (types: VisibleTypeItem[], filterDMTypes?: boolean, payloadContext?: GeneralPayloadContext): TypeHelperCategory[] => {
    const categoryRecord: Record<string, TypeHelperItem[]> = {};

    for (const type of types) {
        if (!type) {
            continue;
        }

        // If types should be filtered for the data mapper
        if (filterDMTypes && !isDMSupportedType(type)) {
            continue;
        }

        // Skip User-Defined types since they will again fetched 
        // from search API align with other integrations types
        if (type.labelDetails?.detail === "User-Defined") {
            continue;
        }

        if (!categoryRecord[type.labelDetails.detail]) {
            categoryRecord[type.labelDetails.detail] = [];
        }
        categoryRecord[type.labelDetails.detail].push({
            name: type.label,
            insertText: type.insertText,
            type: convertCompletionItemKind(type.kind),
            labelDetails: type.labelDetails
        });
    }

    let categories = Object.entries(categoryRecord).map(([category, items]) => ({
        category,
        sortText: TYPE_CATEGORY_ORDER.find((order) => order.label === category)?.sortText,
        items
    }));

    if (payloadContext?.protocol === Protocol.FTP || payloadContext?.protocol === Protocol.CDC) {

        categories = categories
            .filter((category) => category.category === "User-Defined")
            .map((category) => ({
                ...category,
                items: category.items.filter((item) => item.labelDetails?.description === "Record")
            }))
            .filter((category) => category.items.length > 0);

    }
    return categories.sort((a, b) => (a.sortText ?? "z").localeCompare(b.sortText ?? "z"));;
};

export const filterTypes = (types: TypeHelperCategory[], searchText: string) => {
    const filteredTypes = [];

    for (const category of types) {
        const filteredItems = category.items.filter((item) =>
            item.name.toLowerCase().includes(searchText.toLowerCase())
        );
        if (filteredItems.length > 0) {
            filteredTypes.push({ ...category, items: filteredItems });
        }
    }

    return filteredTypes;
};

export const filterOperators = (operators: TypeHelperOperator[], searchText: string) => {
    return operators.filter((operator) => operator.name.toLowerCase().includes(searchText.toLowerCase()));
};

export const transformTypesFromSearchToHelperCategory = (types: Category[]): TypeHelperCategory[] => {
    return types.map((category) =>
        toTypeHelperCategory(category, getFunctionItemKind(category.metadata.label), false)
    );
}

export const getFilteredTypesByKind = (types: Category[], kinds: FunctionKind[]) => {
    const categories: TypeHelperCategory[] = [];

    for (const category of types) {
        if (category.items.length === 0) {
            continue;
        }

        const categoryKind = getFunctionItemKind(category.metadata.label);
        if (!kinds.includes(categoryKind)) {
            continue;
        }
        categories.push(toTypeHelperCategory(category, categoryKind, true));
    }

    return categories;
};

export const getTypeBrowserTypes = (types: Category[]) => {
    const categories: TypeHelperCategory[] = [];

    for (const category of types) {
        if (category.items.length === 0) {
            continue;
        }

        const categoryKind = getFunctionItemKind(category.metadata.label);
        categories.push(toTypeHelperCategory(category, categoryKind, false));
    }

    return categories;
};

function toTypeHelperCategory(
    category: Category,
    fallback: FunctionKind,
    includeLabelDetails: boolean
): TypeHelperCategory {
    return buildHelperCategory<TypeHelperItem, TypeHelperCategory, TypeHelperCategory>(
        category,
        fallback,
        (item, itemFallback) => ({
            name: item.metadata.label,
            insertText: item.metadata.label,
            type: COMPLETION_ITEM_KIND.TypeParameter,
            codedata: item.codedata,
            kind: getItemKind(item.codedata, itemFallback),
            ...(includeLabelDetails ? {
                labelDetails: {
                    description: item.codedata.node,
                    detail: "",
                },
            } : {}),
        }),
        (categoryLabel, items) => ({ category: categoryLabel, items }),
        (categoryLabel, items, subCategory) => ({
            category: categoryLabel,
            items,
            subCategory,
        })
    );
}
