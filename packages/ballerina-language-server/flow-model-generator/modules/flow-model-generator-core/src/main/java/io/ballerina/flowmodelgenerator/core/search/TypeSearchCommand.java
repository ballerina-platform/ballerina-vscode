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
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.Qualifiable;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeDefinitionSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.utils.CentralSearchUtil;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.FairShareWindow;
import io.ballerina.modelgenerator.commons.ModuleCoordinate;
import io.ballerina.modelgenerator.commons.PackageModuleUtils;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.SearchDatabaseManager;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
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
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
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
        buildImportedNodes(false);
        return rootBuilder.build().items();
    }

    @Override
    protected List<Item> search() {
        buildWorkspaceNodes();
        buildImportedNodes(true);
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

    /**
     * {@code EnumSymbol} extends {@code TypeDefinitionSymbol}, so enums are already picked up by the filter; what
     * they need is the kind remap below, because their own {@code kind()} reports {@code TYPE_DEFINITION}.
     */
    private List<TypeSymbolEntry> getTypes(SemanticModel semanticModel) {
        return semanticModel.moduleSymbols().stream()
                .filter(symbol -> symbol instanceof TypeDefinitionSymbol || symbol instanceof ClassSymbol)
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
            String description = description(typeSymbol);
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
            Category.Builder builder;
            if (importedModules.contains(packageInfo.coordinate())) {
                builder = importedTypesBuilder;
                importedCount++;
            } else {
                builder = availableTypesBuilder;
            }
            builder.stepIn(packageInfo.moduleName(), "", List.of())
                    .node(typeNode(packageInfo, searchResult.name(), searchResult.description()));
        }
        return importedCount;
    }

    /**
     * Builds the imported-types category for one page, and optionally the standard-library category after it.
     *
     * <p>The imported pool spans <b>both</b> the modules the search index knows and the ones reachable only
     * through their module symbols - a connector published too recently to have been indexed is otherwise
     * invisible to type search entirely. One {@link FairShareWindow} allocation covers all of them, so each
     * imported module gets its share of the page regardless of which pool it came from.</p>
     *
     * <p>Giving the live pool only the slots the indexed pools leave over does not work, and is what made the
     * original fix ineffective in a real project: one imported module the size of {@code ballerina/http} (330
     * indexed types) fills a 20-row page on its own, so an unindexed connector's types first appeared around page 17
     * of the browse view - and, when the library tier was drained ahead of them too, only after every one of the
     * thousands of library rows a common query matches.</p>
     *
     * @param includeLibrary whether to also page the rest of the index into the standard-library category, which the
     *                       browse view (empty query) deliberately leaves out
     */
    private void buildImportedNodes(boolean includeLibrary) {
        // One query answers both "which imported modules does the index know" (the keys) and "how many of their
        // types match" (the values); a module absent from the map isn't indexed and is read from its symbols.
        Map<ModuleCoordinate, Integer> indexedCounts = dbManager.indexedTypeCounts(importedModules, query);
        Map<ModuleCoordinate, List<LiveTypeMatch>> liveMatches = collectLiveMatches(indexedCounts.keySet());

        Map<ModuleCoordinate, Integer> pool = new HashMap<>(indexedCounts);
        liveMatches.forEach((module, matches) -> pool.put(module, matches.size()));
        FairShareWindow.Ranges<ModuleCoordinate> ranges = FairShareWindow.rangesOf(pool, offset, limit);

        // Called unconditionally, and before anything else: it is what creates the imported and standard-library
        // categories, which stay in the response even when a page puts nothing in them.
        List<SearchResult> indexedMatches =
                dbManager.searchTypesInRanges(ranges.nonEmpty(indexedCounts.keySet()), query);
        buildLibraryNodes(indexedMatches);
        int emitted = indexedMatches.size() + buildLiveTypeNodes(liveMatches, ranges);

        if (!includeLibrary) {
            return;
        }
        // The whole imported pool is drained before the library tier, so the library's skip nets off that pool's
        // total capacity rather than the rows this particular page took from it - a pool that runs dry mid-page
        // contributes less than its share of the limit, and a later page, computed statelessly with no memory of
        // that, would otherwise skip past library rows that were never shown.
        int importedCapacity = pool.values().stream().mapToInt(Integer::intValue).sum();
        buildLibraryNodes(dbManager.searchTypesExcludingPackages(query, importedModules,
                Math.max(0, limit - emitted), Math.max(0, offset - importedCapacity)));
    }

    /**
     * Builds the node one imported type is emitted as.
     *
     * <p>Shared by the indexed and the live-compiled tiers so a type's node can't depend on which tier found it.
     * {@code TYPEDESC} for both: the index stores no type-kind column, so resolving the real kind on the live side
     * would make an imported type's node depend on whether its module happens to be indexed.</p>
     */
    private static AvailableNode typeNode(SearchResult.Package packageInfo, String typeName, String description) {
        Metadata metadata = new Metadata.Builder<>(null)
                .label(typeName)
                .description(description)
                .icon(CommonUtils.generateIcon(packageInfo.org(), packageInfo.packageName(), packageInfo.version()))
                .build();
        Codedata codedata = new Codedata.Builder<>(null)
                .node(NodeKind.TYPEDESC)
                .org(packageInfo.org())
                .module(packageInfo.moduleName())
                .packageName(packageInfo.packageName())
                .symbol(typeName)
                .version(packageInfo.version())
                .build();
        return new AvailableNode(metadata, codedata, true);
    }

    /**
     * Reads the imported modules the index doesn't know about from their module symbols and scores their public
     * types against the query.
     *
     * <p>Matches are ranked within each module rather than pooled across modules, to match how the indexed side is
     * paged: a page takes each module's own best matches, so no module's weaker matches can push another module's
     * stronger ones onto a later page.</p>
     *
     * @param indexedModules the imported modules the index does know, which are paged from the index instead
     * @return the ranked matches of each module read from its symbols, keyed by module
     */
    private Map<ModuleCoordinate, List<LiveTypeMatch>> collectLiveMatches(Set<ModuleCoordinate> indexedModules) {
        Set<ModuleCoordinate> missingModules = new HashSet<>();
        for (ModuleCoordinate module : importedModules) {
            if (!indexedModules.contains(module)) {
                missingModules.add(module);
            }
        }
        if (missingModules.isEmpty()) {
            return Map.of();
        }

        Package currentPackage = project.currentPackage();
        if (currentPackage.getResolution() == null || currentPackage.getResolution().dependencyGraph() == null) {
            return Map.of();
        }

        // getNodes() returns a HashMap keySet ordered by a UUID-derived hash, so it isn't stable across
        // re-resolutions; sort by the descriptor-based natural order instead.
        List<ResolvedPackageDependency> sortedDependencies =
                new ArrayList<>(currentPackage.getResolution().dependencyGraph().getNodes());
        Collections.sort(sortedDependencies);

        Map<ModuleCoordinate, ModuleSymbol> importedSymbols = importedModuleSymbols();
        Map<ModuleCoordinate, List<LiveTypeMatch>> matches = new HashMap<>();
        outer:
        for (ResolvedPackageDependency dependency : sortedDependencies) {
            Package dependencyPackage = dependency.packageInstance();
            if (dependencyPackage == null) {
                continue;
            }
            for (Module module : dependencyPackage.modules()) {
                // Match on organization as well as name: a same-named module from another organization is a
                // different module, and resolving it here would surface the wrong package's types.
                ModuleCoordinate coordinate =
                        ModuleCoordinate.of(dependencyPackage.packageOrg().value(), module.moduleName());
                if (!missingModules.contains(coordinate) || matches.containsKey(coordinate)) {
                    continue;
                }
                ModuleSymbol moduleSymbol = importedSymbols.get(coordinate);
                if (moduleSymbol == null) {
                    // Costs the user every type of this module, and a tier that reports nothing is
                    // indistinguishable from a module with no matches - so say so at a level that is on.
                    LOGGER.warning("No module symbol resolved for the imported module " + coordinate.org() + "/"
                            + coordinate.moduleName() + "; its types are absent from type search");
                    continue;
                }
                matches.put(coordinate,
                        collectLiveModuleTypes(moduleSymbol, coordinate.moduleName(), dependencyPackage));
                if (matches.size() >= missingModules.size()) {
                    break outer;
                }
            }
        }
        return matches;
    }

    /**
     * Emits each live-compiled module's slice of the page into the imported-types category.
     *
     * @param liveMatches the ranked matches of each compiled module
     * @param ranges      the page's allocation across the whole imported pool, indexed modules included
     * @return how many nodes were emitted
     */
    private int buildLiveTypeNodes(Map<ModuleCoordinate, List<LiveTypeMatch>> liveMatches,
                                   FairShareWindow.Ranges<ModuleCoordinate> ranges) {
        if (liveMatches.isEmpty()) {
            return 0;
        }
        Category.Builder importedTypesBuilder = rootBuilder.stepIn(Category.Name.IMPORTED_TYPES);
        int emitted = 0;
        // Ordered by coordinate so the emitted order doesn't depend on the map's iteration order.
        for (ModuleCoordinate module : new TreeSet<>(liveMatches.keySet())) {
            List<LiveTypeMatch> moduleMatches = liveMatches.get(module);
            FairShareWindow.Range range = ranges.of(module);
            int end = Math.min(range.skip() + range.take(), moduleMatches.size());
            for (int i = Math.max(range.skip(), 0); i < end; i++) {
                LiveTypeMatch match = moduleMatches.get(i);
                importedTypesBuilder.stepIn(match.moduleName(), "", List.of())
                        .node(typeNode(match.packageInfo(), match.typeName(), match.description()));
                emitted++;
            }
        }
        return emitted;
    }

    /**
     * Scores the public types of one imported module the index doesn't know, ranked best match first.
     *
     * <p>The symbols come from the module's {@link ModuleSymbol}, which the root compilation has already resolved.
     * Asking the dependency to compile itself instead does not work: a dependency resolved from a bala stops at
     * {@code MODULE_SYMBOL_LOADED} - its symbols are read from the BIR cache rather than compiled from source - and
     * {@code PackageCompilation.getSemanticModel} refuses any module that never reached {@code COMPILED}. That is
     * the state of every dependency of a project that has been built once, so this tier returned nothing at all for
     * exactly the projects it exists to serve.</p>
     *
     * <p>Client classes are excluded: those are connectors rather than types, mirroring what the index generator
     * itself leaves out. Enums are included, but have to be asked for separately: {@code EnumSymbol} is a
     * {@code TypeDefinitionSymbol}, yet {@link ModuleSymbol#typeDefinitions()} does not return them.</p>
     *
     * <p>Scoring starts from the same sanitized query the indexed tiers are given, but it is deliberately
     * <i>wider</i> than they are: the index is queried by FTS token prefix, while this scores substring and
     * Levenshtein matches too. A live module can therefore answer a query the indexed ones would not - searching
     * {@code CompressionType} also surfaces a live {@code Compression}. Narrowing it to token prefixes would mean
     * reimplementing FTS5 tokenization in Java for a pool that is meant to be forgiving, so the asymmetry is
     * accepted; widening the indexed side instead is the change to make if the two must agree exactly.</p>
     */
    private List<LiveTypeMatch> collectLiveModuleTypes(ModuleSymbol moduleSymbol, String moduleName,
                                                       Package dependencyPackage) {
        SearchResult.Package packageInfo = new SearchResult.Package(dependencyPackage.packageOrg().toString(),
                dependencyPackage.packageName().toString(), moduleName,
                dependencyPackage.packageVersion().toString());
        String liveQuery = SearchDatabaseManager.sanitizeQuery(query);

        List<Symbol> candidates = new ArrayList<>(moduleSymbol.typeDefinitions());
        candidates.addAll(moduleSymbol.classes());
        candidates.addAll(moduleSymbol.enums());

        List<LiveTypeMatch> matches = new ArrayList<>();
        for (Symbol symbol : candidates) {
            // Every one of those three lists holds Qualifiable symbols, so this cast is safe.
            Qualifiable qualifiable = (Qualifiable) symbol;
            if (!qualifiable.qualifiers().contains(Qualifier.PUBLIC)) {
                continue;
            }
            if (symbol instanceof ClassSymbol && qualifiable.qualifiers().contains(Qualifier.CLIENT)) {
                continue;
            }
            if (symbol.getName().isEmpty() || !isWritableTypeName(symbol.getName().get())) {
                continue;
            }
            String typeName = symbol.getName().get();
            String description = description(symbol);
            int score = RelevanceCalculator.calculateFuzzyRelevanceScore(typeName, description, liveQuery);
            if (score > 0) {
                matches.add(new LiveTypeMatch(packageInfo, typeName, description, score));
            }
        }
        // An empty query scores every type 1, so this settles into alphabetical order for the browse view.
        matches.sort(Comparator.comparingInt(LiveTypeMatch::score).reversed()
                .thenComparing(LiveTypeMatch::typeName));
        return matches;
    }

    /**
     * The {@link ModuleSymbol} of every module the active package imports, keyed by coordinate.
     *
     * <p>Read from the root modules' own semantic models, which are compiled from source and so always available -
     * unlike a dependency's. Keyed the way {@link ImportedModules} keys its coordinates, so a same-named module
     * from another organization stays distinct.</p>
     */
    private Map<ModuleCoordinate, ModuleSymbol> importedModuleSymbols() {
        Map<ModuleCoordinate, ModuleSymbol> moduleSymbols = new HashMap<>();
        Package currentPackage = project.currentPackage();
        for (Module module : PackageModuleUtils.modules(currentPackage)) {
            SemanticModel semanticModel;
            try {
                semanticModel = PackageUtil.getCompilation(currentPackage).getSemanticModel(module.moduleId());
            } catch (RuntimeException e) {
                LOGGER.log(Level.WARNING, "Failed to read the semantic model of module " + module.moduleName(), e);
                continue;
            }
            for (DocumentId documentId : module.documentIds()) {
                Document document = module.document(documentId);
                ModulePartNode rootNode = (ModulePartNode) document.syntaxTree().rootNode();
                for (ImportDeclarationNode importNode : rootNode.imports()) {
                    Optional<Symbol> symbol = semanticModel.symbol(importNode);
                    if (symbol.isEmpty() || symbol.get().kind() != SymbolKind.MODULE) {
                        continue;
                    }
                    ModuleSymbol moduleSymbol = (ModuleSymbol) symbol.get();
                    // ModuleID.moduleName() already spells a submodule the way ModuleCoordinate.of normalizes a
                    // resolved ModuleName - packageName[.moduleNamePart] - so it is taken as it stands.
                    moduleSymbols.putIfAbsent(new ModuleCoordinate(moduleSymbol.id().orgName(),
                            moduleSymbol.id().moduleName()), moduleSymbol);
                }
            }
        }
        return moduleSymbols;
    }

    /**
     * Whether a symbol's name can be written as {@code module:Name} in Ballerina source.
     *
     * <p>A module read from its BIR carries compiler-generated symbols that a source compilation never surfaced:
     * {@code ballerina/grpc} alone exposes a public anonymous service class, {@code $anonType$_0}, and a public
     * readonly intersection whose name is a type descriptor, {@code (ballerina/oauth2:2:ClientAuth & readonly)}.
     * Both carry {@code PUBLIC}, so no qualifier separates them from real types, and both sort ahead of every one
     * of them. Neither can be inserted into source, which is all this tier emits, so the name is the test.</p>
     */
    private static boolean isWritableTypeName(String name) {
        // A quoted identifier ('from) is still writable, so only its leading quote is skipped.
        int start = name.startsWith("'") ? 1 : 0;
        if (name.length() <= start || Character.isDigit(name.charAt(start))) {
            return false;
        }
        for (int index = start; index < name.length(); index++) {
            char character = name.charAt(index);
            if (!Character.isLetterOrDigit(character) && character != '_') {
                return false;
            }
        }
        return true;
    }

    private static String description(Symbol symbol) {
        return symbol instanceof Documentable documentable
                ? documentable.documentation().flatMap(Documentation::description).orElse("") : "";
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
     * @param packageInfo the dependency package the type was found in, keyed the way indexed results are so both
     *                    tiers can be emitted by one node builder
     * @param typeName    the name of the matched type
     * @param description the description of the matched type
     * @param score       the relevance score for ranking
     */
    private record LiveTypeMatch(SearchResult.Package packageInfo, String typeName, String description, int score) {

        String moduleName() {
            return packageInfo.moduleName();
        }
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
