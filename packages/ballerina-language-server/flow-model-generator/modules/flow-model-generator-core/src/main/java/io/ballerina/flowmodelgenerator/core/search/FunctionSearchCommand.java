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
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

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
    private static final String POPULAR_FUNCTIONS_ORG = "ballerina";
    private static final String FETCH_KEY = "functions";
    private static final Set<String> ALLOWED_ORGANIZATIONS = Set.of("ballerina", "ballerinax", "wso2");
    private static final String STANDARD_LIBRARY_ORG = "ballerina";
    private static final String EXTENDED_LIBRARY_ORG = "ballerinax";
    // Organizations whose functions can be loaded page-by-page as an independent library section.
    private static final Set<String> PAGINATED_SECTION_ORGS = Set.of(STANDARD_LIBRARY_ORG, EXTENDED_LIBRARY_ORG);
    // A searched page is a window onto a result set that a reindexed Central makes far larger: a function-name query
    // now matches one row per declaring module rather than one per package, so a single package can fill a page on
    // its own and push another package's rows past the end of it. These bound the top-up that keeps an imported
    // module's functions reachable. A module holds a handful of matching functions - seven for a d03a EDI submodule
    // queried by function name, thirteen for its whole surface - so the per-module budget is headroom rather than a
    // figure fitted to one package's size.
    private static final int IMPORTED_MODULE_FUNCTION_LIMIT = 50;
    private static final int MAX_TOPPED_UP_MODULES = 5;
    private final Set<ModuleCoordinate> importedModules;
    private final Document functionsDoc;
    // When set (to "ballerina" or "ballerinax"), the request loads the next page of that single library section
    // instead of the full view. Used by the per-section "Show more" pagination.
    private final String sectionOrg;

    public FunctionSearchCommand(Project project, LineRange position, Map<String, String> queryMap,
                                 Document functionsDoc) {
        super(project, position, queryMap);
        this.importedModules = ImportedModules.collect(project);
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
            if (!importedModules.isEmpty()) {
                searchResults.addAll(
                        dbManager.searchFunctionsByPackages(importedModules, List.of(), Integer.MAX_VALUE, 0));
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
        } else {
            functionSearchList = withImportedModuleFunctions(centralSearch, functionSearchList);
        }
        buildLibraryNodes(functionSearchList, true);
        return rootBuilder.build().items();
    }

    /**
     * Adds the matching functions of imported modules that the general Central page leaves out.
     *
     * <p>The default view fetches the imported modules' functions in their own right, so they are always present.
     * A search did not: it took whichever rows the one general page happened to hold, leaving a function from a
     * module the project already imports to compete with every unrelated package that matched the same name - and
     * lose, if the page filled up first. A module the user has imported is the strongest relevance signal
     * available, so it is no longer left to the ranking.</p>
     *
     * <p>Nothing about what the page is missing is inferred from the page. Neither of the two signals it appears to
     * offer holds up. Its length does not say whether Central had more to give: the fetch loop behind it gives up
     * after a fixed number of iterations and then discards every row from an organization the page does not carry,
     * so a short page is the normal outcome of a broad query - eight rows survived of the hundred and eighty
     * scanned out of Central's thirteen hundred matches, in the case this was measured against. And a module having
     * a row on the page does not say its matching functions are all there; one arbitrary row would otherwise
     * suppress every other function the module declares. So every imported module is asked about, and the answers
     * are deduplicated against the page by function rather than by module.</p>
     *
     * <p>Modules with no rows on the page are asked about first, being the likeliest to be missing something, and
     * the budget bounds how many requests one keystroke can cost.</p>
     *
     * <p>The decision is {@link #mergeImportedModuleFunctions} and is kept free of this command's state so it can be
     * exercised without a compiled project or a reachable Central; this method only supplies that state.</p>
     *
     * @param centralSearch  the Central client to query with
     * @param centralResults the general page, kept in its original order
     * @return the page with the missing imported functions ahead of it, or the page unchanged
     */
    private List<SearchResult> withImportedModuleFunctions(CentralSearchUtil centralSearch,
                                                           List<SearchResult> centralResults) {
        return mergeImportedModuleFunctions(centralResults, importedModules, offset,
                module -> centralSearch.searchFunctionsInModule(query, IMPORTED_MODULE_FUNCTION_LIMIT, module));
    }

    /**
     * Merges the imported modules' matching functions into the general page, as described by
     * {@link #withImportedModuleFunctions}.
     *
     * @param centralResults  the general page, kept in its original order
     * @param importedModules the modules the project imports, in the order to consider them
     * @param offset          the page being requested; only the first page is topped up
     * @param moduleLookup    asks Central for one module's matching functions, or null if that failed
     * @return the page with the missing imported functions ahead of it, or the page unchanged
     */
    static List<SearchResult> mergeImportedModuleFunctions(
            List<SearchResult> centralResults,
            Set<ModuleCoordinate> importedModules,
            int offset,
            Function<ModuleCoordinate, List<SearchResult>> moduleLookup) {
        if (offset > 0 || importedModules.isEmpty()) {
            return centralResults;
        }

        Set<ModuleCoordinate> pagedModules = new HashSet<>();
        Set<FunctionCoordinate> pagedFunctions = new HashSet<>();
        for (SearchResult result : centralResults) {
            ModuleCoordinate coordinate = result.packageInfo().coordinate();
            pagedModules.add(coordinate);
            pagedFunctions.add(new FunctionCoordinate(coordinate, result.name()));
        }

        List<SearchResult> importedResults = new ArrayList<>();
        int queried = 0;
        for (ModuleCoordinate candidate : topUpOrder(importedModules, pagedModules)) {
            if (queried == MAX_TOPPED_UP_MODULES) {
                break;
            }
            queried++;
            List<SearchResult> moduleResults = moduleLookup.apply(candidate);
            if (moduleResults == null) {
                continue;
            }
            moduleResults.stream()
                    .filter(result -> !pagedFunctions.contains(
                            new FunctionCoordinate(result.packageInfo().coordinate(), result.name())))
                    .forEach(importedResults::add);
        }

        if (importedResults.isEmpty()) {
            return centralResults;
        }
        List<SearchResult> merged = new ArrayList<>(importedResults);
        merged.addAll(centralResults);
        return merged;
    }

    /**
     * The imported modules in the order to spend the request budget on them: those with no rows on the page first,
     * then those with some. A module absent from the page is the likelier to be missing a function; one that is
     * present may already be listed in full, and asking about it is the guess that pays off least often.
     *
     * <p>Neither group is skipped. A module's absence does not prove it has nothing to offer, and its presence does
     * not prove it has everything - only the request settles either.</p>
     *
     * @param importedModules the modules the project imports, iterated in their own stable order
     * @param pagedModules    the modules the general page covers
     * @return the modules to query, in the order to query them
     */
    static List<ModuleCoordinate> topUpOrder(Set<ModuleCoordinate> importedModules,
                                             Set<ModuleCoordinate> pagedModules) {
        List<ModuleCoordinate> unpaged = new ArrayList<>();
        List<ModuleCoordinate> paged = new ArrayList<>();
        for (ModuleCoordinate importedModule : importedModules) {
            if (pagedModules.contains(importedModule)) {
                paged.add(importedModule);
            } else {
                unpaged.add(importedModule);
            }
        }
        unpaged.addAll(paged);
        return unpaged;
    }

    /**
     * One declared function, identified the way the page lists it. Deduplication is by function rather than by
     * module so that a module already holding a row on the page still contributes the functions it does not.
     *
     * @param module the module that declares the function
     * @param name   the function name
     */
    private record FunctionCoordinate(ModuleCoordinate module, String name) {
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
        Set<ModuleCoordinate> popularModules = POPULAR_BALLERINA_FUNCTIONS.keySet().stream()
                .map(moduleName -> new ModuleCoordinate(POPULAR_FUNCTIONS_ORG, moduleName))
                .collect(Collectors.toSet());
        List<String> functionNames = POPULAR_BALLERINA_FUNCTIONS.values().stream()
                .flatMap(List::stream)
                .toList();
        return Map.of(FETCH_KEY, dbManager.searchFunctionsByPackages(popularModules, functionNames, limit, offset));
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
            if (importedModules.contains(packageInfo.coordinate())) {
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
