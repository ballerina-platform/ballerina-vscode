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

package io.ballerina.artifactsgenerator;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Qualifiable;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.EnumDeclarationNode;
import io.ballerina.compiler.syntax.tree.ExpressionFunctionBodyNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModuleVariableDeclarationNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NodeTransformer;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.compiler.syntax.tree.TypeDefinitionNode;
import io.ballerina.compiler.syntax.tree.TypeDescriptorNode;
import io.ballerina.flowmodelgenerator.core.utils.WorkflowUtil;
import io.ballerina.modelgenerator.commons.CommonUtils;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;

import java.util.Optional;
import java.util.stream.Collectors;

import static io.ballerina.modelgenerator.commons.CommonUtils.CONNECTOR_TYPE;
import static io.ballerina.modelgenerator.commons.CommonUtils.PERSIST;
import static io.ballerina.modelgenerator.commons.CommonUtils.PERSIST_MODEL_FILE;
import static io.ballerina.modelgenerator.commons.CommonUtils.getPersistModelFilePath;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAgentClass;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiFixedTypedAgent;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiDependentlyTypedAgent;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiMemoryStore;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiKnowledgeBase;
import static io.ballerina.modelgenerator.commons.CommonUtils.isAiVectorStore;
import static io.ballerina.modelgenerator.commons.CommonUtils.isPersistClient;

/**
 * Transforms module nodes into artifacts based on the syntax node.
 *
 * <p>
 * This class is thread-safe for transforming nodes within a single module. However, a new instance must be created when
 * transforming nodes from a different module, as the semantic model context is specific to the module being processed.
 * </p>
 *
 * @since 1.0.0
 */
public class ModuleNodeTransformer extends NodeTransformer<Optional<Artifact>> {

    private final SemanticModel semanticModel;
    private final String projectPath;

    private static final String AUTOMATION_FUNCTION_NAME = "automation";
    private static final String MAIN_FUNCTION_NAME = "main";

    public ModuleNodeTransformer(String projectPath, SemanticModel semanticModel) {
        this.semanticModel = semanticModel;
        this.projectPath = projectPath;
    }

    @Override
    public Optional<Artifact> transform(FunctionDefinitionNode functionDefinitionNode) {
        Artifact.Builder functionBuilder = new Artifact.Builder(functionDefinitionNode);
        String functionName = functionDefinitionNode.functionName().text();

        Optional<Symbol> functionSymbol = semanticModel.symbol(functionDefinitionNode);
        if (functionDefinitionNode.kind() == SyntaxKind.FUNCTION_DEFINITION
                && functionSymbol.isPresent() && CommonUtils.isAgentToolFunction(functionSymbol.get())) {
            return Optional.empty();
        }
        if (functionName.equals(MAIN_FUNCTION_NAME)) {
            functionBuilder
                    .name(AUTOMATION_FUNCTION_NAME)
                    .type(Artifact.Type.AUTOMATION);
        } else if (functionDefinitionNode.functionBody().kind() == SyntaxKind.EXPRESSION_FUNCTION_BODY) {
            if (BallerinaCompilerApi.getInstance()
                    .isNaturalExpressionBody((ExpressionFunctionBodyNode) functionDefinitionNode.functionBody())) {
                functionBuilder
                        .name(functionName)
                        .type(Artifact.Type.NP_FUNCTION);
            } else {
                functionBuilder
                        .name(functionName)
                        .type(Artifact.Type.DATA_MAPPER);
            }
        } else if (functionDefinitionNode.functionBody().kind() == SyntaxKind.EXTERNAL_FUNCTION_BODY) {
            return Optional.empty();
        } else if (functionDefinitionNode.kind() == SyntaxKind.RESOURCE_ACCESSOR_DEFINITION) {
            functionBuilder
                    .accessor(functionName)
                    .name(getPathString(functionDefinitionNode.relativeResourcePath()))
                    .type(Artifact.Type.RESOURCE);
        } else if (hasQualifier(functionDefinitionNode.qualifierList(), SyntaxKind.REMOTE_KEYWORD)) {
            functionBuilder
                    .name(functionName)
                    .type(Artifact.Type.REMOTE);
        } else if (functionSymbol.isPresent() && WorkflowUtil.isWorkflowFunction(functionSymbol.get())) {
            functionBuilder
                    .name(functionName)
                    .type(Artifact.Type.WORKFLOW);
        } else if (functionSymbol.isPresent() && WorkflowUtil.isActivityFunction(functionSymbol.get())) {
            functionBuilder
                    .name(functionName)
                    .type(Artifact.Type.ACTIVITY);
        } else {
            functionBuilder
                    .name(functionName)
                    .type(Artifact.Type.FUNCTION);
        }
        functionBuilder.visibility(determineVisibility(functionDefinitionNode));
        return Optional.of(functionBuilder.build());
    }

    @Override
    public Optional<Artifact> transform(ServiceDeclarationNode serviceDeclarationNode) {
        Artifact.Builder serviceBuilder = new Artifact.Builder(serviceDeclarationNode).locationId();

        // Set the icon using the listener
        SeparatedNodeList<ExpressionNode> expressions = serviceDeclarationNode.expressions();
        ExpressionNode firstExpression;
        if (!expressions.isEmpty()) {
            firstExpression = expressions.get(0);
            setIcon(serviceBuilder, firstExpression);
        } else {
            firstExpression = null;
        }

        // Derive the entry point name
        Optional<TypeDescriptorNode> typeDescriptorNode = serviceDeclarationNode.typeDescriptor();
        NodeList<Node> resourcePaths = serviceDeclarationNode.absoluteResourcePath();
        if (!serviceBuilder.trySetNameFromAnnotation(serviceDeclarationNode)) {
            if (typeDescriptorNode.isPresent()) {
                serviceBuilder.serviceName(typeDescriptorNode.get().toSourceCode().strip());
            } else if (!resourcePaths.isEmpty()) {
                serviceBuilder.serviceNameWithPath(getPathString(resourcePaths));
            } else if (firstExpression != null) {
                serviceBuilder.serviceName(firstExpression.toSourceCode().strip());
            } else {
                serviceBuilder.name("");
            }
        }

        // Generate the service path
        serviceBuilder
                .type(Artifact.Type.SERVICE)
                .visibility(determineVisibility(serviceDeclarationNode));

        // Check for the child functions
        serviceDeclarationNode.members().forEach(member -> {
            member.apply(this).ifPresent(serviceBuilder::child);
        });

        return Optional.of(serviceBuilder.build());
    }

    @Override
    public Optional<Artifact> transform(ListenerDeclarationNode listenerDeclarationNode) {
        Artifact.Builder listenerBuilder = new Artifact.Builder(listenerDeclarationNode)
                .name(listenerDeclarationNode.variableName().text())
                .type(Artifact.Type.LISTENER)
                .visibility(determineVisibility(listenerDeclarationNode));

        // TODO: This does not work for declarations that does not have a type descriptor node such as
        //  `listener httpListener = new http:Listener(9090);`
        //  Need to fix the semantic model APIs to support listener nodes, as they currently return empty values
        listenerDeclarationNode.typeDescriptor().flatMap(semanticModel::symbol).ifPresent(listenerBuilder::icon);
        return Optional.of(listenerBuilder.build());
    }

    @Override
    public Optional<Artifact> transform(ModuleVariableDeclarationNode moduleVariableDeclarationNode) {
        Artifact.Builder variableBuilder = new Artifact.Builder(moduleVariableDeclarationNode)
                .name(CommonUtils.getVariableName(
                        moduleVariableDeclarationNode.typedBindingPattern().bindingPattern()));

        Artifact.Visibility varVisibility = determineVisibility(moduleVariableDeclarationNode);
        if (hasQualifier(moduleVariableDeclarationNode.qualifiers(), SyntaxKind.CONFIGURABLE_KEYWORD)) {
            variableBuilder
                    .type(Artifact.Type.CONFIGURABLE)
                    .visibility(varVisibility);
        } else {
            Optional<ClassSymbol> agent = getAgent(moduleVariableDeclarationNode);
            if (agent.isPresent()) {
                variableBuilder
                        .type(Artifact.Type.AGENT)
                        .icon(agent.get())
                        .visibility(varVisibility);
            } else {
                Optional<ClassSymbol> connection = getConnection(moduleVariableDeclarationNode);
                if (connection.isPresent()) {
                    ClassSymbol clientClassSymbol = connection.get();
                    variableBuilder
                            .type(Artifact.Type.CONNECTION)
                            .icon(clientClassSymbol)
                            .visibility(varVisibility);
                    if (isPersistClient(clientClassSymbol, semanticModel)) {
                        variableBuilder
                                .addMetadata(CONNECTOR_TYPE, PERSIST);
                        getPersistModelFilePath(projectPath, clientClassSymbol)
                                .ifPresent(modelFile -> variableBuilder.addMetadata(PERSIST_MODEL_FILE, modelFile));
                    }
                } else {
                    variableBuilder
                            .type(Artifact.Type.VARIABLE)
                            .visibility(varVisibility);
                }
            }
        }

        return Optional.of(variableBuilder.build());
    }

    @Override
    public Optional<Artifact> transform(TypeDefinitionNode typeDefinitionNode) {
        Artifact.Builder typeBuilder = new Artifact.Builder(typeDefinitionNode)
                .name(typeDefinitionNode.typeName().text())
                .type(Artifact.Type.TYPE)
                .visibility(determineVisibility(typeDefinitionNode));
        return Optional.of(typeBuilder.build());
    }

    @Override
    public Optional<Artifact> transform(EnumDeclarationNode enumDeclarationNode) {
        Artifact.Builder typeBuilder = new Artifact.Builder(enumDeclarationNode)
                .name(enumDeclarationNode.identifier().text())
                .type(Artifact.Type.TYPE)
                .visibility(determineVisibility(enumDeclarationNode));
        return Optional.of(typeBuilder.build());
    }

    @Override
    public Optional<Artifact> transform(ClassDefinitionNode classDefinitionNode) {
        Artifact.Builder typeBuilder = new Artifact.Builder(classDefinitionNode)
                .name(classDefinitionNode.className().text())
                .visibility(determineVisibility(classDefinitionNode));

        Optional<ClassSymbol> agentDefinition = getAgentDefinition(classDefinitionNode);
        if (agentDefinition.isPresent()) {
            typeBuilder.type(Artifact.Type.AGENT_DEFINITION).icon(agentDefinition.get());
        } else {
            typeBuilder.type(Artifact.Type.TYPE);
        }

        classDefinitionNode.members().forEach(member -> {
            member.apply(this).ifPresent(typeBuilder::child);
        });

        return Optional.of(typeBuilder.build());
    }

    private Optional<ClassSymbol> getAgentDefinition(ClassDefinitionNode classDefinitionNode) {
        try {
            ClassSymbol classSymbol = (ClassSymbol) semanticModel.symbol(classDefinitionNode).orElseThrow();
            if (isAiFixedTypedAgent(classSymbol) || isAiDependentlyTypedAgent(classSymbol)) {
                return Optional.of(classSymbol);
            }
        } catch (Throwable e) {
        }
        return Optional.empty();
    }

    @Override
    protected Optional<Artifact> transformSyntaxNode(Node node) {
        return Optional.empty();
    }

    private void setIcon(Artifact.Builder builder, Node node) {
        Optional<TypeSymbol> typeSymbol = semanticModel.typeOf(node);
        if (typeSymbol.isEmpty()) {
            return;
        }
        if (typeSymbol.get().typeKind() == TypeDescKind.UNION) {
            UnionTypeSymbol unionTypeSymbol = (UnionTypeSymbol) typeSymbol.get();
            Optional<TypeSymbol> listenerSymbol = unionTypeSymbol.memberTypeDescriptors().stream()
                    .filter(member -> !member.subtypeOf(semanticModel.types().ERROR))
                    .findFirst();
            listenerSymbol.ifPresent(builder::icon);
            return;
        }
        builder.icon(typeSymbol.get());
    }

    private Optional<ClassSymbol> getConnection(Node node) {
        try {
            Symbol symbol = semanticModel.symbol(node).orElseThrow();
            TypeReferenceTypeSymbol typeDescriptorSymbol =
                    (TypeReferenceTypeSymbol) ((VariableSymbol) symbol).typeDescriptor();
            ClassSymbol classSymbol = (ClassSymbol) typeDescriptorSymbol.typeDescriptor();
            if (classSymbol.qualifiers().contains(Qualifier.CLIENT) || isAiKnowledgeBase(classSymbol)
                    || isAiVectorStore(symbol) || isAiMemoryStore(symbol)) {
                return Optional.of(classSymbol);
            }
        } catch (Throwable e) {
        }
        return Optional.empty();
    }

    private Optional<ClassSymbol> getAgent(Node node) {
        try {
            Symbol symbol = semanticModel.symbol(node).orElseThrow();
            TypeReferenceTypeSymbol typeDescriptorSymbol =
                    (TypeReferenceTypeSymbol) ((VariableSymbol) symbol).typeDescriptor();
            ClassSymbol classSymbol = (ClassSymbol) typeDescriptorSymbol.typeDescriptor();
            if (isAgentClass(classSymbol)
                    || isAiFixedTypedAgent(classSymbol)
                    || isAiDependentlyTypedAgent(classSymbol)) {
                return Optional.of(classSymbol);
            }
        } catch (Throwable e) {
        }
        return Optional.empty();
    }

    private static String getPathString(NodeList<Node> nodes) {
        return nodes.stream()
                .map(node -> node.toString().trim())
                .collect(Collectors.joining());
    }

    private static boolean hasQualifier(NodeList<Token> qualifierList, SyntaxKind kind) {
        return qualifierList.stream().anyMatch(qualifier -> qualifier.kind() == kind);
    }

    /**
     * Determines the visibility of a module-level declaration.
     * <p>
     * Uses the semantic model for accuracy, falling back to syntax-level qualifier inspection
     * when the semantic model is unavailable (e.g., for listener declarations).
     * </p>
     */
    private Artifact.Visibility determineVisibility(Node node) {
        try {
            Optional<Symbol> symbolOpt = semanticModel.symbol(node);
            if (symbolOpt.isPresent()) {
                Symbol symbol = symbolOpt.get();
                if (symbol instanceof Qualifiable qualifiable) {
                    if (qualifiable.qualifiers().contains(Qualifier.PUBLIC)) {
                        return Artifact.Visibility.PUBLIC;
                    }
                    if (qualifiable.qualifiers().contains(Qualifier.PRIVATE)) {
                        return Artifact.Visibility.PRIVATE;
                    }
                }
            }
        } catch (Throwable e) {
            // Fall back to syntax-level visibility.
        }
        return visibilityFromSyntax(node);
    }

    /**
     * Determines visibility using syntax-level qualifier tokens.
     * Used as a fallback when the semantic model is incomplete or unavailable.
     */
    private Artifact.Visibility visibilityFromSyntax(Node node) {
        if (node instanceof FunctionDefinitionNode funcNode) {
            if (hasQualifier(funcNode.qualifierList(), SyntaxKind.PUBLIC_KEYWORD)) {
                return Artifact.Visibility.PUBLIC;
            }
            if (hasQualifier(funcNode.qualifierList(), SyntaxKind.PRIVATE_KEYWORD)) {
                return Artifact.Visibility.PRIVATE;
            }
            return Artifact.Visibility.MODULE;
        }
        if (node instanceof ListenerDeclarationNode listenerNode) {
            return listenerNode.visibilityQualifier()
                    .map(t -> t.kind() == SyntaxKind.PUBLIC_KEYWORD ? Artifact.Visibility.PUBLIC
                            : Artifact.Visibility.MODULE)
                    .orElse(Artifact.Visibility.MODULE);
        }
        if (node instanceof ModuleVariableDeclarationNode moduleVarNode) {
            return hasQualifier(moduleVarNode.qualifiers(), SyntaxKind.PUBLIC_KEYWORD)
                    ? Artifact.Visibility.PUBLIC : Artifact.Visibility.MODULE;
        }
        if (node instanceof TypeDefinitionNode typeDefNode) {
            return typeDefNode.visibilityQualifier()
                    .map(t -> t.kind() == SyntaxKind.PUBLIC_KEYWORD ? Artifact.Visibility.PUBLIC
                            : Artifact.Visibility.MODULE)
                    .orElse(Artifact.Visibility.MODULE);
        }
        if (node instanceof EnumDeclarationNode enumNode) {
            return enumNode.qualifier()
                    .map(t -> t.kind() == SyntaxKind.PUBLIC_KEYWORD ? Artifact.Visibility.PUBLIC
                            : Artifact.Visibility.MODULE)
                    .orElse(Artifact.Visibility.MODULE);
        }
        if (node instanceof ClassDefinitionNode classNode) {
            return classNode.visibilityQualifier()
                    .map(t -> t.kind() == SyntaxKind.PUBLIC_KEYWORD ? Artifact.Visibility.PUBLIC
                            : Artifact.Visibility.MODULE)
                    .orElse(Artifact.Visibility.MODULE);
        }
        if (node instanceof ServiceDeclarationNode serviceNode) {
            return hasQualifier(serviceNode.qualifiers(), SyntaxKind.PUBLIC_KEYWORD)
                    ? Artifact.Visibility.PUBLIC : Artifact.Visibility.MODULE;
        }
        return Artifact.Visibility.MODULE;
    }
}
