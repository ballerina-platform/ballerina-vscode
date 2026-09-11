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

import io.ballerina.flowmodelgenerator.core.copilot.model.ConstraintSubject;
import io.ballerina.flowmodelgenerator.core.copilot.model.ServiceConstraint;
import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

/**
 * The spec {@code rules[]} — the exclusivity constraints a service type declares.
 *
 * <p><b>Runs before the handler catalog.</b> {@link ConstraintResolver} needs this service type's handler
 * and parameter <i>ids</i>, so that a {@code {handler}} or {@code {param}} subject addressing something
 * absent can be dropped rather than offered to the model as a choice. Those ids are read from the document
 * directly rather than from the built {@link ServiceDraft}, which keeps this a pure function of its inputs
 * and leaves the registry with a single ordering rule ("the catalog runs last").
 *
 * <p><b>Ids, not names, and from the document alone.</b> The spec §6.1.1 made both subject kinds address
 * their construct by id, because an {@code addMode: "many"} option's name is always {@code "*"} — {@code
 * graphql} declares three such shapes on one service type, and a name-keyed check could not tell an
 * {@code atLeastOne} over its query shape from one over its mutation shape. §0 then confines hierarchical
 * ids to a non-concrete service type: a concrete one's methods are introspectable by name and carry no id,
 * so nothing in a rule can address them.
 *
 * <p>A concrete service type, or one whose {@code options} are absent, therefore yields a {@code null}
 * catalog, which suppresses the cross-check rather than dropping every subject. An unresolvable type is
 * already vetoed elsewhere and must not additionally cause a rule to be emptied.
 *
 * @since 1.7.0
 */
final class ConstraintAspect {

    private static final Logger LOGGER = Logger.getLogger(ConstraintAspect.class.getName());

    private ConstraintAspect() {
        // Prevent instantiation
    }

    static void contribute(TriggerScope scope, ServiceDraft draft) {
        TriggerMetadataModel.ServiceType serviceType = scope.serviceType();
        if (serviceType == null) {
            return;
        }
        List<TriggerMetadataModel.Rule> rules = new ArrayList<>();
        if (serviceType.rules() != null) {
            rules.addAll(serviceType.rules());
        }
        rules.addAll(spanningRules(scope, serviceType));
        if (rules.isEmpty()) {
            return;
        }
        List<ConstraintResolver.Constraint> constraints = ConstraintResolver.resolve(
                scope.libraryName(), rules, serviceType.id(), index(scope), scope.annotations());
        if (constraints.isEmpty()) {
            return;
        }
        List<ServiceConstraint> resolved = new ArrayList<>();
        constraints.forEach(constraint -> resolved.add(toModel(constraint)));
        draft.setConstraints(resolved);
    }

    /**
     * The spec's <b>top-level</b> {@code rules[]} — constraints spanning more than one service type, where
     * every subject must name its {@code serviceType} — narrowed to the ones this service type
     * participates in.
     *
     * <p>A spanning rule is stated on every participant because entries render independently: a reader
     * looking at one service never sees the other's notes, so stating it once would leave whichever entry
     * they happen to be writing with no mention of the constraint. Restricting it to <i>participants</i>
     * keeps it off the service types it does not govern.
     *
     * <p><b>Latent</b>: no corpus document declares a top-level rule. The key was parsed and validated by
     * {@code RuleRefCheck} but read by nothing on the render path, so the first document to use one would
     * have lost it silently.
     */
    private static List<TriggerMetadataModel.Rule> spanningRules(TriggerScope scope,
                                                                TriggerMetadataModel.ServiceType serviceType) {
        if (scope.document() == null || scope.document().rules() == null || serviceType.id() == null) {
            return List.of();
        }
        List<TriggerMetadataModel.Rule> participating = new ArrayList<>();
        for (TriggerMetadataModel.Rule rule : scope.document().rules()) {
            if (rule == null) {
                continue;
            }
            if (mentions(rule, serviceType.id())) {
                participating.add(rule);
                continue;
            }
            // A rule that names NO service type at all reaches no entry, so it would otherwise disappear
            // from the catalog with no veto and no log line. Reported once per service type rather than
            // globally because this aspect has no library-wide hook.
            //
            // Not a veto: the rule is the document's defect, not this service type's, and dropping a
            // service over another construct's error is exactly what `drop` exists to avoid.
            if (namesNoServiceType(rule)) {
                LOGGER.warning("Skipped top-level rule '" + rule.id() + "' for " + scope.libraryName()
                        + ": The spec requires every subject of a top-level rule to name its `serviceType`,"
                        + " and none of this rule's subjects does, so it reaches no service type.");
            }
        }
        return participating;
    }

    /** Whether no subject of a rule names a service type — which at top level makes it unreachable. */
    private static boolean namesNoServiceType(TriggerMetadataModel.Rule rule) {
        if (rule.subjects() == null || rule.subjects().isEmpty()) {
            return true;
        }
        for (TriggerMetadataModel.Subject subject : rule.subjects()) {
            if (subject != null && subject.serviceType() != null && !subject.serviceType().isBlank()) {
                return false;
            }
        }
        return true;
    }

    /**
     * Whether a rule names this service type in any subject.
     *
     * <p>A subject naming no {@code serviceType} at all is <b>not</b> read as the enclosing one here, unlike
     * in {@link ConstraintResolver}: at top level the spec requires every subject to name one, so an unnamed
     * subject is a document defect ({@code RuleRefCheck} reports it) and treating it as a match would attach
     * the rule to every service type in the document.
     */
    private static boolean mentions(TriggerMetadataModel.Rule rule, String serviceTypeId) {
        if (rule.subjects() == null) {
            return false;
        }
        for (TriggerMetadataModel.Subject subject : rule.subjects()) {
            if (subject != null && serviceTypeId.equals(subject.serviceType())) {
                return true;
            }
        }
        return false;
    }

    /**
     * The document's service types, for attributing a subject that names one.
     *
     * <p>Handler names are resolved per service type by the same {@link #declaredHandlerNames} the enclosing
     * entry uses, so a spanning rule's subjects are cross-checked against <i>their own</i> catalogs.
     */
    private static ConstraintResolver.ServiceTypeIndex index(TriggerScope scope) {
        Map<String, TriggerMetadataModel.ServiceType> byId = new LinkedHashMap<>();
        if (scope.document() != null && scope.document().serviceTypes() != null) {
            for (TriggerMetadataModel.ServiceType candidate : scope.document().serviceTypes()) {
                if (candidate != null && candidate.id() != null) {
                    byId.putIfAbsent(candidate.id(), candidate);
                }
            }
        }
        return new ConstraintResolver.ServiceTypeIndex() {
            @Override
            public String typeName(String serviceTypeId) {
                TriggerMetadataModel.ServiceType found = byId.get(serviceTypeId);
                return found == null || found.type() == null ? null : found.type().name();
            }

            @Override
            public ConstraintResolver.Catalog catalog(String serviceTypeId) {
                // The ENCLOSING service type is answered from the scope, never through the map. `byId` is
                // built with `putIfAbsent`, so two entries sharing an id would resolve the second one's
                // subjects against the first one's handlers and drop them as phantoms. Nothing validates
                // id uniqueness, and here the right answer is already in hand.
                String enclosingId = scope.serviceType() == null ? null : scope.serviceType().id();
                if (serviceTypeId == null || serviceTypeId.equals(enclosingId)) {
                    return scope.serviceType() == null ? null : declaredCatalog(scope.serviceType());
                }
                // An id naming nothing yields `null`, which suppresses the cross-check rather than dropping
                // the subject: the subject itself is dropped by `attribute`, so reaching here means the id
                // resolved and only its catalog is unknown.
                TriggerMetadataModel.ServiceType found = byId.get(serviceTypeId);
                return found == null ? null : declaredCatalog(found);
            }
        };
    }

    /**
     * The handler and parameter ids this service type declares, or {@code null} when the catalog is not
     * knowable.
     *
     * <p><b>Read from the document alone, and only for a non-concrete type.</b> That is not a narrowing of
     * what the old name-based check covered — it is what the spec §0 makes possible: "a handler backed by a
     * concrete type has no {@code options[]} entry to carry an id at all … hierarchical ids therefore only
     * ever appear under a non concrete service type". A concrete type's methods have names but no ids, so
     * no {@code handler}/{@code param} subject can address one, and cross-checking against the semantic
     * model would answer a question the document cannot ask. It yields {@code null} instead, which
     * suppresses the check rather than dropping every such subject as a phantom.
     */
    private static ConstraintResolver.Catalog declaredCatalog(
            TriggerMetadataModel.ServiceType serviceType) {
        if (HandlerCatalogResolver.isConcrete(serviceType)) {
            return null;
        }
        List<TriggerMetadataModel.ServiceType.HandlerOption> options =
                serviceType.handlers() == null ? null : serviceType.handlers().options();
        if (options == null) {
            return null;
        }
        Map<String, String> handlerLabels = new LinkedHashMap<>();
        Map<String, ConstraintResolver.Catalog.ParamLabel> paramLabels = new LinkedHashMap<>();
        for (TriggerMetadataModel.ServiceType.HandlerOption option : options) {
            if (option == null || option.id() == null) {
                continue;
            }
            // A `many` option's name is `*`, which names nothing a reader could look for, so its id's own
            // segment is the label — `graphql`'s `$service.query` reads as `query`. A `subset` option's
            // name is the real method name and always wins.
            String label = option.name() == null
                    || TriggerMetadataModel.ServiceType.HandlerOption.WILDCARD_NAME.equals(option.name())
                    ? lastSegment(option.id()) : option.name();
            handlerLabels.put(option.id(), label);
            for (TriggerMetadataModel.ServiceType.Param param : option.params() == null
                    ? List.<TriggerMetadataModel.ServiceType.Param>of() : option.params()) {
                if (param == null || param.id() == null) {
                    continue;
                }
                // Same fallback one tier down: a repeatable slot is unnamed, because the author names each
                // occurrence, so its id's segment is what a note can call it.
                String paramName = param.name() == null ? lastSegment(param.id()) : param.name();
                paramLabels.put(param.id(),
                        new ConstraintResolver.Catalog.ParamLabel(label, paramName));
            }
        }
        return new ConstraintResolver.Catalog(Map.copyOf(handlerLabels), Map.copyOf(paramLabels));
    }

    /** The last dot-separated segment of a hierarchical id — the construct's own name within its owner. */
    private static String lastSegment(String id) {
        int separator = id.lastIndexOf('.');
        return separator < 0 ? id.substring(id.startsWith("$") ? 1 : 0) : id.substring(separator + 1);
    }

    /**
     * Wire shape: {@code {id?, rule, subjects[], message?, severity?, prefer?}}.
     *
     * <p>The registry id is emitted verbatim rather than a normalized enum name, so a consumer states what
     * the document states. {@code message} is carried because the document's own sentence says <i>why</i> a
     * constraint exists, which a renderer should prefer over anything it can synthesize from the subjects.
     */
    private static ServiceConstraint toModel(ConstraintResolver.Constraint constraint) {
        ServiceConstraint resolved = new ServiceConstraint();
        if (constraint.id() != null && !constraint.id().isEmpty()) {
            resolved.setId(constraint.id());
        }
        resolved.setRule(constraint.kind().registryId());
        List<ConstraintSubject> subjects = new ArrayList<>();
        for (ConstraintResolver.Subject subject : constraint.subjects()) {
            subjects.add(subjectToModel(subject));
        }
        resolved.setSubjects(subjects);
        resolved.setMessage(constraint.message());
        // Emitted only when the document downgrades the rule; `error` is the default and stating it would
        // break the omission rule.
        if (TriggerMetadataModel.Rule.SEVERITY_WARNING.equals(constraint.severity())) {
            resolved.setSeverity(constraint.severity());
        }
        resolved.setPrefer(constraint.prefer());
        return resolved;
    }

    private static ConstraintSubject subjectToModel(ConstraintResolver.Subject subject) {
        ConstraintSubject resolved = new ConstraintSubject();
        switch (subject) {
            case ConstraintResolver.Subject.Identifier ignored ->
                    resolved.setKind(TriggerMetadataModel.Subject.KIND_IDENTIFIER);
            case ConstraintResolver.Subject.Annotation annotation -> {
                resolved.setKind(TriggerMetadataModel.Subject.KIND_ANNOTATION);
                // The resolved name is what a reader must write; the id is kept so the wire still says
                // which registry entry the rule referenced.
                resolved.setAnnotation(annotation.annotationName());
                resolved.setAnnotationId(annotation.annotationId());
            }
            case ConstraintResolver.Subject.AnnotationField field -> {
                resolved.setKind(TriggerMetadataModel.Subject.KIND_ANNOTATION_FIELD);
                resolved.setAnnotation(field.annotationName());
                resolved.setAnnotationId(field.annotationId());
                resolved.setPath(List.copyOf(field.path()));
            }
            case ConstraintResolver.Subject.Handler handler -> {
                resolved.setKind(TriggerMetadataModel.Subject.KIND_HANDLER);
                // The reader-facing label is what a note names; the id it was addressed by follows for
                // traceability, the same id/name pairing `annotationId`/`annotation` already uses.
                resolved.setName(handler.name());
                resolved.setId(handler.handlerId());
            }
            case ConstraintResolver.Subject.Param param -> {
                resolved.setKind(TriggerMetadataModel.Subject.KIND_PARAM);
                resolved.setHandler(param.handler());
                resolved.setName(param.name());
                resolved.setId(param.paramId());
            }
        }
        resolved.setRole(subject.role());
        // The spec: emitted only for a subject belonging to a DIFFERENT service type than the entry being
        // rendered, so a service-type-scoped rule — every rule in the corpus — is byte-identical to before.
        // The resolved type name is what a reader recognises; the id follows it for traceability.
        if (subject.serviceType() != null) {
            resolved.setServiceType(subject.serviceType());
            resolved.setServiceTypeId(subject.serviceTypeId());
        }
        return resolved;
    }
}
