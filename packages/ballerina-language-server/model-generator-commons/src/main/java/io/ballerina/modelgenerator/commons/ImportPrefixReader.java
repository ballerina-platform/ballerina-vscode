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
 * @since 1.5.0
 */
public final class ImportPrefixReader {

    private ImportPrefixReader() {
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
        if (node == null || module == null || module.isBlank()) {
            return Optional.empty();
        }
        boolean anyOrg = org == null || org.isBlank();
        for (ImportDeclarationNode importDeclarationNode : node.imports()) {
            String moduleName = moduleNameOf(importDeclarationNode);
            if (!module.equals(moduleName)) {
                continue;
            }
            if (anyOrg || (importDeclarationNode.orgName().isPresent()
                    && org.equals(importDeclarationNode.orgName().get().orgName().text()))) {
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
