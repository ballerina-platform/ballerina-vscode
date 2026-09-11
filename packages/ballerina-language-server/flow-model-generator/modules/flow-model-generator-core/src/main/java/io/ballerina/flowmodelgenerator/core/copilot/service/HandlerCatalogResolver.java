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

import io.ballerina.compiler.api.symbols.ObjectTypeSymbol;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Owns <b>the spec {@code handlers}</b>: which of the two sources a service type's handlers come from.
 *
 * <p>The spec states the rule directly — {@code backedByConcreteType} "{@code true} means the type's own
 * methods are the handlers, so introspection already answers everything this file could say. {@code false}
 * means {@code options} is the only source of truth." This is the one component that knows how many
 * handlers exist, and therefore the one that drives the handler and parameter tiers.
 *
 * @since 1.7.0
 */
final class HandlerCatalogResolver {

    private HandlerCatalogResolver() {
        // Prevent instantiation
    }

    /**
     * Where a service type's handlers come from.
     *
     * <p>Sealed so a new source cannot be added without every consumer being forced to handle it: the
     * catalog decides whether a service body is built from the semantic model or from the document, and a
     * silently unhandled variant would emit an empty body.
     */
    sealed interface HandlerCatalog permits HandlerCatalog.Concrete, HandlerCatalog.Documented,
            HandlerCatalog.None {

        /**
         * The service type declares its own methods; the semantic model is authoritative.
         *
         * @param methods the type's declared remote/resource methods, in declaration order
         */
        record Concrete(List<TriggerSemanticFacts.DeclaredMethod> methods) implements HandlerCatalog {
        }

        /**
         * A marker type: the metadata document's {@code options} are the only source of truth.
         *
         * <p>One variant carrying two lists, because the spec lets them coexist: {@code addMode} moved from
         * the {@code handlers} block onto each option so that fixed lifecycle handlers alongside open
         * user-named ones is expressible, and a service type mixing them has one catalog rather than two.
         *
         * @param named     the {@code subset} options — real method names a reader writes verbatim, each
         *                  governed by its own {@code presence}
         * @param templates the {@code many} options — shapes whose instances the author names, which
         *                  therefore cannot be written as-is and are rendered as commented guidance
         *                  (the spec: such a handler "cannot yield a compilable signature")
         */
        record Documented(List<TriggerMetadataModel.ServiceType.HandlerOption> named,
                          List<TriggerMetadataModel.ServiceType.HandlerOption> templates)
                implements HandlerCatalog {
        }

        /**
         * No usable catalog; the reason is attributable to the document.
         *
         * @param reason why no catalog could be resolved, in terms a document author can act on
         */
        record None(String reason) implements HandlerCatalog {
        }
    }

    /**
     * A resolved catalog, plus every way the document had to be tolerated to reach it.
     *
     * @param catalog      where this service type's handlers come from
     * @param degradations spec deviations that changed how the document was read or cost emitted output,
     *                     phrased in terms a document author can act on; empty for a conformant document
     */
    record CatalogResolution(HandlerCatalog catalog, List<String> degradations) {
    }

    /**
     * Whether a service type's handlers are its own declared methods.
     *
     * <p>A missing {@code handlers} block is treated as concrete: with nothing to enumerate, the only
     * possible source of truth is the type itself.
     */
    static boolean isConcrete(TriggerMetadataModel.ServiceType serviceType) {
        TriggerMetadataModel.ServiceType.Handlers handlers = serviceType.handlers();
        return serviceType.concrete() || handlers == null || handlers.backedByConcreteType();
    }

    /**
     * Resolves the catalog for one service type.
     *
     * @param serviceType the service type
     * @param typeName    its declared type name
     * @param facts       the resolved package's symbols
     * @return the catalog and its degradations; the catalog is {@link HandlerCatalog.None} when a concrete
     *         type cannot be introspected
     */
    static CatalogResolution resolve(TriggerMetadataModel.ServiceType serviceType, String typeName,
                                     TriggerSemanticFacts facts) {
        if (!isConcrete(serviceType)) {
            return documented(serviceType.handlers());
        }
        Optional<ObjectTypeSymbol> objectType = facts.serviceObjectType(typeName);
        if (objectType.isEmpty()) {
            // Emitting a method-less service here would be a phantom: the document claims the type
            // declares its own handlers, but the resolved package has no such type to read them from.
            return new CatalogResolution(
                    new HandlerCatalog.None("no introspectable service object type"), List.of());
        }
        return new CatalogResolution(
                new HandlerCatalog.Concrete(facts.declaredMethods(objectType.get())), List.of());
    }

    /**
     * Partitions a marker type's vocabulary by each option's own {@code addMode}.
     *
     * <p>The spec makes {@code subset} the reading for an absent {@code addMode}, so an option is a
     * template only when it says so. A {@code many} option is always named {@code "*"} — the author picks
     * the real name — which is why it can never join the named list; a {@code subset} option with no name
     * has nothing to emit and is dropped.
     */
    private static CatalogResolution documented(TriggerMetadataModel.ServiceType.Handlers handlers) {
        List<TriggerMetadataModel.ServiceType.HandlerOption> named = new ArrayList<>();
        List<TriggerMetadataModel.ServiceType.HandlerOption> templates = new ArrayList<>();
        for (TriggerMetadataModel.ServiceType.HandlerOption option : safe(handlers)) {
            if (option == null) {
                continue;
            }
            if (option.isMany()) {
                templates.add(option);
            } else if (option.name() != null) {
                named.add(option);
            }
        }
        return new CatalogResolution(
                new HandlerCatalog.Documented(List.copyOf(named), List.copyOf(templates)), List.of());
    }

    private static List<TriggerMetadataModel.ServiceType.HandlerOption> safe(
            TriggerMetadataModel.ServiceType.Handlers handlers) {
        return handlers == null || handlers.options() == null ? List.of() : handlers.options();
    }
}
