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

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
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
    /** The module owning the file, when known; decides which modules need an import at all. */
    private final ModuleInfo currentModule;

    private ModulePrefixContext(ModulePartNode rootNode, ModuleInfo currentModule) {
        this.rootNode = rootNode;
        this.currentModule = currentModule;
        if (rootNode != null) {
            claimed.addAll(ImportPrefixReader.importedPrefixes(rootNode));
        }
    }

    /** A context bound to the file the edits will be applied to. A null root means "no file knowledge". */
    public static ModulePrefixContext from(ModulePartNode rootNode) {
        return new ModulePrefixContext(rootNode, null);
    }

    /**
     * A context that also knows which module owns the file, and so can tell a type of the file's own module
     * (no import, no qualifier) and a sibling module of its package (imported without an organization) from a
     * genuinely external one. A null {@code currentModule} classifies every module as external, which is what
     * {@link #from(ModulePartNode)} does.
     *
     * @param rootNode      the root of the file the edits will be applied to; null means "no file knowledge"
     * @param currentModule the module owning that file, or null
     * @return a context bound to that file
     */
    public static ModulePrefixContext from(ModulePartNode rootNode, ModuleInfo currentModule) {
        return new ModulePrefixContext(rootNode, currentModule);
    }

    /**
     * The prefix to emit for {@code org/module}, resolved once and cached. An import already in the
     * file wins outright; otherwise a free prefix is allocated via {@link #allocate} and recorded in
     * {@link #pendingImports}.
     *
     * <p>
     * A type of the file's own module resolves to the empty prefix and registers nothing: it needs no import,
     * and claiming a prefix on its behalf would push a genuinely external module named in the same operation
     * onto an alias it did not need. A sibling module of the same package is registered under a blank
     * organization, which is how its import has to be written.
     * </p>
     */
    public String prefixFor(String org, String module) {
        if (module == null || module.isBlank()) {
            return "";
        }
        Origin origin = classify(org, module);
        if (origin == Origin.SAME_MODULE) {
            return "";
        }
        if (origin == Origin.SAME_PACKAGE) {
            org = "";
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

    /** Where a module sits relative to the file being edited, which decides how its import is written. */
    private enum Origin { SAME_MODULE, SAME_PACKAGE, EXTERNAL }

    /**
     * Classifies {@code org/module} against the module owning the file. Everything is external when this
     * context was built without a {@link ModuleInfo}, which is the behaviour of {@link #from(ModulePartNode)}.
     */
    private Origin classify(String org, String module) {
        if (currentModule == null || org == null || org.isBlank()
                || !org.equals(currentModule.org())) {
            return Origin.EXTERNAL;
        }
        // moduleName() is the full dotted path; packageName() is the root-only name.
        if (module.equals(currentModule.moduleName())) {
            return Origin.SAME_MODULE;
        }
        int firstDot = module.indexOf('.');
        String rootPackage = firstDot < 0 ? module : module.substring(0, firstDot);
        return rootPackage.equals(currentModule.packageName()) ? Origin.SAME_PACKAGE : Origin.EXTERNAL;
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
     *
     * <p>
     * This is the <b>fallback</b> channel, for a caller holding text and no map saying which module each
     * qualifier meant. A natural prefix two registered modules share is left alone, because a prefix on its
     * own is not a module identity. A caller that has the map should use {@link #requalifyAuthored}, which
     * keys on identity and so has no such blind spot.
     * </p>
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
        Map<String, String> naturalCandidates = new LinkedHashMap<>();
        Set<String> contestedNaturals = new HashSet<>();
        for (Map.Entry<String, String> entry : importsByAuthored.entrySet()) {
            // A version tail is dropped, and an entry with no organization is a module of the current package.
            String[] parts = entry.getValue().split(":")[0].split("/", 2);
            String org = parts.length == 2 ? parts[0] : "";
            String module = parts.length == 2 ? parts[1] : parts[0];
            if (module.isEmpty()) {
                continue;
            }
            String resolved = prefixFor(org, module);
            if (resolved.isEmpty()) {
                // A type of the file's own module carries no qualifier; mapping one onto "" would emit ":Type".
                continue;
            }
            byAuthored.put(entry.getKey(), resolved);
            // The key is only a proposed join between text and module: it can be the type name rather than the
            // qualifier, and a stale entry can name a module the text never mentions. The module's own natural
            // prefix is therefore offered as a second spelling, so an aliased module is rewritten under whichever
            // of the two the text actually used.
            String natural = ModuleAliasResolver.selfPrefix(module);
            String previous = naturalCandidates.putIfAbsent(natural, resolved);
            if (previous != null && !previous.equals(resolved)) {
                contestedNaturals.add(natural);
            }
        }
        naturalCandidates.forEach((natural, resolved) -> {
            // Only where the natural prefix is a sound identity: unclaimed by another module in this map, not
            // already ambiguous across the operation, and not shadowing a key the caller supplied itself.
            if (!contestedNaturals.contains(natural) && !ambiguousNaturals.contains(natural)
                    && !byAuthored.containsKey(natural)) {
                byAuthored.put(natural, resolved);
            }
        });
        if (text == null || text.isEmpty() || text.indexOf(':') < 0) {
            return text;
        }
        return ModuleAliasResolver.requalify(text, byAuthored);
    }

    /**
     * The modules that still need an import statement, as {@code org/module} -> resolved prefix, in the order
     * they were registered. Callers emit import text from this, so the order has to survive the copy.
     */
    public Map<String, String> pendingImports() {
        return Collections.unmodifiableMap(new LinkedHashMap<>(pendingImports));
    }

    /**
     * The import signatures still to be written, in registration order, each already carrying its
     * {@code as <prefix>} clause where the resolved prefix is a rename.
     *
     * <p>
     * Unlike {@link #importSignatureFor}, no ambiguity check applies: this is for a caller that rewrites
     * references by authored qualifier, and so can follow an alias through wherever it allocates one.
     * </p>
     *
     * @return one {@code org/module[ as prefix]} per module the file does not import yet
     */
    public List<String> pendingImportStatements() {
        List<String> statements = new ArrayList<>();
        pendingImports.forEach((key, prefix) -> {
            // A blank organization is a module of the current package, whose import carries no organization.
            String signature = key.startsWith("/") ? key.substring(1) : key;
            statements.add(ModuleAliasResolver.withAliasClause(signature, prefix));
        });
        return List.copyOf(statements);
    }

    /** Whether any registered module resolved to something other than its natural prefix. */
    public boolean hasAliases() {
        return naturalToEmitted.entrySet().stream().anyMatch(e -> !e.getKey().equals(e.getValue()));
    }
}
