/*
 *  Copyright (c) 2025, WSO2 LLC. (http://www.wso2.com)
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

import java.io.IOException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.logging.Logger;

/**
 * Manages SQLite database operations for searching functions in a package repository.
 *
 * <p>
 * This class follows the Singleton pattern and handles the initialization and querying of a SQLite database containing
 * package and function information.
 * </p>
 *
 * @since 1.0.0
 */
public class SearchDatabaseManager {

    private static final String INDEX_FILE_NAME = "search-index.sqlite";
    private static final String LIKE_MATCH_RANK = "100000000.0";
    private static final Logger LOGGER = Logger.getLogger(SearchDatabaseManager.class.getName());
    private final String dbPath;

    /**
     * Returns the JDBC database path for the search-index.sqlite file.
     *
     * @return the JDBC connection string
     */
    public String getDbPath() {
        return dbPath;
    }

    private static class Holder {

        private static final SearchDatabaseManager INSTANCE = new SearchDatabaseManager();
    }

    public static SearchDatabaseManager getInstance() {
        return Holder.INSTANCE;
    }

    private SearchDatabaseManager() {
        try {
            Class.forName("org.sqlite.JDBC");
        } catch (ClassNotFoundException e) {
            throw new RuntimeException("Failed to load SQLite JDBC driver", e);
        }

        Path tempDir;
        try {
            tempDir = Files.createTempDirectory("central-index");
        } catch (IOException e) {
            throw new RuntimeException("Failed to create a temporary directory", e);
        }

        URL dbUrl = getClass().getClassLoader().getResource(INDEX_FILE_NAME);
        if (dbUrl == null) {
            throw new RuntimeException("Database resource not found: " + INDEX_FILE_NAME);
        }
        Path tempFile = tempDir.resolve(INDEX_FILE_NAME);
        try {
            Files.copy(dbUrl.openStream(), tempFile);
        } catch (IOException e) {
            throw new RuntimeException("Failed to copy the database file to the temporary directory", e);
        }

        dbPath = "jdbc:sqlite:" + tempFile;
    }

    /**
     * Searches for functions in the database based on the given query.
     *
     * @param q      the search query string
     * @param limit  the maximum number of results to return
     * @param offset the offset from which to start returning results
     * @return a list of search results matching the query
     * @throws RuntimeException if there is an error executing the search or if the limit or offset values are invalid
     */
    public List<SearchResult> searchFunctions(String q, int limit, int offset) {
        List<SearchResult> results = new ArrayList<>();
        String sanitizedQuery = sanitizeQuery(q);
        // SQLite treats a negative LIMIT as unlimited, so clamp the unchecked client values.
        int safeLimit = Math.max(limit, 0);
        int safeOffset = Math.max(offset, 0);
        String sql;
        if (sanitizedQuery.isEmpty()) {
            // When the sanitized query is empty, query the base table directly
            // since FTS rank is only meaningful with a MATCH clause.
            sql = """
                    SELECT
                        f.id,
                        f.name AS function_name,
                        f.description AS function_description,
                        f.package_id,
                        p.name AS module_name,
                        p.package_name,
                        p.org AS package_org,
                        p.version AS package_version
                    FROM Function AS f
                    JOIN Package AS p ON f.package_id = p.id
                    ORDER BY f.name, p.name, p.org
                    LIMIT ?
                    OFFSET ?;
                    """;
        } else {
            sql = """
                    SELECT id, function_name, function_description, package_id,
                           module_name, package_name, package_org, package_version,
                           MIN(rank) AS rank
                    FROM (
                        SELECT
                            f.id,
                            f.name AS function_name,
                            f.description AS function_description,
                            f.package_id,
                            p.name AS module_name,
                            p.package_name,
                            p.org AS package_org,
                            p.version AS package_version,
                            fts.rank
                        FROM FunctionFTS AS fts
                        JOIN Function AS f ON fts.rowid = f.id
                        JOIN Package AS p ON f.package_id = p.id
                        WHERE fts.FunctionFTS MATCH ?
                        UNION ALL
                        SELECT
                            f.id,
                            f.name AS function_name,
                            f.description AS function_description,
                            f.package_id,
                            p.name AS module_name,
                            p.package_name,
                            p.org AS package_org,
                            p.version AS package_version,
                            %LIKE_MATCH_RANK AS rank
                        FROM Function AS f
                        JOIN Package AS p ON f.package_id = p.id
                        WHERE f.name LIKE ? COLLATE NOCASE
                    )
                    GROUP BY id
                    ORDER BY rank, function_name, module_name
                    LIMIT ?
                    OFFSET ?;""".replace("%LIKE_MATCH_RANK", LIKE_MATCH_RANK);
        }

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sql)) {

            if (sanitizedQuery.isEmpty()) {
                stmt.setInt(1, safeLimit);
                stmt.setInt(2, safeOffset);
            } else {
                stmt.setString(1, sanitizedQuery + "*");
                stmt.setString(2, "%" + sanitizedQuery + "%");
                stmt.setInt(3, safeLimit);
                stmt.setInt(4, safeOffset);
            }

            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    String functionName = rs.getString("function_name");
                    String description = rs.getString("function_description");
                    String moduleName = rs.getString("module_name");
                    String packageName = rs.getString("package_name");
                    String org = rs.getString("package_org");
                    String version = rs.getString("package_version");
                    SearchResult result = SearchResult.from(org, packageName, moduleName, version,
                            functionName, description);
                    results.add(result);
                }
            }
        } catch (SQLException e) {
            LOGGER.severe("Error searching functions: " + e.getMessage());
            throw new RuntimeException("Failed to search functions", e);
        } catch (NumberFormatException e) {
            LOGGER.severe("Invalid number format in query parameters: " + e.getMessage());
            throw new RuntimeException("Invalid limit or offset value", e);
        }

        return results;
    }

    /**
     * Searches for connectors in the database with org allowlist and name blacklist filtering applied at the SQL level,
     * ensuring accurate pagination.
     *
     * @param q                       the search query string
     * @param limit                   the maximum number of results to return
     * @param offset                  the offset from which to start returning results
     * @param allowedOrgs             the set of allowed organization names
     * @param blacklistedNamePatterns  the set of connector name patterns to exclude
     * @return a list of search results matching the query and filters
     */
    public List<SearchResult> searchConnectors(String q, int limit, int offset,
                                               Set<String> allowedOrgs, Set<String> blacklistedNamePatterns) {
        List<SearchResult> results = new ArrayList<>();
        if (allowedOrgs.isEmpty()) {
            return results;
        }
        String sanitizedQuery = sanitizeQuery(q);

        String orgPlaceholders = String.join(",", Collections.nCopies(allowedOrgs.size(), "?"));

        StringBuilder blacklistClause = new StringBuilder();
        for (int i = 0; i < blacklistedNamePatterns.size(); i++) {
            blacklistClause.append(" AND c.name NOT LIKE ?");
        }

        String sql;
        if (sanitizedQuery.isEmpty()) {
            sql = """
                SELECT
                    c.id,
                    c.name AS connector_name,
                    c.description AS connector_description,
                    c.package_id,
                    p.name AS module_name,
                    p.package_name,
                    p.org AS package_org,
                    p.version AS package_version
                FROM Connector AS c
                JOIN Package AS p ON c.package_id = p.id
                WHERE p.org IN (%ORG_PLACEHOLDERS)%BLACKLIST_CLAUSE
                ORDER BY c.name
                LIMIT ?
                OFFSET ?;
                """.replace("%ORG_PLACEHOLDERS", orgPlaceholders)
                   .replace("%BLACKLIST_CLAUSE", blacklistClause);
        } else {
            sql = """
                SELECT
                    c.id,
                    c.name AS connector_name,
                    c.description AS connector_description,
                    c.package_id,
                    p.name AS module_name,
                    p.package_name,
                    p.org AS package_org,
                    p.version AS package_version,
                    fts.rank
                FROM ConnectorFTS AS fts
                JOIN Connector AS c ON fts.rowid = c.id
                JOIN Package AS p ON c.package_id = p.id
                WHERE fts.ConnectorFTS MATCH ?
                    AND p.org IN (%ORG_PLACEHOLDERS)%BLACKLIST_CLAUSE
                ORDER BY fts.rank
                LIMIT ?
                OFFSET ?;
                """.replace("%ORG_PLACEHOLDERS", orgPlaceholders)
                   .replace("%BLACKLIST_CLAUSE", blacklistClause);
        }

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sql)) {

            int paramIndex = 1;
            if (!sanitizedQuery.isEmpty()) {
                stmt.setString(paramIndex++, sanitizedQuery + "*");
            }
            for (String org : allowedOrgs) {
                stmt.setString(paramIndex++, org);
            }
            for (String pattern : blacklistedNamePatterns) {
                stmt.setString(paramIndex++, "%" + pattern + "%");
            }
            stmt.setInt(paramIndex++, limit);
            stmt.setInt(paramIndex, offset);

            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    String connectorName = rs.getString("connector_name");
                    String description = rs.getString("connector_description");
                    String moduleName = rs.getString("module_name");
                    String packageName = rs.getString("package_name");
                    String org = rs.getString("package_org");
                    String version = rs.getString("package_version");
                    SearchResult result = SearchResult.from(org, packageName, moduleName, version, connectorName,
                            description);
                    results.add(result);
                }
            }
        } catch (SQLException e) {
            LOGGER.severe("Error searching connectors: " + e.getMessage());
            throw new RuntimeException("Failed to search connectors", e);
        } catch (NumberFormatException e) {
            LOGGER.severe("Invalid number format in query parameters: " + e.getMessage());
            throw new RuntimeException("Invalid limit or offset value", e);
        }

        return results;
    }

    /**
     * Searches for functions that belong to the given modules, optionally narrowed to a set of function names,
     * allocating the pagination window fairly across the modules so a single large module can't crowd the others out
     * of a page.
     *
     * <p>Matching binds organization and module name together, since {@code Package.name} has no uniqueness
     * constraint and two organizations can publish a same-named package.</p>
     *
     * @param modules       the modules to search, each identified by organization and index module name
     * @param functionNames function names to restrict the search to; empty means no name restriction
     * @param limit         the maximum number of results to return
     * @param offset        the number of results to skip
     * @return a list of search results matching the criteria
     * @throws RuntimeException if there is an error executing the search
     */
    public List<SearchResult> searchFunctionsByPackages(Set<ModuleCoordinate> modules, List<String> functionNames,
                                                        int limit, int offset) {
        if (modules.isEmpty()) {
            return Collections.emptyList();
        }
        List<ModuleCoordinate> moduleList = List.copyOf(modules);
        List<SearchResult> results = new ArrayList<>();

        String rangeValuesClause = String.join(",", Collections.nCopies(moduleList.size(), "(?,?,?,?)"));
        String nameFilter = functionNameFilter(functionNames);
        String sql = "SELECT function_name, function_description, package_id, module_name, package_name, "
                + "package_org, package_version FROM ("
                + "  SELECT f.name AS function_name, f.description AS function_description, f.package_id, "
                + "         p.name AS module_name, p.package_name, p.org AS package_org, "
                + "         p.version AS package_version, q.pkg_skip AS pkg_skip, q.pkg_take AS pkg_take, "
                + "         ROW_NUMBER() OVER (PARTITION BY p.org, p.name ORDER BY f.name, p.id, f.id) AS rn "
                + "  FROM Package p "
                + "  JOIN Function f ON p.id = f.package_id "
                + "  JOIN (SELECT column1 AS pkg_org, column2 AS pkg_name, column3 AS pkg_skip, "
                + "               column4 AS pkg_take FROM (VALUES " + rangeValuesClause + ")) AS q "
                + "  ON q.pkg_org = p.org AND q.pkg_name = p.name" + nameFilter
                + ") WHERE rn > pkg_skip AND rn <= pkg_skip + pkg_take "
                + "ORDER BY module_name, package_org, function_name, package_id";

        try (Connection conn = DriverManager.getConnection(dbPath)) {
            // limit/offset come straight from the client query map with no bounds checking, so FairShareWindow
            // clamps them and guards the window end against overflow.
            Map<ModuleCoordinate, Integer> counts = fetchPerPackageFunctionCounts(conn, modules, functionNames);
            FairShareWindow.Ranges<ModuleCoordinate> ranges = FairShareWindow.rangesOf(counts, offset, limit);

            try (PreparedStatement stmt = conn.prepareStatement(sql)) {
                int paramIndex = 1;
                for (ModuleCoordinate module : moduleList) {
                    FairShareWindow.Range range = ranges.of(module);
                    stmt.setString(paramIndex++, module.org());
                    stmt.setString(paramIndex++, module.moduleName());
                    stmt.setInt(paramIndex++, range.skip());
                    stmt.setInt(paramIndex++, range.take());
                }
                for (String functionName : functionNames) {
                    stmt.setString(paramIndex++, functionName);
                }

                try (ResultSet rs = stmt.executeQuery()) {
                    while (rs.next()) {
                        SearchResult.Package packageInfo = new SearchResult.Package(rs.getString("package_org"),
                                rs.getString("package_name"), rs.getString("module_name"),
                                rs.getString("package_version"));
                        results.add(SearchResult.from(packageInfo, rs.getString("function_name"),
                                rs.getString("function_description")));
                    }
                }
            }
        } catch (SQLException e) {
            LOGGER.severe("Error searching functions: " + e.getMessage());
            throw new RuntimeException("Failed to search functions", e);
        }

        return results;
    }

    /**
     * Returns the number of indexed functions available per module name, with {@code 0} for names with no rows. The
     * same name filter as the paged query is applied, so the quotas it feeds count only rows that can be returned.
     */
    private Map<ModuleCoordinate, Integer> fetchPerPackageFunctionCounts(Connection conn,
                                                                         Set<ModuleCoordinate> modules,
                                                                         List<String> functionNames)
            throws SQLException {
        Map<ModuleCoordinate, Integer> counts = new HashMap<>();
        for (ModuleCoordinate module : modules) {
            counts.put(module, 0);
        }

        String sql = "SELECT p.org AS package_org, p.name AS module_name, COUNT(*) AS function_count FROM Package p "
                + "JOIN Function f ON p.id = f.package_id "
                + "JOIN " + modulePairsSubquery(modules.size()) + " AS q "
                + "ON p.org = q.q_org AND p.name = q.q_name" + functionNameFilter(functionNames) + " "
                + "GROUP BY p.org, p.name";

        try (PreparedStatement stmt = conn.prepareStatement(sql)) {
            int paramIndex = bindModulePairs(stmt, 1, modules);
            for (String functionName : functionNames) {
                stmt.setString(paramIndex++, functionName);
            }

            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    counts.put(new ModuleCoordinate(rs.getString("package_org"), rs.getString("module_name")),
                            rs.getInt("function_count"));
                }
            }
        }

        return counts;
    }

    private static String functionNameFilter(List<String> functionNames) {
        return functionNames.isEmpty() ? ""
                : " WHERE f.name IN (" + String.join(",", Collections.nCopies(functionNames.size(), "?")) + ")";
    }

    /**
     * Searches for connectors that match the given package names and connector names.
     *
     * @param packageConnectorMap List containing the package name and connector name
     * @param limit               The maximum number of results to return
     * @param offset              The number of results to skip
     * @return A list of search results matching the criteria
     * @throws RuntimeException if there is an error executing the search or if the limit or offset values are invalid
     */
    public List<SearchResult> searchConnectorsByPackage(List<String> packageConnectorMap, int limit, int offset) {
        List<SearchResult> results = new ArrayList<>();

        StringBuilder sqlBuilder = new StringBuilder();
        sqlBuilder.append("SELECT ")
                .append("c.name AS connector_name, ")
                .append("c.description AS connector_description, ")
                .append("c.package_id, ")
                .append("p.name AS module_name, ")
                .append("p.package_name, ")
                .append("p.org AS package_org, ")
                .append("p.version AS package_version ")
                .append("FROM Package p ")
                .append("JOIN Connector c ON p.id = c.package_id");

        // Build the SQL query with IN clauses for both packages and connectors
        if (!packageConnectorMap.isEmpty()) {
            sqlBuilder.append(" WHERE (");
            for (int i = 0; i < packageConnectorMap.size(); i++) {
                if (i > 0) {
                    sqlBuilder.append(" OR ");
                }
                sqlBuilder.append("(p.name = ? AND c.name = ?)");
            }
            sqlBuilder.append(")");
        }
        sqlBuilder.append(" LIMIT ? OFFSET ?");

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sqlBuilder.toString())) {

            // Set parameters for package names and connector names
            int paramIndex = 1;
            for (String mapping : packageConnectorMap) {
                String[] mappingTuple = mapping.split(":");
                stmt.setString(paramIndex++, mappingTuple[0]);
                stmt.setString(paramIndex++, mappingTuple[1]);
            }

            // Set limit and offset
            stmt.setInt(paramIndex++, limit);
            stmt.setInt(paramIndex, offset);

            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    String name = rs.getString("connector_name");
                    String description = rs.getString("connector_description");
                    String org = rs.getString("package_org");
                    String moduleName = rs.getString("module_name");
                    String pkgName = rs.getString("package_name");
                    String version = rs.getString("package_version");

                    SearchResult.Package packageInfo = new SearchResult.Package(org, pkgName, moduleName, version);
                    results.add(SearchResult.from(packageInfo, name, description));
                }
            }
        } catch (SQLException e) {
            LOGGER.severe("Error searching connectors: " + e.getMessage());
            throw new RuntimeException("Failed to search connectors", e);
        }

        return results;
    }

    /**
     * Lists every indexed connector of the given organizations, with the package keywords and pull count needed to
     * group and rank them.
     *
     * @param allowedOrgs the set of allowed organization names
     * @return every connector of those organizations
     * @since 1.8.0
     */
    public List<IndexedConnector> listConnectors(Set<String> allowedOrgs) {
        List<IndexedConnector> results = new ArrayList<>();
        if (allowedOrgs.isEmpty()) {
            return results;
        }
        String sql = """
                SELECT
                    c.name AS connector_name,
                    c.description AS connector_description,
                    p.name AS module_name,
                    p.package_name,
                    p.org AS package_org,
                    p.version AS package_version,
                    p.keywords,
                    p.pull_count
                FROM Connector AS c
                JOIN Package AS p ON c.package_id = p.id
                WHERE p.org IN (%ORG_PLACEHOLDERS);
                """.replace("%ORG_PLACEHOLDERS", String.join(",", Collections.nCopies(allowedOrgs.size(), "?")));

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sql)) {

            int paramIndex = 1;
            for (String org : allowedOrgs) {
                stmt.setString(paramIndex++, org);
            }

            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    SearchResult.Package packageInfo = new SearchResult.Package(rs.getString("package_org"),
                            rs.getString("package_name"), rs.getString("module_name"),
                            rs.getString("package_version"));
                    SearchResult searchResult = SearchResult.from(packageInfo, rs.getString("connector_name"),
                            rs.getString("connector_description"));
                    results.add(new IndexedConnector(searchResult, splitKeywords(rs.getString("keywords")),
                            rs.getInt("pull_count")));
                }
            }
        } catch (SQLException e) {
            LOGGER.severe("Error listing connectors: " + e.getMessage());
            throw new RuntimeException("Failed to list connectors", e);
        }

        return results;
    }

    private static List<String> splitKeywords(String keywords) {
        if (keywords == null || keywords.isBlank()) {
            return List.of();
        }
        return Arrays.stream(keywords.split(",")).map(String::trim).filter(k -> !k.isEmpty()).toList();
    }

    /**
     * A connector as the index holds it.
     *
     * @param searchResult the connector itself
     * @param keywords     the package keywords, already split
     * @param pullCount    the package pull count
     * @since 1.8.0
     */
    public record IndexedConnector(SearchResult searchResult, List<String> keywords, int pullCount) {
    }

    /**
     * Searches for types in the database based on the given query.
     *
     * @param q      the search query string
     * @param limit  the maximum number of results to return
     * @param offset the offset from which to start returning results
     * @return a list of search results matching the query
     * @throws RuntimeException if there is an error executing the search or if the limit or offset values are invalid
     */
    public List<SearchResult> searchTypes(String q, int limit, int offset) {
        List<SearchResult> results = new ArrayList<>();
        String sanitizedQuery = sanitizeQuery(q);
        // limit/offset come straight from the client query map with no bounds checking, and SQLite treats a
        // negative LIMIT as unlimited, so clamp both to non-negative.
        int safeLimit = Math.max(limit, 0);
        int safeOffset = Math.max(offset, 0);
        String sql;
        if (sanitizedQuery.isEmpty()) {
            sql = """
                SELECT
                    t.id,
                    t.name AS type_name,
                    t.description AS type_description,
                    t.package_id,
                    p.name AS module_name,
                    p.package_name,
                    p.org AS package_org,
                    p.version AS package_version
                FROM Type AS t
                JOIN Package AS p ON t.package_id = p.id
                ORDER BY t.name, p.name, p.org
                LIMIT ?
                OFFSET ?;
                """;
        } else {
            sql = """
                SELECT
                    t.id,
                    t.name AS type_name,
                    t.description AS type_description,
                    t.package_id,
                    p.name AS module_name,
                    p.package_name,
                    p.org AS package_org,
                    p.version AS package_version,
                    fts.rank
                FROM TypeFTS AS fts
                JOIN Type AS t ON fts.rowid = t.id
                JOIN Package AS p ON t.package_id = p.id
                WHERE fts.TypeFTS MATCH ?
                ORDER BY fts.rank, t.name, p.name, p.org
                LIMIT ?
                OFFSET ?;
                """;
        }

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sql)) {

            if (sanitizedQuery.isEmpty()) {
                stmt.setInt(1, safeLimit);
                stmt.setInt(2, safeOffset);
            } else {
                stmt.setString(1, sanitizedQuery + "*");
                stmt.setInt(2, safeLimit);
                stmt.setInt(3, safeOffset);
            }

            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    String typeName = rs.getString("type_name");
                    String description = rs.getString("type_description");
                    String moduleName = rs.getString("module_name");
                    String packageName = rs.getString("package_name");
                    String org = rs.getString("package_org");
                    String version = rs.getString("package_version");
                    SearchResult result = SearchResult.from(org, packageName, moduleName, version, typeName,
                            description);
                    results.add(result);
                }
            }
        } catch (SQLException e) {
            LOGGER.severe("Error searching types: " + e.getMessage());
            throw new RuntimeException("Failed to search types", e);
        } catch (NumberFormatException e) {
            LOGGER.severe("Invalid number format in query parameters: " + e.getMessage());
            throw new RuntimeException("Invalid limit or offset value", e);
        }

        return results;
    }

    /**
     * Searches for types that belong to the given modules, allocating the pagination window fairly across them so a
     * single large module can't crowd the others out of a page.
     *
     * <p>Each module's row range is derived from its fair-share quota at {@code offset} (its skip) and at
     * {@code offset + limit} (its skip plus take) rather than from one global {@code LIMIT}/{@code OFFSET}, so
     * consecutive pages tile without duplicating or dropping rows. Matching binds organization and module name
     * together, since {@code Package.name} has no uniqueness constraint and two organizations can publish a
     * same-named package.</p>
     *
     * @param modules the modules to search, each identified by organization and index module name
     * @param limit   the maximum number of results to return
     * @param offset  the number of results to skip
     * @return a list of search results matching the criteria
     * @throws RuntimeException if there is an error executing the search
     */
    public List<SearchResult> searchTypesByPackages(Set<ModuleCoordinate> modules, int limit, int offset) {
        return searchTypesByPackages(modules, "", limit, offset);
    }

    /**
     * Same as {@link #searchTypesByPackages(Set, int, int)} but restricted to types matching the given query.
     *
     * <p>Pages over the given modules alone, as its own pool. A caller that has to blend this pool with rows from
     * outside the index wants {@link #searchTypesInRanges(Map, String)} instead, so that one allocation can span
     * both.</p>
     *
     * @param modules the modules to search, each identified by organization and index module name
     * @param q       the search query string
     * @param limit   the maximum number of results to return
     * @param offset  the number of results to skip
     * @return a list of search results matching the criteria
     * @throws RuntimeException if there is an error executing the search
     */
    public List<SearchResult> searchTypesByPackagesMatching(Set<ModuleCoordinate> modules, String q, int limit,
                                                            int offset) {
        return searchTypesByPackages(modules, sanitizeQuery(q), limit, offset);
    }

    private List<SearchResult> searchTypesByPackages(Set<ModuleCoordinate> modules, String sanitizedQuery,
                                                     int limit, int offset) {
        if (modules.isEmpty()) {
            return Collections.emptyList();
        }
        // limit/offset come straight from the client query map with no bounds checking, so FairShareWindow clamps
        // them and guards the window end against overflow.
        Map<ModuleCoordinate, Integer> counts = indexedTypeCounts(modules, sanitizedQuery, true);
        FairShareWindow.Ranges<ModuleCoordinate> ranges = FairShareWindow.rangesOf(counts, offset, limit);
        Map<ModuleCoordinate, FairShareWindow.Range> moduleRanges = new HashMap<>();
        for (ModuleCoordinate module : counts.keySet()) {
            FairShareWindow.Range range = ranges.of(module);
            if (range.take() > 0) {
                moduleRanges.put(module, range);
            }
        }
        return searchTypesInRanges(moduleRanges, sanitizedQuery, true);
    }

    /**
     * Reads one page of types, taking an explicit row range per module instead of deriving the ranges from a
     * {@code limit}/{@code offset} of its own.
     *
     * <p>Type search allocates its pagination window across the modules present in the index <i>and</i> the imported
     * modules it has to compile on demand (see {@link #indexedTypeCounts(Set, String)}), so the split can only be
     * decided by the caller that can see both pools. Ranges are per module, so the rows this returns are each
     * module's own best matches rather than whatever a global {@code LIMIT} happened to reach.</p>
     *
     * @param ranges the half-open row range to read from each module, in that module's own ranking order; modules
     *               with an empty range may be omitted
     * @param q      the search query string; empty matches every type of the given modules
     * @return the rows within those ranges
     * @throws RuntimeException if there is an error executing the search
     */
    public List<SearchResult> searchTypesInRanges(Map<ModuleCoordinate, FairShareWindow.Range> ranges, String q) {
        return searchTypesInRanges(ranges, q, false);
    }

    private List<SearchResult> searchTypesInRanges(Map<ModuleCoordinate, FairShareWindow.Range> ranges, String q,
                                                   boolean querySanitized) {
        if (ranges.isEmpty()) {
            return Collections.emptyList();
        }
        String sanitizedQuery = querySanitized ? q : sanitizeQuery(q);
        List<ModuleCoordinate> moduleList = List.copyOf(ranges.keySet());
        List<SearchResult> results = new ArrayList<>();

        String rangeValuesClause = String.join(",", Collections.nCopies(moduleList.size(), "(?,?,?,?)"));
        String sql;
        if (sanitizedQuery.isEmpty()) {
            // FTS rank is only meaningful within a query that has a MATCH constraint, so query the base table.
            sql = "SELECT type_name, type_description, package_id, module_name, package_name, package_org, "
                    + "package_version FROM ("
                    + "  SELECT t.name AS type_name, t.description AS type_description, t.package_id, "
                    + "         p.name AS module_name, p.package_name, p.org AS package_org, "
                    + "         p.version AS package_version, q.pkg_skip AS pkg_skip, q.pkg_take AS pkg_take, "
                    + "         ROW_NUMBER() OVER (PARTITION BY p.org, p.name ORDER BY t.name, p.id, t.id) AS rn "
                    + "  FROM Package p "
                    + "  JOIN Type t ON p.id = t.package_id "
                    + "  JOIN (SELECT column1 AS pkg_org, column2 AS pkg_name, column3 AS pkg_skip, "
                    + "               column4 AS pkg_take FROM (VALUES " + rangeValuesClause + ")) AS q "
                    + "  ON q.pkg_org = p.org AND q.pkg_name = p.name"
                    + ") WHERE rn > pkg_skip AND rn <= pkg_skip + pkg_take "
                    + "ORDER BY module_name, package_org, type_name, package_id";
        } else {
            sql = "SELECT type_name, type_description, package_id, module_name, package_name, package_org, "
                    + "package_version FROM ("
                    + "  SELECT t.name AS type_name, t.description AS type_description, t.package_id, "
                    + "         p.name AS module_name, p.package_name, p.org AS package_org, "
                    + "         p.version AS package_version, fts.rank AS match_rank, "
                    + "         q.pkg_skip AS pkg_skip, q.pkg_take AS pkg_take, "
                    + "         ROW_NUMBER() OVER (PARTITION BY p.org, p.name "
                    + "                            ORDER BY fts.rank, t.name, p.id, t.id) AS rn "
                    + "  FROM TypeFTS AS fts "
                    + "  JOIN Type t ON fts.rowid = t.id "
                    + "  JOIN Package p ON t.package_id = p.id "
                    + "  JOIN (SELECT column1 AS pkg_org, column2 AS pkg_name, column3 AS pkg_skip, "
                    + "               column4 AS pkg_take FROM (VALUES " + rangeValuesClause + ")) AS q "
                    + "  ON q.pkg_org = p.org AND q.pkg_name = p.name "
                    + "  WHERE fts.TypeFTS MATCH ?"
                    + ") WHERE rn > pkg_skip AND rn <= pkg_skip + pkg_take "
                    + "ORDER BY match_rank, type_name, module_name, package_org";
        }

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sql)) {

            int paramIndex = 1;
            for (ModuleCoordinate module : moduleList) {
                FairShareWindow.Range range = ranges.get(module);
                stmt.setString(paramIndex++, module.org());
                stmt.setString(paramIndex++, module.moduleName());
                stmt.setInt(paramIndex++, Math.max(range.skip(), 0));
                stmt.setInt(paramIndex++, Math.max(range.take(), 0));
            }
            if (!sanitizedQuery.isEmpty()) {
                stmt.setString(paramIndex, sanitizedQuery + "*");
            }

            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    results.add(readTypeRow(rs));
                }
            }
        } catch (SQLException e) {
            LOGGER.severe("Error searching types: " + e.getMessage());
            throw new RuntimeException("Failed to search types", e);
        }

        return results;
    }

    /**
     * Searches for types matching the given query that do <b>not</b> belong to any of the given modules.
     *
     * <p>This is the standard-library tier of the query-based type search - the complement of
     * {@link #searchTypesByPackagesMatching(Set, String, int, int)} - so the two tiers together cover exactly the
     * rows a plain global query would return, without overlap.</p>
     *
     * @param q                the search query string
     * @param excludedModules  the modules to exclude, each identified by organization and index module name; an
     *                         empty set excludes nothing
     * @param limit            the maximum number of results to return
     * @param offset           the number of results to skip
     * @return a list of search results matching the criteria
     * @throws RuntimeException if there is an error executing the search
     */
    public List<SearchResult> searchTypesExcludingPackages(String q, Set<ModuleCoordinate> excludedModules,
                                                           int limit, int offset) {
        if (excludedModules.isEmpty()) {
            return searchTypes(q, limit, offset);
        }
        List<SearchResult> results = new ArrayList<>();
        String sanitizedQuery = sanitizeQuery(q);
        int safeLimit = Math.max(limit, 0);
        int safeOffset = Math.max(offset, 0);
        String notExistsClause = notExistsModuleClause(excludedModules.size());

        String sql;
        if (sanitizedQuery.isEmpty()) {
            sql = "SELECT t.name AS type_name, t.description AS type_description, t.package_id, "
                    + "p.name AS module_name, p.package_name, p.org AS package_org, p.version AS package_version "
                    + "FROM Type AS t "
                    + "JOIN Package AS p ON t.package_id = p.id "
                    + "WHERE " + notExistsClause + " "
                    + "ORDER BY t.name, p.name, p.org LIMIT ? OFFSET ?";
        } else {
            sql = "SELECT t.name AS type_name, t.description AS type_description, t.package_id, "
                    + "p.name AS module_name, p.package_name, p.org AS package_org, p.version AS package_version "
                    + "FROM TypeFTS AS fts "
                    + "JOIN Type AS t ON fts.rowid = t.id "
                    + "JOIN Package AS p ON t.package_id = p.id "
                    + "WHERE fts.TypeFTS MATCH ? AND " + notExistsClause + " "
                    + "ORDER BY fts.rank, t.name, p.name, p.org LIMIT ? OFFSET ?";
        }

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sql)) {

            int paramIndex = 1;
            if (!sanitizedQuery.isEmpty()) {
                stmt.setString(paramIndex++, sanitizedQuery + "*");
            }
            paramIndex = bindModulePairs(stmt, paramIndex, excludedModules);
            stmt.setInt(paramIndex++, safeLimit);
            stmt.setInt(paramIndex, safeOffset);

            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    results.add(readTypeRow(rs));
                }
            }
        } catch (SQLException e) {
            LOGGER.severe("Error searching types: " + e.getMessage());
            throw new RuntimeException("Failed to search types", e);
        }

        return results;
    }

    /**
     * Returns how many types match the given query outside the given modules, i.e. the total capacity of the pool
     * {@link #searchTypesExcludingPackages(String, Set, int, int)} pages over.
     *
     * <p>Deliberately off the request path: this is a {@code COUNT} over the whole index (114k type rows), which is
     * far too expensive to run per keystroke. Type search drains the library pool <i>last</i> precisely so it never
     * needs the pool's capacity to page the tiers after it. Kept because the count is what pins the tiers'
     * disjointness - imported plus excluded must equal the global count - which is worth asserting in a test.</p>
     *
     * @param q               the search query string
     * @param excludedModules the modules to exclude, each identified by organization and index module name
     * @return the number of matching rows outside those modules
     * @throws RuntimeException if there is an error executing the query
     */
    public int countTypesExcludingPackages(String q, Set<ModuleCoordinate> excludedModules) {
        String sanitizedQuery = sanitizeQuery(q);
        String notExistsClause = excludedModules.isEmpty()
                ? "" : notExistsModuleClause(excludedModules.size());

        String sql;
        if (sanitizedQuery.isEmpty()) {
            sql = "SELECT COUNT(*) FROM Type AS t JOIN Package AS p ON t.package_id = p.id"
                    + (notExistsClause.isEmpty() ? "" : " WHERE " + notExistsClause);
        } else {
            sql = "SELECT COUNT(*) FROM TypeFTS AS fts "
                    + "JOIN Type AS t ON fts.rowid = t.id "
                    + "JOIN Package AS p ON t.package_id = p.id "
                    + "WHERE fts.TypeFTS MATCH ?"
                    + (notExistsClause.isEmpty() ? "" : " AND " + notExistsClause);
        }

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sql)) {

            int paramIndex = 1;
            if (!sanitizedQuery.isEmpty()) {
                stmt.setString(paramIndex++, sanitizedQuery + "*");
            }
            bindModulePairs(stmt, paramIndex, excludedModules);

            try (ResultSet rs = stmt.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            }
        } catch (SQLException e) {
            LOGGER.severe("Error counting types: " + e.getMessage());
            throw new RuntimeException("Failed to count types", e);
        }
    }

    /**
     * Returns the total number of indexed type rows across the given modules, i.e. the full capacity of the
     * fair-share pool {@link #searchTypesByPackages(Set, int, int)} pages over.
     *
     * @param modules the modules to count, each identified by organization and index module name
     * @return the sum of indexed type counts across those modules
     * @throws RuntimeException if there is an error executing the query
     */
    public int countIndexedTypes(Set<ModuleCoordinate> modules) {
        return sumIndexedTypeCounts(modules, "");
    }

    /**
     * Same as {@link #countIndexedTypes(Set)} but counting only the types matching the given query.
     *
     * @param q       the search query string
     * @param modules the modules to count, each identified by organization and index module name
     * @return the sum of matching indexed type counts across those modules
     * @throws RuntimeException if there is an error executing the query
     */
    public int countIndexedMatchingTypes(String q, Set<ModuleCoordinate> modules) {
        return sumIndexedTypeCounts(modules, sanitizeQuery(q));
    }

    private int sumIndexedTypeCounts(Set<ModuleCoordinate> modules, String sanitizedQuery) {
        return indexedTypeCounts(modules, sanitizedQuery, true).values().stream()
                .mapToInt(Integer::intValue)
                .sum();
    }

    /**
     * Returns which of the given modules are indexed, i.e. present in the {@code Package} table under the
     * matching organization - regardless of whether they have any {@code Type} rows.
     *
     * <p>A module can be legitimately indexed with zero types (e.g. {@code ballerinax/np} in the shipped index);
     * such a module must still count as indexed, otherwise it is misreported as missing and forces a full live
     * compilation on every request. Unpaginated, so a module isn't misreported as missing just because paging cut
     * it off.</p>
     *
     * @param modules the modules to check, each identified by organization and index module name
     * @return the subset of {@code modules} present in the index under their given organization
     * @throws RuntimeException if there is an error executing the query
     */
    public Set<ModuleCoordinate> findIndexedModules(Set<ModuleCoordinate> modules) {
        return indexedTypeCounts(modules, "", true).keySet();
    }

    /**
     * Returns how many types of each given module match the query, for the modules the index actually knows.
     *
     * <p>Presence in the returned map and the count are two different facts, and type search needs both: a module
     * <b>present with a count of {@code 0}</b> is indexed but has nothing matching (legitimate - {@code ballerinax/np}
     * ships in the index with no {@code Type} rows at all), whereas a module <b>absent from the map</b> isn't in the
     * index at all and its types are reachable only by compiling it. Answering both from one {@code LEFT JOIN} keeps
     * the two consistent, and keeps a per-keystroke search from paying two round trips to say it.</p>
     *
     * <p>Unpaginated: a module must not be reported as unindexed merely because paging cut its rows off.</p>
     *
     * @param modules the modules to look up, each identified by organization and index module name
     * @param q       the search query string; empty counts every type of the module
     * @return the matching type count of each of those modules present in the index, keyed by module
     * @throws RuntimeException if there is an error executing the query
     */
    public Map<ModuleCoordinate, Integer> indexedTypeCounts(Set<ModuleCoordinate> modules, String q) {
        return indexedTypeCounts(modules, q, false);
    }

    private Map<ModuleCoordinate, Integer> indexedTypeCounts(Set<ModuleCoordinate> modules, String q,
                                                             boolean querySanitized) {
        if (modules.isEmpty()) {
            return Collections.emptyMap();
        }
        String sanitizedQuery = querySanitized ? q : sanitizeQuery(q);
        Map<ModuleCoordinate, Integer> counts = new HashMap<>();

        // LEFT JOIN rather than JOIN: an indexed module with no matching type must still come back, as a row with a
        // count of 0, so the caller can tell "indexed, nothing matched" from "not in the index at all".
        String matchingTypes = sanitizedQuery.isEmpty()
                ? "Type"
                : "(SELECT t.package_id FROM TypeFTS AS fts JOIN Type AS t ON fts.rowid = t.id "
                        + "WHERE fts.TypeFTS MATCH ?)";
        String sql = "SELECT p.org AS package_org, p.name AS module_name, COUNT(t.package_id) AS type_count "
                + "FROM " + modulePairsSubquery(modules.size()) + " AS q "
                + "JOIN Package p ON p.org = q.q_org AND p.name = q.q_name "
                + "LEFT JOIN " + matchingTypes + " AS t ON t.package_id = p.id "
                + "GROUP BY p.org, p.name";

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sql)) {

            int paramIndex = bindModulePairs(stmt, 1, modules);
            if (!sanitizedQuery.isEmpty()) {
                stmt.setString(paramIndex, sanitizedQuery + "*");
            }

            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    counts.put(new ModuleCoordinate(rs.getString("package_org"), rs.getString("module_name")),
                            rs.getInt("type_count"));
                }
            }
        } catch (SQLException e) {
            LOGGER.severe("Error counting indexed types: " + e.getMessage());
            throw new RuntimeException("Failed to count indexed types", e);
        }

        return counts;
    }

    /**
     * Builds a joinable {@code (org, name)} pair list. Uses the {@code SELECT column1 AS ... FROM (VALUES ...)} form
     * rather than a {@code (VALUES ...) AS t(a, b)} table alias, which SQLite does not support.
     *
     * <p>SQLite parses a multi-row {@code VALUES} as a compound select, so this caps out at
     * {@code SQLITE_MAX_COMPOUND_SELECT} (500 by default) modules in one statement. That is far beyond what a single
     * Ballerina package's modules can import between them; if a project ever does reach it, chunk the module set
     * rather than raising the limit.</p>
     */
    private static String modulePairsSubquery(int size) {
        return "(SELECT column1 AS q_org, column2 AS q_name FROM (VALUES "
                + String.join(",", Collections.nCopies(size, "(?,?)")) + "))";
    }

    private static String notExistsModuleClause(int size) {
        return "NOT EXISTS (SELECT 1 FROM " + modulePairsSubquery(size)
                + " AS q WHERE q.q_org = p.org AND q.q_name = p.name)";
    }

    /**
     * Binds an {@code (org, name)} pair per entry starting at {@code paramIndex}, returning the next free index.
     */
    private static int bindModulePairs(PreparedStatement stmt, int paramIndex, Set<ModuleCoordinate> modules)
            throws SQLException {
        int index = paramIndex;
        for (ModuleCoordinate module : modules) {
            stmt.setString(index++, module.org());
            stmt.setString(index++, module.moduleName());
        }
        return index;
    }

    private static SearchResult readTypeRow(ResultSet rs) throws SQLException {
        SearchResult.Package packageInfo = new SearchResult.Package(rs.getString("package_org"),
                rs.getString("package_name"), rs.getString("module_name"), rs.getString("package_version"));
        return SearchResult.from(packageInfo, rs.getString("type_name"), rs.getString("type_description"));
    }

    /**
     * Unified search across functions and connectors using a single SQL query.
     * This provides better performance than multiple separate queries.
     *
     * @param q      the search query string
     * @param limit  the maximum number of results to return
     * @param offset the offset from which to start returning results
     * @return a list of unified search results with type information
     * @throws RuntimeException if there is an error executing the search
     */
    public List<UnifiedSearchResult> searchAllTypes(String q, int limit, int offset) {
        List<UnifiedSearchResult> results = new ArrayList<>();
        String sanitizedQuery = sanitizeQuery(q);

        String sql;
        if (sanitizedQuery.isEmpty()) {
            // When the query is empty, query base tables directly
            // since FTS rank is only meaningful with a MATCH clause.
            sql = """
                WITH FunctionResults AS (
                    SELECT 'function' as result_type,
                           f.name,
                           f.description,
                           p.org,
                           p.name AS module_name,
                           p.package_name,
                           p.version,
                           0 as relevance_score
                    FROM Function f
                    JOIN Package p ON f.package_id = p.id
                    ORDER BY f.name
                    LIMIT ?
                ),
                ConnectorResults AS (
                    SELECT 'connector' as result_type,
                           c.name,
                           c.description,
                           p.org,
                           p.name AS module_name,
                           p.package_name,
                           p.version,
                           0 as relevance_score
                    FROM Connector c
                    JOIN Package p ON c.package_id = p.id
                    ORDER BY c.name
                    LIMIT ?
                )
                SELECT * FROM (
                    SELECT * FROM FunctionResults
                    UNION ALL
                    SELECT * FROM ConnectorResults
                    ORDER BY result_type, name
                )
                LIMIT ? OFFSET ?
                """;
        } else {
            sql = """
                WITH FunctionResults AS (
                    SELECT 'function' as result_type,
                           f.name,
                           f.description,
                           p.org,
                           p.name AS module_name,
                           p.package_name,
                           p.version,
                           fts.rank as relevance_score
                    FROM FunctionFTS fts
                    JOIN Function f ON fts.rowid = f.id
                    JOIN Package p ON f.package_id = p.id
                    WHERE fts.FunctionFTS MATCH ?
                    ORDER BY fts.rank
                    LIMIT ?
                ),
                ConnectorResults AS (
                    SELECT 'connector' as result_type,
                           c.name,
                           c.description,
                           p.org,
                           p.name AS module_name,
                           p.package_name,
                           p.version,
                           fts.rank as relevance_score
                    FROM ConnectorFTS fts
                    JOIN Connector c ON fts.rowid = c.id
                    JOIN Package p ON c.package_id = p.id
                    WHERE fts.ConnectorFTS MATCH ?
                    ORDER BY fts.rank
                    LIMIT ?
                )
                SELECT * FROM (
                    SELECT * FROM FunctionResults
                    UNION ALL
                    SELECT * FROM ConnectorResults
                    ORDER BY relevance_score ASC, result_type, name
                )
                LIMIT ? OFFSET ?
                """;
        }

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sql)) {

            int paramIndex = 1;
            int functionsLimit = limit / 2;
            int connectorsLimit = limit - functionsLimit;
            if (sanitizedQuery.isEmpty()) {
                stmt.setInt(paramIndex++, functionsLimit);
                stmt.setInt(paramIndex++, connectorsLimit);
            } else {
                stmt.setString(paramIndex++, sanitizedQuery + "*");
                stmt.setInt(paramIndex++, functionsLimit);
                stmt.setString(paramIndex++, sanitizedQuery + "*");
                stmt.setInt(paramIndex++, connectorsLimit);
            }
            stmt.setInt(paramIndex++, limit);
            stmt.setInt(paramIndex, offset);

            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    String resultType = rs.getString("result_type");
                    String name = rs.getString("name");
                    String description = rs.getString("description");
                    String org = rs.getString("org");
                    String moduleName = rs.getString("module_name");
                    String packageName = rs.getString("package_name");
                    String version = rs.getString("version");

                    SearchResult searchResult = SearchResult.from(org, packageName, moduleName, version, name,
                            description);
                    results.add(new UnifiedSearchResult(resultType, searchResult));
                }
            }
        } catch (SQLException e) {
            LOGGER.severe("Error searching all types: " + e.getMessage());
            throw new RuntimeException("Failed to search all types", e);
        } catch (NumberFormatException e) {
            LOGGER.severe("Invalid number format in query parameters: " + e.getMessage());
            throw new RuntimeException("Invalid limit or offset value", e);
        }

        return results;
    }

    /**
     * Normalizes a raw client query into the form the index is queried with.
     *
     * <p>Exposed so scoring done outside SQL - type search's live-compilation fallback - starts from the same string
     * the indexed tiers do. Otherwise a query the index reduces to "match everything" (say {@code "!!!"}) would
     * instead be matched literally against the live pool, and the same keystroke would mean two different things
     * depending on whether a module happens to be indexed.</p>
     *
     * @param q the raw query string
     * @return the sanitized query, empty if the query carries no usable term
     */
    public static String sanitizeQuery(String q) {
        if (q == null || q.trim().isEmpty()) {
            return "";
        }
        // Escape quotes and remove special SQLite FTS operators, and only allow alphanumeric characters and spaces
        return q.replaceAll("(?i)\\b(UNION|SELECT|FROM|OR|AND|WHERE|MATCH|NEAR|NOT)\\b|[^a-zA-Z0-9\\s]", " ")
                .trim();
    }

}
