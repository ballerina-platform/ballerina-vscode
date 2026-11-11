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

package io.ballerina.copilotagent.core;

import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ListenerDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.ServiceDeclarationNode;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.projects.Module;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * Resolves a service's type (the listener's module, e.g. {@code http} or {@code solace}) from syntax,
 * so it works without compiling the package. Checked in order: the service's type descriptor, an inline
 * {@code new x:Listener(...)}, then a module-level listener the service refers to.
 *
 * @since 2.0.0
 */
class ServiceTypeResolver {

    // Covers every document, since a listener may be declared in a file the edit didn't touch.
    private final Map<String, String> listenerTypes = new HashMap<>();

    ServiceTypeResolver(Module module) {

        if (module == null) {
            return;
        }
        Stream.concat(module.documentIds().stream(), module.testDocumentIds().stream())
                .map(module::document)
                .map(document -> (ModulePartNode) document.syntaxTree().rootNode())
                .forEach(this::indexListeners);
    }

    /**
     * @return the service's type, or empty when syntax doesn't tell (e.g. a listener class from this package)
     */
    Optional<String> resolve(ServiceDeclarationNode service) {

        Map<String, String> modulesByPrefix = getModulesByPrefix((ModulePartNode) service.syntaxTree().rootNode());
        Optional<String> declaredType = service.typeDescriptor()
                .flatMap(type -> getModuleName(type, modulesByPrefix));
        if (declaredType.isPresent()) {
            return declaredType;
        }
        for (ExpressionNode expression : service.expressions()) {
            ExpressionNode listener = unwrapCheck(expression);
            if (listener instanceof SimpleNameReferenceNode reference) {
                String listenerType = listenerTypes.get(reference.name().text().trim());
                if (listenerType != null) {
                    return Optional.of(listenerType);
                }
            } else {
                Optional<String> inlineType = getNewExpressionModule(listener, modulesByPrefix);
                if (inlineType.isPresent()) {
                    return inlineType;
                }
            }
        }
        return Optional.empty();
    }

    private void indexListeners(ModulePartNode modulePart) {

        Map<String, String> modulesByPrefix = getModulesByPrefix(modulePart);
        modulePart.members().forEach(member -> {
            if (!(member instanceof ListenerDeclarationNode listener)) {
                return;
            }
            listener.typeDescriptor()
                    .flatMap(type -> getModuleName(type, modulesByPrefix))
                    .or(() -> getNewExpressionModule(listener.initializer(), modulesByPrefix))
                    .ifPresent(type -> listenerTypes.putIfAbsent(listener.variableName().text().trim(), type));
        });
    }

    private static Optional<String> getNewExpressionModule(Node node, Map<String, String> modulesByPrefix) {

        if (node instanceof ExpressionNode expression
                && unwrapCheck(expression) instanceof ExplicitNewExpressionNode newExpression) {
            return getModuleName(newExpression.typeDescriptor(), modulesByPrefix);
        }
        return Optional.empty();
    }

    private static ExpressionNode unwrapCheck(ExpressionNode expression) {

        return expression instanceof CheckExpressionNode check ? check.expression() : expression;
    }

    private static Optional<String> getModuleName(Node type, Map<String, String> modulesByPrefix) {

        if (!(type instanceof QualifiedNameReferenceNode qualifiedName)) {
            return Optional.empty();
        }
        String prefix = qualifiedName.modulePrefix().text().trim();
        return Optional.of(modulesByPrefix.getOrDefault(prefix, prefix));
    }

    private static Map<String, String> getModulesByPrefix(ModulePartNode modulePart) {

        Map<String, String> modulesByPrefix = new HashMap<>();
        for (ImportDeclarationNode importNode : modulePart.imports()) {
            if (importNode.moduleName().isEmpty()) {
                continue;
            }
            // `ballerinax/trigger.github` is referred to as `github` unless aliased
            String moduleName = importNode.moduleName().get(importNode.moduleName().size() - 1).text().trim();
            String prefix = importNode.prefix()
                    .map(importPrefix -> importPrefix.prefix().text().trim())
                    .orElse(moduleName);
            modulesByPrefix.put(prefix, moduleName);
        }
        return modulesByPrefix;
    }
}
