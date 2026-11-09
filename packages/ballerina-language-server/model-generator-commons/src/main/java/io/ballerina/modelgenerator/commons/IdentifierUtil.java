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

package io.ballerina.modelgenerator.commons;

import io.ballerina.compiler.syntax.tree.Node;
import io.ballerina.compiler.syntax.tree.NodeParser;
import io.ballerina.compiler.syntax.tree.SyntaxInfo;
import io.ballerina.compiler.syntax.tree.SyntaxKind;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Converts between the name a user types in a form (the plain name, e.g. {@code issue-number}) and the identifier
 * written to the source (e.g. {@code issue\-number}).
 *
 * <p>The webviews show and accept plain names; the language server escapes them once, on write, through this class.
 * Every write method accepts both the plain and the already-escaped form and returns the same source form for both,
 * so running it twice never adds another backslash.</p>
 *
 * <p>Trade-off: a backslash is always read as an escape, so a name cannot contain a literal backslash. Typing
 * {@code a\-b} means {@code a-b}, and {@code a\\\-b} collapses to {@code a-b}.</p>
 *
 * @since 1.7.0
 */
public final class IdentifierUtil {

    private static final char QUOTE = '\'';
    private static final char BACKSLASH = '\\';
    private static final char PATH_SEPARATOR = '/';
    private static final String ROOT_PATH_SEGMENT = ".";
    private static final String SELF_PREFIX = "self.";
    private static final Pattern NUMERIC_ESCAPE = Pattern.compile("\\\\+u\\{([0-9a-fA-F]{1,6})}");
    // A private-use code point stands in for a backslash decoded from a numeric escape while escapes are dropped
    private static final char DECODED_BACKSLASH = '\uE000';

    private IdentifierUtil() {
    }

    /**
     * Returns the plain name for a source identifier: drops a leading {@code '}, decodes numeric escapes and removes
     * every other backslash. Use it to compare names, never to write them.
     *
     * @param name the identifier, in plain or source form
     * @return the plain name, or the input when it is {@code null}
     */
    public static String toPlainName(String name) {
        if (name == null || name.isEmpty()) {
            return name;
        }
        String plain = name.charAt(0) == QUOTE ? name.substring(1) : name;
        if (plain.indexOf(BACKSLASH) < 0) {
            return plain;
        }

        Matcher matcher = NUMERIC_ESCAPE.matcher(plain);
        StringBuilder decoded = new StringBuilder(plain.length());
        int last = 0;
        while (matcher.find()) {
            decoded.append(plain, last, matcher.start()).append(decodeCodePoint(matcher.group(), matcher.group(1)));
            last = matcher.end();
        }
        decoded.append(plain, last, plain.length());

        // A backslash produced by decoding a numeric escape is kept: only the ones written as escapes are dropped
        StringBuilder result = new StringBuilder(decoded.length());
        for (int i = 0; i < decoded.length(); i++) {
            char c = decoded.charAt(i);
            if (c == BACKSLASH) {
                continue;
            }
            if (c == DECODED_BACKSLASH) {
                result.append(BACKSLASH);
                continue;
            }
            result.append(c);
        }
        return result.toString();
    }

    /**
     * Returns the source identifier for a name typed in a form. Accepts the plain or the escaped form and returns
     * the same result for both: keywords are quoted ({@code 'type}), special characters are escaped
     * ({@code issue\-number}) and a leading digit is escaped ({@code \1st}).
     *
     * @param name the name, in plain or source form
     * @return the source identifier, or the input when it is {@code null} or blank
     */
    public static String toSourceIdentifier(String name) {
        if (name == null || name.isBlank()) {
            return name;
        }
        String plain = toPlainName(name.strip());
        if (plain.isEmpty()) {
            return plain;
        }
        // Contextual keywords such as `key` or `natural` are valid identifiers and stay unquoted
        if (SyntaxInfo.isKeyword(plain) && !SyntaxInfo.isIdentifier(plain)) {
            return QUOTE + plain;
        }

        StringBuilder source = new StringBuilder(plain.length() + 4);
        int index = 0;
        while (index < plain.length()) {
            int codePoint = plain.codePointAt(index);
            appendEscaped(source, codePoint, index == 0);
            index += Character.charCount(codePoint);
        }
        return source.toString();
    }

    /**
     * Returns the source form of a name that can only be a single identifier, such as a record field name or a path
     * segment. A name that is already a valid identifier ({@code 'name}, {@code issue\-number}, {@code a\\b}, or a
     * numeric escape) is returned unchanged, so a name read back from the source is never
     * rewritten; any other name goes through {@link #toSourceIdentifier(String)}. Unlike
     * {@link #escapeIfNeeded(String)}, a binding pattern such as {@code [a, b]} is not kept.
     *
     * @param name the name as typed, in plain or source form
     * @return the name in source form, or the input when it is {@code null} or blank
     */
    public static String escapeIdentifierIfNeeded(String name) {
        if (name == null || name.isBlank()) {
            return name;
        }
        String trimmed = name.strip();
        return isIdentifier(trimmed) ? trimmed : toSourceIdentifier(trimmed);
    }

    /**
     * Returns the source form of a name typed in a field that also accepts other binding patterns (a variable,
     * function or parameter name). A value that is already valid source ({@code x}, {@code 'type},
     * {@code issue\-number}, {@code [a, b]}) is returned unchanged, so existing source is never rewritten; any other
     * value goes through {@link #toSourceIdentifier(String)}. A {@code self.} prefix is kept.
     *
     * @param name the name as typed, in plain or source form
     * @return the name in source form, or the input when it is {@code null} or blank
     */
    public static String escapeIfNeeded(String name) {
        if (name == null || name.isBlank()) {
            return name;
        }
        String trimmed = name.strip();
        if (!NodeParser.parseBindingPattern(trimmed).hasDiagnostics()) {
            return name;
        }
        if (trimmed.startsWith(SELF_PREFIX) && trimmed.length() > SELF_PREFIX.length()) {
            return SELF_PREFIX + escapeIfNeeded(trimmed.substring(SELF_PREFIX.length()));
        }
        return toSourceIdentifier(trimmed);
    }

    /**
     * Returns whether the name is already written as {@link #toSourceIdentifier(String)} would write it.
     *
     * @param name the identifier
     * @return {@code true} if writing the name would not change it
     */
    public static boolean isSourceIdentifier(String name) {
        return name != null && name.equals(toSourceIdentifier(name));
    }

    /**
     * Returns the source form of a service base path or a resource path. Each segment between unescaped
     * {@code /} characters goes through {@link #escapeIdentifierIfNeeded(String)}, so a segment that is already valid
     * source is kept as written; path parameters ({@code [int id]},
     * {@code [string... rest]}) and the root path ({@code .}) are kept as they are. A string literal base path
     * ({@code "/foo"}) is returned unchanged.
     *
     * @param path the path, in plain or source form
     * @return the path in source form, or the input when it is {@code null} or blank
     */
    public static String toSourcePath(String path) {
        if (path == null || path.isBlank()) {
            return path;
        }
        String trimmed = path.strip();
        if (trimmed.startsWith("\"") || trimmed.equals(ROOT_PATH_SEGMENT)) {
            return trimmed;
        }
        List<String> segments = splitPath(trimmed);
        List<String> sourceSegments = new ArrayList<>(segments.size());
        for (String segment : segments) {
            String stripped = segment.strip();
            if (stripped.isEmpty() || stripped.startsWith("[") || stripped.equals(ROOT_PATH_SEGMENT)) {
                sourceSegments.add(stripped);
            } else {
                sourceSegments.add(escapeIdentifierIfNeeded(stripped));
            }
        }
        return String.join(String.valueOf(PATH_SEPARATOR), sourceSegments);
    }

    /**
     * Returns the plain form of a service base path or a resource path: every segment other than path parameters
     * goes through {@link #toPlainName(String)}. Use it to compare paths, never to write them.
     *
     * @param path the path, in plain or source form
     * @return the plain path, or the input when it is {@code null}
     */
    public static String toPlainPath(String path) {
        if (path == null || path.isBlank()) {
            return path;
        }
        String trimmed = path.strip();
        if (trimmed.startsWith("\"")) {
            return trimmed;
        }
        List<String> segments = splitPath(trimmed);
        List<String> plainSegments = new ArrayList<>(segments.size());
        for (String segment : segments) {
            String stripped = segment.strip();
            plainSegments.add(stripped.startsWith("[") ? stripped : toPlainName(stripped));
        }
        return String.join(String.valueOf(PATH_SEPARATOR), plainSegments);
    }

    private static boolean isIdentifier(String text) {
        Node node = NodeParser.parseBindingPattern(text);
        return node.kind() == SyntaxKind.CAPTURE_BINDING_PATTERN && !node.hasDiagnostics();
    }

    private static String decodeCodePoint(String escape, String hex) {
        int codePoint = Integer.parseInt(hex, 16);
        if (!Character.isValidCodePoint(codePoint)) {
            return escape;
        }
        if (codePoint == BACKSLASH) {
            return String.valueOf(DECODED_BACKSLASH);
        }
        return new String(Character.toChars(codePoint));
    }

    private static void appendEscaped(StringBuilder source, int codePoint, boolean first) {
        if (codePoint == '_' || isAsciiLetter(codePoint)) {
            source.appendCodePoint(codePoint);
        } else if (isAsciiDigit(codePoint)) {
            if (first) {
                source.append(BACKSLASH);
            }
            source.appendCodePoint(codePoint);
        } else if (codePoint == ' ') {
            source.append(BACKSLASH).append(' ');
        } else if (codePoint == BACKSLASH || Character.isWhitespace(codePoint) || Character.isSpaceChar(codePoint)
                || Character.isISOControl(codePoint)) {
            // A numeric escape keeps a literal backslash from being read as an escape on the next write
            source.append("\\u{").append(Integer.toHexString(codePoint).toUpperCase(Locale.ROOT)).append('}');
        } else if (codePoint > 0x7F && Character.isLetterOrDigit(codePoint)) {
            source.appendCodePoint(codePoint);
        } else {
            source.append(BACKSLASH).appendCodePoint(codePoint);
        }
    }

    private static List<String> splitPath(String path) {
        List<String> segments = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int bracketDepth = 0;
        for (int i = 0; i < path.length(); i++) {
            char c = path.charAt(i);
            if (c == BACKSLASH && i + 1 < path.length()) {
                current.append(c).append(path.charAt(++i));
                continue;
            }
            // A `[` opens a path param only at the start of a segment; elsewhere (`a[b`) it is an ordinary character
            if (c == '[' && (bracketDepth > 0 || current.toString().isBlank())) {
                bracketDepth++;
            } else if (c == ']' && bracketDepth > 0) {
                bracketDepth--;
            } else if (c == PATH_SEPARATOR && bracketDepth == 0) {
                segments.add(current.toString());
                current.setLength(0);
                continue;
            }
            current.append(c);
        }
        segments.add(current.toString());
        return segments;
    }

    private static boolean isAsciiLetter(int c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    }

    private static boolean isAsciiDigit(int c) {
        return c >= '0' && c <= '9';
    }
}
