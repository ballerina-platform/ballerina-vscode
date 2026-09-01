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

import io.ballerina.flowmodelgenerator.core.copilot.model.Listener;
import io.ballerina.flowmodelgenerator.core.copilot.model.PlatformDependency;
import io.ballerina.flowmodelgenerator.core.copilot.model.RequiredImport;
import io.ballerina.flowmodelgenerator.core.copilot.model.Service;
import io.ballerina.flowmodelgenerator.core.copilot.model.ServiceAnnotationRef;
import io.ballerina.flowmodelgenerator.core.copilot.model.ServiceConstraint;
import io.ballerina.flowmodelgenerator.core.copilot.model.ServiceIdentifier;
import io.ballerina.flowmodelgenerator.core.copilot.model.ServiceRemoteFunction;

import java.util.ArrayList;
import java.util.List;

/**
 * The accumulating output of one service entry, written by the service-level components in registry
 * order and read once at the end.
 *
 * <p>Accumulates straight onto a {@link Service}: this is the only representation of a service the
 * pipeline builds, and {@code ModelToJsonConverter} is the single place one becomes JSON.
 *
 * <p>Every setter is a no-op for absent input, which is how the spec's general rule — "a field that
 * would be empty, unused, or fully derivable from other fields is left out" — is enforced in one place
 * rather than at each call site. A slot left unwritten stays null, and a null field is omitted from the
 * wire; that is what makes the omission rule hold without any key-by-key checks at emit time.
 *
 * @since 1.7.0
 */
final class ServiceDraft {

    private final Service service = new Service();
    private final List<ServiceRemoteFunction> methods = new ArrayList<>();
    // The spec's open-ended shapes. Held as a field rather than written eagerly for the same reason
    // `methods` is: the catalog contributes them one at a time, and an empty list must not be emitted.
    private final List<ServiceRemoteFunction> handlerTemplates = new ArrayList<>();
    // Vetoes raised against this entry — any one of them drops it.
    private final List<String> vetoes = new ArrayList<>();
    // Non-fatal drops: a handler that could not be built, an annotation obligation that could not be
    // resolved, a binding rule that does not exist. Reported, but the entry survives — a service type whose
    // contract is partly unusable still has a usable remainder.
    private final List<String> nonFatal = new ArrayList<>();

    /** The spec: the wire contract's fixed discriminator for a metadata-derived service. */
    void setKind(String kind) {
        service.setType(kind);
    }

    /** The spec {@code serviceTypes[].type}: the service object type's name. */
    void setName(String name) {
        service.setName(name);
    }

    /**
     * The spec §3 {@code doc}: what this service type is for.
     *
     * <p>A no-op for absent or blank input, like every other setter here, though the spec makes the field
     * required — a document that omits it is malformed, and the omission rule already says the right thing
     * to do with a field that would be empty.
     */
    void setDescription(String description) {
        if (description != null && !description.isBlank()) {
            service.setDescription(description);
        }
    }

    /**
     * The spec {@code deprecated} — why this service type is superseded, as the document's own prose.
     *
     * <p>Text rather than a flag: the sentence names what replaces it. Distinct from the
     * {@code isDeprecated} a compiled symbol carries — that says <i>that</i> the type is deprecated, this
     * says <i>why</i>, and a document may state the latter for a type whose symbol carries no annotation.
     */
    void setDeprecated(String deprecated) {
        if (deprecated != null && !deprecated.isBlank()) {
            service.setDeprecationNote(deprecated);
        }
    }

    /**
     * The spec's array cardinality: this service type is one of several the document declares, so it is
     * "individually optional" rather than mandatory.
     *
     * <p>Emitted only when true, per the omission rule — a document declaring a single service type says
     * nothing here, and that single entry is required.
     */
    void setAlternatives(boolean alternatives) {
        if (alternatives) {
            service.setAlternatives(true);
        }
    }

    /**
     * The spec {@code multipleListenersAllowed: false} — this service type attaches to exactly one
     * listener.
     *
     * <p>Named for the <b>prohibition</b> rather than mirroring the document's key, so that presence means
     * "there is a restriction to state" and the omission rule applies unchanged. A wire key
     * {@code multipleListeners: false} would instead force every consumer to tell {@code false} from absent.
     */
    void setSingleListenerOnly() {
        service.setSingleListenerOnly(true);
    }

    /**
     * The spec {@code multipleServicesOfSameTypeAllowed: false} — one listener hosts at most one service of
     * <i>this type</i>, though it may host others. Same naming rule as {@link #setSingleListenerOnly()}.
     */
    void setSingleServicePerListenerOnly() {
        service.setSingleServicePerListenerOnly(true);
    }

    /**
     * The spec {@code multipleServicesAllowed: false} — one listener hosts at most one service, of any type.
     *
     * <p>The strictly stronger sibling of {@link #setSingleServicePerListenerOnly()}, and emitted instead
     * of it rather than alongside: "at most one service" already entails "at most one of this type", so
     * stating both would present one restriction as two.
     */
    void setSingleServiceOnly() {
        service.setSingleServiceOnly(true);
    }

    /**
     * The spec: the {@code org/module} a cross-module service type belongs to. Absent for a home-module
     * type, which the renderer then prefixes with the listener's alias.
     */
    void setServiceTypeModule(String module) {
        if (module != null && !module.isEmpty()) {
            service.setServiceTypeModule(module);
        }
    }

    /** The spec {@code listeners[].requiredImports}: side-effect-only imports the generated code needs. */
    void setRequiredImports(List<RequiredImport> imports) {
        if (imports != null && !imports.isEmpty()) {
            service.setRequiredImports(List.copyOf(imports));
        }
    }

    /**
     * The spec {@code listeners[].platformDependencies}: native artifacts the build cannot fetch. Omitted
     * when the connector needs none, which is every library but {@code sap.jco}.
     */
    void setPlatformDependencies(List<PlatformDependency> dependencies) {
        if (dependencies != null && !dependencies.isEmpty()) {
            service.setPlatformDependencies(List.copyOf(dependencies));
        }
    }

    /**
     * The spec {@code annotations[]} at {@code attachPoint: "service"}: the annotations this service type
     * must or may carry. Omitted when it carries none, so a service with no obligation says nothing
     * rather than carrying an empty array.
     */
    void setAnnotations(List<ServiceAnnotationRef> annotations) {
        if (annotations != null && !annotations.isEmpty()) {
            service.setAnnotations(List.copyOf(annotations));
        }
    }

    /**
     * The spec {@code serviceTypes[].identifier}: the slot between {@code service} and {@code on new …}.
     * Omitted when the connector does not consult it — the spec: "Omit the whole key if the identifier slot
     * carries no meaning for this connector."
     */
    void setIdentifier(ServiceIdentifier identifier) {
        if (identifier != null) {
            service.setIdentifier(identifier);
        }
    }

    /**
     * The spec {@code rules[]}: the exclusivity constraints this service type declares. Omitted when it
     * declares none, which is 43 of the corpus's 58 service types.
     */
    void setConstraints(List<ServiceConstraint> constraints) {
        if (constraints != null && !constraints.isEmpty()) {
            service.setConstraints(List.copyOf(constraints));
        }
    }

    /**
     * The spec §2 {@code listeners[].services}: the other listeners this service type may attach to.
     *
     * <p>Omitted when there are none, which is every single-listener document — so the key appears only
     * where the document genuinely offers a choice.
     */
    void setAlternativeListeners(List<String> names) {
        if (names != null && !names.isEmpty()) {
            service.setAlternativeListeners(List.copyOf(names));
        }
    }

    /** The spec {@code listeners[].type}: the listener the service attaches to, with its init params. */
    void setListener(Listener listener) {
        if (listener != null) {
            service.setListener(listener);
        }
    }

    /**
     * The spec {@code listeners[].services} — <b>no</b> listener in this document declares it can host this
     * service type, so it must never be written as {@code service … on new …}.
     *
     * <p>Named for the prohibition and emitted only when true, the same rule
     * {@link #setSingleListenerOnly()} follows.
     *
     * <p>The restriction is real, not editorial. {@code websocket} declares two service types and lists
     * only {@code upgradeService} under its listener; the compiler rejects
     * {@code service websocket:Service on new websocket:Listener(...)} with "service type is not supported
     * by the listener". Such a type is reached another way — for {@code websocket}, as the return of the
     * upgrade resource — so it is still worth rendering, just never as a listener attachment.
     */
    void setNotListenerAttachable() {
        service.setNotListenerAttachable(true);
    }

    /**
     * The spec {@code addMode: "many"} — the shape every handler of this service type takes, for a catalog
     * whose handler <i>names</i> are the author's to choose.
     *
     * <p><b>Deliberately not a {@code methods} entry.</b> A template has no name, so emitting it alongside
     * real methods would put an unwritable signature in a list whose every other member is copyable;
     * {@code CopilotSchemaServicesTest} pins that separation. Its own slot is what lets a consumer render
     * it as guidance rather than as syntax.
     *
     * <p>A vetoed template is dropped with its reason and the service still renders — the same policy a
     * dropped handler follows.
     *
     * <p><b>Additive, and the key is plural</b>: a catalog may declare more than one legal shape, as
     * {@code graphql}'s query, mutation and subscription do. Document order is preserved.
     */
    void addHandlerTemplate(HandlerDraft template) {
        if (template == null) {
            return;
        }
        nonFatal.addAll(template.diagnostics());
        if (template.isVetoed()) {
            nonFatal.addAll(template.vetoes());
            return;
        }
        handlerTemplates.add(template.toModel());
    }

    /**
     * Appends one built handler, or records why it was dropped. Order is preserved — the spec: "Array
     * order is meaningful".
     */
    void addHandler(HandlerDraft handler) {
        if (handler == null) {
            return;
        }
        nonFatal.addAll(handler.diagnostics());
        if (handler.isVetoed()) {
            nonFatal.addAll(handler.vetoes());
            return;
        }
        methods.add(handler.toModel());
    }

    /**
     * Records that this service entry must be dropped. The orchestrator, not the component, performs
     * the drop, so every exclusion goes through one place and carries a reason.
     *
     * <p><b>Fatal.</b> Reserve it for what makes the whole entry unusable — a service type the resolved
     * package does not declare, or a handler catalog that cannot be resolved. For anything that makes one
     * <i>contribution</i> unusable, use {@link #drop} instead.
     */
    void veto(String reason) {
        vetoes.add(reason);
    }

    /**
     * Records that a contribution was dropped, without dropping the entry.
     *
     */
    void drop(String reason) {
        nonFatal.add(reason);
    }

    /** Whether this entry itself was vetoed. A dropped handler or obligation does not drop its service. */
    boolean isVetoed() {
        return !vetoes.isEmpty();
    }

    /** Every drop recorded while building this entry, fatal or not. */
    List<String> vetoes() {
        List<String> all = new ArrayList<>(vetoes);
        all.addAll(nonFatal);
        return all;
    }

    /**
     * The finished entry. {@code methods} is omitted when empty — a service type whose contract
     * declares no methods (mcp's marker {@code Service}) is legitimate and must not render an empty
     * array.
     */
    Service toModel() {
        // Templates precede methods, mirroring the order a consumer renders them: the rule for writing a
        // handler comes before any fixed vocabulary. The spec made the two coexist -- `websocket` declares
        // nine named handlers beside two open-ended shapes -- so this is an ordering, not a choice.
        if (!handlerTemplates.isEmpty()) {
            service.setHandlerTemplates(List.copyOf(handlerTemplates));
        }
        if (!methods.isEmpty()) {
            service.setMethods(List.copyOf(methods));
        }
        return service;
    }
}
