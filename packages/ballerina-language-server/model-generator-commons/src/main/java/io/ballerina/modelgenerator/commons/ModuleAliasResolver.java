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

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Decides what a module may be called in generated source, and re-qualifies references authored against a
 * module's natural prefix onto the chosen name. Needed because the natural (last dot-segment) prefix can
 * collide with a sibling package or an existing import alias.
 *
 * <p>
 * Naming policy only: nothing here reads a file. The prefixes an actual file binds, and the decisions that
 * depend on them, live in {@link ImportPrefixReader}, which calls this for the names it hands out.
 * </p>
 *
 * @since 1.9.0
 */
public final class ModuleAliasResolver {

    private ModuleAliasResolver() {
    }

    /** The prefix a module's own model strings are authored with — its last dot-segment. */
    public static String selfPrefix(String moduleName) {
        if (moduleName == null || moduleName.isBlank()) {
            return "";
        }
        int lastDot = moduleName.lastIndexOf('.');
        return lastDot < 0 ? moduleName : moduleName.substring(lastDot + 1);
    }

    /**
     * CamelCase join of a dotted module's segments (e.g. {@code trigger.twilio} &rarr;
     * {@code triggerTwilio}), used as a fallback alias. Returned unchanged if there's no dot.
     */
    public static String defaultAlias(String moduleName) {
        if (moduleName == null || moduleName.isBlank() || !moduleName.contains(".")) {
            return moduleName == null ? "" : moduleName;
        }
        String[] segments = moduleName.split("\\.");
        StringBuilder alias = new StringBuilder(segments[0]);
        for (int i = 1; i < segments.length; i++) {
            String segment = segments[i];
            if (segment.isEmpty()) {
                continue;
            }
            alias.append(Character.toUpperCase(segment.charAt(0))).append(segment.substring(1));
        }
        return alias.toString();
    }

    /**
     * A prefix for {@code module} that none of {@code taken} already uses: its natural prefix when free,
     * else the generated alias, else a numbered suffix. For callers that hold a set of prefixes already
     * spoken for but no file to resolve against.
     *
     * @param module the module to name
     * @param taken  the prefixes already in use
     * @return a prefix not present in {@code taken}
     */
    public static String allocatePrefix(String module, Set<String> taken) {
        return allocate(module, null, taken);
    }

    /**
     * A free prefix for {@code module} given a possibly-pinned {@code overridePrefix} and the prefixes
     * already {@code taken}: the override/natural prefix itself if free, else the generated alias, else
     * a numbered suffix ({@code ftp} &rarr; {@code ftp2}). Shared by {@link #resolve} (taken = one
     * file's existing imports) and {@code ModulePrefixContext} (taken = every prefix claimed so far
     * across several modules in one operation).
     */
    static String allocate(String module, String overridePrefix, Set<String> taken) {
        boolean pinned = overridePrefix != null && !overridePrefix.isBlank();
        String preferred = pinned ? overridePrefix : selfPrefix(module);
        if (!taken.contains(preferred)) {
            return preferred;
        }
        String base = preferred;
        if (!pinned) {
            String fallback = defaultAlias(module);
            if (!fallback.equals(preferred) && !taken.contains(fallback)) {
                return fallback;
            }
            if (!fallback.equals(preferred)) {
                base = fallback;
            }
        }
        int suffix = 2;
        while (taken.contains(base + suffix)) {
            suffix++;
        }
        return base + suffix;
    }

    /**
     * An import statement carrying an {@code as <prefix>} clause, but only where the prefix is a genuine rename. A
     * module whose natural segment is already taken -- {@code ai.google.drive} in a file that imports
     * {@code googleapis.drive} -- is imported {@code as aiGoogleDrive}, while a module whose segment is free keeps
     * the plain import it has always had.
     *
     * @param importSignature {@code org/module}, or a bare module for the current package
     * @param prefix          the prefix the module is bound to; null or blank adds no clause
     * @return the import statement to emit
     */
    public static String withAliasClause(String importSignature, String prefix) {
        if (prefix == null || prefix.isBlank()) {
            return importSignature;
        }
        int lastSlash = importSignature.lastIndexOf('/');
        String module = lastSlash < 0 ? importSignature : importSignature.substring(lastSlash + 1);
        if (prefix.equals(selfPrefix(module))) {
            return importSignature;
        }
        return importSignature + " as " + prefix;
    }

    /**
     * Re-qualifies a standalone module qualifier ({@code prefix:Type}) from {@code selfPrefix} to
     * {@code emitAlias} (e.g. {@code twilio:Foo} &rarr; {@code triggerTwilio:Foo}), without touching
     * other modules, longer identifiers, or dotted paths. No-op when no aliasing is in effect.
     */
    public static String rewriteSelfPrefix(String text, String selfPrefix, String emitAlias) {
        if (selfPrefix == null || selfPrefix.isBlank()) {
            return text == null ? "" : text;
        }
        return requalify(text, Map.of(selfPrefix, emitAlias == null ? selfPrefix : emitAlias));
    }

    /**
     * Re-qualifies every standalone module qualifier in {@code text} per {@code naturalToEmitted}
     * (natural prefix -&gt; resolved emit alias), in a single pass over the original text so a chain of
     * aliases (one module's emitted name equal to another's natural prefix) can never cascade. An entry
     * mapping a prefix to itself is a no-op. Shared by {@link #rewriteSelfPrefix} (one prefix) and
     * {@code ModulePrefixContext} (every aliased module registered in one operation).
     */
    public static String requalify(String text, Map<String, String> naturalToEmitted) {
        if (text == null || text.isEmpty() || naturalToEmitted.isEmpty()) {
            return text == null ? "" : text;
        }
        List<String> changing = new ArrayList<>();
        for (Map.Entry<String, String> entry : naturalToEmitted.entrySet()) {
            if (!entry.getKey().isBlank() && !entry.getKey().equals(entry.getValue())) {
                changing.add(entry.getKey());
            }
        }
        if (changing.isEmpty()) {
            return text;
        }
        StringBuilder alternation = new StringBuilder();
        for (String natural : changing) {
            if (!alternation.isEmpty()) {
                alternation.append('|');
            }
            alternation.append(Pattern.quote(natural));
        }
        Pattern qualifier = Pattern.compile("(?<![\\w.])(" + alternation + ")(?=:)");
        Matcher matcher = qualifier.matcher(text);
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            matcher.appendReplacement(out, Matcher.quoteReplacement(naturalToEmitted.get(matcher.group(1))));
        }
        matcher.appendTail(out);
        return out.toString();
    }
}
