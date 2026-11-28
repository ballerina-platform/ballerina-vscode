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

package io.ballerina.flowmodelgenerator.core.model.node;

import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.model.NodeBuilder;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.flowmodelgenerator.core.model.SourceBuilder;
import io.ballerina.projects.Document;
import org.eclipse.lsp4j.TextEdit;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Represents the properties of a return node.
 *
 * @since 1.0.0
 */
public class ReturnBuilder extends NodeBuilder {

    public static final String LABEL = "Return";
    public static final String DESCRIPTION = "Value of '%s'";
    public static final String RETURN_EXPRESSION_DOC = "Return value";

    @Override
    public void setConcreteConstData() {
        metadata().label(LABEL);
        codedata().node(NodeKind.RETURN);
    }

    @Override
    public Map<Path, List<TextEdit>> toSource(SourceBuilder sourceBuilder) {
        sourceBuilder.token().keyword(SyntaxKind.RETURN_KEYWORD);
        Optional<Property> property = sourceBuilder.getProperty(Property.EXPRESSION_KEY);
        property.ifPresent(value -> sourceBuilder.token()
                .whiteSpace()
                .expression(value));
        sourceBuilder.token().endOfStatement();
        return sourceBuilder.textEdit().build();
    }

    @Override
    public void setConcreteTemplateData(TemplateContext context) {
        properties().expressionOrAction(null, RETURN_EXPRESSION_DOC, true, returnTypeAt(context).orElse(null));
    }

    // Anonymous functions and workers declare their own return type, so the search stops at them.
    public static Optional<String> enclosingReturnType(Node node) {
        for (Node current = node.parent(); current != null; current = current.parent()) {
            if (current instanceof FunctionDefinitionNode function) {
                return function.functionSignature().returnTypeDesc()
                        .map(returnType -> returnType.type().toSourceCode().strip());
            }
            if (current.kind() == SyntaxKind.EXPLICIT_ANONYMOUS_FUNCTION_EXPRESSION
                    || current.kind() == SyntaxKind.NAMED_WORKER_DECLARATION) {
                return Optional.empty();
            }
        }
        return Optional.empty();
    }

    private static Optional<String> returnTypeAt(TemplateContext context) {
        try {
            context.workspaceManager().loadProject(context.filePath());
            Document document = context.workspaceManager().document(context.filePath()).orElseThrow();
            int offset = document.textDocument().textPositionFrom(context.position());
            ModulePartNode root = document.syntaxTree().rootNode();
            return enclosingReturnType(root.findToken(offset));
        } catch (Throwable e) {
            return Optional.empty();
        }
    }
}
