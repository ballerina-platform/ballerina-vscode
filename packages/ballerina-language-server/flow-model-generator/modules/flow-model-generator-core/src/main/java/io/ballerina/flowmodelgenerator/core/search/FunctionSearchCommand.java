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

import io.ballerina.centralconnector.RemoteCentral;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.utils.CentralSearchUtil;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleCoordinate;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Document;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.UnaryOperator;

/**
 * Discovers imported functions from resolved compiler symbols and pages eligible library functions. Every resolved
 * DEFAULT-scope package version, including transitive dependencies, is authoritative: registry rows at another version
 * are rebased onto it when the resolved package declares the function. Unresolved imports never use latest-version
 * fallback. Registry discovery is Central-first with independently paginated SQLite fallback, rather than a cached
 * popular-first default view.
 *
 * @since 1.0.0
 */
class FunctionSearchCommand extends SearchCommand {
    private static final String STANDARD_LIBRARY_ORG = "ballerina";
    private static final String EXTENDED_LIBRARY_ORG = "ballerinax";
    private static final List<String> LIBRARY_ORGS = List.of(STANDARD_LIBRARY_ORG, EXTENDED_LIBRARY_ORG);
    private final Set<ModuleCoordinate> importedModules;
    private final ResolvedFunctionCatalog catalog;
    private final Document functionsDoc;
    private final String sectionOrg;
    private final String functionSource;
    private final Map<String, FunctionPagination> pagination = new LinkedHashMap<>();

    FunctionSearchCommand(Project project, LineRange position, Map<String, String> queryMap, Document functionsDoc) {
        super(project, position, queryMap);
        this.catalog = ResolvedFunctionCatalog.collect(project, ImportedModules.collect(project));
        this.importedModules = catalog.imports();
        this.functionsDoc = functionsDoc;
        String org = queryMap == null ? "" : queryMap.getOrDefault("orgName", "");
        this.sectionOrg = LIBRARY_ORGS.contains(org) ? org : "";
        this.functionSource = sectionOrg.isEmpty() || queryMap == null ? null : queryMap.get("functionSource");
    }

    @Override
    public Map<String, FunctionPagination> functionPagination() {
        return pagination.isEmpty() ? null : Map.copyOf(pagination);
    }

    @Override
    protected List<Item> defaultView() {
        return search();
    }

    @Override
    protected List<Item> search() {
        List<SearchResult> rows = new ArrayList<>();
        if (sectionOrg.isEmpty() && offset <= 0) {
            WorkspaceFunctionNodeBuilder.buildSubmoduleWorkspaceNodes(rootBuilder, project, position, query,
                    functionsDoc);
            rows.addAll(catalog.matching(query));
            // Failed symbol discovery can use only exact-version indexed functions. No latest-version top-up.
            Set<ModuleCoordinate> fallbackImports = catalog.fallbackImports();
            if (!fallbackImports.isEmpty()) {
                rows.addAll(dbManager.searchFunctionsByPackages(fallbackImports, List.of(), Integer.MAX_VALUE, 0)
                        .stream().map(catalog::admit).filter(Objects::nonNull)
                        .filter(ResolvedFunctionCatalog.queryMatcher(query)).toList());
            }
        }
        CentralSearchUtil central = new CentralSearchUtil(RemoteCentral.getInstance());
        for (String org : sectionOrg.isEmpty() ? LIBRARY_ORGS : List.of(sectionOrg)) {
            FunctionPage.Page page = libraryPage(central, org);
            rows.addAll(page.rows());
            pagination.put(org, page.pagination());
        }
        buildLibraryNodes(rows, true);
        return rootBuilder.build().items();
    }

    private FunctionPage.Page libraryPage(CentralSearchUtil central, String org) {
        // Imported fallbacks belong in their own category and must never eat a library page's quota.
        UnaryOperator<SearchResult> admit = row -> org.equals(row.packageInfo().org())
                && !importedModules.contains(row.packageInfo().coordinate()) ? catalog.admit(row) : null;
        return FunctionPage.library(limit, offset, functionSource, (take, skip) -> {
            var raw = central.searchFunctionPage(query, take, skip, org);
            return raw == null ? null : new FunctionPage.Raw(raw.rows(), raw.hasMore());
        }, (take, skip) -> {
            List<SearchResult> raw = dbManager.searchFunctions(query, take + 1, skip, org);
            boolean more = raw.size() > take;
            return new FunctionPage.Raw(more ? raw.subList(0, take) : raw, more);
        }, admit);
    }

    @Override
    protected List<Item> searchCurrentOrganization(String currentOrg) {
        CentralSearchUtil central = new CentralSearchUtil(RemoteCentral.getInstance());
        List<SearchResult> rows = central.searchSymbolsByOrganization(currentOrg, query, limit, offset,
                "function"::equals);
        List<SearchResult> eligible = new ArrayList<>();
        if (offset <= 0) {
            eligible.addAll(catalog.matching(query).stream()
                    .filter(row -> row.packageInfo().org().equals(currentOrg)).toList());
        }
        eligible.addAll(rows.stream().map(catalog::admit).filter(Objects::nonNull).toList());
        buildLibraryNodes(eligible, false);
        return rootBuilder.build().items();
    }

    private void buildLibraryNodes(List<SearchResult> rows, boolean categorizeByOrganization) {
        Category.Builder imported = rootBuilder.stepIn(Category.Name.IMPORTED_FUNCTIONS);
        Category.Builder standard = rootBuilder.stepIn(Category.Name.STANDARD_LIBRARY);
        Category.Builder extended = categorizeByOrganization
                ? rootBuilder.stepIn(Category.Name.EXTENDED_LIBRARY) : null;
        Set<String> seen = new HashSet<>();
        for (SearchResult row : rows) {
            var pkg = row.packageInfo();
            if (!seen.add(pkg.org() + "/" + pkg.moduleName() + ":" + row.name())) {
                continue;
            }
            Category.Builder builder;
            if (importedModules.contains(pkg.coordinate())) {
                builder = imported;
            } else if (!categorizeByOrganization || STANDARD_LIBRARY_ORG.equals(pkg.org())) {
                builder = standard;
            } else if (EXTENDED_LIBRARY_ORG.equals(pkg.org())) {
                builder = extended;
            } else {
                continue;
            }
            Metadata metadata = new Metadata.Builder<>(null)
                    .label(row.name())
                    .description(row.description())
                    .icon(CommonUtils.generateIcon(pkg.org(), pkg.packageName(), pkg.version()))
                    .build();
            Codedata codedata = new Codedata.Builder<>(null)
                    .node(NodeKind.FUNCTION_CALL)
                    .org(pkg.org())
                    .module(pkg.moduleName())
                    .packageName(pkg.packageName())
                    .symbol(row.name())
                    .version(pkg.version())
                    .build();
            builder.stepIn(pkg.moduleName(), "", List.of()).node(new AvailableNode(metadata, codedata, true));
        }
    }
}
