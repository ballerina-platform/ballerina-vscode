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

package io.ballerina.modelgenerator.commons;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Splits a pagination window across several row sources so one large source can't crowd the others off a page.
 *
 * <p>This is a pure function of {@code (counts, window)} with no storage behind it, which is what lets a stateless
 * request page consistently: a page is the difference between the quotas at {@code offset} and at
 * {@code offset + limit}, and because quotas only grow as the window grows, consecutive pages tile without
 * duplicating or dropping rows.</p>
 *
 * <p>It lives outside {@link SearchDatabaseManager} because the sources being shared aren't necessarily all in the
 * index - type search allocates the same window across indexed modules and modules it has to compile on demand, and
 * both pools have to be measured against one another for either to get a fair share of the page.</p>
 *
 * @since 1.8.0
 */
public final class FairShareWindow {

    private FairShareWindow() {
    }

    /**
     * Computes a max-min fair per-source row quota within the given {@code window}.
     *
     * <p>Sources are visited from the fewest available rows to the most, each taking the smaller of its actual count
     * and an equal share of what's left, so slack from small sources carries over to larger ones. A source with a
     * count of {@code 0} therefore takes nothing and passes its whole share on, which makes including or omitting
     * such sources equivalent.</p>
     *
     * @param counts how many rows each source can supply, keyed by source
     * @param window the number of rows to distribute; negative values are treated as {@code 0}
     * @param <K>    the source key, ordered so the allocation doesn't depend on the map's iteration order
     * @return the quota allocated to each key of {@code counts}, summing to {@code min(window, total rows)}
     */
    public static <K extends Comparable<K>> Map<K, Integer> quotas(Map<K, Integer> counts, int window) {
        List<Map.Entry<K, Integer>> entries = new ArrayList<>(counts.entrySet());
        // Tie-break by key so the allocation doesn't depend on the map's iteration order.
        entries.sort(Map.Entry.<K, Integer>comparingByValue().thenComparing(Map.Entry.comparingByKey()));

        Map<K, Integer> quotas = new HashMap<>();
        int remainingWindow = Math.max(window, 0);
        int remainingSources = entries.size();
        for (Map.Entry<K, Integer> entry : entries) {
            // Long arithmetic: a window near Integer.MAX_VALUE (a client asking for "everything") would otherwise
            // overflow the ceiling division and hand every source a negative quota, returning an empty page.
            long fairShare = ((long) remainingWindow + remainingSources - 1) / remainingSources;
            int quota = (int) Math.min(entry.getValue(), fairShare);
            quotas.put(entry.getKey(), quota);
            remainingWindow -= quota;
            remainingSources--;
        }
        return quotas;
    }

    /**
     * Computes the row range every source is allocated within one page, so the two quota passes a page needs are
     * done once rather than per source.
     *
     * @param counts how many rows each source can supply, keyed by source
     * @param offset the number of rows skipped before this page; negative values are treated as {@code 0}
     * @param limit  the page size; negative values are treated as {@code 0}
     * @param <K>    the source key
     * @return the ranges allocated within this page
     */
    public static <K extends Comparable<K>> Ranges<K> rangesOf(Map<K, Integer> counts, int offset, int limit) {
        int safeOffset = Math.max(offset, 0);
        // Guard the window end against overflow: limit and offset reach here straight from the client query map.
        int windowEnd = (int) Math.min((long) safeOffset + Math.max(limit, 0), Integer.MAX_VALUE);
        return new Ranges<>(quotas(counts, safeOffset), quotas(counts, windowEnd));
    }

    /**
     * The row ranges one page allocates across sources.
     *
     * @param startQuotas each source's quota at the page's offset, i.e. how many of its rows earlier pages took
     * @param endQuotas   each source's quota at the page's end
     * @param <K>         the source key
     */
    public record Ranges<K extends Comparable<K>>(Map<K, Integer> startQuotas, Map<K, Integer> endQuotas) {

        /**
         * Returns the range allocated to one source. Quotas grow monotonically with the window, so {@code take} is
         * never negative even for a source absent from {@code counts} (which gets an empty range).
         */
        public Range of(K key) {
            int skip = startQuotas.getOrDefault(key, 0);
            return new Range(skip, endQuotas.getOrDefault(key, 0) - skip);
        }
    }

    /**
     * A half-open row range within one source's rows.
     *
     * @param skip how many of the source's rows earlier pages already took
     * @param take how many of its rows this page takes
     */
    public record Range(int skip, int take) {
    }
}
