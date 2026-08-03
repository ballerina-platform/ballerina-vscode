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
import com.google.gson.reflect.TypeToken;
import io.ballerina.centralconnector.CentralAPI;
import io.ballerina.centralconnector.RemoteCentral;
import io.ballerina.centralconnector.response.PackageResponse;
import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.flowmodelgenerator.core.LocalIndexCentral;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Module;
import io.ballerina.projects.PackageCompilation;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Handles the search command for agents. Supports four source types:
 * <ul>
 *   <li>{@code default} - Searches pre-defined agents from LocalIndexCentral (JSON-based)</li>
 *   <li>{@code all} - Curated landing list when no query, else Central "Type/Agent" search; plus workspace agents</li>
 *   <li>{@code organization} - Searches Ballerina Central agents scoped to the current project org</li>
 *   <li>{@code local} - Searches agent classes defined across the current workspace's projects</li>
 * </ul>
 *
 * @since 1.2.0
 */
public class AgentSearchCommand extends SearchCommand {

    private static final Gson GSON = new Gson();
    private static final String AGENT_KEYWORD_FILTER = "keywords:\"Type/Agent\"";
    private static final String CENTRAL_AGENTS_CATEGORY = "Central Agents";
    private static final String LOCAL_AGENTS_CATEGORY = "Local Agents";
    private static final String INIT_SYMBOL = "init";
    private static final String AGENTS_LANDING_JSON = "agents_landing.json";
    private static final Type LANDING_AGENTS_TYPE = new TypeToken<List<AvailableNode>>() { }.getType();

    private static final String SOURCE_DEFAULT = "default";
    private static final String SOURCE_ALL = "all";
    private static final String SOURCE_ORGANIZATION = "organization";
    private static final String SOURCE_LOCAL = "local";

    private List<Item> cachedDefaultAgents;
    private List<AvailableNode> cachedCentralAgents;
    private List<AvailableNode> cachedLandingAgents;
    private final String orgName;
    private final String source;

    public AgentSearchCommand(Project project, LineRange position, Map<String, String> queryMap) {
        super(project, position, queryMap);
        orgName = queryMap.get("orgName");
        source = queryMap.getOrDefault("source", SOURCE_DEFAULT);
    }

    @Override
    protected List<Item> defaultView() {
        return switch (source) {
            case SOURCE_ALL -> getAllAgents(null);
            case SOURCE_ORGANIZATION -> getOrganizationAgents(null);
            case SOURCE_LOCAL -> getLocalAgents(null);
            default -> getDefaultAgents();
        };
    }

    @Override
    protected List<Item> search() {
        return switch (source) {
            case SOURCE_ALL -> getAllAgents(query);
            case SOURCE_ORGANIZATION -> getOrganizationAgents(query);
            case SOURCE_LOCAL -> getLocalAgents(query);
            default -> searchDefaultAgents();
        };
    }

    @Override
    protected Map<String, List<SearchResult>> fetchPopularItems() {
        return Collections.emptyMap();
    }

    @Override
    public JsonArray execute() {
        List<Item> items;
        if (SOURCE_DEFAULT.equals(source)) {
            items = (query.isEmpty() && orgName == null) ? defaultView() : search();
        } else {
            items = query.isEmpty() ? defaultView() : search();
        }
        return GSON.toJsonTree(items).getAsJsonArray();
    }


    private List<Item> getDefaultAgents() {
        if (cachedDefaultAgents == null) {
            cachedDefaultAgents = List.copyOf(LocalIndexCentral.getInstance().getAgents());
        }
        return cachedDefaultAgents;
    }

    private List<Item> searchDefaultAgents() {
        List<Item> agents = getDefaultAgents();
        if (agents.isEmpty() || !(agents.getFirst() instanceof Category agentCategory)) {
            return agents;
        }

        List<Item> matchingAgents = agentCategory.items().stream()
                .filter(item -> item instanceof AvailableNode availableNode &&
                        (orgName == null || availableNode.codedata().org().equalsIgnoreCase(orgName)) &&
                        (query == null || availableNode.metadata().label().toLowerCase(Locale.ROOT)
                                .contains(query.toLowerCase(Locale.ROOT))))
                .toList();

        return List.of(new Category(agentCategory.metadata(), matchingAgents));
    }

    private List<AvailableNode> getLandingAgents() {
        if (cachedLandingAgents == null) {
            try {
                List<AvailableNode> landing =
                        LocalIndexCentral.getInstance().readJsonResource(AGENTS_LANDING_JSON, LANDING_AGENTS_TYPE);
                cachedLandingAgents = landing != null ? landing : List.of();
            } catch (RuntimeException e) {
                cachedLandingAgents = List.of();
            }
        }
        return cachedLandingAgents;
    }


    private List<Item> getAllAgents(String searchQuery) {
        List<AvailableNode> centralAgents = (searchQuery == null || searchQuery.isEmpty())
                ? getLandingAgents()
                : fetchAgentsFromCentral(searchQuery, null);
        if (!centralAgents.isEmpty()) {
            Category.Builder centralBuilder = rootBuilder.stepIn(CENTRAL_AGENTS_CATEGORY, null, null);
            centralAgents.forEach(centralBuilder::node);
        }

        List<AvailableNode> localAgents = filterLocalAgents(getWorkspaceAgents(), searchQuery);
        if (!localAgents.isEmpty()) {
            Category.Builder localBuilder = rootBuilder.stepIn(LOCAL_AGENTS_CATEGORY, null, null);
            localAgents.forEach(localBuilder::node);
        }

        return rootBuilder.build().items();
    }


    private List<Item> getOrganizationAgents(String searchQuery) {
        String currentOrg = getCurrentOrg();
        if (currentOrg == null || currentOrg.isEmpty()) {
            return rootBuilder.build().items();
        }

        List<AvailableNode> agents = fetchAgentsFromCentral(searchQuery, currentOrg);
        if (agents.isEmpty()) {
            return rootBuilder.build().items();
        }

        Category.Builder categoryBuilder = rootBuilder.stepIn(CENTRAL_AGENTS_CATEGORY, null, null);
        agents.forEach(categoryBuilder::node);
        return rootBuilder.build().items();
    }

    private String getCurrentOrg() {
        try {
            return project.currentPackage().packageOrg().value();
        } catch (RuntimeException e) {
            return null;
        }
    }


    /**
     * Fetches packages from Ballerina Central with the "Type/Agent" keyword. Results without a search query are
     * cached in-memory so the initial popup view does not hit the network repeatedly.
     *
     * @param searchQuery optional search query to filter results
     * @param org         optional organization to scope the central search to
     * @return list of AvailableNode representing the packages
     */
    private List<AvailableNode> fetchAgentsFromCentral(String searchQuery, String org) {
        boolean cacheable = (searchQuery == null || searchQuery.isEmpty()) && org == null;
        if (cachedCentralAgents != null && cacheable) {
            return cachedCentralAgents;
        }

        List<AvailableNode> agents = new ArrayList<>();
        try {
            PackageResponse response = getPackageResponse(searchQuery, org);
            if (response != null && response.packages() != null) {
                for (PackageResponse.Package pkg : response.packages()) {
                    agents.add(generateCentralAgentNode(pkg));
                }
            }
            if (cacheable) {
                cachedCentralAgents = agents;
            }
        } catch (RuntimeException ignored) {
        }
        return agents;
    }

    private PackageResponse getPackageResponse(String searchQuery, String org) {
        CentralAPI centralClient = RemoteCentral.getInstance();
        Map<String, String> centralQueryMap = new HashMap<>();
        String q = (searchQuery == null || searchQuery.isEmpty())
                ? AGENT_KEYWORD_FILTER
                : searchQuery + " AND " + AGENT_KEYWORD_FILTER;
        centralQueryMap.put("q", q);
        centralQueryMap.put("limit", String.valueOf(limit));
        centralQueryMap.put("offset", String.valueOf(offset));

        if (org != null && !org.isEmpty()) {
            centralQueryMap.put("org", org);
        }

        return centralClient.searchPackages(centralQueryMap);
    }

    private static AvailableNode generateCentralAgentNode(PackageResponse.Package pkg) {
        Metadata metadata = new Metadata.Builder<>(null)
                .label(pkg.name())
                .description(pkg.summary())
                .icon(CommonUtils.generateIcon(pkg.organization(), pkg.name(), pkg.version()))
                .build();

        Codedata codedata = new Codedata.Builder<>(null)
                .node(NodeKind.AGENT_TYPE)
                .org(pkg.organization())
                .module(pkg.name())
                .packageName(pkg.name())
                .symbol(INIT_SYMBOL)
                .version(pkg.version())
                .build();

        return new AvailableNode(metadata, codedata, true);
    }


    private List<Item> getLocalAgents(String searchQuery) {
        List<AvailableNode> localAgents = filterLocalAgents(getWorkspaceAgents(), searchQuery);
        if (localAgents.isEmpty()) {
            return rootBuilder.build().items();
        }

        Category.Builder categoryBuilder = rootBuilder.stepIn(LOCAL_AGENTS_CATEGORY, null, null);
        localAgents.forEach(categoryBuilder::node);
        return rootBuilder.build().items();
    }

    /**
     * Collects agent classes defined across all projects in the current workspace. Returns empty when the project is
     * not part of a multi-project workspace.
     *
     * @return list of AvailableNode representing workspace agent classes
     */
    private List<AvailableNode> getWorkspaceAgents() {
        BallerinaCompilerApi compilerApi = BallerinaCompilerApi.getInstance();
        Optional<Project> workspaceProject = compilerApi.getWorkspaceProject(project);
        if (workspaceProject.isEmpty()) {
            return List.of();
        }

        List<AvailableNode> agents = new ArrayList<>();
        for (Project childProject : compilerApi.getWorkspaceProjectsInOrder(workspaceProject.get())) {
            agents.addAll(findAgentClasses(childProject));
        }
        return agents;
    }

    private List<AvailableNode> filterLocalAgents(List<AvailableNode> localAgents, String searchQuery) {
        List<AvailableNode> filtered = localAgents;
        if (searchQuery != null && !searchQuery.isEmpty()) {
            String lowered = searchQuery.toLowerCase(Locale.ROOT);
            filtered = filtered.stream()
                    .filter(agent -> agent.metadata().label().toLowerCase(Locale.ROOT).contains(lowered) ||
                            (agent.codedata().object() != null &&
                                    agent.codedata().object().toLowerCase(Locale.ROOT).contains(lowered)))
                    .toList();
        }
        if (orgName != null && !filtered.isEmpty()) {
            filtered = filtered.stream()
                    .filter(agent -> agent.codedata().org().equalsIgnoreCase(orgName))
                    .toList();
        }
        return filtered;
    }

    private static List<AvailableNode> findAgentClasses(Project project) {
        PackageCompilation compilation = PackageUtil.getCompilation(project);
        List<AvailableNode> localAgents = new ArrayList<>();

        for (Module module : project.currentPackage().modules()) {
            SemanticModel semanticModel = compilation.getSemanticModel(module.moduleId());
            for (Symbol symbol : semanticModel.moduleSymbols()) {
                if (symbol.kind() != SymbolKind.CLASS) {
                    continue;
                }

                ClassSymbol classSymbol = (ClassSymbol) symbol;
                if (!CommonUtils.isAiAgentType(classSymbol)) {
                    continue;
                }

                Optional<ModuleSymbol> optModule = symbol.getModule();
                if (optModule.isEmpty()) {
                    continue;
                }

                localAgents.add(buildLocalAgentNode(classSymbol, optModule.get()));
            }
        }

        return localAgents;
    }

    private static AvailableNode buildLocalAgentNode(ClassSymbol classSymbol, ModuleSymbol moduleSymbol) {
        ModuleID moduleId = moduleSymbol.id();
        String className = classSymbol.getName().orElse("Agent");
        String description = classSymbol.documentation()
                .flatMap(Documentation::description)
                .orElse("Local agent class");

        Metadata metadata = new Metadata.Builder<>(null)
                .label(className)
                .description(description)
                .icon(CommonUtils.generateIcon(moduleId.orgName(), moduleId.packageName(), moduleId.version()))
                .build();

        Codedata codedata = new Codedata.Builder<>(null)
                .node(NodeKind.AGENT_TYPE)
                .org(moduleId.orgName())
                .module(moduleId.moduleName())
                .packageName(moduleId.packageName())
                .object(className)
                .symbol(INIT_SYMBOL)
                .version(moduleId.version())
                .isGenerated(true)
                .build();

        return new AvailableNode(metadata, codedata, true);
    }
}
