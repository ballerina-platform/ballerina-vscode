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

import java.util.List;
import java.util.function.BiConsumer;

/**
 * The single ordered list of components, and the one place the pipeline's shape is declared.
 *
 * <p>A component is a function from a read-only scope to a mutable draft, so it is registered as a method
 * reference rather than as a class implementing an interface.
 *
 * <p><b>Ordering.</b> Within a tier the order is declared once, here. Only three entries have a reason to
 * sit where they do, and each is noted at its line; the rest are order-independent. Handler-tier order
 * carries no meaning at all: {@link HandlerDraft} holds each slot as a field and emits the wire contract's
 * key order itself, so a component can be inserted anywhere without changing the JSON.
 *
 * <p><b>Lifetime.</b> A registry is built per library load, never shared: {@link ServiceAspects} memoizes
 * the listener object it builds, and that cache is only valid within one library's resolved package.
 *
 * @since 1.7.0
 */
final class AspectRegistry {

    private final List<BiConsumer<TriggerScope, ServiceDraft>> serviceAspects;
    private final List<BiConsumer<HandlerScope, HandlerDraft>> handlerAspects;
    private final List<BiConsumer<ParamScope, ParamDraft>> paramAspects;

    AspectRegistry() {
        this.handlerAspects = List.of(
                HandlerAspects::identity,
                HandlerAspects::kind,
                HandlerAspects::qualifier,
                HandlerAspects::presence,
                // The spec made the accessor/path pair library-neutral, so the two
                // protocol-specific aspects collapsed into one.
                HandlerAspects::resourceExtras,
                HandlerAspects::returnType,
                AnnotationAspects::handler,
                // Order-independent despite writing into the return object: HandlerDraft holds the refs in
                // their own slot and merges them at emit time, so this does not have to follow returnType.
                AnnotationAspects::returnValue);
        this.paramAspects = List.of(
                ParamAspects::type,
                ParamAspects::presence,
                ParamAspects::repeat,
                AnnotationAspects::param,
                ParamAspects::dataBinding);

        // Instance state, not static: the listener object is memoized for the lifetime of one library load.
        ServiceAspects services = new ServiceAspects();
        // Built before the service list so the catalog aspect can be handed the two inner tiers directly.
        // It used to be handed this registry from inside the constructor, which published `this` while the
        // service field was still null and worked only because the other two were assigned first.
        HandlerCatalogAspect catalog = new HandlerCatalogAspect(handlerAspects, paramAspects);
        this.serviceAspects = List.of(
                // Must run first: it resolves the service-type id every later component is scoped to,
                // and it is the component that can veto the entry outright.
                services::identity,
                services::cardinality,
                services::requiredImports,
                services::platformDependencies,
                // Must run after identity: identity is what can veto the entry, and an annotation
                // obligation resolved for a service type that is about to be dropped is output nothing
                // will read. It does NOT depend on identity's result — the spec's `appliesTo` matches
                // `serviceTypes[].id`, which the scope already carries — so this is an ordering of
                // effect, not of data.
                AnnotationAspects::service,
                services::identifier,
                ConstraintAspect::contribute,
                services::listener,
                // Must run last: it drives the handler and parameter tiers, so every service-level
                // contribution has to be in place before it starts.
                catalog::contribute);
    }

    List<BiConsumer<TriggerScope, ServiceDraft>> serviceAspects() {
        return serviceAspects;
    }

    List<BiConsumer<HandlerScope, HandlerDraft>> handlerAspects() {
        return handlerAspects;
    }

    List<BiConsumer<ParamScope, ParamDraft>> paramAspects() {
        return paramAspects;
    }
}
