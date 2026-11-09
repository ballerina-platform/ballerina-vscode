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

import io.ballerina.compiler.api.symbols.Qualifier;
import io.ballerina.compiler.api.symbols.RecordFieldSymbol;
import io.ballerina.compiler.api.symbols.RecordTypeSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeDescKind;
import io.ballerina.compiler.api.symbols.TypeSymbol;
import io.ballerina.compiler.api.symbols.UnionTypeSymbol;
import io.ballerina.compiler.api.symbols.VariableSymbol;
import io.ballerina.compiler.syntax.tree.BasicLiteralNode;
import io.ballerina.compiler.syntax.tree.ExpressionNode;
import io.ballerina.compiler.syntax.tree.MappingConstructorExpressionNode;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.flowmodelgenerator.core.UserFacingException;
import io.ballerina.modelgenerator.commons.CommonUtils;
import io.ballerina.tools.text.TextRange;
import org.apache.commons.lang3.StringUtils;
import org.ballerinalang.langserver.common.utils.CommonUtil;
import org.ballerinalang.langserver.common.utils.NameUtil;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Turns the literal values of a new connection's arguments into configurables named after the connection and the
 * connector's init fields, joined in camel case: {@code auth.clientId} of the connection {@code sfSales} becomes
 * {@code sfSalesAuthClientId}. Each configurable is required, so no literal stays in source; its value goes to
 * Config.toml. A configurable the module declares with the same type and nothing refers to is reused; one something
 * refers to gets a numbered name, like {@code sfSalesBaseUrl1}; any other symbol of the name refuses the connection.
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
    private static final Pattern STRING_ESCAPE = Pattern.compile("\\\\(?:u\\{(\\p{XDigit}{1,6})}|.)");
    private static final Set<String> UNREADABLE_ESCAPES = Set.of("\\n", "\\r");
    private static final Pattern TOML_NUMBER = Pattern.compile(
            "0[xX]\\p{XDigit}+|(0|[1-9]\\d*)(\\.\\d+)?([eE][+-]?\\d+)?");
    private static final Pattern HEX_INTEGER = Pattern.compile("0[xX]\\p{XDigit}+");
    private static final Pattern PLAIN_IDENTIFIER = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
    private static final Pattern BARE_TOML_KEY = Pattern.compile("[A-Za-z0-9_-]+");

    private final String connection;
    private final Map<String, Symbol> moduleSymbols;
    private final Predicate<Symbol> referenced;
    private final Set<String> usedNames = new HashSet<>();
    private final List<Configurable> configurables = new ArrayList<>();

    /**
     * @param connection    the connection's name
     * @param moduleSymbols the module's symbols by name
     * @param referenced    whether anything refers to a symbol
     */
    public ConnectionConfigurables(String connection, Map<String, Symbol> moduleSymbols,
                                   Predicate<Symbol> referenced) {
        this.connection = connection;
        this.moduleSymbols = moduleSymbols;
        this.referenced = referenced;
    }

    /**
     * A configurable the connection refers to, with the literal it replaces.
     *
     * @param name     the configurable's name as source writes it, quoted only if a keyword
     * @param key      the configurable's name as a value, which Config.toml uses
     * @param type     the configurable's type
     * @param literal  the literal the connection was given
     * @param exists   whether the module already declares it
     */
    public record Configurable(String name, String key, String type, String literal, boolean exists) {

        public String declaration() {
            return "configurable %s %s = ?;".formatted(type, name);
        }

        public String configTomlValue() {
            return tomlValue(literal, type.equals("float") || type.equals("decimal"));
        }

        public String configTomlEntry() {
            return "%s = %s".formatted(BARE_TOML_KEY.matcher(key).matches() ? key : tomlChars(key),
                    configTomlValue());
        }
    }

    public List<Configurable> configurables() {
        return configurables;
    }

    /**
     * Returns the argument with each literal of a simple-typed field replaced by its configurable. The fields of a
     * record argument are named after the connection alone, or after the parameter too where that name is taken by
     * another of the connection's fields; a field of an included record, or any other argument, is named after the
     * parameter.
     *
     * @param argument  the argument's source
     * @param parameter the parameter's name
     * @param type      the parameter's type
     * @param included  whether the parameter is a field of an included record
     * @return the rewritten argument
     * @throws UserFacingException if a configurable's name belongs to another kind of symbol of the module, or to
     *                             another of the connection's fields
     */
    public String rewrite(String argument, String parameter, TypeSymbol type, boolean included) {
        ExpressionNode value = NodeParser.parseExpression(argument);
        String named = fieldName(connection, parameter);
        List<String> prefixes = value instanceof MappingConstructorExpressionNode && !included
                ? List.of(connection, named) : List.of(named);
        List<Replacement> replacements = new ArrayList<>();
        collect(value, type, prefixes, "", replacements);
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
        return parent + fieldSuffix(field);
    }

    private static String fieldSuffix(String field) {
        return Arrays.stream(CommonUtils.removeLeadingSingleQuote(field).split("_"))
                .map(StringUtils::capitalize)
                .collect(Collectors.joining());
    }

    private void collect(ExpressionNode value, TypeSymbol type, List<String> prefixes, String suffix,
                         List<Replacement> replacements) {
        TypeSymbol rawType = CommonUtils.getRawType(type);
        if (value instanceof BasicLiteralNode literal) {
            Token token = literal.literalToken();
            Optional<TypeDescKind> kind = configurableKind(rawType, token);
            if (kind.isEmpty() || isEmptyString(token) || hasNoTomlForm(token, kind.get())) {
                return;
            }
            String name = prefixes.stream().map(prefix -> prefix + suffix)
                    .filter(candidate -> !usedNames.contains(valueOf(candidate)))
                    .findFirst()
                    .orElseThrow(() -> new UserFacingException(("Two of this connection's fields would both be "
                            + "configured by '%s'.").formatted(valueOf(prefixes.getLast() + suffix))));
            Symbol existing = moduleSymbols.get(valueOf(name));
            if (existing != null && !isConfigurableOf(existing, kind.get())) {
                throw new UserFacingException("'%s' is already used in this module. Choose another connection name."
                        .formatted(valueOf(name)));
            }
            if (existing != null && referenced.test(existing)) {
                name = distinctName(name, kind.get());
                existing = moduleSymbols.get(valueOf(name));
            }
            name = sourceName(name);
            usedNames.add(valueOf(name));
            replacements.add(new Replacement(literal.literalToken().textRange(), name));
            configurables.add(new Configurable(name, valueOf(name), CONFIGURABLE_TYPES.get(kind.get()),
                    literal.toSourceCode().strip(), existing != null));
        } else if (value instanceof MappingConstructorExpressionNode mapping) {
            recordOf(rawType, mapping).ifPresent(record -> mapping.fields().forEach(field -> {
                if (!(field instanceof SpecificFieldNode specificField) || specificField.valueExpr().isEmpty()) {
                    return;
                }
                String fieldName = fieldKey(specificField);
                RecordFieldSymbol fieldSymbol = record.fieldDescriptors().get(fieldName);
                if (fieldSymbol != null) {
                    collect(specificField.valueExpr().get(), fieldSymbol.typeDescriptor(), prefixes,
                            suffix + fieldSuffix(fieldName), replacements);
                }
            }));
        }
    }

    /**
     * Whether a literal is the form's placeholder for a string field left empty, which stays in source.
     */
    private static boolean isEmptyString(Token literal) {
        return literal.kind() == SyntaxKind.STRING_LITERAL_TOKEN && literal.text().equals("\"\"");
    }

    /**
     * Whether a literal has no Config.toml form Ballerina's config reader accepts, so it stays in source. That's a
     * number TOML doesn't write as Ballerina does, such as <code>.5</code> or <code>0x1.8p1</code>, or a string with a
     * line break (<code>&#92;n</code>, <code>&#92;r</code>) or a character only a code point escape can write, such as
     * <code>&#92;u{7}</code>.
     */
    private static boolean hasNoTomlForm(Token literal, TypeDescKind kind) {
        if (literal.kind() == SyntaxKind.STRING_LITERAL_TOKEN) {
            return STRING_ESCAPE.matcher(literal.text()).results()
                    .map(escape -> escape.group(1) == null ? escape.group()
                            : tomlChar(Integer.parseInt(escape.group(1), 16)))
                    .anyMatch(escape -> UNREADABLE_ESCAPES.contains(escape) || escape.startsWith("\\U"));
        }
        boolean fractional = kind == TypeDescKind.FLOAT || kind == TypeDescKind.DECIMAL;
        return kind != TypeDescKind.BOOLEAN && !TOML_NUMBER.matcher(tomlValue(literal.text(), fractional)).matches();
    }

    /**
     * The name numbered as the extension numbers other names: the first free one, or one held by a configurable of
     * the type that nothing refers to.
     */
    private String distinctName(String name, TypeDescKind kind) {
        Set<String> taken = new HashSet<>(usedNames);
        moduleSymbols.forEach((symbolName, symbol) -> {
            if (!isConfigurableOf(symbol, kind) || referenced.test(symbol)) {
                taken.add(symbolName);
            }
        });
        String value = NameUtil.generateTypeName(valueOf(name), taken);
        return name + value.substring(valueOf(name).length());
    }

    /**
     * The simple type a literal configures: the parameter's own, or the one member of its union the literal belongs
     * to, such as {@code string} of {@code string?}.
     */
    private static Optional<TypeDescKind> configurableKind(TypeSymbol rawType, Token literal) {
        List<TypeDescKind> kinds = rawType instanceof UnionTypeSymbol union
                ? union.memberTypeDescriptors().stream().map(member -> CommonUtils.getRawType(member).typeKind())
                .toList()
                : List.of(rawType.typeKind());
        List<TypeDescKind> candidates = switch (literal.kind()) {
            case STRING_LITERAL_TOKEN -> List.of(TypeDescKind.STRING);
            case TRUE_KEYWORD, FALSE_KEYWORD -> List.of(TypeDescKind.BOOLEAN);
            case DECIMAL_INTEGER_LITERAL_TOKEN, HEX_INTEGER_LITERAL_TOKEN ->
                    List.of(TypeDescKind.INT, TypeDescKind.FLOAT, TypeDescKind.DECIMAL);
            case DECIMAL_FLOATING_POINT_LITERAL_TOKEN -> StringUtils.endsWithIgnoreCase(literal.text(), "d")
                    ? List.of(TypeDescKind.DECIMAL) : StringUtils.endsWithIgnoreCase(literal.text(), "f")
                    ? List.of(TypeDescKind.FLOAT) : List.of(TypeDescKind.FLOAT, TypeDescKind.DECIMAL);
            case HEX_FLOATING_POINT_LITERAL_TOKEN -> List.of(TypeDescKind.FLOAT, TypeDescKind.DECIMAL);
            default -> List.of();
        };
        return candidates.stream().filter(kinds::contains).findFirst();
    }

    /**
     * A name as written in source, such as {@code 'client} or {@code my\-client}, as a value: {@code client},
     * {@code my-client}.
     */
    private static String valueOf(String name) {
        return STRING_ESCAPE.matcher(CommonUtils.removeLeadingSingleQuote(name)).replaceAll(escape -> Matcher
                .quoteReplacement(escape.group(1) == null ? escape.group().substring(1)
                        : Character.toString(Integer.parseInt(escape.group(1), 16))));
    }

    private static boolean isConfigurableOf(Symbol symbol, TypeDescKind kind) {
        return isConfigurable(symbol)
                && CommonUtils.getRawType(((VariableSymbol) symbol).typeDescriptor()).typeKind() == kind;
    }

    private static boolean isConfigurable(Symbol symbol) {
        return symbol instanceof VariableSymbol variable && variable.qualifiers().contains(Qualifier.CONFIGURABLE);
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

    /**
     * A literal as a TOML value. An integer for a float or decimal gets a fraction, as Ballerina before 2201.14 reads
     * no TOML integer into either.
     */
    private static String tomlValue(String literal, boolean fractional) {
        if (literal.startsWith("\"")) {
            return tomlString(literal);
        }
        if (StringUtils.startsWithIgnoreCase(literal, "0x")) {
            return fractional && HEX_INTEGER.matcher(literal).matches()
                    ? new BigInteger(literal.substring(2), 16) + ".0" : literal;
        }
        String value = StringUtils.removeEndIgnoreCase(StringUtils.removeEndIgnoreCase(literal, "d"), "f");
        return fractional && StringUtils.isNumeric(value) ? value + ".0" : value;
    }

    /**
     * A name as source writes it, quoted only if a keyword: connection {@code 'client} gets {@code clientHost}.
     */
    private static String sourceName(String name) {
        String value = valueOf(name);
        return PLAIN_IDENTIFIER.matcher(value).matches() ? CommonUtil.escapeReservedKeyword(value) : name;
    }

    private static String tomlChars(String value) {
        return value.codePoints().mapToObj(ConnectionConfigurables::tomlChar)
                .collect(Collectors.joining("", "\"", "\""));
    }

    /**
     * A Ballerina string literal as a TOML string: the escapes are the same, except a code point,
     * <code>&#92;u{1F600}</code>, which becomes the character itself. Ballerina reads no TOML code point escape.
     */
    private static String tomlString(String literal) {
        return STRING_ESCAPE.matcher(literal).replaceAll(escape -> Matcher.quoteReplacement(escape.group(1) == null
                ? escape.group() : tomlChar(Integer.parseInt(escape.group(1), 16))));
    }

    private static String tomlChar(int codePoint) {
        return switch (codePoint) {
            case '"' -> "\\\"";
            case '\\' -> "\\\\";
            case '\t' -> "\\t";
            case '\n' -> "\\n";
            case '\r' -> "\\r";
            default -> Character.isValidCodePoint(codePoint) && !Character.isISOControl(codePoint)
                    ? Character.toString(codePoint) : "\\U%08X".formatted(codePoint);
        };
    }

    private record Replacement(TextRange range, String name) {
    }
}
