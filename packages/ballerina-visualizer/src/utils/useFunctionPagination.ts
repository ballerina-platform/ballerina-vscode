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

import { useCallback, useRef, useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { Category as PanelCategory, HelperPaneFunctionCategory, HelperPaneFunctionInfo } from "@wso2/ballerina-side-panel";
import { BISearchResponse, Category, FunctionPageInfo, FunctionSearchPagination, LineRange } from "@wso2/ballerina-core";
import { convertToHelperPaneFunction } from "./bi";
import { countSectionLeafNodes } from "../views/BI/FlowDiagram/utils";
import { assertFunctionSearchSuccess, FUNCTIONS_PAGE_SIZE, getFunctionSectionPage,
    PAGINATED_LIBRARY_SECTIONS } from "./function-pagination";
import { useFunctionPaginationController } from "./useFunctionPaginationController";

export { FUNCTIONS_PAGE_SIZE, PAGINATED_LIBRARY_SECTIONS } from "./function-pagination";

// The library sections come from Ballerina Central, which rarely changes within a session.
const LIBRARY_SECTION_TTL_MS = 30 * 60 * 1000;
const librarySectionCache = new Map<string, { cachedAt: number; category: PanelCategory; page: FunctionPageInfo }>();

// Builds a panel's first view from a page fetched with excludeLibrary: each library section comes from the cache or
// as a loading placeholder. Seed the controller with `pagination`, then fetch each `pending` section's first page.
export function withLibrarySections(scopePrefix: string, localCategories: PanelCategory[]) {
    // The language server lists imported modules under Imported Functions instead, so the sections differ per imports.
    const scope = `${scopePrefix}|${localCategories.find((category) => category.title === "Imported Functions")?.items
        .map((item) => (item as PanelCategory).title).join()}`;
    const pagination: FunctionSearchPagination = {};
    const pending: string[] = [];
    const sections = PAGINATED_LIBRARY_SECTIONS.map(({ title, org }): PanelCategory => {
        const entry = librarySectionCache.get(`${scope}|${title}`);
        if (entry && Date.now() - entry.cachedAt <= LIBRARY_SECTION_TTL_MS) {
            pagination[org] = entry.page;
            return { ...entry.category, items: [...entry.category.items] };
        }
        pending.push(title);
        return { title, description: "", items: [], isLoading: true };
    });
    const titles = PAGINATED_LIBRARY_SECTIONS.map(({ title }) => title);
    const categories = [...localCategories.filter((category) => !titles.includes(category.title)), ...sections];
    // Takes a pending section's first page and returns the cursor its next page continues from.
    const fillSection = (title: string, response: BISearchResponse, page: PanelCategory[],
        setCategories: (update: (prev: PanelCategory[]) => PanelCategory[]) => void): FunctionPageInfo => {
        const { org } = PAGINATED_LIBRARY_SECTIONS.find((entry) => entry.title === title);
        const section = page.find((category) => category.title === title);
        const cursor = getFunctionSectionPage(response.functionPagination, org, countSectionLeafNodes(page, title),
            FUNCTIONS_PAGE_SIZE);
        setCategories((prev) => settleLibrarySection(prev, title, section));
        if (section?.items.length) {
            librarySectionCache.set(`${scope}|${title}`, { cachedAt: Date.now(), category: section, page: cursor });
        }
        return cursor;
    };
    return { categories, pagination, pending, fillSection };
}

// Swaps a section's placeholder for its loaded page, or drops it when the page failed or came back empty.
export const settleLibrarySection = (categories: PanelCategory[], title: string, section?: PanelCategory) =>
    categories.flatMap((category) => category.title === title && category.isLoading
        ? (section ? [section] : [])
        : [category]);

export const countFunctionItems = (categories: HelperPaneFunctionCategory[] = []): number =>
    categories.reduce((total, category) =>
        total + (category.items?.length ?? 0) + countFunctionItems(category.subCategory), 0);

export const mergeFunctionCategories = (
    prev: HelperPaneFunctionCategory[], next: HelperPaneFunctionCategory[]
): HelperPaneFunctionCategory[] => {
    const merged = prev.map(category => ({ ...category }));
    for (const incoming of next) {
        const existing = merged.find(category => category.label === incoming.label);
        if (!existing) {
            merged.push({ ...incoming });
            continue;
        }
        if (incoming.items?.length) {
            existing.items = [...(existing.items ?? []), ...incoming.items];
        }
        if (incoming.subCategory?.length) {
            existing.subCategory = mergeFunctionCategories(existing.subCategory ?? [], incoming.subCategory);
        }
    }
    return merged;
};

type UseFunctionPaginationArgs = {
    fileName: string;
    targetLineRange: LineRange;
    pageSize?: number;
};

/** Helper-browser adapter; the shared controller owns all section cursors and loading transitions. */
export const useFunctionPagination = ({
    fileName, targetLineRange, pageSize = FUNCTIONS_PAGE_SIZE
}: UseFunctionPaginationArgs) => {
    const { rpcClient } = useRpcContext();
    const [info, setInfo] = useState<HelperPaneFunctionInfo | undefined>(undefined);
    const { sectionsWithMore, loadingSections, reset, seed, loadSection } = useFunctionPaginationController(pageSize);
    const searchValueRef = useRef("");
    const searchGenerationRef = useRef(0);

    const loadFirstPage = useCallback(async (searchText: string) => {
        searchValueRef.current = searchText;
        const generation = ++searchGenerationRef.current;
        reset();
        try {
            const response = await rpcClient.getBIDiagramRpcClient().search({
                position: targetLineRange,
                filePath: fileName,
                queryMap: { q: searchText.trim(), limit: pageSize, offset: 0, includeAvailableFunctions: "true" },
                searchKind: "FUNCTION"
            });
            if (generation !== searchGenerationRef.current) {
                return;
            }
            assertFunctionSearchSuccess(response);
            const page = convertToHelperPaneFunction(response.categories as Category[]);
            setInfo(page);
            seed(response.functionPagination, title => countFunctionItems(page.category.filter(c => c.label === title)));
        } catch (error) {
            if (generation !== searchGenerationRef.current) {
                return;
            }
            console.error(">>> Error loading functions", error);
            setInfo(undefined);
            reset();
        }
    }, [rpcClient, fileName, targetLineRange, pageSize, reset, seed]);

    const loadMoreSection = useCallback((sectionTitle: string) => {
        const generation = searchGenerationRef.current;
        void loadSection(sectionTitle, (org, cursor) => rpcClient.getBIDiagramRpcClient().search({
            position: targetLineRange,
            filePath: fileName,
            queryMap: {
                q: searchValueRef.current.trim(), limit: pageSize, offset: cursor.nextOffset,
                orgName: org, functionSource: cursor.source, includeAvailableFunctions: "true"
            },
            searchKind: "FUNCTION"
        }), response => {
            const page = convertToHelperPaneFunction(response.categories as Category[]);
            // Imported Functions in an org-scoped response must not be duplicated into the library section.
            const sectionOnly = page.category.filter(c => c.label === sectionTitle);
            const count = countFunctionItems(sectionOnly);
            if (count > 0) {
                setInfo(prev => ({ category: mergeFunctionCategories(prev?.category ?? [], sectionOnly) }));
            }
            return count;
        }, () => generation === searchGenerationRef.current);
    }, [rpcClient, fileName, targetLineRange, pageSize, loadSection]);

    return { info, sectionsWithMore, loadingSections, loadFirstPage, loadMoreSection };
};
