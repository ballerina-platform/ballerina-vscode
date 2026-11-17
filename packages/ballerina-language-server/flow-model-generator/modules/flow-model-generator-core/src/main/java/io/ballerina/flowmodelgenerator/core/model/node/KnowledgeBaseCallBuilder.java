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

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.FlowNode;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.flowmodelgenerator.core.utils.FlowNodeUtil;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static io.ballerina.flowmodelgenerator.core.model.Property.CHECK_ERROR_KEY;
import static io.ballerina.flowmodelgenerator.core.model.Property.CONNECTION_KEY;
import static io.ballerina.flowmodelgenerator.core.model.Property.TYPE_KEY;
import static io.ballerina.flowmodelgenerator.core.model.Property.VARIABLE_KEY;

/**
 * Represents a knowledge base call node.
 *
 * @since 1.1.0
 */
public class KnowledgeBaseCallBuilder extends FunctionCall {

    private static final String RETRIEVE_METHOD_NAME = "retrieve";

    @Override
    protected NodeKind getFunctionNodeKind() {
        return NodeKind.KNOWLEDGE_BASE_CALL;
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        sourceBuilder.newVariable();
        FlowNode flowNode = sourceBuilder.flowNode;
        if (FlowNodeUtil.hasCheckKeyFlagSet(flowNode)) {
            sourceBuilder.token().keyword(SyntaxKind.CHECK_KEYWORD);
        }
        Optional<Property> connection = flowNode.getProperty(CONNECTION_KEY);
        if (connection.isEmpty()) {
            throw new IllegalStateException("connection must be defined for a knowledge base");
        }
        String methodName = flowNode.metadata().label();
        SourceBuilder builder = sourceBuilder.token().name(connection.get().toSourceCode())
                .keyword(SyntaxKind.DOT_TOKEN)
                .name(methodName).stepOut()
                .functionParameters(flowNode, Set.of(CONNECTION_KEY, VARIABLE_KEY, TYPE_KEY, CHECK_ERROR_KEY))
                .textEdit();
        if (RETRIEVE_METHOD_NAME.equals(methodName)) {
            // The statement names only the connection variable and the result type, so the type's modules are the
            // only imports it needs; the connector's own module would be unused when the type comes from another.
            builder.acceptResultTypeImports();
        }
        return builder.build();
    }
}
