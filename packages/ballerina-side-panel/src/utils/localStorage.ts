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

const EXPANDED_CATEGORIES_KEY = "bi-extension-side-panel";

export interface ExpandedCategoriesState {
    [categoryTitle: string]: boolean;
}

export const getExpandedCategories = (): ExpandedCategoriesState => {
    try {
        const stored = localStorage.getItem(EXPANDED_CATEGORIES_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (error) {
        console.warn("Failed to load expanded categories from localStorage:", error);
        return {};
    }
};

export const setExpandedCategories = (expandedState: ExpandedCategoriesState): void => {
    try {
        localStorage.setItem(EXPANDED_CATEGORIES_KEY, JSON.stringify(expandedState));
    } catch (error) {
        console.warn("Failed to save expanded categories to localStorage:", error);
    }
};

export const getDefaultExpandedState = (categories: string[]): ExpandedCategoriesState => {
    const defaultExpanded: ExpandedCategoriesState = {};

    // Set default expanded categories
    const defaultExpandedCategories = [
        "Statement",
        "Control",
        "Connections",
        "Standard Library",
        "Extended Library",
        "Current Integration",
        "Model Providers",
        "Vector Stores",
        "Embedding Providers",
        "Knowledge Bases",
        "Data Loaders",
        "Chunkers",
    ];

    categories.forEach((category) => {
        defaultExpanded[category] = defaultExpandedCategories.includes(category);
    });

    return defaultExpanded;
};
