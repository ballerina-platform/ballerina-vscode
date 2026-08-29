/*
 *  Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com)
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

import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.flowmodelgenerator.core.AiUtils;
import io.ballerina.flowmodelgenerator.core.model.AvailableNode;
import io.ballerina.flowmodelgenerator.core.model.Category;
import io.ballerina.flowmodelgenerator.core.model.Codedata;
import io.ballerina.flowmodelgenerator.core.model.Item;
import io.ballerina.flowmodelgenerator.core.model.Metadata;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.node.AutomationBuilder;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.PackageModuleUtils;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.Project;
import io.ballerina.projects.directory.BuildProject;
import io.ballerina.projects.directory.WorkspaceProject;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.common.utils.PositionUtil;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import static io.ballerina.flowmodelgenerator.core.search.SearchCommand.CURRENT_INTEGRATION_INDICATOR;
import static io.ballerina.flowmodelgenerator.core.search.SearchCommand.DATA_MAPPER_FILE_NAME;

/**
 * Utility class that builds workspace function nodes for search results. This encapsulates the logic for discovering
 * and building function nodes from the current project and workspace projects.
 *
 * @since 1.7.0
 */
class WorkspaceFunctionNodeBuilder {

    private WorkspaceFunctionNodeBuilder() {
    }

    /**
     * Builds workspace function nodes and adds them to the root builder.
     *
     * @param rootBuilder  the category builder to add nodes to
     * @param project      the current project
     * @param position     the current cursor position
     * @param query        the search query
     * @param functionsDoc the functions document for NL expression body checks
     */
    static void buildWorkspaceNodes(Category.Builder rootBuilder, Project project, LineRange position,
                                    String query, Document functionsDoc) {
        Category.Builder agentToolsBuilder = rootBuilder.stepIn(Category.Name.AGENT_TOOLS);

        Optional<WorkspaceProject> workspaceProject = project.workspaceProject();
        if (workspaceProject.isEmpty()) {
            Category.Builder projectBuilder = rootBuilder.stepIn(Category.Name.CURRENT_INTEGRATION);
            buildProjectNodes(project, project, projectBuilder, agentToolsBuilder, position, query, functionsDoc);
            return;
        }

        PackageName currProjPackageName = project.currentPackage().packageName();

        Category.Builder workspaceBuilder = rootBuilder.stepIn(Category.Name.CURRENT_WORKSPACE);

        // Build current integration first to ensure it appears at the top
        Category.Builder currIntProjBuilder = workspaceBuilder.stepIn(
                currProjPackageName.value() + CURRENT_INTEGRATION_INDICATOR, "", List.of());
        Category.Builder currIntAgtToolsBuilder = agentToolsBuilder.stepIn(
                currProjPackageName.value() + CURRENT_INTEGRATION_INDICATOR, "", List.of());
        buildProjectNodes(project, project, currIntProjBuilder, currIntAgtToolsBuilder, position, query, functionsDoc);

        List<BuildProject> projects = workspaceProject.get().projects();
        for (BuildProject buildProject : projects) {
            PackageName packageName = buildProject.currentPackage().packageName();
            if (packageName.equals(currProjPackageName)) {
                continue;
            }

            Category.Builder projectBuilder = workspaceBuilder.stepIn(packageName.value(), "", List.of());
            Category.Builder projectAgentToolsBuilder = agentToolsBuilder.stepIn(packageName.value(), "", List.of());
            buildProjectNodes(project, buildProject, projectBuilder, projectAgentToolsBuilder, position, query,
                    functionsDoc);
        }
    }

    /**
     * Builds the module-aware workspace results used only by function helper search.
     */
    static void buildSubmoduleWorkspaceNodes(Category.Builder rootBuilder, Project project, LineRange position,
                                             String query, Document functionsDoc) {
        Category.Builder agentToolsBuilder = rootBuilder.stepIn(Category.Name.AGENT_TOOLS);
        Module currentModule = PackageModuleUtils.findModule(project.currentPackage(),
                        position == null ? null : position.fileName())
                .orElse(project.currentPackage().getDefaultModule());
        Optional<WorkspaceProject> workspaceProject = project.workspaceProject();
        if (workspaceProject.isEmpty()) {
            Category.Builder packageBuilder = rootBuilder.stepIn(Category.Name.CURRENT_INTEGRATION);
            buildPackageModules(project, project, currentModule, packageBuilder, agentToolsBuilder,
                    position, query, functionsDoc);
            return;
        }

        Category.Builder workspaceBuilder = rootBuilder.stepIn(Category.Name.CURRENT_WORKSPACE);
        String currentPackageName = project.currentPackage().packageName().value();
        Category.Builder currentPackageBuilder = workspaceBuilder.stepIn(
                currentPackageName + CURRENT_INTEGRATION_INDICATOR, "", List.of());
        Category.Builder currentAgentPackageBuilder = agentToolsBuilder.stepIn(
                currentPackageName + CURRENT_INTEGRATION_INDICATOR, "", List.of());
        buildPackageModules(project, project, currentModule, currentPackageBuilder, currentAgentPackageBuilder,
                position, query, functionsDoc);
        PackageName currentPackage = project.currentPackage().packageName();
        for (BuildProject buildProject : workspaceProject.get().projects()) {
            if (buildProject.currentPackage().packageName().equals(currentPackage)) {
                continue;
            }
            String packageName = buildProject.currentPackage().packageName().value();
            Category.Builder packageBuilder = workspaceBuilder.stepIn(packageName, "", List.of());
            Category.Builder agentPackageBuilder = agentToolsBuilder.stepIn(packageName, "", List.of());
            buildPackageModules(project, buildProject, currentModule, packageBuilder, agentPackageBuilder,
                    position, query, null);
        }
    }

    private static void buildPackageModules(Project currentProject, Project targetProject, Module currentModule,
                                            Category.Builder parentBuilder, Category.Builder agentToolsBuilder,
                                            LineRange position, String query, Document functionsDoc) {
        WorkspaceModuleSearchUtils.ModuleItems packageItems = WorkspaceModuleSearchUtils.buildPackageModules(
                currentProject, targetProject, currentModule, context -> {
                    ModuleNodes moduleNodes = buildModuleNodes(getFunctions(context.semanticModel()),
                            context.module(), context.current(), context.relation(), position, query,
                            functionsDocument(context.module(), functionsDoc));
                    return new WorkspaceModuleSearchUtils.ModuleItems(
                            moduleNodes.functions(), moduleNodes.agentTools());
                });
        parentBuilder.items(packageItems.items());
        agentToolsBuilder.items(packageItems.auxiliaryItems());
    }

    private static ModuleNodes buildModuleNodes(List<FunctionSymbol> functions, Module module, boolean current,
                                                String relation, LineRange position, String query,
                                                Document functionsDoc) {
        List<Item> availableNodes = new ArrayList<>();
        List<Item> availableTools = new ArrayList<>();
        for (FunctionSymbol function : functions) {
            if (!current && !function.qualifiers().contains(Qualifier.PUBLIC)) {
                continue;
            }
            if (isNaturalExprBodiedFunction(function, functionsDoc) || WorkflowUtil.isActivityFunction(function)
                    || WorkflowUtil.isWorkflowFunction(function)) {
                continue;
            }
            boolean dataMapped = isDataMappedFunction(function);
            if (dataMapped && current && position != null && function.getLocation().isPresent()) {
                LineRange functionRange = function.getLocation().get().lineRange();
                if (position.fileName().replace('\\', '/').endsWith(functionRange.fileName().replace('\\', '/'))
                        && PositionUtil.isWithinLineRange(functionRange, position)) {
                    continue;
                }
            }
            if (!isValidFunctionForSearchQuery(function, query)) {
                continue;
            }
            boolean agentTool = isAgentTool(function);
            AvailableNode availableNode = createAvailableNode(function, dataMapped, agentTool,
                    function.qualifiers().contains(Qualifier.ISOLATED), module, relation);
            if (agentTool) {
                availableTools.add(availableNode);
            } else {
                availableNodes.add(availableNode);
            }
        }
        return new ModuleNodes(availableNodes, availableTools);
    }

    private static void buildProjectNodes(Project currentProject, Project targetProject,
                                           Category.Builder projectBuilder,
                                           Category.Builder projectAgentToolsBuilder,
                                           LineRange position, String query, Document functionsDoc) {
        List<FunctionSymbol> functions = getFunctions(targetProject);

        boolean isCurrIntProject = currentProject.currentPackage().packageName()
                .equals(targetProject.currentPackage().packageName());

        List<FunctionSymbol> filteredFunctions;
        if (!isCurrIntProject) {
            filteredFunctions = functions.stream()
                    .filter(func -> func.qualifiers().contains(Qualifier.PUBLIC))
                    .toList();
        } else {
            filteredFunctions = functions;
        }

        List<Item> availableNodes = new ArrayList<>();
        List<Item> availableTools = new ArrayList<>();

        for (FunctionSymbol func : filteredFunctions) {
            if (isNaturalExprBodiedFunction(func, functionsDoc) || WorkflowUtil.isActivityFunction(func) ||
                    WorkflowUtil.isWorkflowFunction(func)) {
                continue;
            }

            boolean isDataMappedFunction = isDataMappedFunction(func);
            if (isDataMappedFunction && isCurrIntProject) {
                LineRange fnLineRange = func.getLocation().get().lineRange();
                if (fnLineRange.fileName().equals(position.fileName()) &&
                        PositionUtil.isWithinLineRange(fnLineRange, position)) {
                    continue;
                }
            }

            if (!isValidFunctionForSearchQuery(func, query)) {
                continue;
            }

            boolean isAgentTool = isAgentTool(func);
            boolean isIsolatedFunction = func.qualifiers().contains(Qualifier.ISOLATED);

            AvailableNode availableNode = createAvailableNode(func, isDataMappedFunction, isAgentTool,
                    isIsolatedFunction);

            if (isAgentTool) {
                availableTools.add(availableNode);
            } else {
                availableNodes.add(availableNode);
            }
        }

        projectBuilder.items(availableNodes);
        projectAgentToolsBuilder.items(availableTools);
    }

    static List<FunctionSymbol> getFunctions(Project project) {
        Package currentPackage = project.currentPackage();

        return PackageUtil.getCompilation(currentPackage)
                .getSemanticModel(currentPackage.getDefaultModule().moduleId())
                .moduleSymbols().stream()
                .filter(symbol -> symbol.kind().equals(SymbolKind.FUNCTION) &&
                        !symbol.nameEquals(AutomationBuilder.MAIN_FUNCTION_NAME))
                .map(symbol -> (FunctionSymbol) symbol)
                .toList();
    }

    static boolean isAgentTool(FunctionSymbol functionSymbol) {
        return AiUtils.isAgentToolFunction(functionSymbol);
    }

    static boolean isNaturalExprBodiedFunction(FunctionSymbol functionSymbol, Document functionsDoc) {
        if (functionsDoc == null || functionSymbol.getLocation().isEmpty()) {
            return false;
        }
        String functionFileName = functionSymbol.getLocation().get().lineRange().fileName().replace('\\', '/');
        String documentName = functionsDoc.name().replace('\\', '/');
        return (functionFileName.equals(documentName) || functionFileName.endsWith("/" + documentName))
                && CommonUtils.isNaturalExpressionBodiedFunction(functionsDoc.syntaxTree(), functionSymbol);
    }

    private static Document functionsDocument(Module module, Document currentFunctionsDoc) {
        if (currentFunctionsDoc != null && currentFunctionsDoc.module().moduleId().equals(module.moduleId())) {
            return currentFunctionsDoc;
        }
        return module.documentIds().stream()
                .map(module::document)
                .filter(document -> document.name().equals("functions.bal"))
                .findFirst()
                .orElse(null);
    }

    static boolean isValidFunctionForSearchQuery(FunctionSymbol functionSymbol, String query) {
        if (functionSymbol.getName().isEmpty()) {
            return false;
        }
        String functionName = functionSymbol.getName().get().toLowerCase(Locale.ROOT);
        return query.isEmpty() || functionName.contains(query.toLowerCase(Locale.ROOT));
    }

    static boolean isDataMappedFunction(FunctionSymbol functionSymbol) {
        Optional<Location> location = functionSymbol.getLocation();
        return location.isPresent() && location.get().lineRange().fileName().equals(DATA_MAPPER_FILE_NAME);
    }

    static AvailableNode createAvailableNode(FunctionSymbol functionSymbol,
                                              boolean isDataMappedFunction,
                                              boolean isAgentTool,
                                              boolean isIsolatedFunction) {
        Metadata metadata = new Metadata.Builder<>(null)
                .label(functionSymbol.getName().get())
                .description(functionSymbol.documentation()
                        .flatMap(Documentation::description)
                        .orElse(null))
                .addData("isDataMappedFunction", isDataMappedFunction)
                .addData("isAgentTool", isAgentTool)
                .addData("isIsolatedFunction", isIsolatedFunction)
                .build();

        Codedata.Builder<Object> codedataBuilder = new Codedata.Builder<>(null)
                .node(NodeKind.FUNCTION_CALL)
                .symbol(functionSymbol.getName().get());
        Optional<ModuleSymbol> moduleSymbol = functionSymbol.getModule();
        if (moduleSymbol.isPresent()) {
            ModuleID id = moduleSymbol.get().id();
            codedataBuilder
                    .org(id.orgName())
                    .module(id.packageName())
                    .version(id.version());
        }

        return new AvailableNode(metadata, codedataBuilder.build(), true);
    }

    private static List<FunctionSymbol> getFunctions(SemanticModel semanticModel) {
        return semanticModel.moduleSymbols().stream()
                .filter(symbol -> symbol.kind().equals(SymbolKind.FUNCTION)
                        && !symbol.nameEquals(AutomationBuilder.MAIN_FUNCTION_NAME))
                .map(symbol -> (FunctionSymbol) symbol)
                .toList();
    }

    private static AvailableNode createAvailableNode(FunctionSymbol function, boolean dataMapped,
                                                     boolean agentTool, boolean isolated, Module ownerModule,
                                                     String moduleRelation) {
        boolean generated = PackageModuleUtils.isGenerated(ownerModule);
        String moduleKind = PackageModuleUtils.moduleKind(ownerModule);
        Metadata.Builder<Object> metadataBuilder = new Metadata.Builder<>(null)
                .label(function.getName().orElseThrow())
                .description(function.documentation().flatMap(Documentation::description).orElse(null))
                .addData("isDataMappedFunction", dataMapped)
                .addData("isAgentTool", agentTool)
                .addData("isIsolatedFunction", isolated);

        Codedata.Builder<Object> codedataBuilder = new Codedata.Builder<>(null)
                .node(NodeKind.FUNCTION_CALL)
                .symbol(function.getName().orElseThrow())
                .isGenerated(generated)
                .data("moduleRelation", moduleRelation)
                .data("moduleKind", moduleKind);
        function.getModule().ifPresent(module -> {
            ModuleID id = module.id();
            codedataBuilder.org(id.orgName()).module(id.moduleName()).version(id.version());
            if (!PackageModuleUtils.CURRENT_MODULE.equals(moduleRelation)) {
                codedataBuilder.packageName(id.packageName());
            }
        });
        return new AvailableNode(metadataBuilder.build(), codedataBuilder.build(), true);
    }

    private record ModuleNodes(List<Item> functions, List<Item> agentTools) {
    }
}
