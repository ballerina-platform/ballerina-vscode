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

package io.ballerina.modelgenerator.commons;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.syntax.tree.ClassDefinitionNode;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.TypeReferenceNode;

import java.util.Optional;

/**
 * Tells whether a class is an A2A executor: one that includes the {@code AgentExecutor} type of the
 * {@code ballerina/a2a} module, and not merely a type whose name ends the same way.
 *
 * @since 1.9.0
 */
public final class A2aExecutorTypes {

    private static final String AGENT_EXECUTOR = "AgentExecutor";
    private static final String A2A_MODULE = "a2a";

    private A2aExecutorTypes() {
    }

    /**
     * Whether the class includes {@code a2a:AgentExecutor}. The type is resolved through the semantic model; when it
     * cannot be resolved (the module is not pulled yet), a reference written as {@code <prefix>:AgentExecutor} counts.
     *
     * @param semanticModel the semantic model of the class's module, or null when there is none
     * @param classNode     the class
     * @return true when the class is an A2A executor
     */
    public static boolean isAgentExecutor(SemanticModel semanticModel, ClassDefinitionNode classNode) {
        return classNode.members().stream()
                .anyMatch(member -> member instanceof TypeReferenceNode reference
                        && isAgentExecutorReference(semanticModel, reference));
    }

    private static boolean isAgentExecutorReference(SemanticModel semanticModel, TypeReferenceNode reference) {
        Optional<Symbol> symbol = semanticModel == null ? Optional.empty()
                : semanticModel.symbol(reference.typeName());
        if (symbol.isPresent()) {
            return symbol.get().nameEquals(AGENT_EXECUTOR) && symbol.get().getModule()
                    .map(module -> A2A_MODULE.equals(module.id().moduleName())).orElse(false);
        }
        return reference.typeName() instanceof QualifiedNameReferenceNode qualified
                && AGENT_EXECUTOR.equals(qualified.identifier().text());
    }
}
