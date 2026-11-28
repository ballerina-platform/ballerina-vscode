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

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.Qualifiable;
import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.SymbolKind;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.flowmodelgenerator.core.model.Property;
import io.ballerina.projects.Document;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.common.utils.PositionUtil;
import org.eclipse.lsp4j.CompletionContext;
import org.eclipse.lsp4j.CompletionItem;
import org.eclipse.lsp4j.CompletionItemKind;
import org.eclipse.lsp4j.CompletionList;
import org.eclipse.lsp4j.CompletionParams;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.TextDocumentIdentifier;
import org.eclipse.lsp4j.jsonrpc.messages.Either;
import org.eclipse.lsp4j.services.TextDocumentService;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

/**
 * Represents a request for code completion in the expression editor. This class extends
 * DebouncedExpressionEditorRequest to handle completion requests with debouncing functionality.
 *
 * @since 1.0.0
 */
public class CompletionRequest extends DebouncedExpressionEditorRequest<Either<List<CompletionItem>, CompletionList>> {

    private final CompletionContext completionContext;
    private final TextDocumentService textDocumentService;
    private static final String RESERVED_VARIABLE_NAME = "__reserved__";
    private static final Gson GSON = new Gson();
    // Sort prefixes: the flow's own variables, then its parameters, then module-level ones, then everything else.
    private static final String LOCAL_RANK = "1";
    private static final String PARAMETER_RANK = "2";
    private static final String MODULE_RANK = "3";
    private static final String OTHER_RANK = "4";
    private static final Set<SymbolKind> VALUE_KINDS =
            Set.of(SymbolKind.VARIABLE, SymbolKind.PARAMETER, SymbolKind.PATH_PARAMETER);
    private static final Set<Qualifier> UNASSIGNABLE =
            Set.of(Qualifier.FINAL, Qualifier.CONFIGURABLE, Qualifier.LISTENER);

    public CompletionRequest(ExpressionEditorContext context, CompletionContext completionContext,
                             TextDocumentService textDocumentService) {
        super(context);
        this.completionContext = completionContext;
        this.textDocumentService = textDocumentService;
    }

    @Override
    public Either<List<CompletionItem>, CompletionList> getResponse(ExpressionEditorContext context) {
        Property.ValueType valueType = context.getProperty().propertyType().fieldType();

        // TODO: Added a special case for expressions used within the data mapper, as inputs are not provided through
        //  the traditional method.
        boolean generatedFunctionDefinition = false;
        if (Property.ValueType.DATA_MAPPING_EXPRESSION.equals(valueType)) {
            JsonElement lineRangeJson = context.info().codedata().get("lineRange");
            LineRange lineRange = GSON.fromJson(lineRangeJson, LineRange.class);

            if (lineRange != null) {
                NonTerminalNode node = CommonUtil.findNode(PositionUtil.toRange(lineRange),
                        context.documentContext().document().syntaxTree());
                if (node instanceof FunctionDefinitionNode functionDefinitionNode) {
                    context.generateFunctionDefinition(functionDefinitionNode.functionSignature().toString());
                    generatedFunctionDefinition = true;
                }
            }
        }
        if (!generatedFunctionDefinition) {
            context.generateStatement("any|error __reserved__ = ", ";%s".formatted(System.lineSeparator()));
        }

        Position position = context.getCursorPosition();
        TextDocumentIdentifier identifier = new TextDocumentIdentifier(context.fileUri());
        CompletionParams params = new CompletionParams(identifier, position, completionContext);

        // Get completions from language server
        CompletableFuture<Either<List<CompletionItem>, CompletionList>> completableFuture =
                textDocumentService.completion(params);
        Either<List<CompletionItem>, CompletionList> completions = completableFuture.join();
        List<CompletionItem> items = items(completions);
        Scope scope = scope(context, position);

        if (Property.ValueType.LV_EXPRESSION.equals(valueType)) {
            items.removeIf(item -> !isAssignable(item, scope));
        }
        // TODO: Remove this once https://github.com/ballerina-platform/ballerina-lang/issues/43706 is fixed
        items.removeIf(item -> RESERVED_VARIABLE_NAME.equals(item.getLabel()));
        items.forEach(item -> item.setSortText(
                rank(item, scope) + Objects.requireNonNullElse(item.getSortText(), item.getLabel())));
        // A field named like a keyword ('type, 'from) comes without its quote, and `x.type` does not compile.
        items.stream().filter(item -> item.getKind() == CompletionItemKind.Field).forEach(item -> item.setInsertText(
                CommonUtil.escapeReservedKeyword(Objects.requireNonNullElse(item.getInsertText(), item.getLabel()))));
        return completions;
    }

    private static List<CompletionItem> items(Either<List<CompletionItem>, CompletionList> completions) {
        if (completions.getLeft() != null) {
            return completions.getLeft();
        }
        if (completions.getRight() != null && completions.getRight().getItems() != null) {
            return completions.getRight().getItems();
        }
        return new ArrayList<>();
    }

    // The values the cursor can reach by name, and which of those are declared at module level.
    private record Scope(Map<String, Symbol> visible, Set<Symbol> moduleLevel) {
    }

    private static Scope scope(ExpressionEditorContext context, Position position) {
        Optional<SemanticModel> model = context.workspaceManager().semanticModel(context.filePath());
        Optional<Document> document = context.workspaceManager().document(context.filePath());
        if (model.isEmpty() || document.isEmpty()) {
            return new Scope(Map.of(), Set.of());
        }
        Set<Symbol> moduleLevel = model.get().moduleSymbols().stream()
                .filter(symbol -> symbol.kind() == SymbolKind.VARIABLE)
                .collect(Collectors.toSet());
        // A local that shadows a module-level variable is the one the name reaches.
        Map<String, Symbol> visible = model.get()
                .visibleSymbols(document.get(), LinePosition.from(position.getLine(), position.getCharacter()))
                .stream()
                .filter(symbol -> VALUE_KINDS.contains(symbol.kind()) && symbol.getName().isPresent())
                .collect(Collectors.toMap(symbol -> symbol.getName().get(), symbol -> symbol,
                        (first, second) -> moduleLevel.contains(first) ? second : first));
        return new Scope(visible, moduleLevel);
    }

    private static Optional<Symbol> valueSymbol(CompletionItem item, Scope scope) {
        return item.getKind() == CompletionItemKind.Variable
                ? Optional.ofNullable(scope.visible().get(item.getLabel()))
                : Optional.empty();
    }

    private static String rank(CompletionItem item, Scope scope) {
        return valueSymbol(item, scope).map(symbol -> {
            if (symbol.kind() != SymbolKind.VARIABLE) {
                return PARAMETER_RANK;
            }
            if (!scope.moduleLevel().contains(symbol)) {
                return LOCAL_RANK;
            }
            return hasQualifier(symbol, Qualifier.LISTENER) ? OTHER_RANK : MODULE_RANK;
        }).orElse(OTHER_RANK);
    }

    // A parameter, configurable, listener or final variable cannot be assigned to.
    private static boolean isAssignable(CompletionItem item, Scope scope) {
        if (item.getKind() == CompletionItemKind.Field) {
            return true;
        }
        return item.getKind() == CompletionItemKind.Variable && valueSymbol(item, scope)
                .map(symbol -> symbol.kind() == SymbolKind.VARIABLE
                        && UNASSIGNABLE.stream().noneMatch(qualifier -> hasQualifier(symbol, qualifier)))
                .orElse(true);
    }

    private static boolean hasQualifier(Symbol symbol, Qualifier qualifier) {
        return symbol instanceof Qualifiable qualifiable && qualifiable.qualifiers().contains(qualifier);
    }

    @Override
    public String getKey() {
        return "completions";
    }

    @Override
    public long getDelay() {
        return 150;
    }
}
