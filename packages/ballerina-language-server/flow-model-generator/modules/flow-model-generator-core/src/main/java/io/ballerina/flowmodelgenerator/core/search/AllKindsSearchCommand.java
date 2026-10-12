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

import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Supplier;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Search command behind the node panel's master search. It runs the function search and the connector search side by
 * side and merges their results, so the master search uses the same data source as "Call a Function" and "Add
 * Connection" (Ballerina Central, falling back to the local index), the same organization and package filters, and
 * the same categories.
 *
 * <p>The master search is a preview of both kinds: each kind gets half of the requested page, and at least
 * {@value #MIN_KIND_LIMIT} items, so a kind can return fewer results here than its own search does.</p>
 *
 * <p>The function results keep their own categories (current integration or workspace, agent tools, imported
 * functions, standard library and extended library). The connector results are placed under a single
 * {@value #CONNECTORS_CATEGORY} category: a query returns them ungrouped, and the default view keeps their groups
 * inside that category.</p>
 *
 * @since 1.7.0
 */
public class AllKindsSearchCommand extends SearchCommand {

    private static final Logger LOGGER = Logger.getLogger(AllKindsSearchCommand.class.getName());
    private static final String CONNECTORS_CATEGORY = "Connectors";
    private static final int MIN_KIND_LIMIT = 10;
    // Shared by every master search, which runs on each debounced keystroke. Idle threads are reused, and a search is
    // never queued behind a slower earlier one still waiting on Central.
    private static final ExecutorService SEARCH_EXECUTOR = Executors.newCachedThreadPool(runnable -> {
        Thread thread = new Thread(runnable, "master-search");
        thread.setDaemon(true);
        return thread;
    });

    private final Document functionsDoc;

    public AllKindsSearchCommand(Project project, LineRange position, Map<String, String> queryMap,
                                 Document functionsDoc) {
        super(project, position, queryMap);
        this.functionsDoc = functionsDoc;
    }

    @Override
    protected List<Item> defaultView() {
        return searchAllKinds();
    }

    @Override
    protected List<Item> search() {
        return searchAllKinds();
    }

    @Override
    protected Map<String, List<SearchResult>> fetchPopularItems() {
        // The delegated commands fetch their own popular items.
        return Map.of();
    }

    private List<Item> searchAllKinds() {
        SearchCommand functionSearch = new FunctionSearchCommand(project, position, kindQueryMap(), functionsDoc);
        SearchCommand connectorSearch = new ConnectorSearchCommand(project, position, kindQueryMap());
        return searchInParallel(functionSearch::items, connectorSearch::items);
    }

    /**
     * Runs the function and connector searches in parallel and merges their results. Both searches wait on Ballerina
     * Central, so running them side by side bounds the latency to the slower of the two rather than their sum.
     *
     * @param functionSearch  the function search
     * @param connectorSearch the connector search
     * @return the function results, followed by the connector results under a single category
     */
    static List<Item> searchInParallel(Supplier<List<Item>> functionSearch, Supplier<List<Item>> connectorSearch) {
        CompletableFuture<List<Item>> functionItems = CompletableFuture.supplyAsync(functionSearch, SEARCH_EXECUTOR);
        CompletableFuture<List<Item>> connectorItems = CompletableFuture.supplyAsync(connectorSearch, SEARCH_EXECUTOR);

        List<Item> allItems = new ArrayList<>(join(functionItems));
        List<Item> connectors = join(connectorItems);
        if (!connectors.isEmpty()) {
            allItems.add(new Category.Builder(null).stepIn(CONNECTORS_CATEGORY, null, null).items(connectors).build());
        }
        return allItems;
    }

    private static List<Item> join(CompletableFuture<List<Item>> future) {
        try {
            List<Item> items = future.join();
            return items != null ? items : List.of();
        } catch (CompletionException e) {
            // One kind failing must not hide the results of the other.
            LOGGER.log(Level.WARNING, "Master search failed for one kind of result", e.getCause());
            return List.of();
        }
    }

    /**
     * The query map for a delegated command. Each kind gets half of the page, and at least {@value #MIN_KIND_LIMIT}
     * items. The master search has no paging, so the offset is passed through unchanged.
     */
    private Map<String, String> kindQueryMap() {
        Map<String, String> kindQueryMap = new HashMap<>();
        kindQueryMap.put("q", query);
        kindQueryMap.put("limit", String.valueOf(Math.max(MIN_KIND_LIMIT, limit / 2)));
        kindQueryMap.put("offset", String.valueOf(offset));
        return kindQueryMap;
    }
}
