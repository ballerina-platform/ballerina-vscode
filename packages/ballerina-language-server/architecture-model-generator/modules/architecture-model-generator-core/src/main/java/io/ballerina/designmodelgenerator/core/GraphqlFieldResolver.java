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

package io.ballerina.designmodelgenerator.core;

import io.ballerina.compiler.api.symbols.Documentation;
import io.ballerina.compiler.api.symbols.FunctionTypeSymbol;
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.designmodelgenerator.core.model.GraphqlField;
import io.ballerina.flowmodelgenerator.core.utils.TypeUtils;
import io.ballerina.modelgenerator.commons.GraphqlTypeMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Derives the root operation field a function of a GraphQL service exposes. Types are mapped by
 * {@link GraphqlTypeMapper}, so the design model and the GraphQL type model agree on the notation.
 *
 * @since 1.7.0
 */
final class GraphqlFieldResolver {

    private static final String GET_ACCESSOR = "get";

    private GraphqlFieldResolver() {
    }

    /**
     * Returns the root operation field the given GraphQL service function exposes, or {@code null} if it exposes
     * none directly. Hierarchical resource paths (e.g. {@code get profile/name}) contribute to a nested type rather
     * than a root operation field, so they are left unresolved.
     */
    static GraphqlField resolve(FunctionDefinitionNode functionNode, MethodSymbol methodSymbol) {
        // The accessor of a resource function, or the name of any other function.
        String functionName = functionNode.functionName().text().trim();
        boolean isResource = functionNode.kind() == SyntaxKind.RESOURCE_ACCESSOR_DEFINITION;
        boolean isSubscription = isResource && GraphqlTypeMapper.isSubscriptionAccessor(functionName);
        String fieldName;
        if (isResource) {
            NodeList<Node> path = functionNode.relativeResourcePath();
            if (path.size() != 1 || path.get(0).kind() != SyntaxKind.IDENTIFIER_TOKEN
                    || !(GET_ACCESSOR.equals(functionName) || isSubscription)) {
                return null;
            }
            fieldName = GraphqlTypeMapper.unescape(path.get(0).toSourceCode().trim());
        } else if (functionNode.qualifierList().stream()
                .anyMatch(qualifier -> qualifier.kind() == SyntaxKind.REMOTE_KEYWORD)) {
            fieldName = GraphqlTypeMapper.unescape(functionName);
        } else {
            return null;
        }

        FunctionTypeSymbol functionType = methodSymbol.typeDescriptor();
        Map<String, String> defaults = GraphqlTypeMapper.getDefaultValues(functionNode.functionSignature());

        List<GraphqlField.Argument> args = new ArrayList<>();
        for (ParameterSymbol param : functionType.params().orElse(List.of())) {
            if (GraphqlTypeMapper.isInjectedParam(param.typeDescriptor())) {
                continue;
            }
            String name = param.getName().map(GraphqlTypeMapper::unescape).orElse("");
            boolean isId = param.annotAttachments().stream().anyMatch(TypeUtils::isGraphqlIdAnnotation);
            args.add(new GraphqlField.Argument(name, GraphqlTypeMapper.toSdl(param.typeDescriptor(), isId),
                    defaults.get(name)));
        }

        boolean isIdReturn = functionType.returnTypeAnnotations()
                .map(annotations -> annotations.annotAttachments().stream()
                        .anyMatch(TypeUtils::isGraphqlIdAnnotation))
                .orElse(false);
        String type = functionType.returnTypeDescriptor()
                .map(returnType -> GraphqlTypeMapper.toSdl(
                        isSubscription ? GraphqlTypeMapper.unwrapStream(returnType) : returnType, isIdReturn))
                .orElse(null);
        return new GraphqlField(fieldName, args, type,
                methodSymbol.documentation().flatMap(Documentation::description).orElse(null),
                methodSymbol.deprecated());
    }
}
