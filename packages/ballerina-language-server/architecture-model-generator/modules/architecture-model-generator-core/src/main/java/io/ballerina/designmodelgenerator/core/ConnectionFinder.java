/*
 *  Copyright (c) 2024, WSO2 LLC. (http://www.wso2.com)
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

package io.ballerina.designmodelgenerator.core;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.AnnotationAttachmentSymbol;
import io.ballerina.compiler.api.symbols.ClassFieldSymbol;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.FunctionSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ModuleSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.AssignmentStatementNode;
import io.ballerina.compiler.syntax.tree.BasicLiteralNode;
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FieldAccessExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.FunctionCallExpressionNode;
import io.ballerina.compiler.syntax.tree.ImplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ListConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NamedArgumentNode;
import io.ballerina.compiler.syntax.tree.NewExpressionNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeFactory;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.ObjectFieldNode;
import io.ballerina.compiler.syntax.tree.ParenthesizedArgList;
import io.ballerina.compiler.syntax.tree.PositionalArgumentNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.VariableDeclarationNode;
import io.ballerina.designmodelgenerator.core.model.Connection;
import io.ballerina.designmodelgenerator.core.model.ConnectionKind;
import io.ballerina.tools.diagnostics.Location;
import io.ballerina.tools.text.LineRange;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Find connections for the given symbol.
 *
 * @since 1.0.0
 */
public class ConnectionFinder {
    private static final String MCP_SERVER = "MCP server";

    private static final String SYSTEM_PROMPT_FIELD = "systemPrompt";
    private static final String ROLE_FIELD = "role";
    private static final String MODEL_FIELD = "model";
    private static final String MEMORY_FIELD = "memory";
    private static final String DEFAULT_MODEL_PROVIDER_FUNCTION = "getDefaultModelProvider";
    private static final String WSO2_MODEL_PROVIDER = "Wso2ModelProvider";
    private static final String AGENT_TOOL_ANNOTATION = "AgentTool";

    private final SemanticModel semanticModel;
    private final Map<String, ModulePartNode> documentMap;
    private final Path rootPath;
    private final IntermediateModel intermediateModel;

    public ConnectionFinder(SemanticModel semanticModel, Path rootPath,
                            Map<String, ModulePartNode> documentMap,
                            IntermediateModel intermediateModel) {
        this.semanticModel = semanticModel;
        this.documentMap = documentMap;
        this.rootPath = rootPath;
        this.intermediateModel = intermediateModel;
    }

    public void findConnection(Symbol symbol, List<String> referenceLocations) {
        if (symbol.getLocation().isEmpty()) {
            return;
        }
        String hashKey = String.valueOf(symbol.getLocation().get().hashCode());
        referenceLocations.add(hashKey);
        if (this.intermediateModel.connectionMap.containsKey(hashKey)) {
            Connection connection = this.intermediateModel.connectionMap.get(hashKey);
            for (String refLocation : referenceLocations) {
                intermediateModel.connectionMap.put(refLocation, connection);
                intermediateModel.uuidToConnectionMap.put(connection.getUuid(), connection);
            }
            return;
        }
        if (symbol instanceof ClassFieldSymbol classFieldSymbol) {
            if (classFieldSymbol.hasDefaultValue()) {
                Location location = classFieldSymbol.getLocation().get();
                ModulePartNode modulePartNode = documentMap.get(location.lineRange().fileName());
                NonTerminalNode node = modulePartNode.findNode(location.textRange());
                if (node instanceof ObjectFieldNode objectFieldNode) {
                    if (objectFieldNode.expression().isEmpty()) {
                        return;
                    }
                    if (isNewConnection(objectFieldNode.expression().get())) {
                        LineRange lineRange = node.lineRange();
                        String sortText = lineRange.fileName() + lineRange.startLine().line();
                        String icon = CommonUtils.generateIcon(classFieldSymbol.typeDescriptor());
                        TypeSymbol rawType = CommonUtils.getRawType(classFieldSymbol.typeDescriptor());
                        Connection connection = new Connection(objectFieldNode.fieldName().text(),
                                sortText, getLocation(lineRange), Connection.Scope.LOCAL, icon, false,
                                CommonUtils.getConnectionKind(rawType));
                        for (String refLocation : referenceLocations) {
                            intermediateModel.connectionMap.put(String.valueOf(refLocation), connection);
                            intermediateModel.uuidToConnectionMap.put(connection.getUuid(), connection);
                        }
                    } else {
                        Optional<Symbol> valueSymbol = semanticModel.symbol(objectFieldNode.expression().get());
                        if (valueSymbol.isPresent()) { // TODO: handle for function calls
                            findConnection(valueSymbol.get(), referenceLocations);
                        }
                    }
                }
            } else {
                List<Location> references = this.semanticModel.references(classFieldSymbol);
                for (Location location : references) {
                    ModulePartNode modulePartNode = documentMap.get(location.lineRange().fileName());
                    NonTerminalNode node = modulePartNode.findNode(location.textRange()).parent();
                    if (node instanceof AssignmentStatementNode assignmentStatementNode) {
                        if (isNewConnection(assignmentStatementNode.expression())) {
                            LineRange lineRange = node.lineRange();
                            String sortText = lineRange.fileName() + lineRange.startLine().line();
                            String icon = CommonUtils.generateIcon(classFieldSymbol.typeDescriptor());
                            TypeSymbol rawType = CommonUtils.getRawType(classFieldSymbol.typeDescriptor());
                            Connection connection = new Connection(symbol.getName().get(), sortText,
                                    getLocation(lineRange), Connection.Scope.LOCAL, icon, false,
                                    CommonUtils.getConnectionKind(rawType));
                            for (String refLocation : referenceLocations) {
                                intermediateModel.connectionMap.put(String.valueOf(refLocation), connection);
                                intermediateModel.uuidToConnectionMap.put(connection.getUuid(), connection);
                            }
                            // Process constructor arguments to find dependent connections
                            if (rawType instanceof ClassSymbol) {
                                ExpressionNode expressionNode = assignmentStatementNode.expression();
                                if (expressionNode instanceof CheckExpressionNode checkExpressionNode) {
                                    expressionNode = checkExpressionNode.expression();
                                }
                                if (expressionNode instanceof NewExpressionNode newExpressionNode) {
                                    SeparatedNodeList<FunctionArgumentNode> argList = getArgList(newExpressionNode);
                                    extractRole(connection, argList);
                                    extractAgentConfig(connection, argList);
                                    extractTypedAgentTools(connection, rawType);
                                    List<ExpressionNode> argExprs = getInitMethodArgExprs(argList);
                                    for (ExpressionNode argExpr : argExprs) {
                                        handleInitMethodArgs(connection, argExpr);
                                    }
                                }
                            }
                        } else {
                            Optional<Symbol> valueSymbol = semanticModel.symbol(assignmentStatementNode.expression());
                            if (valueSymbol.isPresent()) { // TODO: handle for function calls
                                findConnection(valueSymbol.get(), referenceLocations);
                            }
                        }
                    }
                }
            }
        } else if (symbol instanceof VariableSymbol variableSymbol) {
            if (this.intermediateModel.connectionMap.containsKey(hashKey)) {
                Connection connection = this.intermediateModel.connectionMap.get(hashKey);
                for (String refLocation : referenceLocations) {
                    intermediateModel.connectionMap.put(refLocation, connection);
                    intermediateModel.uuidToConnectionMap.put(connection.getUuid(), connection);
                }
            } else {
                List<Location> references = this.semanticModel.references(variableSymbol);
                for (Location location : references) {
                    ModulePartNode modulePartNode = documentMap.get(location.lineRange().fileName());
                    NonTerminalNode node = modulePartNode.findNode(location.textRange()).parent();
                    if (node instanceof VariableDeclarationNode variableDeclarationNode) {
                        if (variableDeclarationNode.initializer().isEmpty()) {
                            continue;
                        }
                        TypeSymbol typeSymbol = CommonUtils.getRawType(variableSymbol.typeDescriptor());
                        if (typeSymbol instanceof ObjectTypeSymbol objectTypeSymbol) {
                            if (!objectTypeSymbol.qualifiers().contains(Qualifier.CLIENT)) {
                                continue;
                            }
                        }
                        if (isNewConnection(variableDeclarationNode.initializer().get())) {
                            LineRange lineRange = node.lineRange();
                            String sortText = lineRange.fileName() + lineRange.startLine().line();
                            String icon = CommonUtils.generateIcon(variableSymbol.typeDescriptor());
                            Connection connection = new Connection(symbol.getName().get(), sortText,
                                    getLocation(lineRange), Connection.Scope.LOCAL, icon, true,
                                    CommonUtils.getConnectionKind(typeSymbol));
                            for (String refLocation : referenceLocations) {
                                intermediateModel.connectionMap.put(String.valueOf(refLocation), connection);
                                intermediateModel.uuidToConnectionMap.put(connection.getUuid(), connection);
                            }
                        } else {
                            if (variableDeclarationNode.initializer().isPresent()) {
                                Optional<Symbol> valueSymbol = semanticModel.symbol(
                                        variableDeclarationNode.initializer().get());
                                if (valueSymbol.isPresent()) { // TODO: handle for function calls
                                    findConnection(valueSymbol.get(), referenceLocations);
                                }
                            }
                        }
                    } else if (node instanceof AssignmentStatementNode assignmentStatementNode) {
                        if (isNewConnection(assignmentStatementNode.expression())) {
                            LineRange lineRange = node.lineRange();
                            String sortText = lineRange.fileName() + lineRange.startLine().line();
                            TypeSymbol rawType = CommonUtils.getRawType(variableSymbol.typeDescriptor());
                            Connection connection = new Connection(symbol.getName().get(), sortText,
                                    getLocation(lineRange), Connection.Scope.LOCAL, "", false,
                                    CommonUtils.getConnectionKind(rawType));
                            for (String refLocation : referenceLocations) {
                                intermediateModel.connectionMap.put(String.valueOf(refLocation), connection);
                                intermediateModel.uuidToConnectionMap.put(connection.getUuid(), connection);
                            }
                        } else {
                            Optional<Symbol> valueSymbol = semanticModel.symbol(assignmentStatementNode.expression());
                            if (valueSymbol.isPresent()) { // TODO: handle for function calls
                                findConnection(valueSymbol.get(), referenceLocations);
                            }
                        }
                    }
                }
            }
        }
    }

    private boolean isNewConnection(ExpressionNode expressionNode) {
        return switch (expressionNode) {
            case ImplicitNewExpressionNode ignored -> true;
            case ExplicitNewExpressionNode ignored -> true;
            case CheckExpressionNode checkExpressionNode -> isNewConnection(checkExpressionNode.expression());
            default -> false;
        };
    }

    public io.ballerina.designmodelgenerator.core.model.Location getLocation(LineRange lineRange) {
        Path filePath = rootPath.resolve(lineRange.fileName());
        return new io.ballerina.designmodelgenerator.core.model.Location(
                filePath.toAbsolutePath().toString(), lineRange.startLine(),
                lineRange.endLine());
    }

    public SeparatedNodeList<FunctionArgumentNode> getArgList(NewExpressionNode newExpressionNode) {
        if (newExpressionNode instanceof ExplicitNewExpressionNode explicitNewExpressionNode) {
            return explicitNewExpressionNode.parenthesizedArgList().arguments();
        } else {
            Optional<ParenthesizedArgList> parenthesizedArgList = ((ImplicitNewExpressionNode) newExpressionNode)
                    .parenthesizedArgList();
            return parenthesizedArgList.map(ParenthesizedArgList::arguments)
                    .orElse(NodeFactory.createSeparatedNodeList());
        }
    }

    public List<ExpressionNode> getInitMethodArgExprs(SeparatedNodeList<FunctionArgumentNode> argumentNodes) {
        List<ExpressionNode> arguments = new ArrayList<>();

        for (int argIdx = 0; argIdx < argumentNodes.size(); argIdx++) {
            Node argument = argumentNodes.get(argIdx);
            if (argument == null) {
                continue;
            }
            SyntaxKind argKind = argument.kind();
            if (argKind == SyntaxKind.NAMED_ARG) {
                arguments.add(((NamedArgumentNode) argument).expression());
            } else if (argKind == SyntaxKind.POSITIONAL_ARG) {
                arguments.add(((PositionalArgumentNode) argument).expression());
            }
        }
        return arguments;
    }

    public void handleInitMethodArgs(Connection connection, ExpressionNode expressionNode) {
        if (expressionNode instanceof ListConstructorExpressionNode listConstructorExpressionNode) {
            recordToolListEntries(connection, listConstructorExpressionNode);
        } else if (expressionNode instanceof MappingConstructorExpressionNode mappingConstructorExpressionNode) {
            for (Node expr : mappingConstructorExpressionNode.fields()) {
                if (expr instanceof SpecificFieldNode specificFieldNode
                        && specificFieldNode.valueExpr().isPresent()) {
                    ExpressionNode fieldValue = specificFieldNode.valueExpr().get();
                    recordAgentConfigField(connection, specificFieldNode.fieldName().toSourceCode().trim(),
                            fieldValue);
                    handleInitMethodArgs(connection, fieldValue);
                }
            }
        } else if (expressionNode instanceof SimpleNameReferenceNode varRef) {
            Optional<Symbol> symbol = this.semanticModel.symbol(varRef);
            if (symbol.isPresent() && symbol.get() instanceof VariableSymbol variableSymbol &&
                    symbol.get().getLocation().isPresent()) {
                TypeSymbol rawType = CommonUtils.getRawType(variableSymbol.typeDescriptor());
                if (rawType instanceof ClassSymbol classSymbol) {
                    boolean isHiddenAiClass = CommonUtils.isHiddenAiClass(classSymbol);
                    if (classSymbol.qualifiers().contains(Qualifier.CLIENT) || isHiddenAiClass) {
                        String hashCode = String.valueOf(symbol.get().getLocation().get().hashCode());
                        if (intermediateModel.connectionMap.containsKey(hashCode)) {
                            Connection dependentConnection = intermediateModel.connectionMap.get(hashCode);
                            connection.addDependentConnection(dependentConnection.getUuid());
                        }
                    }
                }
            }
        }
    }

    // An agent's tools list: functions by name, MCP toolkits by their variable, class field or server URL.
    private void recordToolListEntries(Connection connection, ListConstructorExpressionNode list) {
        for (Node expr : list.expressions()) {
            if (isMcpToolKit(expr)) {
                connection.addMcpToolKit(mcpToolKitLabel(expr));
                continue;
            }
            Optional<Symbol> symbol = this.semanticModel.symbol(expr);
            if (symbol.isPresent() && symbol.get() instanceof FunctionSymbol functionSymbol) {
                connection.addDependentFunction(functionSymbol.getName().orElse(""));
            }
        }
    }

    private boolean isMcpToolKit(Node expr) {
        return this.semanticModel.typeOf(expr).map(CommonUtils::isAiMcpToolKit).orElse(false);
    }

    // A named toolkit reads by its variable or class field; an inline `new ai:McpToolKit("url")` by its server URL.
    private static String mcpToolKitLabel(Node expr) {
        Node inner = expr instanceof CheckExpressionNode checkExpression ? checkExpression.expression() : expr;
        if (inner instanceof SimpleNameReferenceNode reference) {
            return reference.name().text();
        }
        if (inner instanceof FieldAccessExpressionNode fieldAccess) {
            return fieldAccess.fieldName().toSourceCode().trim();
        }
        if (inner instanceof NewExpressionNode newExpression) {
            return firstStringArgument(newExpression).orElse(MCP_SERVER);
        }
        return MCP_SERVER;
    }

    private static Optional<String> firstStringArgument(NewExpressionNode newExpression) {
        Optional<ParenthesizedArgList> args = newExpression instanceof ExplicitNewExpressionNode explicit
                ? Optional.of(explicit.parenthesizedArgList())
                : ((ImplicitNewExpressionNode) newExpression).parenthesizedArgList();
        return args.stream()
                .flatMap(list -> list.arguments().stream())
                .filter(arg -> arg instanceof PositionalArgumentNode positional
                        && positional.expression() instanceof BasicLiteralNode literal
                        && literal.kind() == SyntaxKind.STRING_LITERAL)
                .map(arg -> ((BasicLiteralNode) ((PositionalArgumentNode) arg).expression()).literalToken().text())
                .map(text -> text.substring(1, text.length() - 1))
                .findFirst();
    }

    /**
     * Finds the agent's {@code systemPrompt: {role: "...", ...}} argument among the {@code new(...)}
     * call's named arguments and records its role. Handles agent construction, which passes each
     * config field as its own named argument rather than one aggregate mapping literal (the shape
     * {@link #handleInitMethodArgs} otherwise expects).
     */
    public void extractRole(Connection connection, SeparatedNodeList<FunctionArgumentNode> argList) {
        for (Node argument : argList) {
            if (argument instanceof NamedArgumentNode namedArgumentNode
                    && SYSTEM_PROMPT_FIELD.equals(namedArgumentNode.argumentName().name().text())
                    && namedArgumentNode.expression() instanceof MappingConstructorExpressionNode systemPrompt) {
                setRoleFromSystemPrompt(connection, systemPrompt);
                return;
            }
        }
    }

    /**
     * Records what the agent is constructed with: the {@code model = ...} and {@code memory = ...} named
     * arguments of an {@code ai:Agent}, or a positional argument of provider type, as a typed agent's class takes it.
     */
    public void extractAgentConfig(Connection connection, SeparatedNodeList<FunctionArgumentNode> argList) {
        for (Node argument : argList) {
            if (argument instanceof NamedArgumentNode namedArgumentNode) {
                recordAgentConfigField(connection, namedArgumentNode.argumentName().name().text(),
                        namedArgumentNode.expression());
            } else if (argument instanceof PositionalArgumentNode positionalArgumentNode) {
                setModelProvider(connection, positionalArgumentNode.expression());
            }
        }
    }

    // A typed agent's tools are its methods annotated @ai:AgentTool, as the flow model lists them.
    public void extractTypedAgentTools(Connection connection, TypeSymbol rawType) {
        if (!(rawType instanceof ClassSymbol classSymbol)) {
            return;
        }
        if (!CommonUtils.isAiFixedTypedAgent(classSymbol) && !CommonUtils.isAiDependentlyTypedAgent(classSymbol)) {
            return;
        }
        for (MethodSymbol method : classSymbol.methods().values()) {
            if (method.annotAttachments().stream().anyMatch(ConnectionFinder::isAgentToolAnnotation)) {
                method.getName().ifPresent(connection::addDependentFunction);
            }
        }
        // As with the tool methods, a class's MCP toolkit fields count whether or not the init lists them.
        classSymbol.fieldDescriptors().forEach((name, field) -> {
            if (CommonUtils.isAiMcpToolKit(field.typeDescriptor())) {
                connection.addMcpToolKit(name);
            }
        });
    }

    private static boolean isAgentToolAnnotation(AnnotationAttachmentSymbol annotation) {
        return annotation.typeDescriptor().nameEquals(AGENT_TOOL_ANNOTATION)
                && annotation.typeDescriptor().getModule()
                .map(ModuleSymbol::id)
                .filter(id -> CommonUtils.isAiModule(id.orgName(), id.packageName()))
                .isPresent();
    }

    private void setMemory(Connection connection, ExpressionNode expression) {
        ExpressionNode expr = expression instanceof CheckExpressionNode check ? check.expression() : expression;
        Optional<TypeSymbol> type = this.semanticModel.typeOf(expr);
        if (type.isEmpty()) {
            return;
        }
        TypeSymbol rawType = CommonUtils.getRawType(type.get());
        if (!(rawType instanceof ClassSymbol)) {
            return;
        }
        String symbol = expr instanceof SimpleNameReferenceNode varRef ? varRef.name().text() : null;
        connection.setMemory(new Connection.MemoryStore(symbol, CommonUtils.getTypeName(rawType)));
    }

    // A named variable resolves through its type; an inline `ai:getDefaultModelProvider()` has no variable
    // and a union return type, so it is recognised by name.
    private void setModelProvider(Connection connection, ExpressionNode expression) {
        ExpressionNode expr = expression instanceof CheckExpressionNode check ? check.expression() : expression;
        if (expr instanceof FunctionCallExpressionNode call
                && call.functionName().toSourceCode().trim().endsWith(DEFAULT_MODEL_PROVIDER_FUNCTION)) {
            connection.setModelProvider(new Connection.ModelProvider(null, WSO2_MODEL_PROVIDER, null));
            return;
        }
        Optional<TypeSymbol> type = this.semanticModel.typeOf(expr);
        if (type.isEmpty()) {
            return;
        }
        TypeSymbol rawType = CommonUtils.getRawType(type.get());
        if (CommonUtils.getConnectionKind(rawType) != ConnectionKind.MODEL_PROVIDER) {
            return;
        }
        String symbol = expr instanceof SimpleNameReferenceNode varRef ? varRef.name().text() : null;
        connection.setModelProvider(new Connection.ModelProvider(symbol, CommonUtils.getTypeName(rawType),
                CommonUtils.generateIcon(rawType)));
    }

    private void recordAgentConfigField(Connection connection, String fieldName, ExpressionNode fieldValue) {
        if (SYSTEM_PROMPT_FIELD.equals(fieldName)
                && fieldValue instanceof MappingConstructorExpressionNode systemPrompt) {
            setRoleFromSystemPrompt(connection, systemPrompt);
        } else if (MODEL_FIELD.equals(fieldName)) {
            setModelProvider(connection, fieldValue);
        } else if (MEMORY_FIELD.equals(fieldName)) {
            setMemory(connection, fieldValue);
        }
    }

    private void setRoleFromSystemPrompt(Connection connection, MappingConstructorExpressionNode systemPrompt) {
        for (Node field : systemPrompt.fields()) {
            if (field instanceof SpecificFieldNode roleField
                    && ROLE_FIELD.equals(roleField.fieldName().toSourceCode().trim())
                    && roleField.valueExpr().isPresent()
                    && roleField.valueExpr().get() instanceof BasicLiteralNode literal
                    && literal.kind() == SyntaxKind.STRING_LITERAL) {
                String text = literal.literalToken().text();
                connection.setRole(text.substring(1, text.length() - 1));
                return;
            }
        }
    }
}
