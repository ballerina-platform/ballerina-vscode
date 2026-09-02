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

import { UIEvent, useCallback, useRef, useState } from "react";
import { useRpcContext } from "@wso2/ballerina-rpc-client";
import { HelperPaneFunctionCategory, HelperPaneFunctionInfo } from "@wso2/ballerina-side-panel";
import { Category, LineRange } from "@wso2/ballerina-core";
import { convertToHelperPaneFunction } from "./bi";

// Default page size for the paginated function list.
export const FUNCTIONS_PAGE_SIZE = 12;

// Distance (px) from the bottom of the scroll container at which the next page is requested.
const SCROLL_THRESHOLD = 40;

// Counts the leaf function items across a category tree, used to decide whether another page exists.
export const countFunctionItems = (categories: HelperPaneFunctionCategory[] = []): number =>
    categories.reduce(
        (total, category) =>
            total + (category.items?.length ?? 0) + countFunctionItems(category.subCategory),
        0
    );

// Merges a newly fetched page into the accumulated categories, appending items to matching
// categories/subcategories (matched by label) and adding any categories that are new.
export const mergeFunctionCategories = (
    prev: HelperPaneFunctionCategory[],
    next: HelperPaneFunctionCategory[]
): HelperPaneFunctionCategory[] => {
    const merged = prev.map((category) => ({ ...category }));
    for (const incoming of next) {
        const existing = merged.find((category) => category.label === incoming.label);
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
    // When true, the library-browser variant of the function search is requested.
    includeAvailableFunctions?: boolean;
    pageSize?: number;
};

type UseFunctionPaginationResult = {
    info: HelperPaneFunctionInfo | undefined;
    isFetchingMore: boolean;
    // Resets pagination and loads the first page for a fresh query. Returns the fetch promise so callers can
    // coordinate their own loading UI.
    loadFirstPage: (searchText: string) => Promise<void>;
    // Attach to the scroll container's onScroll; loads the next page on scroll-to-bottom.
    handleScroll: (e: UIEvent<HTMLDivElement>) => void;
};

/**
 * Encapsulates scroll pagination for the function search (searchKind "FUNCTION"). The list is fetched a page at a
 * time; the first page replaces the list and subsequent pages (triggered by scrolling to the bottom) are merged in.
 *
 * Control flags are kept in refs so the scroll handler always reads the latest values and never advances the page
 * on mount/re-render - only a genuine scroll-to-bottom loads more.
 */
export const useFunctionPagination = ({
    fileName,
    targetLineRange,
    includeAvailableFunctions,
    pageSize = FUNCTIONS_PAGE_SIZE
}: UseFunctionPaginationArgs): UseFunctionPaginationResult => {
    const { rpcClient } = useRpcContext();
    const [info, setInfo] = useState<HelperPaneFunctionInfo | undefined>(undefined);
    const [isFetchingMore, setIsFetchingMore] = useState<boolean>(false);
    const offsetRef = useRef<number>(0);
    const hasMoreRef = useRef<boolean>(true);
    const isFetchingMoreRef = useRef<boolean>(false);
    const isInitialLoadingRef = useRef<boolean>(false);
    const searchValueRef = useRef<string>("");

    // Fetches a single page. offset 0 (append=false) replaces the list; later pages (append=true) merge in.
    const runSearch = useCallback(
        (searchText: string, offset: number, append: boolean) => {
            return rpcClient
                .getBIDiagramRpcClient()
                .search({
                    position: targetLineRange,
                    filePath: fileName,
                    queryMap: {
                        q: searchText.trim(),
                        limit: pageSize,
                        offset,
                        ...(includeAvailableFunctions && { includeAvailableFunctions: "true" })
                    },
                    searchKind: "FUNCTION"
                })
                .then((response) => {
                    const page = convertToHelperPaneFunction((response.categories ?? []) as Category[]);
                    const pageItemCount = countFunctionItems(page.category);
                    offsetRef.current = offset;
                    // A short page (fewer items than requested) means there are no more pages to load.
                    hasMoreRef.current = pageItemCount >= pageSize;

                    if (append) {
                        if (pageItemCount > 0) {
                            setInfo((prev) =>
                                prev ? { category: mergeFunctionCategories(prev.category, page.category) } : page
                            );
                        }
                    } else {
                        setInfo(page);
                    }
                });
        },
        [rpcClient, fileName, targetLineRange, includeAvailableFunctions, pageSize]
    );

    const loadFirstPage = useCallback(
        (searchText: string) => {
            // Reset pagination for the fresh query so scroll starts from the first page again.
            offsetRef.current = 0;
            hasMoreRef.current = true;
            searchValueRef.current = searchText;
            isInitialLoadingRef.current = true;
            return runSearch(searchText, 0, false).finally(() => {
                isInitialLoadingRef.current = false;
            });
        },
        [runSearch]
    );

    // Loads the next page. Guarded so it fires only from a genuine scroll-to-bottom, never on mount.
    const loadMore = useCallback(() => {
        if (isInitialLoadingRef.current || isFetchingMoreRef.current || !hasMoreRef.current) {
            return;
        }
        isFetchingMoreRef.current = true;
        setIsFetchingMore(true);
        runSearch(searchValueRef.current, offsetRef.current + pageSize, true).finally(() => {
            isFetchingMoreRef.current = false;
            setIsFetchingMore(false);
        });
    }, [runSearch, pageSize]);

    const handleScroll = useCallback(
        (e: UIEvent<HTMLDivElement>) => {
            const el = e.currentTarget;
            const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD;
            if (nearBottom) {
                loadMore();
            }
        },
        [loadMore]
    );

    return { info, isFetchingMore, loadFirstPage, handleScroll };
};
