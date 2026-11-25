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
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.SyntaxInfo;
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.flowmodelgenerator.core.model.NodeKind;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.modelgenerator.commons.IdentifierUtil;
import io.ballerina.projects.Document;
import org.ballerinalang.util.diagnostic.DiagnosticErrorCode;
import org.eclipse.lsp4j.Diagnostic;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

/**
 * Handles diagnostic requests for identifier validation in the expression editor.
 *
 * @see DiagnosticsRequest
 * @since 1.0.0
 */
public class IdentifierDiagnosticsRequest extends DiagnosticsRequest {

    private static final String REDECLARED_SYMBOL = "redeclared symbol '%s'";
    private static final DiagnosticErrorCode REDECLARED_SYMBOL_ERROR_CODE = DiagnosticErrorCode.REDECLARED_SYMBOL;

    private static final String INVALID_RESERVED_KEYWORD = "`%s` is a reserved keyword";
    private static final DiagnosticErrorCode INVALID_RESERVED_KEYWORD_ERROR_CODE = DiagnosticErrorCode.INVALID_TOKEN;

    private static final List<NodeKind> SOURCE_FORM_NODE_KINDS = List.of(NodeKind.CONFIG_VARIABLE);

    public IdentifierDiagnosticsRequest(ExpressionEditorContext context) {
        super(context);
    }

    @Override
    protected Node getParsedNode(String text) {
        return NodeParser.parseBindingPattern(text);
    }

    @Override
    protected Set<Diagnostic> getSyntaxDiagnostics(ExpressionEditorContext context) {
        String expression = context.info().expression();
        if (!Property.ValueType.IDENTIFIER.equals(context.getProperty().propertyType().fieldType())) {
            return super.getSyntaxDiagnostics(context);
        }

        if (requiresSourceForm(context)) {
            // Check if the identifier is a non-keyword
            if (SyntaxInfo.isKeyword(expression)) {
                String message = INVALID_RESERVED_KEYWORD.formatted(expression);
                return Set.of(CommonUtils.createDiagnostic(message, context.getExpressionLineRange(),
                        INVALID_RESERVED_KEYWORD_ERROR_CODE));
            }
            return super.getSyntaxDiagnostics(context);
        }

        // A plain name (issue-number, type) is accepted: it is escaped when the source is written, so only the
        // escaped form has to parse. A blank name still reports the missing identifier. The diagnostics come from
        // the escaped text, so their ranges point into `issue\-number` rather than into what was typed; that is
        // fine while they are shown for the whole field.
        return getSyntaxDiagnostics(IdentifierUtil.escapeIfNeeded(expression));
    }

    /**
     * Names that are written to the source as typed, without escaping, must already be valid source. Configurable
     * names are used as Config.toml keys, which are written from the source name, so a plain name such as
     * {@code issue-number} is not accepted for them. The other such names (a test function's name, a new
     * listener's name) are marked by the request, since their forms have no node kind.
     */
    private static boolean requiresSourceForm(ExpressionEditorContext context) {
        return context.isNodeKind(SOURCE_FORM_NODE_KINDS) || context.requiresSourceFormName();
    }

    @Override
    protected Set<Diagnostic> getSemanticDiagnostics(ExpressionEditorContext context) {
        ExpressionEditorContext.Property property = context.getProperty();
        String scope = property.propertyType().scope();
        String value = property.value();

        // Skip semantic checks for object scope
        if (Property.OBJECT_SCOPE.equals(scope)) {
            return Set.of();
        }

        // Obtain the semantic model
        Optional<SemanticModel> semanticModel = context.workspaceManager().semanticModel(context.filePath());
        if (semanticModel.isEmpty()) {
            return Set.of();
        }

        Optional<Document> document = context.workspaceManager().document(context.filePath());

        // Obtain the symbol stream based on the scope of the identifier
        Stream<Symbol> symbolStream;
        if (Property.GLOBAL_SCOPE.equals(scope)) {
            symbolStream = globalSymbols(semanticModel.get(), document);
        } else {
            if (document.isEmpty()) {
                return Set.of();
            }
            symbolStream = semanticModel.get()
                    .visibleSymbols(document.get(), context.info().startLine()).parallelStream()
                    .filter(symbol -> symbol.kind() == SymbolKind.VARIABLE
                            || symbol.kind() == SymbolKind.WORKER);
        }

        // Check for redeclared symbols. The property's original value is only excluded when the
        // property is bound to an existing declaration (edit/rename flow) — there, the matching
        // symbol is the node's own variable. For a new node no declaration exists yet, so any
        // visible symbol with the same name (including one matching the generated default) is a
        // genuine duplicate and must be reported.
        Set<Diagnostic> diagnostics = new HashSet<>();
        // Names are compared in plain form, so `issue-number` matches a declared `issue\-number`
        String inputValue = context.info().expression();
        String plainInput = IdentifierUtil.toPlainName(inputValue.strip());
        String plainValue = value == null ? null : IdentifierUtil.toPlainName(value.strip());
        boolean existingDeclaration = property.hasExistingDeclaration();
        boolean redeclaredSymbol = symbolStream.anyMatch(symbol -> hasPlainName(symbol, plainInput)
                && !(existingDeclaration && hasPlainName(symbol, plainValue)));
        if (redeclaredSymbol) {
            String message = String.format(REDECLARED_SYMBOL, inputValue);
            diagnostics.add(CommonUtils.createDiagnostic(message, context.getExpressionLineRange(),
                    REDECLARED_SYMBOL_ERROR_CODE));
        }
        return diagnostics;
    }

    private static boolean hasPlainName(Symbol symbol, String plainName) {
        return plainName != null && symbol.getName().map(IdentifierUtil::toPlainName).filter(plainName::equals)
                .isPresent();
    }

    private Stream<Symbol> globalSymbols(SemanticModel semanticModel, Optional<Document> document) {
        if (document.isPresent() && document.get().module().testDocumentIds().contains(document.get().documentId())) {
            // Querying at the module root avoids exposing function-local symbols while still including
            // declarations from the testable package, which moduleSymbols() omits.
            return semanticModel.visibleSymbols(document.get(), document.get().syntaxTree().rootNode().lineRange()
                            .endLine())
                    .parallelStream()
                    .filter(symbol -> symbol.kind() != SymbolKind.MODULE);
        }
        return semanticModel.moduleSymbols().stream().filter(symbol -> symbol.kind() != SymbolKind.MODULE);
    }
}
