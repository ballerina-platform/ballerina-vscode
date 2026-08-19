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
import java.util.List;
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
                    ORDER BY f.name
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
                    ORDER BY rank, function_name
                    LIMIT ?
                    OFFSET ?;""".replace("%LIKE_MATCH_RANK", LIKE_MATCH_RANK);
        }

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sql)) {

            if (sanitizedQuery.isEmpty()) {
                stmt.setInt(1, limit);
                stmt.setInt(2, offset);
            } else {
                stmt.setString(1, sanitizedQuery + "*");
                stmt.setString(2, "%" + sanitizedQuery + "%");
                stmt.setInt(3, limit);
                stmt.setInt(4, offset);
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
     * Searches for functions that match both the given package names and function names.
     *
     * @param packageNames  List of package names to search in
     * @param functionNames List of function names to search for
     * @param limit         The maximum number of results to return
     * @param offset        The number of results to skip
     * @return A list of search results matching the criteria
     * @throws RuntimeException if there is an error executing the search or if the limit or offset values are invalid
     */
    public List<SearchResult> searchFunctionsByPackages(List<String> packageNames, List<String> functionNames,
                                                        int limit, int offset) {
        List<SearchResult> results = new ArrayList<>();

        StringBuilder sqlBuilder = new StringBuilder();
        sqlBuilder.append("SELECT ")
                .append("f.name AS function_name, ")
                .append("f.description AS function_description, ")
                .append("f.package_id, ")
                .append("p.name AS module_name, ")
                .append("p.package_name, ")
                .append("p.org AS package_org, ")
                .append("p.version AS package_version ")
                .append("FROM Package p ")
                .append("JOIN Function f ON p.id = f.package_id");

        // Build the SQL query with IN clauses for both packages and functions
        boolean whereAdded = false;
        if (!packageNames.isEmpty()) {
            sqlBuilder.append(" WHERE p.name IN (")
                    .append(String.join(",", Collections.nCopies(packageNames.size(), "?")))
                    .append(")");
            whereAdded = true;
        }
        if (!functionNames.isEmpty()) {
            sqlBuilder.append(whereAdded ? " AND" : " WHERE")
                    .append(" f.name IN (")
                    .append(String.join(",", Collections.nCopies(functionNames.size(), "?")))
                    .append(")");
        }
        sqlBuilder.append(" LIMIT ? OFFSET ?");

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sqlBuilder.toString())) {

            // Set parameters for package names
            int paramIndex = 1;
            for (String packageName : packageNames) {
                stmt.setString(paramIndex++, packageName);
            }

            // Set parameters for function names
            for (String functionName : functionNames) {
                stmt.setString(paramIndex++, functionName);
            }

            // Set limit and offset
            stmt.setInt(paramIndex++, limit);
            stmt.setInt(paramIndex, offset);

            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    String name = rs.getString("function_name");
                    String description = rs.getString("function_description");
                    String org = rs.getString("package_org");
                    String moduleName = rs.getString("module_name");
                    String pkgName = rs.getString("package_name");
                    String version = rs.getString("package_version");

                    SearchResult.Package packageInfo = new SearchResult.Package(org, pkgName, moduleName, version);
                    results.add(SearchResult.from(packageInfo, name, description));
                }
            }
        } catch (SQLException e) {
            LOGGER.severe("Error searching functions: " + e.getMessage());
            throw new RuntimeException("Failed to search functions", e);
        }

        return results;
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
                ORDER BY t.name
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
                ORDER BY fts.rank
                LIMIT ?
                OFFSET ?;
                """;
        }

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sql)) {

            if (sanitizedQuery.isEmpty()) {
                stmt.setInt(1, limit);
                stmt.setInt(2, offset);
            } else {
                stmt.setString(1, sanitizedQuery + "*");
                stmt.setInt(2, limit);
                stmt.setInt(3, offset);
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
     * Searches for types that match the given package names.
     *
     * @param packageNames List of package names to search in
     * @param limit        The maximum number of results to return
     * @param offset       The number of results to skip
     * @return A list of search results matching the criteria
     * @throws RuntimeException if there is an error executing the search or if the limit or offset values are invalid
     */
    public List<SearchResult> searchTypesByPackages(List<String> packageNames, int limit, int offset) {
        if (packageNames.isEmpty()) {
            return Collections.emptyList();
        }
        List<SearchResult> results = new ArrayList<>();

        StringBuilder sqlBuilder = new StringBuilder();
        sqlBuilder.append("SELECT ")
                .append("t.name AS type_name, ")
                .append("t.description AS type_description, ")
                .append("t.package_id, ")
                .append("p.name AS module_name, ")
                .append("p.package_name, ")
                .append("p.org AS package_org, ")
                .append("p.version AS package_version ")
                .append("FROM Package p ")
                .append("JOIN Type t ON p.id = t.package_id");

        // Build the SQL query with IN clauses for packages
        sqlBuilder.append(" WHERE p.name IN (")
                .append(String.join(",", Collections.nCopies(packageNames.size(), "?")))
                .append(")");
        sqlBuilder.append(" LIMIT ? OFFSET ?");

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sqlBuilder.toString())) {

            // Set parameters for package names
            int paramIndex = 1;
            for (String packageName : packageNames) {
                stmt.setString(paramIndex++, packageName);
            }

            // Set limit and offset
            stmt.setInt(paramIndex++, limit);
            stmt.setInt(paramIndex, offset);

            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    String name = rs.getString("type_name");
                    String description = rs.getString("type_description");
                    String org = rs.getString("package_org");
                    String moduleName = rs.getString("module_name");
                    String pkgName = rs.getString("package_name");
                    String version = rs.getString("package_version");

                    SearchResult.Package packageInfo = new SearchResult.Package(org, pkgName, moduleName, version);
                    results.add(SearchResult.from(packageInfo, name, description));
                }
            }
        } catch (SQLException e) {
            LOGGER.severe("Error searching types: " + e.getMessage());
            throw new RuntimeException("Failed to search types", e);
        }

        return results;
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

    private static String sanitizeQuery(String q) {
        if (q == null || q.trim().isEmpty()) {
            return "";
        }
        // Escape quotes and remove special SQLite FTS operators, and only allow alphanumeric characters and spaces
        return q.replaceAll("(?i)\\b(UNION|SELECT|FROM|OR|AND|WHERE|MATCH|NEAR|NOT)\\b|[^a-zA-Z0-9\\s]", " ")
                .trim();
    }

}
