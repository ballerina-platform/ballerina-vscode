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

package io.ballerina.servicemodelgenerator.extension.graphqlcontext;

import io.ballerina.compiler.syntax.tree.BasicLiteralNode;
import io.ballerina.compiler.syntax.tree.CaptureBindingPatternNode;
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ConditionalExpressionNode;
import io.ballerina.compiler.syntax.tree.ExplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionStatementNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyBlockNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.ImplicitNewExpressionNode;
import io.ballerina.compiler.syntax.tree.MethodCallExpressionNode;
import io.ballerina.compiler.syntax.tree.Minutiae;
import io.ballerina.compiler.syntax.tree.MinutiaeList;
import io.ballerina.compiler.syntax.tree.NilLiteralNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.NonTerminalNode;
import io.ballerina.compiler.syntax.tree.ParameterNode;
import io.ballerina.compiler.syntax.tree.PositionalArgumentNode;
import io.ballerina.compiler.syntax.tree.QualifiedNameReferenceNode;
import io.ballerina.compiler.syntax.tree.RequiredParameterNode;
import io.ballerina.compiler.syntax.tree.ReturnStatementNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.compiler.syntax.tree.StatementNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.compiler.syntax.tree.VariableDeclarationNode;
import io.ballerina.tools.text.LinePosition;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * The body of a request context function, read as a list of {@link ContextEntry context entries} and written back
 * from one.
 *
 * <p>
 * The designer edits a body of one recognised shape: the context is declared, each entry is one
 * {@code ctx.set(...)} statement of a known form, and the context is returned. Reading and writing are inverses on
 * that shape, so a body the designer wrote reads back as the entries it was written from. A body with anything else
 * in it, such as a log call or a custom {@code if}, is reported as not editable and is never rewritten: the user edits
 * it in the flow diagram instead.
 * </p>
 */
public final class ContextFunctionBody {

    public static final String SOURCE_HEADER = "header";
    public static final String SOURCE_QUERY = "query";
    public static final String SOURCE_VALUE = "value";
    public static final String SOURCE_EXPRESSION = "expression";

    private static final String SET = "set";
    private static final String GET_HEADER = "getHeader";
    private static final String HAS_HEADER = "hasHeader";
    private static final String GET_QUERY_PARAM = "getQueryParamValue";
    private static final String ENSURE_TYPE = "ensureType";
    private static final String CONTEXT_TYPE = "Context";
    private static final String NEW_LINE = "\n";

    private final String contextName;
    private final String requestName;
    private final List<ContextEntry> entries;
    private final LinePosition entriesStart;
    private final LinePosition entriesEnd;
    private final String indent;

    private ContextFunctionBody(String contextName, String requestName, List<ContextEntry> entries,
                                LinePosition entriesStart, LinePosition entriesEnd, String indent) {
        this.contextName = contextName;
        this.requestName = requestName;
        this.entries = entries;
        this.entriesStart = entriesStart;
        this.entriesEnd = entriesEnd;
        this.indent = indent;
    }

    /**
     * One value the context carries.
     *
     * @param key      the context key
     * @param source   where the value comes from: {@link #SOURCE_HEADER}, {@link #SOURCE_QUERY}, {@link #SOURCE_VALUE}
     *                 or {@link #SOURCE_EXPRESSION}
     * @param value    the header or query parameter name, the fixed text, or the expression's source
     * @param required for a header or a query parameter, whether a request without it is rejected; when not, the key
     *                 holds {@code ()} for such a request
     */
    public record ContextEntry(String key, String source, String value, boolean required) {
    }

    /**
     * Why a function body cannot be edited as entries.
     */
    public static final class NotEditableException extends Exception {

        private static final long serialVersionUID = 1L;

        NotEditableException(String message) {
            super(message);
        }
    }

    public List<ContextEntry> entries() {
        return entries;
    }

    /**
     * Where a context value's expression is in scope: the start of the statement that returns the context. The
     * function's parameters, such as the request, and the context itself are all visible there, so an expression
     * editor asked for completions or diagnostics at this position sees what the generated statement will see.
     */
    public LinePosition valuePosition() {
        return entriesEnd;
    }

    /**
     * Reads the body as entries.
     *
     * @throws NotEditableException when the body is not of the recognised shape, with the reason to show the user
     */
    public static ContextFunctionBody parse(FunctionDefinitionNode function) throws NotEditableException {
        if (!(function.functionBody() instanceof FunctionBodyBlockNode body)) {
            throw new NotEditableException("The function is not written as a block of statements.");
        }
        String requestName = requestParameterName(function)
                .orElseThrow(() -> new NotEditableException("The function's request parameter has no name."));
        NodeList<StatementNode> statements = body.statements();
        if (statements.size() < 2) {
            throw new NotEditableException("The function does not create and return a context.");
        }
        String contextName = declaredContext(statements.get(0)).orElseThrow(() -> new NotEditableException(
                "The function does not start by creating the context."));
        if (!returnsName(statements.get(statements.size() - 1), contextName)) {
            throw new NotEditableException("The function does not end by returning the context.");
        }
        List<ContextEntry> entries = new ArrayList<>();
        for (int i = 1; i < statements.size() - 1; i++) {
            entries.add(entry(statements.get(i), contextName, requestName).orElseThrow(() ->
                    new NotEditableException("The function does more than set context values.")));
        }
        // A rewrite replaces everything between the first and last statements, so a comment there would be lost.
        boolean commented = edgeToken(statements.get(0), false)
                .filter(token -> hasComment(token.trailingMinutiae())).isPresent()
                || edgeToken(statements.get(statements.size() - 1), true)
                .filter(token -> hasComment(token.leadingMinutiae())).isPresent();
        for (int i = 1; i < statements.size() - 1 && !commented; i++) {
            commented = hasComment(statements.get(i));
        }
        if (commented) {
            throw new NotEditableException("The function has comments among its context values.");
        }
        int column = statements.get(0).lineRange().startLine().offset();
        return new ContextFunctionBody(contextName, requestName, List.copyOf(entries),
                statements.get(0).lineRange().endLine(),
                statements.get(statements.size() - 1).lineRange().startLine(), " ".repeat(column));
    }

    /**
     * The edit that replaces the body's entries with the given ones, keeping its first and last statements as
     * written. Returned as the start, end and text of the replaced span.
     *
     * @throws IllegalArgumentException when an entry is not valid
     */
    public Replacement replaceEntries(List<ContextEntry> newEntries) {
        validate(newEntries);
        StringBuilder text = new StringBuilder(NEW_LINE);
        for (ContextEntry entry : newEntries) {
            text.append(indent).append(statement(entry, contextName, requestName)).append(NEW_LINE);
        }
        text.append(indent);
        return new Replacement(entriesStart, entriesEnd, text.toString());
    }

    /**
     * A span of the source and its new text.
     *
     * @param start the span's start
     * @param end   the span's end
     * @param text  the text that replaces it
     */
    public record Replacement(LinePosition start, LinePosition end, String text) {
    }

    /**
     * Checks the entries: each key present and unique, each header or parameter named, each expression parseable.
     *
     * @throws IllegalArgumentException naming the first problem found
     */
    static void validate(List<ContextEntry> entries) {
        Set<String> keys = new HashSet<>();
        for (ContextEntry entry : entries) {
            if (entry == null || entry.key() == null || entry.key().isBlank()) {
                throw new IllegalArgumentException("Every context value needs a key.");
            }
            if (!keys.add(entry.key())) {
                throw new IllegalArgumentException("The key \"" + entry.key() + "\" is used more than once.");
            }
            String source = entry.source() == null ? "" : entry.source();
            String value = entry.value() == null ? "" : entry.value();
            switch (source) {
                case SOURCE_HEADER, SOURCE_QUERY -> {
                    if (value.isBlank()) {
                        throw new IllegalArgumentException("\"" + entry.key() + "\" needs the name of the "
                                + (SOURCE_HEADER.equals(source) ? "header" : "query parameter") + " to read.");
                    }
                }
                case SOURCE_VALUE -> {
                    // Any text is a valid fixed value.
                }
                case SOURCE_EXPRESSION -> {
                    ExpressionNode expression = NodeParser.parseExpression(value);
                    if (value.isBlank() || expression.hasDiagnostics()) {
                        throw new IllegalArgumentException("\"" + entry.key() + "\" needs a valid expression.");
                    }
                    // A trailing comment would swallow the rest of the written statement, and a comment anywhere
                    // makes the body read back as not editable.
                    if (hasComment(expression)) {
                        throw new IllegalArgumentException("\"" + entry.key() + "\" cannot contain a comment.");
                    }
                }
                default -> throw new IllegalArgumentException("Unknown value source: " + source);
            }
        }
    }

    /**
     * The statement that sets one entry on the context.
     */
    static String statement(ContextEntry entry, String context, String request) {
        String key = quote(entry.key());
        String value = switch (entry.source()) {
            case SOURCE_HEADER -> {
                String name = quote(entry.value().strip());
                yield entry.required()
                        ? "check " + request + "." + GET_HEADER + "(" + name + ")"
                        : request + "." + HAS_HEADER + "(" + name + ") ? check " + request + "." + GET_HEADER
                        + "(" + name + ") : ()";
            }
            case SOURCE_QUERY -> {
                String name = quote(entry.value().strip());
                yield entry.required()
                        ? "check " + request + "." + GET_QUERY_PARAM + "(" + name + ")." + ENSURE_TYPE + "(string)"
                        : request + "." + GET_QUERY_PARAM + "(" + name + ")";
            }
            case SOURCE_VALUE -> quote(entry.value());
            default -> entry.value().strip();
        };
        return context + "." + SET + "(" + key + ", " + value + ");";
    }

    private static Optional<String> requestParameterName(FunctionDefinitionNode function) {
        SeparatedNodeList<ParameterNode> parameters = function.functionSignature().parameters();
        if (parameters.size() < 2 || !(parameters.get(1) instanceof RequiredParameterNode request)) {
            return Optional.empty();
        }
        return request.paramName().map(token -> token.text());
    }

    /**
     * The variable the statement declares, when it is {@code <prefix>:Context <name> = new ...;}.
     */
    private static Optional<String> declaredContext(StatementNode statement) {
        if (!(statement instanceof VariableDeclarationNode declaration)
                || !(declaration.typedBindingPattern().typeDescriptor() instanceof QualifiedNameReferenceNode type)
                || !CONTEXT_TYPE.equals(type.identifier().text())
                || !(declaration.typedBindingPattern().bindingPattern() instanceof CaptureBindingPatternNode binding)
                || declaration.initializer().isEmpty()) {
            return Optional.empty();
        }
        ExpressionNode initializer = declaration.initializer().get();
        boolean createsContext = initializer instanceof ImplicitNewExpressionNode implicitNew
                && implicitNew.parenthesizedArgList().map(args -> args.arguments().isEmpty()).orElse(true)
                || initializer instanceof ExplicitNewExpressionNode explicitNew
                && explicitNew.typeDescriptor() instanceof QualifiedNameReferenceNode newType
                && CONTEXT_TYPE.equals(newType.identifier().text())
                && explicitNew.parenthesizedArgList().arguments().isEmpty();
        return createsContext ? Optional.of(binding.variableName().text()) : Optional.empty();
    }

    /**
     * The node's first or last token.
     */
    private static Optional<Token> edgeToken(Node node, boolean first) {
        if (node instanceof Token token) {
            return Optional.of(token);
        }
        List<Node> children = new ArrayList<>();
        ((NonTerminalNode) node).children().forEach(children::add);
        for (int i = 0; i < children.size(); i++) {
            Optional<Token> token = edgeToken(children.get(first ? i : children.size() - 1 - i), first);
            if (token.isPresent()) {
                return token;
            }
        }
        return Optional.empty();
    }

    private static boolean hasComment(Node node) {
        if (node instanceof Token token) {
            return hasComment(token.leadingMinutiae()) || hasComment(token.trailingMinutiae());
        }
        if (node instanceof NonTerminalNode nonTerminal) {
            for (Node child : nonTerminal.children()) {
                if (hasComment(child)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean hasComment(MinutiaeList minutiae) {
        for (Minutiae item : minutiae) {
            if (item.kind() == SyntaxKind.COMMENT_MINUTIAE) {
                return true;
            }
        }
        return false;
    }

    private static boolean returnsName(StatementNode statement, String name) {
        return statement instanceof ReturnStatementNode returnStatement
                && returnStatement.expression().filter(expression -> isName(expression, name)).isPresent();
    }

    /**
     * The entry the statement sets, when it is {@code <context>.set("key", <value>);} with a recognised value.
     */
    private static Optional<ContextEntry> entry(StatementNode statement, String context, String request) {
        if (!(statement instanceof ExpressionStatementNode expressionStatement)
                || !(expressionStatement.expression() instanceof MethodCallExpressionNode call)
                || !isCall(call, context, SET)) {
            return Optional.empty();
        }
        List<ExpressionNode> args = positionalArguments(call).orElse(List.of());
        if (args.size() != 2) {
            return Optional.empty();
        }
        Optional<String> key = stringLiteral(args.get(0));
        if (key.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(classify(key.get(), args.get(1), request));
    }

    private static ContextEntry classify(String key, ExpressionNode value, String request) {
        // check request.getHeader("h")
        Optional<String> header = checkedCall(value, request, GET_HEADER);
        if (header.isPresent()) {
            return new ContextEntry(key, SOURCE_HEADER, header.get(), true);
        }
        // request.hasHeader("h") ? check request.getHeader("h") : ()
        if (value instanceof ConditionalExpressionNode conditional
                && conditional.endExpression() instanceof NilLiteralNode
                && conditional.lhsExpression() instanceof MethodCallExpressionNode hasHeader
                && isCall(hasHeader, request, HAS_HEADER)) {
            Optional<String> tested = singleStringArgument(hasHeader);
            Optional<String> read = checkedCall(conditional.middleExpression(), request, GET_HEADER);
            if (tested.isPresent() && tested.equals(read)) {
                return new ContextEntry(key, SOURCE_HEADER, tested.get(), false);
            }
        }
        // check request.getQueryParamValue("q").ensureType(string)
        if (value instanceof CheckExpressionNode check
                && check.checkKeyword().kind() == SyntaxKind.CHECK_KEYWORD
                && check.expression() instanceof MethodCallExpressionNode ensureType
                && ENSURE_TYPE.equals(ensureType.methodName().toSourceCode().strip())
                && ensureType.expression() instanceof MethodCallExpressionNode getParam
                && isCall(getParam, request, GET_QUERY_PARAM)) {
            Optional<List<ExpressionNode>> typeArgs = positionalArguments(ensureType);
            boolean toString = typeArgs.isPresent() && (typeArgs.get().isEmpty() || typeArgs.get().size() == 1
                    && "string".equals(typeArgs.get().get(0).toSourceCode().strip()));
            Optional<String> param = singleStringArgument(getParam);
            if (toString && param.isPresent()) {
                return new ContextEntry(key, SOURCE_QUERY, param.get(), true);
            }
        }
        // request.getQueryParamValue("q")
        if (value instanceof MethodCallExpressionNode getParam && isCall(getParam, request, GET_QUERY_PARAM)) {
            Optional<String> param = singleStringArgument(getParam);
            if (param.isPresent()) {
                return new ContextEntry(key, SOURCE_QUERY, param.get(), false);
            }
        }
        // "fixed text"
        Optional<String> literal = stringLiteral(value);
        if (literal.isPresent()) {
            return new ContextEntry(key, SOURCE_VALUE, literal.get(), false);
        }
        return new ContextEntry(key, SOURCE_EXPRESSION, value.toSourceCode().strip(), false);
    }

    /**
     * The string argument of {@code check <receiver>.<method>("name")}.
     */
    private static Optional<String> checkedCall(ExpressionNode expression, String receiver, String method) {
        if (expression instanceof CheckExpressionNode check
                && check.checkKeyword().kind() == SyntaxKind.CHECK_KEYWORD
                && check.expression() instanceof MethodCallExpressionNode call
                && isCall(call, receiver, method)) {
            return singleStringArgument(call);
        }
        return Optional.empty();
    }

    private static boolean isCall(MethodCallExpressionNode call, String receiver, String method) {
        return isName(call.expression(), receiver) && method.equals(call.methodName().toSourceCode().strip());
    }

    private static boolean isName(ExpressionNode expression, String name) {
        return expression instanceof SimpleNameReferenceNode reference && name.equals(reference.name().text());
    }

    private static Optional<String> singleStringArgument(MethodCallExpressionNode call) {
        List<ExpressionNode> args = positionalArguments(call).orElse(List.of());
        return args.size() == 1 ? stringLiteral(args.get(0)) : Optional.empty();
    }

    /**
     * The call's arguments, when all of them are positional; empty when any is named or a rest argument.
     */
    private static Optional<List<ExpressionNode>> positionalArguments(MethodCallExpressionNode call) {
        List<ExpressionNode> args = new ArrayList<>();
        for (FunctionArgumentNode argument : call.arguments()) {
            if (!(argument instanceof PositionalArgumentNode positional)) {
                return Optional.empty();
            }
            args.add(positional.expression());
        }
        return Optional.of(args);
    }

    private static Optional<String> stringLiteral(ExpressionNode expression) {
        if (expression instanceof BasicLiteralNode literal && literal.kind() == SyntaxKind.STRING_LITERAL) {
            return unquote(literal.literalToken().text());
        }
        return Optional.empty();
    }

    /**
     * A Ballerina string literal holding the text.
     */
    static String quote(String text) {
        StringBuilder quoted = new StringBuilder("\"");
        for (char c : text.toCharArray()) {
            switch (c) {
                case '"' -> quoted.append("\\\"");
                case '\\' -> quoted.append("\\\\");
                case '\n' -> quoted.append("\\n");
                case '\r' -> quoted.append("\\r");
                case '\t' -> quoted.append("\\t");
                default -> quoted.append(c);
            }
        }
        return quoted.append('"').toString();
    }

    /**
     * The text of a string literal, when it uses only the escapes {@link #quote} writes. A literal with any other
     * escape is left to the expression source, so it is never read back as different text.
     */
    static Optional<String> unquote(String literal) {
        if (literal.length() < 2 || !literal.startsWith("\"") || !literal.endsWith("\"")) {
            return Optional.empty();
        }
        String body = literal.substring(1, literal.length() - 1);
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < body.length(); i++) {
            char c = body.charAt(i);
            if (c != '\\') {
                text.append(c);
                continue;
            }
            if (i + 1 >= body.length()) {
                return Optional.empty();
            }
            char escaped = body.charAt(++i);
            switch (escaped) {
                case '"' -> text.append('"');
                case '\\' -> text.append('\\');
                case 'n' -> text.append('\n');
                case 'r' -> text.append('\r');
                case 't' -> text.append('\t');
                default -> {
                    return Optional.empty();
                }
            }
        }
        return Optional.of(text.toString());
    }
}
