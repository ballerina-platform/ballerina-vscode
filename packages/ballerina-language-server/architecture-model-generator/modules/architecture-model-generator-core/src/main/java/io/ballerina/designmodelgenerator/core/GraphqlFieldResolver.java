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
import io.ballerina.compiler.api.symbols.MethodSymbol;
import io.ballerina.compiler.api.symbols.ParameterSymbol;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.designmodelgenerator.core.model.GraphqlField;
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

    private GraphqlFieldResolver() {
    }

    /**
     * Returns the root operation field the given GraphQL service function exposes, or {@code null} if it exposes
     * none directly (see {@link GraphqlTypeMapper#fieldName}).
     */
    static GraphqlField resolve(FunctionDefinitionNode functionNode, MethodSymbol methodSymbol) {
        String fieldName = GraphqlTypeMapper.fieldName(methodSymbol);
        if (fieldName == null) {
            return null;
        }
        Map<String, String> defaults = GraphqlTypeMapper.getDefaultValues(functionNode.functionSignature());
        List<GraphqlField.Argument> args = new ArrayList<>();
        for (ParameterSymbol param : methodSymbol.typeDescriptor().params().orElse(List.of())) {
            String type = GraphqlTypeMapper.toArgumentSdl(param);
            if (type == null) {
                continue;
            }
            String name = param.getName().map(GraphqlTypeMapper::unescape).orElse("");
            args.add(new GraphqlField.Argument(name, type, defaults.get(name)));
        }
        return new GraphqlField(fieldName, args, GraphqlTypeMapper.toFieldTypeSdl(methodSymbol),
                methodSymbol.documentation().flatMap(Documentation::description).orElse(null),
                methodSymbol.deprecated());
    }
}
