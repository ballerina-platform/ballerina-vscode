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

package io.ballerina.flowmodelgenerator.core.utils;

import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.syntax.tree.BasicLiteralNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.tools.text.TextRange;
import org.apache.commons.lang3.StringUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Turns the literal values of a new connection's arguments into configurables named after the connection and the
 * connector's init fields, joined in camel case: {@code auth.clientId} of the connection {@code sfSales} becomes
 * {@code sfSalesAuthClientId}. A field the connector requires gets a required configurable; any other gets one that
 * defaults to the literal.
 *
 * @since 1.9.0
 */
public class ConnectionConfigurables {

    private static final Map<TypeDescKind, String> CONFIGURABLE_TYPES = Map.of(
            TypeDescKind.STRING, "string",
            TypeDescKind.INT, "int",
            TypeDescKind.FLOAT, "float",
            TypeDescKind.DECIMAL, "decimal",
            TypeDescKind.BOOLEAN, "boolean");

    private final String connection;
    private final Set<String> existingNames;
    private final Set<String> usedNames = new HashSet<>();
    private final List<Configurable> configurables = new ArrayList<>();

    /**
     * @param connection    the connection's name
     * @param existingNames the module's symbol names; a configurable of such a name is referred to, not declared
     */
    public ConnectionConfigurables(String connection, Set<String> existingNames) {
        this.connection = connection;
        this.existingNames = existingNames;
    }

    /**
     * A configurable to declare, with the literal it replaces.
     *
     * @param name     the configurable's name
     * @param type     the configurable's type
     * @param literal  the literal the connection was given
     * @param required whether the connector requires the field
     */
    public record Configurable(String name, String type, String literal, boolean required) {

        public String declaration() {
            return "configurable %s %s = %s;".formatted(type, name, required ? "?" : literal);
        }

        public String configTomlEntry() {
            return "%s = %s".formatted(name, tomlValue(literal));
        }
    }

    public List<Configurable> configurables() {
        return configurables;
    }

    /**
     * Returns the argument with each literal of a simple-typed field replaced by its configurable. The fields of a
     * record argument are named after the connection alone; a field of an included record, or any other argument, is
     * named after the parameter.
     *
     * @param argument  the argument's source
     * @param parameter the parameter's name
     * @param type      the parameter's type
     * @param included  whether the parameter is a field of an included record
     * @param required  whether the connector requires the argument
     * @return the rewritten argument
     */
    public String rewrite(String argument, String parameter, TypeSymbol type, boolean included, boolean required) {
        ExpressionNode value = NodeParser.parseExpression(argument);
        String name = value instanceof MappingConstructorExpressionNode && !included
                ? connection : fieldName(connection, parameter);
        List<Replacement> replacements = new ArrayList<>();
        collect(value, type, name, required, replacements);
        StringBuilder source = new StringBuilder(argument);
        replacements.stream()
                .sorted(Comparator.comparingInt((Replacement r) -> r.range().startOffset()).reversed())
                .forEach(r -> source.replace(r.range().startOffset(), r.range().endOffset(), r.name()));
        return source.toString();
    }

    /**
     * The configurable name of a field: the name of its parent followed by the field's name, capitalized.
     */
    private static String fieldName(String parent, String field) {
        return parent + Arrays.stream(CommonUtils.removeLeadingSingleQuote(field).split("_"))
                .map(StringUtils::capitalize)
                .collect(Collectors.joining());
    }

    private void collect(ExpressionNode value, TypeSymbol type, String name, boolean required,
                         List<Replacement> replacements) {
        TypeSymbol rawType = CommonUtils.getRawType(type);
        if (value instanceof BasicLiteralNode literal) {
            String configurableType = CONFIGURABLE_TYPES.get(rawType.typeKind());
            if (configurableType == null || !usedNames.add(name)) {
                return;
            }
            replacements.add(new Replacement(literal.literalToken().textRange(), name));
            if (!existingNames.contains(name)) {
                configurables.add(new Configurable(name, configurableType, literal.toSourceCode().strip(),
                        required));
            }
        } else if (value instanceof MappingConstructorExpressionNode mapping) {
            recordOf(rawType, mapping).ifPresent(record -> mapping.fields().forEach(field -> {
                if (!(field instanceof SpecificFieldNode specificField) || specificField.valueExpr().isEmpty()) {
                    return;
                }
                String fieldName = fieldKey(specificField);
                RecordFieldSymbol fieldSymbol = record.fieldDescriptors().get(fieldName);
                if (fieldSymbol != null) {
                    collect(specificField.valueExpr().get(), fieldSymbol.typeDescriptor(), fieldName(name, fieldName),
                            required && isRequired(fieldSymbol), replacements);
                }
            }));
        }
    }

    /**
     * The record a mapping constructor builds: the type itself, or the one member of a union the mapping fits.
     */
    private static Optional<RecordTypeSymbol> recordOf(TypeSymbol rawType, MappingConstructorExpressionNode mapping) {
        if (rawType instanceof RecordTypeSymbol record) {
            return Optional.of(record);
        }
        if (!(rawType instanceof UnionTypeSymbol union)) {
            return Optional.empty();
        }
        Set<String> keys = mapping.fields().stream()
                .filter(SpecificFieldNode.class::isInstance)
                .map(field -> fieldKey((SpecificFieldNode) field))
                .collect(Collectors.toSet());
        List<RecordTypeSymbol> fits = union.memberTypeDescriptors().stream()
                .map(CommonUtils::getRawType)
                .filter(RecordTypeSymbol.class::isInstance)
                .map(RecordTypeSymbol.class::cast)
                .filter(record -> fits(record, keys))
                .toList();
        return fits.size() == 1 ? Optional.of(fits.getFirst()) : Optional.empty();
    }

    private static boolean fits(RecordTypeSymbol record, Set<String> keys) {
        Map<String, RecordFieldSymbol> fields = record.fieldDescriptors();
        boolean known = record.restTypeDescriptor().isPresent() || fields.keySet().containsAll(keys);
        return known && fields.entrySet().stream()
                .filter(field -> isRequired(field.getValue()))
                .allMatch(field -> keys.contains(field.getKey()));
    }

    private static boolean isRequired(RecordFieldSymbol field) {
        return !field.isOptional() && !field.hasDefaultValue();
    }

    private static String fieldKey(SpecificFieldNode field) {
        String key = field.fieldName().toSourceCode().strip();
        if (field.fieldName().kind() == SyntaxKind.STRING_LITERAL) {
            return key.substring(1, key.length() - 1);
        }
        return CommonUtils.removeLeadingSingleQuote(key);
    }

    private static String tomlValue(String literal) {
        if (literal.startsWith("\"") || StringUtils.startsWithIgnoreCase(literal, "0x")) {
            return literal;
        }
        return StringUtils.removeEndIgnoreCase(StringUtils.removeEndIgnoreCase(literal, "d"), "f");
    }

    private record Replacement(TextRange range, String name) {
    }
}
