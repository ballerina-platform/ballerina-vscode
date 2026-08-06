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
import io.ballerina.modelgenerator.commons.PackageModuleUtils;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.modelgenerator.commons.SearchResult;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleName;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.projects.directory.WorkspaceProject;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.common.utils.SymbolUtil;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

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

    private final List<String> moduleNames;

    public TypeSearchCommand(Project project, LineRange position, Map<String, String> queryMap) {
        super(project, position, queryMap);

        // Obtain the imported project names
        Package currentPackage = project.currentPackage();
        PackageUtil.getCompilation(currentPackage);
        Module currentModule = PackageModuleUtils.findModule(currentPackage,
                        position == null ? null : position.fileName())
                .orElse(currentPackage.getDefaultModule());
        moduleNames = currentModule.moduleDependencies().stream()
                .map(moduleDependency -> {
                    ModuleName name = moduleDependency.descriptor().name();
                    if (Objects.nonNull(name.moduleNamePart()) && !name.moduleNamePart().isEmpty()) {
                        return name.packageName().value() + "." + name.moduleNamePart();
                    }
                    return name.packageName().value();
                })
                .toList();
    }

    @Override
    protected List<Item> defaultView() {
        buildWorkspaceNodes();
        List<SearchResult> searchResults = new ArrayList<>();
        if (!moduleNames.isEmpty()) {
            searchResults.addAll(dbManager.searchTypesByPackages(moduleNames, limit, offset));
        }

        buildLibraryNodes(searchResults);
        return rootBuilder.build().items();
    }

    @Override
    protected List<Item> search() {
        buildWorkspaceNodes();
        List<SearchResult> typeSearchList = dbManager.searchTypes(query, limit, offset);
        buildLibraryNodes(typeSearchList);
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

    private void buildLibraryNodes(List<SearchResult> typeSearchList) {
        // Set the categories based on available flags
        Category.Builder importedTypesBuilder = rootBuilder.stepIn(Category.Name.IMPORTED_TYPES);
        Category.Builder availableTypesBuilder = rootBuilder.stepIn(Category.Name.STANDARD_LIBRARY);

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
            Category.Builder builder;
            if (moduleNames.contains(packageInfo.moduleName())) {
                builder = importedTypesBuilder;
            } else {
                builder = availableTypesBuilder;
            }
            if (builder != null) {
                builder.stepIn(packageInfo.moduleName(), "", List.of())
                        .node(new AvailableNode(metadata, codedata, true));
            }
        }
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
