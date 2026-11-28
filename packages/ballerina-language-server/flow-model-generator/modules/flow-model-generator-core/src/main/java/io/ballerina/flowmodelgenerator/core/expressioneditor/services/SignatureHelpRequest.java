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

import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.flowmodelgenerator.core.expressioneditor.ExpressionEditorContext;
import io.ballerina.projects.Document;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.TextRange;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.SignatureHelp;
import org.eclipse.lsp4j.SignatureHelpContext;
import org.eclipse.lsp4j.SignatureHelpParams;
import org.eclipse.lsp4j.TextDocumentIdentifier;
import org.eclipse.lsp4j.services.TextDocumentService;

import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

/**
 * Represents a request for signature help in the expression editor. This class extends DebouncedExpressionEditorRequest
 * to handle signature help requests with debouncing functionality.
 *
 * @since 1.0.0
 */
public class SignatureHelpRequest extends DebouncedExpressionEditorRequest<SignatureHelp> {

    private static final Set<SyntaxKind> CALL_KINDS = Set.of(SyntaxKind.FUNCTION_CALL, SyntaxKind.METHOD_CALL,
            SyntaxKind.REMOTE_METHOD_CALL_ACTION, SyntaxKind.CLIENT_RESOURCE_ACCESS_ACTION,
            SyntaxKind.IMPLICIT_NEW_EXPRESSION, SyntaxKind.EXPLICIT_NEW_EXPRESSION);

    private final SignatureHelpContext signatureHelpContext;
    private final TextDocumentService textDocumentService;

    public SignatureHelpRequest(ExpressionEditorContext context,
                                SignatureHelpContext signatureHelpContext,
                                TextDocumentService textDocumentService) {
        super(context);
        this.signatureHelpContext = signatureHelpContext;
        this.textDocumentService = textDocumentService;
    }

    @Override
    public SignatureHelp getResponse(ExpressionEditorContext context) {
        context.generateStatement("any|error __reserved__ = ", ";%s".formatted(System.lineSeparator()));
        Position position = context.getCursorPosition();
        // The shared provider also answers on the function name and after the closing parenthesis.
        if (!isWithinArguments(context, position)) {
            return null;
        }
        TextDocumentIdentifier identifier = new TextDocumentIdentifier(context.fileUri());
        SignatureHelpParams params = new SignatureHelpParams(identifier, position, signatureHelpContext);
        CompletableFuture<SignatureHelp> future = textDocumentService.signatureHelp(params);
        return future.join();
    }

    private static boolean isWithinArguments(ExpressionEditorContext context, Position position) {
        Optional<Document> document = context.workspaceManager().document(context.filePath());
        if (document.isEmpty()) {
            return true;
        }
        int offset = document.get().textDocument()
                .textPositionFrom(LinePosition.from(position.getLine(), position.getCharacter()));
        NonTerminalNode node = ((ModulePartNode) document.get().syntaxTree().rootNode())
                .findNode(TextRange.from(offset, 0));
        while (node != null && !CALL_KINDS.contains(node.kind())) {
            node = node.parent();
        }
        if (node == null) {
            return true;
        }
        Optional<Token> open = paren(node, SyntaxKind.OPEN_PAREN_TOKEN);
        Optional<Token> close = paren(node, SyntaxKind.CLOSE_PAREN_TOKEN);
        return open.isPresent() && open.get().textRange().endOffset() <= offset
                && close.map(token -> token.isMissing() || offset <= token.textRange().startOffset()).orElse(true);
    }

    private static Optional<Token> paren(NonTerminalNode call, SyntaxKind kind) {
        for (Node child : call.children()) {
            if (child.kind() == kind) {
                return Optional.of((Token) child);
            }
            if (child.kind() == SyntaxKind.PARENTHESIZED_ARG_LIST) {
                return paren((NonTerminalNode) child, kind);
            }
        }
        return Optional.empty();
    }

    @Override
    public String getKey() {
        return "signatureHelp";
    }

    @Override
    public long getDelay() {
        return 150;
    }
}
