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

package io.ballerina.copilotagent.core;

import io.ballerina.compiler.syntax.tree.BlockStatementNode;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.DoStatementNode;
import io.ballerina.compiler.syntax.tree.ExpressionFunctionBodyNode;
import io.ballerina.compiler.syntax.tree.ForEachStatementNode;
import io.ballerina.compiler.syntax.tree.ForkStatementNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyBlockNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.IfElseStatementNode;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.LockStatementNode;
import io.ballerina.compiler.syntax.tree.MatchClauseNode;
import io.ballerina.compiler.syntax.tree.MatchStatementNode;
import io.ballerina.compiler.syntax.tree.NamedWorkerDeclarationNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.OnFailClauseNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.StatementNode;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.compiler.syntax.tree.TransactionStatementNode;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.compiler.syntax.tree.WhileStatementNode;
import io.ballerina.copilotagent.core.models.ChangeType;
import io.ballerina.copilotagent.core.models.NodeKind;
import io.ballerina.copilotagent.core.models.Result;
import io.ballerina.copilotagent.core.models.STNodeRefMap;
import io.ballerina.copilotagent.core.models.SemanticDiff;
import io.ballerina.copilotagent.core.models.ServiceMemberMap;
import io.ballerina.designmodelgenerator.core.DesignModelGenerator;
import io.ballerina.designmodelgenerator.core.model.Connection;
import io.ballerina.designmodelgenerator.core.model.DesignModel;
import io.ballerina.designmodelgenerator.core.model.Listener;
import io.ballerina.projects.Document;
import io.ballerina.projects.Module;
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.stream.Collectors;

/**
 * Computes semantic differences between two Ballerina projects.
 *
 * @since 1.5.0
 */
public class SemanticDiffComputer {

    private final Project originalProject;
    private final Project modifiedProject;
    private final List<SemanticDiff> semanticDiffs = new ArrayList<>();
    private final String rootProjectPath;
    // Document-name → absolute path for the module currently being diffed. LineRange only
    // carries the document name, which for module/test documents does not resolve against
    // the project root; this map recovers the real on-disk path. Rebuilt per module.
    private final Map<String, Path> currentModuleFilePaths = new HashMap<>();
    private boolean loadDesignDiagrams = false;

    public SemanticDiffComputer(Project originalProject,
                                Project modifiedProject) {

        this.originalProject = originalProject;
        this.modifiedProject = modifiedProject;
        this.rootProjectPath = originalProject.sourceRoot().toString();
    }

    public Result computeSemanticDiffs() {

        // Diff module by module: name-keyed construct maps are only unique within a module
        // (the same function name may legally exist in two modules), and per-module passes
        // keep document names unambiguous. The union covers added/removed modules.
        Map<String, Module> originalModules = collectModules(originalProject);
        Map<String, Module> modifiedModules = collectModules(modifiedProject);
        Set<String> allModuleNames = new LinkedHashSet<>();
        allModuleNames.addAll(originalModules.keySet());
        allModuleNames.addAll(modifiedModules.keySet());

        for (String moduleName : allModuleNames) {
            computeModuleSemanticDiffs(originalModules.get(moduleName), modifiedModules.get(moduleName));
        }

        String compilationError = null;
        if (!loadDesignDiagrams) {
            try {
                compareUsingDesignDiagrams();
            } catch (Throwable t) {
                // The design-model comparison is the only step that needs a full package
                // compilation, which can fail for reasons unrelated to the edit (e.g. an
                // unresolvable dependency). The syntax-level diffs above are still valid,
                // so report the failure instead of discarding them.
                compilationError = rootCauseMessage(t);
            }
        }

        return new Result(loadDesignDiagrams, this.semanticDiffs, compilationError);
    }

    // Unwraps only async plumbing (CompletionException from join()); the first real
    // exception's message already carries the full context (e.g. which module failed).
    private static String rootCauseMessage(Throwable throwable) {
        Throwable cause = throwable;
        while (cause instanceof CompletionException
                && cause.getCause() != null && cause.getCause() != cause) {
            cause = cause.getCause();
        }
        String message = cause.getMessage();
        return message == null || message.isBlank() ? cause.getClass().getName() : message;
    }

    private static Map<String, Module> collectModules(Project project) {
        Map<String, Module> modules = new LinkedHashMap<>();
        project.currentPackage().modules().forEach(module ->
                modules.put(module.moduleName().toString(), module));
        return modules;
    }

    /**
     * Computes the semantic diffs contributed by one module. Either side may be null when the
     * module itself was added or removed; the corresponding document map is then empty, so
     * every construct on the other side registers as an addition/deletion.
     */
    private void computeModuleSemanticDiffs(Module originalModule, Module modifiedModule) {

        this.currentModuleFilePaths.clear();
        Map<String, Document> originalDocumentMap = collectDocumentMap(originalModule);
        Map<String, Document> modifiedDocumentMap = collectDocumentMap(modifiedModule);

        STNodeRefMap originalNodeRefMap = new STNodeRefMap();
        STNodeRefMap modifiedNodeRefMap = new STNodeRefMap();

        NodeRefExtractor originalNodeRefExtractor = new NodeRefExtractor(originalNodeRefMap);
        NodeRefExtractor modifiedNodeRefExtractor = new NodeRefExtractor(modifiedNodeRefMap);

        for (Map.Entry<String, Document> entry : originalDocumentMap.entrySet()) {
            String docName = entry.getKey();
            if (!modifiedDocumentMap.containsKey(docName)) {
                // Document removed in modified project
                entry.getValue().syntaxTree().rootNode().accept(originalNodeRefExtractor);
                continue;
            }
            Document originalDoc = entry.getValue();
            Document modifiedDoc = modifiedDocumentMap.get(docName);
            modifiedDocumentMap.remove(docName);
            if (originalDoc.syntaxTree().rootNode().toSourceCode().equals(
                    modifiedDoc.syntaxTree().rootNode().toSourceCode())) {
                continue;
            }

            originalDoc.syntaxTree().rootNode().accept(originalNodeRefExtractor);
            modifiedDoc.syntaxTree().rootNode().accept(modifiedNodeRefExtractor);
        }

        // Handle newly added documents in modified project
        for (Map.Entry<String, Document> entry : modifiedDocumentMap.entrySet()) {
            Document modifiedDoc = entry.getValue();
            modifiedDoc.syntaxTree().rootNode().accept(modifiedNodeRefExtractor);
        }

        // Listeners and module variables (connections) shape the design diagram; the rest don't.
        computeSourceDiffs(originalNodeRefMap.getListenerNodeMap(), modifiedNodeRefMap.getListenerNodeMap(),
                NodeKind.LISTENER, true);
        computeServiceDiffs(originalNodeRefMap.getServiceNodeMap(), modifiedNodeRefMap.getServiceNodeMap());
        computeFunctionDiffs(originalNodeRefMap.getFunctionNodeMap(), modifiedNodeRefMap.getFunctionNodeMap());
        computeTypeDefDiffs(originalNodeRefMap.getTypeDefNodeMap(), modifiedNodeRefMap.getTypeDefNodeMap());
        computeSourceDiffs(originalNodeRefMap.getModuleVarNodeMap(), modifiedNodeRefMap.getModuleVarNodeMap(),
                NodeKind.MODULE_VARIABLE, true);
        computeSourceDiffs(originalNodeRefMap.getConstantNodeMap(), modifiedNodeRefMap.getConstantNodeMap(),
                NodeKind.CONSTANT, false);
        computeSourceDiffs(originalNodeRefMap.getEnumNodeMap(), modifiedNodeRefMap.getEnumNodeMap(),
                NodeKind.ENUM_DECLARATION, false);
        computeClassDiffs(originalNodeRefMap.getClassNodeMap(), modifiedNodeRefMap.getClassNodeMap());
        computeImportDiffs(originalNodeRefMap.getImportNodeMap(), modifiedNodeRefMap.getImportNodeMap());
    }

    /**
     * Computes import differences by key alone. An import's map key (org/module plus alias)
     * already encodes everything semantic about the declaration, so two imports with the same
     * key can only differ in surrounding trivia — e.g. a file-header comment that re-attached
     * to a different import when one was inserted above it. Comparing source text here (as
     * {@link #computeSourceDiffs} does) flagged such untouched imports as "modified", showing
     * reviewers a comment shuffle. Only genuine additions and deletions are reported, and
     * their displayed source is the canonical {@code import <key>;} form rather than
     * {@code toSourceCode()}, which would drag any attached leading comment into the view.
     */
    private void computeImportDiffs(Map<String, ImportDeclarationNode> originalImportMap,
                                    Map<String, ImportDeclarationNode> modifiedImportMap) {

        for (Map.Entry<String, ImportDeclarationNode> entry : originalImportMap.entrySet()) {
            String name = entry.getKey();
            if (modifiedImportMap.containsKey(name)) {
                modifiedImportMap.remove(name);
                continue;
            }
            addDeletionDiff(NodeKind.IMPORT_DECLARATION, entry.getValue().lineRange(),
                    buildSourceMetadata(name, canonicalImportSource(name), null));
        }

        for (Map.Entry<String, ImportDeclarationNode> entry : modifiedImportMap.entrySet()) {
            addAdditionDiff(NodeKind.IMPORT_DECLARATION, entry.getValue().lineRange(),
                    buildSourceMetadata(entry.getKey(), null, canonicalImportSource(entry.getKey())));
        }
    }

    private static String canonicalImportSource(String importKey) {
        return "import " + importKey + ";";
    }

    /**
     * Computes diffs for a construct kind whose changes are reviewed as source text:
     * name-keyed nodes compared by their trivia-free source ({@link #triviaFreeSource}, so a
     * comment that re-attaches to an untouched declaration never reports it as modified),
     * producing addition/deletion/modification entries carrying the raw source in the metadata.
     *
     * @param originalMap   original map of construct names to their declaration nodes
     * @param modifiedMap   modified map of construct names to their declaration nodes
     * @param kind          the NodeKind reported on the diffs
     * @param affectsDesign whether a change to this kind reshapes the design diagram
     *                      (listeners and module vars/connections do)
     */
    private <T extends Node> void computeSourceDiffs(Map<String, T> originalMap, Map<String, T> modifiedMap,
                                                     NodeKind kind, boolean affectsDesign) {

        for (Map.Entry<String, T> entry : originalMap.entrySet()) {
            String name = entry.getKey();
            T originalNode = entry.getValue();
            if (!modifiedMap.containsKey(name)) {
                loadDesignDiagrams |= affectsDesign;
                addDeletionDiff(kind, originalNode.lineRange(),
                        buildSourceMetadata(name, originalNode.toSourceCode(), null));
                continue;
            }
            T modifiedNode = modifiedMap.remove(name);
            if (!triviaFreeSource(originalNode).equals(triviaFreeSource(modifiedNode))) {
                loadDesignDiagrams |= affectsDesign;
                addModificationDiff(kind, modifiedNode.lineRange(), originalNode.lineRange(),
                        buildSourceMetadata(name, originalNode.toSourceCode(), modifiedNode.toSourceCode()));
            }
        }

        for (Map.Entry<String, T> entry : modifiedMap.entrySet()) {
            loadDesignDiagrams |= affectsDesign;
            addAdditionDiff(kind, entry.getValue().lineRange(),
                    buildSourceMetadata(entry.getKey(), null, entry.getValue().toSourceCode()));
        }
    }

    /**
     * Computes class-definition differences. Method changes are reported individually as
     * OBJECT_FUNCTION diffs (they have flow representations); changes to the remaining class
     * members (fields, init expressions) are reported as a single CLASS_DEFINITION diff.
     */
    private void computeClassDiffs(Map<String, ClassDefinitionNode> originalClassMap,
                                   Map<String, ClassDefinitionNode> modifiedClassMap) {

        for (Map.Entry<String, ClassDefinitionNode> entry : originalClassMap.entrySet()) {
            String className = entry.getKey();
            ClassDefinitionNode originalClass = entry.getValue();
            if (!modifiedClassMap.containsKey(className)) {
                addDeletionDiff(NodeKind.CLASS_DEFINITION, originalClass.lineRange(),
                        buildSourceMetadata(className, originalClass.toSourceCode(), null));
                continue;
            }
            ClassDefinitionNode modifiedClass = modifiedClassMap.remove(className);
            String originalClassSource = originalClass.toSourceCode();
            String modifiedClassSource = modifiedClass.toSourceCode();
            if (originalClassSource.equals(modifiedClassSource)) {
                continue;
            }

            Map<String, FunctionDefinitionNode> originalMethods = extractClassMethods(originalClass);
            Map<String, FunctionDefinitionNode> modifiedMethods = extractClassMethods(modifiedClass);
            for (Map.Entry<String, FunctionDefinitionNode> methodEntry : originalMethods.entrySet()) {
                String methodKey = methodEntry.getKey();
                FunctionDefinitionNode originalMethod = methodEntry.getValue();
                Map<String, String> metadata = buildFunctionMetadata(className + "." + methodKey);
                if (!modifiedMethods.containsKey(methodKey)) {
                    addDeletionDiff(NodeKind.OBJECT_FUNCTION, originalMethod.lineRange(), metadata);
                    continue;
                }
                compareFunctionBodies(originalMethod, modifiedMethods.remove(methodKey),
                        NodeKind.OBJECT_FUNCTION, metadata);
            }
            for (Map.Entry<String, FunctionDefinitionNode> methodEntry : modifiedMethods.entrySet()) {
                addAdditionDiff(NodeKind.OBJECT_FUNCTION, methodEntry.getValue().lineRange(),
                        buildFunctionMetadata(className + "." + methodEntry.getKey()));
            }

            if (!classHeaderAndMembersSource(originalClass).equals(classHeaderAndMembersSource(modifiedClass))) {
                addModificationDiff(NodeKind.CLASS_DEFINITION, modifiedClass.lineRange(),
                        originalClass.lineRange(),
                        buildSourceMetadata(className, originalClassSource, modifiedClassSource));
            }
        }

        for (Map.Entry<String, ClassDefinitionNode> entry : modifiedClassMap.entrySet()) {
            addAdditionDiff(NodeKind.CLASS_DEFINITION, entry.getValue().lineRange(),
                    buildSourceMetadata(entry.getKey(), null, entry.getValue().toSourceCode()));
        }
    }

    private static Map<String, FunctionDefinitionNode> extractClassMethods(ClassDefinitionNode classNode) {
        Map<String, FunctionDefinitionNode> methods = new LinkedHashMap<>();
        classNode.members().forEach(member -> {
            if (member instanceof FunctionDefinitionNode method) {
                String resourcePath = method.relativeResourcePath().stream()
                        .map(node -> node.toSourceCode().trim())
                        .collect(Collectors.joining(""));
                methods.put(method.functionName().text().trim()
                        + (resourcePath.isEmpty() ? "" : "#" + resourcePath), method);
            }
        });
        return methods;
    }

    private static String nonMethodMembersSource(ClassDefinitionNode classNode) {
        return classNode.members().stream()
                .filter(member -> !(member instanceof FunctionDefinitionNode))
                .map(SemanticDiffComputer::triviaFreeSource)
                .collect(Collectors.joining("\n"));
    }

    /**
     * Signature used to decide whether a class needs a {@code CLASS_DEFINITION} diff once its methods
     * have been diffed separately. It combines the class header — metadata, visibility, class-type
     * qualifiers, the {@code class} keyword and the name — with the non-method members, so a
     * header-only change (for example adding {@code isolated} or an annotation) is not lost when the
     * members are unchanged. Built from token text only ({@link #triviaFreeSource}), so a comment or
     * formatting shuffle around the class or its fields never registers as a modification — the same
     * trivia-only handling as {@link #computeImportDiffs}. Annotations and markdown documentation are
     * syntax nodes, not trivia, so genuine changes to them still produce a diff.
     */
    private static String classHeaderAndMembersSource(ClassDefinitionNode classNode) {
        StringBuilder header = new StringBuilder();
        classNode.metadata().ifPresent(metadata -> header.append(triviaFreeSource(metadata)).append(' '));
        classNode.visibilityQualifier().ifPresent(qualifier -> header.append(qualifier.text()).append(' '));
        classNode.classTypeQualifiers().forEach(qualifier -> header.append(qualifier.text()).append(' '));
        header.append(classNode.classKeyword().text()).append(' ');
        header.append(classNode.className().text());
        return header + "\n" + nonMethodMembersSource(classNode);
    }

    /**
     * Source text of a node with all trivia removed: token texts joined by single spaces, so
     * comments and whitespace never contribute. Only for comparison keys — the joined text is
     * not valid, displayable source.
     */
    private static String triviaFreeSource(Node node) {
        StringBuilder sb = new StringBuilder();
        appendTriviaFreeSource(node, sb);
        return sb.toString();
    }

    private static void appendTriviaFreeSource(Node node, StringBuilder sb) {
        if (node instanceof Token token) {
            if (!sb.isEmpty()) {
                sb.append(' ');
            }
            sb.append(token.text());
        } else if (node instanceof NonTerminalNode nonTerminal) {
            for (Node child : nonTerminal.children()) {
                appendTriviaFreeSource(child, sb);
            }
        }
    }

    /**
     * Computes type definition differences between original and modified projects to identify
     * changes and update semantic diffs accordingly.
     *
     * @param originalTypeDefMap original map of type definition names to their definition nodes
     * @param modifiedTypeDefMap modified map of type definition names to their definition nodes
     */
    private void computeTypeDefDiffs(Map<String, TypeDefinitionNode> originalTypeDefMap,
                                     Map<String, TypeDefinitionNode> modifiedTypeDefMap) {

        for (Map.Entry<String, TypeDefinitionNode> entry : originalTypeDefMap.entrySet()) {
            String typeDefName = entry.getKey();
            TypeDefinitionNode originalTypeDef = entry.getValue();
            if (!modifiedTypeDefMap.containsKey(typeDefName)) {
                addDeletionDiff(NodeKind.TYPE_DEFINITION, originalTypeDef.lineRange(),
                        buildTypeMetadata(typeDefName));
                continue;
            }
            TypeDefinitionNode modifiedTypeDef = modifiedTypeDefMap.remove(typeDefName);
            if (originalTypeDef.toSourceCode().equals(modifiedTypeDef.toSourceCode())) {
                continue;
            }

            // TODO: Need to use the semantic types and compare the types
            addModificationDiff(NodeKind.TYPE_DEFINITION, modifiedTypeDef.lineRange(),
                    originalTypeDef.lineRange(), buildTypeMetadata(typeDefName));
        }

        // Handle newly added type definitions in modified project
        for (Map.Entry<String, TypeDefinitionNode> entry : modifiedTypeDefMap.entrySet()) {
            TypeDefinitionNode typeDefinitionNode = entry.getValue();
            LineRange lineRange = typeDefinitionNode.lineRange();
            SemanticDiff diff = new SemanticDiff(ChangeType.ADDITION, NodeKind.TYPE_DEFINITION,
                    resolveUri(lineRange.fileName()), lineRange, buildTypeMetadata(entry.getKey()));
            this.semanticDiffs.add(diff);
        }
    }

    /**
     * Computes function differences between original and modified projects to identify
     * changes and update semantic diffs accordingly.
     *
     * @param originalFunctionMap original map of function names to their definition nodes
     * @param modifiedFunctionMap modified map of function names to their definition nodes
     */
    private void computeFunctionDiffs(Map<String, FunctionDefinitionNode> originalFunctionMap,
                                      Map<String, FunctionDefinitionNode> modifiedFunctionMap) {

        for (Map.Entry<String, FunctionDefinitionNode> entry : originalFunctionMap.entrySet()) {
            String functionName = entry.getKey();
            if (!modifiedFunctionMap.containsKey(functionName)) {
                FunctionDefinitionNode originalFunction = entry.getValue();
                LineRange lineRange = originalFunction.lineRange();
                Map<String, String> metadata = buildFunctionMetadata(functionName);
                SemanticDiff diff = new SemanticDiff(ChangeType.DELETION, NodeKind.MODULE_FUNCTION,
                        resolveUri(lineRange.fileName()), lineRange, metadata);
                this.semanticDiffs.add(diff);
                continue;
            }
            FunctionDefinitionNode modifiedFunction = modifiedFunctionMap.remove(functionName);
            Map<String, String> metadata = buildFunctionMetadata(functionName);
            compareFunctionBodies(entry.getValue(), modifiedFunction, NodeKind.MODULE_FUNCTION, metadata);
        }

        // Handle newly added functions in modified project
        for (Map.Entry<String, FunctionDefinitionNode> entry : modifiedFunctionMap.entrySet()) {
            FunctionDefinitionNode functionDefinitionNode = entry.getValue();
            LineRange lineRange = functionDefinitionNode.lineRange();
            Map<String, String> metadata = buildFunctionMetadata(entry.getKey());
            SemanticDiff diff = new SemanticDiff(ChangeType.ADDITION, NodeKind.MODULE_FUNCTION,
                    resolveUri(lineRange.fileName()), lineRange, metadata);
            this.semanticDiffs.add(diff);
        }
    }

    /**
     * Compares the bodies of two functions to identify modifications and update
     * semantic diffs accordingly.
     *
     * @param originalFunction original function node
     * @param modifiedFunction modified function node
     * @param kind             the kind of node being compared
     * @param metadata         metadata about the function being compared
     */
    private void compareFunctionBodies(FunctionDefinitionNode originalFunction,
                                       FunctionDefinitionNode modifiedFunction,
                                       NodeKind kind, Map<String, String> metadata) {

        if (!functionHeaderKey(originalFunction).equals(functionHeaderKey(modifiedFunction))) {
            addModificationDiff(kind, modifiedFunction.lineRange(), originalFunction.lineRange(), metadata);
            return;
        }

        FunctionBodyNode originalFunctionBody = originalFunction.functionBody();
        FunctionBodyNode modifiedFunctionBody = modifiedFunction.functionBody();
        compareFunctionBodies(originalFunction, modifiedFunction, originalFunctionBody, modifiedFunctionBody,
                kind, metadata);
    }

    /**
     * Builds a trivia-insensitive key for the complete function header. Comparing only function
     * bodies made parameter, return type, qualifier and resource-path changes disappear from the
     * review entirely.
     */
    private String functionHeaderKey(FunctionDefinitionNode function) {
        StringBuilder header = new StringBuilder();
        function.qualifierList().forEach(node -> header.append(node.toSourceCode()));
        header.append(function.functionKeyword().toSourceCode());
        header.append(function.functionName().toSourceCode());
        function.relativeResourcePath().forEach(node -> header.append(node.toSourceCode()));
        header.append(function.functionSignature().toSourceCode());
        return normalizeTriviaOutsideLiterals(header.toString());
    }

    private String normalizeTriviaOutsideLiterals(String source) {
        StringBuilder normalized = new StringBuilder();
        char delimiter = 0;
        boolean escaped = false;
        for (int i = 0; i < source.length(); i++) {
            char current = source.charAt(i);
            if (delimiter != 0) {
                normalized.append(current);
                if (escaped) {
                    escaped = false;
                } else if (current == '\\') {
                    escaped = true;
                } else if (current == delimiter) {
                    delimiter = 0;
                }
                continue;
            }
            if (current == '"' || current == '`') {
                delimiter = current;
                normalized.append(current);
            } else if (!Character.isWhitespace(current)) {
                normalized.append(current);
            }
        }
        return normalized.toString();
    }

    /**
     * Compares the bodies of two functions to identify modifications and update
     * semantic diffs accordingly.
     *
     * @param originalFunction     original function node
     * @param modifiedFunction     modified function node
     * @param originalFunctionBody original function body node
     * @param modifiedFunctionBody modified function body node
     * @param kind                 the kind of node being compared
     * @param metadata             metadata about the function being compared
     */
    private void compareFunctionBodies(NonTerminalNode originalFunction,
                                       NonTerminalNode modifiedFunction,
                                       FunctionBodyNode originalFunctionBody,
                                       FunctionBodyNode modifiedFunctionBody,
                                       NodeKind kind, Map<String, String> metadata) {

        if (originalFunctionBody.toSourceCode().equals(modifiedFunctionBody.toSourceCode())) {
            return;
        }

        if (originalFunctionBody instanceof ExpressionFunctionBodyNode &&
                modifiedFunctionBody instanceof ExpressionFunctionBodyNode) {
            addModificationDiff(NodeKind.DATA_MAPPING_FUNCTION, modifiedFunction.lineRange(),
                    originalFunction.lineRange(), metadata);
            return;
        }

        if (!originalFunctionBody.getClass().equals(modifiedFunctionBody.getClass())) {
            addModificationDiff(kind, modifiedFunction.lineRange(), originalFunction.lineRange(), metadata);
            return;
        }

        if (!(originalFunctionBody instanceof FunctionBodyBlockNode originalBodyNode)
                || !(modifiedFunctionBody instanceof FunctionBodyBlockNode modifiedBodyNode)) {
            // Same body class but not a statement block (e.g. both `external` bodies): the
            // sources already differ per the check above, so report the modification instead
            // of falling through silently.
            addModificationDiff(kind, modifiedFunction.lineRange(), originalFunction.lineRange(), metadata);
            return;
        }

        if (originalBodyNode.statements().size() != modifiedBodyNode.statements().size()) {
            addModificationDiff(kind, modifiedFunction.lineRange(), originalFunction.lineRange(), metadata);
            return;
        }

        for (int i = 0; i < originalBodyNode.statements().size(); i++) {
            StatementNode originalStmtNode = originalBodyNode.statements().get(i);
            StatementNode modifiedStmtNode = modifiedBodyNode.statements().get(i);

            if (originalStmtNode.toSourceCode().equals(modifiedStmtNode.toSourceCode())) {
                continue;
            }

            List<Node> allOriginalStmtNodes = new ArrayList<>();
            extractStatementNodes(originalStmtNode, allOriginalStmtNodes);
            List<Node> allModifiedStmtNodes = new ArrayList<>();
            extractStatementNodes(modifiedStmtNode, allModifiedStmtNodes);

            if (allOriginalStmtNodes.size() != allModifiedStmtNodes.size()) {
                addModificationDiff(kind, modifiedFunction.lineRange(), originalFunction.lineRange(), metadata);
                return;
            }

            for (int j = 0; j < allOriginalStmtNodes.size(); j++) {
                Node originalNode = allOriginalStmtNodes.get(j);
                Node modifiedNode = allModifiedStmtNodes.get(j);
                // need to change whether both nodes have the same type
                if (!originalNode.getClass().equals(modifiedNode.getClass())) {
                    addModificationDiff(kind, modifiedNode.lineRange(), originalNode.lineRange(), metadata);
                    return;
                }
                if (!originalNode.toSourceCode().trim().equals(modifiedNode.toSourceCode().trim())) {
                    addModificationDiff(kind, modifiedNode.lineRange(), originalNode.lineRange(), metadata);
                    return;
                }
            }
        }
    }

    /**
     * Adds a modification while retaining its original location.
     * The review UI needs both locations because file:// resolves the original tree while ai:// resolves
     * the modified tree.
     */
    private void addModificationDiff(NodeKind kind, LineRange modifiedLineRange, LineRange originalLineRange,
                                     Map<String, String> metadata) {
        SemanticDiff diff = new SemanticDiff(ChangeType.MODIFICATION, kind,
                resolveUri(modifiedLineRange.fileName()), modifiedLineRange, originalLineRange, metadata);
        this.semanticDiffs.add(diff);
    }

    private void addAdditionDiff(NodeKind kind, LineRange lineRange, Map<String, String> metadata) {
        this.semanticDiffs.add(new SemanticDiff(ChangeType.ADDITION, kind,
                resolveUri(lineRange.fileName()), lineRange, metadata));
    }

    private void addDeletionDiff(NodeKind kind, LineRange originalLineRange, Map<String, String> metadata) {
        this.semanticDiffs.add(new SemanticDiff(ChangeType.DELETION, kind,
                resolveUri(originalLineRange.fileName()), originalLineRange, metadata));
    }

    /**
     * Metadata for construct kinds the review UI renders as source text rather than a
     * diagram (constants, module vars, listeners, imports, enums, classes): carries the
     * construct's before/after source so the UI needs no extra content lookup. Either
     * side may be null (pure addition/deletion).
     */
    private static Map<String, String> buildSourceMetadata(String name, String oldSource, String newSource) {
        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put("name", name);
        if (oldSource != null) {
            metadata.put("oldSource", oldSource.strip());
        }
        if (newSource != null) {
            metadata.put("newSource", newSource.strip());
        }
        return metadata;
    }

    private void extractStatementNodes(Node statementNode, List<Node> nodes) {

        nodes.add(statementNode);
        if (statementNode instanceof BlockStatementNode blockStatementNode) {
            NodeList<StatementNode> statements = blockStatementNode.statements();
            for (StatementNode stmt : statements) {
                extractStatementNodes(stmt, nodes);
            }
        } else if (statementNode instanceof DoStatementNode doStatementNode) {
            BlockStatementNode doBlock = doStatementNode.blockStatement();
            NodeList<StatementNode> statements = doBlock.statements();
            for (StatementNode stmt : statements) {
                extractStatementNodes(stmt, nodes);
            }
            Optional<OnFailClauseNode> onFailClauseNode = doStatementNode.onFailClause();
            if (onFailClauseNode.isPresent()) {
                BlockStatementNode onFailBlock = onFailClauseNode.get().blockStatement();
                NodeList<StatementNode> onFailStatements = onFailBlock.statements();
                for (StatementNode stmt : onFailStatements) {
                    extractStatementNodes(stmt, nodes);
                }
            }
        } else if (statementNode instanceof ForkStatementNode forkStatementNode) {
            NodeList<NamedWorkerDeclarationNode> namedWorkers = forkStatementNode.namedWorkerDeclarations();
            for (NamedWorkerDeclarationNode worker : namedWorkers) {
                BlockStatementNode workerBlock = worker.workerBody();
                NodeList<StatementNode> workerStatements = workerBlock.statements();
                for (StatementNode stmt : workerStatements) {
                    extractStatementNodes(stmt, nodes);
                }
            }
        } else if (statementNode instanceof ForEachStatementNode forEachStatementNode) {
            BlockStatementNode forEachBlock = forEachStatementNode.blockStatement();
            NodeList<StatementNode> forEachStatements = forEachBlock.statements();
            for (StatementNode stmt : forEachStatements) {
                extractStatementNodes(stmt, nodes);
            }
        } else if (statementNode instanceof IfElseStatementNode ifElseStatementNode) {
            ifElseStatementNode.ifBody().statements().forEach(stmt -> extractStatementNodes(stmt, nodes));
            ifElseStatementNode.elseBody().ifPresent(elseBody -> extractStatementNodes(elseBody, nodes));
        } else if (statementNode instanceof LockStatementNode lockStatementNode) {
            BlockStatementNode lockBlock = lockStatementNode.blockStatement();
            NodeList<StatementNode> lockStatements = lockBlock.statements();
            for (StatementNode stmt : lockStatements) {
                extractStatementNodes(stmt, nodes);
            }
        } else if (statementNode instanceof WhileStatementNode whileStatementNode) {
            BlockStatementNode whileBlock = whileStatementNode.whileBody();
            NodeList<StatementNode> whileStatements = whileBlock.statements();
            for (StatementNode stmt : whileStatements) {
                extractStatementNodes(stmt, nodes);
            }
            Optional<OnFailClauseNode> onFailClauseNode = whileStatementNode.onFailClause();
            if (onFailClauseNode.isPresent()) {
                BlockStatementNode onFailBlock = onFailClauseNode.get().blockStatement();
                NodeList<StatementNode> onFailStatements = onFailBlock.statements();
                for (StatementNode stmt : onFailStatements) {
                    extractStatementNodes(stmt, nodes);
                }
            }
        } else if (statementNode instanceof MatchStatementNode matchNode) {
            NodeList<MatchClauseNode> matchClauses = matchNode.matchClauses();
            for (MatchClauseNode clause : matchClauses) {
                BlockStatementNode clauseBlock = clause.blockStatement();
                NodeList<StatementNode> clauseStatements = clauseBlock.statements();
                for (StatementNode stmt : clauseStatements) {
                    extractStatementNodes(stmt, nodes);
                }
            }
        } else if (statementNode instanceof TransactionStatementNode transactionNode) {
            BlockStatementNode transactionBlock = transactionNode.blockStatement();
            NodeList<StatementNode> transactionStatements = transactionBlock.statements();
            for (StatementNode stmt : transactionStatements) {
                extractStatementNodes(stmt, nodes);
            }
        }
    }

    /**
     * Computes service differences between original and modified projects to identify
     * changes and update semantic diffs accordingly.
     *
     * <p>This method performs a detailed comparison of service declarations between the
     * original and modified projects. It identifies added, removed, and modified services,
     * and updates the semantic diffs list accordingly.
     * <p>The comparison process includes:
     * <ul>
     *     <li>Identifying services present in both projects and comparing their members</li>
     *     <li>Detecting newly added services in the modified project</li>
     *     <li>Setting the {@code loadDesignDiagrams} flag when structural changes are detected</li>
     * </ul>
     *
     * <p>Note: This method only detects additions and modifications. Service deletions
     * are not explicitly tracked in the current implementation.
     *
     * @param originalServiceMap original map of service names to their declaration nodes
     * @param modifiedServiceMap modified map of service names to their declaration nodes
     */
    private void computeServiceDiffs(Map<String, ServiceDeclarationNode> originalServiceMap,
                                     Map<String, ServiceDeclarationNode> modifiedServiceMap) {

        List<String> foundServices = new ArrayList<>();
        for (Map.Entry<String, ServiceDeclarationNode> entry : originalServiceMap.entrySet()) {
            String serviceName = entry.getKey();
            if (modifiedServiceMap.containsKey(serviceName)) {
                ServiceDeclarationNode originalService = entry.getValue();
                ServiceDeclarationNode modifiedService = modifiedServiceMap.get(serviceName);
                foundServices.add(serviceName);
                if (!originalService.toSourceCode().equals(modifiedService.toSourceCode())) {
                    analyzeServiceModifications(originalService, modifiedService);
                }
            }
        }
        foundServices.forEach(modifiedServiceMap::remove);
        foundServices.forEach(originalServiceMap::remove);

        // Split keys by # and check if there is a match between first parts
        Map<String, String> originalServiceBasePaths = extractServiceBasePaths(originalServiceMap);
        Map<String, String> modifiedServiceBasePaths = extractServiceBasePaths(modifiedServiceMap);

        // Check for matches and handle differences
        // Services matching by base path but not by full key means the listener
        // expression changed (e.g., inline listener port change), which is a design diagram concern
        for (Map.Entry<String, String> entry : originalServiceBasePaths.entrySet()) {
            String basePath = entry.getKey();
            if (modifiedServiceBasePaths.containsKey(basePath)) {
                String originalServiceName = entry.getValue();
                String modifiedServiceName = modifiedServiceBasePaths.get(basePath);
                foundServices.add(originalServiceName);
                foundServices.add(modifiedServiceName);
                ServiceDeclarationNode originalService = originalServiceMap.get(originalServiceName);
                ServiceDeclarationNode modifiedService = modifiedServiceMap.get(modifiedServiceName);
                String originalExpressions = originalService.expressions().stream()
                        .map(Node::toSourceCode).collect(Collectors.joining(","));
                String modifiedExpressions = modifiedService.expressions().stream()
                        .map(Node::toSourceCode).collect(Collectors.joining(","));
                if (!originalExpressions.equals(modifiedExpressions)) {
                    loadDesignDiagrams = true;
                }
                analyzeServiceModifications(originalService, modifiedService);
            }
        }
        foundServices.forEach(modifiedServiceMap::remove);
        foundServices.forEach(originalServiceMap::remove);

        // Handle removed services
        if (!originalServiceMap.isEmpty()) {
            loadDesignDiagrams = true;
            originalServiceMap.forEach((serviceName, originalService) -> {
                ServiceMemberMap originalServiceMemberMap = extractServiceMembers(originalService);
                String servicePath = getServicePath(originalService);

                originalServiceMemberMap.getObjectMethods().forEach((key, originalMethod) -> {
                    LineRange lineRange = originalMethod.lineRange();
                    Map<String, String> metadata = buildResourceFunctionMetadata(originalMethod, servicePath);
                    SemanticDiff diff = new SemanticDiff(ChangeType.DELETION, NodeKind.OBJECT_FUNCTION,
                            resolveUri(lineRange.fileName()), lineRange, metadata);
                    this.semanticDiffs.add(diff);
                });
            });
        }

        if (modifiedServiceMap.isEmpty()) {
            return;
        }

        loadDesignDiagrams = true;
        modifiedServiceMap.forEach((serviceName, modifiedService) -> {
            ServiceMemberMap modifiedServiceMemberMap = new ServiceMemberMap();
            ServiceMethodExtractor modifiedServiceMethodExtractor =
                    new ServiceMethodExtractor(modifiedServiceMemberMap);
            modifiedService.accept(modifiedServiceMethodExtractor);
            String servicePath = getServicePath(modifiedService);

            modifiedServiceMemberMap.getObjectMethods().forEach((key, modifiedMethod) -> {
                LineRange lineRange = modifiedMethod.lineRange();
                Map<String, String> metadata = buildResourceFunctionMetadata(modifiedMethod, servicePath);
                SemanticDiff diff = new SemanticDiff(ChangeType.ADDITION, NodeKind.OBJECT_FUNCTION,
                        resolveUri(lineRange.fileName()), lineRange, metadata);
                this.semanticDiffs.add(diff);
            });
        });

    }

    /**
     * Analyzes modifications between two service declarations to identify changes
     * and update semantic diffs accordingly.
     *
     * <p>This method performs a detailed comparison of service members between the original
     * and modified service declarations. It extracts service members (remote methods,
     * resource methods, and object methods) from both services using the ServiceMethodExtractor
     * and compares them to detect structural and behavioral changes.
     *
     * <p>The comparison process includes:
     * <ul>
     * <li>Extracting all service members from both original and modified services</li>
     * <li>Comparing function bodies of existing members to detect modifications</li>
     * <li>Identifying newly added members in the modified service</li>
     * <li>Setting the {@code loadDesignDiagrams} flag when structural changes are detected</li>
     * </ul>
     *
     * <p>Note: This method only detects additions and modifications. Service member
     * deletions are not explicitly tracked in the current implementation.
     *
     * @param originalService the service declaration from the original project
     * @param modifiedService the service declaration from the modified project
     */
    private void analyzeServiceModifications(ServiceDeclarationNode originalService,
                                             ServiceDeclarationNode modifiedService) {

        ServiceMemberMap original = extractServiceMembers(originalService);
        ServiceMemberMap modified = extractServiceMembers(modifiedService);
        String servicePath = getServicePath(modifiedService);
        analyzeMethodChanges(original.getObjectMethods(), modified.getObjectMethods(), servicePath);
    }

    /**
     * Analyzes method changes between original and modified method maps.
     *
     * @param originalMethods Map of original method names to their definition nodes
     * @param modifiedMethods Map of modified method names to their definition nodes
     * @param servicePath     the base path of the service containing these methods
     */
    private void analyzeMethodChanges(Map<String, FunctionDefinitionNode> originalMethods,
                                      Map<String, FunctionDefinitionNode> modifiedMethods,
                                      String servicePath) {

        originalMethods.forEach((key, originalMethod) -> {
            if (!modifiedMethods.containsKey(key)) {
                LineRange lineRange = originalMethod.lineRange();
                Map<String, String> metadata = buildResourceFunctionMetadata(originalMethod, servicePath);
                SemanticDiff diff = new SemanticDiff(ChangeType.DELETION, NodeKind.OBJECT_FUNCTION,
                        resolveUri(lineRange.fileName()), lineRange, metadata);
                this.semanticDiffs.add(diff);
                loadDesignDiagrams = true;
            }
        });
        modifiedMethods.forEach((key, modifiedMethod) -> {
            Map<String, String> metadata = buildResourceFunctionMetadata(modifiedMethod, servicePath);
            if (originalMethods.containsKey(key)) {
                FunctionDefinitionNode originalMethod = originalMethods.get(key);
                compareFunctionBodies(originalMethod, modifiedMethod, NodeKind.OBJECT_FUNCTION, metadata);
            } else {
                // New method added
                LineRange lineRange = modifiedMethod.lineRange();
                SemanticDiff diff = new SemanticDiff(ChangeType.ADDITION, NodeKind.OBJECT_FUNCTION,
                        resolveUri(lineRange.fileName()), lineRange, metadata);
                this.semanticDiffs.add(diff);
                loadDesignDiagrams = true;
            }
        });
    }

    /**
     * Extracts service members from a given service declaration node.
     *
     * @param service the service declaration node to extract members from
     * @return a ServiceMemberMap containing the extracted service members
     */
    private ServiceMemberMap extractServiceMembers(ServiceDeclarationNode service) {

        ServiceMemberMap serviceMemberMap = new ServiceMemberMap();
        ServiceMethodExtractor extractor = new ServiceMethodExtractor(serviceMemberMap);
        service.accept(extractor);
        return serviceMemberMap;
    }

    /**
     * Collects a map of document names to Document objects from the given module, covering
     * both source and test documents so edits confined to tests still produce diffs. Also
     * records each document's on-disk path for URI resolution.
     *
     * @param module the module to collect documents from; null yields an empty map (module
     *               absent on this side of the diff)
     * @return a map of document names to Document objects
     */
    private Map<String, Document> collectDocumentMap(Module module) {

        Map<String, Document> documentMap = new HashMap<>();
        if (module == null) {
            return documentMap;
        }
        module.documentIds().stream()
                .map(module::document)
                .filter(Objects::nonNull)
                .forEach(document -> {
                    documentMap.put(document.name(), document);
                    registerDocumentPath(module, document);
                });
        module.testDocumentIds().stream()
                .map(module::document)
                .filter(Objects::nonNull)
                .forEach(document -> {
                    documentMap.put(document.name(), document);
                    registerDocumentPath(module, document);
                });
        return documentMap;
    }

    private void registerDocumentPath(Module module, Document document) {
        Optional<Path> documentPath = module.project().documentPath(document.documentId());
        // LineRange.fileName() reflects the syntax tree's file path (normally the document
        // name); register both so either form resolves. Both sides of the diff share the
        // same disk path, so a single map serves original and modified lookups.
        documentPath.ifPresent(path -> {
            this.currentModuleFilePaths.putIfAbsent(document.name(), path);
            this.currentModuleFilePaths.putIfAbsent(document.syntaxTree().filePath(), path);
        });
    }

    /**
     * Extracts base paths from service names in the given service map.
     *
     * @param serviceMap map of service names to their declaration nodes
     * @return a map of service base paths to full service names
     */
    private Map<String, String> extractServiceBasePaths(Map<String, ServiceDeclarationNode> serviceMap) {

        Map<String, String> serviceBasePaths = new HashMap<>();
        for (Map.Entry<String, ServiceDeclarationNode> entry : serviceMap.entrySet()) {
            String serviceName = entry.getKey();
            String basePath = serviceName.split("#")[0];
            // Two services may legally share a base path (different listeners). Keep the
            // first instead of silently overwriting — the unmatched one then surfaces via
            // the removed/added handling rather than being paired with the wrong service.
            serviceBasePaths.putIfAbsent(basePath, serviceName);
        }
        return serviceBasePaths;
    }

    /**
     * Compares the design models of the original and modified projects to determine
     * if design diagrams need to be reloaded.
     *
     * <p>This method generates design models for both the original and modified projects
     * using the DesignModelGenerator. It then compares the connections and listeners
     * within the design models to detect structural changes. If any differences are found,
     * the {@code loadDesignDiagrams} flag is set to true, indicating that the architecture
     * diagram should be regenerated.
     */
    private void compareUsingDesignDiagrams() {

        DesignModelGenerator original = new DesignModelGenerator(originalProject.currentPackage());
        DesignModelGenerator modified = new DesignModelGenerator(modifiedProject.currentPackage());

        // use future task to generate the design models in parallel
        CompletableFuture<DesignModel> originalFuture = CompletableFuture.supplyAsync(original::generate);
        CompletableFuture<DesignModel> modifiedFuture = CompletableFuture.supplyAsync(modified::generate);

        DesignModel originalDesignModel = originalFuture.join();
        DesignModel modifiedDesignModel = modifiedFuture.join();

        loadDesignDiagrams = compareDesignModels(originalDesignModel, modifiedDesignModel);
    }

    /**
     * Compares two design models to identify differences in connections and listeners.
     *
     * @param original the original design model
     * @param modified the modified design model
     * @return true if differences are found, false otherwise
     */
    private boolean compareDesignModels(DesignModel original, DesignModel modified) {

        if (compareConnections(original.connections(), modified.connections())) {
            return true;
        }

        return compareListeners(original.listeners(), modified.listeners());
    }

    /**
     * Compares two lists of connections to identify differences.
     *
     * @param originalConnections original list of connections
     * @param modifiedConnections modified list of connections
     * @return true if differences are found, false otherwise
     */
    private boolean compareConnections(List<Connection> originalConnections, List<Connection> modifiedConnections) {

        if (originalConnections.size() != modifiedConnections.size()) {
            return true;
        }

        Map<String, List<Connection>> originalConnectionMap = extractConnectionMap(originalConnections);
        Map<String, List<Connection>> modifiedConnectionMap = extractConnectionMap(modifiedConnections);

        for (Map.Entry<String, List<Connection>> entry : originalConnectionMap.entrySet()) {
            String key = entry.getKey();
            if (!modifiedConnectionMap.containsKey(key)) {
                return true;
            }
            List<Connection> originalConnList = entry.getValue();
            List<Connection> modifiedConnList = modifiedConnectionMap.get(key);
            if (originalConnList.size() != modifiedConnList.size()) {
                return true;
            }

            // find the global scope connection
            Connection originalGlobalConn = originalConnList.stream()
                    .filter(c -> c.getScope().equals(Connection.Scope.GLOBAL))
                    .findFirst().orElse(null);
            Connection modifiedGlobalConn = modifiedConnList.stream()
                    .filter(c -> c.getScope().equals(Connection.Scope.GLOBAL))
                    .findFirst().orElse(null);
            if (originalGlobalConn != null && modifiedGlobalConn != null) {
                if (originalGlobalConn.getDependentFunctions().size()
                        != modifiedGlobalConn.getDependentFunctions().size()) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Compares two lists of listeners to identify differences.
     *
     * @param originalListeners original list of listeners
     * @param modifiedListeners modified list of listeners
     * @return true if differences are found, false otherwise
     */
    private boolean compareListeners(List<Listener> originalListeners, List<Listener> modifiedListeners) {

        if (originalListeners.size() != modifiedListeners.size()) {
            return true;
        }

        for (Listener originalListener : originalListeners) {
            for (Listener modifiedListener : modifiedListeners) {
                if (modifiedListener.getSymbol() != null
                        && modifiedListener.getSymbol().equals(originalListener.getSymbol())) {
                    if (modifiedListener.getAttachedServices().size()
                            != originalListener.getAttachedServices().size()) {
                        return true;
                    }
                    break;
                }
            }
        }

        return false;
    }

    /**
     * Extracts a map of connection symbols to their corresponding connection objects.
     *
     * @param connections list of connections
     * @return map of connection symbols to connection objects
     */
    private Map<String, List<Connection>> extractConnectionMap(List<Connection> connections) {

        Map<String, List<Connection>> connectionMap = new HashMap<>();
        for (Connection connection : connections) {
            String key = connection.getSymbol();
            connectionMap.computeIfAbsent(key, k -> new ArrayList<>()).add(connection);
        }
        return connectionMap;
    }

    private static Map<String, String> buildTypeMetadata(String typeName) {

        return Map.of("name", typeName);
    }

    private static Map<String, String> buildFunctionMetadata(String functionName) {

        return Map.of("name", functionName);
    }

    private static Map<String, String> buildResourceFunctionMetadata(FunctionDefinitionNode functionNode,
                                                                     String servicePath) {

        String accessor = functionNode.functionName().text();
        String resourcePath = functionNode.relativeResourcePath().stream()
                .map(node -> node.toSourceCode().trim())
                .collect(Collectors.joining(""));
        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put("accessor", accessor);
        metadata.put("servicePath", servicePath);
        metadata.put("resourcePath", resourcePath);
        return metadata;
    }

    private static String getServicePath(ServiceDeclarationNode service) {

        return service.absoluteResourcePath().stream()
                .map(Node::toString)
                .map(String::trim)
                .collect(Collectors.joining(""));
    }

    private String resolveUri(String fileName) {

        // Module and test documents don't live directly under the project root, so prefer
        // the recorded document path; fall back to root-relative for robustness.
        Path filePath = this.currentModuleFilePaths.getOrDefault(
                fileName, Path.of(rootProjectPath).resolve(fileName));
        return "ai" + filePath.toUri().toString().substring(4);
    }
}
