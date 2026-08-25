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

/**
 * The handler tier of the spec: everything written on one {@code remote}/{@code resource function} line
 * except its parameters, which are {@link ParamAspects}, and its the spec annotations, which are
 * {@link AnnotationAspects}.
 *
 * <p>Each method runs once per handler, and each owns one construct so that a change to how a handler is
 * named cannot perturb how it is written. The recurring split is provenance: a <b>concrete</b> service
 * type's methods are read from the semantic model, so anything the compiler already reports is taken from
 * there and the document is not consulted; a <b>marker</b> type's handlers have only what the document
 * states.
 *
 * <p>Order carries no meaning in this tier — {@link HandlerDraft} holds each slot as a field and emits the
 * wire contract's key order itself.
 *
 * @since 1.7.0
 */
final class HandlerAspects {

    private HandlerAspects() {
        // Prevent instantiation
    }

    /**
     * The spec {@code options[].name} — a handler's name, its description, and its deprecation prose.
     *
     * <p>The spec inverts the DRY rule here, and only here. A marker service type declares no method, so
     * no symbol carries a doc comment for its handlers, and the document's authored {@code doc} is the only
     * description a generator will ever see. A concrete type's declared method carries a real name and doc
     * comment, so the document is not consulted for either.
     *
     * <p>The spec {@code deprecated} is prose, not a flag: {@code ftp}'s {@code onFileChange} names the
     * five typed handlers that replace it, and a boolean would tell a reader to stop using the handler
     * without saying what to use instead.
     */
    static void identity(HandlerScope scope, HandlerDraft draft) {
        if (scope.isConcrete()) {
            TriggerSemanticFacts.DeclaredMethod declared = scope.declared();
            draft.setName(declared.name());
            draft.setDescription(declared.description());
            return;
        }
        TriggerMetadataModel.ServiceType.HandlerOption option = scope.option();
        draft.setName(option.name());
        draft.setDescription(option.doc());
        draft.setDeprecated(option.deprecated());
    }

    /**
     * The spec {@code options[].kind} — whether the renderer writes {@code remote function} or
     * {@code resource function}.
     *
     * <p>The accessor and path that go with a resource kind are {@link #resourceExtras}: The spec gave the
     * construct a single {@code accessor} slot, so there is no precedence question left here.
     */
    static void kind(HandlerScope scope, HandlerDraft draft) {
        HandlerRules.Kind resolved = scope.isConcrete()
                ? HandlerRules.resolveDeclared(scope.declared().kind())
                : HandlerRules.resolveKind(scope.option().kind());
        draft.setKind(resolved.wireValue());
    }

    /**
     * The method qualifiers a <b>concrete</b> service type's declared handler carries — today,
     * {@code isolated}.
     *
     * <p><b>Not a spec construct.</b> The document models no qualifiers and should not: this is
     * introspectable from the library, which is what the governing DRY principle says the document must
     * leave alone.
     *
     * <p>Omitting {@code isolated} does not produce a warning but "mismatched function signatures", where
     * the two printed signatures are character-for-character identical because the compiler prints neither
     * qualifier. Verified against {@code mcp:AdvancedService}.
     */
    static void qualifier(HandlerScope scope, HandlerDraft draft) {
        if (scope.isConcrete() && scope.declared().isolatedQualifier()) {
            draft.setIsolated();
        }
    }

    /**
     * The spec {@code options[].presence} — whether a handler must be implemented or may be omitted.
     *
     * <p>Metadata-driven handlers only. A concrete service type declares its methods and the compiler
     * plugin decides which a service must implement, so the document says nothing and neither does this —
     * which is why {@code trigger.github}'s and {@code mcp:AdvancedService}'s handlers carry no marker.
     *
     * <p>The spec moved {@code addMode} onto the option, making presence a per-handler question: a service
     * type may mix fixed handlers with open-ended shapes, and only the fixed ones have an occurrence count.
     */
    static void presence(HandlerScope scope, HandlerDraft draft) {
        if (scope.isConcrete()) {
            return;
        }
        PresenceRules.resolveOptional(scope.option().presence(), scope.option().addMode())
                .ifPresent(draft::setOptional);
    }

    /**
     * The spec's resource extras — the accessor and path of {@code resource function <accessor> <path>()}.
     *
     * <p>One component for both protocol families, because the spec made the two slots library-neutral; it
     * replaces the separate HTTP and GraphQL aspects, which existed only because the schema used to name the
     * same two positions differently per protocol.
     *
     * <p>Skipped for a concrete service type, whose declaration already carries the accessor.
     */
    static void resourceExtras(HandlerScope scope, HandlerDraft draft) {
        if (scope.isConcrete()) {
            return;
        }
        HandlerRules.resolveResourceExtras(scope.option()).ifPresent(extras -> {
            draft.setAccessor(extras.accessor());
            draft.setAccessorConstraint(extras.accessorValues(), extras.accessorRequired(),
                    extras.accessorOpen());
            draft.setPathConstraint(extras.path(), extras.pathValues(), extras.pathRequired(),
                    extras.pathOpen());
        });
    }

    /**
     * The spec §5.4 {@code options[].returns} — the handler's return type, and the outbound data binding
     * (§9.1) that says what a reader may narrow it to.
     *
     * <p>A concrete method's return comes from the semantic model already rendered; a marker type's is the
     * document's union, joined and canonicalized. Both then drop a nil-only return, which carries no
     * information.
     *
     * <p><b>The binding is documented-handler only</b>, for the same reason every other §5-tier fact is: a
     * concrete type's method is introspectable, and the compiler reports a return type rather than a
     * projection rule. A binding therefore rides on the {@code returns} object the document authored, and
     * is attached to the same {@link io.ballerina.flowmodelgenerator.core.copilot.model.Return} the type
     * went onto — not to the handler — because it constrains that slot and the renderer states it beside
     * the type it constrains.
     *
     * <p>A return that resolves to nothing takes its binding with it. That is not a loss: §9.1 makes a
     * binding present only when a union member is a builtin constraint the runtime serializes through, and
     * a return that resolves to nothing is a nil-only one, which has no such member.
     */
    static void returnType(HandlerScope scope, HandlerDraft draft) {
        TriggerScope service = scope.service();
        TriggerMetadataModel.ServiceType.ReturnSpec spec = scope.isConcrete()
                ? null : scope.option().returns();
        String signature = scope.isConcrete()
                ? scope.declared().returnTypeSignature()
                : TypeShapeRules.signature(spec == null ? null : spec.type(), service.packageName(),
                        service.declaresType());
        TypeShapeRules.resolveReturn(signature, service.packageName()).ifPresent(returnValue -> {
            if (spec != null && spec.dataBinding() != null) {
                TypeShapeRules.resolveBinding(spec.dataBinding(), service.packageName(),
                                service.declaresType(), ParamAspects.envelopeFields(service))
                        .ifPresentOrElse(returnValue::setBinding,
                                () -> draft.drop("returnBinding: " + scope.option().name()
                                        + ": its dataBinding declares no variant with both a bound and a"
                                        + " readable shape"));
            }
            draft.setReturn(returnValue);
        });
    }
}
