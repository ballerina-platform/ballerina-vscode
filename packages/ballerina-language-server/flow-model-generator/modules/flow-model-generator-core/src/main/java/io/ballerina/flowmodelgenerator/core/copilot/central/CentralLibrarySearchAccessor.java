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

package io.ballerina.flowmodelgenerator.core.copilot.central;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.ballerina.centralconnector.CentralAPI;
import io.ballerina.centralconnector.RemoteCentral;
import io.ballerina.centralconnector.response.PackageResponse;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Searches Ballerina libraries by keyword against the Ballerina Central registry.
 *
 * <p>The keywords are joined into a single space separated {@code q} value. Central resolves that
 * through Solr's {@code edismax} parser with {@code q.op=OR}, so every keyword contributes to the
 * match independently and the results arrive ordered by Central's own relevance score. That score
 * already boosts the {@code ballerina} and {@code ballerinax} organizations and factors in the
 * package pull count, so no further ranking is applied here.
 *
 * <p>Central is asked for 30 packages and the response is narrowed locally to the
 * {@code ballerina} and {@code ballerinax} organizations. Narrowing locally rather than through
 * Central's {@code org} query parameter is deliberate: supplying {@code org} makes Central switch
 * its query operator to {@code AND}, which then requires every keyword to match as well and
 * collapses multi-keyword searches to zero results.
 *
 * <p>Matches are then gated on relevance. Central boosts results by package popularity
 * ({@code bf=log(pullCount)^75}), which is helpful when the text scores are close but takes over
 * once they are not: a generic keyword such as "issue" or "repository" matches hundreds of packages
 * weakly through their README text, and the most-pulled ones then crowd out the genuinely relevant
 * results. The gate keeps a package only when Central highlighted the match in its summary or
 * keywords, or when the package name itself carries a query term.
 *
 * @since 1.7.0
 */
public class CentralLibrarySearchAccessor {

    // Number of packages requested from Central before the organization filter is applied. Measured
    // yields for 30: a single keyword leaves ~14 ballerina/ballerinax packages and multi-keyword
    // queries leave ~20-25, comfortably above the number of results the caller keeps.
    static final int CENTRAL_FETCH_LIMIT = 30;

    // Only libraries from these organizations are surfaced to the caller.
    private static final Set<String> ALLOWED_ORGANIZATIONS = Set.of("ballerina", "ballerinax");

    // Central reads reserved boolean operators out of the query, so they are dropped from keywords.
    private static final Set<String> SOLR_BOOLEAN_OPERATORS = Set.of("AND", "OR", "NOT");

    // Shortest query term allowed to match a package name segment as a substring rather than in full.
    private static final int MIN_PARTIAL_NAME_MATCH_LENGTH = 3;

    private static final String QUERY_PARAM = "q";
    private static final String LIMIT_PARAM = "limit";

    private static final long MAX_CACHE_ENTRIES = 256;
    private static final Duration CACHE_TTL = Duration.ofMinutes(30);

    // Keyword searches repeat heavily within a session, and Central now sits on the critical path of
    // every generation. The cache is static because a manager (and therefore an accessor) is created
    // per request.
    private static final Cache<String, Map<String, String>> QUERY_CACHE = Caffeine.newBuilder()
            .maximumSize(MAX_CACHE_ENTRIES)
            .expireAfterWrite(CACHE_TTL)
            .build();

    private final CentralAPI centralApi;

    public CentralLibrarySearchAccessor() {
        this(RemoteCentral.getInstance());
    }

    CentralLibrarySearchAccessor(CentralAPI centralApi) {
        this.centralApi = centralApi;
    }

    /**
     * Searches Ballerina Central for libraries matching the given keywords.
     *
     * @param keywords Array of search keywords
     * @return map of matching package names ("org/package_name") to descriptions, in Central's
     *         relevance order
     */
    public Map<String, String> searchLibrariesByKeywords(String[] keywords) {
        if (keywords == null || keywords.length == 0) {
            return new LinkedHashMap<>();
        }

        String query = buildQuery(keywords);
        if (query.isEmpty()) {
            return new LinkedHashMap<>();
        }

        Map<String, String> cached = QUERY_CACHE.getIfPresent(query);
        if (cached != null) {
            return new LinkedHashMap<>(cached);
        }

        Map<String, String> libraries = fetchFromCentral(query);
        QUERY_CACHE.put(query, Collections.unmodifiableMap(new LinkedHashMap<>(libraries)));
        return libraries;
    }

    private Map<String, String> fetchFromCentral(String query) {
        PackageResponse response = centralApi.searchPackages(Map.of(
                QUERY_PARAM, query,
                LIMIT_PARAM, String.valueOf(CENTRAL_FETCH_LIMIT)));

        Map<String, String> libraries = new LinkedHashMap<>();
        if (response == null || response.packages() == null) {
            return libraries;
        }

        Map<String, PackageResponse.Highlighting> highlighting =
                response.highlighting() == null ? Map.of() : response.highlighting();
        // A HashSet rather than Set.of: repeated keywords yield duplicate tokens, which Set.of rejects.
        Set<String> queryTerms = new HashSet<>(Arrays.asList(query.toLowerCase(Locale.ROOT).split(" ")));

        for (PackageResponse.Package pkg : response.packages()) {
            String organization = pkg.organization();
            String name = pkg.name();
            if (organization == null || name == null
                    || !ALLOWED_ORGANIZATIONS.contains(organization.toLowerCase(Locale.ROOT))) {
                continue;
            }
            if (!isRelevantMatch(pkg, highlighting, queryTerms)) {
                continue;
            }
            String summary = pkg.summary();
            libraries.putIfAbsent(organization + "/" + name, summary == null ? "" : summary);
        }
        return libraries;
    }

    /**
     * Decides whether a package matched a query term meaningfully rather than incidentally.
     *
     * @param pkg          the package to test
     * @param highlighting Central's highlight snippets, keyed by package id
     * @param queryTerms   lower cased terms of the query sent to Central
     * @return true when the match is worth surfacing
     */
    private static boolean isRelevantMatch(PackageResponse.Package pkg,
                                           Map<String, PackageResponse.Highlighting> highlighting,
                                           Set<String> queryTerms) {
        PackageResponse.Highlighting highlight = highlighting.get(String.valueOf(pkg.id()));
        if (highlight != null && (hasSnippet(highlight.summary()) || hasSnippet(highlight.keywords()))) {
            return true;
        }

        // Central only highlights the summary and keywords fields, so a package whose own name carries a
        // query term stays even when nothing was highlighted. Substring matching is needed because a name
        // segment often glues the term to something else ("api2pdf", "pdfbroker" for "pdf"); it is gated on
        // a minimum term length so that short terms do not match unrelated names by accident.
        for (String segment : (pkg.organization() + " " + pkg.name()).toLowerCase(Locale.ROOT)
                .split("[^a-z0-9]+")) {
            if (segment.isEmpty()) {
                continue;
            }
            for (String term : queryTerms) {
                if (term.equals(segment)
                        || (term.length() >= MIN_PARTIAL_NAME_MATCH_LENGTH && segment.contains(term))) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean hasSnippet(List<String> snippets) {
        if (snippets == null) {
            return false;
        }
        for (String snippet : snippets) {
            if (snippet != null && !snippet.isBlank()) {
                return true;
            }
        }
        return false;
    }

    /**
     * Builds Central's {@code q} value from the keyword array.
     *
     * <p>Every keyword is reduced to alphanumeric tokens. That is not cosmetic: Central reinterprets
     * a keyword containing {@code :} as a field lookup and silently drops it when the prefix is not a
     * known field, which can leave the query empty and make Central match every package. A keyword
     * containing {@code /} is read as an organization plus package pair and switches the whole query
     * to {@code AND}. Stripping the punctuation turns both cases into ordinary search terms.
     *
     * @param keywords Array of search keywords
     * @return space separated query value, or an empty string when no usable term remains
     */
    static String buildQuery(String[] keywords) {
        List<String> terms = new ArrayList<>();
        for (String keyword : keywords) {
            if (keyword == null || keyword.isBlank()) {
                continue;
            }
            for (String token : sanitize(keyword).split(" ")) {
                if (token.isEmpty() || SOLR_BOOLEAN_OPERATORS.contains(token.toUpperCase(Locale.ROOT))) {
                    continue;
                }
                terms.add(token);
            }
        }
        return String.join(" ", terms);
    }

    private static String sanitize(String keyword) {
        return keyword.replaceAll("[^a-zA-Z0-9 ]", " ").trim().replaceAll("\\s+", " ");
    }

    static void clearCache() {
        QUERY_CACHE.invalidateAll();
    }
}
