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
import { HelperPaneFunctionCategory, HelperPaneFunctionInfo } from "@wso2/ballerina-side-panel";
import { Category, LineRange } from "@wso2/ballerina-core";
import { convertToHelperPaneFunction } from "./bi";

// Default page size for the paginated function list. Shared across the function pickers so they stay in sync.
export const FUNCTIONS_PAGE_SIZE = 60;

// Library sections that paginate independently, each mapping a category title (as emitted by the language server)
// to the Central organization whose next page it loads.
export const PAGINATED_LIBRARY_SECTIONS: ReadonlyArray<{ title: string; org: string }> = [
    { title: "Standard Library", org: "ballerina" },
    { title: "Extended Library", org: "ballerinax" }
];

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
    pageSize?: number;
};

type UseFunctionPaginationResult = {
    info: HelperPaneFunctionInfo | undefined;
    // Per library section (keyed by category title): whether it has more pages, and whether it is currently loading.
    sectionsWithMore: Record<string, boolean>;
    loadingSections: Record<string, boolean>;
    // Resets pagination and loads the first page (page 0 of every section) for a fresh query. Returns the fetch
    // promise so callers can coordinate their own loading UI.
    loadFirstPage: (searchText: string) => Promise<void>;
    // Loads the next page of a single library section and merges it in.
    loadMoreSection: (sectionTitle: string) => void;
};

/**
 * Encapsulates per-section pagination for the helper-pane function pickers (searchKind "FUNCTION"). Each library
 * section (standard/extended) is paged independently by its own offset and merged in on demand; callers own the
 * rendering and decide when to call {@link loadMoreSection} (e.g. on scroll).
 *
 * Control flags live in refs so callers can trigger loads without stale closures and without double-fetching.
 */
export const useFunctionPagination = ({
    fileName,
    targetLineRange,
    pageSize = FUNCTIONS_PAGE_SIZE
}: UseFunctionPaginationArgs): UseFunctionPaginationResult => {
    const { rpcClient } = useRpcContext();
    const [info, setInfo] = useState<HelperPaneFunctionInfo | undefined>(undefined);
    const [sectionsWithMore, setSectionsWithMore] = useState<Record<string, boolean>>({});
    const [loadingSections, setLoadingSections] = useState<Record<string, boolean>>({});
    const sectionOffsetsRef = useRef<Record<string, number>>({});
    const sectionLoadingRef = useRef<Record<string, boolean>>({});
    const searchValueRef = useRef<string>("");
    // Bumped on every fresh search so late responses from a superseded query are discarded instead of merging
    // stale pages into the current results.
    const searchGenerationRef = useRef<number>(0);

    const loadFirstPage = useCallback(
        (searchText: string) => {
            searchValueRef.current = searchText;
            // A fresh search supersedes any in-flight section loads and any earlier first-page fetch.
            const generation = ++searchGenerationRef.current;
            return rpcClient
                .getBIDiagramRpcClient()
                .search({
                    position: targetLineRange,
                    filePath: fileName,
                    queryMap: {
                        q: searchText.trim(),
                        limit: pageSize,
                        offset: 0,
                        includeAvailableFunctions: "true"
                    },
                    searchKind: "FUNCTION"
                })
                .then((response) => {
                    if (generation !== searchGenerationRef.current) {
                        return;
                    }
                    const page = convertToHelperPaneFunction((response.categories ?? []) as Category[]);
                    setInfo(page);
                    const withMore: Record<string, boolean> = {};
                    for (const { title } of PAGINATED_LIBRARY_SECTIONS) {
                        sectionOffsetsRef.current[title] = 0;
                        withMore[title] =
                            countFunctionItems(page.category.filter((c) => c.label === title)) >= pageSize;
                    }
                    sectionLoadingRef.current = {};
                    setSectionsWithMore(withMore);
                    setLoadingSections({});
                })
                .catch((error) => {
                    // A newer search already owns the view; leave its results untouched.
                    if (generation !== searchGenerationRef.current) {
                        return;
                    }
                    // Clear so a failed fresh load doesn't present the previous query's results as current. The
                    // returned promise resolves, so callers' loading UI still settles.
                    console.error(">>> Error loading functions", error);
                    setInfo(undefined);
                    setSectionsWithMore({});
                    setLoadingSections({});
                    sectionOffsetsRef.current = {};
                    sectionLoadingRef.current = {};
                });
        },
        [rpcClient, fileName, targetLineRange, pageSize]
    );

    const loadMoreSection = useCallback(
        (sectionTitle: string) => {
            const section = PAGINATED_LIBRARY_SECTIONS.find((s) => s.title === sectionTitle);
            if (!section || sectionLoadingRef.current[sectionTitle]) {
                return;
            }
            sectionLoadingRef.current[sectionTitle] = true;
            setLoadingSections((prev) => ({ ...prev, [sectionTitle]: true }));
            const nextOffset = (sectionOffsetsRef.current[sectionTitle] ?? 0) + pageSize;
            // Capture the active search so a page that arrives after a new search is discarded, not merged.
            const generation = searchGenerationRef.current;
            rpcClient
                .getBIDiagramRpcClient()
                .search({
                    position: targetLineRange,
                    filePath: fileName,
                    queryMap: {
                        q: searchValueRef.current.trim(),
                        limit: pageSize,
                        offset: nextOffset,
                        orgName: section.org,
                        includeAvailableFunctions: "true"
                    },
                    searchKind: "FUNCTION"
                })
                .then((response) => {
                    if (generation !== searchGenerationRef.current) {
                        return;
                    }
                    const page = convertToHelperPaneFunction((response.categories ?? []) as Category[]);
                    // Merge only the target section: the org-scoped response may also carry an Imported Functions
                    // category (imported modules of the same org) which must not be duplicated into that section.
                    const sectionOnly = page.category.filter((c) => c.label === sectionTitle);
                    const sectionItems = countFunctionItems(sectionOnly);
                    sectionOffsetsRef.current[sectionTitle] = nextOffset;
                    setSectionsWithMore((prev) => ({ ...prev, [sectionTitle]: sectionItems >= pageSize }));
                    if (sectionItems > 0) {
                        setInfo((prev) =>
                            prev
                                ? { category: mergeFunctionCategories(prev.category, sectionOnly) }
                                : { category: sectionOnly }
                        );
                    }
                })
                .catch((error) => {
                    // The offset/has-more are advanced only on success, so a failed page leaves the section
                    // unchanged and retryable on the next scroll.
                    console.error(">>> Error loading more functions", error);
                })
                .finally(() => {
                    // A newer search already reset the loading flags; don't clobber the state it now owns.
                    if (generation !== searchGenerationRef.current) {
                        return;
                    }
                    sectionLoadingRef.current[sectionTitle] = false;
                    setLoadingSections((prev) => ({ ...prev, [sectionTitle]: false }));
                });
        },
        [rpcClient, fileName, targetLineRange, pageSize]
    );

    return { info, sectionsWithMore, loadingSections, loadFirstPage, loadMoreSection };
};

/**
 * Loads the next page of the first library section (in PAGINATED_LIBRARY_SECTIONS order) that still has more and is
 * not already loading. Shared by scroll handlers so the standard library pages before the extended library.
 */
export const loadNextAvailableSection = (
    sectionsWithMore: Record<string, boolean>,
    loadingSections: Record<string, boolean>,
    loadMoreSection: (sectionTitle: string) => void
): void => {
    const next = PAGINATED_LIBRARY_SECTIONS.find(
        (s) => sectionsWithMore[s.title] && !loadingSections[s.title]
    );
    if (next) {
        loadMoreSection(next.title);
    }
};
