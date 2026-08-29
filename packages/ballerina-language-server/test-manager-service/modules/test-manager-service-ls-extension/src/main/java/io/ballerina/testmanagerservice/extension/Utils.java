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

package io.ballerina.testmanagerservice.extension;

import io.ballerina.compiler.api.SemanticModel;
import io.ballerina.compiler.api.symbols.AnnotationSymbol;
import io.ballerina.compiler.syntax.tree.AnnotationNode;
import io.ballerina.compiler.syntax.tree.BasicLiteralNode;
import io.ballerina.compiler.syntax.tree.CheckExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionFunctionBodyNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.ExpressionStatementNode;
import io.ballerina.compiler.syntax.tree.FunctionArgumentNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyBlockNode;
import io.ballerina.compiler.syntax.tree.FunctionBodyNode;
import io.ballerina.compiler.syntax.tree.FunctionCallExpressionNode;
import io.ballerina.compiler.syntax.tree.FunctionDefinitionNode;
import io.ballerina.compiler.syntax.tree.IdentifierToken;
import io.ballerina.compiler.syntax.tree.ListConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeList;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.PositionalArgumentNode;
import io.ballerina.compiler.syntax.tree.ReturnStatementNode;
import io.ballerina.compiler.syntax.tree.SeparatedNodeList;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.StatementNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.TemplateExpressionNode;
import io.ballerina.testmanagerservice.extension.model.Annotation;
import io.ballerina.testmanagerservice.extension.model.Codedata;
import io.ballerina.testmanagerservice.extension.model.FunctionParameter;
import io.ballerina.testmanagerservice.extension.model.Metadata;
import io.ballerina.testmanagerservice.extension.model.Property;
import io.ballerina.testmanagerservice.extension.model.TestFunction;
import io.ballerina.tools.text.LinePosition;
import io.ballerina.tools.text.LineRange;
import org.eclipse.lsp4j.Position;
import org.eclipse.lsp4j.Range;

import java.net.URI;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * Utils class for the test manager service.
 *
 * @since 1.0.0
 */
public class Utils {

    private static final String CONVERSATION_THREAD = "ConversationThread";
    private static final String STRING_ARRAY_2D = "string[][]";

    private Utils() {
    }

    /**
     * Generates the URI for the given source path.
     *
     * @param sourcePath the source path
     * @return the generated URI as a string
     */
    public static String getExprUri(String sourcePath) {
        String exprUriString = "expr" + Paths.get(sourcePath).toUri().toString().substring(4);
        return URI.create(exprUriString).toString();
    }

    public static TestFunction getTestFunctionModel(FunctionDefinitionNode functionDefinitionNode,
                                                    SemanticModel semanticModel,
                                                    ModulePartNode modulePartNode) {
        TestFunction.FunctionBuilder functionBuilder = new TestFunction.FunctionBuilder();

        functionBuilder.metadata(new Metadata("Test Function", "Test Function"))
                .codedata(new Codedata(functionDefinitionNode.lineRange()))
                .functionName(TestFunction.functionName(functionDefinitionNode.functionName()))
                .parameters(TestFunction.parameters(functionDefinitionNode.functionSignature().parameters()))
                .returnType(TestFunction.returnType(functionDefinitionNode.functionSignature().returnTypeDesc()));

        // annotations
        functionDefinitionNode.metadata().ifPresent(metadata -> {
            List<Annotation> annotations = new ArrayList<>();
            for (AnnotationNode annotationNode : metadata.annotations()) {
                annotations.add(getAnnotationModel(annotationNode, semanticModel, modulePartNode));
            }
            functionBuilder.annotations(annotations);

        });

        functionBuilder.editable(true);

        return functionBuilder.build();
    }

    public static Annotation getAnnotationModel(AnnotationNode annotationNode, SemanticModel semanticModel,
                                                ModulePartNode modulePartNode) {
        AnnotationSymbol annotationSymbol = (AnnotationSymbol) semanticModel.symbol(annotationNode).get();
        String annotName = annotationSymbol.getName().orElse("");
        if (annotName.isEmpty()) {
            return null;
        }
        Optional<MappingConstructorExpressionNode> annotValue = annotationNode.annotValue();
        MappingConstructorExpressionNode mappingConstructor = annotValue.orElse(null);
        if (annotName.equals("Config")) {
            return buildConfigAnnotation(mappingConstructor, modulePartNode);
        }
        return null;
    }

    private static Annotation buildConfigAnnotation(MappingConstructorExpressionNode mappingConstructor,
                                                    ModulePartNode modulePartNode) {
        Annotation.ConfigAnnotationBuilder builder = new Annotation.ConfigAnnotationBuilder();
        builder.metadata(new Metadata("Config", "Test Function Configurations"));
        if (mappingConstructor == null) {
            return builder.build();
        }
        SeparatedNodeList<MappingFieldNode> fields = mappingConstructor.fields();
        String dataProviderName = null;
        for (MappingFieldNode field : fields) {
            if (field instanceof SpecificFieldNode specificFieldNode) {
                String fieldName = specificFieldNode.fieldName().toSourceCode().trim();
                Optional<ExpressionNode> expressionNode = specificFieldNode.valueExpr();

                switch (fieldName) {
                    case "enabled" -> {
                        if (expressionNode.isPresent()) {
                            String value = expressionNode.get().toSourceCode().trim();
                            if (value.equals("false")) {
                                builder.enabled(false);
                            } else {
                                builder.enabled(true);
                            }
                        }
                    }
                    case "groups" -> {
                        if (expressionNode.isPresent() &&
                                expressionNode.get() instanceof ListConstructorExpressionNode expr) {
                            List<String> groupList = new ArrayList<>();
                            for (Node groupExpr : expr.expressions()) {
                                groupList.add(groupExpr.toSourceCode().trim());
                            }
                            builder.groups(groupList);
                        }
                    }
                    case "dataProvider" -> {
                        if (expressionNode.isPresent()) {
                            String value = expressionNode.get().toSourceCode().trim();
                            dataProviderName = value;
                            builder.dataProvider(value);
                        }
                    }
                    case "dataProviderMode" -> {
                        if (expressionNode.isPresent()) {
                            String value = expressionNode.get().toSourceCode().trim();
                            builder.dataProviderMode(value);
                        }
                    }
                    case "evalSetFile" -> {
                        if (expressionNode.isPresent()) {
                            String value = expressionNode.get().toSourceCode().trim();
                            builder.evalSetFile(value);
                        }
                    }
                    case "dependsOn" -> {
                        if (expressionNode.isPresent() &&
                                expressionNode.get() instanceof ListConstructorExpressionNode expr) {
                            List<String> functionList = new ArrayList<>();
                            for (Node functionExpr : expr.expressions()) {
                                functionList.add(functionExpr.toSourceCode().trim());
                            }
                            builder.dependsOn(functionList);
                        }
                    }
                    case "after" -> {
                        if (expressionNode.isPresent()) {
                            String value = expressionNode.get().toSourceCode().trim();
                            builder.after(value);
                        }
                    }
                    case "before" -> {
                        if (expressionNode.isPresent()) {
                            String value = expressionNode.get().toSourceCode().trim();
                            builder.before(value);
                        }
                    }
                    case "runs" -> {
                        if (expressionNode.isPresent()) {
                            String value = expressionNode.get().toSourceCode().trim();
                            builder.runs(value);
                        }
                    }
                    case "minPassRate" -> {
                        if (expressionNode.isPresent()) {
                            String value = expressionNode.get().toSourceCode().trim();
                            builder.minPassRate(value);
                        }
                    }
                    default -> {
                    }
                }
            }
        }

        if (dataProviderName != null) {
            String evalSetPath = extractEvalSetFileFromDataProvider(modulePartNode, dataProviderName);
            if (!evalSetPath.isEmpty()) {
                builder.evalSetFile(evalSetPath);
                builder.dataProviderMode(Constants.DATA_PROVIDER_MODE_EVALSET);
            } else {
                List<String> queries = extractQueryExpressionsFromDataProvider(modulePartNode, dataProviderName);
                if (!queries.isEmpty()) {
                    builder.queries(queries);
                    builder.dataProviderMode(Constants.DATA_SOURCE_MODE_QUERIES);
                }
            }
        }

        return builder.build();
    }

    private static String extractEvalSetFileFromDataProvider(ModulePartNode modulePartNode,
                                                             String dataProviderFunctionName) {
        // Find the data provider function
        Optional<FunctionDefinitionNode> dataProviderFunc =
                findFunctionByName(modulePartNode, dataProviderFunctionName);

        if (dataProviderFunc.isEmpty()) {
            return "";
        }

        // Extract the ai:loadConversationThreads() call from function body
        FunctionBodyNode functionBody = dataProviderFunc.get().functionBody();
        if (functionBody instanceof FunctionBodyBlockNode blockBody) {
            // Handle block-based function body
            return extractFromStatements(blockBody.statements());
        } else if (functionBody instanceof ExpressionFunctionBodyNode exprBody) {
            // Handle expression-based function body (return expr;)
            return extractFromExpression(exprBody.expression());
        }

        return "";
    }

    /**
     * Find the loadConversationThreads argument in statements.
     *
     * @param statements the list of statements
     * @return the ExpressionNode of the file path argument, or empty if not found
     */
    public static Optional<ExpressionNode> findLoadConversationThreadsArgumentInStatements(
            NodeList<StatementNode> statements) {
        for (StatementNode statement : statements) {
            if (statement instanceof ReturnStatementNode returnStmt) {
                Optional<ExpressionNode> expr = returnStmt.expression();
                if (expr.isPresent()) {
                    Optional<ExpressionNode> result = findLoadConversationThreadsArgument(expr.get());
                    if (result.isPresent()) {
                        return result;
                    }
                }
            } else if (statement instanceof ExpressionStatementNode exprStmt) {
                Optional<ExpressionNode> result = findLoadConversationThreadsArgument(exprStmt.expression());
                if (result.isPresent()) {
                    return result;
                }
            }
        }
        return Optional.empty();
    }

    private static String extractFromStatements(NodeList<StatementNode> statements) {
        Optional<ExpressionNode> argExpr = findLoadConversationThreadsArgumentInStatements(statements);
        if (argExpr.isPresent()) {
            String argValue = argExpr.get().toSourceCode().trim();
            return argValue.replaceAll("^\"|\"$", "");
        }
        return "";
    }

    /**
     * Find the argument expression for the file path in ai:loadConversationThreads() call.
     *
     * @param expression the expression node to search
     * @return the ExpressionNode of the file path argument, or empty if not found
     */
    public static Optional<ExpressionNode> findLoadConversationThreadsArgument(ExpressionNode expression) {
        // Handle check expression: check ai:loadConversationThreads(...)
        if (expression instanceof CheckExpressionNode checkExpr) {
            return findLoadConversationThreadsArgument(checkExpr.expression());
        }

        // Handle function call: ai:loadConversationThreads("path")
        if (expression instanceof FunctionCallExpressionNode funcCall) {
            String functionName = funcCall.functionName().toSourceCode().trim();

            // Check if it's the ai:loadConversationThreads function
            if (functionName.equals(Constants.LOAD_CONVERSATION_THREADS) ||
                    functionName.equals(Constants.MODULE_AI + Constants.COLON + Constants.LOAD_CONVERSATION_THREADS)) {
                // Extract first argument (the file path)
                for (FunctionArgumentNode arg : funcCall.arguments()) {
                    if (arg instanceof PositionalArgumentNode positionalArg) {
                        return Optional.of(positionalArg.expression());
                    }
                }
            }
        }

        return Optional.empty();
    }

    private static String extractFromExpression(ExpressionNode expression) {
        Optional<ExpressionNode> argExpr = findLoadConversationThreadsArgument(expression);
        if (argExpr.isPresent()) {
            String argValue = argExpr.get().toSourceCode().trim();
            // Remove surrounding quotes
            return argValue.replaceAll("^\"|\"$", "");
        }
        return "";
    }

    public static String getTestFunctionTemplate(TestFunction function) {
        StringBuilder builder = new StringBuilder();

        // build annotations
        builder.append(buildAnnotation(function.annotations()))
                .append(Constants.LINE_SEPARATOR);

        builder.append(Constants.KEYWORD_FUNCTION)
                .append(Constants.SPACE)
                .append(function.functionName().value())
                .append(buildFunctionSignature(function));

        builder.append(Constants.SPACE)
                .append(Constants.OPEN_CURLY_BRACE)
                .append(Constants.LINE_SEPARATOR)
                .append(Constants.CLOSE_CURLY_BRACE);
        return builder.toString();
    }

    public static String buildFunctionSignature(TestFunction function) {
        return buildFunctionParams(function.parameters()) +
                buildReturnType(function.returnType());
    }

    public static String buildFunctionParams(List<FunctionParameter> parameters) {
        if (parameters.isEmpty()) {
            return "()";
        }
        List<String> params = new ArrayList<>();
        for (FunctionParameter param : parameters) {
            String type = param.type().value().toString().trim();
            String name = param.variable().value().toString().trim();
            String defaultValue = "";
            if (param.defaultValue() != null) {
                Object value = param.defaultValue().value();
                defaultValue = value != null ? value.toString().trim() : "";
            }
            if (defaultValue.isEmpty()) {
                params.add(type + Constants.SPACE + name);
            } else {
                params.add(type + Constants.SPACE + name + Constants.SPACE + Constants.EQUAL + Constants.SPACE
                        + defaultValue);
            }
        }
        return Constants.OPEN_PARAM + String.join(Constants.COMMA + Constants.SPACE, params)
                + Constants.CLOSED_PARAM;
    }

    public static String buildReturnType(Property returnType) {
        if (returnType == null || returnType.value() == null || returnType.value().toString().trim().isEmpty()) {
            return Constants.SPACE + Constants.KEYWORD_RETURNS + Constants.SPACE + "error?";
        }
        return Constants.SPACE + Constants.KEYWORD_RETURNS + Constants.SPACE + returnType.value().toString().trim();
    }

    public static String buildAnnotation(List<Annotation> annotations) {
        List<String> annotationStrings = new ArrayList<>();
        for (Annotation annotation : annotations) {
            StringBuilder builder = new StringBuilder();
            builder.append(Constants.TEST_ANNOTATION)
                    .append(annotation.name());
            String annotValue;
            if (annotation.name().equals("Config")) {
                annotValue = buildTestConfigAnnotation(annotation);
            } else {
                annotValue = "";
            }

            if (!annotValue.isEmpty()) {
                builder.append(Constants.OPEN_CURLY_BRACE)
                        .append(Constants.LINE_SEPARATOR)
                        .append(annotValue)
                        .append(Constants.LINE_SEPARATOR)
                        .append(Constants.CLOSE_CURLY_BRACE);
            }
            annotationStrings.add(builder.toString());
        }

        if (annotationStrings.isEmpty()) {
            return "";
        }

        return String.join(Constants.LINE_SEPARATOR, annotationStrings);
    }

    public static String buildTestConfigAnnotation(Annotation annotation) {
        List<String> fieldStrings = new ArrayList<>();
        for (Property field : annotation.fields()) {
            String fieldName = field.originalName();
            Object value = field.value();
            switch (fieldName) {
                case "enabled" -> {
                    if (value instanceof String valueStr && valueStr.equals(Constants.FALSE)) {
                        fieldStrings.add(Constants.FILED_TEMPLATE.formatted(fieldName, Constants.FALSE));
                    }
                }
                case "groups" -> {
                    if (value instanceof List<?> valueList && !valueList.isEmpty()
                            && valueList.getFirst() instanceof String) {
                        List<String> groupList = valueList.stream()
                                .filter(group -> {
                                    String groupStr = group.toString().trim();
                                    if (groupStr.isEmpty() || groupStr.equals("\"\"")) {
                                        return false;
                                    }
                                    String unquoted = groupStr.replaceAll("^\"|\"$", "");
                                    return !unquoted.isEmpty();
                                })
                                .map(group -> {
                                    String groupStr = group.toString();
                                    if (!groupStr.startsWith(Constants.DOUBLE_QUOTE)) {
                                        return Constants.DOUBLE_QUOTE + groupStr + Constants.DOUBLE_QUOTE;
                                    }
                                    return groupStr;
                                })
                                .toList();
                        String groupStr = Constants.OPEN_BRACKET + String.join(Constants.COMMA + Constants.SPACE,
                                groupList) + Constants.CLOSE_BRACKET;
                        fieldStrings.add(Constants.FILED_TEMPLATE.formatted(fieldName, groupStr));
                    }
                }
                case "dataProvider" -> {
                    if (value instanceof String valueStr && !valueStr.isEmpty()) {
                        fieldStrings.add(Constants.FILED_TEMPLATE.formatted(fieldName, valueStr));
                    }
                }
                case "dependsOn" -> {
                    if (value instanceof List<?> valueList && !valueList.isEmpty()
                            && valueList.getFirst() instanceof String) {
                        List<String> functionList = valueList.stream().map(Object::toString).toList();
                        String functionStr = Constants.OPEN_BRACKET + String.join(Constants.COMMA + Constants.SPACE,
                                functionList) + Constants.CLOSE_BRACKET;
                        fieldStrings.add(Constants.FILED_TEMPLATE.formatted(fieldName, functionStr));
                    }
                }
                case "after" -> {
                    if (value instanceof String valueStr && !valueStr.isEmpty()) {
                        fieldStrings.add(Constants.FILED_TEMPLATE.formatted(fieldName, valueStr));
                    }
                }
                case "before" -> {
                    if (value instanceof String valueStr && !valueStr.isEmpty()) {
                        fieldStrings.add(Constants.FILED_TEMPLATE.formatted(fieldName, valueStr));
                    }
                }
                case "runs" -> {
                    if (value instanceof String valueStr && !valueStr.isEmpty() && !valueStr.equals("1")) {
                        fieldStrings.add(Constants.FILED_TEMPLATE.formatted(fieldName, valueStr));
                    }
                }
                case "minPassRate" -> {
                    if (value instanceof String valueStr && !valueStr.isEmpty() && !valueStr.equals("1")) {
                        fieldStrings.add(Constants.FILED_TEMPLATE.formatted(fieldName, valueStr));
                    }
                }
                default -> {
                }
            }
        }
        if (fieldStrings.isEmpty()) {
            return "";
        }

        return String.join(Constants.COMMA + Constants.LINE_SEPARATOR, fieldStrings);
    }

    /**
     * Check whether the test import exists in the module.
     *
     * @param node module part node
     * @return true if the import exists, false otherwise
     */
    public static boolean isTestModuleImportExists(ModulePartNode node) {
        return isModuleImportExists(node, Constants.MODULE_TEST);
    }

    private static boolean isModuleImportExists(ModulePartNode node, String module) {
        return node.imports().stream().anyMatch(importDeclarationNode -> {
            String moduleName = importDeclarationNode.moduleName().stream()
                    .map(IdentifierToken::text)
                    .collect(Collectors.joining("."));
            return importDeclarationNode.orgName().isPresent()
                    && Constants.ORG_BALLERINA.equals(importDeclarationNode.orgName().get().orgName().text())
                    && module.equals(moduleName);
        });
    }

    /**
     * Check whether the ai import exists in the module.
     *
     * @param node module part node
     * @return true if the import exists, false otherwise
     */
    public static boolean isAiModuleImportExists(ModulePartNode node) {
        return isModuleImportExists(node, Constants.MODULE_AI);
    }

    public static boolean isAiEvalModuleImportExists(ModulePartNode node) {
        return isModuleImportExists(node, Constants.MODULE_AI_EVAL);
    }

    /**
     * Get a field value from the Config annotation of a test function.
     *
     * @param function  the test function
     * @param fieldName the field name to extract
     * @return the field value without quotes, or null if not found
     */
    public static String getConfigFieldValue(TestFunction function, String fieldName) {
        if (function.annotations() == null) {
            return null;
        }
        for (Annotation annotation : function.annotations()) {
            if ("Config".equals(annotation.name())) {
                for (Property field : annotation.fields()) {
                    if (fieldName.equals(field.originalName())) {
                        return field.value() != null ? field.value().toString().replaceAll("\"", "") : null;
                    }
                }
            }
        }
        return null;
    }

    /**
     * Find a function by name in the module.
     *
     * @param modulePartNode the module part node
     * @param functionName   the function name (with or without quotes)
     * @return the function definition node, or empty if not found
     */
    public static Optional<FunctionDefinitionNode> findFunctionByName(ModulePartNode modulePartNode,
                                                                      String functionName) {
        if (functionName == null || functionName.isEmpty()) {
            return Optional.empty();
        }
        // Remove quotes if present in function name
        final String cleanName = functionName.replaceAll("\"", "");

        return modulePartNode.members().stream()
                .filter(mem -> mem instanceof FunctionDefinitionNode)
                .map(mem -> (FunctionDefinitionNode) mem)
                .filter(mem -> mem.functionName().text().trim().equals(cleanName))
                .findFirst();
    }

    /**
     * Get the line range covering all annotations.
     *
     * @param annotations the list of annotation nodes
     * @return the line range covering all annotations, or null if empty
     */
    public static LineRange getAnnotationsRange(NodeList<AnnotationNode> annotations) {
        if (annotations.isEmpty()) {
            return null;
        }

        LinePosition startPos = annotations.get(0).lineRange().startLine();
        LinePosition endPos = annotations.get(annotations.size() - 1).lineRange().endLine();

        return LineRange.from(null, startPos, endPos);
    }

    /**
     * Extract text from a document at the given line range.
     *
     * @param textDocument the text document
     * @param range        the line range
     * @return the extracted text with quotes removed and trimmed
     */
    public static String extractTextFromRange(io.ballerina.tools.text.TextDocument textDocument, LineRange range) {
        int start = textDocument.textPositionFrom(range.startLine());
        int end = textDocument.textPositionFrom(range.endLine());
        String text = textDocument.toString().substring(start, end);
        return text.replaceAll("^\"|\"$", "").trim();
    }

    /**
     * Generate an evalSet data provider function template.
     *
     * @param functionName    the name of the data provider function
     * @param evalSetFilePath the path to the evalSet file
     * @return the generated function template
     */
    public static String getEvalSetDataProviderFunctionTemplate(String functionName, String evalSetFilePath) {
        StringBuilder builder = new StringBuilder();
        builder.append(Constants.LINE_SEPARATOR)
                .append(Constants.LINE_SEPARATOR)
                .append(Constants.KEYWORD_ISOLATED)
                .append(Constants.SPACE)
                .append(Constants.KEYWORD_FUNCTION)
                .append(Constants.SPACE)
                .append(functionName)
                .append(Constants.OPEN_PARAM)
                .append(Constants.CLOSED_PARAM)
                .append(Constants.SPACE)
                .append(Constants.KEYWORD_RETURNS)
                .append(Constants.SPACE)
                .append("map<[" + Constants.AI_CONVERSATION_THREAD_TYPE + "]>|error")
                .append(Constants.SPACE)
                .append(Constants.OPEN_CURLY_BRACE)
                .append(Constants.LINE_SEPARATOR)
                .append(Constants.TAB_SEPARATOR)
                .append("return ai:loadConversationThreads(\"" + evalSetFilePath + "\");")
                .append(Constants.LINE_SEPARATOR)
                .append(Constants.CLOSE_CURLY_BRACE);
        return builder.toString();
    }

    public static String buildEvalTemplateInvocation(String symbol, List<String> arguments) {
        return Constants.KEYWORD_CHECK + Constants.SPACE + Constants.AI_EVAL_PREFIX + Constants.COLON + symbol
                + Constants.OPEN_PARAM + String.join(Constants.COMMA + Constants.SPACE, arguments)
                + Constants.CLOSED_PARAM + ";";
    }

    public static Optional<ExpressionStatementNode> findEvalTemplateCall(FunctionDefinitionNode function) {
        if (!(function.functionBody() instanceof FunctionBodyBlockNode blockBody)) {
            return Optional.empty();
        }
        List<ExpressionStatementNode> calls = new ArrayList<>();
        for (StatementNode statement : blockBody.statements()) {
            if (statement instanceof ExpressionStatementNode exprStmt && isEvalTemplateCall(exprStmt.expression())) {
                calls.add(exprStmt);
            }
        }
        return calls.size() == 1 ? Optional.of(calls.getFirst()) : Optional.empty();
    }

    private static boolean isEvalTemplateCall(ExpressionNode expression) {
        if (expression instanceof CheckExpressionNode checkExpr) {
            return isEvalTemplateCall(checkExpr.expression());
        }
        return expression instanceof FunctionCallExpressionNode funcCall
                && funcCall.functionName().toSourceCode().trim()
                        .startsWith(Constants.AI_EVAL_PREFIX + Constants.COLON);
    }

    /** Builds the query data-provider rows from the string expressions produced by the TEXT_SET editor. */
    public static String buildQueryExpressionArray(List<String> queryExpressions) {
        StringBuilder rows = new StringBuilder();
        for (int i = 0; i < queryExpressions.size(); i++) {
            if (i > 0) {
                rows.append(Constants.COMMA).append(Constants.SPACE);
            }
            rows.append(Constants.OPEN_BRACKET)
                    .append(validateQueryExpression(queryExpressions.get(i)))
                    .append(Constants.CLOSE_BRACKET);
        }
        return Constants.OPEN_BRACKET + rows + Constants.CLOSE_BRACKET;
    }

    public static String getQueriesDataProviderFunctionTemplate(String functionName, List<String> queries) {
        return Constants.LINE_SEPARATOR + Constants.LINE_SEPARATOR
                + Constants.KEYWORD_ISOLATED + Constants.SPACE + Constants.KEYWORD_FUNCTION + Constants.SPACE
                + functionName + Constants.OPEN_PARAM + Constants.CLOSED_PARAM + Constants.SPACE
                + Constants.KEYWORD_RETURNS + Constants.SPACE + Constants.STRING_ARRAY_2D_RETURN_TYPE + Constants.SPACE
                + Constants.OPEN_CURLY_BRACE + Constants.LINE_SEPARATOR + Constants.TAB_SEPARATOR
                + "return " + buildQueryExpressionArray(queries) + ";"
                + Constants.LINE_SEPARATOR + Constants.CLOSE_CURLY_BRACE;
    }

    public enum DataProviderShape { EVALSET, QUERIES, UNKNOWN }

    public static DataProviderShape getDataProviderShape(FunctionDefinitionNode provider) {
        String returnType = provider.functionSignature().returnTypeDesc()
                .map(desc -> desc.type().toSourceCode().trim()).orElse("");
        if (returnType.contains(CONVERSATION_THREAD)) {
            return DataProviderShape.EVALSET;
        }
        if (returnType.replace(Constants.SPACE, "").contains(STRING_ARRAY_2D)) {
            return DataProviderShape.QUERIES;
        }
        return DataProviderShape.UNKNOWN;
    }

    public static Optional<LineRange> findQueriesListLocation(FunctionDefinitionNode provider) {
        return findQueriesList(provider.functionBody()).map(Node::lineRange);
    }

    public static List<String> extractQueryExpressionsFromDataProvider(ModulePartNode modulePartNode,
                                                                         String providerName) {
        Optional<FunctionDefinitionNode> provider = findFunctionByName(modulePartNode, providerName);
        if (provider.isEmpty() || getDataProviderShape(provider.get()) != DataProviderShape.QUERIES) {
            return List.of();
        }
        Optional<ListConstructorExpressionNode> rows = findQueriesList(provider.get().functionBody());
        if (rows.isEmpty()) {
            return List.of();
        }
        List<String> queries = new ArrayList<>();
        for (Node row : rows.get().expressions()) {
            if (row instanceof ListConstructorExpressionNode rowList) {
                rowList.expressions().stream().findFirst()
                        .ifPresent(value -> queries.add(value.toSourceCode().trim()));
            } else {
                queries.add(row.toSourceCode().trim());
            }
        }
        return queries;
    }

    private static Optional<ListConstructorExpressionNode> findQueriesList(FunctionBodyNode body) {
        if (body instanceof FunctionBodyBlockNode blockBody) {
            for (StatementNode statement : blockBody.statements()) {
                if (statement instanceof ReturnStatementNode returnStmt
                        && returnStmt.expression().orElse(null) instanceof ListConstructorExpressionNode list) {
                    return Optional.of(list);
                }
            }
        } else if (body instanceof ExpressionFunctionBodyNode exprBody
                && exprBody.expression() instanceof ListConstructorExpressionNode list) {
            return Optional.of(list);
        }
        return Optional.empty();
    }

    private static String validateQueryExpression(String queryExpression) {
        if (queryExpression == null || queryExpression.isBlank()) {
            throw new IllegalArgumentException("A query expression is required");
        }
        ExpressionNode expression = NodeParser.parseExpression(queryExpression.trim());
        boolean isStringLiteral = expression instanceof BasicLiteralNode
                && expression.kind() == SyntaxKind.STRING_LITERAL;
        boolean isStringTemplate = expression instanceof TemplateExpressionNode
                && expression.kind() == SyntaxKind.STRING_TEMPLATE_EXPRESSION;
        if (expression.hasDiagnostics() || (!isStringLiteral && !isStringTemplate)) {
            throw new IllegalArgumentException("Queries must be string literals or string templates");
        }
        return expression.toSourceCode().trim();
    }

    /**
     * Convert the syntax-node line range into a lsp4j range.
     *
     * @param lineRange line range
     * @return {@link Range} converted range
     */
    public static Range toRange(LineRange lineRange) {
        return new Range(toPosition(lineRange.startLine()), toPosition(lineRange.endLine()));
    }

    /**
     * Converts syntax-node line position into a lsp4j position.
     *
     * @param position line position
     * @return {@link Range} converted range
     */
    public static Range toRange(LinePosition position) {
        return new Range(toPosition(position), toPosition(position));
    }

    /**
     * Converts syntax-node line position into a lsp4j position.
     *
     * @param linePosition - line position
     * @return {@link Position} converted position
     */
    public static Position toPosition(LinePosition linePosition) {
        return new Position(linePosition.line(), linePosition.offset());
    }

}
