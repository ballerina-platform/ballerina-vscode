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
import io.ballerina.compiler.api.Types;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.flowmodelgenerator.core.TypesGenerator;
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.projects.Document;
import io.ballerina.tools.diagnostics.DiagnosticSeverity;
import org.ballerinalang.langserver.commons.BallerinaCompilerApi;
import org.ballerinalang.util.diagnostic.DiagnosticErrorCode;
import org.eclipse.lsp4j.Diagnostic;

import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

/**
 * Handles diagnostic requests for type descriptor validation in the expression editor.
 *
 * @see DiagnosticsRequest
 * @since 1.0.0
 */
public class TypeDiagnosticRequest extends DiagnosticsRequest {

    private static final String UNDEFINED_TYPE = "undefined type '%s'";
    private static final String INVALID_SUBTYPE = "expected a subtype of '%s', but found '%s'";
    private static final DiagnosticErrorCode UNKNOWN_TYPE_ERROR_CODE = DiagnosticErrorCode.UNKNOWN_TYPE;
    private static final String VAR_KEYWORD = "var";
    private static final String NOT_A_TYPEDESC_VALUE =
            "'%s' cannot be passed as a typedesc: define a type for it and use the type's name";

    public TypeDiagnosticRequest(ExpressionEditorContext context) {
        super(context);
    }

    @Override
    protected Node getParsedNode(String text) {
        return NodeParser.parseTypeDescriptor(getTrimmedOutput(text));
    }

    @Override
    protected Set<Diagnostic> getSyntaxDiagnostics(ExpressionEditorContext context) {
        String inputExpression = getTrimmedOutput(context.info().expression());
        // Skip validation for 'var' as it is a type inference keyword
        if (isVarType(inputExpression)) {
            return Set.of();
        }
        return super.getSyntaxDiagnostics(context);
    }

    @Override
    protected Set<Diagnostic> getSemanticDiagnostics(ExpressionEditorContext context) {
        Optional<SemanticModel> semanticModel =
                context.workspaceManager().semanticModel(context.filePath());
        Optional<Document> document = context.workspaceManager().document(context.filePath());
        if (semanticModel.isEmpty() || document.isEmpty()) {
            return Set.of();
        }
        Set<Diagnostic> diagnostics = new HashSet<>();
        String inputExpression = getTrimmedOutput(context.info().expression());

        // Skip validation for 'var' as it is a type inference keyword
        if (isVarType(inputExpression)) {
            return diagnostics;
        }

        // A typedesc value is written as the type's name: a type descriptor such as map<string> does not parse there
        String typedescInput = context.info().expression().trim();
        if (context.getProperty().propertyType().typedesc() != null && !typedescInput.isEmpty()
                && !isTypedescValue(typedescInput)) {
            diagnostics.add(CommonUtils.createDiagnostic(String.format(NOT_A_TYPEDESC_VALUE, typedescInput),
                    context.getExpressionLineRange(), "", DiagnosticSeverity.ERROR));
            return diagnostics;
        }

        // Check for undefined types
        Types types = semanticModel.get().types();
        Optional<TypeSymbol> typeSymbol;
        try {
            typeSymbol = BallerinaCompilerApi.getInstance().getType(types, document.get(), inputExpression);
        } catch (NullPointerException e) {
            // TODO: Tracked with https://github.com/ballerina-platform/ballerina-lang/issues/44347
            // Handle cases where the type descriptor doesn't have a parent context
            // (e.g., anonymous record types like "record {}")
            return diagnostics;
        }
        if (typeSymbol.isEmpty()) {
            String message = String.format(UNDEFINED_TYPE, inputExpression);
            diagnostics.add(CommonUtils.createDiagnostic(message, context.getExpressionLineRange(),
                    UNKNOWN_TYPE_ERROR_CODE));
            return diagnostics;
        }

        // Check if the type is a subtype of the type constraint
        String ballerinaType = context.getProperty().propertyType().ballerinaType();
        if (ballerinaType == null) {
            return diagnostics;
        }
        Optional<TypeSymbol> typeConstraintTypeSymbol;
        try {
            typeConstraintTypeSymbol = BallerinaCompilerApi.getInstance().getType(types, document.get(), ballerinaType);
        } catch (NullPointerException e) {
            // The constraint can be an anonymous record type too (a typedesc's, such as record {|anydata...;|}),
            // which getType cannot resolve either.
            // Tracked with https://github.com/ballerina-platform/ballerina-lang/issues/44347
            return diagnostics;
        }
        if (typeConstraintTypeSymbol.isPresent()) {
            if (!typeSymbol.get().subtypeOf(typeConstraintTypeSymbol.get())) {
                String message = String.format(INVALID_SUBTYPE, ballerinaType, inputExpression);
                diagnostics.add(CommonUtils.createDiagnostic(message, context.getExpressionLineRange(),
                        "", DiagnosticSeverity.ERROR));
            }
        }
        return diagnostics;
    }

    /**
     * Whether the type can be passed as a typedesc value: a type reference, qualified or not, or a builtin type whose
     * name is a typedesc value.
     */
    private static boolean isTypedescValue(String type) {
        if (TypesGenerator.TYPEDESC_VALUE_BUILTINS.contains(type)) {
            return true;
        }
        SyntaxKind kind = NodeParser.parseTypeDescriptor(type).kind();
        return kind == SyntaxKind.SIMPLE_NAME_REFERENCE || kind == SyntaxKind.QUALIFIED_NAME_REFERENCE;
    }

    private static boolean isVarType(String inputExpression) {
        return inputExpression.trim().equals(VAR_KEYWORD);
    }

    private String getTrimmedOutput(String text) {
        // TODO: The following is a temporary fix for the invalid diagnostic produced for the readonly flag in the
        //  type descriptor. Ideally, this should be a flag in the type editor (as it is not part of the type
        //  descriptor). Tracked with: https://github.com/wso2/product-ballerina-integrator/issues/150
        // If the input starts with "readonly ", then obtain the string after this prefix
        String trimmedInput = text.trim();
        if (trimmedInput.startsWith("readonly ")) {
            return trimmedInput.substring(9);
        }
        return text;
    }
}
