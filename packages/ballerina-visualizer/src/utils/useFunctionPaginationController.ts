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
import type { BISearchResponse, FunctionPageInfo, FunctionSearchPagination } from "@wso2/ballerina-core";
import { assertFunctionSearchSuccess, FUNCTIONS_PAGE_SIZE, getFunctionSectionPage,
    PAGINATED_LIBRARY_SECTIONS } from "./function-pagination";

/** Shared cursor/loading ownership for node-panel and helper-browser function pagination.
 * Callers own conversion, request context and navigation guards; only successful pages commit a cursor.
 */
export const useFunctionPaginationController = (pageSize = FUNCTIONS_PAGE_SIZE) => {
    const [sectionsWithMore, setSectionsWithMore] = useState<Record<string, boolean>>({});
    const [loadingSections, setLoadingSections] = useState<Record<string, boolean>>({});
    const cursors = useRef<Record<string, FunctionPageInfo>>({});
    const loading = useRef<Record<string, boolean>>({});
    const generation = useRef(0);

    const reset = useCallback(() => {
        ++generation.current;
        cursors.current = {};
        loading.current = {};
        setSectionsWithMore({});
        setLoadingSections({});
    }, []);

    const seed = useCallback((pagination: FunctionSearchPagination | undefined, count: (title: string) => number) => {
        reset();
        const withMore: Record<string, boolean> = {};
        for (const { title, org } of PAGINATED_LIBRARY_SECTIONS) {
            const page = getFunctionSectionPage(pagination, org, count(title), pageSize);
            cursors.current[title] = page;
            withMore[title] = page.hasMore;
        }
        setSectionsWithMore(withMore);
    }, [pageSize, reset]);

    const loadSection = useCallback(async (
        title: string,
        fetch: (org: "ballerina" | "ballerinax", cursor: FunctionPageInfo) => Promise<BISearchResponse>,
        apply: (response: BISearchResponse) => number,
        isCurrent: () => boolean = () => true
    ) => {
        const section = PAGINATED_LIBRARY_SECTIONS.find(section => section.title === title);
        const cursor = cursors.current[title];
        if (!section || !cursor?.hasMore || loading.current[title]) {
            return;
        }
        const currentGeneration = generation.current;
        const isStale = () => currentGeneration !== generation.current || !isCurrent();
        loading.current[title] = true;
        setLoadingSections(prev => ({ ...prev, [title]: true }));
        try {
            const response = await fetch(section.org, cursor);
            if (isStale()) {
                return;
            }
            assertFunctionSearchSuccess(response);
            const count = apply(response);
            const next = getFunctionSectionPage(response.functionPagination, section.org, count,
                pageSize, cursor.nextOffset);
            cursors.current[title] = next;
            setSectionsWithMore(prev => ({ ...prev, [title]: next.hasMore }));
        } catch (error) {
            // Both rejected RPCs and resolved LS errors leave results, source and raw offset retryable.
            if (!isStale()) {
                console.error(">>> Error loading more functions", error);
            }
        } finally {
            if (!isStale()) {
                loading.current[title] = false;
                setLoadingSections(prev => ({ ...prev, [title]: false }));
            }
        }
    }, [pageSize]);

    return { sectionsWithMore, loadingSections, reset, seed, loadSection };
};
