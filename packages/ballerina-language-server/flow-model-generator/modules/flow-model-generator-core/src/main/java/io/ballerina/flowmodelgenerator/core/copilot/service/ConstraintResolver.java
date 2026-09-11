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

import io.ballerina.modelgenerator.commons.trigger.models.TriggerMetadataModel;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

/**
 * Resolves <b>the spec {@code rules[]}</b>: the cross-construct constraints a service type declares.
 *
 * <p>A rule is a {@code rule: "<namespace>.<id>"} drawn from an open registry (see {@link Kind}) over a
 * tagged union of subject kinds. Per the spec, an unrecognised rule id or subject kind is skipped with a logged
 * warning rather than failing, so an older consumer can still read a newer manifest.
 *
 * @since 1.7.0
 */
final class ConstraintResolver {

    private static final Logger LOGGER = Logger.getLogger(ConstraintResolver.class.getName());

    private ConstraintResolver() {
        // Prevent instantiation
    }

    /** The registry entries this build implements (the spec). */
    enum Kind {
        /** Exactly one subject present — not zero, not more than one. */
        EXACTLY_ONE(TriggerMetadataModel.Rule.RULE_EXACTLY_ONE),
        /** Zero or one subject — never more, but zero is fine. */
        AT_MOST_ONE(TriggerMetadataModel.Rule.RULE_AT_MOST_ONE),
        /** One or more subjects present. */
        AT_LEAST_ONE(TriggerMetadataModel.Rule.RULE_AT_LEAST_ONE),
        /** All subjects present, or none of them. */
        ALL_OR_NONE(TriggerMetadataModel.Rule.RULE_ALL_OR_NONE),
        /** If {@code when} is present, {@code then} must be present. */
        REQUIRES(TriggerMetadataModel.Rule.RULE_REQUIRES),
        /** If {@code when} is present, {@code then} must be absent. */
        CONFLICTS_WITH(TriggerMetadataModel.Rule.RULE_CONFLICTS_WITH);

        private final String registryId;

        Kind(String registryId) {
            this.registryId = registryId;
        }

        /** The registry id a document writes. */
        String registryId() {
            return registryId;
        }

        /** Whether this constraint's subjects are interchangeable, or fixed as {@code when}/{@code then}. */
        boolean isAsymmetric() {
            return this == REQUIRES || this == CONFLICTS_WITH;
        }

        static Kind of(String registryId) {
            for (Kind kind : values()) {
                if (kind.registryId.equals(registryId)) {
                    return kind;
                }
            }
            return null;
        }
    }

    /**
     * One resolved subject: the spec's tagged union, flattened to the fields a consumer renders.
     *
     * <p>Sealed so the renderer's switch cannot silently drop a newly added subject kind.
     *
     * <p>Every variant carries a service type because a top-level rule may span service types, and each of
     * its subjects names its own. It is {@code null} for a subject in the enclosing service type.
     */
    sealed interface Subject {

        /** This subject's name within its rule; {@code null} when the document labels none. */
        String role();

        /**
         * The service type this subject belongs to, as its declared <i>type name</i> — {@code null} when it
         * is the enclosing one. The {@code $id} travels alongside as {@link #serviceTypeId()}.
         */
        String serviceType();

        /** The {@code serviceTypes[].id} this subject named; {@code null} when it named none. */
        String serviceTypeId();

        /**
         * The identifier slot of this subject's service type.
         *
         * @param role          the subject's role label
         * @param serviceType   the owning service type's declared name, or {@code null} for the enclosing one
         * @param serviceTypeId the owning service type's id, or {@code null}
         */
        record Identifier(String role, String serviceType, String serviceTypeId) implements Subject {
        }

        /**
         * An annotation as a whole — its presence, rather than a field inside it.
         *
         * @param annotationId   the {@code annotations[].id} referenced
         * @param annotationName the annotation's name, resolved through the annotation registry
         * @param role           the subject's role label
         * @param serviceType    the owning service type's declared name, or {@code null}
         * @param serviceTypeId  the owning service type's id, or {@code null}
         */
        record Annotation(String annotationId, String annotationName, String role, String serviceType,
                          String serviceTypeId) implements Subject {
        }

        /**
         * A field inside an annotation's record, e.g. {@code @rabbitmq:ServiceConfig}'s {@code queueName}.
         *
         * @param annotationId   the {@code annotations[].id} referenced
         * @param annotationName the annotation's name, resolved through the annotation registry
         * @param path           the field path; an array so a nested field is reachable
         * @param role           the subject's role label
         * @param serviceType    the owning service type's declared name, or {@code null}
         * @param serviceTypeId  the owning service type's id, or {@code null}
         */
        record AnnotationField(String annotationId, String annotationName, List<String> path, String role,
                               String serviceType, String serviceTypeId) implements Subject {
        }

        /**
         * One of the service type's handlers, addressed by the spec §6.1.1 {@code id}.
         *
         * @param handlerId     the {@code handlers.options[].id} referenced, carried alongside the label
         *                      for traceability the same way {@code annotationId} is
         * @param name          the handler as a reader sees it: its {@code name} where that is a
         *                      real method name, and the id's last segment where the option is
         *                      {@code addMode: "many"} and so named {@code "*"}. A note that said
         *                      "at least one of {@code *}" would name nothing
         * @param role          the subject's role label
         * @param serviceType   the owning service type's declared name, or {@code null}
         * @param serviceTypeId the owning service type's id, or {@code null}
         */
        record Handler(String handlerId, String name, String role, String serviceType, String serviceTypeId)
                implements Subject {
        }

        /**
         * One parameter of one handler, addressed by the spec §6.1.1 {@code id}.
         *
         * @param paramId       the {@code params[].id} referenced
         * @param handler       the owning handler's reader-facing label, resolved from the param's own id
         *                      rather than from a separate {@code handler} field, which the spec removed
         * @param name          the parameter's name, or the id's last segment for a repeatable slot the
         *                      document leaves unnamed
         * @param role          the subject's role label
         * @param serviceType   the owning service type's declared name, or {@code null}
         * @param serviceTypeId the owning service type's id, or {@code null}
         */
        record Param(String paramId, String handler, String name, String role, String serviceType,
                     String serviceTypeId) implements Subject {
        }
    }

    /**
     * One resolved rule.
     *
     * @param id       the document's local rule id, used for diagnostics and for the rendered note
     * @param kind     the constraint's semantics
     * @param subjects the subjects it ranges over, in document order; never fewer than two
     * @param message  the document's authored diagnostic text, preferred over a synthesized sentence when
     *                 present; {@code null} otherwise
     * @param severity {@code "warning"} when the document downgrades the rule; {@code null} for the default
     *                 {@code error}
     * @param prefer   the {@code role} a generator should default to, or {@code null}
     */
    record Constraint(String id, Kind kind, List<Subject> subjects, String message, String severity,
                      String prefer) {
    }

    /**
     * One service type's addressable constructs, as the spec §6.1.1 addresses them: by id.
     *
     * <p>Both maps are keyed by the construct's own hierarchical id, which is the whole point of the
     * revision that introduced them — an {@code addMode: "many"} option is named {@code "*"}, so a
     * name-keyed catalog cannot tell {@code graphql}'s query shape from its mutation shape, and a
     * {@code handler}/{@code name} pair for a param inherits the same ambiguity one level down.
     *
     * <p>The values are what a <b>reader</b> is shown: a handler's real method name where it has one, and
     * the id's last segment where it does not. Nothing renders the id itself — it names a slot in a JSON
     * document, not anything that exists in Ballerina source — but it travels on the wire beside the label
     * so a consumer can trace a note back to the rule that produced it.
     *
     * @param handlerLabels the reader-facing label of every declared handler, by handler id
     * @param paramLabels   the owning handler and parameter name of every declared parameter, by param id
     */
    record Catalog(Map<String, String> handlerLabels, Map<String, ParamLabel> paramLabels) {

        /**
         * A parameter as a note names it.
         *
         * @param handler the owning handler's reader-facing label
         * @param name    the parameter's own name, or its id's last segment when the document leaves a
         *                repeatable slot unnamed
         */
        record ParamLabel(String handler, String name) {
        }
    }

    /**
     * What a rule's subjects may be attributed to: the document's service types, by id.
     *     */
    interface ServiceTypeIndex {

        /**
         * The declared type name of a service type id, e.g. {@code "$upgradeService"} to
         * {@code "UpgradeService"}.
         *
         * @param serviceTypeId the {@code serviceTypes[].id}
         * @return the declared type name, or {@code null} when no entry declares that id
         */
        String typeName(String serviceTypeId);

        /**
         * The handler and parameter ids a service type declares, for the cross-check that drops a subject
         * addressing a construct that does not exist.
         *
         * @param serviceTypeId the {@code serviceTypes[].id}; may be {@code null} for the enclosing type
         * @return the catalog; {@code null} when it is not knowable, which suppresses the cross-check,
         *         whereas an <b>empty</b> catalog means the type declares nothing and does drop subjects
         */
        Catalog catalog(String serviceTypeId);

        /**
         * Whether a subject naming a service type should be attributed to it.
         *
         * <p>{@code false} for a rule set scoped to a single service type, where a named service type is
         * redundant rather than a cross-service-type reference.
         *
         * @return whether {@link #typeName(String)} can be trusted to answer for a real id
         */
        default boolean attributes() {
            return true;
        }
    }

    /**
     * Resolves a rule set.
     *
     * <p>A rule is dropped whole, with a warning, when it names an unimplemented registry id or when no
     * usable subject survives.
     *
     * <p><b>One subject is enough.</b> The spec's schema has always allowed it and its §6.1.1 now states
     * the reading outright: for an {@code addMode: "many"} option, "present" means "instantiated one or
     * more times" rather than "declared or not", so {@code structure.atLeastOne} over a single subject is a
     * real constraint — {@code graphql}'s "a schema is invalid without at least one query field" is exactly
     * that, and a two-subject floor silently deleted it. An <b>asymmetric</b> rule still needs both roles,
     * which the {@code when}/{@code then} check below enforces and which no single subject can satisfy.
     *
     * @param libraryName            the library, for log attribution only
     * @param rules                  the rules to resolve; may be {@code null}
     * @param enclosingServiceTypeId the id of the service type being built, which a subject naming none
     *                               belongs to (the spec); {@code null} when there is no enclosing type
     * @param index                  the document's service types, for attributing a subject that names one
     * @param annotations            the spec's registry, mapping a subject's annotation id to the annotation
     *                               it names; {@code null} keeps the id as the name
     * @return the resolved rules, in document order
     */
    static List<Constraint> resolve(String libraryName,
                                    List<TriggerMetadataModel.Rule> rules,
                                    String enclosingServiceTypeId,
                                    ServiceTypeIndex index,
                                    AnnotationRegistry annotations) {
        List<Constraint> resolved = new ArrayList<>();
        if (rules == null) {
            return resolved;
        }
        for (TriggerMetadataModel.Rule rule : rules) {
            if (rule == null) {
                continue;
            }
            Kind kind = Kind.of(rule.rule());
            if (kind == null) {
                // The spec's skip-unknown policy, which is what lets an older consumer read a newer manifest.
                LOGGER.warning("Skipped rule '" + rule.id() + "' for " + libraryName
                        + ": '" + rule.rule() + "' is not a registry entry this build implements");
                continue;
            }
            List<Subject> subjects = subjects(libraryName, rule, enclosingServiceTypeId, index, annotations);
            if (subjects.isEmpty()) {
                LOGGER.warning("Skipped rule '" + rule.id() + "' for " + libraryName
                        + ": no usable subject — a constraint that ranges over nothing states nothing");
                continue;
            }
            if (kind.isAsymmetric() && !hasBothRoles(subjects)) {
                // Without the roles there is no way to tell the antecedent from the consequent, and
                // guessing inverts the constraint.
                LOGGER.warning("Skipped rule '" + rule.id() + "' for " + libraryName + ": '"
                        + kind.registryId() + "' is asymmetric but its subjects carry no `"
                        + TriggerMetadataModel.Rule.ROLE_WHEN + "`/`"
                        + TriggerMetadataModel.Rule.ROLE_THEN + "` roles");
                continue;
            }
            resolved.add(new Constraint(rule.id(), kind, subjects, blankToNull(rule.message()),
                    blankToNull(rule.severity()), blankToNull(rule.prefer())));
        }
        return resolved;
    }

    private static boolean hasBothRoles(List<Subject> subjects) {
        boolean when = false;
        boolean then = false;
        for (Subject subject : subjects) {
            when |= TriggerMetadataModel.Rule.ROLE_WHEN.equals(subject.role());
            then |= TriggerMetadataModel.Rule.ROLE_THEN.equals(subject.role());
        }
        return when && then;
    }

    /**
     * Which service type a subject belongs to.
     *
     * @param name        the declared type name, emitted only when it differs from the enclosing type
     * @param id          the id the subject named, carried alongside {@code name} for traceability
     * @param effectiveId the id whose handler catalog governs this subject: the one it named, or the
     *                    enclosing one when it named none
     */
    private record Attribution(String name, String id, String effectiveId) {
    }

    /**
     * Attributes one subject, or {@code null} when it names a service type the document does not declare.
     */
    private static Attribution attribute(String libraryName, TriggerMetadataModel.Rule rule,
                                         TriggerMetadataModel.Subject subject, String enclosingServiceTypeId,
                                         ServiceTypeIndex index) {
        String declared = subject.serviceType();
        if (declared == null || declared.isBlank() || declared.equals(enclosingServiceTypeId)
                || !index.attributes()) {
            return new Attribution(null, null, enclosingServiceTypeId);
        }
        String name = index.typeName(declared);
        if (name == null) {
            LOGGER.warning("Dropped subject of rule '" + rule.id() + "' for " + libraryName
                    + ": serviceType '" + declared + "' is not declared by serviceTypes[]");
            return null;
        }
        return new Attribution(name, declared, declared);
    }

    private static List<Subject> subjects(String libraryName, TriggerMetadataModel.Rule rule,
                                          String enclosingServiceTypeId, ServiceTypeIndex index,
                                          AnnotationRegistry annotations) {
        List<Subject> subjects = new ArrayList<>();
        if (rule.subjects() == null) {
            return subjects;
        }
        for (TriggerMetadataModel.Subject subject : rule.subjects()) {
            if (subject == null || subject.kind() == null) {
                continue;
            }
            Attribution owner = attribute(libraryName, rule, subject, enclosingServiceTypeId, index);
            if (owner == null) {
                continue;
            }
            // The catalog that governs this subject is its OWN service type's, not the enclosing entry's.
            // Otherwise a top-level rule's handler subjects would all be dropped as phantoms.
            Catalog catalog = index.catalog(owner.effectiveId());
            Subject resolved = switch (subject.kind()) {
                case TriggerMetadataModel.Subject.KIND_IDENTIFIER ->
                        new Subject.Identifier(subject.role(), owner.name(), owner.id());
                case TriggerMetadataModel.Subject.KIND_ANNOTATION ->
                        annotationSubject(libraryName, rule, subject.id(), null, subject.role(),
                                annotations, owner);
                case TriggerMetadataModel.Subject.KIND_ANNOTATION_FIELD ->
                        annotationSubject(libraryName, rule, subject.annotation(),
                                nonEmpty(subject.path()), subject.role(), annotations, owner);
                case TriggerMetadataModel.Subject.KIND_HANDLER ->
                        handlerSubject(libraryName, rule, subject.id(), subject.role(), catalog, owner);
                case TriggerMetadataModel.Subject.KIND_PARAM ->
                        paramSubject(libraryName, rule, subject.id(), subject.role(), catalog, owner);
                default -> {
                    LOGGER.warning("Dropped subject of rule '" + rule.id() + "' for " + libraryName
                            + ": '" + subject.kind() + "' is not a subject kind this build implements");
                    yield null;
                }
            };
            if (resolved != null) {
                subjects.add(resolved);
            }
        }
        return subjects;
    }

    private static Subject annotationSubject(String libraryName, TriggerMetadataModel.Rule rule, String id,
                                             List<String> path, String role, AnnotationRegistry annotations,
                                             Attribution owner) {
        if (id == null || id.isBlank()) {
            LOGGER.warning("Dropped subject of rule '" + rule.id() + "' for " + libraryName
                    + ": it names no annotation");
            return null;
        }
        String name = annotationName(id, annotations);
        if (name == null) {
            // The rule references a registry entry that does not exist, so there is no annotation for a
            // reader to attach. Same policy as a phantom handler: drop it and say why.
            LOGGER.warning("Dropped subject of rule '" + rule.id() + "' for " + libraryName
                    + ": annotation id '" + id + "' is not in annotations[]");
            return null;
        }
        return path == null ? new Subject.Annotation(id, name, role, owner.name(), owner.id())
                : new Subject.AnnotationField(id, name, path, role, owner.name(), owner.id());
    }

    /**
     * A {@code handler} subject, resolved from the spec §6.1.1 id to the label a note names it by.
     *
     * <p>The id is <b>looked up</b> rather than parsed. Its last segment is the same string the catalog
     * holds for a {@code many} option, so parsing would agree today — but that agreement is the document's
     * convention, not a guarantee, and a lookup that misses says so where a parse would invent a handler.
     */
    private static Subject handlerSubject(String libraryName, TriggerMetadataModel.Rule rule, String id,
                                          String role, Catalog catalog, Attribution owner) {
        if (id == null || id.isBlank()) {
            LOGGER.warning("Dropped subject of rule '" + rule.id() + "' for " + libraryName
                    + ": it names no handler id");
            return null;
        }
        // A rule referencing a handler this service type does not declare could never be satisfied
        // through that alternative. Drop it and say so.
        if (catalog != null && !catalog.handlerLabels().containsKey(id)) {
            LOGGER.warning("Dropped subject of rule '" + rule.id() + "' for " + libraryName
                    + ": handler id '" + id + "' is not declared by "
                    + (owner.name() == null ? "this service type" : "service type '" + owner.name() + "'"));
            return null;
        }
        String label = catalog == null ? lastSegment(id) : catalog.handlerLabels().get(id);
        return new Subject.Handler(id, label, role, owner.name(), owner.id());
    }

    /**
     * A {@code param} subject, resolved from the spec §6.1.1 id to the handler and parameter a note names.
     *
     * <p>The owning handler comes from the catalog rather than from a sibling field: the spec removed the
     * {@code handler}/{@code name} pair precisely because a param's own id already scopes it under its
     * handler, so re-stating the handler was both redundant and, for a {@code many} option, ambiguous.
     */
    private static Subject paramSubject(String libraryName, TriggerMetadataModel.Rule rule, String id,
                                        String role, Catalog catalog, Attribution owner) {
        if (id == null || id.isBlank()) {
            LOGGER.warning("Dropped subject of rule '" + rule.id() + "' for " + libraryName
                    + ": it names no param id");
            return null;
        }
        if (catalog == null) {
            // No knowable catalog suppresses the cross-check, exactly as it does for a handler subject.
            // Without one there is no owning handler to name, so the note states the parameter alone.
            return new Subject.Param(id, null, lastSegment(id), role, owner.name(), owner.id());
        }
        Catalog.ParamLabel label = catalog.paramLabels().get(id);
        if (label == null) {
            LOGGER.warning("Dropped subject of rule '" + rule.id() + "' for " + libraryName
                    + ": param id '" + id + "' is not declared by "
                    + (owner.name() == null ? "this service type" : "service type '" + owner.name() + "'"));
            return null;
        }
        return new Subject.Param(id, label.handler(), label.name(), role, owner.name(), owner.id());
    }

    /**
     * The last dot-separated segment of a hierarchical id — the construct's own name within its owner.
     *
     * <p>Only the fallback for an unknowable catalog. Where the catalog answers, the label it holds wins:
     * for a {@code subset} handler that is the real method name, which the id's segment merely mirrors.
     */
    private static String lastSegment(String id) {
        int separator = id.lastIndexOf('.');
        return separator < 0 ? id.substring(id.startsWith("$") ? 1 : 0) : id.substring(separator + 1);
    }

    /**
     * The name of the annotation a subject references, via the spec's registry. With no registry the id is
     * returned unchanged.
     */
    private static String annotationName(String annotationId, AnnotationRegistry annotations) {
        if (annotations == null) {
            return annotationId;
        }
        return annotations.byId(annotationId)
                .map(annotation -> annotation.type() == null ? null : annotation.type().name())
                .orElse(null);
    }

    private static List<String> nonEmpty(List<String> path) {
        if (path == null || path.isEmpty()) {
            return List.of();
        }
        List<String> kept = new ArrayList<>();
        for (String segment : path) {
            if (segment != null && !segment.isBlank()) {
                kept.add(segment);
            }
        }
        return List.copyOf(kept);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
