/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
 *
 *  WSO2 LLC. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 */

package io.ballerina.flowmodelgenerator.core.search;

import io.ballerina.modelgenerator.commons.SearchResult;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BiFunction;
import java.util.function.UnaryOperator;

/**
 * Bounded eligible paging with offsets in the raw source, never the filtered result. The admit operator returns the
 * row to offer (possibly rebased onto a resolved version) or null to skip it.
 */
final class FunctionPage {
    private static final int MAX_SCANS = 5;
    private static final int CHUNK_SIZE = 100;

    record Raw(List<SearchResult> rows, boolean hasMore) { }
    record Page(List<SearchResult> rows, SearchCommand.FunctionPagination pagination) { }

    private FunctionPage() { }

    /** Keep continuation offsets tied to their original raw source. */
    static Page library(int limit, int offset, String requestedSource,
                        BiFunction<Integer, Integer, Raw> central, BiFunction<Integer, Integer, Raw> index,
                        UnaryOperator<SearchResult> admit) {
        if (!"index".equals(requestedSource)) {
            Page page = scan(limit, offset, central, admit);
            if (page != null) {
                return withSource(page, "central");
            }
            if ("central".equals(requestedSource)) {
                throw new IllegalStateException("Central function page unavailable; retry the same cursor");
            }
        }
        return withSource(scan(limit, offset, index, admit), "index");
    }

    private static Page withSource(Page page, String source) {
        return new Page(page.rows(), new SearchCommand.FunctionPagination(page.pagination().hasMore(),
                page.pagination().nextOffset(), source));
    }

    static Page scan(int limit, int offset, BiFunction<Integer, Integer, Raw> source,
                     UnaryOperator<SearchResult> admit) {
        int cursor = Math.max(0, offset);
        int target = Math.max(0, limit);
        List<SearchResult> rows = new ArrayList<>();
        if (target == 0) {
            return new Page(rows, new SearchCommand.FunctionPagination(false, cursor));
        }
        boolean hasMore = false;
        for (int scan = 0; scan < MAX_SCANS; scan++) {
            Raw raw = source.apply(CHUNK_SIZE, cursor);
            if (raw == null) {
                return null;
            }
            for (int index = 0; index < raw.rows().size(); index++) {
                SearchResult row = raw.rows().get(index);
                cursor++;
                SearchResult admitted = row == null ? null : admit.apply(row);
                if (admitted != null) {
                    rows.add(admitted);
                }
                if (rows.size() == target) {
                    // Do not consume an eligible lookahead: the next request resumes at the very next raw row.
                    hasMore = index + 1 < raw.rows().size() || raw.hasMore();
                    return new Page(rows, new SearchCommand.FunctionPagination(hasMore, cursor));
                }
            }
            hasMore = raw.hasMore() && !raw.rows().isEmpty();
            if (!hasMore) {
                break;
            }
        }
        return new Page(rows, new SearchCommand.FunctionPagination(hasMore, cursor));
    }
}
