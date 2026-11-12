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

// The detail the language server gives the current module's own types in a visible-types response.
const USER_DEFINED_TYPE_DETAIL = "User-Defined";

/**
 * The names of the current module's types a visible-types response lists. Asked with a type constraint, the language
 * server lists only the types that belong to it.
 */
export function getUserDefinedTypeNames(visibleTypes: VisibleTypeItem[]): Set<string> {
    return new Set(
        visibleTypes
            .filter((type) => type?.labelDetails?.detail === USER_DEFINED_TYPE_DETAIL)
            .map((type) => type.label)
    );
}

/**
 * Narrows a type search to a field's type constraint. The search takes no constraint, so it lists every type of the
 * current module; those are kept only when the constrained visible-types response allowed them. Types of other
 * modules and packages cannot be checked against the constraint here, so they are kept as they are.
 */
export function restrictCurrentModuleTypes(categories: Category[], allowedNames: Set<string>): Category[] {
    return categories.map((category) => restrictCategory(category, allowedNames));
}

function restrictCategory(category: Category, allowedNames: Set<string>): Category {
    if (!category || !Array.isArray(category.items)) {
        return category;
    }
    const items = category.items
        .filter((item) => {
            if (!item || !("codedata" in item)) {
                return true;
            }
            const node = item as AvailableNode;
            return node.codedata?.data?.moduleRelation !== "CURRENT_MODULE"
                || allowedNames.has(node.metadata?.label);
        })
        .map((item) => (item && !("codedata" in item) && "items" in item
            ? restrictCategory(item as Category, allowedNames)
            : item));
    return { ...category, items };
}
