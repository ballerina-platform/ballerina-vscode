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
import io.ballerina.modelgenerator.commons.trigger.utils.TypeRefResolver;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * The mechanics every the spec attach-point resolver shares, owned by nobody — the same role
 * {@link AnnotationRegistry} and {@link TypeResolver} play. Resolving a registry entry into an
 * {@link AnnotationRef} is identical at every attach point; what differs is <i>which</i> entries a scope
 * selects, and that is what each attach-point resolver owns.
 *
 * <h2>The attach-point guard</h2>
 *
 * <p>The spec's {@code attachPoint} states the document's <b>intent</b>; what actually compiles is decided
 * by the annotation's declaration in the resolved package, and the two can disagree. The compiler's own
 * rejections are what define the admissible sets in {@link Scope}:
 * <pre>
 *   annotation declared `on service`, attached to a remote method:
 *     ERROR: annotation 'X' is not allowed on service_remote, object_method, function
 *   annotation declared `on service remote function`, attached to a resource method:
 *     ERROR: annotation 'X' is not allowed on object_method, function
 * </pre>
 * A remote handler therefore admits {@code RESOURCE} (the compiler's constant for Ballerina's
 * {@code service remote function}), {@code OBJECT_METHOD} and {@code FUNCTION}; a resource handler admits
 * only the latter two.
 *
 * <p><b>An unknown declaration is trusted, not rejected.</b> When the resolved package reports no attach
 * points for a name — a cross-module annotation whose module is unreachable — the guard cannot answer, and
 * refusing on ignorance would drop a real obligation.
 *
 * <p><b>Service scope is deliberately not guarded</b>: which points a {@code service} declaration admits
 * was not established by probe, so an unprobed rule there could silently drop a required annotation.
 *
 * @since 1.7.0
 */
final class AnnotationScopeResolver {

    /**
     * A the spec scope: the {@code attachPoint} it selects, and the declared points the Ballerina compiler admits
     * at the syntactic slot it renders into.
     */
    enum Scope {
        /**
         * A {@code service} declaration. <b>Unguarded</b>: which declared points a service declaration
         * admits was not established by probe, so guessing here could silently drop a required annotation.
         */
        SERVICE(TriggerMetadataModel.Annotation.ATTACH_POINT_SERVICE, null),
        /** A handler declared {@code remote function}. */
        REMOTE_HANDLER(TriggerMetadataModel.Annotation.ATTACH_POINT_FUNCTION,
                Set.of("RESOURCE", "OBJECT_METHOD", "FUNCTION")),
        /** A handler declared {@code resource function}. */
        RESOURCE_HANDLER(TriggerMetadataModel.Annotation.ATTACH_POINT_FUNCTION,
                Set.of("OBJECT_METHOD", "FUNCTION")),
        /** A handler parameter, where the attachment is written inline before the type. */
        PARAMETER(TriggerMetadataModel.Annotation.ATTACH_POINT_PARAMETER, Set.of("PARAMETER")),
        /** A handler's return, written {@code returns @alias:Name {...} T}. */
        RETURN(TriggerMetadataModel.Annotation.ATTACH_POINT_RETURN, Set.of("RETURN"));

        private final String attachPoint;
        private final Set<String> admissiblePoints;

        Scope(String attachPoint, Set<String> admissiblePoints) {
            this.attachPoint = attachPoint;
            this.admissiblePoints = admissiblePoints;
        }

        /** The spec {@code attachPoint} value entries must declare to be selected by this scope. */
        String attachPoint() {
            return attachPoint;
        }

        /** Whether an annotation declaring these points can legally be attached at this scope. */
        boolean admits(Set<String> declaredPoints) {
            if (admissiblePoints == null || declaredPoints == null || declaredPoints.isEmpty()) {
                // Unguarded scope, or not checkable — trust the document rather than drop a real
                // obligation on ignorance.
                return true;
            }
            return declaredPoints.stream().anyMatch(admissiblePoints::contains);
        }
    }

    /**
     * The three compiler-backed facts the spec needs about an annotation, as a narrow seam rather than the whole
     * {@link TriggerSemanticFacts}.
     *
     */
    interface AnnotationFacts {

        /**
         * Whether the home module declares an annotation of this name.
         *
         * @param name the annotation's name
         * @return whether it is declared
         */
        boolean declares(String name);

        /**
         * The attach points the declaring package states, as {@link AnnotationAttachPoint} constant names.
         *
         * @param name   the annotation's name
         * @param module the {@code org/module} for a cross-module annotation, or {@code null} for a
         *               home-module one
         * @return the declared points, empty when unknown
         */
        Set<String> attachPoints(String name, String module);

        /**
         * The annotation's constraining type as module-prefixed signature text.
         *
         * @param name   the annotation's name
         * @param module the {@code org/module} for a cross-module annotation, or {@code null}
         * @return the constraint, or {@code null} for a marker annotation or an unreachable module
         */
        String constraint(String name, String module);
    }

    /**
     * Adapts the real facts, or yields {@code null} when there is no compiled package — in which case every
     * compiler-backed check is skipped rather than failed.
     *
     * @param facts the resolved package's symbols; may be {@code null}
     * @return the adapter, or {@code null}
     */
    static AnnotationFacts factsOf(TriggerSemanticFacts facts) {
        if (facts == null) {
            return null;
        }
        return new AnnotationFacts() {
            @Override
            public boolean declares(String name) {
                return facts.declaresAnnotation(name);
            }

            @Override
            public Set<String> attachPoints(String name, String module) {
                return module == null ? facts.annotationAttachPoints(name)
                        : facts.foreignAnnotationAttachPoints(module, name);
            }

            @Override
            public String constraint(String name, String module) {
                return module == null ? facts.annotationConstraint(name).orElse(null)
                        : facts.foreignAnnotationConstraint(module, name).orElse(null);
            }
        };
    }

    /**
     * One entry that was not emitted, and why — reported so a drop is attributable rather than silent.
     *
     * @param name   the annotation's name, or the unresolved id when no name could be reached
     * @param reason why it was dropped, in terms a document author can act on
     */
    record Rejection(String name, String reason) {
    }

    /**
     * What one scope's annotations resolve to.
     *
     * @param refs       the references to emit, in document order
     * @param rejections every entry dropped, with its reason; never fatal to the enclosing construct
     */
    record Resolution(List<AnnotationRef> refs, List<Rejection> rejections) {
    }

    private AnnotationScopeResolver() {
        // Prevent instantiation
    }

    /**
     * Resolves the annotations a construct references <b>by id</b> — the spec's precise access path, used by
     * {@code handlers.options[].annotations} and {@code params[].annotations}.
     *
     * @param registry   the document's annotation registry
     * @param ids        the referenced ids, in document order; may be {@code null}
     * @param scope      the scope selecting and validating the entries
     * @param homeModule the spec's home module, which decides whether an entry is cross-module
     * @param facts      the compiler-backed facts; {@code null} skips every check that needs them
     * @return the references to emit and the entries dropped
     */
    static Resolution byIds(AnnotationRegistry registry, List<String> ids, Scope scope, String homeModule,
                            AnnotationFacts facts) {
        List<AnnotationRef> refs = new ArrayList<>();
        List<Rejection> rejections = new ArrayList<>();
        if (registry == null || ids == null) {
            return new Resolution(refs, rejections);
        }
        for (String id : ids) {
            if (id == null || id.isBlank()) {
                continue;
            }
            TriggerMetadataModel.Annotation annotation = registry.byId(id).orElse(null);
            if (annotation == null) {
                rejections.add(new Rejection(id, "no annotations[] entry declares the id '" + id + "'"));
                continue;
            }
            if (!scope.attachPoint().equals(annotation.attachPoint())) {
                // The spec files each entry at exactly one point; rendering one at the wrong slot puts an
                // attachment where the compiler does not allow it.
                rejections.add(new Rejection(nameOf(annotation, id),
                        "the registry files it at attachPoint '" + annotation.attachPoint()
                                + "', not '" + scope.attachPoint() + "'"));
                continue;
            }
            accept(annotation, scope, homeModule, facts, refs, rejections);
        }
        return new Resolution(refs, rejections);
    }

    /**
     * The checks and the construction every scope shares: the entry must name something, the home module
     * must declare it, and the resolved package must admit it at this scope.
     */
    private static void accept(TriggerMetadataModel.Annotation annotation, Scope scope, String homeModule,
                               AnnotationFacts facts, List<AnnotationRef> refs,
                               List<Rejection> rejections) {
        String name = annotation.type() == null ? null : annotation.type().name();
        if (name == null || name.isEmpty()) {
            return;
        }
        String module = TypeRefResolver.foreignModulePath(annotation.type(), homeModule).orElse(null);
        if (module == null && facts != null && !facts.declares(name)) {
            rejections.add(new Rejection(name,
                    "not declared as an annotation by the resolved package version"));
            return;
        }
        if (facts != null) {
            Set<String> declaredPoints = facts.attachPoints(name, module);
            if (!scope.admits(declaredPoints)) {
                rejections.add(new Rejection(name,
                        "the resolved package declares it at " + declaredPoints
                                + ", which cannot be attached at this " + scope.attachPoint() + " slot"));
                return;
            }
        }
        refs.add(new AnnotationRef(name, module, isRequired(annotation),
                scope.attachPoint(), facts == null ? null : facts.constraint(name, module)));
    }

    /**
     * The spec {@code presence}: {@code "required"} or {@code "optional"}. Anything else — including an
     * absent value — reads as optional, so an unrecognised vocabulary term cannot silently assert that
     * generated code is obliged to carry an annotation.
     *
     * @param annotation the registry entry
     * @return whether the annotation must be attached
     */
    private static boolean isRequired(TriggerMetadataModel.Annotation annotation) {
        return annotation != null
                && TriggerMetadataModel.Annotation.PRESENCE_REQUIRED.equals(annotation.presence());
    }

    private static String nameOf(TriggerMetadataModel.Annotation annotation, String fallback) {
        String name = annotation.type() == null ? null : annotation.type().name();
        return name == null || name.isEmpty() ? fallback : name;
    }
}
