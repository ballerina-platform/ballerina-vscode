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
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Documentable;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.EnumSymbol;
import io.ballerina.compiler.api.symbols.Qualifiable;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.utils.CentralSearchUtil;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleCoordinate;
import io.ballerina.modelgenerator.commons.PackageModuleUtils;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.Project;
import io.ballerina.projects.ResolvedPackageDependency;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.projects.directory.WorkspaceProject;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.common.utils.SymbolUtil;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Represents a command to search for types available to a module. This class extends SearchCommand and provides
 * functionality to search for package, workspace-package, and dependency types.
 *
 * <p>
 * The search includes:
 * <li>Types in the current module and other modules in the active package</li>
 * <li>Types in other packages in the Ballerina workspace</li>
 * <li>Imported types from dependencies</li>
 * <li>Available types from the standard library (if enabled)</li>
 *
 * <p>The search results are organized into different categories:</p>
 * <li>CURRENT_INTEGRATION: Types from the active integration</li>
 * <li>CURRENT_WORKSPACE: Types from integrations in the current project</li>
 * <li>IMPORTED_TYPES: Types from imported modules</li>
 * <li>AVAILABLE_TYPES: Types available but not imported (optional)</li>
 * </p>
 *
 * @see SearchCommand
 * @since 1.0.0
 */
class TypeSearchCommand extends SearchCommand {

    private static final Logger LOGGER = Logger.getLogger(TypeSearchCommand.class.getName());

    private final Set<ModuleCoordinate> importedModules;

    public TypeSearchCommand(Project project, LineRange position, Map<String, String> queryMap) {
        super(project, position, queryMap);
        this.importedModules = ImportedModules.collect(project);
    }

    @Override
    protected List<Item> defaultView() {
        buildWorkspaceNodes();
        List<SearchResult> searchResults = new ArrayList<>();
        int indexedCapacity = 0;
        if (!importedModules.isEmpty()) {
            searchResults.addAll(dbManager.searchTypesByPackages(importedModules, limit, offset));
            indexedCapacity = dbManager.countIndexedTypes(importedModules);
        }

        int importedCount = buildLibraryNodes(searchResults);
        // The fair-share indexed pool has a fixed capacity that can be exhausted well before offset catches up, so
        // only the portion of offset beyond that capacity should be skipped from the live-compiled fallback pool.
        // Netting against this page's actual indexed row count instead would drop rows once the pool runs dry.
        buildLiveDependencyTypes(importedCount, Math.max(0, offset - indexedCapacity));
        return rootBuilder.build().items();
    }

    /**
     * Runs the query against three sequentially-drained pools: the imported modules present in the index, the rest of
     * the library, and finally live compilation for imported modules the index doesn't know about.
     *
     * <p>Each pool is skipped by the <i>stable capacity</i> of the pools before it rather than by how many rows they
     * happened to return for this page. A pool that runs dry mid-page contributes fewer rows than its share of the
     * limit, and a later page - computed statelessly, with no memory of that - would otherwise skip past rows that
     * were never shown.</p>
     */
    @Override
    protected List<Item> search() {
        buildWorkspaceNodes();

        // Tier 1: imported modules that are indexed, fair-shared across those modules.
        List<SearchResult> importedMatches =
                dbManager.searchTypesByPackagesMatching(importedModules, query, limit, offset);
        int importedCapacity = dbManager.countIndexedMatchingTypes(query, importedModules);
        buildLibraryNodes(importedMatches);

        // Tier 2: everything else in the index matching the query.
        List<SearchResult> libraryMatches = dbManager.searchTypesExcludingPackages(query, importedModules,
                Math.max(0, limit - importedMatches.size()), Math.max(0, offset - importedCapacity));
        int libraryCapacity = dbManager.countTypesExcludingPackages(query, importedModules);
        buildLibraryNodes(libraryMatches);

        // Tier 3: imported modules missing from the index, resolved by compiling them on demand.
        buildLiveDependencyTypes(importedMatches.size() + libraryMatches.size(),
                Math.max(0, offset - importedCapacity - libraryCapacity));
        return rootBuilder.build().items();
    }

    @Override
    protected Map<String, List<SearchResult>> fetchPopularItems() {
        return Collections.emptyMap();
    }

    /**
     * Search types/records in the given organization via Central and add them to the result categories.
     */
    @Override
    protected List<Item> searchCurrentOrganization(String currentOrg) {
        CentralSearchUtil centralSearch = new CentralSearchUtil(RemoteCentral.getInstance());
        List<SearchResult> organizationTypes = centralSearch.searchSymbolsByOrganization(
                currentOrg, query, limit, offset,
                s -> "record".equals(s) || s.contains("type"));
        buildLibraryNodes(organizationTypes);
        return rootBuilder.build().items();
    }

    private List<TypeSymbolEntry> getTypes(SemanticModel semanticModel) {
        return semanticModel.moduleSymbols().stream()
                .filter(symbol -> symbol instanceof TypeDefinitionSymbol || symbol instanceof ClassSymbol
                        || symbol instanceof EnumSymbol)
                .map(symbol -> new TypeSymbolEntry(symbol,
                        symbol instanceof EnumSymbol ? SymbolKind.ENUM : symbol.kind()))
                .toList();
    }

    private void buildWorkspaceNodes() {
        Module currentModule = PackageModuleUtils.findModule(project.currentPackage(),
                        position == null ? null : position.fileName())
                .orElse(project.currentPackage().getDefaultModule());
        Optional<WorkspaceProject> workspaceProject = project.workspaceProject();
        if (workspaceProject.isEmpty()) {
            Category.Builder packageBuilder = rootBuilder.stepIn(Category.Name.CURRENT_INTEGRATION);
            buildPackageModules(project, currentModule, packageBuilder);
            return;
        }

        Category.Builder workspaceBuilder = rootBuilder.stepIn(Category.Name.CURRENT_WORKSPACE);
        String activePackageLabel = project.currentPackage().packageName().value();
        Category.Builder currentPackageBuilder = workspaceBuilder.stepIn(
                activePackageLabel + CURRENT_INTEGRATION_INDICATOR, "", List.of());
        buildPackageModules(project, currentModule, currentPackageBuilder);
        PackageName currentPackageName = project.currentPackage().packageName();
        for (BuildProject buildProject : workspaceProject.get().projects()) {
            if (buildProject.currentPackage().packageName().equals(currentPackageName)) {
                continue;
            }
            Category.Builder packageBuilder = workspaceBuilder.stepIn(
                    buildProject.currentPackage().packageName().value(), "", List.of());
            buildPackageModules(buildProject, currentModule, packageBuilder);
        }
    }

    private void buildPackageModules(Project targetProject, Module currentModule, Category.Builder parentBuilder) {
        WorkspaceModuleSearchUtils.ModuleItems packageItems = WorkspaceModuleSearchUtils.buildPackageModules(
                project, targetProject, currentModule, context -> new WorkspaceModuleSearchUtils.ModuleItems(
                        buildProjectNodes(context.module(), context.semanticModel(), context.current(),
                                context.relation()),
                        List.of()));
        parentBuilder.items(packageItems.items());
    }

    private List<Item> buildProjectNodes(Module module, SemanticModel semanticModel, boolean current,
                                         String moduleRelation) {
        List<ScoredType> scoredTypes = new ArrayList<>();
        for (TypeSymbolEntry typeEntry : getTypes(semanticModel)) {
            Symbol typeSymbol = typeEntry.symbol();
            if (!current && (!(typeSymbol instanceof Qualifiable qualifiable)
                    || !qualifiable.qualifiers().contains(Qualifier.PUBLIC))) {
                continue;
            }
            if (typeSymbol.getName().isEmpty()) {
                continue;
            }
            String typeName = typeSymbol.getName().get();
            String description = typeSymbol instanceof Documentable documentable
                    ? documentable.documentation().flatMap(Documentation::description).orElse("") : "";
            int score = RelevanceCalculator.calculateFuzzyRelevanceScore(typeName, description, query);
            if (score > 0) {
                scoredTypes.add(new ScoredType(typeSymbol, typeEntry.kind(), typeName, description, score));
            }
        }
        scoredTypes.sort(Comparator.comparingInt(ScoredType::score).reversed());

        String orgName = module.packageInstance().packageOrg().toString();
        String packageName = module.packageInstance().packageName().toString();
        String moduleName = PackageModuleUtils.fullModuleName(module);
        String moduleKind = PackageModuleUtils.moduleKind(module);
        String version = module.packageInstance().packageVersion().toString();
        boolean generated = PackageModuleUtils.isGenerated(module);
        List<Item> availableNodes = new ArrayList<>();
        for (ScoredType scoredType : scoredTypes) {
            Optional<? extends TypeSymbol> typeDescriptor = SymbolUtil.getTypeDescriptor(scoredType.symbol());
            typeDescriptor = typeDescriptor.isPresent()
                    && typeDescriptor.get().typeKind() == TypeDescKind.TYPE_REFERENCE
                    ? Optional.of(((TypeReferenceTypeSymbol) typeDescriptor.get()).typeDescriptor()) : typeDescriptor;
            NodeKind nodeKind = scoredType.kind() == SymbolKind.ENUM ? NodeKind.ENUM : NodeKind.TYPEDESC;
            if (nodeKind != NodeKind.ENUM && typeDescriptor.isPresent() && typeDescriptor.get().typeKind() != null
                    && typeDescriptor.get().typeKind() != TypeDescKind.COMPILATION_ERROR) {
                nodeKind = typeDescriptor.get().kind() == SymbolKind.CLASS
                        ? NodeKind.CLASS : toNodeKind(typeDescriptor.get().typeKind());
            }
            Metadata.Builder<Object> metadataBuilder = new Metadata.Builder<>(null)
                    .label(scoredType.typeName())
                    .description(scoredType.description());
            Codedata.Builder<Object> codedataBuilder = new Codedata.Builder<>(null)
                    .node(nodeKind)
                    .org(orgName)
                    .module(moduleName)
                    .packageName(packageName)
                    .symbol(scoredType.typeName())
                    .version(version);
            codedataBuilder.isGenerated(generated)
                    .data("moduleRelation", moduleRelation)
                    .data("moduleKind", moduleKind);
            Metadata metadata = metadataBuilder.build();
            Codedata codedata = codedataBuilder.build();
            availableNodes.add(new AvailableNode(metadata, codedata, true));
        }
        return availableNodes;
    }

    /**
     * Routes indexed search results into the imported and standard-library categories.
     *
     * <p>Safe to call more than once per request: {@code stepIn} is get-or-create, and each result is classified on
     * its own {@code (org, module)} pair rather than on which call produced it.</p>
     *
     * @param typeSearchList the indexed results to route
     * @return the number of entries routed to {@code IMPORTED_TYPES}
     */
    private int buildLibraryNodes(List<SearchResult> typeSearchList) {
        // Set the categories based on available flags
        Category.Builder importedTypesBuilder = rootBuilder.stepIn(Category.Name.IMPORTED_TYPES);
        Category.Builder availableTypesBuilder = rootBuilder.stepIn(Category.Name.STANDARD_LIBRARY);

        int importedCount = 0;
        // Add the library types
        for (SearchResult searchResult : typeSearchList) {
            SearchResult.Package packageInfo = searchResult.packageInfo();

            // Add the type to the respective category
            String icon = CommonUtils.generateIcon(packageInfo.org(), packageInfo.packageName(), packageInfo.version());
            Metadata metadata = new Metadata.Builder<>(null)
                    .label(searchResult.name())
                    .description(searchResult.description())
                    .icon(icon)
                    .build();
            Codedata codedata = new Codedata.Builder<>(null)
                    .node(NodeKind.TYPEDESC)
                    .org(packageInfo.org())
                    .module(packageInfo.moduleName())
                    .packageName(packageInfo.packageName())
                    .symbol(searchResult.name())
                    .version(packageInfo.version())
                    .build();
            // Org-aware: search() sources results from a query that spans the whole library, so a same-named
            // package from another org (e.g. ballerina/np vs ballerinax/np) must not be mistaken for the import.
            Category.Builder builder;
            if (importedModules.contains(new ModuleCoordinate(packageInfo.org(), packageInfo.moduleName()))) {
                builder = importedTypesBuilder;
                importedCount++;
            } else {
                builder = availableTypesBuilder;
            }
            builder.stepIn(packageInfo.moduleName(), "", List.of())
                    .node(new AvailableNode(metadata, codedata, true));
        }
        return importedCount;
    }

    /**
     * Falls back to the compiled semantic model for imported modules missing from the search index - for example a
     * connector published too recently to have been indexed, which is otherwise invisible to type search entirely.
     *
     * <p>Matches from every missing module are ranked together before paging, so a strong match in one module isn't
     * pushed to a later page by weaker matches from a module that happened to be visited first.</p>
     *
     * @param consumedFromIndexed how many result slots the indexed pools already filled for this page
     * @param liveSkip            how many matches to skip within the live-compiled pool, i.e. the portion of the
     *                            page's offset not already accounted for by the indexed pools' capacity
     */
    private void buildLiveDependencyTypes(int consumedFromIndexed, int liveSkip) {
        int remainingLimit = limit - consumedFromIndexed;
        if (importedModules.isEmpty() || remainingLimit <= 0) {
            return;
        }

        // Unpaginated, and not joined to Type: a module can be indexed with zero types, and treating that as
        // "missing" would force a full live compilation on every request.
        Set<ModuleCoordinate> indexedModules = dbManager.findIndexedModules(importedModules);
        Set<ModuleCoordinate> missingModules = new HashSet<>();
        for (ModuleCoordinate module : importedModules) {
            if (!indexedModules.contains(module)) {
                missingModules.add(module);
            }
        }
        if (missingModules.isEmpty()) {
            return;
        }

        Package currentPackage = project.currentPackage();
        if (currentPackage.getResolution() == null || currentPackage.getResolution().dependencyGraph() == null) {
            return;
        }

        // getNodes() returns a HashMap keySet ordered by a UUID-derived hash, so it isn't stable across
        // re-resolutions; sort by the descriptor-based natural order instead.
        List<ResolvedPackageDependency> sortedDependencies =
                new ArrayList<>(currentPackage.getResolution().dependencyGraph().getNodes());
        Collections.sort(sortedDependencies);

        List<LiveTypeMatch> allMatches = new ArrayList<>();
        Set<ModuleCoordinate> resolvedModules = new HashSet<>();
        outer:
        for (ResolvedPackageDependency dependency : sortedDependencies) {
            Package dependencyPackage = dependency.packageInstance();
            if (dependencyPackage == null) {
                continue;
            }
            for (Module module : dependencyPackage.modules()) {
                // Match on organization as well as name: a same-named module from another organization is a
                // different module, and resolving it here would surface the wrong package's types.
                ModuleCoordinate coordinate = new ModuleCoordinate(dependencyPackage.packageOrg().value(),
                        ImportedModules.toModuleKey(module.moduleName()));
                if (missingModules.contains(coordinate) && resolvedModules.add(coordinate)) {
                    allMatches.addAll(collectLiveModuleTypes(module, coordinate.moduleName(), dependencyPackage));
                    if (resolvedModules.size() >= missingModules.size()) {
                        break outer;
                    }
                }
            }
        }

        allMatches.sort(Comparator.comparingInt(LiveTypeMatch::score).reversed()
                .thenComparing(LiveTypeMatch::typeName));

        Category.Builder importedTypesBuilder = rootBuilder.stepIn(Category.Name.IMPORTED_TYPES);
        int remainingToSkip = liveSkip;
        int remaining = remainingLimit;
        for (LiveTypeMatch match : allMatches) {
            if (remainingToSkip > 0) {
                remainingToSkip--;
                continue;
            }
            if (remaining <= 0) {
                break;
            }
            String icon = CommonUtils.generateIcon(match.orgName(), match.packageName(), match.version());
            Metadata metadata = new Metadata.Builder<>(null)
                    .label(match.typeName())
                    .description(match.description())
                    .icon(icon)
                    .build();
            Codedata codedata = new Codedata.Builder<>(null)
                    .node(NodeKind.TYPEDESC)
                    .org(match.orgName())
                    .module(match.moduleName())
                    .packageName(match.packageName())
                    .symbol(match.typeName())
                    .version(match.version())
                    .build();
            importedTypesBuilder.stepIn(match.moduleName(), "", List.of())
                    .node(new AvailableNode(metadata, codedata, true));
            remaining--;
        }
    }

    /**
     * Scores the public types of one live-compiled dependency module.
     *
     * <p>Client classes are excluded: those are connectors rather than types, mirroring what the index generator
     * itself leaves out. Enums are included, since {@code EnumSymbol} is a {@code TypeDefinitionSymbol} and the
     * index stores enums as types.</p>
     */
    private List<LiveTypeMatch> collectLiveModuleTypes(Module module, String moduleName, Package dependencyPackage) {
        SemanticModel semanticModel;
        try {
            semanticModel = PackageUtil.getCompilation(module.packageInstance()).getSemanticModel(module.moduleId());
        } catch (RuntimeException e) {
            // Expected for generated/testonly modules with no semantic model, but this also catches genuine compiler
            // errors, so leave a breadcrumb rather than failing completely silently.
            LOGGER.log(Level.FINE, "Failed to compile dependency module for live type search: " + moduleName, e);
            return List.of();
        }
        if (semanticModel == null) {
            return List.of();
        }

        String orgName = dependencyPackage.packageOrg().toString();
        String packageName = dependencyPackage.packageName().toString();
        String version = dependencyPackage.packageVersion().toString();

        List<LiveTypeMatch> matches = new ArrayList<>();
        for (Symbol symbol : semanticModel.moduleSymbols()) {
            if (!(symbol instanceof TypeDefinitionSymbol) && !(symbol instanceof ClassSymbol)) {
                continue;
            }
            // Both TypeDefinitionSymbol and ClassSymbol are Qualifiable, so this cast is safe.
            Qualifiable qualifiable = (Qualifiable) symbol;
            if (!qualifiable.qualifiers().contains(Qualifier.PUBLIC)) {
                continue;
            }
            if (symbol instanceof ClassSymbol && qualifiable.qualifiers().contains(Qualifier.CLIENT)) {
                continue;
            }
            if (symbol.getName().isEmpty()) {
                continue;
            }
            String typeName = symbol.getName().get();
            String description = symbol instanceof Documentable documentable
                    ? documentable.documentation().flatMap(Documentation::description).orElse("") : "";
            int score = RelevanceCalculator.calculateFuzzyRelevanceScore(typeName, description, query);
            if (score > 0) {
                matches.add(new LiveTypeMatch(moduleName, orgName, packageName, version, typeName, description,
                        score));
            }
        }
        return matches;
    }

    private static NodeKind toNodeKind(TypeDescKind typeDescKind) {
        return switch (typeDescKind) {
            case ARRAY -> NodeKind.ARRAY;
            case RECORD -> NodeKind.RECORD;
            case UNION -> NodeKind.UNION;
            case INTERSECTION -> NodeKind.INTERSECTION;
            case TABLE -> NodeKind.TABLE;
            case MAP -> NodeKind.MAP;
            case ERROR -> NodeKind.ERROR;
            case OBJECT -> NodeKind.OBJECT;
            case TUPLE -> NodeKind.TUPLE;
            case STREAM -> NodeKind.STREAM;
            case FUTURE -> NodeKind.FUTURE;
            default -> NodeKind.TYPEDESC;
        };
    }

    private record TypeSymbolEntry(Symbol symbol, SymbolKind kind) {
    }

    /**
     * A type match found by live compilation, carrying enough context to build its node once matches from every
     * missing module have been collected and ranked together.
     *
     * @param moduleName  the module key ("packageName[.moduleNamePart]") the type was found in
     * @param orgName     the organization of the dependency package
     * @param packageName the name of the dependency package
     * @param version     the version of the dependency package
     * @param typeName    the name of the matched type
     * @param description the description of the matched type
     * @param score       the relevance score for ranking
     */
    private record LiveTypeMatch(String moduleName, String orgName, String packageName, String version,
                                 String typeName, String description, int score) {
    }

    /**
     * Helper record to store type symbols along with their classification and relevance scores for ranking.
     *
     * @param symbol      the symbol representing the type
     * @param kind        the symbol classification
     * @param typeName    the name of the type
     * @param description the description of the type
     * @param score       the relevance score for ranking
     */
    private record ScoredType(Symbol symbol, SymbolKind kind, String typeName, String description, int score) {
    }
}
