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

package io.ballerina.flowmodelgenerator.core.utils;

import io.ballerina.centralconnector.CentralAPI;
import io.ballerina.centralconnector.response.ConnectorsResponse;
import io.ballerina.centralconnector.response.SymbolResponse;
import io.ballerina.modelgenerator.commons.SearchResult;
import org.ballerinalang.diagramutil.connector.models.connector.Connector;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

/**
 * Centralizes all Ballerina Central API search operations. This class encapsulates the logic for searching connectors
 * and symbols from Ballerina Central, including over-fetching strategies, organization filtering, and response
 * conversion to {@link SearchResult}.
 *
 * @since 1.7.0
 */
public class CentralSearchUtil {

    private static final int OVERFETCH_FACTOR = 3;
    private static final int MAX_FETCH_ITERATIONS = 3;
    private static final int MAX_FETCH_LIMIT = 1000;
    private static final String FUNCTION_SYMBOL_TYPE = "function";

    private final CentralAPI centralClient;

    public CentralSearchUtil(CentralAPI centralClient) {
        this.centralClient = centralClient;
    }

    /**
     * Searches connectors from Ballerina Central with over-fetching to compensate for post-filtering by allowed
     * organizations and blacklisted names. Returns null if the request fails or times out, allowing the caller to
     * fall back to the local database.
     *
     * @param query                  the search query string
     * @param limit                  the desired number of results
     * @param offset                 the pagination offset
     * @param allowedOrgs            the set of allowed organization names
     * @param blacklistedNamePatterns the set of blacklisted connector name patterns
     * @return a list of matching search results, or null if the request failed
     */
    public List<SearchResult> searchConnectors(String query, int limit, int offset, Set<String> allowedOrgs,
                                               Set<String> blacklistedNamePatterns) {
        limit = Math.max(limit, 0);
        offset = Math.max(offset, 0);
        if (allowedOrgs.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            List<SearchResult> filteredResults = new ArrayList<>();
            int fetchOffset = 0;
            int fetchLimit = safeFetchLimit(limit, offset);
            int skipped = 0;

            for (int iteration = 0; iteration < MAX_FETCH_ITERATIONS; iteration++) {
                Map<String, String> centralQueryMap = new HashMap<>();
                if (!query.isEmpty()) {
                    centralQueryMap.put("q", query);
                }
                centralQueryMap.put("limit", String.valueOf(fetchLimit));
                centralQueryMap.put("offset", String.valueOf(fetchOffset));
                ConnectorsResponse connectorsResponse = centralClient.connectors(centralQueryMap);

                if (connectorsResponse == null || connectorsResponse.connectors() == null) {
                    break;
                }

                for (Connector connector : connectorsResponse.connectors()) {
                    if (connector == null || connector.packageInfo == null || connector.name == null) {
                        continue;
                    }
                    if (!allowedOrgs.contains(connector.packageInfo.getOrganization())) {
                        continue;
                    }
                    if (isBlacklisted(connector.name, blacklistedNamePatterns)) {
                        continue;
                    }
                    if (skipped < offset) {
                        skipped++;
                        continue;
                    }
                    filteredResults.add(toSearchResult(connector, false));
                    if (filteredResults.size() >= limit) {
                        return filteredResults.subList(0, limit);
                    }
                }

                // Check if Central has more results
                if (connectorsResponse.count() <= fetchOffset + fetchLimit) {
                    break;
                }
                fetchOffset += fetchLimit;
            }

            return filteredResults;
        } catch (RuntimeException e) {
            // Failed to fetch connectors from Central, falling back to local database
            return null;
        }
    }

    /**
     * Searches connectors from Ballerina Central scoped to the given organization. When the client has authorized
     * access, user-owned packages are also included in the results. Results matching any of the blacklisted name
     * patterns are excluded.
     *
     * @param currentOrg             the organization name to filter by
     * @param query                  the search query string
     * @param limit                  the desired number of results
     * @param offset                 the pagination offset
     * @param blacklistedNamePatterns the set of connector name patterns to exclude from results
     * @return a list of matching search results, or an empty list if no organization is provided and the client
     *         lacks authorized access
     */
    public List<SearchResult> searchConnectorsByOrganization(String currentOrg, String query, int limit, int offset,
                                                             Set<String> blacklistedNamePatterns) {
        limit = Math.max(limit, 0);
        offset = Math.max(offset, 0);
        List<SearchResult> organizationConnectors = new ArrayList<>();
        Map<String, String> baseQueryMap = new HashMap<>();
        boolean success = false;
        if (centralClient.hasAuthorizedAccess()) {
            baseQueryMap.put("user-packages", "true");
            success = true;
        }
        if (currentOrg != null && !currentOrg.isEmpty()) {
            baseQueryMap.put("org", currentOrg);
            success = true;
        }
        if (!success) {
            return organizationConnectors;
        }
        if (!query.isEmpty()) {
            baseQueryMap.put("q", query);
        }

        int fetchOffset = 0;
        int fetchLimit = safeFetchLimit(limit, offset);
        int skipped = 0;

        for (int iteration = 0; iteration < MAX_FETCH_ITERATIONS; iteration++) {
            Map<String, String> queryMap = new HashMap<>(baseQueryMap);
            queryMap.put("limit", String.valueOf(fetchLimit));
            queryMap.put("offset", String.valueOf(fetchOffset));
            ConnectorsResponse connectorsResponse = centralClient.connectors(queryMap);

            if (connectorsResponse == null || connectorsResponse.connectors() == null) {
                break;
            }

            for (Connector connector : connectorsResponse.connectors()) {
                if (connector == null || connector.packageInfo == null || connector.name == null) {
                    continue;
                }
                if (isBlacklisted(connector.name, blacklistedNamePatterns)) {
                    continue;
                }
                if (skipped < offset) {
                    skipped++;
                    continue;
                }
                organizationConnectors.add(toSearchResult(connector, true));
                if (organizationConnectors.size() >= limit) {
                    return organizationConnectors.subList(0, limit);
                }
            }

            // Check if Central has more results
            if (connectorsResponse.count() <= fetchOffset + fetchLimit) {
                break;
            }
            fetchOffset += fetchLimit;
        }

        return organizationConnectors;
    }

    /**
     * Searches functions from Ballerina Central with over-fetching to compensate for post-filtering by allowed
     * organizations. Returns null if the request fails or times out, allowing the caller to fall back to the local
     * database.
     *
     * @param query       the search query string
     * @param limit       the desired number of results
     * @param offset      the pagination offset
     * @param allowedOrgs the set of allowed organization names
     * @return a list of matching search results, or null if the request failed
     */
    public List<SearchResult> searchFunctions(String query, int limit, int offset, Set<String> allowedOrgs) {
        limit = Math.max(limit, 0);
        offset = Math.max(offset, 0);
        if (allowedOrgs.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            List<SearchResult> filteredResults = new ArrayList<>();
            int fetchOffset = 0;
            int fetchLimit = safeFetchLimit(limit, offset);
            int skipped = 0;

            for (int iteration = 0; iteration < MAX_FETCH_ITERATIONS; iteration++) {
                Map<String, String> queryMap = new HashMap<>();
                if (!query.isEmpty()) {
                    queryMap.put("q", query);
                }
                queryMap.put("symbolType", FUNCTION_SYMBOL_TYPE);
                queryMap.put("limit", String.valueOf(fetchLimit));
                queryMap.put("offset", String.valueOf(fetchOffset));
                SymbolResponse symbolResponse = centralClient.searchSymbols(queryMap);

                if (symbolResponse == null || symbolResponse.symbols() == null) {
                    break;
                }

                for (SymbolResponse.Symbol symbol : symbolResponse.symbols()) {
                    if (symbol == null || symbol.symbolType() == null || symbol.organization() == null) {
                        continue;
                    }
                    if (!FUNCTION_SYMBOL_TYPE.equals(symbol.symbolType())) {
                        continue;
                    }
                    if (!allowedOrgs.contains(symbol.organization())) {
                        continue;
                    }
                    if (skipped < offset) {
                        skipped++;
                        continue;
                    }
                    filteredResults.add(toSearchResult(symbol, false));
                    if (filteredResults.size() >= limit) {
                        return filteredResults.subList(0, limit);
                    }
                }

                // Check if Central has more results
                if (symbolResponse.count() <= fetchOffset + fetchLimit) {
                    break;
                }
                fetchOffset += fetchLimit;
            }

            return filteredResults;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * Searches functions from Ballerina Central scoped to a single organization. The organization and symbol type
     * filters are applied by Central, so {@code limit} and {@code offset} map directly to stable pages (no
     * over-fetching or post-filtering). This suits paginated listing of an organization's functions. Returns null if
     * the request fails or times out, allowing the caller to fall back to the local database.
     *
     * @param query  the search query string (empty to list all functions of the organization)
     * @param limit  the desired number of results
     * @param offset the pagination offset
     * @param org    the organization name to scope the search to
     * @return a list of matching search results, or null if the request failed
     */
    public List<SearchResult> searchFunctionsByOrg(String query, int limit, int offset, String org) {
        limit = Math.max(limit, 0);
        offset = Math.max(offset, 0);
        if (org == null || org.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            Map<String, String> queryMap = new HashMap<>();
            if (!query.isEmpty()) {
                queryMap.put("q", query);
            }
            queryMap.put("org", org);
            queryMap.put("symbolType", FUNCTION_SYMBOL_TYPE);
            queryMap.put("limit", String.valueOf(limit));
            queryMap.put("offset", String.valueOf(offset));
            SymbolResponse symbolResponse = centralClient.searchSymbols(queryMap);

            if (symbolResponse == null || symbolResponse.symbols() == null) {
                return new ArrayList<>();
            }

            List<SearchResult> results = new ArrayList<>();
            for (SymbolResponse.Symbol symbol : symbolResponse.symbols()) {
                if (symbol == null || symbol.symbolType() == null) {
                    continue;
                }
                if (!FUNCTION_SYMBOL_TYPE.equals(symbol.symbolType())) {
                    continue;
                }
                results.add(toSearchResult(symbol, false));
            }
            return results;
        } catch (RuntimeException e) {
            // Failed to fetch functions from Central, falling back to local database
            return null;
        }
    }

    /**
     * Searches functions declared by a single package, across all of its modules.
     *
     * <p>Central has no package filter. Its {@code q} is matched against package and module names as well as symbol
     * names, and additional terms narrow the match, so naming the package alongside the query is the only way to
     * scope a symbol search to it ({@code q=fromEdiString edifact.d03a.supplychain} matches six symbols where
     * {@code q=fromEdiString} matches seventy). Naming it only biases the ranking rather than restricting it, so the
     * package is matched exactly here to drop the near misses that come back anyway - a same-named package from
     * another organization, or a {@code d04a} sibling of a {@code d03a} package.</p>
     *
     * @param query       the search query string (empty to list all of the package's functions)
     * @param limit       the maximum number of the package's functions to return
     * @param org         the organization that published the package
     * @param packageName the package name to scope the search to
     * @return the package's matching functions, or null if the request failed
     */
    public List<SearchResult> searchFunctionsInPackage(String query, int limit, String org, String packageName) {
        limit = Math.max(limit, 0);
        if (org == null || org.isEmpty() || packageName == null || packageName.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            Map<String, String> queryMap = new HashMap<>();
            queryMap.put("q", query == null || query.isEmpty() ? packageName : query + " " + packageName);
            queryMap.put("org", org);
            queryMap.put("symbolType", FUNCTION_SYMBOL_TYPE);
            queryMap.put("limit", String.valueOf(limit));
            queryMap.put("offset", "0");
            SymbolResponse symbolResponse = centralClient.searchSymbols(queryMap);

            if (symbolResponse == null || symbolResponse.symbols() == null) {
                return new ArrayList<>();
            }

            List<SearchResult> results = new ArrayList<>();
            for (SymbolResponse.Symbol symbol : symbolResponse.symbols()) {
                if (symbol == null || !FUNCTION_SYMBOL_TYPE.equals(symbol.symbolType())) {
                    continue;
                }
                if (!packageName.equals(symbol.name()) || !org.equals(symbol.organization())) {
                    continue;
                }
                results.add(toSearchResult(symbol, false));
            }
            return results;
        } catch (RuntimeException e) {
            // Failed to fetch the package's functions; the caller keeps whatever general results it already has.
            return null;
        }
    }

    /**
     * Searches symbols within the current organization from Ballerina Central, filtered by symbol type.
     *
     * @param currentOrg       the current organization name
     * @param query            the search query string
     * @param limit            the desired number of results
     * @param offset           the pagination offset
     * @param symbolTypeFilter a predicate to filter symbols by their type
     * @return a list of matching search results from the organization
     */
    public List<SearchResult> searchSymbolsByOrganization(String currentOrg, String query, int limit, int offset,
                                                          Predicate<String> symbolTypeFilter) {
        limit = Math.max(limit, 0);
        offset = Math.max(offset, 0);
        List<SearchResult> organizationSymbols = new ArrayList<>();
        if (currentOrg == null || currentOrg.isEmpty()) {
            return organizationSymbols;
        }

        try {
            String orgQuery = "org:" + currentOrg;
            String baseQuery = query.isEmpty() ? orgQuery : query + " " + orgQuery;
            int fetchOffset = 0;
            int fetchLimit = safeFetchLimit(limit, offset);
            int skipped = 0;

            for (int iteration = 0; iteration < MAX_FETCH_ITERATIONS; iteration++) {
                Map<String, String> queryMap = new HashMap<>();
                // TODO: Enable once https://github.com/ballerina-platform/ballerina-central/issues/284 is resolved
//            if (centralClient.hasAuthorizedAccess()) {
//                queryMap.put("user-packages", "true");
//            }
                queryMap.put("q", baseQuery);
                queryMap.put("limit", String.valueOf(fetchLimit));
                queryMap.put("offset", String.valueOf(fetchOffset));
                SymbolResponse symbolResponse = centralClient.searchSymbols(queryMap);

                if (symbolResponse == null || symbolResponse.symbols() == null) {
                    break;
                }

                for (SymbolResponse.Symbol symbol : symbolResponse.symbols()) {
                    if (symbol == null || symbol.symbolType() == null) {
                        continue;
                    }
                    if (symbolTypeFilter.test(symbol.symbolType())) {
                        if (skipped < offset) {
                            skipped++;
                            continue;
                        }
                        organizationSymbols.add(toSearchResult(symbol, true));
                        if (organizationSymbols.size() >= limit) {
                            return organizationSymbols.subList(0, limit);
                        }
                    }
                }

                // Check if Central has more results
                if (symbolResponse.count() <= fetchOffset + fetchLimit) {
                    break;
                }
                fetchOffset += fetchLimit;
            }
        } catch (RuntimeException e) {
            // Failed to fetch symbols from Central
            return organizationSymbols;
        }

        return organizationSymbols;
    }

    private static SearchResult toSearchResult(Connector connector, boolean fromCurrentOrg) {
        SearchResult.Package packageInfo = new SearchResult.Package(
                connector.packageInfo.getOrganization(),
                connector.packageInfo.getName(),
                connector.moduleName,
                connector.packageInfo.getVersion()
        );
        return SearchResult.from(packageInfo, connector.name, connector.packageInfo.getSummary(), fromCurrentOrg);
    }

    private static SearchResult toSearchResult(SymbolResponse.Symbol symbol, boolean fromCurrentOrg) {
        SearchResult.Package packageInfo = new SearchResult.Package(
                symbol.organization(),
                symbol.name(),
                moduleNameOf(symbol),
                symbol.version()
        );
        return SearchResult.from(packageInfo, symbol.symbolName(), symbol.description(), fromCurrentOrg);
    }

    /**
     * The module a symbol is declared in, falling back to the package name.
     * <p>
     * The module name is what the codedata carries to the node template, and compiling a submodule function against
     * the package default module resolves the wrong symbol -- either not found, or silently shadowed by a same-named
     * root function. Central indexes only the default module today, so the field is absent and the fallback is what
     * applies; for a default-module symbol the two names are equal anyway, so the fallback is also the correct answer
     * there rather than merely a safe one.
     *
     * @param symbol the symbol returned by Central
     * @return the module name to attribute the symbol to
     */
    private static String moduleNameOf(SymbolResponse.Symbol symbol) {
        String moduleName = symbol.moduleName();
        return moduleName == null || moduleName.isEmpty() ? symbol.name() : moduleName;
    }

    private static boolean isBlacklisted(String connectorName, Set<String> patterns) {
        return connectorName != null && patterns.stream().anyMatch(connectorName::contains);
    }

    private static int safeFetchLimit(int limit, int offset) {
        long raw = (long) (Math.max(limit, 0) + Math.max(offset, 0)) * OVERFETCH_FACTOR;
        return (int) Math.min(raw, MAX_FETCH_LIMIT);
    }
}
