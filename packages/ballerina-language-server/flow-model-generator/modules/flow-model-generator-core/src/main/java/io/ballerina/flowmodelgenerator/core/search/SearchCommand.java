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

package io.ballerina.flowmodelgenerator.core.search;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.modelgenerator.commons.SearchDatabaseManager;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Abstract base class for search command operations that handles different types of searches in a module context. This
 * class provides the foundation for specific search implementations for the search API.
 *
 * <p>Search commands can be created using the factory method
 * which returns the appropriate implementation based on the specified kind. The class follows the command design
 * pattern allowing to execute various search strategies depending on the commands.</p>
 *
 * @since 1.0.0
 */
public abstract class SearchCommand {

    protected final Category.Builder rootBuilder;
    protected final Project project;
    protected final LineRange position;
    protected final String query;
    protected final int limit;
    protected final int offset;
    private final boolean filterByCurrentOrg;
    final SearchDatabaseManager dbManager;
    final DefaultViewHolder defaultViewHolder;

    protected static final String DATA_MAPPER_FILE_NAME = "data_mappings.bal";
    protected static final String CURRENT_INTEGRATION_INDICATOR = " (Current Integration)";

    private static final Gson GSON = new Gson();
    private static final int DEFAULT_LIMIT = 20;
    private static final int DEFAULT_OFFSET = 0;
    private static final boolean DEFAULT_FILTER_BY_CURRENT_ORG = false;

    public static SearchCommand from(Kind kind, Project module, LineRange position, Map<String, String> queryMap,
                                     Document functionsDoc) {
        return switch (kind) {
            case FUNCTION -> new FunctionSearchCommand(module, position, queryMap, functionsDoc);
            case CONNECTOR -> new ConnectorSearchCommand(module, position, queryMap);
            case NP_FUNCTION -> new NPFunctionSearchCommand(module, position, queryMap, functionsDoc);
            case TYPE -> new TypeSearchCommand(module, position, queryMap);
            case MODEL_PROVIDER -> new ModelProviderSearchCommand(module, position, queryMap);
            case EMBEDDING_PROVIDER -> new EmbeddingProviderSearchCommand(module, position, queryMap);
            case VECTOR_STORE -> new VectorStoreSearchCommand(module, position, queryMap);
            case DATA_LOADER -> new DataLoaderSearchCommand(module, position, queryMap);
            case CHUNKER -> new ChunkerSearchCommand(module, position, queryMap);
            case AGENT -> new AgentSearchCommand(module, position, queryMap);
            case CLASS_INIT -> new ClassInitSearchCommand(module, position,
                    queryMap); // This is a temporary implementation, to support ballerinax/ai usage
            case MEMORY -> new MemoryManagerSearchCommand(module, position, queryMap);
            case SHORT_TERM_MEMORY_STORE -> new ShortTermMemoryStoreSearchCommand(module, position, queryMap);
            case AGENT_TOOL -> new AgentToolSearchCommand(module, position, queryMap);
            case KNOWLEDGE_BASE -> new KnowledgeBaseSearchCommand(module, position, queryMap);
            case ALL -> new AllKindsSearchCommand(module, position, queryMap, functionsDoc);
            case WORKFLOW_RUN -> new WorkflowSearchCommand(module, position, queryMap);
            case ACTIVITY_CALL -> new ActivitySearchCommand(module, position, queryMap);
            case EVAL_TEMPLATE -> new EvalTemplateSearchCommand(module, position, queryMap);
        };
    }

    public SearchCommand(Project project, LineRange position, Map<String, String> queryMap) {
        this.rootBuilder = new Category.Builder(null);
        this.project = project;
        this.position = position;
        this.dbManager = SearchDatabaseManager.getInstance();
        this.defaultViewHolder = DefaultViewHolder.getInstance();

        if (queryMap == null) {
            this.query = "";
            this.limit = DEFAULT_LIMIT;
            this.offset = DEFAULT_OFFSET;
            this.filterByCurrentOrg = DEFAULT_FILTER_BY_CURRENT_ORG;
        } else {
            this.query = queryMap.getOrDefault("q", "");
            this.limit = parseIntParam(queryMap.get("limit"), DEFAULT_LIMIT);
            this.offset = parseIntParam(queryMap.get("offset"), DEFAULT_OFFSET);
            this.filterByCurrentOrg = parseBooleanParam(queryMap.get("filterByCurrentOrg"),
                    DEFAULT_FILTER_BY_CURRENT_ORG);
        }
    }

    /**
     * Returns the default view of search results.
     *
     * @return List of search results
     */
    protected abstract List<Item> defaultView();

    /**
     * Performs a search with the given query parameters.
     *
     * @return List of search results
     */
    protected abstract List<Item> search();

    /**
     * Fetches the popular items if not cached already.
     *
     * @return a list of popular search results
     */
    protected abstract Map<String, List<SearchResult>> fetchPopularItems();

    /**
     * Performs a search with the given query parameters within the current organization.
     *
     * @return List of search results
     */
    protected List<Item> searchCurrentOrganization(String currentOrg) {
        throw new UnsupportedOperationException("Organization search is not supported for this command");
    }

    /**
     * Executes the search based on the current search parameters.
     *
     * @return List of search results
     */
    public JsonArray execute() {
        List<Item> items;
        if (this.filterByCurrentOrg) {
            String currentOrg = project.currentPackage().ballerinaToml()
                    .flatMap(toml -> toml.tomlDocument().toml().getTable("package")
                            .flatMap(table -> table.get("org"))
                            .flatMap(orgValue -> Optional.ofNullable(orgValue.toString())))
                    .orElse(null);
            items = searchCurrentOrganization(currentOrg);
        } else if (query.isEmpty()) {
            items = defaultView();
        } else {
            items = search();
        }
        return GSON.toJsonTree(items).getAsJsonArray();
    }

    /**
     * Utility method to parse string parameters to integers with default values.
     *
     * @param value        The string value to parse
     * @param defaultValue Default value to use if parsing fails
     * @return The parsed integer or default value
     */
    private static int parseIntParam(String value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }

        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    /**
     * Utility method to parse boolean parameters with a default value.
     *
     * @param value        The string value to parse
     * @param defaultValue Default value to use if parsing fails
     * @return The parsed boolean or default value
     */
    private static boolean parseBooleanParam(String value, boolean defaultValue) {
        if (value == null) {
            return defaultValue;
        }

        try {
            return Boolean.parseBoolean(value);
        } catch (Exception e) {
            return defaultValue;
        }
    }

    public enum Kind {
        FUNCTION,
        CONNECTOR,
        TYPE,
        NP_FUNCTION,
        MODEL_PROVIDER,
        EMBEDDING_PROVIDER,
        VECTOR_STORE,
        DATA_LOADER,
        CHUNKER,
        AGENT,
        CLASS_INIT,
        MEMORY,
        SHORT_TERM_MEMORY_STORE,
        AGENT_TOOL,
        KNOWLEDGE_BASE,
        ALL,
        WORKFLOW_RUN,
        ACTIVITY_CALL,
        EVAL_TEMPLATE
    }
}
