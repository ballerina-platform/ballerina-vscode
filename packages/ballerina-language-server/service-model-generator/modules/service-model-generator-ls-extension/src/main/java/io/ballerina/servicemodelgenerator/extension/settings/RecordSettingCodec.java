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

package io.ballerina.servicemodelgenerator.extension.settings;

import io.ballerina.compiler.syntax.tree.BasicLiteralNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.ListConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingFieldNode;
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.UnaryExpressionNode;
import io.ballerina.servicemodelgenerator.extension.settings.ServiceSettingDescriptors.Descriptor;
import io.ballerina.servicemodelgenerator.extension.settings.ServiceSettingDescriptors.SubField;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Reads a record-typed setting, such as {@code cors: {allowOrigins: ["*"]}}, into typed sub-field values, and writes
 * sub-field values back as a mapping.
 *
 * <p>
 * The designer edits a record value only when it is a mapping of plain literals whose fields its descriptor knows.
 * Anything else, such as a variable reference or a field it has no editor for, is read as unstructured and edited in
 * the full service config form instead, so a value written by hand is never rewritten. A written mapping leaves out
 * every sub-field at its default, so the source stays as short as the setting allows. With every sub-field at its
 * default it is written as {@code {}}: for an optional record such as {@code queryComplexityConfig?}, being present
 * is what turns the feature on.
 * </p>
 */
public final class RecordSettingCodec {

    public static final String KIND_TOGGLE = "toggle";
    public static final String KIND_INTEGER = "integer";
    public static final String KIND_DECIMAL = "decimal";
    public static final String KIND_TEXT = "text";
    public static final String KIND_TEXT_LIST = "textList";

    private RecordSettingCodec() {
    }

    /**
     * The sub-field values of a record setting as written, keyed by sub-field name; empty when the value is not a
     * mapping of plain literals the descriptor knows. A sub-field left out is not in the map.
     */
    public static Optional<Map<String, Object>> read(Descriptor descriptor, String value) {
        if (descriptor.fields() == null || value == null) {
            return Optional.empty();
        }
        ExpressionNode expression = NodeParser.parseExpression(value);
        if (expression.hasDiagnostics() || !(expression instanceof MappingConstructorExpressionNode mapping)) {
            return Optional.empty();
        }
        Map<String, Object> values = new LinkedHashMap<>();
        for (MappingFieldNode field : mapping.fields()) {
            if (!(field instanceof SpecificFieldNode specificField) || specificField.valueExpr().isEmpty()) {
                return Optional.empty();
            }
            String name = specificField.fieldName().toSourceCode().strip();
            Optional<SubField> subField = descriptor.fields().stream()
                    .filter(candidate -> candidate.name().equals(name))
                    .findFirst();
            if (subField.isEmpty() || values.containsKey(name)) {
                return Optional.empty();
            }
            Optional<Object> parsed = literal(subField.get().kind(), specificField.valueExpr().get());
            if (parsed.isEmpty()) {
                return Optional.empty();
            }
            values.put(name, parsed.get());
        }
        return Optional.of(values);
    }

    /**
     * The mapping that sets the given sub-field values, leaving out the ones at their default.
     *
     * @throws IllegalArgumentException when a value is unknown or not of its sub-field's kind
     */
    public static String write(Descriptor descriptor, Map<String, Object> values) {
        if (descriptor.fields() == null) {
            throw new IllegalArgumentException(descriptor.label() + " is not a record setting");
        }
        for (String name : values.keySet()) {
            if (descriptor.fields().stream().noneMatch(subField -> subField.name().equals(name))) {
                throw new IllegalArgumentException(descriptor.label() + " has no field " + name);
            }
        }
        List<String> parts = new ArrayList<>();
        for (SubField subField : descriptor.fields()) {
            Object value = values.get(subField.name());
            if (value == null) {
                continue;
            }
            String literal = toLiteral(subField, value);
            String defaultLiteral = subField.defaultValue() == null ? null
                    : toLiteral(subField, subField.defaultValue());
            if (!literal.equals(defaultLiteral)) {
                parts.add(subField.name() + ": " + literal);
            }
        }
        return "{" + String.join(", ", parts) + "}";
    }

    /**
     * The Ballerina literal for a value of the sub-field's kind.
     *
     * @throws IllegalArgumentException when the value is not of that kind
     */
    static String toLiteral(SubField subField, Object value) {
        String label = subField.label() != null ? subField.label() : subField.name();
        switch (subField.kind()) {
            case KIND_TOGGLE -> {
                if (value instanceof Boolean bool) {
                    return bool.toString();
                }
            }
            case KIND_INTEGER -> {
                Optional<BigDecimal> number = number(value);
                if (number.isPresent() && number.get().stripTrailingZeros().scale() <= 0) {
                    return number.get().toBigIntegerExact().toString();
                }
                throw new IllegalArgumentException(label + " must be a whole number.");
            }
            case KIND_DECIMAL -> {
                Optional<BigDecimal> number = number(value);
                if (number.isPresent()) {
                    return number.get().stripTrailingZeros().toPlainString();
                }
                throw new IllegalArgumentException(label + " must be a number.");
            }
            case KIND_TEXT -> {
                if (value instanceof String text) {
                    return ContextFunctionBody.quote(text);
                }
            }
            case KIND_TEXT_LIST -> {
                if (value instanceof List<?> list && list.stream().allMatch(String.class::isInstance)) {
                    List<String> items = new ArrayList<>();
                    list.forEach(item -> items.add(ContextFunctionBody.quote((String) item)));
                    return "[" + String.join(", ", items) + "]";
                }
                throw new IllegalArgumentException(label + " must be a list of text values.");
            }
            default -> throw new IllegalArgumentException("Unknown field kind: " + subField.kind());
        }
        throw new IllegalArgumentException("Not a valid value for " + label + ".");
    }

    private static Optional<BigDecimal> number(Object value) {
        try {
            if (value instanceof Number number) {
                return Optional.of(new BigDecimal(number.toString()));
            }
            if (value instanceof String text && !text.isBlank()) {
                return Optional.of(new BigDecimal(text.strip()));
            }
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
        return Optional.empty();
    }

    /**
     * The value of a literal of the given kind: a {@link Boolean}, a {@link Long} for a whole number, a
     * {@link BigDecimal} for a decimal, a {@link String}, or a list of strings.
     */
    private static Optional<Object> literal(String kind, ExpressionNode expression) {
        switch (kind) {
            case KIND_TOGGLE -> {
                if (expression instanceof BasicLiteralNode literal && literal.kind() == SyntaxKind.BOOLEAN_LITERAL) {
                    return Optional.of(Boolean.parseBoolean(literal.literalToken().text()));
                }
            }
            case KIND_INTEGER -> {
                Optional<BigDecimal> number = numericLiteral(expression);
                if (number.isPresent() && number.get().stripTrailingZeros().scale() <= 0) {
                    return Optional.of(number.get().longValueExact());
                }
            }
            case KIND_DECIMAL -> {
                Optional<BigDecimal> number = numericLiteral(expression);
                if (number.isPresent()) {
                    return Optional.of(number.get());
                }
            }
            case KIND_TEXT -> {
                Optional<String> text = stringLiteral(expression);
                if (text.isPresent()) {
                    return Optional.of(text.get());
                }
            }
            case KIND_TEXT_LIST -> {
                if (expression instanceof ListConstructorExpressionNode list) {
                    List<String> items = new ArrayList<>();
                    for (Node item : list.expressions()) {
                        Optional<String> text = item instanceof ExpressionNode itemExpression
                                ? stringLiteral(itemExpression) : Optional.empty();
                        if (text.isEmpty()) {
                            return Optional.empty();
                        }
                        items.add(text.get());
                    }
                    return Optional.of(items);
                }
            }
            default -> {
                return Optional.empty();
            }
        }
        return Optional.empty();
    }

    private static Optional<BigDecimal> numericLiteral(ExpressionNode expression) {
        boolean negative = false;
        ExpressionNode operand = expression;
        if (expression instanceof UnaryExpressionNode unary
                && unary.unaryOperator().kind() == SyntaxKind.MINUS_TOKEN) {
            negative = true;
            operand = unary.expression();
        }
        if (!(operand instanceof BasicLiteralNode literal)
                || literal.kind() != SyntaxKind.NUMERIC_LITERAL) {
            return Optional.empty();
        }
        String text = literal.literalToken().text().replaceAll("[dDfF]$", "");
        try {
            BigDecimal number = new BigDecimal(text);
            return Optional.of(negative ? number.negate() : number);
        } catch (NumberFormatException e) {
            // A hexadecimal literal: left to the full config form.
            return Optional.empty();
        }
    }

    private static Optional<String> stringLiteral(ExpressionNode expression) {
        if (expression instanceof BasicLiteralNode literal && literal.kind() == SyntaxKind.STRING_LITERAL) {
            return ContextFunctionBody.unquote(literal.literalToken().text());
        }
        return Optional.empty();
    }
}
