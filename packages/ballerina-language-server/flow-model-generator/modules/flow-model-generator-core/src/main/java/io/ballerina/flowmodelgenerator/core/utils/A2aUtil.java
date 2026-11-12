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
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FieldAccessExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ImplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.MethodCallExpressionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NamedArgumentNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.ObjectFieldNode;
import io.ballerina.compiler.syntax.tree.ParameterNode;
import io.ballerina.compiler.syntax.tree.PositionalArgumentNode;
import io.ballerina.compiler.syntax.tree.RequiredParameterNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.TypeDescriptorNode;
import io.ballerina.modelgenerator.commons.A2aExecutorTypes;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.projects.Document;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.TextRange;

import java.util.Optional;

/**
 * Utilities for the A2A executor: the class that implements {@code a2a:AgentExecutor}.
 *
 * @since 1.9.0
 */
public final class A2aUtil {

    private static final String TASK_UPDATER = "TaskUpdater";
    private static final String REQUEST_CONTEXT = "RequestContext";
    private static final String DEFAULT_CONTEXT_NAME = "context";
    private static final String EXECUTE = "execute";
    private static final String TASK_STORE = "taskStore";
    private static final String EXECUTOR_SUFFIX = "A2aExecutor";
    private static final String DEFAULT_ORG = "ballerina";
    private static final String DEFAULT_MODULE = "a2a";

    private A2aUtil() {
    }

    /**
     * The updater an {@code execute} method of an A2A executor is given, and the package it comes from.
     *
     * @param updaterName the parameter's name, the object the task-update calls are made on
     * @param contextName the name of the {@code a2a:RequestContext} parameter
     * @param org         the organization of the package that defines {@code TaskUpdater}
     * @param packageName the package that defines it
     * @param module      the module that defines it
     * @param version     the version the project uses
     * @param executorClass the name of the executor class whose {@code execute} method this is
     */
    public record ExecutorScope(String updaterName, String contextName, String org, String packageName,
                                String module, String version, String executorClass) {
    }

    /**
     * Finds the A2A executor's {@code execute} method that contains the node.
     *
     * @param semanticModel the semantic model of the project
     * @param node          a node at the position being edited
     * @return the scope of the {@code execute} method, or empty when the node is anywhere else
     */
    public static Optional<ExecutorScope> findExecutorScope(SemanticModel semanticModel, Node node) {
        Node current = node;
        while (current != null && current.kind() != SyntaxKind.OBJECT_METHOD_DEFINITION) {
            current = current.parent();
        }
        if (!(current instanceof FunctionDefinitionNode method) || !EXECUTE.equals(method.functionName().text())
                || !(method.parent() instanceof ClassDefinitionNode classNode)
                || !A2aExecutorTypes.isAgentExecutor(semanticModel, classNode)) {
            return Optional.empty();
        }
        RequiredParameterNode updater = null;
        String contextName = DEFAULT_CONTEXT_NAME;
        for (ParameterNode parameter : method.functionSignature().parameters()) {
            if (!(parameter instanceof RequiredParameterNode required) || required.paramName().isEmpty()) {
                continue;
            }
            String type = required.typeName().toSourceCode().trim();
            if (type.endsWith(TASK_UPDATER)) {
                updater = required;
            } else if (type.endsWith(REQUEST_CONTEXT)) {
                contextName = required.paramName().get().text();
            }
        }
        return updater == null ? Optional.empty()
                : Optional.of(scopeOf(semanticModel, updater, contextName, classNode.className().text()));
    }

    /**
     * Finds the A2A executor's {@code execute} method at a position of a document.
     *
     * @param semanticModel the semantic model of the project
     * @param document      the document being edited
     * @param position      the position being edited
     * @return the scope of the {@code execute} method, or empty when the position is anywhere else
     */
    public static Optional<ExecutorScope> findExecutorScope(SemanticModel semanticModel, Document document,
                                                            LinePosition position) {
        try {
            int textPosition = document.textDocument().textPositionFrom(position);
            NonTerminalNode node = ((ModulePartNode) document.syntaxTree().rootNode())
                    .findNode(TextRange.from(textPosition, 0));
            return findExecutorScope(semanticModel, node);
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    /**
     * Finds the {@code execute} method of the executor a service hands its requests to, from a call such as
     * {@code self.handler.handleSendMessage(context, request)} where {@code handler} is a field initialized with
     * {@code new a2a:DefaultHandler(new Executor())}.
     *
     * @param semanticModel the semantic model of the project
     * @param call          the call on the handler field
     * @return the method symbol, or empty when the executor cannot be resolved
     */
    public static Optional<MethodSymbol> findExecuteMethod(SemanticModel semanticModel, MethodCallExpressionNode call) {
        if (!(call.expression() instanceof FieldAccessExpressionNode access)) {
            return Optional.empty();
        }
        String field = access.fieldName().toSourceCode().trim();
        NodeList<Node> members = null;
        for (NonTerminalNode parent = call.parent(); parent != null && members == null; parent = parent.parent()) {
            if (parent instanceof ServiceDeclarationNode service) {
                members = service.members();
            } else if (parent instanceof ClassDefinitionNode classNode) {
                members = classNode.members();
            }
        }
        if (members == null) {
            return Optional.empty();
        }
        for (Node member : members) {
            if (member instanceof ObjectFieldNode objectField && objectField.fieldName().text().equals(field)
                    && objectField.expression().orElse(null) instanceof ImplicitNewExpressionNode handler) {
                return executorOf(handler).flatMap(executor -> executeMethodOf(semanticModel, executor));
            }
        }
        return Optional.empty();
    }

    /**
     * The task store a handler created with this executor is given, as in
     * {@code new (new TripPlannerA2aExecutor(), taskStore = tripPlannerA2aTaskStore)}, looked up in the services and
     * classes of a document.
     *
     * @param root          the document's root
     * @param executorClass the executor class
     * @return the variable passed as {@code taskStore}, or empty when no such handler is found
     */
    public static Optional<String> taskStoreOf(ModulePartNode root, String executorClass) {
        for (Node member : root.members()) {
            NodeList<Node> fields = member instanceof ServiceDeclarationNode service ? service.members()
                    : member instanceof ClassDefinitionNode classNode ? classNode.members() : null;
            if (fields == null) {
                continue;
            }
            for (Node field : fields) {
                if (field instanceof ObjectFieldNode objectField
                        && objectField.expression().orElse(null) instanceof ImplicitNewExpressionNode handler
                        && executorOf(handler).map(executor -> createsClass(executor, executorClass)).orElse(false)) {
                    Optional<String> store = namedArgument(handler, TASK_STORE);
                    if (store.isPresent()) {
                        return store;
                    }
                }
            }
        }
        return Optional.empty();
    }

    /**
     * The task store the trigger generates for the agent an executor runs: {@code tripPlannerA2aTaskStore} for
     * {@code TripPlannerA2aExecutor}.
     *
     * @param executorClass the executor class
     * @return the generated store's name, or empty when the class was not named by the trigger
     */
    public static Optional<String> generatedTaskStoreOf(String executorClass) {
        if (executorClass == null || !executorClass.endsWith(EXECUTOR_SUFFIX)
                || executorClass.length() == EXECUTOR_SUFFIX.length()) {
            return Optional.empty();
        }
        String agent = executorClass.substring(0, executorClass.length() - EXECUTOR_SUFFIX.length());
        return Optional.of(Character.toLowerCase(agent.charAt(0)) + agent.substring(1) + "A2aTaskStore");
    }

    private static boolean createsClass(ExpressionNode expression, String className) {
        TypeDescriptorNode type = expression instanceof ExplicitNewExpressionNode explicit
                ? explicit.typeDescriptor() : null;
        return type != null && className.equals(type.toSourceCode().strip());
    }

    private static Optional<String> namedArgument(ImplicitNewExpressionNode call, String name) {
        return call.parenthesizedArgList().flatMap(arguments -> arguments.arguments().stream()
                .filter(NamedArgumentNode.class::isInstance)
                .map(NamedArgumentNode.class::cast)
                .filter(argument -> name.equals(argument.argumentName().name().text()))
                .map(argument -> argument.expression().toSourceCode().strip())
                .findFirst());
    }

    private static Optional<ExpressionNode> executorOf(ImplicitNewExpressionNode handler) {
        return handler.parenthesizedArgList()
                .flatMap(arguments -> arguments.arguments().stream().findFirst())
                .filter(PositionalArgumentNode.class::isInstance)
                .map(argument -> ((PositionalArgumentNode) argument).expression());
    }

    private static Optional<MethodSymbol> executeMethodOf(SemanticModel semanticModel, ExpressionNode executor) {
        return semanticModel.typeOf(executor)
                .map(CommonUtils::getRawType)
                .filter(ClassSymbol.class::isInstance)
                .map(type -> ((ClassSymbol) type).methods().get(EXECUTE));
    }

    private static ExecutorScope scopeOf(SemanticModel semanticModel, RequiredParameterNode parameter,
                                         String contextName, String executorClass) {
        String name = parameter.paramName().orElseThrow().text();
        Optional<ModuleSymbol> module = semanticModel.symbol(parameter).flatMap(A2aUtil::moduleOf);
        return module.map(symbol -> new ExecutorScope(name, contextName, symbol.id().orgName(),
                        symbol.id().packageName(), symbol.id().moduleName(), symbol.id().version(), executorClass))
                .orElseGet(() -> new ExecutorScope(name, contextName, DEFAULT_ORG, DEFAULT_MODULE, DEFAULT_MODULE,
                        "", executorClass));
    }

    private static Optional<ModuleSymbol> moduleOf(Symbol symbol) {
        if (symbol instanceof ParameterSymbol parameter) {
            return parameter.typeDescriptor().getModule();
        }
        return symbol.getModule();
    }
}
