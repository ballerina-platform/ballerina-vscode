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

import io.ballerina.compiler.api.symbols.ClassSymbol;
import io.ballerina.compiler.api.symbols.Symbol;
import io.ballerina.compiler.api.symbols.TypeReferenceTypeSymbol;
import io.ballerina.flowmodelgenerator.core.copilot.model.Listener;
import io.ballerina.flowmodelgenerator.core.copilot.model.Service;

import java.util.List;
import java.util.Optional;

/**
 * Rewrites the {@code listener.name} field of a Copilot service when the underlying
 * Ballerina package ships its listener under a non-canonical class name. The SQLite
 * service-index records the init method name, not the class name, so
 * {@link ServiceIndexLoader} hardcodes {@code <alias>:Listener}. This is correct for
 * the common case but wrong for CDC packages (e.g. {@code postgresql:CdcListener}).
 * <p>
 * Only kicks in when the package has no class literally named {@code Listener}; in
 * every other case the loader's hardcoded suffix is already accurate.
 *
 * @since 1.7.0
 */
public final class CopilotListenerNameEnricher {

    private static final String CANONICAL_LISTENER = "Listener";

    private CopilotListenerNameEnricher() {
        // Prevent instantiation
    }

    /**
     * Both arguments may be null; a null or empty {@code moduleSymbols} is a no-op.
     */
    public static void enrich(List<Service> services, List<Symbol> moduleSymbols) {
        if (services == null || services.isEmpty() || moduleSymbols == null || moduleSymbols.isEmpty()) {
            return;
        }

        Optional<String> overrideClassName = resolveListenerOverride(moduleSymbols);
        if (overrideClassName.isEmpty()) {
            return;
        }
        String className = overrideClassName.get();

        for (Service svc : services) {
            Listener listener = svc.getListener();
            if (listener == null || listener.getName() == null) {
                continue;
            }
            String currentName = listener.getName();
            int colonIdx = currentName.lastIndexOf(':');
            if (colonIdx < 0) {
                continue;
            }
            String prefix = currentName.substring(0, colonIdx + 1);
            listener.setName(prefix + className);
        }
    }

    /**
     * Walks module symbols once. If a class literally named {@code Listener} exists,
     * returns empty (no override needed). Otherwise returns the name of the first class
     * that type-includes a {@code Listener} (e.g. {@code CdcListener} via {@code *cdc:Listener}).
     * Canonical wins regardless of iteration order.
     */
    private static Optional<String> resolveListenerOverride(List<Symbol> moduleSymbols) {
        Optional<String> alternate = Optional.empty();
        for (Symbol symbol : moduleSymbols) {
            if (!(symbol instanceof ClassSymbol classSymbol)) {
                continue;
            }
            if (classSymbol.nameEquals(CANONICAL_LISTENER)) {
                return Optional.empty();
            }
            if (alternate.isEmpty() && includesListenerType(classSymbol)) {
                alternate = classSymbol.getName();
            }
        }
        return alternate;
    }

    private static boolean includesListenerType(ClassSymbol classSymbol) {
        return classSymbol.typeInclusions().stream()
                .filter(typeSymbol -> typeSymbol instanceof TypeReferenceTypeSymbol)
                .map(typeSymbol -> (TypeReferenceTypeSymbol) typeSymbol)
                .anyMatch(typeRef -> typeRef.definition().nameEquals(CANONICAL_LISTENER));
    }
}
