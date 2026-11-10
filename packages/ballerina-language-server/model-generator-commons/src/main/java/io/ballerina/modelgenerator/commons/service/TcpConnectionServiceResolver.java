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

package io.ballerina.modelgenerator.commons.service;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.ServiceDeclarationSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ImplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.NewExpressionNode;
import io.ballerina.compiler.syntax.tree.NodeVisitor;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SyntaxTree;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.tools.diagnostics.Location;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * Resolves the service class a TCP service hands each accepted connection to.
 * <p>
 * A {@code ballerina/tcp} service only declares {@code onConnect}, which returns a {@code tcp:ConnectionService}
 * instance. The handlers users implement (onBytes, onError, onClose) live on that instance's class, so every view
 * that presents the service's handlers resolves the class through here to stay in agreement.
 *
 * @since 6.0.1
 */
public final class TcpConnectionServiceResolver {

    private static final String TCP_MODULE = "tcp";
    private static final String ON_CONNECT = "onConnect";

    private TcpConnectionServiceResolver() {
    }

    /**
     * Finds the service class {@code onConnect} instantiates. Only the first service class instantiated in the
     * method body is taken, and only from the service's own module, the one place the user edits it. A value
     * obtained any other way (a parameter, a function call) cannot be resolved.
     *
     * @param serviceNode   the service declaration
     * @param semanticModel the semantic model of the service's module
     * @return the connection service class, or empty when the service is not a TCP service or none is resolved
     */
    public static Optional<ClassSymbol> findConnectionServiceClass(ServiceDeclarationNode serviceNode,
                                                                   SemanticModel semanticModel) {
        // The syntactic onConnect check runs first: it rules out nearly every other service without a symbol lookup.
        Optional<FunctionDefinitionNode> onConnect = serviceNode.members().stream()
                .filter(FunctionDefinitionNode.class::isInstance)
                .map(FunctionDefinitionNode.class::cast)
                .filter(function -> ON_CONNECT.equals(function.functionName().text().trim()))
                .findFirst();
        Optional<ModuleInfo> serviceModule = onConnect.flatMap(function -> semanticModel.symbol(serviceNode))
                .filter(ServiceDeclarationSymbol.class::isInstance)
                .map(ServiceDeclarationSymbol.class::cast)
                .filter(TcpConnectionServiceResolver::isTcpService)
                .flatMap(Symbol::getModule)
                .map(module -> ModuleInfo.from(module.id()));
        if (serviceModule.isEmpty()) {
            return Optional.empty();
        }

        NewExpressionCollector collector = new NewExpressionCollector();
        onConnect.get().functionBody().accept(collector);
        return collector.newExpressions.stream()
                .map(semanticModel::typeOf)
                .flatMap(Optional::stream)
                .flatMap(TcpConnectionServiceResolver::rawTypeMembers)
                .filter(ClassSymbol.class::isInstance)
                .map(ClassSymbol.class::cast)
                .filter(classSymbol -> classSymbol.qualifiers().contains(Qualifier.SERVICE))
                .filter(classSymbol -> CommonUtils.isWithinPackageModule(classSymbol, serviceModule.get()))
                .findFirst();
    }

    /**
     * Finds the definition of a class within the given syntax tree.
     *
     * @param classSymbol the class to look up
     * @param syntaxTree  the syntax tree of a document of the class's module
     * @return the class definition, or empty when the class is not declared in this document
     */
    public static Optional<ClassDefinitionNode> findClassDefinition(ClassSymbol classSymbol, SyntaxTree syntaxTree) {
        Optional<Location> location = classSymbol.getLocation();
        if (location.isEmpty() || !syntaxTree.containsModulePart()
                || !location.get().lineRange().fileName().equals(syntaxTree.filePath())) {
            return Optional.empty();
        }
        ModulePartNode rootNode = syntaxTree.rootNode();
        return Optional.of(rootNode.findNode(location.get().textRange()))
                .filter(ClassDefinitionNode.class::isInstance)
                .map(ClassDefinitionNode.class::cast);
    }

    /**
     * The raw types a {@code new} expression can evaluate to. A class whose {@code init} can fail yields
     * {@code Class|error}, so each member of a union is unwrapped as well.
     */
    private static Stream<TypeSymbol> rawTypeMembers(TypeSymbol typeSymbol) {
        TypeSymbol rawType = CommonUtils.getRawType(typeSymbol);
        if (rawType instanceof UnionTypeSymbol unionType) {
            return unionType.memberTypeDescriptors().stream().map(CommonUtils::getRawType);
        }
        return Stream.of(rawType);
    }

    private static boolean isTcpService(ServiceDeclarationSymbol serviceSymbol) {
        return serviceSymbol.listenerTypes().stream().anyMatch(TcpConnectionServiceResolver::isTcpType);
    }

    private static boolean isTcpType(TypeSymbol typeSymbol) {
        return CommonUtils.getRawType(typeSymbol).getModule()
                .map(module -> CommonUtils.BALLERINA_ORG_NAME.equals(module.id().orgName())
                        && TCP_MODULE.equals(module.id().moduleName()))
                .orElse(false);
    }

    /**
     * Collects the {@code new} expressions of a function body, in source order.
     */
    private static final class NewExpressionCollector extends NodeVisitor {

        private final List<NewExpressionNode> newExpressions = new ArrayList<>();

        @Override
        public void visit(ExplicitNewExpressionNode explicitNewExpressionNode) {
            newExpressions.add(explicitNewExpressionNode);
        }

        @Override
        public void visit(ImplicitNewExpressionNode implicitNewExpressionNode) {
            newExpressions.add(implicitNewExpressionNode);
        }
    }
}
