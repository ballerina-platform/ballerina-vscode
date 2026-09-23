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

package io.ballerina.testmanagerservice.extension;

import io.ballerina.compiler.api.ModuleID;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.FunctionCallExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModuleMemberDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.ModuleVariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeVisitor;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.EvalTemplate;
import io.ballerina.projects.Document;
import io.ballerina.projects.DocumentId;
import io.ballerina.projects.Module;
import io.ballerina.projects.ModuleDescriptor;
import io.ballerina.testmanagerservice.extension.model.Evaluation;
import io.ballerina.testmanagerservice.extension.model.EvaluationAgent;
import io.ballerina.tools.diagnostics.Location;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

/**
 * Finds the tests of a module in the evaluations group, with the module-level agents each one runs.
 */
public class EvaluationFinder {

    private final Module module;
    private final SemanticModel semanticModel;
    private final Map<String, Document> documentsByFileName = new HashMap<>();
    private final Map<String, Optional<EvaluationAgent>> agentsByLocation = new HashMap<>();

    public EvaluationFinder(Module module, SemanticModel semanticModel) {
        this.module = module;
        this.semanticModel = semanticModel;
        Stream.concat(module.documentIds().stream(), module.testDocumentIds().stream())
                .map(module::document)
                .forEach(document -> documentsByFileName.put(document.syntaxTree().filePath(), document));
    }

    public List<Evaluation> find() {
        List<Evaluation> evaluations = new ArrayList<>();
        for (DocumentId documentId : module.testDocumentIds()) {
            ModulePartNode root = module.document(documentId).syntaxTree().rootNode();
            for (ModuleMemberDeclarationNode member : root.members()) {
                if (member instanceof FunctionDefinitionNode function && isEvaluation(function)) {
                    evaluations.add(analyze(function));
                }
            }
        }
        return evaluations;
    }

    private static boolean isEvaluation(FunctionDefinitionNode function) {
        return TestFunctionsFinder.findTestGroups(function)
                .filter(groups -> groups.stream()
                        .anyMatch(group -> Constants.EVALUATION_GROUP.equals(group.replace("\"", ""))))
                .isPresent();
    }

    private Evaluation analyze(FunctionDefinitionNode function) {
        UsageVisitor visitor = new UsageVisitor();
        function.functionBody().accept(visitor);
        return new Evaluation(function.functionName().text().trim(), function.lineRange(), visitor.template,
                List.copyOf(visitor.agents.values()));
    }

    private Optional<EvaluationAgent> agentOf(Symbol symbol) {
        if (!(symbol instanceof VariableSymbol variable) || !isAgent(variable) || symbol.getLocation().isEmpty()) {
            return Optional.empty();
        }
        return agentsByLocation.computeIfAbsent(key(symbol.getLocation().get()),
                key -> declaration(variable, ModuleVariableDeclarationNode.class)
                        .map(declaration -> new EvaluationAgent(variable.getName().orElseThrow(),
                                declaration.lineRange())));
    }

    private static boolean isAgent(VariableSymbol variable) {
        return variable.typeDescriptor() instanceof TypeReferenceTypeSymbol reference
                && reference.typeDescriptor() instanceof ClassSymbol agentClass
                && (CommonUtils.isAgentClass(agentClass) || CommonUtils.isAiFixedTypedAgent(agentClass)
                || CommonUtils.isAiDependentlyTypedAgent(agentClass));
    }

    private <T extends Node> Optional<T> declaration(Symbol symbol, Class<T> kind) {
        if (symbol.getModule().filter(this::isCurrentModule).isEmpty() || symbol.getLocation().isEmpty()) {
            return Optional.empty();
        }
        Location location = symbol.getLocation().get();
        Document document = documentsByFileName.get(location.lineRange().fileName());
        if (document == null) {
            return Optional.empty();
        }
        NonTerminalNode node = ((ModulePartNode) document.syntaxTree().rootNode()).findNode(location.textRange());
        while (node != null && !kind.isInstance(node)) {
            node = node.parent();
        }
        return Optional.ofNullable(node).map(kind::cast);
    }

    private boolean isCurrentModule(ModuleSymbol moduleSymbol) {
        ModuleID id = moduleSymbol.id();
        ModuleDescriptor descriptor = module.descriptor();
        return id.orgName().equals(descriptor.org().value()) && id.moduleName().equals(descriptor.name().toString());
    }

    private static String key(Location location) {
        return location.lineRange().fileName() + ":" + location.textRange().startOffset();
    }

    /**
     * Collects the agents and the evaluation template a test body reaches, following calls to module functions.
     */
    private final class UsageVisitor extends NodeVisitor {

        private final Map<String, EvaluationAgent> agents = new LinkedHashMap<>();
        private final Set<String> visitedFunctions = new HashSet<>();
        private EvalTemplate template;

        @Override
        public void visit(SimpleNameReferenceNode node) {
            semanticModel.symbol(node).flatMap(EvaluationFinder.this::agentOf)
                    .ifPresent(agent -> agents.putIfAbsent(agent.name(), agent));
        }

        @Override
        public void visit(FunctionCallExpressionNode node) {
            semanticModel.symbol(node.functionName())
                    .filter(FunctionSymbol.class::isInstance)
                    .map(FunctionSymbol.class::cast)
                    .ifPresent(this::visitCallee);
            node.arguments().forEach(argument -> argument.accept(this));
        }

        private void visitCallee(FunctionSymbol function) {
            if (template == null) {
                template = EvalTemplate.from(function).orElse(null);
            }
            function.getLocation()
                    .filter(location -> visitedFunctions.add(key(location)))
                    .flatMap(location -> declaration(function, FunctionDefinitionNode.class))
                    .ifPresent(definition -> definition.functionBody().accept(this));
        }
    }
}
