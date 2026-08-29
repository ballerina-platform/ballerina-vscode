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

package io.ballerina.servicemodelgenerator.extension.validation.rules;

import com.google.gson.JsonPrimitive;
import io.ballerina.servicemodelgenerator.extension.model.Value;

import java.net.URI;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;
import java.util.stream.Collectors;

/**
 * Server-side implementations of the {@code common.*} rule catalog — the authoritative re-check of the
 * same rules the webview runs while typing, since the client is untrusted. Every validator is pure.
 *
 * @since 1.8.0
 */
public final class CommonRuleValidators {

    private CommonRuleValidators() {
    }

    private static final Pattern IDENTIFIER_PATTERN = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    private static final Pattern PATH_PARAM_PATTERN =
            Pattern.compile("^\\[\\s*[a-zA-Z_][a-zA-Z0-9_:]*\\s+[a-zA-Z_][a-zA-Z0-9_]*\\s*]$");

    /** A {@code string `...`} template literal, as the text editors serialize their content. */
    private static final Pattern STRING_TEMPLATE_PATTERN = Pattern.compile("^string\\s*`([\\s\\S]*)`$");

    private static final int DEFAULT_MIN_PORT = 1;
    private static final int DEFAULT_MAX_PORT = 65535;

    private static final Set<String> RESERVED_WORDS = Set.of(
            "abstract", "annotation", "any", "anydata", "as", "boolean", "break", "byte", "catch", "channel",
            "check", "checkpanic", "client", "commit", "const", "continue", "decimal", "distinct", "do",
            "else", "enum", "error", "external", "fail", "false", "final", "finally", "float", "flush",
            "fork", "function", "future", "handle", "if", "import", "in", "int", "is", "isolated", "join",
            "json", "let", "limit", "listener", "lock", "map", "match", "never", "new", "null", "object",
            "on", "outer", "panic", "parameterized", "private", "public", "readonly", "record", "remote",
            "resource", "retry", "return", "returns", "rollback", "service", "start", "stream", "string",
            "table", "transaction", "transactional", "trap", "true", "type", "typedesc", "typeof", "var",
            "wait", "while", "worker", "xml", "xmlns");

    /** Every {@code common.*} rule, keyed by id, ready to register with the engine. */
    public static Map<String, RuleValidator> validators() {
        Map<String, RuleValidator> validators = new LinkedHashMap<>();
        validators.put("common.validate.required", (node, args, ctx) -> required(node));
        validators.put("common.validate.non.empty", (node, args, ctx) -> nonEmpty(node));
        validators.put("common.validate.identifier", (node, args, ctx) -> identifier(node));
        validators.put("common.validate.regex", (node, args, ctx) -> regex(node, args));
        validators.put("common.validate.number.range", (node, args, ctx) -> numberRange(node, args));
        validators.put("common.validate.port", (node, args, ctx) -> port(node, args));
        validators.put("common.validate.min.length", (node, args, ctx) -> minLength(node, args));
        validators.put("common.validate.max.length", (node, args, ctx) -> maxLength(node, args));
        validators.put("common.validate.url", (node, args, ctx) -> url(node, args));
        validators.put("common.validate.service.path", (node, args, ctx) -> servicePath(node));
        validators.put("common.validate.enum", (node, args, ctx) -> enumValue(node, args));
        validators.put("common.validate.non.negative", (node, args, ctx) -> nonNegative(node));
        return validators;
    }

    private static Optional<String> required(Value node) {
        return isBlank(node) ? Optional.of("{label} is required") : Optional.empty();
    }

    /**
     * Rejects a string field whose literal content is empty (e.g. {@code ""}), distinct from
     * {@code required} which only checks whether the node holds a value at all.
     */
    private static Optional<String> nonEmpty(Value node) {
        return stringContent(text(node)).isEmpty() ? Optional.of("{label} cannot be empty") : Optional.empty();
    }

    /**
     * Unwraps a string literal's content ({@code "x"} / {@code string `x`} &rarr; {@code x}); non-literals pass
     * through unchanged.
     */
    private static String stringContent(String raw) {
        String trimmed = raw.trim();
        if (trimmed.length() >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
            return trimmed.substring(1, trimmed.length() - 1).trim();
        }
        Matcher template = STRING_TEMPLATE_PATTERN.matcher(trimmed);
        if (template.matches()) {
            return template.group(1).trim();
        }
        return trimmed;
    }

    private static Optional<String> identifier(Value node) {
        String raw = text(node);
        if (raw.isEmpty()) {
            // Emptiness is `required`'s concern, not this rule's.
            return Optional.empty();
        }
        String failure = "{label} must be a valid Ballerina identifier";
        if (raw.startsWith("'")) {
            // A quoted identifier may legally spell a reserved word.
            return IDENTIFIER_PATTERN.matcher(raw.substring(1)).matches() ? Optional.empty() : Optional.of(failure);
        }
        if (!IDENTIFIER_PATTERN.matcher(raw).matches() || RESERVED_WORDS.contains(raw)) {
            return Optional.of(failure);
        }
        return Optional.empty();
    }

    private static Optional<String> regex(Value node, Map<String, Object> args) {
        Optional<String> pattern = stringArg(args, "pattern");
        if (pattern.isEmpty()) {
            return Optional.empty();
        }
        Pattern compiled;
        try {
            compiled = Pattern.compile(pattern.get());
        } catch (PatternSyntaxException e) {
            // An unparseable pattern is an authoring error, never a user error — skip the rule.
            return Optional.empty();
        }
        String failure = "{label} has an invalid format";
        // Multi-value fields are checked per item — the comma-joined form would be meaningless.
        List<String> items = multiValues(node);
        if (items != null) {
            return items.stream().anyMatch(item -> !compiled.matcher(item == null ? "" : item).matches())
                    ? Optional.of(failure)
                    : Optional.empty();
        }
        String raw = text(node);
        if (raw.isEmpty()) {
            return Optional.empty();
        }
        return compiled.matcher(raw).matches() ? Optional.empty() : Optional.of(failure);
    }

    private static Optional<String> numberRange(Value node, Map<String, Object> args) {
        String raw = text(node);
        if (raw.isEmpty()) {
            return Optional.empty();
        }
        Optional<Double> min = numberArg(args, "min");
        Optional<Double> max = numberArg(args, "max");
        Optional<Double> parsed = toNumber(raw);
        if (parsed.isEmpty()) {
            return Optional.of(rangeMessage(min, max));
        }
        double number = parsed.get();
        boolean belowMin = min.isPresent() && number < min.get();
        boolean aboveMax = max.isPresent() && number > max.get();
        return belowMin || aboveMax ? Optional.of(rangeMessage(min, max)) : Optional.empty();
    }

    private static Optional<String> port(Value node, Map<String, Object> args) {
        String raw = text(node);
        if (raw.isEmpty()) {
            return Optional.empty();
        }
        Optional<Double> parsed = toNumber(raw);
        if (parsed.isEmpty()) {
            // The field may legally hold an `http:Listener` expression instead of a port number.
            return Optional.empty();
        }
        double min = numberArg(args, "min").orElse((double) DEFAULT_MIN_PORT);
        double max = numberArg(args, "max").orElse((double) DEFAULT_MAX_PORT);
        double number = parsed.get();
        if (number >= min && number <= max) {
            return Optional.empty();
        }
        // Bounds are baked into the message since they may come from defaults, not model args.
        return Optional.of("{label} must be a valid port (%s–%s)".formatted(plain(min), plain(max)));
    }

    private static Optional<String> minLength(Value node, Map<String, Object> args) {
        Optional<Double> min = numberArg(args, "min");
        if (min.isEmpty()) {
            return Optional.empty();
        }
        String failure = "{label} must be at least {min} characters";
        List<String> items = multiValues(node);
        if (items != null) {
            return items.stream().anyMatch(item -> trimmedLength(item) < min.get())
                    ? Optional.of(failure) : Optional.empty();
        }
        String raw = text(node);
        if (raw.isEmpty()) {
            return Optional.empty();
        }
        return raw.length() < min.get() ? Optional.of(failure) : Optional.empty();
    }

    private static Optional<String> maxLength(Value node, Map<String, Object> args) {
        Optional<Double> max = numberArg(args, "max");
        if (max.isEmpty()) {
            return Optional.empty();
        }
        String failure = "{label} must be at most {max} characters";
        List<String> items = multiValues(node);
        if (items != null) {
            return items.stream().anyMatch(item -> trimmedLength(item) > max.get())
                    ? Optional.of(failure) : Optional.empty();
        }
        return text(node).length() > max.get() ? Optional.of(failure) : Optional.empty();
    }

    private static int trimmedLength(String item) {
        return item == null ? 0 : item.trim().length();
    }

    private static Optional<String> url(Value node, Map<String, Object> args) {
        String raw = stripQuotes(text(node));
        if (raw.isEmpty()) {
            return Optional.empty();
        }
        String failure = "{label} must be a valid URL";
        URI uri;
        try {
            uri = new URI(raw);
        } catch (Exception e) {
            return Optional.of(failure);
        }
        if (!uri.isAbsolute() || uri.getHost() == null) {
            return Optional.of(failure);
        }
        List<String> schemes = stringListArg(args, "schemes");
        if (!schemes.isEmpty() && !schemes.contains(uri.getScheme().toLowerCase(Locale.ROOT))) {
            return Optional.of(failure);
        }
        return Optional.empty();
    }

    private static Optional<String> servicePath(Value node) {
        String raw = stripQuotes(text(node));
        if (raw.isEmpty()) {
            return Optional.empty();
        }
        return isValidPath(raw, false)
                ? Optional.empty()
                : Optional.of("{label} must be a valid service path");
    }

    private static Optional<String> enumValue(Value node, Map<String, Object> args) {
        List<String> values = stringListArg(args, "values");
        if (values.isEmpty()) {
            return Optional.empty();
        }
        String raw = text(node);
        if (raw.isEmpty()) {
            return Optional.empty();
        }
        return values.contains(raw) ? Optional.empty() : Optional.of("{label} must be one of: {values}");
    }

    private static Optional<String> nonNegative(Value node) {
        Optional<Double> parsed = toNumber(text(node));
        if (parsed.isEmpty()) {
            return Optional.empty();
        }
        return parsed.get() < 0 ? Optional.of("{label} cannot be negative") : Optional.empty();
    }

    /** Segments are identifiers or (when {@code allowPathParams}) path params; a leading / is optional. */
    private static boolean isValidPath(String path, boolean allowPathParams) {
        if (path.chars().anyMatch(Character::isWhitespace)) {
            return false;
        }
        if ("/".equals(path)) {
            return true;
        }
        String[] segments = path.replaceFirst("^/", "").split("/", -1);
        return Arrays.stream(segments).allMatch(segment -> {
            if (segment.isEmpty()) {
                return false;
            }
            if (allowPathParams && PATH_PARAM_PATTERN.matcher(segment).matches()) {
                return true;
            }
            String bare = segment.startsWith("'") ? segment.substring(1) : segment;
            return IDENTIFIER_PATTERN.matcher(bare).matches();
        });
    }

    /** Renders a whole number without Java's trailing ".0". */
    private static String plain(double number) {
        if (Double.isNaN(number) || Double.isInfinite(number)) {
            return String.valueOf(number);
        }
        return Double.compare(number, Math.floor(number)) == 0
                ? String.valueOf((long) number)
                : String.valueOf(number);
    }

    private static String rangeMessage(Optional<Double> min, Optional<Double> max) {
        if (min.isPresent() && max.isPresent()) {
            return "{label} must be between {min} and {max}";
        }
        if (min.isPresent()) {
            return "{label} must be at least {min}";
        }
        if (max.isPresent()) {
            return "{label} must be at most {max}";
        }
        return "{label} must be a number";
    }

    /** The node's value as trimmed text; multi-value nodes join their entries. */
    public static String text(Value node) {
        if (node == null) {
            return "";
        }
        List<String> values = node.getValues();
        if (values != null && !values.isEmpty()) {
            return String.join(", ", values).trim();
        }
        String valueString = node.getValueString();
        return valueString == null ? "" : valueString.trim();
    }

    /** Entries of a multi-value node, or {@code null} for a scalar — avoids {@link #text}'s comma-joined form. */
    private static List<String> multiValues(Value node) {
        if (node == null) {
            return null;
        }
        List<String> values = node.getValues();
        return values != null && !values.isEmpty() ? values : null;
    }

    /** Empty for validation purposes: no text, and no non-blank entry in a multi-value node. */
    public static boolean isBlank(Value node) {
        if (node == null) {
            return true;
        }
        List<String> values = node.getValues();
        if (values != null && !values.isEmpty()) {
            return values.stream().allMatch(value -> value == null || value.isBlank());
        }
        return text(node).isEmpty();
    }

    public static Optional<Double> toNumber(String raw) {
        if (raw == null || raw.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(Double.parseDouble(raw.trim()));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    private static String stripQuotes(String value) {
        return value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")
                ? value.substring(1, value.length() - 1)
                : value;
    }

    /** Args arrive via Gson, so a value may be a boxed primitive, a String, or a {@link JsonPrimitive}. */
    public static String argToString(Object arg) {
        if (arg == null) {
            return null;
        }
        if (arg instanceof JsonPrimitive primitive) {
            return primitive.getAsString();
        }
        if (arg instanceof Double doubleValue && !doubleValue.isNaN() && !doubleValue.isInfinite()
                && Double.compare(doubleValue, Math.floor(doubleValue)) == 0) {
            // Gson parses every JSON number as a Double; render whole numbers without the ".0".
            return String.valueOf(doubleValue.longValue());
        }
        return String.valueOf(arg);
    }

    private static Optional<String> stringArg(Map<String, Object> args, String key) {
        String value = argToString(args == null ? null : args.get(key));
        return value == null || value.isEmpty() ? Optional.empty() : Optional.of(value);
    }

    private static Optional<Double> numberArg(Map<String, Object> args, String key) {
        return stringArg(args, key).flatMap(CommonRuleValidators::toNumber);
    }

    private static List<String> stringListArg(Map<String, Object> args, String key) {
        Object raw = args == null ? null : args.get(key);
        if (!(raw instanceof Collection<?> collection)) {
            return List.of();
        }
        return collection.stream()
                .map(CommonRuleValidators::argToString)
                .filter(value -> value != null && !value.isEmpty())
                .collect(Collectors.toList());
    }
}
