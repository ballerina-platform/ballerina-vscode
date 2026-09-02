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

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Hands out one distinct qualifier per module named in a single type signature, and records the module each
 * qualifier stands for.
 *
 * <p>
 * A type signature reaches the model as display text: {@code CommonUtils.getTypeSignature} reduces
 * {@code ballerinax/ai.google.drive:1.0.0:TextDataLoader} to {@code drive:TextDataLoader}, keeping only the module
 * name's last dot-segment. Two modules ending in the same segment therefore render under one qualifier, and the text
 * can no longer say which of them a given {@code drive:} meant — {@code ai.google.drive:TextDataLoader} and
 * {@code googleapis.drive:File} both come out as {@code drive:}.
 * </p>
 *
 * <p>
 * Rendering the signature through an allocator keeps the text self-describing: the second module to claim a segment
 * is given a distinct qualifier, so every qualifier in the finished text maps to exactly one module. The map this
 * accumulates is that mapping, in the {@code prefix -> org/module} shape the model already carries as a property's
 * imports, which means a consumer that has the text also has the identity of everything in it and needs no second
 * channel to recover it.
 * </p>
 *
 * <p>
 * Allocation follows {@link ModuleAliasResolver}, the same policy the language server applies to a colliding import,
 * so a qualifier chosen here and an alias chosen at generation time never disagree about what a name may be called.
 * A module whose natural segment is free keeps it, leaving every signature that names no colliding module exactly as
 * it renders today.
 * </p>
 *
 * <p>
 * One allocator spans one signature. Not thread-safe; build one per signature.
 * </p>
 *
 * @since 1.5.0
 */
public final class TypeQualifierAllocator {

    /** {@code org/module} -> the qualifier it is rendered under. */
    private final Map<String, String> qualifierByModule = new LinkedHashMap<>();
    /** qualifier -> the import signature it stands for, as the model's imports map is shaped. */
    private final Map<String, String> importByQualifier = new LinkedHashMap<>();

    /**
     * The qualifier to render {@code org/module} under, allocated once and reused for the rest of the signature.
     *
     * @param org           the organization name
     * @param module        the module name, as the type signature spells it (dotted, e.g. {@code ai.google.drive})
     * @param currentModule the module the signature is being rendered for, so a type of its own package is recorded
     *                      without an organization; may be null
     * @return the qualifier, never empty
     */
    public String qualifierFor(String org, String module, ModuleInfo currentModule) {
        String key = org + "/" + module;
        String allocated = qualifierByModule.get(key);
        if (allocated != null) {
            return allocated;
        }
        String qualifier = ModuleAliasResolver.allocatePrefix(module, importByQualifier.keySet());
        qualifierByModule.put(key, qualifier);
        importByQualifier.put(qualifier, importSignature(org, module, currentModule));
        return qualifier;
    }

    /**
     * The modules named in the signature, as {@code qualifier -> org/module}. Every key occurs in the rendered text,
     * and no two keys are the same, so the text and this map together identify every type the signature names.
     *
     * @return the accumulated imports, empty when the signature named no module outside the current one
     */
    public Map<String, String> imports() {
        return Map.copyOf(importByQualifier);
    }

    /** Whether any module was allocated a qualifier other than its own natural segment. */
    public boolean hasReallocation() {
        return importByQualifier.keySet().stream()
                .anyMatch(qualifier -> !qualifier.equals(
                        ModuleAliasResolver.selfPrefix(moduleOf(importByQualifier.get(qualifier)))));
    }

    /**
     * The import signature for a module, matching {@link CommonUtils#getImportStatement}: a module of the current
     * package is recorded without an organization, since that is how it has to be imported.
     */
    private static String importSignature(String org, String module, ModuleInfo currentModule) {
        if (currentModule != null && org.equals(currentModule.org()) && isOwnPackage(module, currentModule)) {
            return module;
        }
        return org + "/" + module;
    }

    private static boolean isOwnPackage(String module, ModuleInfo currentModule) {
        String packageName = currentModule.packageName();
        return module.equals(packageName) || module.startsWith(packageName + ".");
    }

    private static String moduleOf(String importSignature) {
        int slash = importSignature.indexOf('/');
        return slash < 0 ? importSignature : importSignature.substring(slash + 1);
    }
}
