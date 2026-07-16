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

package io.ballerina.flowmodelgenerator.core.expressioneditor.services;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.tools.diagnostics.DiagnosticSeverity;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.util.diagnostic.DiagnosticErrorCode;
import org.eclipse.lsp4j.Diagnostic;

import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Handles diagnostic requests for expression validation in the expression editor.
 *
 * @see DiagnosticsRequest
 * @since 1.0.0
 */
public class ExpressionDiagnosticsRequest extends DiagnosticsRequest {

    // Artifacts of the synthetic `__reserved__` wrapper at a class-field position, not real expression errors.
    private static final Set<String> IGNORED_DIAGNOSTIC_CODES = Set.of(
            DiagnosticErrorCode.CANNOT_INFER_OBJECT_TYPE_FROM_LHS.diagnosticId(),
            DiagnosticErrorCode.INVALID_NON_PRIVATE_MUTABLE_FIELD_IN_ISOLATED_OBJECT.diagnosticId());

    public ExpressionDiagnosticsRequest(ExpressionEditorContext context) {
        super(context);
    }

    @Override
    protected Node getParsedNode(String text) {
        return NodeParser.parseExpression(text);
    }

    @Override
    protected Set<Diagnostic> getSemanticDiagnostics(ExpressionEditorContext context) {
        LineRange lineRange =
                context.generateStatement("any|error __reserved__ = ", ";%s".formatted(System.lineSeparator()));
        Optional<SemanticModel> semanticModel =
                context.workspaceManager().semanticModel(context.filePath());
        return semanticModel.map(model -> model.diagnostics(lineRange).stream()
                .filter(diagnostic -> diagnostic.diagnosticInfo().severity() == DiagnosticSeverity.ERROR
                        && !IGNORED_DIAGNOSTIC_CODES.contains(diagnostic.diagnosticInfo().code()))
                .map(CommonUtils::transformBallerinaDiagnostic)
                .collect(Collectors.toSet())).orElseGet(Set::of);
    }
}
