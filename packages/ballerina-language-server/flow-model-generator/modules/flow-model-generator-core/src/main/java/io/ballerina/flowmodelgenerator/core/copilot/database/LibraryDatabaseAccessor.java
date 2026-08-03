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

package io.ballerina.flowmodelgenerator.core.copilot.database;

import io.ballerina.modelgenerator.commons.SearchDatabaseManager;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Database accessor for library package information from the search-index database.
 * Handles database connections, queries, and resource management.
 *
 * @since 1.7.0
 */
public class LibraryDatabaseAccessor {

    private static final String MODE_CORE = "CORE";
    private static final String MODE_HEALTHCARE = "HEALTHCARE";

    // BM25 column weights shared across all FTS tables:
    // primary-name column (10.0), description column (2.0), secondary-name column (5.0)
    private static final String BM25_WEIGHTS = "10.0, 2.0, 5.0";

    // Per-source scaling factors applied to bm25() scores.
    // BM25 scores in SQLite FTS5 are negative (more negative = better match); the query
    // uses ORDER BY combined_score ASC. A factor < 1.0 reduces the magnitude of the score
    // (makes it less negative), which LOWERS the source's priority in the ranking.
    // PackageFTS is the baseline (implicit factor 1.0); Type and Connector matches are
    // intentionally ranked below it.
    private static final String TYPE_SCORE_WEIGHT = "0.9";
    private static final String CONNECTOR_SCORE_WEIGHT = "0.8";

    // Score adjustment (subtracted from combined_score; lower = better) applied once per
    // additional distinct source table that matched — rewards breadth of coverage.
    private static final String MULTI_SOURCE_BONUS = "0.2";

    // Fixed score adjustment applied when the primary keyword matched at least one source —
    // a package-level bonus independent of how many rows that keyword produced.
    private static final String PRIMARY_KEYWORD_BOOST = "0.3";

    private LibraryDatabaseAccessor() {
        // Prevent instantiation
    }

    /**
     * Loads distinct packages from the database based on the mode.
     * Returns a map with package name (org/package_name) as key and description as value.
     *
     * @param mode the filter mode: "CORE" (ballerina packages only),
     *             "Healthcare" (packages starting with 'health' + ballerina/http),
     *             "ALL" (all packages)
     * @return map of package names to descriptions
     * @throws SQLException if database query fails
     */
    public static Map<String, String> loadAllPackages(String mode) throws SQLException {
        Map<String, String> packageToDescriptionMap = new LinkedHashMap<>();

        String dbPath = getDatabasePath();

        // Build SQL query based on mode using StringBuilder
        StringBuilder sqlBuilder = new StringBuilder();
        sqlBuilder.append("SELECT DISTINCT org, package_name, description FROM Package WHERE package_name IS NOT NULL");

        if (MODE_CORE.equalsIgnoreCase(mode)) {
            // Load only ballerina packages
            sqlBuilder.append(" AND org = 'ballerina'");
        } else if (MODE_HEALTHCARE.equalsIgnoreCase(mode)) {
            // Load packages starting with 'health' and ballerina/http
            sqlBuilder.append(" AND (package_name LIKE 'health%' OR (org = 'ballerina' AND package_name = 'http'))");
        }
        sqlBuilder.append(" ORDER BY org, package_name;");

        String sql = sqlBuilder.toString();

        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {
            populatePackageMap(packageToDescriptionMap, rs);
        }

        return packageToDescriptionMap;
    }

    /**
     * Gets the package description from the database for a given org and package name.
     *
     * @param org         the organization name
     * @param packageName the package name
     * @return Optional containing the description, or empty if not found
     */
    public static Optional<String> getPackageDescription(String org, String packageName) {
        try {
            String dbPath = getDatabasePath();
            String sql = """
                    SELECT description
                    FROM Package
                    WHERE org = ? AND package_name = ?
                    ORDER BY id DESC
                    LIMIT 1;
                    """;

            try (Connection conn = DriverManager.getConnection(dbPath);
                 PreparedStatement stmt = conn.prepareStatement(sql)) {

                stmt.setString(1, org);
                stmt.setString(2, packageName);

                try (ResultSet rs = stmt.executeQuery()) {
                    if (rs.next()) {
                        String desc = rs.getString("description");
                        return Optional.ofNullable(desc);
                    }
                }
            }
        } catch (SQLException e) {
            throw new RuntimeException("Error retrieving package description for " + org + "/" + packageName + ": " +
                    e.getMessage(), e);
        }

        return Optional.empty();
    }

    // Number of libraries fetched by keyword search. This is an over-fetch: the caller applies
    // exclusions and then truncates to the number of results it actually surfaces, so fetching more
    // here keeps an excluded library from consuming a result slot.
    private static final int SEARCH_FETCH_LIMIT = 30;

    private static final String SEARCH_SQL =
            "SELECT p.org, p.package_name, p.description, " +
                    "MIN(weighted_score) - (COUNT(DISTINCT source) - 1) * " + MULTI_SOURCE_BONUS +
                    " - MAX(is_primary) * " + PRIMARY_KEYWORD_BOOST + " AS combined_score " +
                    "FROM ( " +
                    "    SELECT p.id, bm25(PackageFTS, " + BM25_WEIGHTS + ") AS weighted_score,"
                    + " 'Package' AS source, ? AS is_primary " +
                    "    FROM PackageFTS fts INNER JOIN Package p ON fts.rowid = p.id " +
                    "    WHERE PackageFTS MATCH ? AND p.org IS NOT NULL AND p.package_name IS NOT NULL " +
                    "    UNION ALL " +
                    "    SELECT p.id, bm25(PackageFTS, " + BM25_WEIGHTS + ") AS weighted_score,"
                    + " 'Package' AS source, 0 AS is_primary " +
                    "    FROM PackageFTS fts INNER JOIN Package p ON fts.rowid = p.id " +
                    "    WHERE PackageFTS MATCH ? AND p.org IS NOT NULL AND p.package_name IS NOT NULL " +
                    "    UNION ALL " +
                    "    SELECT p.id, bm25(TypeFTS, " + BM25_WEIGHTS + ") * " + TYPE_SCORE_WEIGHT
                    + " AS weighted_score, 'Type' AS source, ? AS is_primary " +
                    "    FROM TypeFTS fts INNER JOIN Type t ON fts.rowid = t.id"
                    + " INNER JOIN Package p ON t.package_id = p.id " +
                    "    WHERE TypeFTS MATCH ? AND p.org IS NOT NULL AND p.package_name IS NOT NULL " +
                    "    UNION ALL " +
                    "    SELECT p.id, bm25(TypeFTS, " + BM25_WEIGHTS + ") * " + TYPE_SCORE_WEIGHT
                    + " AS weighted_score, 'Type' AS source, 0 AS is_primary " +
                    "    FROM TypeFTS fts INNER JOIN Type t ON fts.rowid = t.id"
                    + " INNER JOIN Package p ON t.package_id = p.id " +
                    "    WHERE TypeFTS MATCH ? AND p.org IS NOT NULL AND p.package_name IS NOT NULL " +
                    "    UNION ALL " +
                    "    SELECT p.id, bm25(ConnectorFTS, " + BM25_WEIGHTS + ") * " + CONNECTOR_SCORE_WEIGHT
                    + " AS weighted_score, 'Connector' AS source, ? AS is_primary " +
                    "    FROM ConnectorFTS fts INNER JOIN Connector c ON fts.rowid = c.id"
                    + " INNER JOIN Package p ON c.package_id = p.id " +
                    "    WHERE ConnectorFTS MATCH ? AND p.org IS NOT NULL AND p.package_name IS NOT NULL " +
                    "    UNION ALL " +
                    "    SELECT p.id, bm25(ConnectorFTS, " + BM25_WEIGHTS + ") * " + CONNECTOR_SCORE_WEIGHT
                    + " AS weighted_score, 'Connector' AS source, 0 AS is_primary " +
                    "    FROM ConnectorFTS fts INNER JOIN Connector c ON fts.rowid = c.id"
                    + " INNER JOIN Package p ON c.package_id = p.id " +
                    "    WHERE ConnectorFTS MATCH ? AND p.org IS NOT NULL AND p.package_name IS NOT NULL " +
                    "    UNION ALL " +
                    "    SELECT p.id, bm25(FunctionFTS, " + BM25_WEIGHTS + ") AS weighted_score,"
                    + " 'Function' AS source, ? AS is_primary " +
                    "    FROM FunctionFTS fts INNER JOIN Function f ON fts.rowid = f.id"
                    + " INNER JOIN Package p ON f.package_id = p.id " +
                    "    WHERE FunctionFTS MATCH ? AND p.org IS NOT NULL AND p.package_name IS NOT NULL " +
                    "    UNION ALL " +
                    "    SELECT p.id, bm25(FunctionFTS, " + BM25_WEIGHTS + ") AS weighted_score,"
                    + " 'Function' AS source, 0 AS is_primary " +
                    "    FROM FunctionFTS fts INNER JOIN Function f ON fts.rowid = f.id"
                    + " INNER JOIN Package p ON f.package_id = p.id " +
                    "    WHERE FunctionFTS MATCH ? AND p.org IS NOT NULL AND p.package_name IS NOT NULL " +
                    ") AS combined INNER JOIN Package p ON combined.id = p.id " +
                    "GROUP BY p.org, p.package_name, p.description " +
                    "ORDER BY combined_score LIMIT ?;";

    /**
     * Searches libraries by keywords across packages, types, connectors, and functions using
     * weighted BM25 ranking with keyword priority and multi-source relevance aggregation.
     *
     * @param keywords Array of search keywords ordered by priority (highest priority first)
     * @return map of matching package names to descriptions, ordered by weighted relevance score
     * @throws SQLException if database query fails
     */
    public static Map<String, String> searchLibrariesByKeywords(String[] keywords) throws SQLException {
        Map<String, String> packageToDescriptionMap = new LinkedHashMap<>();

        if (keywords == null || keywords.length == 0) {
            return packageToDescriptionMap;
        }

        // Format queries
        String allPackageQuery = formatForPackageFTS(keywords);
        String allNameDescQuery = formatForNameDescriptionFTS(keywords);

        if (allPackageQuery.isEmpty() && allNameDescQuery.isEmpty()) {
            return packageToDescriptionMap;
        }

        String primaryPackageQuery = formatForPackageFTS(new String[]{keywords[0]});
        String primaryNameDescQuery = formatForNameDescriptionFTS(new String[]{keywords[0]});

        // Use integer for is_primary placeholder
        int primaryFlag = (!primaryPackageQuery.isEmpty() && !primaryNameDescQuery.isEmpty()) ? 1 : 0;

        if (primaryPackageQuery.isEmpty()) {
            primaryPackageQuery = allPackageQuery;
        }
        if (primaryNameDescQuery.isEmpty()) {
            primaryNameDescQuery = allNameDescQuery;
        }

        String dbPath = getDatabasePath();
        try (Connection conn = DriverManager.getConnection(dbPath);
             PreparedStatement stmt = conn.prepareStatement(SEARCH_SQL)) {

            // Bind parameters for the 8 UNION branches + LIMIT
            stmt.setInt(1, primaryFlag);
            stmt.setString(2, primaryPackageQuery);
            stmt.setString(3, allPackageQuery);

            stmt.setInt(4, primaryFlag);
            stmt.setString(5, primaryNameDescQuery);
            stmt.setString(6, allNameDescQuery);

            stmt.setInt(7, primaryFlag);
            stmt.setString(8, primaryNameDescQuery);
            stmt.setString(9, allNameDescQuery);

            stmt.setInt(10, primaryFlag);
            stmt.setString(11, primaryNameDescQuery);
            stmt.setString(12, allNameDescQuery);

            stmt.setInt(13, SEARCH_FETCH_LIMIT);

            try (ResultSet rs = stmt.executeQuery()) {
                populatePackageMap(packageToDescriptionMap, rs);
            }
        }

        return packageToDescriptionMap;
    }

    /**
     * Populates the package map from a ResultSet containing org, package_name, and description columns.
     * Iterates through all rows and adds packages to the map using "org/package_name" as the key.
     * Skips duplicates (if a package already exists in the map, it won't be overwritten).
     *
     * @param packageMap the map to populate
     * @param rs         the ResultSet containing package data
     * @throws SQLException if database access error occurs
     */
    private static void populatePackageMap(Map<String, String> packageMap, ResultSet rs) throws SQLException {
        while (rs.next()) {
            String org = rs.getString("org");
            String packageName = rs.getString("package_name");
            String description = rs.getString("description");

            // Create the full name as "org/package_name"
            String fullName = org + "/" + packageName;

            // Store only if not already present (handles duplicates)
            if (!packageMap.containsKey(fullName)) {
                packageMap.put(fullName, description != null ? description : "");
            }
        }
    }

    /**
     * Sanitizes a keyword for safe use in FTS5 queries by replacing characters that are
     * special in FTS5 syntax (e.g. '.', '-', '/', '(', ')') with spaces.
     *
     * @param keyword the raw keyword
     * @return sanitized keyword, or empty string if nothing remains
     */
    private static String sanitizeForFTS(String keyword) {
        return keyword.replaceAll("[^a-zA-Z0-9 ]", " ").trim().replaceAll("\\s+", " ");
    }

    /**
     * Formats keywords for PackageFTS which searches in package_name, description, and keywords columns.
     * Uses column filters to explicitly search across all three columns.
     *
     * @param keywords array of pre-filtered keywords
     * @return FTS5-formatted query string with column filters
     */
    private static String formatForPackageFTS(String[] keywords) {
        List<String> tokens = new ArrayList<>();

        for (String keyword : keywords) {
            if (keyword == null || keyword.trim().isEmpty()) {
                continue;
            }
            String sanitized = sanitizeForFTS(keyword);
            if (sanitized.isEmpty()) {
                continue;
            }
            // Search in package_name, description, and keywords columns
            tokens.add("{package_name description keywords}: " + sanitized);
        }

        // Combine tokens with OR operator
        return String.join(" OR ", tokens);
    }

    /**
     * Formats keywords for TypeFTS, ConnectorFTS, and FunctionFTS which search in
     * name, description, and package_name columns.
     * Uses column filters to explicitly search across all three columns.
     *
     * @param keywords array of pre-filtered keywords
     * @return FTS5-formatted query string with column filters
     */
    private static String formatForNameDescriptionFTS(String[] keywords) {
        List<String> tokens = new ArrayList<>();

        for (String keyword : keywords) {
            if (keyword == null || keyword.trim().isEmpty()) {
                continue;
            }
            String sanitized = sanitizeForFTS(keyword);
            if (sanitized.isEmpty()) {
                continue;
            }
            // Search in name, description, and package_name columns
            tokens.add("{name description package_name}: " + sanitized);
        }

        // Combine tokens with OR operator
        return String.join(" OR ", tokens);
    }

    private static String getDatabasePath() {
        return SearchDatabaseManager.getInstance().getDbPath();
    }
}
