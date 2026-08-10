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
import io.ballerina.compiler.syntax.tree.DoStatementNode;
import io.ballerina.compiler.syntax.tree.ExpressionFunctionBodyNode;
import io.ballerina.compiler.syntax.tree.ForEachStatementNode;
import io.ballerina.compiler.syntax.tree.ForkStatementNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyBlockNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.IfElseStatementNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.LockStatementNode;
import io.ballerina.compiler.syntax.tree.MatchClauseNode;
import io.ballerina.compiler.syntax.tree.MatchStatementNode;
import io.ballerina.compiler.syntax.tree.ModuleVariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.NamedWorkerDeclarationNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.OnFailClauseNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.StatementNode;
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
import io.ballerina.projects.Project;
import io.ballerina.tools.text.LineRange;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
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
    private boolean loadDesignDiagrams = false;

    public SemanticDiffComputer(Project originalProject,
                                Project modifiedProject) {

        this.originalProject = originalProject;
        this.modifiedProject = modifiedProject;
        this.rootProjectPath = originalProject.sourceRoot().toString();
    }

    public Result computeSemanticDiffs() {

        Map<String, Document> originalDocumentMap = collectDocumentMap(originalProject);
        Map<String, Document> modifiedDocumentMap = collectDocumentMap(modifiedProject);

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

        computeListenerDiffs(originalNodeRefMap.getListenerNodeMap(), modifiedNodeRefMap.getListenerNodeMap());
        computeServiceDiffs(originalNodeRefMap.getServiceNodeMap(), modifiedNodeRefMap.getServiceNodeMap());
        computeFunctionDiffs(originalNodeRefMap.getFunctionNodeMap(), modifiedNodeRefMap.getFunctionNodeMap());
        computeTypeDefDiffs(originalNodeRefMap.getTypeDefNodeMap(), modifiedNodeRefMap.getTypeDefNodeMap());
        computeModuleVarDiffs(originalNodeRefMap.getModuleVarNodeMap(), modifiedNodeRefMap.getModuleVarNodeMap());

        if (!loadDesignDiagrams) {
            compareUsingDesignDiagrams();
        }

        return new Result(loadDesignDiagrams, this.semanticDiffs);
    }

    /**
     * Computes listener differences between original and modified projects to determine
     * if design diagrams need to be reloaded.
     *
     * <p>This method performs a shallow comparison of listener declarations to detect
     * structural changes such as listener additions or removals. It sets the
     * {@code loadDesignDiagrams} flag if any differences are found, which indicates
     * that the architecture diagram should be regenerated.
     *
     * <p>Note: This method does not analyze the expression content of listeners since
     * only structural changes affect the design diagram. The comparison terminates
     * early if a difference is already detected to optimize performance.
     *
     * @param originalListenerMap map of listener names to their declaration nodes
     *                            from the original project
     * @param modifiedListenerMap map of listener names to their declaration nodes
     *                            from the modified project
     */
    private void computeListenerDiffs(Map<String, ListenerDeclarationNode> originalListenerMap,
                                      Map<String, ListenerDeclarationNode> modifiedListenerMap) {

        if (loadDesignDiagrams) {
            return;
        }

        for (Map.Entry<String, ListenerDeclarationNode> entry : originalListenerMap.entrySet()) {
            String listenerName = entry.getKey();
            if (!modifiedListenerMap.containsKey(listenerName)) {
                loadDesignDiagrams = true;
                return;
            }
            ListenerDeclarationNode originalListener = entry.getValue();
            ListenerDeclarationNode modifiedListener = modifiedListenerMap.remove(listenerName);
            if (!originalListener.toSourceCode().equals(modifiedListener.toSourceCode())) {
                loadDesignDiagrams = true;
                return;
            }
        }

        if (!modifiedListenerMap.isEmpty()) {
            loadDesignDiagrams = true;
        }
    }

    /**
     * Computes module-level variable differences between original and modified projects to
     * determine if design diagrams need to be reloaded.
     *
     * <p>Module-level variables include client/connection declarations. Changes to these
     * variables (additions, removals, or modifications) affect the design diagram and
     * should trigger a reload.
     *
     * @param originalVarMap original map of variable names to their declaration nodes
     * @param modifiedVarMap modified map of variable names to their declaration nodes
     */
    private void computeModuleVarDiffs(Map<String, ModuleVariableDeclarationNode> originalVarMap,
                                       Map<String, ModuleVariableDeclarationNode> modifiedVarMap) {

        if (loadDesignDiagrams) {
            return;
        }

        for (Map.Entry<String, ModuleVariableDeclarationNode> entry : originalVarMap.entrySet()) {
            String varName = entry.getKey();
            if (!modifiedVarMap.containsKey(varName)) {
                loadDesignDiagrams = true;
                return;
            }
            ModuleVariableDeclarationNode originalVar = entry.getValue();
            ModuleVariableDeclarationNode modifiedVar = modifiedVarMap.remove(varName);
            if (!originalVar.toSourceCode().equals(modifiedVar.toSourceCode())) {
                loadDesignDiagrams = true;
                return;
            }
        }

        if (!modifiedVarMap.isEmpty()) {
            loadDesignDiagrams = true;
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
            if (!modifiedTypeDefMap.containsKey(typeDefName)) {
                continue;
            }
            TypeDefinitionNode originalTypeDef = entry.getValue();
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

        if (originalFunctionBody instanceof FunctionBodyBlockNode originalBodyNode
                && modifiedFunctionBody instanceof FunctionBodyBlockNode modifiedBodyNode) {
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
     * Collects a map of document names to Document objects from the given project.
     *
     * @param project the Ballerina project to collect documents from
     * @return a map of document names to Document objects
     */
    private Map<String, Document> collectDocumentMap(Project project) {

        Map<String, Document> documentMap = new HashMap<>();
        project.currentPackage().getDefaultModule().documentIds().stream()
                .map(project.currentPackage().getDefaultModule()::document)
                .filter(Objects::nonNull)
                .forEach(document -> {
                    documentMap.put(document.name(), document);
                });
        return documentMap;
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
            serviceBasePaths.put(basePath, serviceName);
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

        Path filePath = Path.of(rootProjectPath).resolve(fileName);
        return "ai" + filePath.toUri().toString().substring(4);
    }
}
