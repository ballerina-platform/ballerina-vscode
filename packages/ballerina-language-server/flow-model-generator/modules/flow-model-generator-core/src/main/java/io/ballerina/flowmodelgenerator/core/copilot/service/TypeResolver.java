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

package io.ballerina.flowmodelgenerator.core.copilot.service;

import io.ballerina.flowmodelgenerator.core.copilot.model.Type;
import io.ballerina.flowmodelgenerator.core.copilot.model.TypeLink;

import java.util.ArrayList;
import java.util.List;

/**
 * Shared type-resolution utilities for Copilot service loaders.
 * Strips matching package prefixes from type names and emits internal links
 * so the Copilot UI can navigate to record definitions within the same library.
 *
 * @since 1.7.0
 */
final class TypeResolver {

    private TypeResolver() {
        // Prevent instantiation
    }

    /**
     * Resolves a type name by stripping the package prefix if it matches the current library,
     * and adding internal links for each non-primitive type component.
     *
     * @param typeName the raw type name (e.g., "salesforce:ListenerConfig", "error?")
     * @param packageName the current package name (e.g., "salesforce")
     * @return the type, carrying its name and — only when there is one — its links
     */
    static Type resolveTypeWithLinks(String typeName, String packageName) {
        Type type = new Type();

        // Fast path for non-union types (the common case)
        if (!typeName.contains("|")) {
            String prefix = findMatchingPrefix(typeName, packageName);
            if (prefix != null) {
                String strippedName = typeName.substring(prefix.length());
                type.setName(strippedName);
                type.setLinks(List.of(internalLink(strippedName)));
            } else {
                type.setName(typeName);
            }
            return type;
        }

        // Union type handling
        List<TypeLink> links = new ArrayList<>();
        String[] parts = typeName.split("\\|");
        StringBuilder resolvedBuilder = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            String part = parts[i].trim();

            String prefix = findMatchingPrefix(part, packageName);
            if (prefix != null) {
                String strippedName = part.substring(prefix.length());
                part = strippedName;
                links.add(internalLink(strippedName));
            }

            if (i > 0) {
                resolvedBuilder.append("|");
            }
            resolvedBuilder.append(part);
        }

        type.setName(resolvedBuilder.toString());
        // Left null rather than set to an empty list, so a type with no home-module member omits the key
        // instead of carrying `"links": []`.
        if (!links.isEmpty()) {
            type.setLinks(List.copyOf(links));
        }

        return type;
    }

    /** An {@code internal} link to a home-module type, whose record name drops a trailing {@code ?}. */
    private static TypeLink internalLink(String strippedName) {
        String recordName = strippedName.endsWith("?")
                ? strippedName.substring(0, strippedName.length() - 1) : strippedName;
        return new TypeLink("internal", recordName, null);
    }

    /**
     * Resolves an annotation's constraining type, which may belong to another package.
     *
     * <p>A home-module constraint behaves exactly like any other type: the prefix is stripped and an
     * {@code internal} link records it. A <b>foreign</b> constraint instead gets an {@code external} link
     * naming the owning library, which is what carries the record's definition into the prompt — the same
     * mechanism every other cross-package type reference in the catalog already travels by.
     *
     * <p>The name is emitted <b>bare</b> in both cases, because the renderer is what re-applies a prefix;
     * emitting an already-prefixed name alongside a link would prefix it twice.
     *
     * @param signature      the constraint's module-prefixed signature, e.g. {@code "cdc:CdcServiceConfig"}
     * @param packageName    the library being rendered, e.g. {@code "mssql"}
     * @param foreignLibrary the {@code org/module} owning the annotation, or {@code null} when it is the
     *                       library's own
     * @return the {@code {name, links}} pair
     */
    static Type resolveAnnotationConstraint(String signature, String packageName,
                                            String foreignLibrary) {
        if (foreignLibrary == null) {
            return resolveTypeWithLinks(signature, packageName);
        }

        String bareName = stripAlias(signature);
        Type type = new Type(bareName);
        type.setLinks(List.of(new TypeLink("external", bareName, foreignLibrary)));
        return type;
    }

    /** Drops a leading {@code alias:} qualifier, leaving the bare type name. */
    private static String stripAlias(String signature) {
        int idx = signature.lastIndexOf(':');
        return idx >= 0 ? signature.substring(idx + 1) : signature;
    }

    /**
     * Finds the matching package prefix for a type name.
     * For submodule packages (e.g., "trigger.github"), also tries the module alias
     * (e.g., "github:") since Ballerina import aliases use the last segment.
     *
     * @param typeName the type name to check
     * @param packageName the package name (e.g., "trigger.github" or "salesforce")
     * @return the matching prefix string, or null if no prefix matches
     */
    static String findMatchingPrefix(String typeName, String packageName) {
        String fullPrefix = packageName + ":";
        if (typeName.startsWith(fullPrefix)) {
            return fullPrefix;
        }
        // For submodule packages (e.g., "trigger.github"), try the module alias ("github:")
        if (packageName.contains(".")) {
            String aliasPrefix = packageName.substring(packageName.lastIndexOf('.') + 1) + ":";
            if (typeName.startsWith(aliasPrefix)) {
                return aliasPrefix;
            }
        }
        return null;
    }
}
