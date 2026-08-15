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

package io.ballerina.flowmodelgenerator.core.utils;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.AnnotationAttachmentSymbol;
import io.ballerina.compiler.api.symbols.AnnotationSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.CaptureBindingPatternNode;
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ImplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ListConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ModuleVariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.PositionalArgumentNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.flowmodelgenerator.core.Constants;
import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.flowmodelgenerator.core.model.Option;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.PackageUtil;
import io.ballerina.projects.DependencyManifest;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.Package;
import io.ballerina.projects.PackageManifest;
import io.ballerina.projects.PackageName;
import io.ballerina.projects.PackageOrg;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import io.ballerina.tools.text.TextRange;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;

import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.ACTIVITY;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_MODULE;
import static io.ballerina.flowmodelgenerator.core.Constants.Workflow.WORKFLOW_ORG;

/**
 * Utility for workflow related operations.
 *
 * @since 1.8.0
 */
public class WorkflowUtil {

    private static final Logger LOGGER = Logger.getLogger(WorkflowUtil.class.getName());

    public static boolean isWorkflowModule(Optional<ModuleSymbol> moduleSymbol) {
        if (moduleSymbol.isEmpty()) {
            return false;
        }
        String moduleName = moduleSymbol.get().id().moduleName();
        String orgName = moduleSymbol.get().id().orgName();
        return WORKFLOW_ORG.equals(orgName) && WORKFLOW_MODULE.equals(moduleName);
    }

    /**
     * Checks if the given function symbol has the @workflow:Workflow annotation.
     *
     * @param symbol The function symbol to check
     * @return true if the function has @workflow:Workflow annotation, false otherwise
     */
    public static boolean isWorkflowFunction(Symbol symbol) {
        if (symbol == null) {
            return false;
        }
        if (symbol.kind() == SymbolKind.FUNCTION) {
            FunctionSymbol funcSymbol = (FunctionSymbol) symbol;
            List<AnnotationAttachmentSymbol> annotations = funcSymbol.annotAttachments();
            for (AnnotationAttachmentSymbol attachment : annotations) {
                AnnotationSymbol annotation = attachment.typeDescriptor();
                Optional<String> annotationName = annotation.getName();
                Optional<ModuleSymbol> moduleSymbol = annotation.getModule();

                if (annotationName.isPresent() && moduleSymbol.isPresent()) {
                    String name = annotationName.get();
                    if (WORKFLOW.equals(name) && isWorkflowModule(moduleSymbol)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    public static boolean isInsideWorkflowFunction(SemanticModel semanticModel, Node node) {
        Node parent = node;
        while (parent != null) {
            if (parent.kind() == SyntaxKind.FUNCTION_DEFINITION) {
                return isWorkflowFunction(semanticModel.symbol(parent).orElse(null));
            }
            parent = parent.parent();
        }
        return false;
    }

    /**
     * Checks whether the given module symbol is a module-level variable of the
     * {@code workflow:DurableAgent} class (a durable agentic workflow declaration).
     *
     * @param symbol the module symbol to check
     * @return true for a durable agent declaration
     */
    public static boolean isDurableAgentVariable(Symbol symbol) {
        if (!(symbol instanceof VariableSymbol variableSymbol)) {
            return false;
        }
        TypeSymbol rawType = CommonUtils.getRawType(variableSymbol.typeDescriptor());
        return rawType instanceof ClassSymbol classSymbol
                && classSymbol.getName()
                        .map(Constants.Workflow.DURABLE_AGENT_OBJECT_CLASS_NAME::equals).orElse(false)
                && isWorkflowModule(classSymbol.getModule());
    }

    /**
     * Checks whether the given module-level variable declaration declares a
     * {@code workflow:DurableAgent} object (the durable agentic workflow declaration form).
     * Falls back to a syntactic type-name match when the semantic model cannot resolve the
     * binding pattern symbol (e.g. while the module is still loading).
     *
     * @param varDecl       the module variable declaration
     * @param semanticModel the semantic model
     * @return true when the declaration's type is workflow:DurableAgent
     */
    public static boolean isDurableAgentDeclaration(ModuleVariableDeclarationNode varDecl,
                                                    SemanticModel semanticModel) {
        if (!(varDecl.typedBindingPattern().bindingPattern() instanceof CaptureBindingPatternNode)
                || varDecl.initializer().isEmpty()) {
            return false;
        }
        // Syntax first: the artifacts generator processes documents in parallel, and the
        // semantic model's lazy symbol resolution is not safe under that concurrency
        // (ConcurrentModificationException on agent-containing projects). The direct type
        // reference covers every plugin-accepted declaration shape.
        String typeText = varDecl.typedBindingPattern().typeDescriptor().toSourceCode().trim();
        if (typeText.equals(Constants.Workflow.DURABLE_AGENT_OBJECT_CLASS_NAME)
                || typeText.endsWith(":" + Constants.Workflow.DURABLE_AGENT_OBJECT_CLASS_NAME)) {
            return true;
        }
        Optional<Symbol> symbol = semanticModel.symbol(varDecl.typedBindingPattern().bindingPattern());
        if (symbol.isPresent() && symbol.get() instanceof VariableSymbol variableSymbol) {
            TypeSymbol rawType = CommonUtils.getRawType(variableSymbol.typeDescriptor());
            return rawType instanceof ClassSymbol classSymbol
                    && classSymbol.getName()
                            .map(Constants.Workflow.DURABLE_AGENT_OBJECT_CLASS_NAME::equals).orElse(false)
                    && isWorkflowModule(classSymbol.getModule());
        }
        return false;
    }


    /**
     * Checks whether the function symbol carries the {@code @ai:AgentTool} annotation.
     *
     * @param symbol the symbol to check
     * @return true for an agent tool function
     */
    public static boolean isAiAgentToolFunction(Symbol symbol) {
        if (symbol == null || symbol.kind() != SymbolKind.FUNCTION) {
            return false;
        }
        return ((FunctionSymbol) symbol).annotations().stream().anyMatch(annotation ->
                annotation.getName().map("AgentTool"::equals).orElse(false)
                        && annotation.getModule()
                        .map(module -> "ai".equals(module.id().moduleName()))
                        .orElse(false));
    }

    /**
     * Checks whether the module symbol is a module-level variable of an {@code ballerina/ai}
     * toolkit class (e.g. {@code ai:McpToolKit}), usable directly as an agent tool.
     *
     * @param symbol the module symbol to check
     * @return true for a toolkit variable
     */
    public static boolean isAiToolKitVariable(Symbol symbol) {
        if (!(symbol instanceof VariableSymbol variableSymbol)) {
            return false;
        }
        TypeSymbol rawType = CommonUtils.getRawType(variableSymbol.typeDescriptor());
        return rawType instanceof ClassSymbol classSymbol
                && classSymbol.getName().map(name -> name.endsWith("ToolKit")).orElse(false)
                && classSymbol.getModule()
                        .map(module -> "ai".equals(module.id().moduleName()))
                        .orElse(false);
    }

    /**
     * Checks if the given function symbol has the @workflow:Activity annotation.
     *
     * @param symbol symbol to check
     * @return true if the function has @workflow:Activity annotation, false otherwise
     */
    public static boolean isActivityFunction(Symbol symbol) {
        if (symbol == null) {
            return false;
        }
        if (symbol.kind() == SymbolKind.FUNCTION) {
            FunctionSymbol funcSymbol = (FunctionSymbol) symbol;
            List<AnnotationAttachmentSymbol> annotations = funcSymbol.annotAttachments();
            for (AnnotationAttachmentSymbol attachment : annotations) {
                AnnotationSymbol annotation = attachment.typeDescriptor();
                Optional<String> annotationName = annotation.getName();
                Optional<ModuleSymbol> moduleSymbol = annotation.getModule();

                if (annotationName.isPresent() && moduleSymbol.isPresent()) {
                    String name = annotationName.get();
                    if (ACTIVITY.equals(name) && isWorkflowModule(moduleSymbol)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    public static FunctionDefinitionNode findEnclosingWorkflowFunction(SourceBuilder sourceBuilder) {
        Document document = FileSystemUtils.getDocument(sourceBuilder.workspaceManager, sourceBuilder.filePath);
        SemanticModel semanticModel = FileSystemUtils.getSemanticModel(sourceBuilder.workspaceManager,
                sourceBuilder.filePath);
        LineRange lineRange = sourceBuilder.flowNode.codedata().lineRange();
        if (lineRange == null) {
            return null;
        }

        SyntaxTree syntaxTree = document.syntaxTree();
        int txtPos = document.textDocument().textPositionFrom(lineRange.startLine());
        TextRange range = TextRange.from(txtPos, 0);

        Node parent = ((ModulePartNode) syntaxTree.rootNode()).findNode(range);
        while (parent != null) {
            if (parent.kind() == SyntaxKind.FUNCTION_DEFINITION &&
                    isWorkflowFunction(semanticModel.symbol(parent).orElse(null))) {
                return (FunctionDefinitionNode) parent;
            } else if (parent.kind() != SyntaxKind.FUNCTION_DEFINITION) {
                parent = parent.parent();
            } else {
                return null;
            }
        }
        return null;
    }

    public static boolean isValidDataType(TypeSymbol typeSymbol) {
        typeSymbol = TypeUtils.resolveTypeReference(typeSymbol);
        TypeDescKind kind = typeSymbol.typeKind();

        // Must be a record type
        if (kind != TypeDescKind.RECORD) {
            return false;
        }

        // Check that it's a RecordTypeSymbol and all fields are future types
        Map<String, RecordFieldSymbol> fields = ((RecordTypeSymbol) typeSymbol).fieldDescriptors();
        if (fields.isEmpty()) {
            // Empty record is not a valid data record
            return false;
        }

        for (RecordFieldSymbol field : fields.values()) {
            TypeSymbol fieldType = TypeUtils.resolveTypeReference(field.typeDescriptor());
            if (fieldType.typeKind() != TypeDescKind.FUTURE) {
                return false;
            }
        }

        return true;
    }

    public static boolean isWorkflowContextParameter(ParameterSymbol paramSymbol) {
        TypeSymbol typeDesc = TypeUtils.resolveTypeReference(paramSymbol.typeDescriptor());
        return WorkflowUtil.isWorkflowModule(typeDesc.getModule())
                && typeDesc.getName().map(Constants.Workflow.CONTEXT_CLASS_NAME::equals).orElse(false);
    }

    /**
     * Resolves the given type to a client class symbol, if it is one. Activities generated from a
     * connection take the connection client (e.g. {@code http:Client}) as their first parameter; this
     * detects such a parameter so a connection-backed activity call can be modelled with a connection
     * association (and rendered with a connection arrow) rather than as a plain data argument.
     *
     * @param typeSymbol the parameter type to inspect
     * @return the client {@link ClassSymbol} if {@code typeSymbol} resolves to a {@code client} class
     */
    public static Optional<ClassSymbol> resolveConnectionClass(TypeSymbol typeSymbol) {
        if (typeSymbol == null) {
            return Optional.empty();
        }
        TypeSymbol resolved = TypeUtils.resolveTypeReference(typeSymbol);
        if (resolved instanceof ClassSymbol classSymbol && classSymbol.qualifiers().contains(Qualifier.CLIENT)) {
            return Optional.of(classSymbol);
        }
        return Optional.empty();
    }

    /**
     * Inserts a capability entry into a module-level {@code workflow:DurableAgent} declaration's
     * config literal: appended to the named list field when present, otherwise the field is
     * added with a single-element list.
     *
     * @param sourceBuilder the source builder carrying the workspace
     * @param agentVarName  the agent's module-level variable name
     * @param fieldName     the config field ({@code activities}/{@code tools}/{@code events}/{@code humanTasks})
     * @param entryText     the Ballerina source of the new entry
     * @return the text edits keyed by file path
     */
    public static Map<Path, List<org.eclipse.lsp4j.TextEdit>> insertAgentCapabilityEntry(
            SourceBuilder sourceBuilder, String agentVarName, String fieldName, String entryText) {
        AgentDeclaration declaration = findAgentDeclaration(sourceBuilder, agentVarName);
        if (declaration == null) {
            throw new UserFacingException("Cannot locate the durable agent declaration: " + agentVarName);
        }
        MappingConstructorExpressionNode config = declaration.config();

        LinePosition insertAt = null;
        String newText = null;
        for (MappingFieldNode field : config.fields()) {
            if (!(field instanceof SpecificFieldNode specificField)
                    || !fieldName.equals(specificField.fieldName().toSourceCode().trim())) {
                continue;
            }
            if (specificField.valueExpr().isPresent()
                    && specificField.valueExpr().get() instanceof ListConstructorExpressionNode list) {
                insertAt = list.closeBracket().lineRange().startLine();
                newText = (list.expressions().isEmpty() ? "" : ", ") + entryText;
                break;
            }
            // The field is there but is not a list literal (a reference, or a spread): appending a
            // second `<fieldName>: [...]` would write a duplicate key that does not compile, so say
            // what is in the way instead.
            throw new UserFacingException("The durable agent's '" + fieldName
                    + "' is not a list literal, so it cannot be edited from the designer: "
                    + "inline it as a list in the agent declaration and try again");
        }
        if (insertAt == null) {
            insertAt = config.closeBrace().lineRange().startLine();
            newText = (config.fields().isEmpty() ? "" : ", ") + fieldName + ": [" + entryText + "]";
        }
        org.eclipse.lsp4j.Position position =
                new org.eclipse.lsp4j.Position(insertAt.line(), insertAt.offset());
        Map<Path, List<org.eclipse.lsp4j.TextEdit>> edits = new HashMap<>();
        edits.put(declaration.filePath(), List.of(new org.eclipse.lsp4j.TextEdit(
                new org.eclipse.lsp4j.Range(position, position), newText)));
        return edits;
    }

    /**
     * Replaces an existing capability entry of a durable agent declaration with regenerated
     * entry source. The entry's range is the capability item's own line range, recorded by
     * the analyzer on the agent-box metadata.
     *
     * @param sourceBuilder the source builder whose flow node's line range is the entry range
     * @param agentVarName  the agent's module-level variable name (locates the file)
     * @param entryText     the replacement entry source
     * @return the text edits keyed by file path
     */
    public static Map<Path, List<org.eclipse.lsp4j.TextEdit>> replaceAgentCapabilityEntry(
            SourceBuilder sourceBuilder, String agentVarName, String entryText) {
        AgentDeclaration declaration = findAgentDeclaration(sourceBuilder, agentVarName);
        LineRange entryRange = sourceBuilder.flowNode.codedata().lineRange();
        if (declaration == null || entryRange == null) {
            throw new UserFacingException("Cannot locate the durable agent capability entry to update");
        }
        Map<Path, List<org.eclipse.lsp4j.TextEdit>> edits = new HashMap<>();
        edits.put(declaration.filePath(), List.of(new org.eclipse.lsp4j.TextEdit(
                new org.eclipse.lsp4j.Range(
                        new org.eclipse.lsp4j.Position(entryRange.startLine().line(),
                                entryRange.startLine().offset()),
                        new org.eclipse.lsp4j.Position(entryRange.endLine().line(),
                                entryRange.endLine().offset())),
                entryText)));
        return edits;
    }

    private record AgentDeclaration(Path filePath,
            MappingConstructorExpressionNode config) {
    }

    // Scans the default module for `final workflow:DurableAgent <name> = check new ({...})`
    // and returns the config mapping plus the declaring file.
    private static AgentDeclaration findAgentDeclaration(SourceBuilder sourceBuilder, String agentVarName) {
        Project project;
        try {
            project = sourceBuilder.workspaceManager.loadProject(sourceBuilder.filePath);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load the project for " + sourceBuilder.filePath, e);
        }
        Module module = project.currentPackage().getDefaultModule();
        for (DocumentId documentId : module.documentIds()) {
            Document document = module.document(documentId);
            ModulePartNode root = document.syntaxTree().rootNode();
            for (ModuleMemberDeclarationNode member : root.members()) {
                if (!(member instanceof ModuleVariableDeclarationNode varDecl)) {
                    continue;
                }
                if (!(varDecl.typedBindingPattern().bindingPattern()
                        instanceof CaptureBindingPatternNode capture)
                        || !agentVarName.equals(capture.variableName().text())) {
                    continue;
                }
                Optional<MappingConstructorExpressionNode> config = agentConfigLiteral(varDecl);
                if (config.isPresent()) {
                    return new AgentDeclaration(project.documentPath(documentId).orElse(sourceBuilder.filePath),
                            config.get());
                }
            }
        }
        return null;
    }

    /**
     * The config mapping literal of a durable agent declaration's initializer. Both the implicit
     * {@code check new ({...})} and the explicit {@code check new workflow:DurableAgent({...})}
     * shapes are accepted, so every path that reads or edits a declaration agrees on which
     * declarations it can handle.
     *
     * @param varDecl the module-level variable declaration
     * @return the config literal, or empty when the initializer is not a {@code new} with a
     *         positional mapping argument
     */
    public static Optional<MappingConstructorExpressionNode> agentConfigLiteral(
            ModuleVariableDeclarationNode varDecl) {
        return varDecl.initializer().flatMap(WorkflowUtil::agentConfigLiteral);
    }

    /**
     * The config mapping literal of a durable agent declaration's initializer expression. Same
     * contract as {@link #agentConfigLiteral(ModuleVariableDeclarationNode)}, for callers that
     * have already resolved the initializer — the flow and design model analyzers, which must
     * accept the same declaration shapes the edit paths do.
     *
     * @param initializerExpr the declaration's initializer expression
     * @return the config literal, or empty when the initializer is not a {@code new} with a
     *         positional mapping argument
     */
    public static Optional<MappingConstructorExpressionNode> agentConfigLiteral(ExpressionNode initializerExpr) {
        ExpressionNode initializer = initializerExpr;
        if (initializer instanceof CheckExpressionNode checkExpr) {
            initializer = checkExpr.expression();
        }
        SeparatedNodeList<FunctionArgumentNode> args;
        if (initializer instanceof ImplicitNewExpressionNode newExpr
                && newExpr.parenthesizedArgList().isPresent()) {
            args = newExpr.parenthesizedArgList().get().arguments();
        } else if (initializer instanceof ExplicitNewExpressionNode explicitNew) {
            args = explicitNew.parenthesizedArgList().arguments();
        } else {
            return Optional.empty();
        }
        if (args.isEmpty() || !(args.get(0) instanceof PositionalArgumentNode positional)
                || !(positional.expression() instanceof MappingConstructorExpressionNode config)) {
            return Optional.empty();
        }
        return Optional.of(config);
    }

    /**
     * The {@code ballerina/workflow} version the project resolves: the locked
     * {@code Dependencies.toml} entry first, then the explicit {@code Ballerina.toml} pin. Form
     * metadata that points at a workflow-declared type (the {@code Duration} record the timeout
     * fields edit) has to name the version actually in use, or the front end cannot open the
     * record-constructor editor for it.
     *
     * @param workspaceManager the workspace manager to resolve the project from
     * @param filePath         the file the form is opened in
     * @param fallback         the version to report when the project pins none, or cannot be read
     * @return the resolved version, else {@code fallback}
     */
    public static String workflowModuleVersion(
            org.ballerinalang.langserver.commons.workspace.WorkspaceManager workspaceManager, Path filePath,
            String fallback) {
        try {
            Package currentPackage = PackageUtil.loadProject(workspaceManager, filePath).currentPackage();
            DependencyManifest dependencyManifest = currentPackage.dependencyManifest();
            if (dependencyManifest != null) {
                Optional<String> locked = dependencyManifest
                        .dependency(PackageOrg.from(WORKFLOW_ORG), PackageName.from(WORKFLOW_MODULE))
                        .map(dependency -> dependency.version().value().toString());
                if (locked.isPresent()) {
                    return locked.get();
                }
            }
            PackageManifest manifest = currentPackage.manifest();
            if (manifest == null || manifest.dependencies() == null) {
                return fallback;
            }
            for (PackageManifest.Dependency dependency : manifest.dependencies()) {
                if (WORKFLOW_ORG.equals(dependency.org().value())
                        && WORKFLOW_MODULE.equals(dependency.name().value())
                        && dependency.version() != null) {
                    return dependency.version().value().toString();
                }
            }
            return fallback;
        } catch (RuntimeException e) {
            return fallback;
        }
    }

    /**
     * Lists the project's module-level {@code workflow:DurableAgent} variables as dropdown
     * options, one per agent. Shared by the agent driver forms (run/send data/read results).
     *
     * @param workspaceManager the workspace manager to resolve the project from
     * @param filePath         the file the form is opened in
     * @return dropdown options, one per durable agent variable
     */
    public static List<Option> durableAgentOptions(
            org.ballerinalang.langserver.commons.workspace.WorkspaceManager workspaceManager, Path filePath) {
        List<Option> options = new ArrayList<>();
        Package currentPackage =
                PackageUtil.loadProject(workspaceManager, filePath)
                        .currentPackage();
        PackageUtil.getCompilation(currentPackage);
        currentPackage.modules().forEach(module ->
                module.getCompilation().getSemanticModel().moduleSymbols().stream()
                        .filter(symbol -> symbol.kind() == SymbolKind.VARIABLE)
                        .filter(WorkflowUtil::isDurableAgentVariable)
                        .forEach(symbol -> symbol.getName().ifPresent(name -> options.add(
                                new Option(name, name)))));
        return options;
    }

    /**
     * Lists the data-event channel names declared across the default module's durable agent
     * declarations ({@code events: [{name: "...", ...}]}). Data-event channels are declared on
     * the agent — the call-site forms offer them as a fixed dropdown rather than free text.
     * The listing is restricted to one agent when {@code targetAgent} names a module-level
     * durable agent variable.
     *
     * @param workspaceManager the workspace manager to resolve the project from
     * @param filePath         the file the form is opened in
     * @param targetAgent      the agent variable name to scope to, or {@code null} for all agents
     * @return dropdown options, one per declared event channel (deduplicated, source order)
     */
    public static List<Option> declaredAgentEventOptions(
            org.ballerinalang.langserver.commons.workspace.WorkspaceManager workspaceManager, Path filePath,
            String targetAgent) {
        java.util.LinkedHashSet<String> names = new java.util.LinkedHashSet<>();
        Project project;
        try {
            project = workspaceManager.loadProject(filePath);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Skipping declared agent event options: failed to load the project of "
                    + filePath, e);
            return List.of();
        }
        Module module = project.currentPackage().getDefaultModule();
        for (DocumentId documentId : module.documentIds()) {
            Document document = module.document(documentId);
            ModulePartNode root = document.syntaxTree().rootNode();
            for (ModuleMemberDeclarationNode member : root.members()) {
                if (!(member instanceof ModuleVariableDeclarationNode varDecl) || varDecl.initializer().isEmpty()) {
                    continue;
                }
                String typeText = varDecl.typedBindingPattern().typeDescriptor().toSourceCode().trim();
                if (!typeText.equals(Constants.Workflow.DURABLE_AGENT_OBJECT_CLASS_NAME)
                        && !typeText.endsWith(":" + Constants.Workflow.DURABLE_AGENT_OBJECT_CLASS_NAME)) {
                    continue;
                }
                if (targetAgent != null && !targetAgent.isBlank()
                        && (!(varDecl.typedBindingPattern().bindingPattern()
                                instanceof CaptureBindingPatternNode capture)
                            || !targetAgent.equals(capture.variableName().text()))) {
                    continue;
                }
                agentConfigLiteral(varDecl).ifPresent(config -> collectDeclaredEventNames(config, names));
            }
        }
        return names.stream()
                .map(name -> new Option(name, name))
                .toList();
    }

    // Collects the `name` field of each mapping entry in the config's `events` list.
    private static void collectDeclaredEventNames(
            MappingConstructorExpressionNode config,
            java.util.Set<String> names) {
        for (MappingFieldNode field : config.fields()) {
            if (!(field instanceof SpecificFieldNode specificField)
                    || specificField.valueExpr().isEmpty()
                    || !"events".equals(specificField.fieldName().toSourceCode().trim())
                    || !(specificField.valueExpr().get()
                            instanceof ListConstructorExpressionNode list)) {
                continue;
            }
            for (Node item : list.expressions()) {
                if (item.kind() != SyntaxKind.MAPPING_CONSTRUCTOR) {
                    continue;
                }
                for (MappingFieldNode entryField
                        : ((MappingConstructorExpressionNode) item).fields()) {
                    if (entryField instanceof SpecificFieldNode entry
                            && entry.valueExpr().isPresent()
                            && "name".equals(entry.fieldName().toSourceCode().trim())) {
                        String raw = entry.valueExpr().get().toSourceCode().trim();
                        if (raw.length() >= 2 && raw.startsWith("\"") && raw.endsWith("\"")) {
                            raw = raw.substring(1, raw.length() - 1);
                        }
                        if (!raw.isEmpty()) {
                            names.add(raw);
                        }
                    }
                }
            }
        }
    }

    /**
     * Asserts the node targets an object-model durable agent declaration, as every durable agent
     * builder must before it edits the declaration literal.
     *
     * @param sourceBuilder the source builder
     */
    public static void requireDurableAgentObjectTarget(SourceBuilder sourceBuilder) {
        if (!isDurableAgentObjectTarget(sourceBuilder)) {
            throw new UserFacingException("Cannot generate the source: "
                    + "the durable agent declaration target is missing");
        }
    }

    /**
     * Whether the node targets an object-model durable agent declaration: the codedata carries
     * the {@code DurableAgent} object and the agent variable as the parent symbol.
     *
     * @param sourceBuilder the source builder
     * @return {@code true} when capability source generation must edit the declaration literal
     */
    public static boolean isDurableAgentObjectTarget(SourceBuilder sourceBuilder) {
        return Constants.Workflow.DURABLE_AGENT_OBJECT_CLASS_NAME
                .equals(sourceBuilder.flowNode.codedata().object())
                && sourceBuilder.flowNode.codedata().parentSymbol() != null
                && !sourceBuilder.flowNode.codedata().parentSymbol().isBlank();
    }

    /**
     * Adds or rewrites a capability entry on the targeted agent declaration: new nodes append to
     * the config list field, existing ones (codedata carries the entry's line range) are replaced.
     *
     * @param sourceBuilder the source builder
     * @param fieldName     the config field the entry belongs to
     * @param entryText     the entry source
     * @return the text edits keyed by file path
     */
    public static Map<Path, List<org.eclipse.lsp4j.TextEdit>> upsertAgentCapabilityEntry(
            SourceBuilder sourceBuilder, String fieldName, String entryText) {
        String agentVarName = sourceBuilder.flowNode.codedata().parentSymbol();
        boolean isNew = Boolean.TRUE.equals(sourceBuilder.flowNode.codedata().isNew())
                || sourceBuilder.flowNode.codedata().lineRange() == null;
        return isNew
                ? insertAgentCapabilityEntry(sourceBuilder, agentVarName, fieldName, entryText)
                : replaceAgentCapabilityEntry(sourceBuilder, agentVarName, entryText);
    }

    /**
     * Normalizes a constant-name form value to a plain string literal: raw text is quoted,
     * a string template WITHOUT interpolations collapses to its text, and anything else
     * (interpolated templates, expressions) passes through unchanged — the compiler plugin
     * rejects those, since capability names must be compile-time constants.
     *
     * @param value the raw form value
     * @return a plain string literal where possible
     */
    public static String constantNameLiteral(String value) {
        String trimmed = value.trim();
        if (trimmed.startsWith("string `") && trimmed.endsWith("`")) {
            String content = trimmed.substring("string `".length(), trimmed.length() - 1);
            if (!content.contains("${")) {
                return "\"" + content.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
            }
            return trimmed;
        }
        return quoteIfPlain(trimmed);
    }

    /**
     * Quotes a plain value as a string literal; already-quoted values and template strings pass
     * through unchanged.
     *
     * @param value the raw form value
     * @return a Ballerina string expression
     */
    public static String quoteIfPlain(String value) {
        String trimmed = value.trim();
        if ((trimmed.startsWith("\"") && trimmed.endsWith("\""))
                || trimmed.startsWith("string `") || trimmed.startsWith("[")) {
            return trimmed;
        }
        return "\"" + trimmed.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    // Characters that cannot occur in a bare role name but do occur in references and calls.
    private static final java.util.regex.Pattern EXPRESSION_LIKE =
            java.util.regex.Pattern.compile("[(){}:.]");

    /**
     * Quotes a user-role value like {@link #quoteIfPlain}, but leaves anything that reads as an
     * expression — a module-qualified reference, a call, a member access, an interpolation —
     * untouched. Only a bare word is a role name; quoting an expression would rewrite a valid
     * reference into a string literal.
     *
     * @param value the raw form value
     * @return a Ballerina string, string[] or reference expression
     */
    public static String quoteIfBareRole(String value) {
        String trimmed = value.trim();
        if (EXPRESSION_LIKE.matcher(trimmed).find()) {
            return trimmed;
        }
        return quoteIfPlain(trimmed);
    }

    /** Property key the front end sets to request removal of a capability entry. */
    public static final String CAPABILITY_DELETE_KEY = "__delete";

    /**
     * Whether the node is a capability-delete request: the front end stamps the
     * {@link #CAPABILITY_DELETE_KEY} property when the user removes a capability circle.
     *
     * @param sourceBuilder the source builder
     * @return {@code true} when the targeted entry must be removed
     */
    public static boolean isCapabilityDeleteRequest(SourceBuilder sourceBuilder) {
        return sourceBuilder.getProperty(CAPABILITY_DELETE_KEY)
                .map(p -> p.value() != null && "true".equals(p.value().toString()))
                .orElse(false);
    }

    /**
     * Removes a capability entry (the flow node's line range) from its declaration config list,
     * consuming the adjacent comma so the list stays valid; a now-empty list is left as {@code []}.
     *
     * @param sourceBuilder the source builder whose flow node's line range is the entry range
     * @return the text edits keyed by file path
     */
    public static Map<Path, List<org.eclipse.lsp4j.TextEdit>> removeAgentCapabilityEntry(
            SourceBuilder sourceBuilder) {
        String agentVarName = sourceBuilder.flowNode.codedata().parentSymbol();
        LineRange entryRange = sourceBuilder.flowNode.codedata().lineRange();
        AgentDeclaration declaration = findAgentDeclaration(sourceBuilder, agentVarName);
        if (declaration == null || entryRange == null) {
            throw new UserFacingException("Cannot locate the durable agent capability entry to remove");
        }
        for (MappingFieldNode field : declaration.config().fields()) {
            if (!(field instanceof SpecificFieldNode specificField)
                    || specificField.valueExpr().isEmpty()
                    || !(specificField.valueExpr().get()
                            instanceof ListConstructorExpressionNode list)) {
                continue;
            }
            var expressions = list.expressions();
            for (int i = 0; i < expressions.size(); i++) {
                Node item = expressions.get(i);
                if (!item.lineRange().startLine().equals(entryRange.startLine())) {
                    continue;
                }
                LinePosition from;
                LinePosition to;
                if (expressions.size() == 1) {
                    // Only element: clear the list interior, leaving `field: []`.
                    from = list.openBracket().lineRange().endLine();
                    to = list.closeBracket().lineRange().startLine();
                } else if (i > 0) {
                    // Delete from the end of the previous element (consumes the separating comma).
                    from = expressions.get(i - 1).lineRange().endLine();
                    to = item.lineRange().endLine();
                } else {
                    // First of several: delete up to the next element's start (consumes the comma).
                    from = item.lineRange().startLine();
                    to = expressions.get(1).lineRange().startLine();
                }
                Map<Path, List<org.eclipse.lsp4j.TextEdit>> edits = new HashMap<>();
                edits.put(declaration.filePath(), new ArrayList<>(List.of(
                        new org.eclipse.lsp4j.TextEdit(new org.eclipse.lsp4j.Range(
                                new org.eclipse.lsp4j.Position(from.line(), from.offset()),
                                new org.eclipse.lsp4j.Position(to.line(), to.offset())), ""))));
                return edits;
            }
        }
        throw new UserFacingException("The capability entry was not found in the agent declaration");
    }

    /**
     * Sets several top-level config fields at once: existing fields are replaced individually and
     * all missing ones are appended in a single insertion, keeping the mapping's commas valid even
     * when the config starts empty.
     *
     * @param sourceBuilder the source builder carrying the workspace
     * @param agentVarName  the agent's module-level variable name
     * @param fields        field name to new value source, in insertion order
     * @return the text edits keyed by file path
     */
    public static Map<Path, List<org.eclipse.lsp4j.TextEdit>> setAgentConfigFields(
            SourceBuilder sourceBuilder, String agentVarName,
            java.util.LinkedHashMap<String, String> fields) {
        AgentDeclaration declaration = findAgentDeclaration(sourceBuilder, agentVarName);
        if (declaration == null) {
            throw new UserFacingException("Cannot locate the durable agent declaration: " + agentVarName);
        }
        MappingConstructorExpressionNode config = declaration.config();
        List<org.eclipse.lsp4j.TextEdit> edits = new ArrayList<>();
        java.util.LinkedHashMap<String, String> missing = new java.util.LinkedHashMap<>(fields);
        for (MappingFieldNode field : config.fields()) {
            if (field instanceof SpecificFieldNode specificField
                    && specificField.valueExpr().isPresent()) {
                String name = specificField.fieldName().toSourceCode().trim();
                String replacement = missing.remove(name);
                if (replacement != null) {
                    LineRange valueRange = specificField.valueExpr().get().lineRange();
                    edits.add(new org.eclipse.lsp4j.TextEdit(new org.eclipse.lsp4j.Range(
                            new org.eclipse.lsp4j.Position(valueRange.startLine().line(),
                                    valueRange.startLine().offset()),
                            new org.eclipse.lsp4j.Position(valueRange.endLine().line(),
                                    valueRange.endLine().offset())), replacement));
                }
            }
        }
        if (!missing.isEmpty()) {
            StringBuilder insertion = new StringBuilder();
            boolean first = config.fields().isEmpty();
            for (Map.Entry<String, String> entry : missing.entrySet()) {
                if (!first) {
                    insertion.append(", ");
                }
                insertion.append(entry.getKey()).append(": ").append(entry.getValue());
                first = false;
            }
            LinePosition closeBrace = config.closeBrace().lineRange().startLine();
            org.eclipse.lsp4j.Position position =
                    new org.eclipse.lsp4j.Position(closeBrace.line(), closeBrace.offset());
            edits.add(new org.eclipse.lsp4j.TextEdit(
                    new org.eclipse.lsp4j.Range(position, position), insertion.toString()));
        }
        Map<Path, List<org.eclipse.lsp4j.TextEdit>> result = new HashMap<>();
        result.put(declaration.filePath(), edits);
        return result;
    }
}
