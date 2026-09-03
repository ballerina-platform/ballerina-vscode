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
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;

/**
 * Owns <b>the spec {@code listeners[].type} and {@code .services}</b>: which listener hosts which service
 * type.
 *
 * <p>The spec defines {@code services} as the {@code serviceTypes[].id} values a listener can host, so a
 * service type is paired with the listener that names its id. When no listener names it — or the document
 * omits {@code services} — the first listener is used.
 *
 * <p><b>The multi-listener path is live.</b> It was latent while every corpus document declared exactly one
 * listener; {@code ballerina/mcp} now declares two — {@code StreamableHttpListener} and {@code Listener} —
 * and lists all four of its service types under both. One of them is written into the {@code on new …}
 * clause and the rest are reported by {@link #alternativeHosts}, so a transport the document offers is
 * never silently dropped.
 *
 * @since 1.7.0
 */
final class ListenerPairingResolver {

    private ListenerPairingResolver() {
        // Prevent instantiation
    }

    /**
     * One service type bound to the listener that hosts it, with that listener's resolved class.
     *
     * @param serviceType   the service type
     * @param listener      the hosting listener; never {@code null}
     * @param listenerClass the listener's class in the resolved package; never {@code null}
     */
    record ListenerPairing(TriggerMetadataModel.ServiceType serviceType,
                           TriggerMetadataModel.Listener listener,
                           ClassSymbol listenerClass) {
    }

    /**
     * The listener hosting a service type: the one whose {@code services} names its id, else the first.
     *
     * @param listeners   the document's listeners; never empty
     * @param serviceType the service type to place
     * @return the hosting listener
     */
    static TriggerMetadataModel.Listener hostOf(List<TriggerMetadataModel.Listener> listeners,
                                                TriggerMetadataModel.ServiceType serviceType) {
        String id = serviceType == null ? null : serviceType.id();
        if (id != null) {
            for (TriggerMetadataModel.Listener listener : listeners) {
                if (listener != null && listener.services() != null && listener.services().contains(id)) {
                    return listener;
                }
            }
        }
        return listeners.get(0);
    }

    /**
     * Whether <b>any</b> listener in the document declares it can host this service type — the spec's
     * {@code services}.
     *
     * <p>Distinct from {@link #hostOf}, which must always return <i>some</i> listener so the entry can
     * still be built. This answers whether that pairing is real, and there is one corpus case where it is
     * not: {@code websocket} declares two service types but lists only {@code upgradeService} under its
     * listener. Its {@code Service} is reached as the <i>return</i> of the upgrade resource, never attached
     * — the compiler rejects {@code service websocket:Service on new websocket:Listener(...)} with "service
     * type is not supported by the listener".
     *
     * <p><b>A listener that declares no {@code services} list constrains nothing</b>, so it is read as
     * hosting everything: the absence of a constraint is not the presence of a prohibition, and reading it
     * the other way would declare every service type of such a document unattachable.
     *
     * @param listeners   the document's listeners; may be {@code null} or empty
     * @param serviceType the service type; may be {@code null}
     * @return whether some listener declares it hostable
     */
    static boolean isHostedByAnyListener(List<TriggerMetadataModel.Listener> listeners,
                                         TriggerMetadataModel.ServiceType serviceType) {
        if (listeners == null || listeners.isEmpty()) {
            return true;
        }
        String id = serviceType == null ? null : serviceType.id();
        boolean anyListenerConstrains = false;
        for (TriggerMetadataModel.Listener listener : listeners) {
            if (listener == null || listener.services() == null || listener.services().isEmpty()) {
                // This listener states no restriction, so it cannot be the reason anything is excluded.
                return true;
            }
            anyListenerConstrains = true;
            if (id != null && listener.services().contains(id)) {
                return true;
            }
        }
        // Every listener stated a list and none named this type. A service type with no id at all cannot be
        // matched by any list, so it is trusted rather than declared unattachable.
        return !anyListenerConstrains || id == null;
    }

    /**
     * The <b>other</b> listeners a service type may attach to — the spec §2 {@code services}, read for
     * every listener rather than only for the one {@link #hostOf} settled on.
     *
     * <p>No longer hypothetical. {@code ballerina/mcp} declares two listeners, {@code StreamableHttpListener}
     * and {@code Listener}, and lists all four of its service types under both: the choice is a transport
     * choice, and the document says either works. {@link #hostOf} must still pick one to write into the
     * {@code on new …} clause, and picks the first deterministically — but rendering only that one would
     * make half of mcp's surface invisible to a reader asking for the other transport.
     *
     * <p>Follows {@link #isHostedByAnyListener}'s reading of an absent {@code services} list: a listener
     * that states no restriction constrains nothing and therefore hosts everything, so it counts as an
     * alternative rather than being skipped.
     *
     * @param listeners   the document's listeners; may be {@code null}
     * @param serviceType the service type being placed
     * @param chosen      the listener {@link #hostOf} settled on, which is never an alternative to itself
     * @return the other hosting listeners, in document order; empty for a single-listener document
     */
    static List<TriggerMetadataModel.Listener> alternativeHosts(
            List<TriggerMetadataModel.Listener> listeners, TriggerMetadataModel.ServiceType serviceType,
            TriggerMetadataModel.Listener chosen) {
        List<TriggerMetadataModel.Listener> alternatives = new ArrayList<>();
        if (listeners == null || listeners.size() < 2) {
            return alternatives;
        }
        String id = serviceType == null ? null : serviceType.id();
        for (TriggerMetadataModel.Listener listener : listeners) {
            if (listener == null || listener == chosen) {
                continue;
            }
            boolean unconstrained = listener.services() == null || listener.services().isEmpty();
            if (unconstrained || (id != null && listener.services().contains(id))) {
                alternatives.add(listener);
            }
        }
        return alternatives;
    }

    /**
     * How many of a document's service types <b>one listener can actually host</b> — the spec's
     * {@code services}.
     *
     * <p>This is the count the spec's optionality rule has to be read against, and it is <b>not</b> the
     * size of {@code serviceTypes[]}. {@code websocket} separates the two: it declares two service types,
     * but its listener lists only {@code upgradeService} (see {@link #isHostedByAnyListener}). Counting
     * declarations rather than hostable types would call those two alternatives.
     *
     * <p>A listener that declares no {@code services} list constrains nothing, so the document's own
     * count stands.
     *
     * @param listener     the hosting listener; may be {@code null}
     * @param serviceTypes the document's service types; may be {@code null}
     * @return the number of service types this listener can host
     */
    static int hostedServiceTypeCount(TriggerMetadataModel.Listener listener,
                                      List<TriggerMetadataModel.ServiceType> serviceTypes) {
        int declared = serviceTypes == null ? 0 : serviceTypes.size();
        if (listener == null || listener.services() == null || listener.services().isEmpty()) {
            return declared;
        }
        int hosted = 0;
        for (TriggerMetadataModel.ServiceType serviceType : serviceTypes == null ? List.<
                TriggerMetadataModel.ServiceType>of() : serviceTypes) {
            if (serviceType != null && listener.services().contains(serviceType.id())) {
                hosted++;
            }
        }
        return hosted;
    }

    /**
     * The pairings that resolved, and an attributable reason for every service type that did not.
     *
     * @param pairings one pairing per service type whose listener resolved, in document order
     * @param vetoes   one veto per service type dropped because its listener did not resolve
     */
    record Pairings(List<ListenerPairing> pairings, List<String> vetoes) {
    }

    /**
     * Pairs every service type with its listener and that listener's resolved class, and reports why every
     * dropped service type was dropped.
     *
     * <p>A listener class that cannot be resolved means the resolved package no longer matches the
     * document's world view, so pairings depending on it are omitted rather than emitted as a listener the
     * generated code could not instantiate. Each distinct listener is resolved once.
     *
     * @param listeners    the document's listeners
     * @param serviceTypes the document's service types
     * @param facts        the resolved package's symbols
     * @return the pairings and the vetoes
     */
    static Pairings resolveWithDiagnostics(List<TriggerMetadataModel.Listener> listeners,
                                           List<TriggerMetadataModel.ServiceType> serviceTypes,
                                           TriggerSemanticFacts facts) {
        // A lambda, not `facts::resolveListenerClass`: a bound method reference dereferences its receiver
        // eagerly, so a null `facts` would throw here instead of at the early return below — and callers do
        // pass null when there is nothing to pair.
        return resolveWithDiagnostics(listeners, serviceTypes, name -> facts.resolveListenerClass(name));
    }

    /**
     * {@link #resolveWithDiagnostics(List, List, TriggerSemanticFacts)} against a bare listener-class
     * lookup instead of a whole compiled package.
     *
     * @param listeners       the document's listeners
     * @param serviceTypes    the document's service types
     * @param listenerClasses the metadata-declared listener name to its class, empty when unresolvable
     * @return the pairings and the vetoes
     */
    static Pairings resolveWithDiagnostics(List<TriggerMetadataModel.Listener> listeners,
                                           List<TriggerMetadataModel.ServiceType> serviceTypes,
                                           Function<String, Optional<ClassSymbol>> listenerClasses) {
        List<ListenerPairing> pairings = new ArrayList<>();
        List<String> vetoes = new ArrayList<>();
        if (listeners == null || listeners.isEmpty() || serviceTypes == null) {
            return new Pairings(pairings, vetoes);
        }
        // Keyed by the declared name rather than the listener object, since that is the whole of the lookup's
        // input: two listener entries naming one class resolve it once, as before.
        Map<String, Optional<ClassSymbol>> resolved = new LinkedHashMap<>();
        for (TriggerMetadataModel.ServiceType serviceType : serviceTypes) {
            TriggerMetadataModel.Listener listener = hostOf(listeners, serviceType);
            String declared = listener != null && listener.type() != null ? listener.type().name() : null;
            Optional<ClassSymbol> listenerClass =
                    resolved.computeIfAbsent(declared, listenerClasses::apply);
            if (listenerClass.isEmpty()) {
                // Attributed to the service type, not the listener: the service type is what disappears from
                // the catalog, and it is what a reader will notice missing.
                vetoes.add("listenerPairing: " + subjectOf(serviceType)
                        + ": the resolved package declares no listener class for "
                        + (declared == null ? "this document's listener" : "'" + declared + "'")
                        + ", so the service could not be attached to one");
                continue;
            }
            pairings.add(new ListenerPairing(serviceType, listener, listenerClass.get()));
        }
        return new Pairings(pairings, vetoes);
    }

    /** What the veto names: the service type's declared type, falling back to its id. */
    private static String subjectOf(TriggerMetadataModel.ServiceType serviceType) {
        if (serviceType == null) {
            return "<unnamed service type>";
        }
        if (serviceType.type() != null && serviceType.type().name() != null) {
            return serviceType.type().name();
        }
        return serviceType.id() == null ? "<unnamed service type>" : serviceType.id();
    }
}
