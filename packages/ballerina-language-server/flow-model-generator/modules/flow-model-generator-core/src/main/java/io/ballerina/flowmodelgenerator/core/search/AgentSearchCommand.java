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
 * Handles the search command for agents.
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
        addCategory(CENTRAL_AGENTS_CATEGORY, centralAgents);
        addCategory(LOCAL_AGENTS_CATEGORY, filterLocalAgents(getWorkspaceAgents(), searchQuery));
        return rootBuilder.build().items();
    }

    private List<Item> getOrganizationAgents(String searchQuery) {
        String currentOrg = getCurrentOrg();
        if (currentOrg == null || currentOrg.isEmpty()) {
            return rootBuilder.build().items();
        }
        addCategory(CENTRAL_AGENTS_CATEGORY, fetchAgentsFromCentral(searchQuery, currentOrg));
        return rootBuilder.build().items();
    }

    private String getCurrentOrg() {
        try {
            return project.currentPackage().packageOrg().value();
        } catch (RuntimeException e) {
            return null;
        }
    }
    private List<AvailableNode> fetchAgentsFromCentral(String searchQuery, String org) {
        try {
            PackageResponse response = getPackageResponse(searchQuery, org);
            return response == null || response.packages() == null ? List.of()
                    : response.packages().stream().map(AgentSearchCommand::generateCentralAgentNode).toList();
        } catch (RuntimeException ignored) {
            return List.of();
        }
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
                .node(NodeKind.TYPED_AGENT)
                .org(pkg.organization())
                .module(pkg.name())
                .packageName(pkg.name())
                .symbol(INIT_SYMBOL)
                .version(pkg.version())
                .build();

        return new AvailableNode(metadata, codedata, true);
    }
    private List<Item> getLocalAgents(String searchQuery) {
        addCategory(LOCAL_AGENTS_CATEGORY, filterLocalAgents(getWorkspaceAgents(), searchQuery));
        return rootBuilder.build().items();
    }

    private void addCategory(String name, List<AvailableNode> agents) {
        if (!agents.isEmpty()) {
            agents.forEach(rootBuilder.stepIn(name, null, null)::node);
        }
    }

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
        String loweredQuery = searchQuery == null ? "" : searchQuery.toLowerCase(Locale.ROOT);
        return localAgents.stream()
                .filter(agent -> orgName == null || agent.codedata().org().equalsIgnoreCase(orgName))
                .filter(agent -> loweredQuery.isEmpty()
                        || agent.metadata().label().toLowerCase(Locale.ROOT).contains(loweredQuery)
                        || (agent.codedata().object() != null
                        && agent.codedata().object().toLowerCase(Locale.ROOT).contains(loweredQuery)))
                .toList();
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
                .node(CommonUtils.isAgentClass(classSymbol) ? NodeKind.AGENT : NodeKind.TYPED_AGENT)
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
