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

import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Category.Builder;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.utils.ConnectorUtil;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleCoordinate;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.modelgenerator.commons.UnifiedSearchResult;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;

import static io.ballerina.flowmodelgenerator.core.model.Category.Name.IMPORTED_FUNCTIONS;
import static io.ballerina.flowmodelgenerator.core.model.Category.Name.STANDARD_LIBRARY;

/**
 * Optimized search command implementation that uses a hybrid approach:
 * - Fast database queries using existing unified SearchDatabaseManager methods for functions/connectors
 * - Parallel local searches for project-specific search types (AI components, local utilities, etc.)
 * - Unified result processing and deduplication
 *
 * This provides complete coverage of functions and connectors search types while maintaining performance.
 *
 * @since 1.7.0
 */
public class AllKindsSearchCommand extends SearchCommand {

    private final Document functionsDoc;
    private final Set<ModuleCoordinate> importedModules;
    private final ExecutorService executorService;

    // Database search types (fast path)
    private static final List<Kind> DATABASE_SEARCH_TYPES = List.of(
            Kind.FUNCTION,
            Kind.CONNECTOR
    );

    public AllKindsSearchCommand(Project project, LineRange position, Map<String, String> queryMap,
                                 Document functionsDoc) {
        super(project, position, queryMap);
        this.functionsDoc = functionsDoc;
        this.importedModules = ImportedModules.collect(project);
        this.executorService = Executors.newCachedThreadPool();
    }

    @Override
    protected List<Item> defaultView() {
        return executeHybridSearch();
    }

    @Override
    protected List<Item> search() {
        return executeHybridSearch();
    }

    @Override
    protected Map<String, List<SearchResult>> fetchPopularItems() {
        Map<String, List<SearchResult>> popularItems = new HashMap<>();

        for (Kind searchType : DATABASE_SEARCH_TYPES) {
            try {
                SearchCommand command = createSearchCommand(searchType);
                Map<String, List<SearchResult>> typePopularItems = command.fetchPopularItems();
                popularItems.putAll(typePopularItems);
            } catch (RuntimeException e) {
                // Continue with other search types if one fails
            }
        }

        return popularItems;
    }

    /**
     * Executes hybrid search combining fast database queries with parallel local searches.
     */
    private List<Item> executeHybridSearch() {
        // Add workspace functions to the root builder
        WorkspaceFunctionNodeBuilder.buildWorkspaceNodes(rootBuilder, project, position, query, functionsDoc);

        List<CompletableFuture<List<Item>>> futures = new ArrayList<>();

        CompletableFuture<List<Item>> databaseFuture = CompletableFuture.supplyAsync(() -> {
            try {
                List<UnifiedSearchResult> unifiedResults = dbManager.searchAllTypes(query, limit, offset);
                return processDatabaseResults(unifiedResults);
            } catch (RuntimeException e) {
                return Collections.emptyList();
            }
        }, executorService);
        futures.add(databaseFuture);

        List<Item> dbItems = aggregateResults(futures);

        // Combine workspace items (already in rootBuilder) with database items
        List<Item> workspaceItems = rootBuilder.build().items();
        List<Item> allItems = new ArrayList<>(workspaceItems);
        allItems.addAll(dbItems);
        return deduplicateItems(allItems);
    }

    /**
     * Processes unified database results and converts them directly to Items.
     */
    private List<Item> processDatabaseResults(List<UnifiedSearchResult> unifiedResults) {
        Builder rootBuilder = new Builder(null);

        List<UnifiedSearchResult> functions = new ArrayList<>();
        List<UnifiedSearchResult> connectors = new ArrayList<>();

        for (UnifiedSearchResult result : unifiedResults) {
            if ("function".equals(result.getResultType())) {
                functions.add(result);
            } else if ("connector".equals(result.getResultType())) {
                connectors.add(result);
            }
        }

        if (!functions.isEmpty()) {
            List<SearchResult> functionResults = functions.stream()
                    .map(UnifiedSearchResult::getSearchResult)
                    .collect(Collectors.toList());
            buildLibraryNodesFromResults(functionResults, rootBuilder);
        }

        if (!connectors.isEmpty()) {
            List<SearchResult> connectorResults = connectors.stream()
                    .map(UnifiedSearchResult::getSearchResult)
                    .collect(Collectors.toList());
            buildLibraryNodesFromConnectorResults(connectorResults, rootBuilder);
        }

        return rootBuilder.build().items();
    }

    /**
     * Builds function nodes grouped by package modules under Imported Functions or Standard Library.
     */
    private void buildLibraryNodesFromResults(List<SearchResult> results, Builder rootBuilder) {
        if (results.isEmpty()) {
            return;
        }

        Builder importedFnBuilder = rootBuilder.stepIn(IMPORTED_FUNCTIONS);
        Builder stdLibBuilder = rootBuilder.stepIn(STANDARD_LIBRARY);

        for (SearchResult result : results) {
            String moduleName = result.packageInfo().moduleName();
            // Org-aware: this pool is a global query, so a same-named package from another org must not be
            // mistaken for the import.
            Builder builder = importedModules.contains(
                    new ModuleCoordinate(result.packageInfo().org(), moduleName))
                    ? importedFnBuilder : stdLibBuilder;
            builder.stepIn(moduleName, "", List.of())
                    .node(createFunctionNode(result));
        }
    }

    /**
     * Builds connector nodes under a single "Connectors" category.
     */
    private void buildLibraryNodesFromConnectorResults(List<SearchResult> results, Builder rootBuilder) {
        if (results.isEmpty()) {
            return;
        }

        Builder connectorsBuilder = rootBuilder.stepIn("Connectors", null, null);
        for (SearchResult result : results) {
            connectorsBuilder.node(createConnectorNode(result));
        }
    }

    /**
     * Creates a function node with proper metadata.
     */
    private AvailableNode createFunctionNode(SearchResult result) {
        String icon = CommonUtils.generateIcon(
                result.packageInfo().org(), result.packageInfo().packageName(), result.packageInfo().version());

        Metadata metadata = new Metadata.Builder<>(null)
                .label(result.name())
                .description(result.description())
                .icon(icon)
                .build();

        Codedata codedata = new Codedata.Builder<>(null)
                .node(NodeKind.FUNCTION_CALL)
                .org(result.packageInfo().org())
                .module(result.packageInfo().moduleName())
                .packageName(result.packageInfo().packageName())
                .symbol(result.name())
                .version(result.packageInfo().version())
                .build();

        return new AvailableNode(metadata, codedata, true);
    }

    /**
     * Creates a connector node with proper metadata and connection structure.
     */
    private AvailableNode createConnectorNode(SearchResult result) {
        String icon = CommonUtils.generateIcon(
                result.packageInfo().org(), result.packageInfo().packageName(), result.packageInfo().version());

        String connectorName = ConnectorUtil.getConnectorName(result.name(), result.packageInfo().moduleName());

        Metadata metadata = new Metadata.Builder<>(null)
                .label(connectorName)
                .description(result.description())
                .icon(icon)
                .build();

        Codedata codedata = new Codedata.Builder<>(null)
                .node(NodeKind.NEW_CONNECTION)
                .org(result.packageInfo().org())
                .module(result.packageInfo().moduleName())
                .packageName(result.packageInfo().packageName())
                .object(result.name())
                .symbol("init")
                .version(result.packageInfo().version())
                .isGenerated(false)
                .build();

        return new AvailableNode(metadata, codedata, true);
    }

    /**
     * Creates a search command instance for the specified search type.
     */
    private SearchCommand createSearchCommand(Kind searchType) {
        return switch (searchType) {
            case FUNCTION ->
                    new FunctionSearchCommand(project, position, getQueryMapForType(searchType), functionsDoc);
            case CONNECTOR -> new ConnectorSearchCommand(project, position, getQueryMapForType(searchType));
            default -> throw new IllegalArgumentException("Unsupported search type: " + searchType);
        };
    }

    /**
     * Aggregates results from all search futures, applies deduplication and ranking.
     */
    private List<Item> aggregateResults(List<CompletableFuture<List<Item>>> futures) {
        List<Item> allItems = new ArrayList<>();

        for (CompletableFuture<List<Item>> future : futures) {
            try {
                List<Item> items = future.get();
                if (items != null) {
                    allItems.addAll(items);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (ExecutionException e) {
                // Continue with other results if one fails
            }
        }

        return deduplicateItems(allItems);
    }

    /**
     * Removes duplicate items based on their key properties.
     */
    private List<Item> deduplicateItems(List<Item> items) {
        Map<String, Item> uniqueItems = new HashMap<>();

        for (Item item : items) {
            String key = generateItemKey(item);
            if (!uniqueItems.containsKey(key)) {
                uniqueItems.put(key, item);
            }
        }

        return new ArrayList<>(uniqueItems.values());
    }

    /**
     * Generates a unique key for an item based on its properties.
     */
    private String generateItemKey(Item item) {
        if (item instanceof AvailableNode availableNode) {
            if (availableNode.codedata() != null && availableNode.codedata().node() != null) {
                String symbol = availableNode.codedata().symbol() != null ?
                        availableNode.codedata().symbol() : "";
                String kind = availableNode.codedata().node().toString();
                String org = availableNode.codedata().org() != null ?
                        availableNode.codedata().org() : "";
                String module = availableNode.codedata().module() != null ?
                        availableNode.codedata().module() : "";
                return org + ":" + module + ":" + symbol + ":" + kind;
            }
        }

        if (item instanceof Category category) {
            return "category:" + (category.metadata() != null ? category.metadata().label() : "unknown");
        }

        return item.getClass().getSimpleName() + ":" + System.identityHashCode(item);
    }

    /**
     * Creates a query map for a specific search type.
     */
    private Map<String, String> getQueryMapForType(Kind searchType) {
        Map<String, String> typeQueryMap = new HashMap<>();
        typeQueryMap.put("q", query);

        int typeLimit = DATABASE_SEARCH_TYPES.contains(searchType) ?
                Math.max(10, limit / 2) : Math.max(5, limit / 5);

        typeQueryMap.put("limit", String.valueOf(typeLimit));
        typeQueryMap.put("offset", String.valueOf(offset));
        return typeQueryMap;
    }
}
