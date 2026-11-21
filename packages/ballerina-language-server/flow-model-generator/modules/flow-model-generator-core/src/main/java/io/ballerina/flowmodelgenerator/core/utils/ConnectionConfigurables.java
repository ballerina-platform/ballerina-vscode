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
import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.SimpleNameReferenceNode;
import io.ballerina.compiler.syntax.tree.SpecificFieldNode;
import io.ballerina.compiler.syntax.tree.SyntaxKind;
import io.ballerina.compiler.syntax.tree.TemplateExpressionNode;
import io.ballerina.compiler.syntax.tree.Token;
import io.ballerina.compiler.syntax.tree.UnaryExpressionNode;
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
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Turns the literal values of a connection's arguments into configurables named after the connection and the
 * connector's init fields, joined in camel case: {@code auth.clientId} of the connection {@code sfSales} becomes
 * {@code sfSalesAuthClientId}. Each configurable is required; its value goes to Config.toml.
 * <p>
 * Which literals become configurables follows what the connection form sent for each field (a {@link Choice}): a
 * field the user chose to keep stays in source, and one they named takes that name. A field with no choice becomes a
 * configurable for a new connection, and stays in source for an edited one ({@link #keepingUnchosen}).
 * <p>
 * A generated name that the module declares as a configurable of the same type, and nothing refers to, is reused; one
 * something refers to gets a numbered name, like {@code sfSalesBaseUrl1}; any other symbol of the name refuses the
 * connection. A name the user chose is never numbered: a clash refuses the connection. A configurable the connection
 * already uses keeps being used, and two of its fields can share one if they give it the same value.
 * <p>
 * In preview mode nothing is refused: each field's configurable, or the reason it can't have one, is reported in
 * {@link #previews()} instead.
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
    private final boolean preview;
    private final Set<String> usedNames = new HashSet<>();
    private boolean keepUnchosen;
    // The configurables the connection already uses that a field has taken, with the value it gives them: another
    // field that already shares one keeps sharing it, if it gives the same value.
    private final Map<String, String> sharedValues = new HashMap<>();
    private final List<Configurable> configurables = new ArrayList<>();
    private final List<Preview> previews = new ArrayList<>();
    // The argument rewrite() is working on: its parameter, and what the user chose for its fields.
    private String parameter = "";
    private Map<String, Choice> choices = Map.of();
    // What an existing configurable is set to, as a Ballerina literal, and where it is declared, by its name.
    private Function<String, Optional<String>> configuredValue = name -> Optional.empty();
    private Function<Symbol, Optional<Declaration>> declarationOf = symbol -> Optional.empty();

    /**
     * @param connection    the connection's name
     * @param moduleSymbols the module's symbols by name
     * @param referenced    whether anything refers to a symbol
     */
    public ConnectionConfigurables(String connection, Map<String, Symbol> moduleSymbols,
                                   Predicate<Symbol> referenced) {
        this(connection, moduleSymbols, referenced, false);
    }

    /**
     * @param connection    the connection's name
     * @param moduleSymbols the module's symbols by name
     * @param referenced    whether anything refers to a symbol
     * @param preview       whether to report each field's configurable, or the reason it can't have one, instead of
     *                      refusing the connection; see {@link #previews()}
     */
    public ConnectionConfigurables(String connection, Map<String, Symbol> moduleSymbols,
                                   Predicate<Symbol> referenced, boolean preview) {
        this.connection = connection;
        this.moduleSymbols = moduleSymbols;
        this.referenced = referenced;
        this.preview = preview;
    }

    /**
     * What the user chose for one field of an argument in the connection form: to keep its literal in source, or the
     * name its configurable takes in place of the generated one.
     *
     * @param name     the configurable's name, or {@code null} for the generated one
     * @param keep     whether the literal stays in source
     * @param existing whether the name is a configurable the connection already uses, which it keeps using, and whose
     *                 value it sets, even if other code refers to it too
     */
    public record Choice(String name, boolean keep, boolean existing) {

        public Choice(String name, boolean keep) {
            this(name, keep, false);
        }

        /**
         * The choices an argument's property carries in its codedata, keyed by the field's path within the argument
         * ({@code auth.token}, or {@code ""} for the argument itself): {@code {"auth.token": {"name": "apiToken"}}}.
         */
        public static Map<String, Choice> fromData(Object data) {
            if (!(data instanceof Map<?, ?> entries)) {
                return Map.of();
            }
            Map<String, Choice> choices = new HashMap<>();
            entries.forEach((path, value) -> {
                if (path instanceof String fieldPath && value instanceof Map<?, ?> choice) {
                    Object name = choice.get("name");
                    choices.put(fieldPath, new Choice(name instanceof String text && !text.isBlank() ? text.strip()
                            : null, Boolean.TRUE.equals(choice.get("keep")),
                            Boolean.TRUE.equals(choice.get("existing"))));
                }
            });
            return choices;
        }
    }

    /**
     * A field of an argument that a configurable can stand for, as the connection form shows it before the
     * connection is saved.
     *
     * @param parameter the parameter the argument is given for
     * @param fieldPath the field's path within the argument, or {@code ""} for the argument itself
     * @param name      the configurable's name: the one saving gives it, or would give it if the field kept no literal
     * @param type      the configurable's type
     * @param exists    whether the module already declares it
     * @param kept      whether the user chose to keep the literal
     * @param error       why the field can't be given this configurable, or {@code null}
     * @param value       for a configurable the connection already uses, its value as a Ballerina literal, read from
     *                    Config.toml; {@code null} if it has none there
     * @param existing    whether the connection already uses this configurable
     * @param declaration where an existing configurable is declared, for renaming it; {@code null} if unknown
     * @param key         the key of the parameter's property in the connection form, which differs from the
     *                    parameter's name for a reserved one ({@code connection} is {@code $connection}); {@code null}
     *                    until the connection's builder sets it
     */
    public record Preview(String parameter, String fieldPath, String name, String type, boolean exists,
                          boolean kept, String error, String value, boolean existing, Declaration declaration,
                          String key) {

        public Preview(String parameter, String fieldPath, String name, String type, boolean exists, boolean kept,
                       String error, String value, boolean existing, Declaration declaration) {
            this(parameter, fieldPath, name, type, exists, kept, error, value, existing, declaration, null);
        }

        public Preview(String parameter, String fieldPath, String name, String type, boolean exists, boolean kept,
                       String error) {
            this(parameter, fieldPath, name, type, exists, kept, error, null, false, null);
        }

        /**
         * This preview, for the parameter's property of the given key.
         */
        public Preview withKey(String key) {
            return new Preview(parameter, fieldPath, name, type, exists, kept, error, value, existing, declaration,
                    key);
        }
    }

    /**
     * Where a configurable is declared: its name's position in its file.
     *
     * @param filePath the file's path
     * @param line     the zero-based line of the name
     * @param offset   the zero-based column of the name
     */
    public record Declaration(String filePath, int line, int offset) {
    }

    /**
     * Keeps in source each literal the form sent no choice for, as for an edited connection: the user saw it as a
     * literal, so only the fields they made configurable become configurables.
     *
     * @param keep whether a literal without a choice stays in source
     * @return this
     */
    public ConnectionConfigurables keepingUnchosen(boolean keep) {
        this.keepUnchosen = keep;
        return this;
    }

    /**
     * Lets a preview show the configurables the connection already uses: their values and where they are declared.
     *
     * @param configuredValue an existing configurable's value as a Ballerina literal, by its name
     * @param declarationOf   where a configurable is declared
     * @return this
     */
    public ConnectionConfigurables withExisting(Function<String, Optional<String>> configuredValue,
                                                Function<Symbol, Optional<Declaration>> declarationOf) {
        this.configuredValue = configuredValue;
        this.declarationOf = declarationOf;
        return this;
    }

    /**
     * What saving would make of a new connection's literals, worked out without saving it.
     *
     * @param configurables each field a configurable can stand for, in argument order
     * @param arguments     each argument as saving would write it, by its property's key: the literals replaced by
     *                      their configurables' names, as the connection form shows it before the user saves
     */
    public record PreviewResult(List<Preview> configurables, Map<String, String> arguments) {
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
     * Each field the arguments rewritten so far could configure, in order; collected only when previewing.
     */
    public List<Preview> previews() {
        return previews;
    }

    /**
     * {@link #rewrite(String, String, TypeSymbol, boolean)} with the user's choices for the argument's fields.
     *
     * @param choices what the user chose, by the field's path within the argument
     */
    public String rewrite(String argument, String parameter, TypeSymbol type, boolean included,
                          Map<String, Choice> choices) {
        this.parameter = parameter;
        this.choices = choices;
        try {
            return rewrite(argument, parameter, type, included);
        } finally {
            this.choices = Map.of();
        }
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
     *                             another of the connection's fields; in preview mode the field's preview reports it
     *                             instead
     */
    public String rewrite(String argument, String parameter, TypeSymbol type, boolean included) {
        this.parameter = parameter;
        ExpressionNode value = NodeParser.parseExpression(argument);
        String named = fieldName(connection, parameter);
        List<String> prefixes = value instanceof MappingConstructorExpressionNode && !included
                ? List.of(connection, named) : List.of(named);
        List<Replacement> replacements = new ArrayList<>();
        collect(value, type, prefixes, "", "", replacements);
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

    private void collect(ExpressionNode value, TypeSymbol type, List<String> prefixes, String suffix, String path,
                         List<Replacement> replacements) {
        TypeSymbol rawType = CommonUtils.getRawType(type);
        // A form's text box writes a string as a template; one without interpolations is that string's literal.
        // A negative number is the literal under a minus.
        Optional<BasicLiteralNode> literalValue = value instanceof BasicLiteralNode basic ? Optional.of(basic)
                : plainStringTemplate(value).or(() -> negativeNumber(value));
        if (literalValue.isPresent()) {
            BasicLiteralNode literal = literalValue.get();
            // What the configurable replaces: the literal's token, or the whole template or negation it stands for.
            TextRange range = literal == value ? literal.literalToken().textRange() : value.textRange();
            Token token = literal.literalToken();
            String written = (value instanceof UnaryExpressionNode ? "-" : "") + literal.toSourceCode().strip();
            Optional<TypeDescKind> kind = configurableKind(rawType, token);
            Choice choice = choices.get(path) == null && keepUnchosen ? new Choice(null, true) : choices.get(path);
            // An empty string is the form's placeholder, except as the value of a configurable the connection already
            // uses, which it keeps using.
            boolean keepsExisting = choice != null && !choice.keep() && choice.name() != null && choice.existing();
            if (kind.isEmpty() || (isEmptyString(token) && !keepsExisting) || hasNoTomlForm(token, kind.get())) {
                return;
            }
            String configType = CONFIGURABLE_TYPES.get(kind.get());
            if (choice != null && choice.keep()) {
                if (preview) {
                    // Shown so the user sees the name the field gets if they change their mind; it takes no name.
                    String candidate = choice.name() != null ? choice.name()
                            : prefixes.stream().map(prefix -> prefix + suffix)
                            .filter(name -> !usedNames.contains(valueOf(name)))
                            .findFirst().orElse(prefixes.getLast() + suffix);
                    previews.add(new Preview(parameter, path, valueOf(candidate), configType, false, true, null));
                }
                return;
            }
            String name;
            Symbol existing;
            if (choice != null && choice.name() != null && choice.existing()
                    && written.equals(sharedValues.get(choice.name()))
                    && moduleSymbols.get(choice.name()) != null
                    && isConfigurableOf(moduleSymbols.get(choice.name()), kind.get())) {
                // Another of the connection's fields already uses this configurable with the same value.
                replacements.add(new Replacement(range, sourceName(choice.name())));
                if (preview) {
                    Symbol shared = moduleSymbols.get(choice.name());
                    previews.add(new Preview(parameter, path, choice.name(), configType, shared != null, false, null,
                            null, true, shared != null ? declarationOf.apply(shared).orElse(null) : null));
                }
                return;
            }
            if (choice != null && choice.name() != null) {
                String problem = chosenNameProblem(choice.name(), kind.get(), choice.existing());
                if (problem != null) {
                    refuse(path, choice.name(), configType, problem);
                    return;
                }
                name = choice.name();
                existing = moduleSymbols.get(name);
            } else {
                Optional<String> free = prefixes.stream().map(prefix -> prefix + suffix)
                        .filter(candidate -> !usedNames.contains(valueOf(candidate)))
                        .findFirst();
                if (free.isEmpty()) {
                    String taken = valueOf(prefixes.getLast() + suffix);
                    refuse(path, taken, configType,
                            "Two of this connection's fields would both be configured by '%s'.".formatted(taken));
                    return;
                }
                name = free.get();
                existing = moduleSymbols.get(valueOf(name));
                if (existing != null && !isConfigurableOf(existing, kind.get())) {
                    refuse(path, valueOf(name), configType,
                            "'%s' is already used in this module. Choose another connection name."
                                    .formatted(valueOf(name)));
                    return;
                }
                if (existing != null && referenced.test(existing)) {
                    name = distinctName(name, kind.get());
                    existing = moduleSymbols.get(valueOf(name));
                }
            }
            name = sourceName(name);
            usedNames.add(valueOf(name));
            if (choice != null && choice.existing()) {
                sharedValues.put(valueOf(name), written);
            }
            replacements.add(new Replacement(range, name));
            configurables.add(new Configurable(name, valueOf(name), configType, written, existing != null));
            if (preview) {
                boolean alreadyUsed = choice != null && choice.existing();
                previews.add(new Preview(parameter, path, valueOf(name), configType, existing != null, false, null,
                        null, alreadyUsed, alreadyUsed && existing != null ? declarationOf.apply(existing).orElse(null)
                        : null));
            }
        } else if (value instanceof SimpleNameReferenceNode reference) {
            // A configurable the connection already uses: its name is taken, and a preview shows its value.
            Symbol symbol = moduleSymbols.get(valueOf(reference.name().text()));
            if (symbol == null || !isConfigurable(symbol)) {
                return;
            }
            String configType = CONFIGURABLE_TYPES.get(
                    CommonUtils.getRawType(((VariableSymbol) symbol).typeDescriptor()).typeKind());
            if (configType == null) {
                return;
            }
            String name = valueOf(reference.name().text());
            usedNames.add(name);
            if (preview) {
                previews.add(new Preview(parameter, path, name, configType, true, false, null,
                        configuredValue.apply(name).orElse(null), true, declarationOf.apply(symbol).orElse(null)));
            }
        } else if (value instanceof MappingConstructorExpressionNode mapping) {
            recordOf(rawType, mapping).ifPresent(record -> mapping.fields().forEach(field -> {
                if (!(field instanceof SpecificFieldNode specificField) || specificField.valueExpr().isEmpty()) {
                    return;
                }
                String fieldName = fieldKey(specificField);
                RecordFieldSymbol fieldSymbol = record.fieldDescriptors().get(fieldName);
                if (fieldSymbol != null) {
                    collect(specificField.valueExpr().get(), fieldSymbol.typeDescriptor(), prefixes,
                            suffix + fieldSuffix(fieldName), path.isEmpty() ? fieldName : path + "." + fieldName,
                            replacements);
                }
            }));
        }
    }

    /**
     * Why a name the user gave a field's configurable can't be used, or {@code null} if it can. Unlike a generated
     * name it is never numbered: the user chose it, so a clash is theirs to resolve.
     */
    private String chosenNameProblem(String name, TypeDescKind kind, boolean alreadyUsed) {
        Symbol existing = moduleSymbols.get(name);
        // A configurable the connection already uses keeps its name, whatever letters it is written in.
        boolean keepsExisting = alreadyUsed && existing != null && isConfigurableOf(existing, kind);
        if (!keepsExisting && !PLAIN_IDENTIFIER.matcher(name).matches()) {
            return "'%s' is not a valid name. Use letters, digits and _, and don't start with a digit."
                    .formatted(name);
        }
        if (name.equals(valueOf(connection))) {
            return "'%s' is the connection's own name. Choose another name.".formatted(name);
        }
        if (usedNames.contains(name)) {
            return "Two of this connection's fields would both be configured by '%s'.".formatted(name);
        }
        // Other code may refer to a configurable the connection already uses; one it doesn't use yet would change
        // under that code.
        if (existing != null && (!isConfigurableOf(existing, kind) || (referenced.test(existing) && !alreadyUsed))) {
            return "'%s' is already used in this module. Choose another name.".formatted(name);
        }
        return null;
    }

    /**
     * Refuses the connection over a field's configurable, or, when previewing, reports why and leaves the literal.
     */
    private void refuse(String path, String name, String type, String message) {
        if (!preview) {
            throw new UserFacingException(message);
        }
        previews.add(new Preview(parameter, path, name, type, false, false, message));
    }

    /**
     * The number literal a negative number negates, as {@code 1} for {@code -1}.
     */
    private static Optional<BasicLiteralNode> negativeNumber(ExpressionNode value) {
        // TOML writes no sign before a hexadecimal number, so a negative one stays in source.
        if (value instanceof UnaryExpressionNode unary && unary.unaryOperator().kind() == SyntaxKind.MINUS_TOKEN
                && unary.expression() instanceof BasicLiteralNode literal
                && (literal.literalToken().kind() == SyntaxKind.DECIMAL_INTEGER_LITERAL_TOKEN
                || literal.literalToken().kind() == SyntaxKind.DECIMAL_FLOATING_POINT_LITERAL_TOKEN)) {
            return Optional.of(literal);
        }
        return Optional.empty();
    }

    /**
     * The string literal a <code>string `...`</code> template stands for when it interpolates nothing, as the
     * connection form's text box writes a string.
     */
    private static Optional<BasicLiteralNode> plainStringTemplate(ExpressionNode value) {
        if (!(value instanceof TemplateExpressionNode template)
                || template.kind() != SyntaxKind.STRING_TEMPLATE_EXPRESSION
                || template.content().stream().anyMatch(part -> part.kind() != SyntaxKind.TEMPLATE_STRING)) {
            return Optional.empty();
        }
        String text = template.content().stream().map(Node::toSourceCode).collect(Collectors.joining());
        return NodeParser.parseExpression(ballerinaStringLiteral(text)) instanceof BasicLiteralNode literal
                ? Optional.of(literal) : Optional.empty();
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
            return hasNoTomlForm(literal.text());
        }
        boolean fractional = kind == TypeDescKind.FLOAT || kind == TypeDescKind.DECIMAL;
        return kind != TypeDescKind.BOOLEAN && !TOML_NUMBER.matcher(tomlValue(literal.text(), fractional)).matches();
    }

    /**
     * Whether a Ballerina string literal has no Config.toml form Ballerina's config reader accepts (see
     * {@link #hasNoTomlForm(Token, TypeDescKind)}): a value read from Config.toml that has none can't be saved back
     * there, so it is not shown as a configurable's value.
     *
     * @param stringLiteral the string literal, quotes included
     * @return whether it stays in source
     */
    public static boolean hasNoTomlForm(String stringLiteral) {
        return STRING_ESCAPE.matcher(stringLiteral).results()
                .map(escape -> escape.group(1) == null ? escape.group()
                        : tomlChar(Integer.parseInt(escape.group(1), 16)))
                .anyMatch(escape -> UNREADABLE_ESCAPES.contains(escape) || escape.startsWith("\\U"));
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
        if (literal.startsWith("-")) {
            return "-" + tomlValue(literal.substring(1), fractional);
        }
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

    /**
     * Text as a Ballerina string literal: what the connection form shows for a configurable's string value.
     */
    public static String ballerinaStringLiteral(String text) {
        StringBuilder literal = new StringBuilder("\"");
        text.codePoints().forEach(codePoint -> literal.append(switch (codePoint) {
            case '"' -> "\\\"";
            case '\\' -> "\\\\";
            case '\t' -> "\\t";
            case '\n' -> "\\n";
            case '\r' -> "\\r";
            default -> Character.isISOControl(codePoint) ? "\\u{%X}".formatted(codePoint)
                    : Character.toString(codePoint);
        }));
        return literal.append('"').toString();
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
