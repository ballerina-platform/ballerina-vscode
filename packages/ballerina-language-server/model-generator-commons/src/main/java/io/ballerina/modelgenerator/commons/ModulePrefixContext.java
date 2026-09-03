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

import io.ballerina.compiler.syntax.tree.ModulePartNode;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The import prefixes one code-generation operation will emit, resolved <b>once</b> against the target
 * file and then reused at every emission site (an operation may span several modules, e.g. MSSQL CDC's
 * own {@code mssql} plus {@code ballerinax/cdc}). Register each module with {@link #prefixFor}, then use
 * {@link #requalify} to map model-authored text onto the resolved prefixes and {@link #pendingImports}
 * to emit the imports still missing. Not thread-safe; build one per operation.
 *
 * @since 1.9.0
 */
public final class ModulePrefixContext {

    /** Prefixes already bound in the file, plus every prefix this context has handed out. */
    private final Set<String> claimed = new HashSet<>();
    /** {@code org/module} -> resolved prefix. */
    private final Map<String, String> byModule = new LinkedHashMap<>();
    /** natural prefix -> resolved prefix, driving {@link #requalify}. */
    private final Map<String, String> naturalToEmitted = new LinkedHashMap<>();
    /** Natural prefixes claimed by more than one registered module. */
    private final Set<String> ambiguousNaturals = new HashSet<>();
    /** {@code org/module} -> resolved prefix, for modules the file does not import yet. */
    private final Map<String, String> pendingImports = new LinkedHashMap<>();
    private final ModulePartNode rootNode;

    private ModulePrefixContext(ModulePartNode rootNode) {
        this.rootNode = rootNode;
        if (rootNode != null) {
            claimed.addAll(ImportPrefixReader.importedPrefixes(rootNode));
        }
    }

    /** A context bound to the file the edits will be applied to. A null root means "no file knowledge". */
    public static ModulePrefixContext from(ModulePartNode rootNode) {
        return new ModulePrefixContext(rootNode);
    }

    /**
     * The prefix to emit for {@code org/module}, resolved once and cached. An import already in the
     * file wins outright; otherwise a free prefix is allocated via {@link #allocate} and recorded in
     * {@link #pendingImports}.
     */
    public String prefixFor(String org, String module) {
        if (module == null || module.isBlank()) {
            return "";
        }
        String key = (org == null ? "" : org) + "/" + module;
        String cached = byModule.get(key);
        if (cached != null) {
            return cached;
        }
        String natural = ModuleAliasResolver.selfPrefix(module);
        Optional<String> existing = rootNode == null
                ? Optional.empty() : ImportPrefixReader.existingImportPrefix(rootNode, org, module);
        String resolved;
        if (existing.isPresent()) {
            resolved = existing.get();
        } else {
            resolved = ModuleAliasResolver.allocate(module, null, claimed);
            pendingImports.put(key, resolved);
        }
        claimed.add(resolved);
        byModule.put(key, resolved);
        // Two modules sharing a natural prefix make it ambiguous as an identifier.
        String previous = naturalToEmitted.putIfAbsent(natural, resolved);
        if (previous != null && !previous.equals(resolved)) {
            ambiguousNaturals.add(natural);
        }
        return resolved;
    }

    /**
     * The prefix already settled on for {@code org/module}, <b>without</b> registering anything: the
     * decision this context has already made, else the prefix the file itself binds, else empty.
     * <p>
     * For callers that must not cause an import to be emitted as a side effect of asking. Rewriting a
     * reference is only safe once the module is going to be imported anyway, so an empty answer means
     * "leave the reference alone".
     * </p>
     *
     * @param org    the organization name
     * @param module the module name
     * @return the resolved prefix, or empty when this context has no binding for the module
     */
    public String resolvedPrefixFor(String org, String module) {
        if (module == null || module.isBlank()) {
            return "";
        }
        String cached = byModule.get((org == null ? "" : org) + "/" + module);
        if (cached != null) {
            return cached;
        }
        return rootNode == null ? ""
                : ImportPrefixReader.existingImportPrefix(rootNode, org, module).orElse("");
    }

    /**
     * Maps every registered module's natural prefix in {@code text} onto its resolved prefix, e.g.
     * {@code twilio:Foo} &rarr; {@code triggerTwilio:Foo}. Only standalone module qualifiers are
     * rewritten; unregistered modules, longer identifiers, and dotted paths are left untouched.
     */
    public String requalify(String text) {
        Map<String, String> effective = new LinkedHashMap<>(naturalToEmitted);
        effective.keySet().removeAll(ambiguousNaturals);
        return ModuleAliasResolver.requalify(text, effective);
    }

    /**
     * The prefix to emit for a qualifier that may or may not carry module identity. Resolved exactly
     * when {@code moduleName} is present; otherwise treated as a bare, possibly-ambiguous natural prefix.
     */
    public String prefixForQualifier(String org, String moduleName, String qualifier) {
        if (moduleName != null && !moduleName.isBlank()) {
            return prefixFor(org, moduleName);
        }
        return resolveNatural(qualifier);
    }

    /**
     * The resolved prefix for a bare natural prefix (chiefly {@code codedata.valueQualifier} enum
     * literals). Returned unchanged when unregistered or claimed by more than one registered module,
     * since a prefix alone isn't a reliable module identity.
     */
    public String resolveNatural(String naturalPrefix) {
        if (naturalPrefix == null || naturalPrefix.isBlank() || ambiguousNaturals.contains(naturalPrefix)) {
            return naturalPrefix;
        }
        return naturalToEmitted.getOrDefault(naturalPrefix, naturalPrefix);
    }

    /**
     * Resolves the qualifiers a text was authored with onto the prefixes this file binds, and rewrites the text to
     * match.
     *
     * <p>
     * The qualifiers in model-authored text say which module each name belongs to, by way of the accompanying map,
     * but not what that module may be called here: the file may already import it under an alias, may already bind
     * that qualifier to something else, and two texts in one operation may have been authored against the same
     * qualifier for different modules. Each module is therefore registered and its emitted prefix substituted, so
     * the text and the imports this context yields cannot disagree.
     * </p>
     *
     * @param text              the authored text, returned unchanged when it carries no qualifier
     * @param importsByAuthored authored qualifier -> {@code org/module}, as a property's imports map is shaped
     * @return the text with each qualifier replaced by the prefix its module is bound to
     */
    public String requalifyAuthored(String text, Map<String, String> importsByAuthored) {
        if (importsByAuthored == null || importsByAuthored.isEmpty()) {
            return text;
        }
        // Every module is registered whether or not the text names it, since a caller emitting this context's
        // pending imports needs the same set it would have imported before -- the text is only one of the places
        // a dependent module is used.
        Map<String, String> byAuthored = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : importsByAuthored.entrySet()) {
            // A version tail is dropped, and an entry with no organization is a module of the current package.
            String[] parts = entry.getValue().split(":")[0].split("/", 2);
            String org = parts.length == 2 ? parts[0] : "";
            String module = parts.length == 2 ? parts[1] : parts[0];
            if (module.isEmpty()) {
                continue;
            }
            byAuthored.put(entry.getKey(), prefixFor(org, module));
        }
        if (text == null || text.isEmpty() || text.indexOf(':') < 0) {
            return text;
        }
        return ModuleAliasResolver.requalify(text, byAuthored);
    }

    /**
     * Whether a natural prefix is claimed by more than one registered module, making it unusable as an identity in
     * text authored against it.
     *
     * <p>
     * A caller that both emits an import and rewrites references must consult this. Aliasing a module whose natural
     * prefix is ambiguous, without being able to rewrite the references that use it, binds those references to
     * whichever module kept the natural prefix -- turning a redeclared-symbol error into a silent mis-binding.
     * </p>
     *
     * @param naturalPrefix the last dot-segment of a module name
     * @return true when two registered modules share this natural prefix
     */
    public boolean isNaturalAmbiguous(String naturalPrefix) {
        return ambiguousNaturals.contains(naturalPrefix);
    }

    /**
     * The import signature to emit for {@code org/module}, registering it as {@link #prefixFor} does and carrying an
     * {@code as <prefix>} clause only where the prefix is a rename this context can also rewrite references onto.
     *
     * <p>
     * For a caller whose rewriting is keyed on the <b>natural</b> prefix ({@link #requalify}), where an ambiguous
     * natural prefix is left alone and so an alias could not be followed through: aliasing there would bind the
     * un-rewritten references to whichever module kept the natural prefix, which is worse than the redeclared-symbol
     * error it set out to avoid. A caller that rewrites by authored qualifier instead has no such restriction and can
     * use {@link ModuleAliasResolver#withAliasClause} directly.
     * </p>
     *
     * @param org    the organization name; blank for a module of the current package
     * @param module the module name
     * @return {@code org/module}, with {@code as <prefix>} appended where the prefix is a followable rename
     */
    public String importSignatureFor(String org, String module) {
        String prefix = prefixFor(org, module);
        String signature = org == null || org.isBlank() ? module : org + "/" + module;
        return isNaturalAmbiguous(ModuleAliasResolver.selfPrefix(module))
                ? signature
                : ModuleAliasResolver.withAliasClause(signature, prefix);
    }

    /** The modules that still need an import statement, as {@code org/module} -> resolved prefix. */
    public Map<String, String> pendingImports() {
        return Map.copyOf(pendingImports);
    }

    /** Whether any registered module resolved to something other than its natural prefix. */
    public boolean hasAliases() {
        return naturalToEmitted.entrySet().stream().anyMatch(e -> !e.getKey().equals(e.getValue()));
    }
}
