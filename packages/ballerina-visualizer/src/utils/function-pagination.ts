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

import type { FunctionPageInfo, FunctionSearchPagination } from "@wso2/ballerina-core";
import type { HelperPaneFunctionCategory } from "@wso2/ballerina-side-panel";

export const FUNCTIONS_PAGE_SIZE = 60;

export const PAGINATED_LIBRARY_SECTIONS: ReadonlyArray<{
    title: string;
    org: "ballerina" | "ballerinax";
}> = [
    { title: "Standard Library", org: "ballerina" },
    { title: "Extended Library", org: "ballerinax" },
];

/**
 * Raw-source continuation wins over the visible count: filtered pages can be short or empty without being final.
 * Older servers have no continuation metadata and retain the full-visible-page heuristic.
 */
export const getFunctionSectionPage = (
    pagination: FunctionSearchPagination | undefined,
    org: "ballerina" | "ballerinax",
    visibleCount: number,
    pageSize: number,
    requestOffset = 0
): FunctionPageInfo => {
    const page = pagination?.[org];
    if (page && Number.isSafeInteger(page.nextOffset) && page.nextOffset >= requestOffset) {
        // A malformed non-advancing continuation must not keep an exhausted section reachable.
        return { ...page, hasMore: page.hasMore && page.nextOffset > requestOffset };
    }
    return { hasMore: visibleCount >= pageSize, nextOffset: requestOffset + pageSize };
};

/** The LS can resolve an RPC with an error payload instead of rejecting it. Never page that payload. */
export const assertFunctionSearchSuccess = (response: { categories?: unknown; errorMsg?: unknown }): void => {
    if (response.errorMsg != null || !Array.isArray(response.categories)) {
        throw new Error(typeof response.errorMsg === "string" ? response.errorMsg : "Missing function categories");
    }
};

/** Keep an empty, filtered section reachable when the server still has raw rows to scan. */
export const withPendingSections = (
    categories: HelperPaneFunctionCategory[], sectionsWithMore: Record<string, boolean>
): HelperPaneFunctionCategory[] => {
    const result = [...categories];
    for (const { title } of PAGINATED_LIBRARY_SECTIONS) {
        if (sectionsWithMore[title] && !result.some(category => category.label === title)) {
            result.push({ label: title, items: [] });
        }
    }
    return result;
};
