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
import io.ballerina.flowmodelgenerator.core.copilot.model.Listener;
import io.ballerina.flowmodelgenerator.core.copilot.model.NativeLibrary;
import io.ballerina.flowmodelgenerator.core.copilot.model.Parameter;
import io.ballerina.flowmodelgenerator.core.copilot.model.PlatformDependency;
import io.ballerina.flowmodelgenerator.core.copilot.model.RequiredImport;
import io.ballerina.flowmodelgenerator.core.copilot.model.ServiceIdentifier;
import io.ballerina.modelgenerator.commons.trigger.models.IdentifierSpec;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;
import io.ballerina.modelgenerator.commons.trigger.utils.TypeRefResolver;

import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;

/**
 * The service tier: everything stated once per service entry. Constraints are {@link ConstraintAspect}, the
 * handler catalog is {@link HandlerCatalogAspect}, and service annotations are
 * {@link AnnotationAspects#service}; all three are large enough to own their own file.
 *
 * <p><b>Instance, not static.</b> {@link #listener} memoizes the object it builds for the lifetime of one
 * library load, so an instance is created per {@link AspectRegistry} and never shared across libraries.
 *
 * @since 1.7.0
 */
final class ServiceAspects {

    /** The wire contract's discriminator; every metadata-derived entry is a fixed-shape service. */
    private static final String KIND_FIXED = "fixed";

    private static final String DEFAULT_LISTENER_NAME = "Listener";

    private final Map<Object, Listener> builtListeners = new IdentityHashMap<>();

    /**
     * The spec/the spec — the service entry's identity: its type name and, when cross-module, the module that
     * owns it.
     *
     * <p>Runs first among the service aspects, because it is also the component that can veto the entry
     * outright: a home-module service type the resolved package does not declare would render a service on
     * a type that does not exist in the version actually resolved.
     */
    void identity(TriggerScope scope, ServiceDraft draft) {
        ServiceIdentityResolver.ServiceIdentity identity = ServiceIdentityResolver.resolve(
                scope.serviceType(), scope.homeModule(), scope.declaresType(), declaredServiceTypes(scope));

        if (identity.typeName() == null) {
            draft.veto("serviceIdentity: " + scope.libraryName()
                    + ": the document names no type for this service type entry");
            return;
        }
        if (!identity.declaredByPackage()) {
            draft.veto("serviceIdentity: " + identity.typeName()
                    + ": not declared by the resolved package version");
            return;
        }

        draft.setKind(KIND_FIXED);
        // For a cross-module type this is the bare type name; a downstream enricher's lookup against
        // this module's symbols is then a deliberate no-op unless the module declares the name itself.
        draft.setName(identity.typeName());
        // The spec §3 `doc`. Set here rather than in a component of its own for the same reason
        // `deprecated` is: it is part of the entry's identity, and it must not survive the two vetoes
        // above — a description of a service type that never renders describes nothing.
        draft.setDescription(scope.serviceType().doc());
        draft.setServiceTypeModule(identity.serviceTypeModule());
        draft.setAlternatives(identity.alternatives());
        // The spec `deprecated`, in the same prose form as the spec's. Set here rather than in a component of
        // its own: it is a property of the service type's identity, and it must not survive the two vetoes
        // above -- a deprecation note on an entry that never renders is a note about nothing.
        draft.setDeprecated(scope.serviceType().deprecated());
    }

    /**
     * How many service types are genuine alternatives to this one — the count the spec's optionality rule
     * is read against.
     *
     * <p>Not the size of {@code serviceTypes[]}: a service type the paired listener cannot host is not an
     * alternative to the ones it can, it is a different construct reached another way. The distinction is
     * The spec's {@code services}, so the count comes from {@link ListenerPairingResolver}, which owns it.
     */
    private static int declaredServiceTypes(TriggerScope scope) {
        if (scope.document() == null || scope.document().serviceTypes() == null) {
            // A scope built without a document states nothing about alternatives; a single entry is the
            // safe reading, and it emits no note.
            return 1;
        }
        return ListenerPairingResolver.hostedServiceTypeCount(
                scope.listener(), scope.document().serviceTypes());
    }

    /**
     * The spec's {@code multiple*Allowed} pair — and the decision of which half of it is worth saying.
     *
     * <p><b>Only a prohibition is emitted.</b> The keys are set on essentially every one of the corpus's 58
     * service types, so writing both unconditionally would land a note on every trigger service the Copilot
     * renders. {@code true} grants a permission a generator would not exercise unprompted, whereas
     * {@code false} forbids something a model can plausibly reach for: asked to consume two Kafka topics,
     * the obvious shape is two services on one listener, which {@code kafka} makes illegal. Across the whole
     * corpus this emits <b>27</b> lines instead of well over a hundred.
     *
     * <p>The two keys are written <b>separately</b> rather than merged into one note: they answer different
     * questions, and only a few service types fire both, so a combined line would be wrong for the rest.
     */
    void cardinality(TriggerScope scope, ServiceDraft draft) {
        ServiceRules.Cardinality cardinality =
                ServiceRules.resolveCardinality(scope.serviceType(), scope.listener());
        if (!cardinality.multipleListeners()) {
            draft.setSingleListenerOnly();
        }
        if (!cardinality.multipleServices()) {
            // The stronger of the two listener-side prohibitions. Emitted instead of, not alongside,
            // the same-type note: "at most one service" already implies "at most one of this type", and
            // stating both would read as two separate restrictions.
            draft.setSingleServiceOnly();
        } else if (!cardinality.multipleServicesOfSameType()) {
            draft.setSingleServicePerListenerOnly();
        }
    }

    /**
     * The spec {@code listeners[].requiredImports} — the side-effect-only imports the generated code needs.
     *
     * <p>Carried on the <b>service</b> rather than hoisted to the library: The spec declares these on the
     * listener, so only code that actually uses that listener needs them.
     */
    void requiredImports(TriggerScope scope, ServiceDraft draft) {
        List<ServiceRules.ImportDirective> directives =
                ServiceRules.resolveRequiredImports(scope.listener());
        if (directives.isEmpty()) {
            return;
        }
        List<RequiredImport> imports = new ArrayList<>();
        for (ServiceRules.ImportDirective directive : directives) {
            imports.add(new RequiredImport(directive.module(), directive.alias()));
        }
        draft.setRequiredImports(imports);
    }

    /**
     * The spec {@code listeners[].platformDependencies} — native artifacts the build cannot fetch. Carried
     * on the service for the same reason {@link #requiredImports} is.
     */
    void platformDependencies(TriggerScope scope, ServiceDraft draft) {
        List<ServiceRules.PlatformDependency> dependencies =
                ServiceRules.resolvePlatformDependencies(scope.listener());
        if (dependencies.isEmpty()) {
            return;
        }
        List<PlatformDependency> resolved = new ArrayList<>();
        for (ServiceRules.PlatformDependency dependency : dependencies) {
            PlatformDependency entry = new PlatformDependency();
            entry.setCoordinate(dependency.coordinate());
            if (dependency.provided()) {
                // Set only when true, per the omission rule: absent means bundled, which is the case
                // that needs no action from the reader.
                entry.setProvided(true);
            }
            entry.setAcquisitionUrl(dependency.acquisitionUrl());
            entry.setAcquisitionNote(dependency.acquisitionNote());
            if (!dependency.nativeLibraries().isEmpty()) {
                List<NativeLibrary> libraries = new ArrayList<>();
                for (ServiceRules.NativeLibrary library : dependency.nativeLibraries()) {
                    NativeLibrary resolvedLibrary = new NativeLibrary();
                    resolvedLibrary.setOs(library.os());
                    resolvedLibrary.setFile(library.file());
                    resolvedLibrary.setVariable(library.variable());
                    libraries.add(resolvedLibrary);
                }
                entry.setNativeLibraries(libraries);
            }
            resolved.add(entry);
        }
        draft.setPlatformDependencies(resolved);
    }

    /**
     * The spec {@code serviceTypes[].identifier} — the identifier/base-path slot the generated service must
     * or may fill.
     *
     * <p>The wire shape mirrors the document's, {@code {presence, form[]}}, rather than a pre-rendered
     * string: turning {@code basePath} into {@code /basePath} is a syntax decision belonging to the
     * renderer, which already owns every other one.
     */
    void identifier(TriggerScope scope, ServiceDraft draft) {
        if (scope.serviceType() == null) {
            return;
        }
        ServiceRules.resolveIdentifier(scope.serviceType().identifier()).ifPresent(slot -> {
            ServiceIdentifier identifier = new ServiceIdentifier();
            identifier.setPresence(slot.required()
                    ? IdentifierSpec.PRESENCE_REQUIRED : IdentifierSpec.PRESENCE_OPTIONAL);
            identifier.setForm(List.copyOf(slot.forms()));
            draft.setIdentifier(identifier);
        });
    }

    /**
     * The spec {@code listeners[].type} — the listener a service attaches to, with its init parameters, and
     * The spec's {@code services}, which says whether this service type may be attached to one at all.
     *
     * <p>The spec models no listener init fields in the document, so every parameter comes from the semantic
     * model: names and types from the {@code init} signature, descriptions from its doc comment, and
     * declared defaults recovered from the syntax tree.
     *
     * <p>The built object is <b>cached and shared</b> by identity across every service entry of a library,
     * which is load-bearing: a downstream enricher rewrites {@code listener.name} in place for packages
     * shipping a non-canonical listener class, and handing each service its own copy would change how many
     * times that rewrite is applied.
     *
     * <p>The cache is keyed on the <b>document's</b> listener entry, falling back to the class only when
     * there is none. the spec's {@code deprecated} is authored per listener entry, and two entries may name one
     * class, in which case a class-keyed cache would hand the second entry the first's deprecation note.
     */
    void listener(TriggerScope scope, ServiceDraft draft) {
        Object key = scope.listener() != null ? scope.listener() : scope.listenerClass();
        draft.setListener(builtListeners.computeIfAbsent(key, unused -> buildListener(scope)));
        draft.setAlternativeListeners(alternativeListenerNames(scope));
        // The listener is still emitted either way — a consumer needs its types even when the service is
        // written some other way, and the type closure reaches them through it.
        if (scope.document() != null
                && !ListenerPairingResolver.isHostedByAnyListener(
                        scope.document().listeners(), scope.serviceType())) {
            draft.setNotListenerAttachable();
        }
    }

    /**
     * The spec §2 {@code listeners[].services} — the other listeners this service type may attach to, as
     * the {@code alias:ClassName} a reader would write.
     *
     * <p>Resolved against the semantic model exactly as the chosen listener is, and dropped when it does
     * not resolve: naming a class the package does not declare would offer a transport whose
     * {@code on new mcp:X(...)} does not compile, which is the failure the pairing tier already refuses to
     * make for the primary listener.
     *
     * <p>Init parameters are deliberately <b>not</b> carried. The alternative is a pointer — "this also
     * works" — and a second full parameter list per service entry would double the listener surface of
     * every mcp service to say something the reader can read off the library's own listener class.
     */
    private static List<String> alternativeListenerNames(TriggerScope scope) {
        if (scope.document() == null) {
            return List.of();
        }
        String primary = TypeRefResolver.moduleAlias(scope.packageName()) + ":"
                + scope.listenerClass().getName().orElse(DEFAULT_LISTENER_NAME);
        List<String> names = new ArrayList<>();
        for (TriggerMetadataModel.Listener alternative : ListenerPairingResolver.alternativeHosts(
                scope.document().listeners(), scope.serviceType(), scope.listener())) {
            String declared = alternative.type() == null ? null : alternative.type().name();
            String className = scope.facts().resolveListenerClass(declared)
                    .flatMap(ClassSymbol::getName).orElse(null);
            if (className == null) {
                continue;
            }
            String name = TypeRefResolver.moduleAlias(scope.packageName()) + ":" + className;
            // Two document entries can resolve to one class — `resolveListenerClass` falls back to the
            // canonical `Listener` for an unnamed one — and an alternative identical to the primary is not
            // an alternative at all.
            if (!name.equals(primary) && !names.contains(name)) {
                names.add(name);
            }
        }
        return names;
    }

    private static Listener buildListener(TriggerScope scope) {
        ClassSymbol listenerClass = scope.listenerClass();
        String packageName = scope.packageName();
        String className = listenerClass.getName().orElse(DEFAULT_LISTENER_NAME);

        Listener listener = new Listener();
        listener.setName(TypeRefResolver.moduleAlias(packageName) + ":" + className);
        // The spec §2 `doc`. The listener's parameters carry their own documentation from the semantic
        // model, but what attaching to the listener accomplishes is stated nowhere a symbol can be read
        // from, which is why the spec makes this required rather than leaving it to introspection.
        if (scope.listener() != null && scope.listener().doc() != null
                && !scope.listener().doc().isBlank()) {
            listener.setDescription(scope.listener().doc());
        }
        // The spec `deprecated`: prose, not a flag. The document says *why* the listener is superseded, and
        // that sentence is the only thing that tells a reader what to use instead.
        if (scope.listener() != null && scope.listener().deprecated() != null
                && !scope.listener().deprecated().isBlank()) {
            listener.setDeprecationNote(scope.listener().deprecated());
        }

        List<Parameter> parameters = new ArrayList<>();
        for (TriggerSemanticFacts.InitParam param : scope.facts().listenerInitParams(listenerClass)) {
            Parameter parameter = new Parameter();
            parameter.setName(param.name());
            // Always stated, empty string included: a listener parameter's description is part of the shape
            // the wire has always carried, so an absent doc comment renders as "" rather than dropping it.
            parameter.setDescription(param.description() != null ? param.description() : "");
            parameter.setType(TypeResolver.resolveTypeWithLinks(
                    param.typeSignature() != null ? param.typeSignature() : "", packageName));
            if (param.optional()) {
                parameter.setOptional(true);
            }
            if (param.defaultValue() != null && !param.defaultValue().isEmpty()) {
                parameter.setDefaultValue(param.defaultValue());
            }
            parameters.add(parameter);
        }
        listener.setParameters(parameters);
        return listener;
    }
}
