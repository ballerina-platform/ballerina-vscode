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
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Document;
import io.ballerina.projects.Package;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Represents a command to search for functions available to a module. This class extends SearchCommand and provides
 * functionality to search for package, workspace-package, and dependency functions.
 *
 * <p>
 * The search includes:
 * <li>Functions in the current module and other modules in the active package</li>
 * <li>Functions in other packages in the Ballerina workspace</li>
 * <li>Imported functions from dependencies</li>
 * <li>Available functions from the standard library (if enabled)</li>
 *
 * <p>The search results are organized into different categories:</p>
 * <li>CURRENT_INTEGRATION: Functions from the active integration</li>
 * <li>CURRENT_WORKSPACE: Functions from integrations in the current project</li>
 * <li>IMPORTED_FUNCTIONS: Functions from imported modules</li>
 * <li>AVAILABLE_FUNCTIONS: Functions available but not imported (optional)</li>
 * </p>
 *
 * @see SearchCommand
 * @since 1.0.0
 */
class FunctionSearchCommand extends SearchCommand {

    private static final Map<String, List<String>> POPULAR_BALLERINA_FUNCTIONS = Map.of(
            "log", List.of("printInfo", "printDebug", "printError", "printWarn"),
            "time", List.of("utcNow", "utcFromString"),
            "io", List.of("print", "println", "fileWriteString", "fileWriteJson", "fileReadString", "fileReadJson")
    );
    private static final String FETCH_KEY = "functions";
    private static final Set<String> ALLOWED_ORGANIZATIONS = Set.of("ballerina", "ballerinax", "wso2");
    private static final String STANDARD_LIBRARY_ORG = "ballerina";
    private static final String EXTENDED_LIBRARY_ORG = "ballerinax";
    // Organizations whose functions can be loaded page-by-page as an independent library section.
    private static final Set<String> PAGINATED_SECTION_ORGS = Set.of(STANDARD_LIBRARY_ORG, EXTENDED_LIBRARY_ORG);
    private final List<String> moduleNames;
    private final Document functionsDoc;
    // When set (to "ballerina" or "ballerinax"), the request loads the next page of that single library section
    // instead of the full view. Used by the per-section "Show more" pagination.
    private final String sectionOrg;

    public FunctionSearchCommand(Project project, LineRange position, Map<String, String> queryMap,
                                 Document functionsDoc) {
        super(project, position, queryMap);

        // Obtain the imported module names
        Package currentPackage = project.currentPackage();
        PackageUtil.getCompilation(currentPackage);
        moduleNames = currentPackage.getDefaultModule().moduleDependencies().stream()
                .map(moduleDependency -> moduleDependency.descriptor().name().packageName().value())
                .toList();
        this.functionsDoc = functionsDoc;
        String requestedSectionOrg = queryMap != null ? queryMap.getOrDefault("orgName", "") : "";
        this.sectionOrg = PAGINATED_SECTION_ORGS.contains(requestedSectionOrg) ? requestedSectionOrg : "";
        // TODO: Use this method when https://github.com/ballerina-platform/ballerina-lang/issues/43695 is fixed
        // List<String> moduleNames = semanticModel.moduleSymbols().stream()
        // .filter(symbol -> symbol.kind().equals(SymbolKind.MODULE))
        // .flatMap(symbol -> symbol.getName().stream())
        // .toList();
    }

    @Override
    protected List<Item> defaultView() {
        if (!sectionOrg.isEmpty()) {
            return loadLibrarySection();
        }

        List<SearchResult> searchResults = new ArrayList<>();

        if (offset == 0) {
            WorkspaceFunctionNodeBuilder.buildSubmoduleWorkspaceNodes(
                    rootBuilder, project, position, query, functionsDoc);
            if (!moduleNames.isEmpty()) {
                searchResults.addAll(
                        dbManager.searchFunctionsByPackages(moduleNames, List.of(), Integer.MAX_VALUE, 0));
            }
        }

        // The standard library (ballerina) and the extended library (ballerinax) are fetched from Ballerina Central,
        // each paginated independently with the same offset window. Falls back to the bundled popular functions when
        // Central is unavailable.
        CentralSearchUtil centralSearch = new CentralSearchUtil(RemoteCentral.getInstance());
        List<SearchResult> standardLibrary =
                centralSearch.searchFunctionsByOrg(query, limit, offset, STANDARD_LIBRARY_ORG);
        if (standardLibrary == null) {
            // Central is unavailable, fall back to the bundled popular functions.
            searchResults.addAll(offset == 0
                    ? defaultViewHolder.get(this).getOrDefault(FETCH_KEY, List.of())
                    : List.of());
        } else {
            searchResults.addAll(standardLibrary);
            List<SearchResult> extendedLibrary =
                    centralSearch.searchFunctionsByOrg(query, limit, offset, EXTENDED_LIBRARY_ORG);
            if (extendedLibrary != null) {
                searchResults.addAll(extendedLibrary);
            }
        }

        buildLibraryNodes(searchResults, true);
        return rootBuilder.build().items();
    }

    @Override
    protected List<Item> search() {
        if (!sectionOrg.isEmpty()) {
            return loadLibrarySection();
        }

        WorkspaceFunctionNodeBuilder.buildSubmoduleWorkspaceNodes(rootBuilder, project, position, query, functionsDoc);

        // Search functions from Ballerina Central, falling back to the local index on failure or timeout. Querying
        // Central live ensures functions published after the bundled index was built are still discoverable.
        String currentOrg = project.currentPackage().packageOrg().value();
        Set<String> allowedOrgs = new HashSet<>(ALLOWED_ORGANIZATIONS);
        if (currentOrg != null && !currentOrg.isEmpty()) {
            allowedOrgs.add(currentOrg);
        }

        CentralSearchUtil centralSearch = new CentralSearchUtil(RemoteCentral.getInstance());
        List<SearchResult> functionSearchList = centralSearch.searchFunctions(query, limit, offset, allowedOrgs);
        if (functionSearchList == null) {
            functionSearchList = dbManager.searchFunctions(query, limit, offset);
        }
        buildLibraryNodes(functionSearchList, true);
        return rootBuilder.build().items();
    }

    @Override
    protected List<Item> searchCurrentOrganization(String currentOrg) {
        CentralSearchUtil centralSearch = new CentralSearchUtil(RemoteCentral.getInstance());
        List<SearchResult> organizationFunctions = centralSearch.searchSymbolsByOrganization(
                currentOrg, query, limit, offset, "function"::equals);
        buildLibraryNodes(organizationFunctions);
        return rootBuilder.build().items();
    }

    @Override
    protected Map<String, List<SearchResult>> fetchPopularItems() {
        List<String> packageNames = new ArrayList<>(POPULAR_BALLERINA_FUNCTIONS.keySet());
        List<String> functionNames = POPULAR_BALLERINA_FUNCTIONS.values().stream()
                .flatMap(List::stream)
                .toList();
        return Map.of(FETCH_KEY, dbManager.searchFunctionsByPackages(packageNames, functionNames, limit, offset));
    }

    /**
     * Loads the next page of a single library section (the {@code sectionOrg} organization) for the per-section
     * "Show more" pagination. Only that organization's functions are returned so the caller can append them to the
     * corresponding section without disturbing the others.
     *
     * @return the section's page of function nodes
     */
    private List<Item> loadLibrarySection() {
        CentralSearchUtil centralSearch = new CentralSearchUtil(RemoteCentral.getInstance());
        List<SearchResult> sectionResults = centralSearch.searchFunctionsByOrg(query, limit, offset, sectionOrg);
        buildLibraryNodes(sectionResults != null ? sectionResults : List.of(), true);
        return rootBuilder.build().items();
    }

    private void buildLibraryNodes(List<SearchResult> functionSearchList) {
        buildLibraryNodes(functionSearchList, false);
    }

    /**
     * Builds the library function nodes and groups them into categories.
     *
     * <p>Imported functions (from modules the current package depends on) always go to the imported category. When
     * {@code categorizeByOrganization} is set, the remaining functions are split by organization: {@code ballerina}
     * functions form the standard library, {@code ballerinax} functions form the extended library, and functions from
     * any other organization are excluded. When it is not set, all non-imported functions go to the standard library
     * (used by the current-organization search, which surfaces the user's own organization).
     *
     * @param functionSearchList       the functions to categorize
     * @param categorizeByOrganization whether to split non-imported functions into standard/extended libraries by org
     */
    private void buildLibraryNodes(List<SearchResult> functionSearchList, boolean categorizeByOrganization) {
        // Set the categories based on the available flags
        Category.Builder importedFnBuilder = rootBuilder.stepIn(Category.Name.IMPORTED_FUNCTIONS);
        Category.Builder standardLibBuilder = rootBuilder.stepIn(Category.Name.STANDARD_LIBRARY);
        Category.Builder extendedLibBuilder =
                categorizeByOrganization ? rootBuilder.stepIn(Category.Name.EXTENDED_LIBRARY) : null;

        // Add the library functions
        for (SearchResult searchResult : functionSearchList) {
            SearchResult.Package packageInfo = searchResult.packageInfo();

            // Add the function to the respective category
            String icon = CommonUtils.generateIcon(packageInfo.org(), packageInfo.packageName(), packageInfo.version());
            Metadata metadata = new Metadata.Builder<>(null)
                    .label(searchResult.name())
                    .description(searchResult.description())
                    .icon(icon)
                    .build();
            Codedata codedata = new Codedata.Builder<>(null)
                    .node(NodeKind.FUNCTION_CALL)
                    .org(packageInfo.org())
                    .module(packageInfo.moduleName())
                    .packageName(packageInfo.packageName())
                    .symbol(searchResult.name())
                    .version(packageInfo.version())
                    .build();
            Category.Builder builder;
            if (moduleNames.contains(packageInfo.moduleName())) {
                builder = importedFnBuilder;
            } else if (!categorizeByOrganization || STANDARD_LIBRARY_ORG.equals(packageInfo.org())) {
                builder = standardLibBuilder;
            } else if (EXTENDED_LIBRARY_ORG.equals(packageInfo.org())) {
                builder = extendedLibBuilder;
            } else {
                // Non-imported functions outside the ballerina and ballerinax organizations are not surfaced.
                continue;
            }
            if (builder != null) {
                builder.stepIn(packageInfo.moduleName(), "", List.of())
                        .node(new AvailableNode(metadata, codedata, true));
            }
        }
    }

}
