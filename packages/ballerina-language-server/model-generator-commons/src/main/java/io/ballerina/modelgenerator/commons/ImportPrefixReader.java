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

import io.ballerina.compiler.syntax.tree.IdentifierToken;
import io.ballerina.compiler.syntax.tree.ImportDeclarationNode;
import io.ballerina.compiler.syntax.tree.ModulePartNode;

import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Reads the prefixes a file's import declarations actually bind, which is the only sound way to relate a
 * module to the prefix its source refers to it by.
 *
 * <p>
 * The compiler derives an unaliased import's prefix from the module name's last dot-segment, so a prefix
 * is not interchangeable with a module name in either direction: {@code ballerina/ftp} and
 * {@code ballerina/abc.ftp} both present as {@code ftp}, and an {@code as} clause can bind any prefix to
 * any module. Note {@code ModuleID.modulePrefix()} is no substitute — it returns the real alias only for
 * a module symbol obtained from an import declaration, and falls back to the last segment when reached
 * through a type symbol.
 * </p>
 *
 * <p>
 * Also home to the two decisions that can only be made by reading a file -- {@link #resolve}, for a caller that
 * will add an import, and {@link #boundPrefix}, for one that will not. Both take their names from
 * {@link ModuleAliasResolver}, which holds the naming policy and reads no file itself.
 * </p>
 *
 * @since 1.5.0
 */
public final class ImportPrefixReader {

    private ImportPrefixReader() {
    }

    /**
     * The prefix to emit for {@code org/module} in an actual file: reuses an existing import's prefix verbatim,
     * else whatever {@link ModuleAliasResolver#allocate} picks against that file's already-taken prefixes.
     *
     * <p>
     * For a caller that is going to write the import, and so may name the module something the file does not use
     * yet. A caller that will not write one wants {@link #boundPrefix} instead.
     * </p>
     *
     * @param rootNode       the file to read; a null root yields the override or the natural prefix
     * @param org            the organization name
     * @param module         the module name
     * @param overridePrefix a model-pinned prefix to prefer over the computed one; may be null/blank
     * @return the prefix to emit, empty only when no module was given
     */
    public static String resolve(ModulePartNode rootNode, String org, String module, String overridePrefix) {
        if (module == null || module.isBlank()) {
            return "";
        }
        if (rootNode == null) {
            return overridePrefix != null && !overridePrefix.isBlank()
                    ? overridePrefix : ModuleAliasResolver.selfPrefix(module);
        }
        return resolve(rootNode, org, module, overridePrefix, null);
    }

    /**
     * As {@link #resolve(ModulePartNode, String, String, String)}, but told which organization owns the file so an
     * org-less import in it is only matched for modules that package could own. See
     * {@link #existingImportPrefix(ModulePartNode, String, String, String)}.
     *
     * @param rootNode       the root node of the file to read
     * @param org            the organization of the module to resolve
     * @param module         the module name
     * @param overridePrefix a prefix to prefer when free, or null
     * @param currentOrg     the organization owning the file, or null to accept an org-less import for any
     * @return the prefix to use
     */
    public static String resolve(ModulePartNode rootNode, String org, String module, String overridePrefix,
                                 String currentOrg) {
        if (module == null || module.isBlank()) {
            return "";
        }
        if (rootNode == null) {
            return overridePrefix != null && !overridePrefix.isBlank()
                    ? overridePrefix : ModuleAliasResolver.selfPrefix(module);
        }
        Optional<String> existing = existingImportPrefix(rootNode, org, module, currentOrg);
        if (existing.isPresent()) {
            return existing.get();
        }
        return ModuleAliasResolver.allocate(module, overridePrefix, importedPrefixes(rootNode));
    }

    /**
     * The prefix a file already binds {@code org/module} to, falling back to the module's natural prefix. Unlike
     * {@link #resolve} this never allocates a fresh one.
     *
     * <p>
     * For a caller that reads a file it is not going to add an import to -- a probe compiled against the real
     * document, say. A reference there has to use the prefix the document actually binds, so an existing {@code as}
     * clause must be honoured; but inventing an unused prefix for a module the file does not import would name
     * nothing at all, where the natural one at least names what the model meant.
     * </p>
     *
     * @param rootNode the file to read; a null root yields the natural prefix
     * @param org      the organization name
     * @param module   the module name
     * @return the bound prefix, else the module's natural prefix
     */
    public static String boundPrefix(ModulePartNode rootNode, String org, String module) {
        return boundPrefix(rootNode, org, module, null);
    }

    /**
     * As {@link #boundPrefix(ModulePartNode, String, String)}, but told which organization owns the file so an
     * org-less import in it is only matched for modules that package could own.
     *
     * @param rootNode   the root node of the file to read
     * @param org        the organization of the module to resolve
     * @param module     the module name
     * @param currentOrg the organization owning the file, or null to accept an org-less import for any
     * @return the bound prefix, else the module's natural prefix
     */
    public static String boundPrefix(ModulePartNode rootNode, String org, String module, String currentOrg) {
        if (module == null || module.isBlank()) {
            return "";
        }
        return rootNode == null ? ModuleAliasResolver.selfPrefix(module)
                : existingImportPrefix(rootNode, org, module, currentOrg)
                        .orElseGet(() -> ModuleAliasResolver.selfPrefix(module));
    }

    /**
     * The effective import prefix an {@code org/module} is already imported under in this file, if any —
     * its explicit {@code as <alias>} clause when present, otherwise the module's last dot-segment. Lets
     * a generator reuse whatever alias an earlier generation already committed for the same module, so
     * repeated edits to one file stay consistent with the import it wrote the first time.
     *
     * @param node   the root node of the file to read
     * @param org    the organization to match; null or blank matches any, for callers that only know the
     *               module name
     * @param module the module name to match
     * @return the prefix the file binds the module to, or empty when the file does not import it
     */
    public static Optional<String> existingImportPrefix(ModulePartNode node, String org, String module) {
        return existingImportPrefix(node, org, module, null);
    }

    /**
     * As {@link #existingImportPrefix(ModulePartNode, String, String)}, but told which organization owns the file so
     * an org-less import in it can be matched safely.
     *
     * <p>
     * An import written without an organization belongs to the file's own package. Treating it as a match for any
     * organization lets a request for a <b>foreign</b> module of the same dotted name -- {@code ballerinax/ai.google}
     * against a local {@code import ai.google;} -- come back as already imported. The caller then emits no import and
     * renders {@code google:}, which binds to the local module instead: a silent mis-binding rather than a
     * redeclared-symbol error. Passing {@code currentOrg} restricts that leniency to modules that really could be
     * the file's own.
     * </p>
     *
     * @param node       the root node of the file to read
     * @param org        the organization to match; null or blank matches any
     * @param module     the module name to match
     * @param currentOrg the organization owning the file, or null to accept an org-less import for any organization
     * @return the prefix the file binds the module to, or empty when the file does not import it
     */
    public static Optional<String> existingImportPrefix(ModulePartNode node, String org, String module,
                                                        String currentOrg) {
        if (node == null || module == null || module.isBlank()) {
            return Optional.empty();
        }
        boolean anyOrg = org == null || org.isBlank();
        for (ImportDeclarationNode importDeclarationNode : node.imports()) {
            String moduleName = moduleNameOf(importDeclarationNode);
            if (!module.equals(moduleName)) {
                continue;
            }
            // An import written without an organization is a module of the file's own package, and its module name
            // identifies it within the file on its own. The model records such a module with the organization, so
            // matching strictly on it would miss the very import that already binds the prefix -- but only where the
            // requested organization is one the file's own package could have.
            if (anyOrg) {
                return Optional.of(importPrefixOf(importDeclarationNode, moduleName));
            }
            if (importDeclarationNode.orgName().isEmpty()) {
                if (currentOrg == null || currentOrg.equals(org)) {
                    return Optional.of(importPrefixOf(importDeclarationNode, moduleName));
                }
                continue;
            }
            if (org.equals(importDeclarationNode.orgName().get().orgName().text())) {
                return Optional.of(importPrefixOf(importDeclarationNode, moduleName));
            }
        }
        return Optional.empty();
    }

    /**
     * The module a prefix is bound to in this file — the inverse of
     * {@link #existingImportPrefix(ModulePartNode, String, String)}. Resolving through the imports is the
     * only way to recover the real identity behind a prefix read out of source.
     *
     * @param node   the root node of the file to read
     * @param prefix the prefix as it appears in source
     * @return the imported module name (e.g. {@code abc.ftp}), or empty when nothing binds the prefix
     */
    public static Optional<String> moduleNameForPrefix(ModulePartNode node, String prefix) {
        if (node == null || prefix == null || prefix.isBlank()) {
            return Optional.empty();
        }
        for (ImportDeclarationNode importDeclarationNode : node.imports()) {
            String moduleName = moduleNameOf(importDeclarationNode);
            if (prefix.equals(importPrefixOf(importDeclarationNode, moduleName))) {
                return Optional.of(moduleName);
            }
        }
        return Optional.empty();
    }

    /**
     * The effective prefixes of every import in the file (explicit alias, else the module's last
     * segment). These are the identifiers a newly generated import must not collide with.
     *
     * @param node the root node of the file to read
     * @return the bound prefixes, empty when there is no file to read
     */
    public static Set<String> importedPrefixes(ModulePartNode node) {
        Set<String> prefixes = new HashSet<>();
        if (node == null) {
            return prefixes;
        }
        for (ImportDeclarationNode importDeclarationNode : node.imports()) {
            prefixes.add(importPrefixOf(importDeclarationNode, moduleNameOf(importDeclarationNode)));
        }
        return prefixes;
    }

    /**
     * The effective prefix of a single import declaration: its {@code as <alias>} clause when present,
     * otherwise the module's last dot-segment.
     *
     * @param importDeclarationNode the import to read
     * @return the prefix the declaration binds
     */
    public static String prefixOf(ImportDeclarationNode importDeclarationNode) {
        return importPrefixOf(importDeclarationNode, moduleNameOf(importDeclarationNode));
    }

    private static String moduleNameOf(ImportDeclarationNode importDeclarationNode) {
        return importDeclarationNode.moduleName().stream()
                .map(IdentifierToken::text)
                .collect(Collectors.joining("."));
    }

    private static String importPrefixOf(ImportDeclarationNode importDeclarationNode, String moduleName) {
        if (importDeclarationNode.prefix().isPresent()) {
            return importDeclarationNode.prefix().get().prefix().text();
        }
        int lastDot = moduleName.lastIndexOf('.');
        return lastDot < 0 ? moduleName : moduleName.substring(lastDot + 1);
    }
}
