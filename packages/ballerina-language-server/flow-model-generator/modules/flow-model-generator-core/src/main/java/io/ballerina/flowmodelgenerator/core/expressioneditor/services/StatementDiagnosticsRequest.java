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

package io.ballerina.flowmodelgenerator.core.expressioneditor.services;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.tools.diagnostics.DiagnosticSeverity;
import io.ballerina.tools.text.LineRange;
import org.eclipse.lsp4j.Diagnostic;

import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Diagnostics for a field that holds a whole Ballerina statement, which is checked in place as written.
 *
 * @since 1.7.0
 */
public class StatementDiagnosticsRequest extends DiagnosticsRequest {

    public StatementDiagnosticsRequest(ExpressionEditorContext context) {
        super(context);
    }

    @Override
    protected Node getParsedNode(String text) {
        return NodeParser.parseStatement(text);
    }

    @Override
    protected Set<Diagnostic> getSemanticDiagnostics(ExpressionEditorContext context) {
        LineRange lineRange = context.generateStatement("", System.lineSeparator());
        Optional<SemanticModel> semanticModel = context.workspaceManager().semanticModel(context.filePath());
        return semanticModel.map(model -> model.diagnostics(lineRange).stream()
                .filter(diagnostic -> diagnostic.diagnosticInfo().severity() == DiagnosticSeverity.ERROR)
                .map(CommonUtils::transformBallerinaDiagnostic)
                .collect(Collectors.toSet())).orElseGet(Set::of);
    }
}
