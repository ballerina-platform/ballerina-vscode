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

package io.ballerina.servicemodelgenerator.extension.builder.service.agent;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.Types;
import io.ballerina.compiler.api.symbols.FunctionTypeSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.ModuleInfo;
import io.ballerina.modelgenerator.commons.TypeQualifierAllocator;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * How the agent's {@code run} is declared, read from the agent variable's type.
 *
 * @param remote     whether {@code run} is a remote method; {@code null} when the agent could not be resolved
 * @param answer     what {@code run} returns
 * @param answerType the answer's type as source text, without its error members
 * @param json       whether the answer is a subtype of {@code json}
 * @param imports    the modules {@code answerType} names, as {@code prefix -> org/module}
 * @since 1.9.0
 */
public record AgentRunShape(Boolean remote, Answer answer, String answerType, boolean json,
                            Map<String, String> imports) {

    public static final AgentRunShape UNKNOWN = new AgentRunShape(null, Answer.BOUND, AgentRunShape.TEXT, true,
            Map.of());

    private static final String RUN = "run";
    private static final String TEXT = "string";

    /** What {@code run} returns, besides an error. */
    public enum Answer {
        /** A dependently typed {@code run} ({@code ai:Agent}), which returns the type its caller expects. */
        BOUND,
        /** A fixed {@code string}. */
        TEXT,
        /** A fixed type other than {@code string}, as a typed agent definition declares. */
        VALUE
    }

    public static AgentRunShape of(SemanticModel semanticModel, ModuleInfo currentModule, String agentVarName) {
        if (semanticModel == null || agentVarName == null) {
            return UNKNOWN;
        }
        return semanticModel.moduleSymbols().stream()
                .filter(symbol -> symbol.kind() == SymbolKind.VARIABLE
                        && symbol.getName().filter(agentVarName::equals).isPresent())
                .findFirst()
                .flatMap(AgentRunShape::runMethod)
                .map(run -> shapeOf(semanticModel, currentModule, run))
                .orElse(UNKNOWN);
    }

    /** The answer's modules as import references: {@code org/module}, or {@code org/module as prefix}. */
    public List<String> importRefs() {
        return imports.entrySet().stream()
                .map(entry -> entry.getValue().matches(".*[/.]" + entry.getKey()) ? entry.getValue()
                        : entry.getValue() + " as " + entry.getKey())
                .toList();
    }

    private static Optional<MethodSymbol> runMethod(Symbol agent) {
        TypeSymbol type = ((VariableSymbol) agent).typeDescriptor();
        while (type instanceof TypeReferenceTypeSymbol reference) {
            type = reference.typeDescriptor();
        }
        return type instanceof ObjectTypeSymbol object ? Optional.ofNullable(object.methods().get(RUN))
                : Optional.empty();
    }

    private static AgentRunShape shapeOf(SemanticModel semanticModel, ModuleInfo currentModule, MethodSymbol run) {
        boolean remote = run.qualifiers().contains(Qualifier.REMOTE);
        FunctionTypeSymbol function = run.typeDescriptor();
        boolean dependentlyTyped = function.params().orElse(List.of()).stream()
                .map(ParameterSymbol::typeDescriptor)
                .anyMatch(type -> type.typeKind() == TypeDescKind.TYPEDESC);
        Optional<TypeSymbol> returned = function.returnTypeDescriptor();
        if (dependentlyTyped || returned.isEmpty()) {
            return new AgentRunShape(remote, Answer.BOUND, TEXT, true, Map.of());
        }
        Types types = semanticModel.types();
        List<TypeSymbol> answers = (returned.get() instanceof UnionTypeSymbol union ? union.memberTypeDescriptors()
                : List.of(returned.get())).stream()
                .filter(member -> !member.subtypeOf(types.ERROR))
                .toList();
        if (answers.stream().allMatch(member -> member.subtypeOf(types.STRING))) {
            return new AgentRunShape(remote, Answer.TEXT, TEXT, true, Map.of());
        }
        TypeQualifierAllocator allocator = new TypeQualifierAllocator();
        String answerType = CommonUtils.getTypeSignature(semanticModel, returned.get(), true, currentModule,
                allocator);
        return new AgentRunShape(remote, Answer.VALUE, answerType,
                answers.stream().allMatch(member -> member.subtypeOf(types.JSON)), allocator.imports());
    }
}
