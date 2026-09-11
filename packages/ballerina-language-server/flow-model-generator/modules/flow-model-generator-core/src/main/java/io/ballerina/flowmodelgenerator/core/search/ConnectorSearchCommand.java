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

import com.google.gson.reflect.TypeToken;
import io.ballerina.centralconnector.RemoteCentral;
import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.flowmodelgenerator.core.LocalIndexCentral;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.node.NewConnectionBuilder;
import io.ballerina.flowmodelgenerator.core.utils.CentralSearchUtil;
import io.ballerina.flowmodelgenerator.core.utils.ConnectorCategoryResolver;
import io.ballerina.flowmodelgenerator.core.utils.ConnectorUtil;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Module;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Handles the search command for connectors.
 *
 * @since 1.0.0
 */
public class ConnectorSearchCommand extends SearchCommand {

    private static final String CONNECTORS_LANDING_JSON = "connectors_landing.json";
    private static final String AGENT_SUPPORT_CONNECTORS_JSON = "agent_support_connectors.json";

    private static final String CONNECTOR_SET_KEY = "connectorSet";
    private static final String GROUPED_CONNECTOR_SET = "GROUPED";

    private static final Type CONNECTION_CATEGORY_LIST_TYPE = new TypeToken<Map<String, List<String>>>() { }.getType();
    private static final Type AGENT_SUPPORT_CONNECTORS_LIST_TYPE = new TypeToken<Set<String>>() { }.getType();

    private static final Set<String> AGENT_SUPPORT_CONNECTORS = LocalIndexCentral.getInstance()
            .readJsonResource(AGENT_SUPPORT_CONNECTORS_JSON, AGENT_SUPPORT_CONNECTORS_LIST_TYPE);
    public static final String IS_AGENT_SUPPORT = "isAgentSupport";
    private static final Set<String> BLACKLISTED_CONNECTOR_NAME_PATTERNS = Set.of("ModelProvider");
    private static final Set<String> ALLOWED_ORGANIZATIONS = Set.of("ballerina", "ballerinax", "wso2");

    private static boolean isBlacklisted(String connectorName) {
        return BLACKLISTED_CONNECTOR_NAME_PATTERNS.stream().anyMatch(connectorName::contains);
    }

    private final boolean groupedConnectorSet;

    public ConnectorSearchCommand(Project project, LineRange position, Map<String, String> queryMap) {
        super(project, position, queryMap);
        this.groupedConnectorSet =
                queryMap != null && GROUPED_CONNECTOR_SET.equals(queryMap.get(CONNECTOR_SET_KEY));
    }

    @Override
    protected List<Item> defaultView() {
        List<SearchResult> localConnectors = getLocalConnectors().stream()
                .filter(result -> !isBlacklisted(result.name()))
                .toList();
        Category.Builder localCategoryBuilder = rootBuilder.stepIn("Local", null, null);
        localConnectors.forEach(connection -> localCategoryBuilder.node(generateAvailableNode(connection, true)));

        Map<String, List<SearchResult>> categories = fetchPopularItems();
        for (Map.Entry<String, List<SearchResult>> entry : categories.entrySet()) {
            Category.Builder categoryBuilder = rootBuilder.stepIn(entry.getKey(), null, null);
            entry.getValue().forEach(searchResult -> categoryBuilder.node(generateAvailableNode(searchResult)));
        }

        return rootBuilder.build().items();
    }

    @Override
    protected List<Item> search() {
        // Search local connectors and rank them by relevance
        // TODO: The current search does not combine local and standard connectors when calculating the relevance
        //  score. Consequently, results are currently returned in sets, and pagination does not work uniformly.
        List<SearchResult> localConnectors = getLocalConnectors().stream()
                .filter(result -> !isBlacklisted(result.name()))
                .toList();
        List<ScoredConnector> scoredConnectors = new ArrayList<>();
        for (SearchResult connector : localConnectors) {
            int score = RelevanceCalculator.calculateFuzzyRelevanceScore(
                    ConnectorUtil.getConnectorName(connector.name(), connector.packageInfo().moduleName()),
                    connector.description(), query);
            if (score > 0) {
                scoredConnectors.add(new ScoredConnector(connector, score));
            }
        }
        scoredConnectors.sort(Comparator.comparingInt(ScoredConnector::score).reversed());
        scoredConnectors.forEach(result -> rootBuilder.node(generateAvailableNode(result.searchResult(), true)));

        // Search connectors from Ballerina Central, falling back to local database on failure or timeout
        String currentOrg = project.currentPackage().packageOrg().value();
        Set<String> allowedOrgs = new HashSet<>(ALLOWED_ORGANIZATIONS);
        if (currentOrg != null && !currentOrg.isEmpty()) {
            allowedOrgs.add(currentOrg);
        }

        CentralSearchUtil centralSearch = new CentralSearchUtil(RemoteCentral.getInstance());
        List<SearchResult> centralConnectors = centralSearch.searchConnectors(query, limit, offset,
                allowedOrgs, BLACKLISTED_CONNECTOR_NAME_PATTERNS);
        if (centralConnectors != null) {
            centralConnectors.forEach(searchResult -> rootBuilder.node(generateAvailableNode(searchResult)));
        } else {
            List<SearchResult> indexSearchResults = dbManager.searchConnectors(query, limit, offset,
                    allowedOrgs, BLACKLISTED_CONNECTOR_NAME_PATTERNS);
            indexSearchResults.forEach(searchResult -> rootBuilder.node(generateAvailableNode(searchResult)));
        }

        return rootBuilder.build().items();
    }

    @Override
    protected List<Item> searchCurrentOrganization(String currentOrg) {
        CentralSearchUtil centralSearch = new CentralSearchUtil(RemoteCentral.getInstance());
        List<SearchResult> organizationConnectors = centralSearch.searchConnectorsByOrganization(
                currentOrg, query, limit, offset, BLACKLISTED_CONNECTOR_NAME_PATTERNS);
        organizationConnectors.forEach(searchResult -> rootBuilder.node(generateAvailableNode(searchResult)));
        return rootBuilder.build().items();
    }

    @Override
    protected Map<String, List<SearchResult>> fetchPopularItems() {
        if (groupedConnectorSet) {
            return fetchGroupedItems();
        }
        Map<String, List<String>> categories = LocalIndexCentral.getInstance()
                .readJsonResource(CONNECTORS_LANDING_JSON, CONNECTION_CATEGORY_LIST_TYPE);

        Map<String, List<SearchResult>> defaultView = new LinkedHashMap<>();
        for (Map.Entry<String, List<String>> category : categories.entrySet()) {
            List<String> packageList = category.getValue();
            List<SearchResult> searchResults = dbManager.searchConnectorsByPackage(packageList, limit, offset);
            SearchResult.sortByPackageListOrder(searchResults, packageList);
            defaultView.put(category.getKey(), searchResults.stream()
                    .filter(result -> !isBlacklisted(result.name()))
                    .toList());
        }
        return defaultView;
    }

    private Map<String, List<SearchResult>> fetchGroupedItems() {
        return ConnectorCategoryResolver.group(dbManager.listConnectors(ALLOWED_ORGANIZATIONS));
    }

    private static AvailableNode generateAvailableNode(SearchResult searchResult) {
        return generateAvailableNode(searchResult, false);
    }

    private static AvailableNode generateAvailableNode(SearchResult searchResult, boolean isGenerated) {
        SearchResult.Package packageInfo = searchResult.packageInfo();
        Metadata metadata = new Metadata.Builder<>(null)
                .label(ConnectorUtil.getConnectorName(searchResult.name(), packageInfo.moduleName()))
                .description(searchResult.description())
                .icon(CommonUtils.generateIcon(packageInfo.org(), packageInfo.packageName(), packageInfo.version()))
                .addData(IS_AGENT_SUPPORT, AGENT_SUPPORT_CONNECTORS.contains(packageInfo.moduleName()))
                .build();
        Codedata codedata = new Codedata.Builder<>(null)
                .node(NodeKind.NEW_CONNECTION)
                .org(packageInfo.org())
                .module(packageInfo.moduleName())
                .packageName(packageInfo.packageName())
                .object(searchResult.name())
                .symbol(NewConnectionBuilder.INIT_SYMBOL)
                .version(packageInfo.version())
                .isGenerated(isGenerated)
                .build();
        return new AvailableNode(metadata, codedata, true);
    }

    private List<SearchResult> getLocalConnectors() {
        PackageCompilation compilation = PackageUtil.getCompilation(project);
        Iterable<Module> modules = project.currentPackage().modules();
        List<SearchResult> localConnections = new ArrayList<>();
        for (Module module : modules) {
            if (module.isDefaultModule()) {
                continue;
            }
            SemanticModel semanticModel = compilation.getSemanticModel(module.moduleId());
            List<Symbol> symbols = semanticModel.moduleSymbols();
            for (Symbol symbol : symbols) {
                if (symbol.kind() != SymbolKind.CLASS) {
                    continue;
                }
                ClassSymbol classSymbol = (ClassSymbol) symbol;
                if (!classSymbol.qualifiers().contains(Qualifier.CLIENT)) {
                    continue;
                }
                Optional<ModuleSymbol> optModule = symbol.getModule();
                if (optModule.isEmpty()) {
                    throw new IllegalStateException("Module cannot be found for the symbol: " + symbol.getName());
                }
                ModuleID id = optModule.get().id();
                String doc = "";
                if (classSymbol.documentation().isPresent()) {
                    doc = classSymbol.documentation().get().description().orElse("");
                }
                SearchResult searchResult = SearchResult.from(id.orgName(),
                        id.packageName(), id.moduleName().substring(id.packageName().length() + 1),
                        id.version(), classSymbol.getName().orElse(ConnectorUtil.CLIENT), doc);
                localConnections.add(searchResult);
            }
        }
        return localConnections;
    }

    private record ScoredConnector(SearchResult searchResult, int score) {
    }
}
