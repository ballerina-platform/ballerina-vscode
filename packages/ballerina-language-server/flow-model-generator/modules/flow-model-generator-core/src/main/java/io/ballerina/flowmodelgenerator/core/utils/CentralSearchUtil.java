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
import io.ballerina.modelgenerator.commons.ModuleCoordinate;
import io.ballerina.modelgenerator.commons.SearchResult;
import org.ballerinalang.diagramutil.connector.models.connector.Connector;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;

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
     * Searches the functions a single module declares.
     *
     * <p>Central has no module parameter, but its {@code q} is matched against module names as well as symbol names
     * and additional terms narrow the match, so naming the module alongside the query scopes the search to it:
     * {@code q=fromEdiString edifact.d03a.finance.mINVOIC} matches seven symbols, all of that module's, where
     * {@code q=fromEdiString edifact.d03a.finance} matches two hundred and ten across the package's thirty modules.
     * Naming it only biases the ranking rather than restricting it, so the module is matched exactly here to drop
     * the near misses that come back anyway - a package root alongside its submodules, or a {@code d04a} sibling of
     * a {@code d03a} module.</p>
     *
     * <p>The request itself is {@link #searchFunctionsByOrg}: same query keys, same guards, same symbol-type check,
     * same null-on-failure contract. Only the scoping of {@code q} and the exact-module filter are new.</p>
     *
     * @param query  the search query string (empty to list all of the module's functions)
     * @param limit  the maximum number of the module's functions to return
     * @param module the module to scope the search to
     * @return the module's matching functions, or null if the request failed
     */
    public List<SearchResult> searchFunctionsInModule(String query, int limit, ModuleCoordinate module) {
        if (module == null || module.moduleName().isEmpty()) {
            return new ArrayList<>();
        }
        String scopedQuery = query == null || query.isEmpty()
                ? module.moduleName() : query + " " + module.moduleName();
        List<SearchResult> results = searchFunctionsByOrg(scopedQuery, limit, 0, module.org());
        if (results == null) {
            // The request failed; the caller keeps whatever general results it already has.
            return null;
        }
        return results.stream()
                .filter(result -> module.equals(result.packageInfo().coordinate()))
                .collect(Collectors.toCollection(ArrayList::new));
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
     * root function. A reindexed Central reports the declaring module in its own field, one row per module, so that
     * is what is used. The fallback covers a registry that has not been reindexed yet, where the field is absent and
     * only default-module symbols are indexed: there the package name <i>is</i> the module name, so the fallback is
     * the correct answer rather than merely a safe one.
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
